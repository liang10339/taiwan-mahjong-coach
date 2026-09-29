// 改版時更新快取版本：sw.js 的 VERSION 加 1，index.html 所有 ?v= 參數同步更新。
// 用法：npm run bump
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const swPath = path.join(root, 'sw.js');
const htmlPath = path.join(root, 'index.html');
const sw = fs.readFileSync(swPath, 'utf8');
const current = Number(sw.match(/const VERSION = (\d+);/)[1]);
const next = current + 1;
fs.writeFileSync(swPath, sw.replace(`const VERSION = ${current};`, `const VERSION = ${next};`));
const html = fs.readFileSync(htmlPath, 'utf8').replace(/\?v=\d+/g, `?v=${next}`);
fs.writeFileSync(htmlPath, html);
console.log(`快取版本 ${current} → ${next}`);
