// 平行執行 tests/*.test.cjs：每個測試檔在獨立的 Node 程序裡跑，最後列出結果。
// 用法：npm test            （全部）
//       npm test -- scoring  （檔名包含 scoring 的測試）
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const filter = process.argv[2] || '';
const files = fs
  .readdirSync(path.join(root, 'tests'))
  .filter((f) => f.endsWith('.test.cjs') && f.includes(filter))
  .sort();
const limit = Math.max(2, os.cpus().length);

function run(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join('tests', file)], { cwd: root });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => resolve({ file, code, output, ms: Date.now() - started }));
  });
}

(async () => {
  const queue = files.slice();
  const results = [];
  const worker = async () => {
    while (queue.length) results.push(await run(queue.shift()));
  };
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(limit, files.length) }, worker));
  results.sort((a, b) => a.file.localeCompare(b.file));
  for (const r of results) {
    console.log(`${r.code === 0 ? 'ok  ' : 'FAIL'} ${r.file.padEnd(28)} ${(r.ms / 1000).toFixed(1)}s`);
    if (r.code !== 0) console.log(r.output.replace(/^/gm, '     '));
  }
  const failed = results.filter((r) => r.code !== 0).length;
  console.log(
    `\n${results.length - failed}/${results.length} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  process.exit(failed ? 1 : 0);
})();
