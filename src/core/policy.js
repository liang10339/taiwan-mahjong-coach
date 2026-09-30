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

  // 之後幾巡的放槍風險（守到底）：這一張安全不代表之後也安全。繼續進攻，之後每巡都要打沒把握的牌；
  // 改成守，之後可以一直打安全牌，但手上的安全牌打完了也得打危險牌。
  // 數字來自自戰統計：場上「聽牌機率總和」每 1.0，效率首選平均約 4.5% 放槍、最安全的牌約 1.3%、第二安全約 3%。
  const LEAK = { push: 0.045, safe: 0.013, unsafe: 0.03 };
  /** 算作「安全牌」的放槍機率門檻（留在手上、之後可以打的牌） */
  const SAFE_TILE = 0.015;
  /** 往後看幾巡 */
  const HORIZON = 6;
  /** 改守之後還剩多少胡牌機會（守的時候偶爾也會摸成聽牌、自摸） */
  const FOLD_WIN = 0.25;

  /**
   * 打出 o 之後，接下來幾巡預期還要付出的放槍代價（台）。
   * attack：繼續進攻（和效率首選同進聽數）——聽牌前要打生張，聽牌後摸到什麼也只能打，每巡都有風險；
   * 否則是守的路線——手上還有幾張安全牌就能安全幾巡，之後只能打次安全的牌。
   * 兩條路線看同樣多巡，差別是每巡的風險；進攻的好處（胡牌機會）已經算在期望收入裡。
   */
  function futureLoss(o, attack, ctx) {
    const turns = Math.min(HORIZON, Math.floor(ctx.left / 4));
    if (turns <= 0 || ctx.pressure <= 0) return 0;
    let leak = 0;
    if (attack) leak = LEAK.push * turns;
    else {
      const stock = ctx.safeStock - (ctx.safeTiles.has(o.tile) ? 1 : 0);
      for (let k = 0; k < turns; k++) leak += k < stock ? LEAK.safe : LEAK.unsafe;
    }
    return leak * ctx.pressure * ctx.payout * ctx.weight;
  }

  /** 效率首選以外的牌，期望值要高出這麼多（台）才換：差不多時照牌效率打，建議才穩定、好理解 */
  const MARGIN = 0.15;

  /**
   * 比較每張候選牌的攻守期望值，選出這手要打的牌與局勢。
   * @param {{options: any[], efficiency: any, safety: any[], left: number, myTai: number,
   *   base?: number, tsumoShare?: number, dealerExtra?: number, maxTenpai?: number, margin?: number,
   *   incomeOf?: (option: any) => number, hand?: number[], pressure?: number, payout?: number, future?: number}} input
   *   base：底換算成幾台（例如 50 底 20 台 → 2.5）；dealerExtra：自己是莊家時放槍多付的台數；margin：改打非效率首選需要多出的期望值（預設 MARGIN）；
   *   incomeOf：打出這張後「胡了能收多少台（含底）」——各張不同（例如留住字牌對、做成一色、聽台數高的牌）；沒給就每張都用 myTai 的平均值。
   *   hand、pressure（三家聽牌機率總和）、payout（放槍一次平均賠幾台）：算之後幾巡的放槍代價；future 是它的權重（預設 1，0 表示只看這一張）。
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
    const income = (base + myTai) * (tsumoShare * 3 + (1 - tsumoShare)),
      incomeOf = input.incomeOf || (() => income);
    const byTile = new Map(safety.map((s) => [s.tile, s]));
    const effWin = winProb(efficiency.shanten, efficiency.remaining, left);
    // 手上的安全牌（含重複張數）：守的時候之後還能打幾巡安全牌
    const safeTiles = new Set(safety.filter((s) => s.dealIn <= SAFE_TILE).map((s) => s.tile));
    const future = {
      left,
      pressure: input.pressure || 0,
      payout: input.payout ?? base + ((CAL && CAL.avgTaiAll) || 2) + dealerExtra,
      weight: input.future ?? 1,
      safeTiles,
      safeStock: input.hand ? input.hand.filter((t) => safeTiles.has(t)).length : safeTiles.size,
    };
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
        now = s ? s.per.reduce((n, x) => n + x.p * (base + x.tai + dealerExtra), 0) : 0,
        worth = incomeOf(o),
        gain = win * worth;
      // 打完這張之後有兩條路：繼續攻（保留胡牌機會，每巡冒險），或改守（留下的安全牌先打，胡牌機會所剩無幾）。
      // 取比較好的那條，所以「效率首選剛好也是安全牌」時，打它之後仍可以守，不會被當成硬攻。
      const attack = gain - futureLoss(o, true, future),
        defend = gain * FOLD_WIN - futureLoss(o, false, future),
        line = defend > attack ? 'fold' : 'attack',
        later = gain - Math.max(attack, defend);
      rows.push({
        option: o,
        tile: o.tile,
        win,
        dealIn,
        worth,
        gain,
        now,
        later,
        line,
        loss: now + later,
        ev: gain - now - later,
      });
    }
    rows.sort((a, b) => b.ev - a.ev || a.dealIn - b.dealIn);
    const eff = rows.find((r) => r.tile === efficiency.tile) || rows[0];
    const top = rows[0];
    const chosen = top.ev > eff.ev + (input.margin ?? MARGIN) ? top : eff;
    const sh = efficiency.shanten;
    // 換牌的理由：比效率首選安全（防守），或是不比較危險但胡了台數較高（做台）
    const reason =
      chosen === eff
        ? null
        : chosen.dealIn < eff.dealIn - 0.002 || chosen.worth <= eff.worth
          ? 'defense'
          : 'value';
    let stance;
    if (reason === 'defense') stance = chosen.option.shanten > eff.option.shanten ? 'fold' : 'balance';
    else if (chosen.line === 'fold')
      stance = 'balance'; // 效率首選剛好也最安全：先打它，之後準備守
    else if (sh === 0) stance = 'push';
    else if (maxTenpai >= 0.5 || left <= 16) stance = 'balance';
    else if (sh === 1) stance = 'push';
    else stance = 'build';
    return { option: chosen.option, chosen, efficiency: eff, rows, stance, reason, income };
  }

  /**
   * 吃碰前的煞車：有人很可能聽牌（≥ 50%）而吃碰後你仍差兩步以上，就不為了進張攤牌——
   * 攤牌會少掉能防守的牌、暴露手牌，也破壞門清；局勢本身是「先守」時當然也不吃碰。
   * @param {{stance: string, efficiency: {shanten: number}, maxTenpai: number}} after 吃碰後的決定
   */
  function holdBackClaim(after) {
    return after.stance === 'fold' || (after.efficiency.shanten >= 2 && after.maxTenpai >= 0.5);
  }

  const api = {
    winKey,
    winProb,
    fallbackWin,
    choose,
    futureLoss,
    holdBackClaim,
    MARGIN,
    LEAK,
    HORIZON,
    FOLD_WIN,
  };
  if (node) module.exports = api;
  else root.Policy = api;
})(globalThis);
