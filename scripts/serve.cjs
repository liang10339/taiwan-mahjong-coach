// 本機開發用的靜態伺服器（Service Worker 需要 http:// 才能運作）。
// 用法：npm start，然後開啟 http://localhost:4176
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 4176;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    const target = url.pathname.endsWith('/') ? path.join(file, 'index.html') : file;
    if (!target.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(port, () => console.log(`牌桌教練：http://localhost:${port}`));
