// 檢查 index.html、sw.js 與實際檔案一致：新增或改名檔案時，忘了更新離線快取清單會在這裡失敗。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read, pageScripts, pageStyles } = require('./helpers.cjs');

const sw = read('sw.js');
const version = Number(sw.match(/const VERSION = (\d+);/)[1]);
const cached = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
const html = read('index.html');

// 1. index.html 載入的每個本機檔案都存在，而且在離線快取清單裡
for (const file of [...pageScripts(), ...pageStyles()]) {
  assert.ok(fs.existsSync(path.join(ROOT, file)), 'index.html 載入的檔案不存在：' + file);
  assert.ok(cached.includes(file), 'sw.js 的 FILES 漏了：' + file);
}
// 2. 離線快取清單裡的檔案都存在
for (const file of cached) assert.ok(fs.existsSync(path.join(ROOT, file)), 'sw.js 列了不存在的檔案：' + file);
// 3. 所有 ?v= 版本參數和 sw.js 的 VERSION 相同
const versions = new Set([...html.matchAll(/\?v=(\d+)/g)].map((m) => Number(m[1])));
assert.deepEqual(
  [...versions],
  [version],
  'index.html 的 ?v= 應全部等於 sw.js 的 VERSION（執行 npm run bump）',
);
// 4. manifest 的圖示都存在
const manifest = JSON.parse(read('manifest.webmanifest'));
for (const icon of manifest.icons || [])
  assert.ok(fs.existsSync(path.join(ROOT, icon.src)), '圖示不存在：' + icon.src);

console.log('PASS: index.html、sw.js 快取清單、版本號與圖示一致（' + cached.length + ' 個檔案）。');
