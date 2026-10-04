// 讓 sw.js 的離線快取清單跟著 index.html 走：index.html 是唯一要手動維護的檔案清單。
// 新增、改名或調整載入順序後執行 `npm run sync`（`npm run bump` 也會順便執行）。
// 清單 = 固定的幾個檔案（首頁、manifest、圖示）＋ index.html 載入的樣式表與腳本。
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const STATIC = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

function pageFiles(html) {
  const styles = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"?]+)(?:\?[^"]*)?"/g)]
    .map((m) => m[1])
    .filter((href) => !/^https?:/.test(href));
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]);
  return { styles, scripts };
}

/** 產生 sw.js 裡 FILES 陣列的內容（不含外框） */
function filesBlock(html) {
  const { styles, scripts } = pageFiles(html);
  return [...STATIC.map((f) => `  '${f}',`), ...[...styles, ...scripts].map((f) => `  './${f}' + v,`)].join(
    '\n',
  );
}

function sync() {
  const swPath = path.join(root, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const next = sw.replace(/(const FILES = \[\n)[\s\S]*?(\n\];)/, (_, a, b) => a + filesBlock(html) + b);
  if (next !== sw) fs.writeFileSync(swPath, next);
  return next !== sw;
}

if (require.main === module) console.log(sync() ? 'sw.js 的 FILES 已更新' : 'sw.js 的 FILES 已經是最新');
module.exports = { sync, filesBlock, pageFiles };
