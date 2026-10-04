// 載入順序就是依賴：核心檔案 require 的檔案，必須比它早出現在 index.html；
// 離線快取清單（sw.js）也要和 index.html 完全一致（由 npm run sync 產生）。
const assert = require('node:assert/strict');
const path = require('node:path');
const { read, pageScripts } = require('./helpers.cjs');
const { filesBlock } = require('../scripts/sync-assets.cjs');

const scripts = pageScripts();
const order = new Map(scripts.map((f, i) => [f, i]));

// 1. 每個檔案 require('./x.js') 的 x.js，如果也在頁面上，就要排在它前面
let checked = 0;
for (const file of scripts) {
  const src = read(file);
  for (const m of src.matchAll(/require\('(\.[^']+)'\)/g)) {
    const dep = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
    if (!order.has(dep)) continue;
    assert.ok(order.get(dep) < order.get(file), `${file} 需要 ${dep}，但 index.html 把它排在後面`);
    checked++;
  }
}
assert.ok(checked > 20, '應該檢查到相當多的依賴關係，實際 ' + checked);

// 2. sw.js 的 FILES 就是 index.html 產生的那一份（不一致請執行 npm run sync）
const sw = read('sw.js');
const block = sw.match(/const FILES = \[\n([\s\S]*?)\n\];/)[1];
assert.equal(
  block,
  filesBlock(read('index.html')),
  'sw.js 的 FILES 與 index.html 不一致，請執行 npm run sync',
);

console.log('PASS: 載入順序符合依賴（' + checked + ' 組），離線快取清單與 index.html 一致。');
