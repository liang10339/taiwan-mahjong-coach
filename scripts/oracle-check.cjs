// 檢查離線標準答案的盲點：猜牌是均勻的，沒有用對手的行為推測手牌，可能低估「這張牌馬上放槍」的機率。
// 對評分用過的局面（教練和只看效率選擇不同的那些），比較兩個數字：
//   真實放槍率：用局面裡對手真正的手牌，看這張牌打出去有沒有人能胡
//   猜牌放槍率：標準答案隨機猜 200 次，這張牌打出去有幾成猜得出有人能胡
// 並把評分結果依「教練的選擇是不是比較安全」拆開：教練比較安全的局面，標準答案是否特別不喜歡？
// 用法：node scripts/oracle-check.cjs eval-results/g1.jsonl [--start 60000]
'use strict';
const fs = require('node:fs');
const E = require('../src/core/engine.js');
const AI = require('../src/core/ai.js');
const Advisor = require('../src/core/advisor.js');
const Observation = require('../src/core/observation.js');
const Oracle = require('./lib/oracle.cjs');
const Positions = require('./lib/positions.cjs');
const Arena = require('./lib/arena.cjs');

const file = process.argv[2],
  start = Number(
    process.argv.includes('--start') ? process.argv[process.argv.indexOf('--start') + 1] : 60000,
  );
const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(1);
const rowsById = new Map();
let maxSeed = start;
for (const l of lines) {
  const r = JSON.parse(l);
  maxSeed = Math.max(maxSeed, r.seed);
  for (const row of r.rows) rowsById.set(row.id, row);
}
const env = Arena.envOf(Positions.DEFAULTS.env);
const wins = (g, q, tile) => E.winning([...g.hands[q], tile], g.melds[q].length, g.rules);
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const se = (a) => {
  const m = mean(a);
  return a.length > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length) : NaN;
};

const out = [];
for (let seed = start + 1; seed <= maxSeed; seed++) {
  for (const pos of Positions.positionsOf(seed)) {
    const row = rowsById.get(pos.id);
    if (!row || row.diff === undefined) continue;
    const g = pos.game,
      p = Positions.SEAT,
      view = Observation.forPlayer(g, p);
    const real = (t) => ([1, 2, 3].some((q) => wins(g, q, t)) ? 1 : 0);
    let guessCoach = 0,
      guessEff = 0,
      n = 200;
    try {
      for (let k = 0; k < n; k++) {
        const d = Oracle.determinize(view, p, Oracle.rng(seed * 100003 + k), g.rules);
        guessCoach += [1, 2, 3].some((q) => wins(d, q, row.coach)) ? 1 : 0;
        guessEff += [1, 2, 3].some((q) => wins(d, q, row.eff)) ? 1 : 0;
      }
    } catch {
      continue;
    }
    // 教練的選擇是不是比較安全（教練自己估的放槍機率差 2 個百分點以上）
    const plan = Advisor.decide(g, p, { base: env.base }).plan.rows;
    const dealIn = (t) => (plan.find((r) => r.tile === t) || { dealIn: NaN }).dealIn;
    out.push({
      left: row.left,
      diff: row.diff,
      realCoach: real(row.coach),
      realEff: real(row.eff),
      guessCoach: guessCoach / n,
      guessEff: guessEff / n,
      saferBy: dealIn(row.eff) - dealIn(row.coach),
    });
  }
}

const pct = (x) => (x * 100).toFixed(2) + '%';
function show(name, rs) {
  if (!rs.length) return;
  console.log(
    name.padEnd(14),
    `局面 ${String(rs.length).padStart(4)}`,
    `｜真實放槍率 教練 ${pct(mean(rs.map((r) => r.realCoach)))} 效率 ${pct(mean(rs.map((r) => r.realEff)))}`,
    `｜猜牌放槍率 教練 ${pct(mean(rs.map((r) => r.guessCoach)))} 效率 ${pct(mean(rs.map((r) => r.guessEff)))}`,
    `｜標準答案給教練 ${mean(rs.map((r) => r.diff)).toFixed(3)} ± ${se(rs.map((r) => r.diff)).toFixed(3)} 台`,
  );
}
show('全部', out);
show(
  '中盤 35–59',
  out.filter((r) => r.left >= 35 && r.left < 60),
);
show(
  '末盤 <35',
  out.filter((r) => r.left < 35),
);
console.log('— 依教練的選擇是不是比較安全（教練估的放槍機率比效率首選低幾個百分點）—');
show(
  '教練明顯較安全',
  out.filter((r) => r.saferBy >= 0.02),
);
show(
  '差不多',
  out.filter((r) => r.saferBy < 0.02 && r.saferBy > -0.02),
);
show(
  '教練較不安全',
  out.filter((r) => r.saferBy <= -0.02),
);
