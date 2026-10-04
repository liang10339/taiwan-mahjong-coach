// 用離線標準答案（猜牌後模擬）給教練的出牌打分：
// 在很多真實會遇到的局面裡，教練的選擇和「只看牌效率」不同時，模擬哪一個平均得失比較高。
// 比的是同一批猜牌下兩個選擇的配對差（不取「最佳牌」，避免挑最大值造成的高估），再對局面取平均。
// 標準答案的限制見 scripts/lib/oracle.cjs：進攻、台數的判斷比較可信，防守偏弱。
//
// 用法：
//   node scripts/grade-coach.cjs 300 --out eval-results/g1.jsonl            300 局（每局挑 3 個局面）
//   node scripts/grade-coach.cjs 0 --out eval-results/g1.jsonl             只讀結果、印彙總
// 選項：--start 起始種子（預設 60000）、--n 每個選擇的猜牌次數（預設 200）、--workers、--budget 秒數（到了就先停，可接續）
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');

function args(argv) {
  const out = { games: 300, start: 60000, n: 200, workers: os.cpus().length, budget: Infinity };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(\w+)$/.exec(argv[i]);
    if (m) out[m[1]] = argv[++i];
    else rest.push(argv[i]);
  }
  if (rest.length) out.games = Number(rest[0]);
  for (const k of ['start', 'n', 'workers', 'budget']) out[k] = Number(out[k]);
  return out;
}

/** 決策與模擬相關程式的指紋：程式改過就不能接續舊檔案 */
function codePrint() {
  const hash = crypto.createHash('sha1');
  const dirs = [path.join(__dirname, '../src/core'), path.join(__dirname, 'lib')];
  const files = dirs.flatMap((d) =>
    fs
      .readdirSync(d)
      .filter((f) => f.endsWith('.js') || f.endsWith('.cjs'))
      .map((f) => path.join(d, f)),
  );
  files.push(path.join(__dirname, '../src/core/data/calibration.js'));
  for (const f of files.sort()) hash.update(fs.readFileSync(f));
  return hash.digest('hex').slice(0, 10);
}

// ---- 子行程：每收到一個種子，打出那局、評估被挑中的局面 ----
if (process.argv[2] === '--worker') {
  const E = require('../src/core/engine.js');
  const AI = require('../src/core/ai.js');
  const Advisor = require('../src/core/advisor.js');
  const Positions = require('./lib/positions.cjs');
  const Oracle = require('./lib/oracle.cjs');
  const Arena = require('./lib/arena.cjs');
  const cfg = JSON.parse(process.argv[3]);
  const env = Arena.envOf(Positions.DEFAULTS.env);
  process.on('message', (seed) => {
    if (seed === 'stop') process.exit(0);
    const rows = [];
    for (const pos of Positions.positionsOf(seed)) {
      const g = pos.game,
        left = g.wall.length - g.reserve,
        open = g.melds[Positions.SEAT].length;
      const coach = Advisor.decide(g, Positions.SEAT, { base: env.base }).tile,
        eff = AI.chooseDiscard(g, Positions.SEAT, 'normal');
      const row = { id: pos.id, left, open, coach, eff };
      if (coach !== eff) {
        // 對手有暗槓等猜不了牌的局面略過（記下原因，彙總時另外列出）
        try {
          const r = Oracle.evaluate(g, Positions.SEAT, [coach, eff], {
            n: cfg.n,
            seed: seed * 31 + pos.k,
            env,
          });
          row.evCoach = r[0].ev;
          row.evEff = r[1].ev;
          row.diff = r[0].ev - r[1].ev;
          row.se = Math.max(r[0].diffSe, r[1].diffSe);
        } catch (e) {
          row.skipped = String(e.message);
        }
      }
      rows.push(row);
    }
    process.send({ seed, rows });
    process.send('ready');
  });
  process.send('ready');
} else main();

