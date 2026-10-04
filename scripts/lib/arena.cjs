// 評估共用的牌桌：指定四個座位各用哪種打法，打完一局並回傳每家的得失（台，含底）。
// evaluate-coach.cjs（大樣本）與 tests/eval-gate.test.cjs（CI 小樣本守門）都用這裡，確保兩邊量的是同一件事。
'use strict';
const E = require('../../src/core/engine.js');
const AI = require('../../src/core/ai.js');
const A = require('../../src/core/advisor.js');
const Scoring = require('../../src/core/scoring.js');
const Humans = require('./humans.cjs');
const { ENVS, POOLS, streakOf } = require('./envs.cjs');

const BASE = 2.5; // 預設桌規的底換算成台（50 底 20 台）
/** 被評估那家以外的三家（依相對座位：下家、對家、上家），固定不變，讓每個座位面對同樣的對手 */
const OPPONENTS = POOLS.bots;

/** 桌規：名稱（見 envs.cjs）或物件；底換算成幾台，教練和計分都用它 */
function envOf(env = 'default') {
  const e = typeof env === 'string' ? ENVS[env] : env;
  if (!e) throw Error('不認得的桌規：' + env);
  return { ...e, base: e.stake.base / e.stake.perTai };
}

/**
 * 打法。每種打法回答三件事：要不要暗槓／加槓、打哪張、別人打牌時要不要吃碰胡。
 * coach：照教練（Advisor）的建議；其他名稱是電腦難度（normal＝只看牌效率）。
 * @typedef {{ kan(g: Game, p: number): any, discard(g: Game, p: number): number, claim(g: Game, p: number): any }} Strategy
 */
/** @returns {Strategy} */
function strategy(name, opts = {}) {
  const base = opts.base ?? BASE;
  if (name === 'coach')
    return {
      kan: (g, p) => AI.chooseKan(g, p, 'normal'),
      discard: (g, p) => A.decide(g, p, { base, margin: opts.margin, future: opts.future }).tile,
      claim: (g, p) => {
        const c = A.claims(g, p, { base, margin: opts.margin, future: opts.future });
        return c.best ? c.best.action : { type: 'pass' };
      },
    };
  const human = Humans.strategy(name);
  if (human) return human;
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
function play(seed, seats, styles = null, envSpec = 'default') {
  const env = envOf(envSpec);
  const g = E.create(seed * 104729, {
    reserve: 16,
    passWater: true,
    dealer: seed % 4,
    streak: streakOf(env, seed),
    rules: env.rules,
  });
  // 電腦的風格是公開宣告的（和實際 App 相同），教練讀牌時會用那種風格的聽牌模型
  if (styles) g.playerStyles = styles;
  playOut(g, seats);
  return settle(g, env);
}

/** 從目前的局面打到結束（每個座位用自己的打法）。評估與離線標準答案的模擬都用這個。 */
function playOut(g, seats, maxSteps = 500, hook = null) {
  let steps = 0;
  while (g.phase !== 'ended' && steps++ < maxSteps) {
    const p = g.turn,
      s = seats[p];
    if (g.phase === 'draw') E.draw(g, p);
    else if (g.phase === 'discard') {
      if (E.winning(g.hands[p], g.melds[p].length, g.rules)) E.win(g, p);
      else {
        if (hook) hook(g, p); // 輪到 p 出牌前（評估用：記錄局面）
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
  return g;
}

/** 結算和 App 一樣：底＋台×每台，莊家與連莊、自摸三家付、一炮多響各自向放槍者收；單位換算成「台」 */
function settle(g, envSpec = 'default') {
  const env = envOf(envSpec);
  const winners = E.winners(g),
    results = winners.map((w) => Scoring.score(g, w)),
    deltas = [0, 0, 0, 0];
  const paid = Scoring.settleAll(g, results, env.stake).deltas;
  for (let q = 0; q < 4; q++) deltas[q] = paid[q] / env.stake.perTai;
  const first = results[0];
  return {
    deltas,
    winners,
    winner: winners.length ? winners[0] : null,
    from: results.length && !first.tsumo && !first.ctx.special ? (first.ctx.from ?? null) : null,
    tsumo: !!first && first.tsumo,
    tai: results.map((r) => r.total),
  };
}

/**
 * 公平對照：同一副牌，被評估的打法輪流坐四個座位，每個座位再用基準打法打一次（共 8 局）。
 * 四個座位的配牌、莊家位置、牌牆順序各不相同，平均起來抵消「這副牌剛好對某個座位有利」的運氣。
 * 回傳每個座位「候選 − 基準」的得失差，以及雙方的胡牌、放槍次數。
 */
function duel(seed, candidate, baseline, opts = {}) {
  const env = envOf(opts.env),
    names = opts.opponents || OPPONENTS,
    lineup = names.map((n) => strategy(n, { base: env.base }));
  const cand = strategy(candidate, { ...opts, base: env.base }),
    base = strategy(baseline, { ...opts, base: env.base });
  const out = {
    seed,
    diffs: [],
    a: { won: 0, dealIn: 0, delta: 0, tsumo: 0, tai: 0 },
    b: { won: 0, dealIn: 0, delta: 0, tsumo: 0, tai: 0 },
  };
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
      const r = play(seed, seats, styles.some(Boolean) ? styles : null, env);
      const sum = out[key],
        mine = r.winners.indexOf(s);
      sum.won += mine >= 0 ? 1 : 0;
      sum.tsumo += mine >= 0 && r.tsumo ? 1 : 0;
      sum.tai += mine >= 0 ? r.tai[mine] : 0;
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
  // 每邊的指標：胡牌率、放槍率、每局得失（台）、自摸占胡牌的比例、胡牌時平均台數
  const side = (k) => ({
    won: rate(k, 'won'),
    dealIn: rate(k, 'dealIn'),
    delta: total(k, 'delta') / Math.max(1, games),
    tsumoShare: total(k, 'tsumo') / Math.max(1, total(k, 'won')),
    avgTai: total(k, 'tai') / Math.max(1, total(k, 'won')),
  });
  return {
    deals: n,
    games,
    mean,
    se: sd / Math.sqrt(n),
    a: side('a'),
    b: side('b'),
  };
}

module.exports = { BASE, OPPONENTS, ENVS, POOLS, envOf, strategy, play, playOut, settle, duel, summarize };
