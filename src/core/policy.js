(function (root) {
  'use strict';
  // 攻守期望值：每張候選牌「打了之後大約能贏多少、放槍大約要賠多少」，單位是台。
  //   進攻價值 = 之後胡牌的機率 × 胡牌的收入
  //   放槍代價 = 這張放槍的機率（safety.js）× 對方胡牌的台數
  // 胡牌機率依「進聽數 × 有效牌 × 牌牆剩餘」查自戰統計（scripts/calibrate.cjs）。
  const node = typeof module !== 'undefined';
  const CAL = node ? require('./data/calibration.js') : root.Calibration;

  /** 自己胡牌機率的分組鍵：進聽數 × 有效牌 × 牌牆剩餘（校準與實戰共用） */
  function winKey(shanten, remaining, left) {
    const s = Math.min(shanten, 3),
      r = remaining < 5 ? 0 : remaining < 9 ? 1 : remaining < 15 ? 2 : remaining < 25 ? 3 : 4,
      l = left >= 60 ? 0 : left >= 45 ? 1 : left >= 30 ? 2 : left >= 16 ? 3 : 4;
    return s + '|' + r + '|' + l;
  }

  /** 沒有統計資料時的粗估：越接近聽牌、有效牌越多、時間越多越容易胡 */
  function fallbackWin(shanten, remaining, left) {
    const time = Math.min(1, left / 60);
    return Math.max(0.01, Math.min(0.6, (0.45 - shanten * 0.12) * time + Math.min(remaining, 30) * 0.004));
  }

  /** 統計只分到「三進聽以上」；再多一步大約少一半機會 */
  const FAR_STEP = 0.5;

  /** 打出這張後，這局最後胡牌的機率 */
  function winProb(shanten, remaining, left, table = CAL && CAL.win) {
    const row = table && table[winKey(shanten, remaining, left)],
      prior = fallbackWin(shanten, remaining, left),
      p = row ? (row[0] + prior * 20) / (row[1] + 20) : prior;
    return p * FAR_STEP ** Math.max(0, shanten - 3);
  }

  /** 效率首選以外的牌，期望值要高出這麼多（台）才換：差不多時照牌效率打，建議才穩定、好理解 */
  const MARGIN = 0.15;

  /**
   * 比較每張候選牌的攻守期望值，選出這手要打的牌與局勢。
   * @param {{options: any[], efficiency: any, safety: any[], left: number, myTai: number,
   *   base?: number, tsumoShare?: number, dealerExtra?: number, maxTenpai?: number, margin?: number}} input
   *   base：底換算成幾台（例如 50 底 20 台 → 2.5）；dealerExtra：自己是莊家時放槍多付的台數；margin：改打非效率首選需要多出的期望值（預設 MARGIN）。
   */
  function choose(input) {
    const {
      options,
      efficiency,
      safety,
      left,
      myTai,
      base = 2.5,
      tsumoShare = (CAL && CAL.tsumoShare) || 0.4,
      dealerExtra = 0,
      maxTenpai = 0,
    } = input;
    // 胡牌收入：自摸三家都付，胡別人只有放槍的人付
    const income = (base + myTai) * (tsumoShare * 3 + (1 - tsumoShare));
    const byTile = new Map(safety.map((s) => [s.tile, s]));
    const effWin = winProb(efficiency.shanten, efficiency.remaining, left);
    const seen = new Set();
    const rows = [];
    for (const o of options) {
      if (seen.has(o.tile)) continue;
      seen.add(o.tile);
      const s = byTile.get(o.tile),
        // 退一步的打法不可能比效率首選更容易胡（離聽牌越遠，有效牌張數反而越多，不能直接比）
        raw = winProb(o.shanten, o.remaining, left),
        win = o.shanten > efficiency.shanten ? Math.min(raw, effWin * FAR_STEP) : raw,
        dealIn = s ? s.dealIn : 0,
        loss = s ? s.per.reduce((n, x) => n + x.p * (base + x.tai + dealerExtra), 0) : 0;
      rows.push({ option: o, tile: o.tile, win, dealIn, gain: win * income, loss, ev: win * income - loss });
    }
    rows.sort((a, b) => b.ev - a.ev || a.dealIn - b.dealIn);
    const eff = rows.find((r) => r.tile === efficiency.tile) || rows[0];
    const top = rows[0];
    const chosen = top.ev > eff.ev + (input.margin ?? MARGIN) ? top : eff;
    const sh = efficiency.shanten;
    let stance;
    if (chosen !== eff) stance = chosen.option.shanten > eff.option.shanten ? 'fold' : 'balance';
    else if (sh === 0) stance = 'push';
    else if (maxTenpai >= 0.5 || left <= 16) stance = 'balance';
    else if (sh === 1) stance = 'push';
    else stance = 'build';
    return { option: chosen.option, chosen, efficiency: eff, rows, stance, income };
  }

  /**
   * 吃碰前的煞車：有人很可能聽牌（≥ 50%）而吃碰後你仍差兩步以上，就不為了進張攤牌——
   * 攤牌會少掉能防守的牌、暴露手牌，也破壞門清；局勢本身是「先守」時當然也不吃碰。
   * @param {{stance: string, efficiency: {shanten: number}, maxTenpai: number}} after 吃碰後的決定
   */
  function holdBackClaim(after) {
    return after.stance === 'fold' || (after.efficiency.shanten >= 2 && after.maxTenpai >= 0.5);
  }

  const api = { winKey, winProb, fallbackWin, choose, holdBackClaim, MARGIN };
  if (node) module.exports = api;
  else root.Policy = api;
})(globalThis);
