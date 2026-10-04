// 教練評估矩陣：每一種桌規 × 每一種對手池各跑一格公平對照（照教練打 vs 只看效率），彙總成一張表。
// 目的是回答「教練的優勢在什麼條件下成立」：只對自己校準用的電腦有效，還是對不會防守、會亂吃碰的朋友也有效。
//
// 用法：
//   node scripts/evaluate-matrix.cjs 1500 --dir eval-results/m1            跑（可中斷，再下同一個指令會接續）
//   node scripts/evaluate-matrix.cjs 0 --dir eval-results/m1 --report docs/EVALUATION.md   只讀結果並寫報告
// 選項：--start 起始種子（預設 20000，和校準、守門測試的種子範圍不重疊）、--envs a,b、--pools a,b、--budget 每格最多秒數
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function args(argv) {
  const out = { deals: 1500, start: 20000, dir: 'eval-results/matrix', budget: 1e9 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(\w+)$/.exec(argv[i]);
    if (m) out[m[1]] = argv[++i];
    else rest.push(argv[i]);
  }
  if (rest.length) out.deals = Number(rest[0]);
  out.start = Number(out.start);
  out.budget = Number(out.budget);
  return out;
}

function main() {
  const Arena = require('./lib/arena.cjs');
  const opt = args(process.argv.slice(2));
  const envs = opt.envs ? opt.envs.split(',') : Object.keys(Arena.ENVS),
    pools = opt.pools ? opt.pools.split(',') : Object.keys(Arena.POOLS);
  fs.mkdirSync(opt.dir, { recursive: true });
  const cells = [];
  for (const env of envs)
    for (const pool of pools) {
      const file = path.join(opt.dir, env + '-' + pool + '.jsonl');
      if (opt.deals > 0) {
        const r = spawnSync(
          process.execPath,
          [
            path.join(__dirname, 'evaluate-coach.cjs'),
            String(opt.deals),
            '--env',
            env,
            '--pool',
            pool,
            '--start',
            String(opt.start),
            '--out',
            file,
            '--budget',
            String(opt.budget),
          ],
          { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
        );
        if (r.status !== 0) throw Error('評估失敗：' + env + ' × ' + pool);
        console.log(env + ' × ' + pool + '：' + r.stdout.trim().split('\n').slice(-3, -1).join(' ｜ '));
      }
      if (!fs.existsSync(file)) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      const rows = lines.slice(1).map((l) => JSON.parse(l));
      if (rows.length)
        cells.push({ env, pool, code: JSON.parse(lines[0]).config.code, ...Arena.summarize(rows) });
    }
  const text = table(cells, Arena);
  console.log('\n' + text);
  if (opt.report) fs.writeFileSync(opt.report, report(cells, text, opt, Arena));
}

const pct = (x) => (x * 100).toFixed(1) + '%';
const sign = (x) => (x >= 0 ? '+' : '') + x.toFixed(3);
const verdict = (c) =>
  Math.abs(c.mean) > 2 * c.se ? (c.mean > 0 ? '教練較好' : '只看效率較好') : '在誤差內';

function table(cells, Arena) {
  const head =
    '| 桌規 | 對手 | 局數 | 教練 胡／放槍／得失 | 只看效率 胡／放槍／得失 | 每局差（台） | 判讀 |\n|---|---|---|---|---|---|---|';
  const rows = cells.map(
    (c) =>
      `| ${c.env} | ${c.pool}（${Arena.POOLS[c.pool].join('、')}） | ${c.games} | ${pct(c.a.won)}／${pct(c.a.dealIn)}／${sign(c.a.delta)} | ${pct(c.b.won)}／${pct(c.b.dealIn)}／${sign(c.b.delta)} | ${sign(c.mean)} ± ${c.se.toFixed(3)} | ${verdict(c)} |`,
  );
  return [head, ...rows].join('\n');
}

function report(cells, text, opt, Arena) {
  const codes = [...new Set(cells.map((c) => c.code))].join('、');
  const envLines = Object.entries(Arena.ENVS).map(([k, e]) => `- \`${k}\`：${e.label}`);
  const poolLines = Object.entries(Arena.POOLS).map(([k, p]) => `- \`${k}\`：${p.join('、')}`);
  return `# 教練評估矩陣

每一格是同一批牌的公平對照：「照教練打」輪流坐四個座位，各和「只看牌效率」比，其餘三家是該格的對手。
得失單位是台（含底，已換算；結算與 App 相同：莊家、連莊、自摸、一炮多響）。每局差的標準誤是以「副牌」為單位算的，
差距沒有超過兩個標準誤就不能說誰比較好。重跑：\`node scripts/evaluate-matrix.cjs ${opt.deals} --dir eval-results/matrix\`。

- 程式版本指紋：${codes}；種子從 ${opt.start + 1} 起，每格 ${opt.deals} 副牌（${opt.deals * 4} 局）。

## 結果

${text}

## 桌規

${envLines.join('\n')}

## 對手

${poolLines.join('\n')}

校準用的是 \`bots\` 那批電腦，所以那一格會比較樂觀；\`casual\`、\`mixed\` 是校準時沒見過的對手，更接近真人朋友桌。
\`noisy\`、\`caller\`（見 \`scripts/lib/humans.cjs\`）只用在評估：前者 15% 的手打出次佳牌，後者能吃碰就拿，兩者都不防守。
`;
}

main();
