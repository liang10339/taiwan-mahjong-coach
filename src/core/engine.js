(function (root) {
  'use strict';
  const names = [
    ...['萬', '筒', '索'].flatMap((s) => Array.from({ length: 9 }, (_, i) => `${i + 1}${s}`)),
    ...'東南西北'.split(''),
    '中',
    '發',
    '白',
    '春',
    '夏',
    '秋',
    '冬',
    '梅',
    '蘭',
    '竹',
    '菊',
  ];
  const countsOf = (hand) => {
    const c = Array(34).fill(0);
    for (const t of hand) {
      if (!Number.isInteger(t) || t < 0 || t >= 34) throw Error('Invalid tile');
      c[t]++;
    }
    return c;
  };
  // Standard 16-tile hand: five melds and one pair. No special hands.
  function shanten(hand, open = 0) {
    const c = countsOf(hand);
    let best = 10;
    const seen = new Set();
    function visit(m, t, p) {
      const key = c.join('') + ':' + m + ',' + t + ',' + p;
      if (seen.has(key)) return;
      seen.add(key);
      const i = c.findIndex((n) => n > 0);
      if (i < 0) {
        best = Math.min(best, 10 - 2 * m - Math.min(t, 5 - m) - p);
        return;
      }
      if (m < 5 && c[i] >= 3) {
        c[i] -= 3;
        visit(m + 1, t, p);
        c[i] += 3;
      }
      if (m < 5 && i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
        c[i]--;
        c[i + 1]--;
        c[i + 2]--;
        visit(m + 1, t, p);
        c[i]++;
        c[i + 1]++;
        c[i + 2]++;
      }
      if (c[i] >= 2) {
        c[i] -= 2;
        if (!p) visit(m, t, 1);
        if (t < 5) visit(m, t + 1, p);
        c[i] += 2;
      }
      if (t < 5 && i < 27)
        for (const d of [1, 2])
          if ((i % 9) + d < 9 && c[i + d]) {
            c[i]--;
            c[i + d]--;
            visit(m, t + 1, p);
            c[i]++;
            c[i + d]++;
          }
      c[i]--;
      visit(m, t, p);
      c[i]++;
    }
    visit(open, 0, 0);
    return best;
  }
  // 嚦咕嚦咕：門清，七對加一刻
  function liguLigu(hand, open = 0) {
    if (open || hand.length !== 17) return false;
    const c = countsOf(hand);
    let pairs = 0,
      triples = 0;
    for (const n of c) {
      if (n === 2) pairs++;
      else if (n === 4) pairs += 2;
      else if (n === 3) triples++;
      else if (n) return false;
    }
    return pairs === 7 && triples === 1;
  }
  function winning(hand, open = 0) {
    return (
      hand.length === 17 - 3 * open &&
      countsOf(hand).every((n) => n <= 4) &&
      (shanten(hand, open) === -1 || liguLigu(hand, open))
    );
  }
  function analyze(hand, publicTiles = [], open = 0, memo = new Map()) {
    const known = countsOf([...hand, ...publicTiles.filter((t) => t < 34)]);
    const value = (h) => {
      const key = open + ':' + countsOf(h).join('');
      if (!memo.has(key)) memo.set(key, shanten(h, open));
      return memo.get(key);
    };
    const options = [...new Set(hand)].map((tile) => {
      const rest = hand.slice();
      rest.splice(rest.indexOf(tile), 1);
      const s = value(rest);
      const improving = [];
      let remaining = 0;
      for (let t = 0; t < 34; t++)
        if (known[t] < 4 && value([...rest, t]) < s) {
          improving.push(t);
          remaining += 4 - known[t];
        }
      return {
        tile,
        shanten: s,
        remaining,
        improving,
        outs: improving.map((t) => ({ tile: t, remaining: 4 - known[t] })),
      };
    });
    return options.sort((a, b) => a.shanten - b.shanten || b.remaining - a.remaining || a.tile - b.tile);
  }
  // 座位 p 的門風（0 東、1 南、2 西、3 北）：莊家永遠是東。
  function seatWind(g, p) {
    return (((p - (g.dealer || 0)) % 4) + 4) % 4;
  }
  function who(g, p) {
    return p === 0 ? '你' : names[27 + seatWind(g, p)] + '家';
  }
  function create(seed = Date.now(), opts = {}) {
    let n = seed >>> 0;
    const random = () => {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      return n / 4294967296;
    };
    const dealer = opts.dealer || 0,
      roundWind = opts.roundWind || 0,
      streak = opts.streak || 0;
    // 桌規選項：reserve 保留牌尾張數（台灣常見留八墩 16 張即流局）、passWater 過水（放過胡牌後，自己打出一張牌前不能胡別人打的牌）
    const reserve = opts.reserve || 0,
      passWater = !!opts.passWater;
    const wall = [];
    for (let t = 0; t < 34; t++) for (let i = 0; i < 4; i++) wall.push(t);
    for (let t = 34; t < 42; t++) wall.push(t);
    for (let i = wall.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [wall[i], wall[j]] = [wall[j], wall[i]];
    }
    // 莊家擲三顆骰子：從莊家算 1 逆時針數到牌牆主人，從該牌牆右側數過點數墩後開門。
    // 洗好的牌視為已從開門處排起：陣列尾端是摸牌端，陣列頭是牌尾（補花、補槓從這裡拿）。
    const dice = [0, 0, 0].map(() => 1 + Math.floor(random() * 6)),
      wallOwner = (dealer + dice[0] + dice[1] + dice[2] - 1) % 4;
    const g = {
      seed,
      wall,
      hands: [[], [], [], []],
      flowers: [[], [], [], []],
      rivers: [[], [], [], []],
      melds: [[], [], [], []],
      pending: null,
      turn: dealer,
      phase: 'draw',
      result: '',
      log: [],
      dealer,
      roundWind,
      streak,
      dice,
      wallOwner,
      reserve,
      passWater,
      water: [false, false, false, false],
      cuts: [[], [], [], []],
      fresh: null,
    };
    for (let r = 0; r < 16; r++) for (let k = 0; k < 4; k++) take(g, (dealer + k) % 4);
    g.hands.forEach((h) => h.sort((a, b) => a - b));
    g.lastTake = null;
    endFlowerWin(g);
    return g;
  }
  function take(g, p, tail = false) {
    const kan = tail;
    while (g.wall.length) {
      const t = tail ? g.wall.shift() : g.wall.pop();
      if (t >= 34) {
        g.flowers[p].push(t);
        tail = true;
        flowerWin(g, p);
        continue;
      }
      g.hands[p].push(t);
      g.lastTake = { player: p, tile: t, afterKan: kan };
      return t;
    }
    return null;
  }
  // 八仙過海：集滿八張花；七搶一：手上七張花時，別家摸到第八張可直接搶走胡牌
  function flowerWin(g, p) {
    if (g.phase === 'ended' || g.flowerWin) return;
    if (g.flowers[p].length === 8) g.flowerWin = { player: p, special: 'eightFlowers' };
    else {
      const q = [0, 1, 2, 3].find((x) => x !== p && g.flowers[x].length === 7);
      if (q !== undefined && g.flowers[p].length === 1) {
        g.flowers[q].push(g.flowers[p].pop());
        g.flowerWin = { player: q, special: 'sevenRobOne', from: p };
      }
    }
  }
  function endFlowerWin(g) {
    if (!g.flowerWin || g.phase === 'ended') return false;
    const w = g.flowerWin;
    g.phase = 'ended';
    g.turn = w.player;
    g.result =
      who(g, w.player) +
      (w.special === 'eightFlowers' ? '八仙過海（集滿八張花）' : '七搶一（搶走' + who(g, w.from) + '的花）');
    g.log.push({ player: w.player, action: 'flowers', special: w.special, from: w.from });
    return true;
  }
  function draw(g, p) {
    if (g.phase !== 'draw' || g.turn !== p) return false;
    if (g.wall.length <= (g.reserve || 0)) {
      g.phase = 'ended';
      g.result = g.reserve ? '只剩 ' + g.reserve / 2 + ' 墩（' + g.reserve + ' 張），流局' : '牌牆已空，流局';
      return false;
    }
    const t = take(g, p);
    if (t !== null) g.fresh = { player: p, tile: t };
    if (endFlowerWin(g)) return true;
    if (t === null) {
      g.phase = 'ended';
      g.result = '牌牆已空，流局';
      return false;
    }
    g.phase = 'discard';
    g.log.push({ player: p, action: 'draw', tile: t });
    return true;
  }
  // 摸切：打出剛摸進、放在手牌最右邊的那張；空切：打出手中和剛摸進相同的另一張（別人看起來像手切）；其他都是手切
  function cutType(g, p, index) {
    const f = g.fresh,
      h = g.hands[p];
    if (!f || f.player !== p || h[index] !== f.tile) return 'hand';
    return index === h.length - 1 ? 'tsumo' : 'empty';
  }
  function discard(g, p, index) {
    if (
      g.phase !== 'discard' ||
      g.turn !== p ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= g.hands[p].length
    )
      return false;
    const cut = cutType(g, p, index);
    const [t] = g.hands[p].splice(index, 1);
    g.rivers[p].push(t);
    (g.cuts || (g.cuts = [[], [], [], []]))[p].push(cut);
    g.fresh = null;
    if (g.water) g.water[p] = false;
    g.log.push({ player: p, action: 'discard', tile: t, cut });
    g.turn = (p + 1) % 4;
    g.phase = 'claim';
    g.pending = { from: p, tile: t, decisions: {} };
    for (let q = 0; q < 4; q++)
      if (q === p || claims(g, q).length === 0) g.pending.decisions[q] = { type: 'pass' };
    resolve(g);
    return true;
  }
  function win(g, p) {
    if (g.phase !== 'discard' || g.turn !== p || !winning(g.hands[p], g.melds[p].length)) return false;
    const last = g.lastTake && g.lastTake.player === p ? g.lastTake : {};
    g.phase = 'ended';
    g.result =
      who(g, p) + '自摸' + (liguLigu(g.hands[p], g.melds[p].length) ? '，嚦咕嚦咕成立' : '，五組加一對成立');
    g.log.push({ player: p, action: 'tsumo', tile: last.tile, afterKan: !!last.afterKan });
    return true;
  }
  function aiIndex(hand, open = 0) {
    let best = Infinity,
      index = 0;
    for (let i = 0; i < hand.length; i++) {
      const h = hand.filter((_, j) => i !== j),
        s = shanten(h, open);
      if (s < best) {
        best = s;
        index = i;
      }
    }
    return index;
  }

  function claims(g, p) {
    if (g.phase !== 'claim' || !g.pending || p === g.pending.from) return [];
    const t = g.pending.tile,
      c = countsOf(g.hands[p]),
      out = [],
      open = g.melds[p].length;
    if (winning([...g.hands[p], t], open) && !(g.passWater && g.water && g.water[p]))
      out.push({ type: 'ron', tiles: [t] });
    if (g.pending.kind === 'robkan') return out;
    if (open < 5 && c[t] >= 2) out.push({ type: 'pon', tiles: [t, t] });
    if (open < 5 && c[t] >= 3 && g.wall.length > (g.reserve || 0))
      out.push({ type: 'kan', tiles: [t, t, t] });
    if (open < 5 && p === (g.pending.from + 1) % 4 && t < 27)
      for (
        let start = Math.max(Math.floor(t / 9) * 9, t - 2);
        start <= Math.min(Math.floor(t / 9) * 9 + 6, t);
        start++
      ) {
        const needs = [start, start + 1, start + 2];
        needs.splice(needs.indexOf(t), 1);
        if (needs.every((x) => c[x] > 0)) out.push({ type: 'chi', tiles: needs });
      }
    return out;
  }
  function respond(g, p, choice) {
    if (g.phase !== 'claim' || p === g.pending.from || g.pending.decisions[p]) return false;
    const match =
      choice.type === 'pass'
        ? { type: 'pass' }
        : claims(g, p).find((x) => JSON.stringify(x) === JSON.stringify(choice));
    if (!match) return false;
    if (match.type === 'pass' && g.passWater && claims(g, p).some((a) => a.type === 'ron')) g.water[p] = true;
    g.pending.decisions[p] = match;
    g.log.push({ player: p, action: 'response', choice: match.type, tile: g.pending.tile });
    resolve(g);
    return true;
  }
  function resolve(g) {
    if (Object.keys(g.pending.decisions).length < 4) return;
    const pending = g.pending;
    const ranked = [];
    for (let d = 1; d < 4; d++) {
      const p = (pending.from + d) % 4,
        a = pending.decisions[p];
      if (a.type !== 'pass') ranked.push({ p, a, d, rank: a.type === 'ron' ? 3 : a.type === 'chi' ? 1 : 2 });
    }
    ranked.sort((x, y) => y.rank - x.rank || x.d - y.d);
    g.pending = null;
    g.log.push({
      action: 'resolution',
      player: ranked[0]?.p ?? pending.from,
      choice: ranked[0]?.a.type ?? 'pass',
      tile: pending.tile,
    });
    if (pending.kind === 'robkan') {
      if (!ranked.length) {
        finishAdded(g, pending.from, pending.kan);
        return;
      }
      const { p } = ranked[0];
      g.hands[pending.from].splice(g.hands[pending.from].indexOf(pending.tile), 1);
      g.hands[p].push(pending.tile);
      g.turn = p;
      g.phase = 'ended';
      g.result = who(g, p) + '搶槓胡 ' + names[pending.tile];
      g.log.push({ player: p, action: 'ron', tile: pending.tile, robKan: true, from: pending.from });
      return;
    }
    if (!ranked.length) {
      const more = g.wall.length > (g.reserve || 0);
      g.phase = more ? 'draw' : 'ended';
      if (!more)
        g.result = g.reserve
          ? '只剩 ' + g.reserve / 2 + ' 墩（' + g.reserve + ' 張），流局'
          : '牌牆已空，流局';
      return;
    }
    const { p, a } = ranked[0];
    g.turn = p;
    g.rivers[pending.from].pop();
    if (g.cuts && g.cuts[pending.from]) g.cuts[pending.from].pop();
    if (a.type === 'ron') {
      g.hands[p].push(pending.tile);
      g.phase = 'ended';
      g.result = who(g, p) + '胡 ' + names[pending.tile] + '（' + who(g, pending.from) + '放槍）';
      g.log.push({ player: p, action: 'ron', tile: pending.tile, from: pending.from });
      return;
    }
    for (const t of a.tiles) g.hands[p].splice(g.hands[p].indexOf(t), 1);
    g.melds[p].push({
      type: a.type,
      tiles: [...a.tiles, pending.tile].sort((a, b) => a - b),
      from: pending.from,
    });
    g.log.push({ player: p, action: a.type, tile: pending.tile });
    g.phase = 'discard';
    if (a.type === 'kan') supplement(g, p);
  }
  function supplement(g, p) {
    g.fresh = null;
    const t = take(g, p, true);
    if (t !== null) g.fresh = { player: p, tile: t };
    if (endFlowerWin(g)) return;
    if (t === null) {
      g.phase = 'ended';
      g.result = '無牌可補，流局';
    }
  }
  function selfKans(g, p) {
    if (g.phase !== 'discard' || g.turn !== p || g.wall.length <= (g.reserve || 0)) return [];
    const c = countsOf(g.hands[p]),
      out = [];
    if (g.melds[p].length < 5)
      c.forEach((n, t) => {
        if (n === 4) out.push({ type: 'concealed', tile: t });
      });
    g.melds[p].forEach((m, i) => {
      if (m.type === 'pon' && c[m.tiles[0]]) out.push({ type: 'added', tile: m.tiles[0], meld: i });
    });
    return out;
  }
  function selfKan(g, p, a) {
    if (!selfKans(g, p).some((x) => JSON.stringify(x) === JSON.stringify(a))) return false;
    if (a.type === 'added') {
      g.phase = 'claim';
      g.pending = { kind: 'robkan', from: p, tile: a.tile, kan: { ...a }, decisions: {} };
      g.log.push({ player: p, action: 'added-attempt', tile: a.tile });
      for (let q = 0; q < 4; q++)
        if (q === p || !claims(g, q).length) g.pending.decisions[q] = { type: 'pass' };
      resolve(g);
      return true;
    }
    const count = a.type === 'concealed' ? 4 : 1;
    for (let i = 0; i < count; i++) g.hands[p].splice(g.hands[p].indexOf(a.tile), 1);
    if (a.type === 'concealed') g.melds[p].push({ type: 'concealed', tiles: Array(4).fill(a.tile), from: p });
    else {
      g.melds[p][a.meld].tiles.push(a.tile);
      g.melds[p][a.meld].type = 'added';
    }
    g.log.push({ player: p, action: a.type, tile: a.tile });
    supplement(g, p);
    return true;
  }
  function finishAdded(g, p, a) {
    g.hands[p].splice(g.hands[p].indexOf(a.tile), 1);
    g.melds[p][a.meld].tiles.push(a.tile);
    g.melds[p][a.meld].type = 'added';
    g.turn = p;
    g.phase = 'discard';
    g.log.push({ player: p, action: 'added', tile: a.tile });
    supplement(g, p);
  }
  function publicTiles(g, viewer = 0) {
    return [
      ...g.rivers.flat(),
      ...g.melds.flatMap((ms, p) =>
        ms.filter((m) => m.type !== 'concealed' || p === viewer).flatMap((m) => m.tiles),
      ),
      ...(g.pending?.kind === 'robkan' && g.pending.from !== viewer ? [g.pending.tile] : []),
    ];
  }
  function claimAdvice(g, p, a) {
    const progress = (n) =>
      n === 0 ? '聽牌' : (['', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'][n] || n) + '進聽';
    const open = g.melds[p].length,
      before = shanten(g.hands[p], open);
    if (a.type === 'ron') return '牌型已成立，可以胡牌。';
    if (a.type === 'kan') return '明槓後必須從牌尾補一張，再出牌；補牌結果未知，不能保證更快聽牌。';
    const rest = g.hands[p].slice();
    for (const t of a.tiles) rest.splice(rest.indexOf(t), 1);
    const after = Math.min(
      ...rest.map((_, i) =>
        shanten(
          rest.filter((_, j) => i !== j),
          open + 1,
        ),
      ),
    );
    return (
      '目前 ' +
      progress(before) +
      '；' +
      (a.type === 'chi' ? '吃' : '碰') +
      '後再出一張，最快可到 ' +
      progress(after) +
      '。' +
      (after < before ? '牌型會更接近聽牌。' : '沒有減少進聽數，可以考慮不吃碰。') +
      ' 攤牌後不能拆回，也會影響門清與防守；這裡只比較牌效率。'
    );
  }

  const api = {
    cutType,
    seatWind,
    who,
    liguLigu,
    claims,
    respond,
    selfKans,
    selfKan,
    publicTiles,
    claimAdvice,
    names,
    shanten,
    winning,
    analyze,
    create,
    draw,
    discard,
    win,
    aiIndex,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Mahjong = api;
})(globalThis);
