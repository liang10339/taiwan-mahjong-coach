(function (root) {
  'use strict';
  // 期望值：「打這張之後，這一局胡牌的機會有多大、胡了平均幾台」。
  // 做法（蒙地卡羅模擬）：只用自己看不到的牌（牌牆與三家暗牌混在一起）隨機洗牌，
  // 模擬接下來每一巡「三家各打一張（可以胡、碰，上家的可以吃）→ 自己摸一張（可以自摸）→ 依牌效率打一張」，
  // 胡了就用真正的台數規則（scoring.js）計台。重複幾百次，得到每種打法的
  // 胡牌率、平均台數與期望台數（＝胡牌率 × 平均台數）。
  //
  // 別家可能先胡：每一巡依 HAZARD 表的機率由別家結束這一局（見下方說明）。
  //
  // 簡化與限制（在畫面上也會說明）：
  // - 只在能讓手牌更快聽牌時才吃碰（不考慮門清的台數損失），不模擬槓。
  // - 別家先胡只用平均機率，不看當局的實際局勢。
  // - 之後的出牌只看牌效率（孤張先打），並偏好保留主要花色；不會刻意做大牌。
  // - 不讀牌牆順序或別家暗牌：看不到的牌一律隨機，和教練、電腦同樣的公平原則。
  // 校準：開局第一手的最佳打法，模擬胡牌率平均約 11%；中級電腦實戰每人約 25%。
  // 模擬的出牌比電腦簡單，所以胡牌率「偏保守」；它是用同一串亂數比較各種打法的相對好壞，
  // 而不是預測實際胡牌機率。
  const E = typeof module !== 'undefined' ? require('./engine.js') : root.Mahjong;
  const S = typeof module !== 'undefined' ? require('./scoring.js') : root.Scoring;
  const Observation = typeof module !== 'undefined' ? require('./observation.js') : root.Observation;

  /**
   * 每位玩家在第 n 巡（莊家第 n 次摸牌那一圈）胡牌的條件機率（前面都還沒人胡的情況下）。
   * 來源：本程式中級電腦自我對戰 400 局統計（保留八墩、過水）；第 12 巡之後樣本少，取 0.11 為上限。
   * 真人牌桌的節奏可能不同，這張表只用來讓「胡牌率」接近實戰，比較打法時影響不大。
   */
  const HAZARD = [0.001, 0.002, 0.009, 0.015, 0.022, 0.04, 0.06, 0.065, 0.075, 0.08, 0.1, 0.11];
  /** 第 turn 巡時，另外三家之中有人先胡的機率 */
  function othersWin(turn) {
    const h = HAZARD[Math.min(turn, HAZARD.length) - 1] ?? 0.11;
    return 1 - Math.pow(1 - h, 3);
  }
  /** 目前是第幾巡（以莊家摸牌次數計） */
  function currentTurn(g) {
    return g.log.filter((e) => e.action === 'draw' && e.player === (g.dealer || 0)).length;
  }

  /** 可重現的亂數（mulberry32）：同一個種子得到同樣的模擬結果，方便測試與比對 */
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** p 看不到的牌：每種 4 張，扣掉自己手牌、自己攤牌與所有公開的牌 */
  function unseenPool(g, p) {
    g = Observation.forPlayer(g, p);
    const counts = Array(34).fill(4);
    const seen = [...g.hands[p], ...E.publicTiles(g, p)];
    // publicTiles 已含自己的攤牌（包含暗槓）
    for (const t of seen) if (t < 34) counts[t]--;
    const pool = [];
    counts.forEach((n, t) => {
      for (let i = 0; i < Math.max(0, n); i++) pool.push(t);
    });
    return pool;
  }

  /**
   * 模擬中的出牌策略（回傳要打的牌與打完的進聽數）：
   * 1. 打完進聽數最少；2. 單張字牌先打；3. 和手上其他牌連不起來的先打（前後兩張內沒有同門的牌）；
   * 4. 最後才看花色，打最少張的那一門（保留主要花色，讓混一色、清一色有機會成形）。
   */
  function policyDiscard(hand, open, rules) {
    const suitCount = [0, 0, 0, 0];
    for (const t of hand) suitCount[t >= 27 ? 3 : Math.floor(t / 9)]++;
    let best = null;
    for (const t of new Set(hand)) {
      const rest = hand.slice();
      rest.splice(rest.indexOf(t), 1);
      const s = E.shanten(rest, open, rules);
      const lone = t >= 27 && hand.filter((x) => x === t).length === 1 ? 0 : 1;
      const links = rest.filter((x) =>
        t >= 27 ? x === t : x < 27 && Math.floor(x / 9) === Math.floor(t / 9) && Math.abs(x - t) <= 2,
      ).length;
      const score = s * 10000 + lone * 1000 + links * 50 + suitCount[t >= 27 ? 3 : Math.floor(t / 9)];
      if (!best || score < best.score) best = { tile: t, shanten: s, score };
    }
    return best;
  }

  /**
   * 別家打出 tile 時要不要碰（任何一家）或吃（只有上家）：只在吃碰後進聽數變少時才吃碰。
   * 回傳吃碰並打出一張後的手牌、攤牌與進聽數；不吃碰時回傳 null。
   */
  function tryClaim(hand, melds, tile, fromUpper, shanten, rules) {
    const open = melds.length,
      options = [];
    if (hand.filter((x) => x === tile).length >= 2) options.push({ type: 'pon', used: [tile, tile] });
    if (fromUpper && tile < 27) {
      const base = Math.floor(tile / 9) * 9;
      for (let start = Math.max(base, tile - 2); start <= Math.min(base + 6, tile); start++) {
        const used = [start, start + 1, start + 2].filter((x) => x !== tile);
        if (used.length === 2 && used.every((x) => hand.includes(x))) options.push({ type: 'chi', used });
      }
    }
    let best = null;
    for (const o of options) {
      const rest = hand.slice();
      for (const x of o.used) rest.splice(rest.indexOf(x), 1);
      const out = policyDiscard(rest, open + 1, rules);
      if (out.shanten < shanten && (!best || out.shanten < best.shanten)) {
        rest.splice(rest.indexOf(out.tile), 1);
        best = {
          hand: rest,
          melds: [...melds, { type: o.type, tiles: [...o.used, tile].sort((a, b) => a - b), from: -1 }],
          shanten: out.shanten,
        };
      }
    }
    return best;
  }

  /** 計算假想胡牌的台數（不算天地人胡、海底河底，因為模擬的是之後一般的巡目） */
  function taiOf(g, p, hand, melds, tile, tsumo, from, cache) {
    const key = [
      hand
        .slice()
        .sort((a, b) => a - b)
        .join(','),
      melds.map((m) => m.tiles.join('.')).join('/'),
      tile,
      tsumo ? 't' : from,
    ].join('|');
    if (cache.has(key)) return cache.get(key);
    const hypo = {
      ...g,
      hands: g.hands.map((h, i) => (i === p ? hand : h)),
      melds: g.melds.map((m, i) => (i === p ? melds : m)),
    };
    const result = S.score(hypo, p, {
      tsumo,
      tile,
      from: tsumo ? null : from,
      special: null,
      robKan: false,
      afterKan: false,
      lastTile: false,
      claimsBefore: true, // 不是開局第一巡，天地人胡不適用
      anyDiscard: true,
      ownDiscards: 1,
    });
    cache.set(key, result.total);
    return result.total;
  }

  /** 還能摸幾次牌（每巡四家各摸一張） */
  function horizonOf(g) {
    const drawable = Math.max(0, g.wall.length - (g.reserve || 0));
    return Math.max(1, Math.min(16, Math.floor(drawable / 4)));
  }

  /**
   * 候選打法：效率最好的幾張，加上進聽數只差一步中有效牌最多的一張（可能是做大牌的方向）。
   * @returns {{tile: number, shanten: number, remaining: number}[]}
   */
  function candidates(g, p, limit = 6) {
    g = Observation.forPlayer(g, p);
    const open = g.melds[p].length,
      options = E.analyze(g.hands[p], E.publicTiles(g, p), open, new Map(), g.rules);
    const best = options[0].shanten;
    const picked = options.filter((o) => o.shanten === best).slice(0, limit);
    const next = options.find((o) => o.shanten === best + 1);
    if (next && picked.length < limit) picked.push(next);
    return picked.map((o) => ({ tile: o.tile, shanten: o.shanten, remaining: o.remaining }));
  }

  /**
   * 模擬一種打法之後的一局：回傳 {won, tsumo, tai, turn}。
   * rng 由呼叫端提供，讓每種打法用同一串亂數比較。
   */
  function playOut(g, p, start, melds0, pool, horizon, nowTurn, rng, cache) {
    const others = [1, 2, 3].map((k) => (p + k) % 4),
      upper = (p + 3) % 4;
    let hand = start.slice(),
      melds = melds0,
      shanten = E.shanten(hand, melds.length, g.rules);
    for (let turn = 1; turn <= horizon && pool.length; turn++) {
      // 別家先胡，這一局就結束了
      if (rng() < othersWin(nowTurn + turn)) return null;
      // 三家各打一張：聽牌時可以胡（放槍者是那一家）；能讓手牌更快聽牌時碰（上家的也可以吃）
      let claimed = false;
      for (const q of others) {
        if (!pool.length) return null;
        const tile = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        if (shanten === 0 && E.winning([...hand, tile], melds.length, g.rules))
          return { tsumo: false, turn, tai: taiOf(g, p, [...hand, tile], melds, tile, false, q, cache) };
        const claim = shanten > 0 ? tryClaim(hand, melds, tile, q === upper, shanten, g.rules) : null;
        if (claim) {
          ({ hand, melds, shanten } = claim);
          claimed = true;
          break; // 吃碰後已經出牌，輪到下家
        }
      }
      if (claimed) continue;
      if (!pool.length) return null;
      // 自己摸一張：能自摸就胡；沒有幫助就直接打掉（摸切），有幫助才重新挑要打哪張
      const draw = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      hand.push(draw);
      if (shanten === 0 && E.winning(hand, melds.length, g.rules))
        return { tsumo: true, turn, tai: taiOf(g, p, hand, melds, draw, true, null, cache) };
      if (E.shanten(hand, melds.length, g.rules) >= shanten) {
        hand.pop();
        continue;
      }
      const out = policyDiscard(hand, melds.length, g.rules);
      hand.splice(hand.indexOf(out.tile), 1);
      shanten = out.shanten;
    }
    return null;
  }

  /**
   * 模擬每種打法。
   * @param {Game} g 目前的牌局（輪到 p 出牌）
   * @param {number} p 座位
   * @param {{trials?: number, seed?: number, tiles?: number[]}} [opts] 每種打法模擬幾次、亂數種子、只算指定的打法
   */
  function evaluate(g, p = 0, opts = {}) {
    g = Observation.forPlayer(g, p);
    const trials = opts.trials || 300,
      horizon = horizonOf(g),
      seed = opts.seed ?? Observation.fingerprint(g, p),
      nowTurn = currentTurn(g),
      cache = new Map();
    const list = opts.tiles
      ? opts.tiles.map((tile) => ({ tile, shanten: NaN, remaining: NaN }))
      : candidates(g, p);
    const pool0 = unseenPool(g, p),
      melds0 = g.melds[p].map((m) => ({ ...m, tiles: m.tiles.slice() }));
    const results = list.map((c) => {
      // 每種打法用同一串亂數（同樣的未來摸牌），比較的差異才是「打法」造成的，而不是運氣
      const rng = random(seed);
      const start = g.hands[p].slice();
      start.splice(start.indexOf(c.tile), 1);
      let wins = 0,
        tsumos = 0,
        taiSum = 0,
        turnSum = 0;
      for (let n = 0; n < trials; n++) {
        const r = playOut(g, p, start, melds0, pool0.slice(), horizon, nowTurn, rng, cache);
        if (!r) continue;
        wins++;
        if (r.tsumo) tsumos++;
        taiSum += r.tai;
        turnSum += r.turn;
      }
      return {
        ...c,
        winRate: wins / trials,
        tsumoRate: tsumos / trials,
        avgTai: wins ? taiSum / wins : 0,
        expectedTai: taiSum / trials,
        avgTurn: wins ? turnSum / wins : null,
      };
    });
    return { horizon, trials, options: results };
  }

  /**
   * 比較「最快」與「期望台數最高」的打法，產生教練說明（兩者相同時說明為什麼也划算）。
   * @param {{options: any[], horizon: number, trials: number}} report evaluate() 的結果
   */
  function advice(report, label = (t) => E.names[t]) {
    const opts = report.options;
    if (!opts.length) return null;
    const fastest = opts.slice().sort((a, b) => b.winRate - a.winRate || b.expectedTai - a.expectedTai)[0];
    const richest = opts.slice().sort((a, b) => b.expectedTai - a.expectedTai || b.winRate - a.winRate)[0];
    const pct = (x) => Math.round(x * 100) + '%';
    const tai = (x) => x.toFixed(1);
    if (fastest.tile === richest.tile)
      return {
        fastest,
        richest,
        differs: false,
        text:
          '打' +
          label(fastest.tile) +
          '又快又划算：接下來約 ' +
          report.horizon +
          ' 巡內胡牌率約 ' +
          pct(fastest.winRate) +
          '，胡了平均 ' +
          tai(fastest.avgTai) +
          ' 台。',
      };
    // 期望台數差距太小（不到 0.15 台）時，仍以速度為主，避免被模擬誤差牽著走
    const gain = richest.expectedTai - fastest.expectedTai;
    const worth = gain >= 0.15;
    return {
      fastest,
      richest,
      differs: worth,
      text: worth
        ? '若考慮台數，打' +
          label(richest.tile) +
          '更划算：胡牌率 ' +
          pct(richest.winRate) +
          '（打' +
          label(fastest.tile) +
          '是 ' +
          pct(fastest.winRate) +
          '），但胡了平均 ' +
          tai(richest.avgTai) +
          ' 台（對 ' +
          tai(fastest.avgTai) +
          ' 台），期望多 ' +
          tai(gain) +
          ' 台。'
        : '打' +
          label(fastest.tile) +
          '最快（胡牌率 ' +
          pct(fastest.winRate) +
          '）；其他打法的台數優勢不明顯，先求胡。',
    };
  }

  const api = {
    evaluate,
    advice,
    candidates,
    unseenPool,
    policyDiscard,
    tryClaim,
    playOut,
    horizonOf,
    othersWin,
    HAZARD,
    random,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Value = api;
})(globalThis);
