// 驗證教練的建議實際打起來如何（公平對照）：
// 同一副牌，「照教練打」輪流坐四個座位，每個座位再用「只看牌效率（中級電腦）」打一次；其他三家是固定的電腦。
// 比較胡牌率、放槍率與平均得失（台，含底），並算出每副牌差值的標準誤。
//
// 用法：
//   node scripts/evaluate-coach.cjs 200                         跑 200 副牌（每副 8 局），依 CPU 數平行
//   node scripts/evaluate-coach.cjs 4000 --out eval-results/x.jsonl --budget 500
//        結果逐副寫進檔案；500 秒到了就先停，再下同一個指令會從沒跑過的牌接著跑（適合有時間限制的環境）
//   node scripts/evaluate-coach.cjs 0 --out eval-results/x.jsonl  只讀檔案、印出目前的彙總
//   node scripts/evaluate-coach.cjs 0 --out eval-results/new.jsonl --compare eval-results/old.jsonl
//        比較兩個版本的教練：同一副牌的基準局完全相同，所以直接逐副相減，誤差比各自和基準比還小
// 其他選項：--start 起始種子（預設 0，跑 start+1 … start+局數）、--workers 平行數、
//           --a / --b 比較的兩種打法（預設 coach 對 normal）、--margin 教練改打非效率首選要多幾台、
//           --future 之後幾巡放槍代價的權重（實驗用，預設 1）、
//           --opponents 另外三家（依下家、對家、上家），例如 fast,fast,fast（預設 normal,hard,normal）
// 實驗用環境變數：VARIANT=eff（教練只照牌效率＋口訣）、nohold（不踩吃碰煞車）
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');

function args(argv) {
  const out = { deals: 200, start: 0, workers: os.cpus().length, a: 'coach', b: 'normal', budget: Infinity };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(\w+)$/.exec(argv[i]);
    if (m) out[m[1]] = argv[++i];
    else rest.push(argv[i]);
  }
  if (rest.length) out.deals = Number(rest[0]);
  for (const k of ['start', 'workers', 'budget']) out[k] = Number(out[k]);
  if (out.margin !== undefined) out.margin = Number(out.margin);
  if (out.future !== undefined) out.future = Number(out.future);
  if (out.opponents !== undefined) out.opponents = String(out.opponents).split(',');
  return out;
}

/** 教練的實驗變體（只影響「照教練打」的座位，電腦不經過 Policy） */
function applyVariant(variant) {
  const P = require('../src/core/policy.js');
  if (variant === 'eff') {
    const choose = P.choose;
    P.choose = (input) => {
      const r = choose(input);
      return { ...r, option: input.efficiency, chosen: r.efficiency, stance: 'build' };
    };
    P.holdBackClaim = () => false;
  }
  if (variant === 'nohold') P.holdBackClaim = () => false;
}

// ---- 子行程：收到一段種子就逐副打完，每副回報一次 ----
if (process.argv[2] === '--worker') {
  const Arena = require('./lib/arena.cjs');
  const cfg = JSON.parse(process.argv[3]);
  applyVariant(cfg.variant);
  process.on('message', (seeds) => {
    if (seeds === 'stop') process.exit(0);
    for (const seed of seeds)
      process.send(
        Arena.duel(seed, cfg.a, cfg.b, { margin: cfg.margin, future: cfg.future, opponents: cfg.opponents }),
      );
    process.send('ready');
  });
  process.send('ready');
} else main();

/** 決策相關程式碼的指紋：程式改過就不能接續舊檔案，避免把兩個版本的結果混在一起 */
function codePrint() {
  const crypto = require('node:crypto');
  const hash = crypto.createHash('sha1');
  const core = path.join(__dirname, '../src/core');
  const files = [
    ...fs
      .readdirSync(core)
      .filter((f) => f.endsWith('.js'))
      .map((f) => path.join(core, f)),
    path.join(core, 'data/calibration.js'),
    path.join(__dirname, 'lib/arena.cjs'),
  ].sort();
  for (const f of files) hash.update(fs.readFileSync(f));
  return hash.digest('hex').slice(0, 10);
}

