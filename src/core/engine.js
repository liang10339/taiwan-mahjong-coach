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
  // 同一份牌型規則供胡牌、向聽、進張與計台使用；保留既有預設，並記下版本方便日後覆盤。
  /** @type {Readonly<MahjongRuleProfile>} */
  const DEFAULT_RULES = Object.freeze({ id: 'taiwan-16-coach', version: 1, liguLigu: true });
  /** @param {Partial<MahjongRuleProfile>} [rules] */
  function ruleProfile(rules = DEFAULT_RULES) {
    if (rules.id != null && rules.id !== DEFAULT_RULES.id) throw Error('Unsupported rule profile');
    if (rules.version != null && rules.version !== DEFAULT_RULES.version)
      throw Error('Unsupported rule version');
    return Object.freeze({ ...DEFAULT_RULES, liguLigu: rules.liguLigu !== false });
  }
  function validHand(c, length, open) {
    return (
      Number.isInteger(open) && open >= 0 && open <= 5 && length <= 17 - 3 * open && c.every((n) => n <= 4)
    );
  }
  // ---- 一般牌型進聽數：五組加一對 ----
  // 做法：把手牌分成萬、筒、索、字四門，各自列出「面子數、搭子數、有沒有眼」的所有可能，
  // 結果依該門的牌型快取；四門再合併取最佳。和逐張搜尋整副手牌的結果完全相同，
  // 但同一門的牌型會重複出現，所以快很多（教練、電腦、危險度、未來的期望值模擬都靠它）。
  // 公式：進聽數 = 10 − 2×面子 − min(搭子, 5 − 面子) − 眼；−1 表示已胡牌。
  // 面子、搭子越多一定不會更差，所以同一門裡「面子和搭子都不比別人多」的拆法可以丟掉（有沒有眼分開比，
  // 因為眼只能有一個）；合併時面子、搭子都封頂在 5，狀態最多 6×6×2 = 72 種，用固定長度的表去重。
  /** @type {[number, number, boolean][]} 四門在牌型編號中的範圍：[起, 迄, 是否字牌] */
  const SUITS = [
    [0, 9, false],
    [9, 18, false],
    [18, 27, false],
    [27, 34, true],
  ];
  /** 各門牌型的拆法快取：key 是「各張數的五進位數字」（字牌另一張表），value 是 [面子, 搭子, 眼] 攤平的陣列 */
  const suitCache = [new Map(), new Map()];
  function suitStates(c, from, to, honor) {
    let key = 0;
    for (let i = to - 1; i >= from; i--) key = key * 5 + c[i];
    const cache = suitCache[honor ? 1 : 0],
      cached = cache.get(key);
    if (cached) return cached;
    const cnt = c.slice(from, to),
      memo = new Map();
    // 回傳剩下的牌能拆出的 (面子, 搭子, 眼) 組合，編碼為 面子*100 + 搭子*10 + 眼
    function walk() {
      const id = cnt.join('');
      const hit = memo.get(id);
      if (hit) return hit;
      const i = cnt.findIndex((n) => n > 0),
        out = new Set();
      if (i < 0) out.add(0);
      else {
        const add = (delta, rest) => rest.forEach((v) => out.add(v + delta));
        const tryRemove = (tiles, delta) => {
          tiles.forEach((j) => cnt[j]--);
          add(delta, walk());
          tiles.forEach((j) => cnt[j]++);
        };
        if (cnt[i] >= 3) tryRemove([i, i, i], 100); // 刻子
        if (!honor && i + 2 < cnt.length && cnt[i + 1] && cnt[i + 2]) tryRemove([i, i + 1, i + 2], 100); // 順子
        if (cnt[i] >= 2) {
          cnt[i] -= 2;
          const rest = walk();
          rest.forEach((v) => {
            if (v % 10 === 0) out.add(v + 1); // 當眼
            out.add(v + 10); // 當搭子（對子）
          });
          cnt[i] += 2;
        }
        if (!honor) for (const d of [1, 2]) if (i + d < cnt.length && cnt[i + d]) tryRemove([i, i + d], 10); // 兩面、邊張、嵌張
        tryRemove([i], 0); // 孤張
      }
      memo.set(id, out);
      return out;
    }
    // 面子、搭子封頂 5 之後，只留下沒有被同眼數的其他拆法完全壓過的組合
    const all = [...walk()].map((v) => [
      Math.min(5, Math.floor(v / 100)),
      Math.min(5, Math.floor(v / 10) % 10),
      v % 10,
    ]);
    const kept = all.filter(
      ([m, t, p], i) =>
        !all.some(([m2, t2, p2], j) => p2 === p && m2 >= m && t2 >= t && (m2 > m || t2 > t || j < i)),
    );
    const states = new Int8Array(kept.length * 3);
    kept.forEach(([m, t, p], i) => states.set([m, t, p], i * 3));
    if (cache.size > 200000) cache.clear(); // 避免長時間使用後記憶體無限增加
    cache.set(key, states);
    return states;
  }
  function standardShanten(hand, open = 0) {
    const c = countsOf(hand);
    if (!validHand(c, hand.length, open)) return Infinity;
    return standardFromCounts(c, open);
  }
  /** 把一門的拆法併進狀態表 cur（編號 = 面子×12 + 搭子×2 + 眼），結果寫進 out */
  function mergeInto(out, cur, add) {
    out.fill(0);
    for (let s = 0; s < 72; s++) {
      if (!cur[s]) continue;
      const m = (s / 12) | 0,
        t = ((s % 12) / 2) | 0,
        p = s & 1;
      for (let k = 0; k < add.length; k += 3) {
        const dp = add[k + 2];
        if (p && dp) continue;
        out[Math.min(5, m + add[k]) * 12 + Math.min(5, t + add[k + 1]) * 2 + (p | dp)] = 1;
      }
    }
    return out;
  }
  /** 狀態表裡最好的進聽數 */
  function bestOf(states) {
    let best = 10;
    for (let s = 0; s < 72; s++) {
      if (!states[s]) continue;
      const m = (s / 12) | 0,
        t = ((s % 12) / 2) | 0;
      best = Math.min(best, 10 - 2 * m - Math.min(t, 5 - m) - (s & 1));
    }
    return best;
  }
  /** 只有攤牌組數、還沒放任何一門時的狀態表 */
  function openStates(open) {
    const st = new Uint8Array(72);
    st[Math.min(open, 5) * 12] = 1;
    return st;
  }
  function standardFromCounts(c, open) {
    // 逐門合併：面子、搭子最多算到 5（再多也不會更好），眼最多一個
    let cur = openStates(open),
      next = new Uint8Array(72);
    for (const [from, to, honor] of SUITS) {
      mergeInto(next, cur, suitStates(c, from, to, honor));
      [cur, next] = [next, cur];
    }
    return bestOf(cur);
  }
  /**
   * 「其他三門」先合併好的狀態表：others[k] 是除了第 k 門以外的合併結果。
   * 試摸某張牌時只有那一門會變，再併上那一門就好，不必四門重算。
   */
  function othersOf(c, open) {
    const parts = SUITS.map(([from, to, honor]) => suitStates(c, from, to, honor));
    return SUITS.map((_, k) => {
      let cur = openStates(open),
        next = new Uint8Array(72);
      parts.forEach((add, j) => {
        if (j === k) return;
        mergeInto(next, cur, add);
        [cur, next] = [next, cur];
      });
      return { states: cur, part: parts[k] };
    });
  }

  // 嚦咕嚦咕：未攤牌，七對加一刻；四張相同牌可作兩對。
  // 固定一種牌作刻子，剩下七個對子取能保留最多手牌的組合。
  // 每種牌可提供兩個對子：先保留 min(n,2) 張，再保留 max(n-2,0) 張。
  // 因為每種最多四張，只需統計價值 2／1 的對子槽，無須列舉全部完成牌型。
  function liguFromCounts(c) {
    let pairs = 0,
      singles = 0;
    const sizes = new Set(c);
    for (const n of c) {
      pairs += Math.floor(n / 2);
      singles += n % 2;
    }
    let kept = 0;
    for (const n of sizes) {
      const twos = Math.min(7, pairs - Math.floor(n / 2));
      const ones = Math.min(7 - twos, singles - (n % 2));
      kept = Math.max(kept, Math.min(n, 3) + twos * 2 + ones);
    }
    return 16 - kept;
  }
  function liguShanten(hand, open = 0) {
    const c = countsOf(hand);
    if (open || !validHand(c, hand.length, open)) return Infinity;
    return liguFromCounts(c);
  }
  function shanten(hand, open = 0, rules = DEFAULT_RULES) {
    const c = countsOf(hand);
    if (!validHand(c, hand.length, open)) return Infinity;
    const standard = standardFromCounts(c, open);
    return open || rules.liguLigu === false ? standard : Math.min(standard, liguFromCounts(c));
  }
  function liguLigu(hand, open = 0, rules = DEFAULT_RULES) {
    return rules.liguLigu !== false && hand.length === 17 && liguShanten(hand, open) === -1;
  }
  function winning(hand, open = 0, rules = DEFAULT_RULES) {
    return hand.length === 17 - 3 * open && shanten(hand, open, rules) === -1;
  }
  // memo 參數保留給舊呼叫端（以前用來快取），現在逐門增量計算已經夠快，不再需要。
  function analyze(hand, publicTiles = [], open = 0, memo = new Map(), rules = DEFAULT_RULES) {
    const known = countsOf([...hand, ...publicTiles.filter((t) => t < 34)]);
    // 直接在張數陣列上加減一張再算進聽數，不必每次複製手牌
    const c = countsOf(hand),
      len = hand.length,
      ligu = !open && rules.liguLigu !== false,
      scratch = new Uint8Array(72),
      suitOf = (t) => (t < 27 ? Math.floor(t / 9) : 3);
    const options = [...new Set(hand)].map((tile) => {
      c[tile]--;
      let s = Infinity;
      const improving = [];
      let remaining = 0;
      if (validHand(c, len - 1, open)) {
        const others = othersOf(c, open);
        s = bestOf(mergeInto(scratch, others[0].states, others[0].part));
        if (ligu) s = Math.min(s, liguFromCounts(c));
        const fits = validHand(c, len, open);
        for (let t = 0; t < 34 && fits; t++) {
          if (known[t] >= 4 || c[t] >= 4) continue;
          const k = suitOf(t),
            [from, to, honor] = SUITS[k];
          c[t]++;
          let after = bestOf(mergeInto(scratch, others[k].states, suitStates(c, from, to, honor)));
          if (ligu && after >= s) after = Math.min(after, liguFromCounts(c));
          c[t]--;
          if (after < s) {
            improving.push(t);
            remaining += 4 - known[t];
          }
        }
      }
      c[tile]++;
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
  /**
   * 開一局新牌：洗牌、擲骰、配牌（含補花）。同一個 seed 與 opts 一定得到同一局。
   * @param {number} [seed] 洗牌種子
   * @param {RuleOptions} [opts] 莊家、圈風、連莊、保留牌數、過水
   * @returns {Game}
   */
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
    /** @type {Game} */
    const g = {
      seed,
      rules: ruleProfile(opts.rules),
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
    if (g.phase !== 'discard' || g.turn !== p || !winning(g.hands[p], g.melds[p].length, g.rules))
      return false;
    const last = g.lastTake && g.lastTake.player === p ? g.lastTake : {};
    g.phase = 'ended';
    g.result =
      who(g, p) +
      '自摸' +
      (liguLigu(g.hands[p], g.melds[p].length, g.rules) ? '，嚦咕嚦咕成立' : '，五組加一對成立');
    g.log.push({ player: p, action: 'tsumo', tile: last.tile, afterKan: !!last.afterKan });
    return true;
  }
  function aiIndex(hand, open = 0, rules = DEFAULT_RULES) {
    let best = Infinity,
      index = 0;
    for (let i = 0; i < hand.length; i++) {
      const h = hand.filter((_, j) => i !== j),
        s = shanten(h, open, rules);
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
    if (winning([...g.hands[p], t], open, g.rules) && !(g.passWater && g.water && g.water[p]))
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
    // 吃、碰、槓記下用了手上哪幾張（同一張牌可能有兩三種吃法），牌譜才能完整重現
    g.log.push({
      player: p,
      action: 'response',
      choice: match.type,
      tile: g.pending.tile,
      ...('tiles' in match && match.type !== 'ron' ? { tiles: match.tiles.slice() } : {}),
    });
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
    g.log.push({ player: p, action: a.type, tile: pending.tile, tiles: a.tiles.slice(), from: pending.from });
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
      before = shanten(g.hands[p], open, g.rules);
    if (a.type === 'ron') return '牌型已成立，可以胡牌。';
    if (a.type === 'kan') return '明槓後必須從牌尾補一張，再出牌；補牌結果未知，不能保證更快聽牌。';
    const rest = g.hands[p].slice();
    for (const t of a.tiles) rest.splice(rest.indexOf(t), 1);
    const after = Math.min(
      ...rest.map((_, i) =>
        shanten(
          rest.filter((_, j) => i !== j),
          open + 1,
          g.rules,
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
    DEFAULT_RULES,
    ruleProfile,
    standardShanten,
    liguShanten,
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
