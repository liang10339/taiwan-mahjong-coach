(function (root) {
  'use strict';
  // 電腦對手三種難度。只使用自己的手牌與公開資訊（牌河、攤牌、牌牆剩餘張數），不偷看暗牌。
  const node = typeof module !== 'undefined';
  const E = node ? require('./engine') : root.Mahjong,
    C = node ? require('./coach') : root.Coach,
    D = node ? require('./defense') : root.Defense;
  const LEVELS = { easy: '初級', normal: '中級', hard: '高級' };

  // 依公開資訊估計對手離聽牌多近：0 看不出、1 可能接近、2 很可能已聽牌
  const SUITS = ['萬', '筒', '條'];
  // 讀牌：只用公開資訊整理一家的訊號
  // streak：最近連續摸切幾次（手牌結構沒變，常見於已聽牌）；recentHand：最近手切的牌；
  // oneSuit：攤牌全是同一花色（可加字牌）→ 可能做清一色／混一色；avoid：打最多的花色（通常不做那門）
  function reading(g, q) {
    const cuts = (g.cuts && g.cuts[q]) || [],
      river = g.rivers[q];
    let streak = 0;
    for (let i = cuts.length - 1; i >= 0 && cuts[i] === 'tsumo'; i--) streak++;
    const recentHand = river.filter((t, i) => cuts[i] && cuts[i] !== 'tsumo').slice(-3);
    const melds = g.melds[q],
      meldSuits = new Set(
        melds
          .flatMap((m) => m.tiles)
          .filter((t) => t < 27)
          .map((t) => Math.floor(t / 9)),
      );
    const oneSuit = melds.length >= 2 && meldSuits.size === 1 ? [...meldSuits][0] : null;
    const counts = [0, 0, 0];
    river.forEach((t) => {
      if (t < 27) counts[Math.floor(t / 9)]++;
    });
    const most = counts.indexOf(Math.max(...counts)),
      avoid = river.length >= 6 && counts[most] >= river.length / 2 ? most : null;
    const honors = river.filter((t) => t >= 27).length,
      late = river.slice(-3);
    const middleRun = late.length === 3 && late.every((t) => t < 27 && t % 9 >= 2 && t % 9 <= 6);
    return {
      player: q,
      streak,
      recentHand,
      oneSuit,
      avoid,
      honors,
      middleRun,
      melds: melds.length,
      discards: river.length,
    };
  }
  // 依公開資訊估計對手離聽牌多近：0 看不出、1 可能接近、2 很可能已聽牌
  function threat(g, q) {
    const open = g.melds[q].length,
      left = g.wall.length - (g.reserve || 0),
      r = reading(g, q);
    if (open >= 3) return 2;
    if (open >= 2 && left < 70) return 2;
    if (r.streak >= 4 && left < 70) return 2; // 連續摸切四巡以上：多半已聽牌、不再換牌
    if (open >= 2 || left < 30) return 1;
    if (r.streak >= 3 && left < 80) return 1;
    if (left < 55 && r.middleRun) return 1; // 後期連打中張，常是聽牌後的訊號
    return 0;
  }
  function threats(g, viewer) {
    return [0, 1, 2, 3].filter((q) => q !== viewer).map((q) => ({ player: q, level: threat(g, q) }));
  }
  // 一張牌對各家的危險分數：可成立的胡牌組合數 × 對手威脅程度
  function danger(g, viewer, t, list = threats(g, viewer)) {
    const r = D.inspect(g, viewer, t);
    let score = 0;
    const per = [];
    for (const o of r.opponents) {
      const lv = (list.find((x) => x.player === o.player) || { level: 0 }).level,
        rd = reading(g, o.player);
      // 攤牌全同一花色：該花色與字牌加倍小心（清一色／混一色）
      const suitHit = rd.oneSuit !== null && (t >= 27 || Math.floor(t / 9) === rd.oneSuit),
        w = o.ways.length * (suitHit ? 2 : 1),
        s = w * (1 + lv * 2);
      score += lv ? s : w * 0.2;
      per.push({ player: o.player, ways: o.ways.length, level: lv, suitHit });
    }
    return { tile: t, score, per, excluded: r.excluded };
  }
  // 給 UI 的三段危險度
  // UI 三段危險度：只看「可能已接近聽牌」的對手。沒人有威脅時一律低；
  // 有威脅時，該家還能用這張胡的組合 0 種為低、1–3 種為中（多半是字牌、么九），4 種以上為高（中張可組多種順子）
  function dangerLevel(d) {
    if (d.excluded) return 'safe';
    let level = 'safe';
    for (const x of d.per) {
      if (!x.level || !x.ways) continue;
      if (x.ways >= 4) return 'high';
      level = 'mid';
    }
    return level;
  }

  function rng(g) {
    g._ai = (Math.imul((g._ai ?? g.seed) >>> 0, 1664525) + 1013904223) >>> 0;
    return g._ai / 4294967296;
  }

  function chooseDiscard(g, p, level = 'normal') {
    const open = g.melds[p].length,
      options = E.analyze(g.hands[p], E.publicTiles(g, p), open);
    if (level === 'easy') {
      // 只看向聽數，不比較進張；三成機率隨手打掉一張非最佳的牌
      const min = Math.min(...options.map((o) => o.shanten)),
        ok = options.filter((o) => o.shanten === min);
      const pool = rng(g) < 0.3 ? options : ok;
      return pool[Math.floor(rng(g) * pool.length)].tile;
    }
    if (level === 'hard') {
      const list = threats(g, p),
        mine = options[0].shanten,
        max = Math.max(...list.map((x) => x.level));
      const rated = options.map((o) => ({ o, d: danger(g, p, o.tile, list) }));
      // 棄胡：有人很可能聽牌而自己還遠，完全以安全為先
      if ((max >= 2 && mine >= 2) || (max >= 1 && mine >= 3))
        return rated.sort(
          (a, b) => a.d.score - b.d.score || a.o.shanten - b.o.shanten || b.o.remaining - a.o.remaining,
        )[0].o.tile;
      // 攻守兼顧：在不退步且進張不少於首選八成的牌裡，挑最安全的
      if (max >= 1) {
        const best = options[0],
          keep = rated.filter((x) => x.o.shanten === best.shanten && x.o.remaining >= best.remaining * 0.8);
        return keep.sort((a, b) => a.d.score - b.d.score)[0].o.tile;
      }
    }
    return options[0].tile;
  }
  function chooseClaim(g, p, level = 'normal') {
    const options = [...E.claims(g, p)];
    const ron = options.find((a) => a.type === 'ron');
    if (ron) return ron;
    if (level === 'easy') {
      // 看到能碰、能吃就拿，常常破壞門清
      const take =
        options.find((a) => a.type === 'pon' || a.type === 'kan') || options.find((a) => a.type === 'chi');
      return take && rng(g) < 0.8 ? take : { type: 'pass' };
    }
    const a = C.chooseClaim(g, p);
    if (level === 'hard' && a.type !== 'pass') {
      // 已有人很可能聽牌、自己還差很遠時，不為了攤牌暴露更多
      const max = Math.max(...threats(g, p).map((x) => x.level)),
        mine = E.shanten(g.hands[p], g.melds[p].length);
      if (max >= 2 && mine >= 3) return { type: 'pass' };
    }
    return a;
  }
  function chooseKan(g, p, level = 'normal') {
    if (level === 'easy') {
      const k = E.selfKans(g, p);
      return k[0] || null;
    }
    return C.chooseKan(g, p);
  }
  // 電腦一步：摸牌、自摸、槓或出牌
  function act(g, p, level = 'normal') {
    if (g.phase === 'draw' && g.turn === p) {
      E.draw(g, p);
      if (g.phase === 'discard' && E.winning(g.hands[p], g.melds[p].length)) E.win(g, p);
      return;
    }
    if (g.phase !== 'discard' || g.turn !== p) return;
    if (E.winning(g.hands[p], g.melds[p].length)) {
      E.win(g, p);
      return;
    }
    const kan = chooseKan(g, p, level);
    if (kan && E.selfKan(g, p, kan)) return;
    const t = chooseDiscard(g, p, level),
      f = g.fresh;
    // 要打的正是剛摸進的牌就直接摸切（放在最右邊那張）
    E.discard(g, p, f && f.player === p && f.tile === t ? g.hands[p].length - 1 : g.hands[p].indexOf(t));
  }
  const api = {
    SUITS,
    reading,
    LEVELS,
    threat,
    threats,
    danger,
    dangerLevel,
    chooseDiscard,
    chooseClaim,
    chooseKan,
    act,
  };
  if (node) module.exports = api;
  else root.AI = api;
})(globalThis);
