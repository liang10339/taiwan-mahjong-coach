// 測試共用工具：依 index.html 的 <script> 順序載入介面程式，讓測試和瀏覽器載入完全相同的檔案。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

/** 讀取專案內的檔案（路徑相對於專案根目錄） */
function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/** index.html 依序載入的腳本（去掉 ?v= 版本參數） */
function pageScripts() {
  const html = read('index.html');
  return [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]);
}

/** index.html 載入的樣式表（只算本機檔案） */
function pageStyles() {
  const html = read('index.html');
  return [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"?]+)(?:\?[^"]*)?"/g)]
    .map((m) => m[1])
    .filter((href) => !/^https?:/.test(href));
}

/**
 * 把牌面與實戰介面（src/ui/tiles.js 與 src/ui/app/*.js）載入 vm context。
 * 核心邏輯（Mahjong、Coach…）與音效由各測試自行放進 context，方便替換成測試替身。
 */
function loadApp(context) {
  const files = pageScripts().filter((f) => f === 'src/ui/tiles.js' || f.startsWith('src/ui/app/'));
  for (const file of files) vm.runInContext(read(file), context, { filename: file });
  return files;
}

module.exports = { ROOT, read, pageScripts, pageStyles, loadApp };