function main() {
  const Arena = require('./lib/arena.cjs');
  const opt = args(process.argv.slice(2));
  const cfg = {
    a: opt.a,
    b: opt.b,
    margin: opt.margin ?? null,
    ...(opt.future !== undefined ? { future: opt.future } : {}),
    ...(opt.opponents ? { opponents: opt.opponents } : {}),
    variant: process.env.VARIANT || 'full',
    code: codePrint(),
  };
  // 已經跑過的結果：同一個檔案只能接同一組設定，避免把不同實驗混在一起
  const rows = new Map();
  if (opt.out && fs.existsSync(opt.out)) {
    const lines = fs.readFileSync(opt.out, 'utf8').split('\n').filter(Boolean);
    const head = JSON.parse(lines[0] || '{}');
    if (JSON.stringify(head.config) !== JSON.stringify(cfg))
      throw Error('檔案裡的設定或程式版本和這次不同：' + JSON.stringify(head.config) + '，請換一個 --out');
    for (const line of lines.slice(1)) {
      const r = JSON.parse(line);
      rows.set(r.seed, r);
    }
  } else if (opt.out) {
    fs.mkdirSync(path.dirname(opt.out), { recursive: true });
    fs.writeFileSync(opt.out, JSON.stringify({ config: cfg }) + '\n');
  }
  const todo = [];
  for (let seed = opt.start + 1; seed <= opt.start + opt.deals; seed++) if (!rows.has(seed)) todo.push(seed);
  const began = Date.now();
  const finish = () => {
    report(Arena, [...rows.values()], cfg, todo.length === 0, (Date.now() - began) / 1000);
    if (opt.compare) compare(rows, opt.compare);
  };
  if (!todo.length) return finish();

  // 每次發 5 副牌給閒著的子行程；時間到了就不再發新的，已發出去的打完才結束
  const CHUNK = 5;
  let running = Math.min(opt.workers, Math.ceil(todo.length / CHUNK));
  for (let w = 0, n = running; w < n; w++) {
    const child = fork(__filename, ['--worker', JSON.stringify(cfg)]);
    child.on('message', (msg) => {
      if (msg !== 'ready') {
        rows.set(msg.seed, msg);
        if (opt.out) fs.appendFileSync(opt.out, JSON.stringify(msg) + '\n');
        return;
      }
      const overtime = (Date.now() - began) / 1000 > opt.budget;
      if (todo.length && !overtime) child.send(todo.splice(0, CHUNK));
      else {
        child.send('stop');
        if (--running === 0) finish();
      }
    });
  }
}

function report(Arena, rows, cfg, complete, seconds) {
  rows.sort((x, y) => x.seed - y.seed);
  const s = Arena.summarize(rows);
  const pct = (x) => (x * 100).toFixed(1) + '%';
  const name = (k) => (k === 'coach' ? '照教練打' : k === 'normal' ? '只看效率' : k);
  console.log(
    '設定',
    JSON.stringify(cfg),
    '｜',
    s.deals,
    '副牌 ×4 座位，共',
    s.games,
    '局對照',
    complete ? '' : '（還沒跑完，再下同一個指令會接著跑）',
    '｜',
    seconds.toFixed(0),
    '秒',
  );
  for (const [side, key] of [
    ['a', cfg.a],
    ['b', cfg.b],
  ])
    console.log(
      name(key).padEnd(6),
      '胡牌',
      pct(s[side].won),
      '放槍',
      pct(s[side].dealIn),
      '平均每局',
      s[side].delta.toFixed(3),
      '台',
    );
  // 差距小於約 2 個標準誤時，還不能說哪個比較好
  console.log(
    '每局差（' + name(cfg.a) + ' − ' + name(cfg.b) + '）',
    s.mean.toFixed(3),
    '台 ± 標準誤',
    s.se.toFixed(3),
    Math.abs(s.mean) > 2 * s.se ? '（差距超過兩個標準誤）' : '（在誤差範圍內）',
  );
}

/** 兩個版本逐副比較：只取兩邊都跑過的牌，差值＝這版每局差 − 另一版每局差 */
function compare(rows, file) {
  const other = new Map(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(1)
      .map((line) => JSON.parse(line))
      .map((r) => [r.seed, r]),
  );
  const avg = (r) => r.diffs.reduce((a, b) => a + b, 0) / r.diffs.length;
  const d = [...rows.values()].filter((r) => other.has(r.seed)).map((r) => avg(r) - avg(other.get(r.seed)));
  if (d.length < 2) return console.log('和', file, '共同的牌太少，無法比較');
  const mean = d.reduce((a, b) => a + b, 0) / d.length,
    se = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (d.length - 1) / d.length);
  console.log(
    '和',
    path.basename(file),
    '比（',
    d.length,
    '副共同的牌）：每局多',
    mean.toFixed(3),
    '台 ± 標準誤',
    se.toFixed(3),
    Math.abs(mean) > 2 * se ? '（差距超過兩個標準誤）' : '（在誤差範圍內）',
  );
}