function main() {
  const opt = args(process.argv.slice(2));
  const cfg = { n: opt.n, code: codePrint() };
  const done = new Map();
  if (opt.out && fs.existsSync(opt.out)) {
    const lines = fs.readFileSync(opt.out, 'utf8').split('\n').filter(Boolean);
    if (JSON.stringify(JSON.parse(lines[0]).config) !== JSON.stringify(cfg))
      throw Error('檔案裡的設定或程式版本和這次不同，請換一個 --out');
    for (const l of lines.slice(1)) {
      const r = JSON.parse(l);
      done.set(r.seed, r);
    }
  } else if (opt.out) {
    fs.mkdirSync(path.dirname(opt.out), { recursive: true });
    fs.writeFileSync(opt.out, JSON.stringify({ config: cfg }) + '\n');
  }
  const todo = [];
  for (let s = opt.start + 1; s <= opt.start + opt.games; s++) if (!done.has(s)) todo.push(s);
  const began = Date.now();
  const finish = () =>
    report(
      [...done.values()].flatMap((r) => r.rows),
      cfg,
      todo.length === 0,
    );
  if (!todo.length) return finish();
  let running = Math.min(opt.workers, todo.length);
  for (let w = 0, k = running; w < k; w++) {
    const child = fork(__filename, ['--worker', JSON.stringify(cfg)]);
    child.on('message', (msg) => {
      if (msg !== 'ready') {
        done.set(msg.seed, msg);
        if (opt.out) fs.appendFileSync(opt.out, JSON.stringify(msg) + '\n');
        return;
      }
      if (todo.length && (Date.now() - began) / 1000 <= opt.budget) child.send(todo.shift());
      else {
        child.send('stop');
        if (--running === 0) finish();
      }
    });
  }
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const se = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length);
};
const f = (x) => (x >= 0 ? '+' : '') + x.toFixed(3);

/** 彙總：不同的局面佔幾成、教練的選擇平均比只看效率多幾台（沒有不同的局面算 0） */
function summarize(rows) {
  rows = rows.filter((r) => !r.skipped);
  const diffs = rows.map((r) => (r.diff === undefined ? 0 : r.diff)),
    differ = rows.filter((r) => r.diff !== undefined);
  return {
    positions: rows.length,
    differ: differ.length,
    share: differ.length / Math.max(1, rows.length),
    all: mean(diffs),
    allSe: se(diffs),
    only: mean(differ.map((r) => r.diff)),
    onlySe: se(differ.map((r) => r.diff)),
    better: differ.filter((r) => r.diff > 0).length,
  };
}

function report(rows, cfg, complete) {
  const skipped = rows.filter((r) => r.skipped).length;
  rows = rows.filter((r) => !r.skipped);
  const line = (name, rs) => {
    const s = summarize(rs);
    console.log(
      name.padEnd(10),
      `局面 ${String(s.positions).padStart(5)}`,
      `教練選擇不同 ${(s.share * 100).toFixed(1)}%（${s.differ}）`,
      `｜不同的局面平均 ${f(s.only)} ± ${s.onlySe.toFixed(3)} 台（教練較高 ${s.better}/${s.differ}）`,
      `｜全部局面平均 ${f(s.all)} ± ${s.allSe.toFixed(3)} 台`,
    );
  };
  console.log('設定', JSON.stringify(cfg), complete ? '' : '（還沒跑完，再下同一個指令會接著跑）');
  if (skipped) console.log('略過（猜不了牌，例如對手有暗槓）', skipped, '個局面');
  line('全部', rows);
  line(
    '早盤 ≥60',
    rows.filter((r) => r.left >= 60),
  );
  line(
    '中盤 35–59',
    rows.filter((r) => r.left >= 35 && r.left < 60),
  );
  line(
    '末盤 <35',
    rows.filter((r) => r.left < 35),
  );
  line(
    '門清',
    rows.filter((r) => r.open === 0),
  );
  line(
    '有攤牌',
    rows.filter((r) => r.open > 0),
  );
}
