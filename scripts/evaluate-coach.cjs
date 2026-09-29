// 驗證教練的建議實際打起來如何：同一副牌，0 號位「照教練打」與「只看牌效率（中級電腦）」各打一次，
// 其他三家都是同樣的電腦。比較胡牌率、放槍率與平均得失（台，含底）。
// 用法：node scripts/evaluate-coach.cjs [局數，預設 300]
'use strict';
const E = require('../src/core/engine.js');
const AI = require('../src/core/ai.js');
const A = require('../src/core/advisor.js');
const Scoring = require('../src/core/scoring.js');

const BASE = 2.5; // 底換算成台（50 底 20 台）
// 實驗用：VARIANT=eff（只照牌效率＋口訣）、nohold（不踩吃碰煞車）、full（完整教練）
const P = require('../src/core/policy.js');
const VARIANT = process.env.VARIANT || 'full';
if (VARIANT === 'eff') {
  const choose = P.choose;
  P.choose = (input) => {
    const r = choose(input);
    return { ...r, option: input.efficiency, chosen: r.efficiency, stance: 'build' };
  };
  P.holdBackClaim = () => false;
}
if (VARIANT === 'nohold') P.holdBackClaim = () => false;

function play(seed, useCoach) {
  const g = E.create(seed * 104729, { reserve: 16, passWater: true, dealer: seed % 4 });
  const levels = ['normal', 'normal', 'hard', 'normal'];
  const stances = {};
  let steps = 0;
  while (g.phase !== 'ended' && steps++ < 500) {
    const p = g.turn;
    if (useCoach && p === 0 && g.phase === 'discard' && !E.winning(g.hands[0], g.melds[0].length)) {
      const kan = AI.chooseKan(g, 0, 'normal');
      if (kan && E.selfKan(g, 0, kan)) continue;
      const d = A.decide(g, 0, { base: BASE });
      stances[d.stance] = (stances[d.stance] || 0) + 1;
      const f = g.fresh;
      E.discard(
        g,
        0,
        f && f.player === 0 && f.tile === d.tile ? g.hands[0].length - 1 : g.hands[0].indexOf(d.tile),
      );
    } else AI.act(g, p, p === 0 ? 'normal' : levels[p]);
    if (g.phase === 'claim')
      for (let q = 0; q < 4 && g.phase === 'claim'; q++)
        if (!g.pending.decisions[q]) {
          if (q === 0 && useCoach) {
            const c = A.claims(g, 0, { base: BASE });
            E.respond(g, 0, c.best ? c.best.action : { type: 'pass' });
          } else E.respond(g, q, AI.chooseClaim(g, q, q === 0 ? 'normal' : levels[q]));
        }
  }
  const w = [...g.log].reverse().find((e) => ['ron', 'tsumo'].includes(e.action));
  let delta = 0,
    dealIn = false,
    won = false;
  if (w) {
    const tai = Scoring.score(g, w.player).total + BASE;
    if (w.player === 0) {
      won = true;
      delta = w.action === 'tsumo' ? 3 * tai : tai;
    } else if (w.action === 'tsumo') delta = -tai;
    else if (w.from === 0) {
      dealIn = true;
      delta = -tai;
    }
  }
  return { won, dealIn, delta, stances };
}

const n = Number(process.argv[2]) || 300;
const sum = { coach: { won: 0, dealIn: 0, delta: 0, stances: {} }, plain: { won: 0, dealIn: 0, delta: 0 } };
const start = Number(process.env.START) || 0;
for (let seed = start + 1; seed <= start + n; seed++) {
  for (const [key, use] of [
    ['coach', true],
    ['plain', false],
  ]) {
    const r = play(seed, use);
    sum[key].won += r.won;
    sum[key].dealIn += r.dealIn;
    sum[key].delta += r.delta;
    if (use)
      for (const [k, v] of Object.entries(r.stances)) sum.coach.stances[k] = (sum.coach.stances[k] || 0) + v;
  }
}
const pct = (x) => ((x / n) * 100).toFixed(1) + '%';
console.log('變體', VARIANT, '局數', n);
for (const k of ['coach', 'plain'])
  console.log(
    k === 'coach' ? '照教練打' : '只看效率',
    '胡牌',
    pct(sum[k].won),
    '放槍',
    pct(sum[k].dealIn),
    '平均每局',
    (sum[k].delta / n).toFixed(2),
    '台',
  );
console.log('局勢分布', sum.coach.stances);
