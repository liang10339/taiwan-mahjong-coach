// 牌面 SVG（src/ui/tiles.js）：八條的排列與顏色、每張牌都畫得出來。
const assert = require('node:assert/strict');
const T = require('../src/ui/tiles.js');

const svg = T.svg(25);
assert.equal((svg.match(/data-eight-row/g) || []).length, 2);
assert.equal((svg.match(/transform="rotate/g) || []).length, 8);
assert.match(svg, /#1d2b4f/);
assert.match(svg, /#1b7a47/);
for (let t = 0; t < 42; t++) assert.ok(!T.svg(t).includes('NaN'));
console.log('PASS: eight-bamboo structure and every tile renders.');
