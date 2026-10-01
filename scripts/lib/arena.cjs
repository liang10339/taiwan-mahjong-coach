// 評估共用的牌桌：指定四個座位各用哪種打法，打完一局並回傳每家的得失（台，含底）。
// evaluate-coach.cjs（大樣本）與 tests/eval-gate.test.cjs（CI 小樣本守門）都用這裡，確保兩邊量的是同一件事。
'use strict';
const E = require('../../src/core/engine.js');
const AI = require('../../src/core/ai.js');
const A = require('../../src/core/advisor.js');
const Scoring = require('../../src/core/scoring.js');

const BASE = 2.5; // 底換算成台（50 底 20 台）
/** 被評估那家以外的三家（依相對座位：下家、對家、上家），固定不變，讓每個座位面對同樣的對手 */
const OPPONENTS = ['normal', 'hard', 'normal'];

/**
 * 打法。每種打法回答三件事：要不要暗槓／加槓、打哪張、別人打牌時要不要吃碰胡。
 * coach：照教練（Advisor）的建議；其他名稱是電腦難度（normal＝只看牌效率）。
 * @typedef {{ kan(g: Game, p: number): any, discard(g: Game, p: number): number, claim(g: Game, p: number): any }} Strategy
 */
/** @returns {Strategy} */
function strategy(name, opts = {}) {
  if (name === 'coach')
    return {
      kan: (g, p) => AI.chooseKan(g, p, 'normal'),
      discard: (g, p) => A.decide(g, p, { base: BASE, margin: opts.margin, future: opts.future }).tile,
      claim: (g, p) => {
        const c = A.claims(g, p, { base: BASE, margin: opts.margin, future: opts.future });
        return c.best ? c.best.action : { type: 'pass' };
      },
    };
  if (!(name in AI.LEVELS) && !(name in AI.STYLES)) throw Error('不認得的打法：' + name);
  return {
    kan: (g, p) => AI.chooseKan(g, p, name),
    discard: (g, p) => AI.chooseDiscard(g, p, name),
    claim: (g, p) => AI.chooseClaim(g, p, name),
  };
}

/**
 * 打一局。seats[p] 是座位 p 的打法。回傳每家得失、誰胡、是否放槍，以及教練座位的局勢分布。
 * @param {number} seed
 * @param {Strategy[]} seats
 */
function play(seed, seats, styles = null) {
  const g = E.create(seed * 104729, { reserve: 16, passWater: true, dealer: seed % 4 });
  // 電腦的風格是公開宣告的（和實際 App 相同），教練讀牌時會用那種風格的聽牌模型
  if (styles) g.playerStyles = styles;
  let steps = 0;
  while (g.phase !== 'ended' && steps++ < 500) {
    const p = g.turn,
      s = seats[p];
    if (g.phase === 'draw') E.draw(g, p);
    else if (g.phase === 'discard') {
      if (E.winning(g.hands[p], g.melds[p].length, g.rules)) E.win(g, p);
      else {
        const kan = s.kan(g, p);
        if (!(kan && E.selfKan(g, p, kan))) {
          const t = s.discard(g, p),
            f = g.fresh;
          // 要打的正是剛摸進的牌就摸切（最右邊那張），否則從手牌裡找
          E.discard(
            g,
            p,
            f && f.player === p && f.tile === t ? g.hands[p].length - 1 : g.hands[p].indexOf(t),
          );
        }
      }
    }
    if (g.phase === 'claim')
      for (let q = 0; q < 4 && g.phase === 'claim'; q++)
        if (!g.pending.decisions[q]) E.respond(g, q, seats[q].claim(g, q));
  }
  const w = [...g.log].reverse().find((e) => e.action === 'ron' || e.action === 'tsumo');
  const deltas = [0, 0, 0, 0];
  if (w) {
    const tai = Scoring.score(g, w.player).total + BASE;
    if (w.action === 'tsumo') for (let q = 0; q < 4; q++) deltas[q] = q === w.player ? 3 * tai : -tai;
    else {
      deltas[w.player] = tai;
      deltas[w.from] = -tai;
    }
  }
  return {
    deltas,
    winner: w ? w.player : null,
    from: w && w.action === 'ron' ? w.from : null,
    tsumo: !!w && w.action === 'tsumo',
  };
}

/**
 * 公平對照：同一副牌，被評估的打法輪流坐四個座位，每個座位再用基準打法打一次（共 8 局）。
 * 四個座位的配牌、莊家位置、牌牆順序各不相同，平均起來抵消「這副牌剛好對某個座位有利」的運氣。
 * 回傳每個座位「候選 − 基準」的得失差，以及雙方的胡牌、放槍次數。
 */
function duel(seed, candidate, baseline, opts = {}) {
  const names = opts.opponents || OPPONENTS,
    lineup = names.map((n) => strategy(n));
  const cand = strategy(candidate, opts),
    base = strategy(baseline, opts);
  const out = { seed, diffs: [], a: { won: 0, dealIn: 0, delta: 0 }, b: { won: 0, dealIn: 0, delta: 0 } };
  for (let s = 0; s < 4; s++) {
    const pair = [];
    for (const [key, me] of [
      ['a', cand],
      ['b', base],
    ]) {
      const seats = [0, 1, 2, 3].map((p) => (p === s ? me : lineup[(p - s + 3) % 4]));
      const styles = [0, 1, 2, 3].map((p) =>
        p === s ? null : AI.STYLES[names[(p - s + 3) % 4]] ? names[(p - s + 3) % 4] : null,
      );
      const r = play(seed, seats, styles.some(Boolean) ? styles : null);
      const sum = out[key];
      sum.won += r.winner === s ? 1 : 0;
      sum.dealIn += r.from === s ? 1 : 0;
      sum.delta += r.deltas[s];
      pair.push(r.deltas[s]);
    }
    out.diffs.push(Math.round((pair[0] - pair[1]) * 100) / 100);
  }
  return out;
}

/** 彙總多副牌的結果：每副牌四個座位的差先平均（同一副牌內的四局彼此相關），再算平均與標準誤 */
function summarize(rows) {
  const n = rows.length,
    games = n * 4;
  const per = rows.map((r) => r.diffs.reduce((a, b) => a + b, 0) / r.diffs.length);
  const mean = per.reduce((a, b) => a + b, 0) / Math.max(1, n),
    sd = n > 1 ? Math.sqrt(per.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
  const total = (side, k) => rows.reduce((a, r) => a + r[side][k], 0);
  const rate = (side, k) => total(side, k) / Math.max(1, games);
  return {
    deals: n,
    games,
    mean,
    se: sd / Math.sqrt(n),
    a: {
      won: rate('a', 'won'),
      dealIn: rate('a', 'dealIn'),
      delta: total('a', 'delta') / Math.max(1, games),
    },
    b: {
      won: rate('b', 'won'),
      dealIn: rate('b', 'dealIn'),
      delta: total('b', 'delta') / Math.max(1, games),
    },
  };
}

module.exports = { BASE, OPPONENTS, strategy, play, duel, summarize };
