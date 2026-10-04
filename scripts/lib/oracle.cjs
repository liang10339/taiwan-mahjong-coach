// 離線的標準答案（只在評估與出題時用，不會放進 App）：
// 站在某個座位的視角，把看不到的牌（對手手牌與牌牆）依「剩下的牌」隨機重新分配許多次，
// 每次對每個候選打法往後打完整局，統計這個座位的平均得失（台）。這就是「猜牌後模擬」的做法。
// 重點：
//   - 只用該座位看得到的資訊（Observation.forPlayer），不會偷看真正的對手手牌與牌牆。
//   - 候選打法共用同一批猜牌（共同亂數），差異才準；同時算「相對最佳」的標準誤。
//   - 限制：猜牌是均勻的，沒有用對手打過什麼牌來推測他的手牌，所以「防守」的判斷偏弱；
//     往後的打法（每家都只看牌效率）也不會防守。比較可信的是進攻、台數、吃碰的取捨。
'use strict';
const E = require('../../src/core/engine.js');
const Observation = require('../../src/core/observation.js');
const Arena = require('./arena.cjs');

/** 可重現的亂數（mulberry32） */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (a, rand) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * 依 p 的視角，隨機猜一種「對手手牌與牌牆」，回傳可以往下打的完整牌局。
 * 對手有暗槓（牌值看不到）時無法猜，丟出錯誤，呼叫端略過這個局面。
 * @param {any} view Observation.forPlayer 的結果
 * @param {number} p
 * @param {() => number} rand
 * @param {any} rules 規則集（桌規是公開資訊）
 */
function determinize(view, p, rand, rules) {
  const left = Array(42)
    .fill(0)
    .map((_, t) => (t < 34 ? 4 : 1));
  const see = (t) => {
    if (t == null) return;
    if (--left[t] < 0) throw Error('看到的牌比整副牌還多：' + t);
  };
  view.hands[p].forEach(see);
  view.rivers.flat().forEach(see);
  view.flowers.flat().forEach(see);
  view.melds.forEach((ms, q) =>
    ms.forEach((m) => {
      if (m.type === 'concealed' && q !== p) throw Error('對手有暗槓，無法猜牌');
      m.tiles.forEach(see);
    }),
  );
  const plain = [],
    flowers = [];
  left.forEach((n, t) => {
    for (let i = 0; i < n; i++) (t < 34 ? plain : flowers).push(t);
  });
  const sizes = [0, 1, 2, 3].map((q) => (q === p ? 0 : view.handCounts[q]));
  const hidden = sizes.reduce((a, b) => a + b, 0) + view.wall.length;
  if (plain.length + flowers.length !== hidden)
    throw Error('剩下的牌數和看不到的位置數不一致：' + (plain.length + flowers.length) + ' 對 ' + hidden);
  shuffle(plain, rand);
  const g = structuredClone(view);
  delete g.observationFor;
  for (let q = 0; q < 4; q++)
    if (q !== p) {
      g.hands[q] = plain.splice(0, sizes[q]).sort((a, b) => a - b);
      g.water[q] = false;
    }
  g.wall = shuffle([...plain, ...flowers], rand);
  g.rules = E.ruleProfile(rules);
  g.seed = Math.floor(rand() * 4294967296);
  g.pending = null;
  return g;
}

/** 候選打法：效率排序前 K 張，加上額外指定的牌（例如教練、只看效率的選擇） */
function candidates(real, p, extra = [], K = 6) {
  const view = Observation.forPlayer(real, p);
  const options = E.analyze(
    view.hands[p],
    E.publicTiles(view, p),
    view.melds[p].length,
    new Map(),
    real.rules,
  );
  const best = options[0].shanten;
  const out = options
    .filter((o) => o.shanten <= best + 1)
    .slice(0, K)
    .map((o) => o.tile);
  for (const t of extra) if (!out.includes(t)) out.push(t);
  return out;
}

const ROLLOUT = ['normal', 'normal', 'normal', 'normal'].map((n) => Arena.strategy(n));

/**
 * 評估 p 在目前局面（輪到 p 出牌）打每張候選牌的期望得失（台）。
 * @param {any} real 真正的牌局（只用來取得 p 的視角，不會讀別家的手牌）
 * @param {number} p
 * @param {number[]} tiles 候選牌
 * @param {{n?: number, seed?: number, env?: any}} [opts] n：猜牌次數；env：桌規（見 envs.cjs）
 * @returns {{tile: number, ev: number, sd: number, diffSe: number, best: boolean}[]}
 */
function evaluate(real, p, tiles, { n = 150, seed = 1, env = 'default' } = {}) {
  const view = Observation.forPlayer(real, p);
  const sums = tiles.map(() => []);
  for (let k = 0; k < n; k++) {
    const rand = rng(seed * 100003 + k);
    const base = determinize(view, p, rand, real.rules);
    tiles.forEach((t, i) => {
      const g = structuredClone(base),
        f = g.fresh,
        idx = f && f.player === p && f.tile === t ? g.hands[p].length - 1 : g.hands[p].indexOf(t);
      if (idx < 0 || !E.discard(g, p, idx)) throw Error('這張牌打不出去：' + t);
      Arena.playOut(g, ROLLOUT);
      sums[i].push(Arena.settle(g, env).deltas[p]);
    });
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const evs = sums.map(mean);
  const top = evs.indexOf(Math.max(...evs));
  return tiles.map((tile, i) => {
    const d = sums[i].map((x, k) => x - sums[top][k]),
      dm = mean(d);
    const v = (a, m) => (a.length > 1 ? a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) : 0);
    return {
      tile,
      ev: evs[i],
      sd: Math.sqrt(v(sums[i], evs[i])),
      diffSe: Math.sqrt(v(d, dm) / d.length),
      best: i === top,
    };
  });
}

module.exports = { rng, determinize, candidates, evaluate };
