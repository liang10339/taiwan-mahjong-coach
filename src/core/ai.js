(function (root) {
  'use strict';
  // 電腦對手三種難度。只使用自己的手牌與公開資訊（牌河、攤牌、牌牆剩餘張數），不偷看暗牌。
  const node = typeof module !== 'undefined';
  const E = node ? require('./engine') : root.Mahjong,
    C = node ? require('./coach') : root.Coach,
    Observation = node ? require('./observation') : root.Observation;
  const LEVELS = { easy: '初級', normal: '中級', hard: '高級' };
  /**
   * 高級電腦的風格：和教練同一個決策核心，只是參數不同（真人牌桌上常見的三種打法）。
   * level 傳風格名稱就是「那種風格的高級電腦」；傳 hard 是教練本身的參數。
   * future：之後幾巡放槍代價的權重；valueWeight：台數的權重；claimMode：吃碰的判斷方式。
   */
  const STYLES = {
    fast: { name: '速攻', note: '能吃碰就吃碰、很少棄胡', opts: { future: 0, claimMode: 'efficiency' } },
    safe: { name: '保守', note: '有人可能聽牌就收手、不攤牌', opts: { future: 2, claimMode: 'cautious' } },
    big: { name: '大牌', note: '留字牌對、做一色，台數看得很重', opts: { valueWeight: 2 } },
  };
  /** 這個難度是不是用決策核心（高級或某種風格），是的話回傳 advisor 參數 */
  const coreOpts = (level) => (level === 'hard' ? {} : STYLES[level] ? STYLES[level].opts : null);

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
          .filter((m) => m.type !== 'concealed')
          .flatMap((m) => m.tiles)
          .filter((t) => t < 27)
          .map((t) => Math.floor(t / 9)),
      );
    const oneSuit =
      melds.filter((m) => m.type !== 'concealed').length >= 2 && meldSuits.size === 1
        ? [...meldSuits][0]
        : null;
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
  // 高級電腦和教練用同一個決策核心（advisor.js）：攻守期望值、讀牌、守到底都一樣。
  // advisor 透過 opponents 會用到本檔的 reading()，所以用到時才載入，避免互相 require 卡住。
  const advisor = () => (node ? require('./advisor') : root.Advisor);

  function rng(g) {
    // Independent policy stream: the shuffle seed must never reach decision logic.
    g._ai = (Math.imul((g._ai ?? 0x6d2b79f5) >>> 0, 1664525) + 1013904223) >>> 0;
    return g._ai / 4294967296;
  }

  function chooseDiscard(g, p, level = 'normal') {
    const random = () => rng(g);
    return discardFromView(Observation.forPlayer(g, p), p, level, random);
  }
  function discardFromView(g, p, level, random) {
    const open = g.melds[p].length,
      options = E.analyze(g.hands[p], E.publicTiles(g, p), open, new Map(), g.rules);
    if (level === 'easy') {
      // 只看向聽數，不比較進張；三成機率隨手打掉一張非最佳的牌
      const min = Math.min(...options.map((o) => o.shanten)),
        ok = options.filter((o) => o.shanten === min);
      const pool = random() < 0.3 ? options : ok;
      return pool[Math.floor(random() * pool.length)].tile;
    }
    const core = coreOpts(level);
    if (core) return advisor().decide(g, p, core).tile;
    return options[0].tile;
  }
  function chooseClaim(g, p, level = 'normal') {
    const random = () => rng(g);
    return claimFromView(Observation.forPlayer(g, p), p, level, random);
  }
  function claimFromView(g, p, level, random) {
    const options = [...E.claims(g, p)];
    const ron = options.find((a) => a.type === 'ron');
    if (ron) return ron;
    if (level === 'easy') {
      // 看到能碰、能吃就拿，常常破壞門清
      const take =
        options.find((a) => a.type === 'pon' || a.type === 'kan') || options.find((a) => a.type === 'chi');
      return take && random() < 0.8 ? take : { type: 'pass' };
    }
    const core = coreOpts(level);
    if (core) {
      const best = advisor().claims(g, p, core).best;
      return best ? best.action : { type: 'pass' };
    }
    return C.chooseClaim(g, p);
  }
  function chooseKan(g, p, level = 'normal') {
    g = Observation.forPlayer(g, p);
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
      if (g.phase === 'discard' && E.winning(g.hands[p], g.melds[p].length, g.rules)) E.win(g, p);
      return;
    }
    if (g.phase !== 'discard' || g.turn !== p) return;
    if (E.winning(g.hands[p], g.melds[p].length, g.rules)) {
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
    STYLES,
    coreOpts,
    threat,
    chooseDiscard,
    chooseClaim,
    chooseKan,
    act,
  };
  if (node) module.exports = api;
  else root.AI = api;
})(globalThis);
