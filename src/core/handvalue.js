(function (root) {
  'use strict';
  // 手牌價值：這手牌「如果最後胡了，大約幾台」。讓攻守取捨不只看胡牌機率，也看胡了值多少：
  //   已聽牌：每張聽的牌實際用計台規則算一次（自摸、胡別人分開），依剩下張數加權——最準。
  //   還沒聽：只算看得出來的台——門清、已成的字牌刻、字牌對子（有機會碰成刻）、花、已經是一色；
  //           其他零碎的台（暗刻、獨聽、海底…）用自戰統計的平均補上（EXTRA）。
  // 只用這一家看得到的資訊（自己的手牌、攤牌、花與公開的牌）。
  const node = typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.Mahjong,
    Scoring = node ? require('./scoring.js') : root.Scoring;
  const CAL = node ? require('./data/calibration.js') : root.Calibration;

  /** 還沒聽牌時，估不到的零碎台數平均（自戰胡牌時實際台數 − 能看出的台數） */
  const EXTRA = (CAL && CAL.taiExtra) ?? 0.4;
  /** 字牌對子之後碰成刻子的機會：每張還沒出現的同一張牌約 30%，最多 60% */
  const PAIR_PER_COPY = 0.3;
  /** 已經是一色的手，每差一步聽牌約有兩成會為了進張打破一色 */
  const SUIT_KEEP = 0.8;

  /** 對 p 有台的字牌：三元牌、門風、圈風（門風和圈風相同時算兩台） @param {Game} g @param {number} p */
  function valueTiles(g, p) {
    return [31, 32, 33, 27 + E.seatWind(g, p), 27 + (g.roundWind || 0)];
  }

  /** 花牌的台數：正花一張一台，一組四季／四君子另加一台 */
  function flowerTai(g, p) {
    const flowers = (g.flowers && g.flowers[p]) || [],
      wind = E.seatWind(g, p);
    let tai = flowers.filter((f) => f === 34 + wind || f === 38 + wind).length;
    if ([34, 35, 36, 37].every((f) => flowers.includes(f))) tai++;
    if ([38, 39, 40, 41].every((f) => flowers.includes(f))) tai++;
    return tai;
  }

  /** 看得到的每種牌張數（自己的手牌＋公開的牌） */
  function seenCounts(hand, publicTiles) {
    const c = Array(34).fill(0);
    for (const t of hand) c[t]++;
    for (const t of publicTiles) if (t < 34) c[t]++;
    return c;
  }

  /**
   * 已聽牌：逐張聽牌實際計台。回傳 {ron, tsumo}（不含底、不含莊家付的額外台），聽的牌都沒了回傳 null。
   * @param {Game} g @param {number} p @param {number[]} hand 16 張（或攤牌後相應張數）
   */
  function exact(g, p, hand, seen) {
    const open = g.melds[p].length,
      waits = Scoring.winningTiles(hand, open, g.rules);
    let weight = 0,
      ron = 0,
      tsumo = 0;
    // 胡別人時固定假設是閒家放槍（莊家放槍多出的台另外按機率算）
    const dealer = g.dealer || 0,
      from = [1, 2, 3].map((k) => (p + k) % 4).find((q) => q !== dealer) ?? (p + 1) % 4;
    const hands = g.hands.slice();
    for (const w of waits) {
      const left = 4 - seen[w];
      if (left <= 0) continue;
      hands[p] = [...hand, w];
      const view = { ...g, hands };
      // 聽牌後才可能胡，那時一定已經有人打過牌：不算天胡、地胡、人胡
      const base = {
        tile: w,
        special: undefined,
        robKan: false,
        afterKan: false,
        lastTile: false,
        anyDiscard: true,
        ownDiscards: 1,
        ownDraws: 2,
      };
      ron += left * Scoring.score(view, p, { ...base, tsumo: false, from }).total;
      tsumo += left * Scoring.score(view, p, { ...base, tsumo: true, from: undefined }).total;
      weight += left;
    }
    return weight ? { ron: ron / weight, tsumo: tsumo / weight, exact: true, waits } : null;
  }

  /**
   * 還沒聽牌：看得出來的台數期望值。回傳 {ron, tsumo, items}（items 給解說用，tai 是期望值）。
   * @param {Game} g @param {number} p @param {number[]} hand @param {number} shanten
   */
  function rough(g, p, hand, shanten, seen) {
    const melds = g.melds[p],
      exposed = melds.filter((m) => m.type !== 'concealed').length,
      items = [];
    const add = (name, tai) => tai > 0.001 && items.push({ name, tai });
    // 莊家：莊家胡牌一定算，連莊另加
    if (g.dealer === p) add('莊家' + (g.streak ? '連' + g.streak : ''), 1 + 2 * (g.streak || 0));
    add('花', flowerTai(g, p));
    // 字牌：已成的刻子（攤牌或手上三張）必有；手上一對有機會碰成
    const count = Array(34).fill(0);
    hand.forEach((t) => count[t]++);
    for (const t of valueTiles(g, p)) {
      const meld = melds.some((m) => m.type !== 'chi' && m.tiles[0] === t);
      if (meld || count[t] >= 3) add('字牌刻（' + E.names[t] + '）', 1);
      else if (count[t] === 2)
        add('字牌對（' + E.names[t] + '）', Math.min(0.6, PAIR_PER_COPY * (4 - seen[t])));
    }
    // 一色：手牌＋攤牌已經只剩一種花色
    const all = [...hand, ...melds.flatMap((m) => m.tiles)],
      suits = new Set(all.filter((t) => t < 27).map((t) => Math.floor(t / 9)));
    if (suits.size === 1) {
      const honors = all.some((t) => t >= 27);
      add(honors ? '混一色' : '清一色', (honors ? 4 : 8) * SUIT_KEEP ** Math.max(0, shanten));
    }
    add('其他（暗刻、獨聽等平均）', EXTRA);
    const fixed = items.reduce((n, x) => n + x.tai, 0);
    // 門清：胡別人 +1；自摸時「門清自摸」3 台（沒門清只有自摸 1 台）
    return {
      ron: fixed + (exposed ? 0 : 1),
      tsumo: fixed + (exposed ? 1 : 3),
      items: [...items, ...(exposed ? [] : [{ name: '門清（自摸算三台）', tai: 1 }])],
      exact: false,
    };
  }

  /**
   * 這手牌胡了大約幾台。hand 是出牌後（或還沒摸牌時）的手牌。
   * @param {Game} g @param {number} p @param {number[]} hand @param {{shanten?: number, publicTiles?: number[]}} [opts]
   */
  function estimate(g, p, hand, opts = {}) {
    const open = g.melds[p].length,
      publicTiles = opts.publicTiles || E.publicTiles(g, p),
      seen = seenCounts(hand, publicTiles),
      shanten = opts.shanten ?? E.shanten(hand, open, g.rules);
    if (shanten === 0) {
      const x = exact(g, p, hand, seen);
      if (x) return { ...x, items: [] };
    }
    return rough(g, p, hand, shanten, seen);
  }

  /**
   * 胡牌收入的期望值（台，含底）：自摸三家都付，胡別人只有放槍的人付；
   * 閒家胡牌時，莊家那一份另加莊家與連莊的台（自摸一定有，胡別人約三分之一是莊家放槍）。
   * @param {Game} g @param {number} p @param {{ron: number, tsumo: number}} tai @param {number} base @param {number} tsumoShare
   */
  function income(g, p, tai, base, tsumoShare) {
    const extra = g.dealer === p ? 0 : 1 + 2 * (g.streak || 0);
    return tsumoShare * (3 * (base + tai.tsumo) + extra) + (1 - tsumoShare) * (base + tai.ron + extra / 3);
  }

  const api = { estimate, income, exact, rough, valueTiles, flowerTai, EXTRA };
  if (node) module.exports = api;
  else root.HandValue = api;
})(globalThis);
