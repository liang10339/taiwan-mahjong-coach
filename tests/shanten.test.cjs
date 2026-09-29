// 進聽數（shanten）改成逐門快取後，結果必須和原本逐張搜尋的版本完全相同。
// referenceShanten 是改寫前的原始實作，保留在這裡當作對照。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');

const countsOf = (hand) => {
  const c = Array(34).fill(0);
  for (const t of hand) c[t]++;
  return c;
};
function referenceShanten(hand, open = 0) {
  const c = countsOf(hand);
  let best = 10;
  const seen = new Set();
  function visit(m, t, p) {
    const key = c.join('') + ':' + m + ',' + t + ',' + p;
    if (seen.has(key)) return;
    seen.add(key);
    const i = c.findIndex((n) => n > 0);
    if (i < 0) {
      best = Math.min(best, 10 - 2 * m - Math.min(t, 5 - m) - p);
      return;
    }
    if (m < 5 && c[i] >= 3) {
      c[i] -= 3;
      visit(m + 1, t, p);
      c[i] += 3;
    }
    if (m < 5 && i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      visit(m + 1, t, p);
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!p) visit(m, t, 1);
      if (t < 5) visit(m, t + 1, p);
      c[i] += 2;
    }
    if (t < 5 && i < 27)
      for (const d of [1, 2])
        if ((i % 9) + d < 9 && c[i + d]) {
          c[i]--;
          c[i + d]--;
          visit(m, t + 1, p);
          c[i]++;
          c[i + d]++;
        }
    c[i]--;
    visit(m, t, p);
    c[i]++;
  }
  visit(open, 0, 0);
  return best;
}
let seed = 12345;
const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const wall = () => {
  const w = [];
  for (let t = 0; t < 34; t++) for (let i = 0; i < 4; i++) w.push(t);
  for (let i = w.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [w[i], w[j]] = [w[j], w[i]];
  }
  return w;
};
let checked = 0;
// 1. 隨機手牌：各種張數與攤牌組數（17、16、14、13… 張，攤 0–5 組）
for (let k = 0; k < 4000; k++) {
  const open = k % 6,
    size = (k % 2 ? 16 : 17) - 3 * open,
    hand = wall().slice(0, Math.max(1, size));
  assert.equal(E.shanten(hand, open), referenceShanten(hand, open), JSON.stringify({ hand, open }));
  checked++;
}
// 2. 單一花色集中的手牌（最容易出現大量拆法，例如清一色）
for (let k = 0; k < 1500; k++) {
  const suit = (k % 3) * 9,
    pool = [];
  for (let t = suit; t < suit + 9; t++) for (let i = 0; i < 4; i++) pool.push(t);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const hand = pool.slice(0, 16 + (k % 2));
  assert.equal(E.shanten(hand), referenceShanten(hand), JSON.stringify(hand));
  checked++;
}
// 3. 接近胡牌的手牌：五組加一對再拿掉或換掉幾張
for (let k = 0; k < 1500; k++) {
  const hand = [];
  for (let g = 0; g < 5; g++) {
    const base = Math.floor(rand() * 3) * 9 + Math.floor(rand() * 7);
    if (rand() < 0.5) hand.push(base, base + 1, base + 2);
    else hand.push(base, base, base);
  }
  const pair = Math.floor(rand() * 34);
  hand.push(pair, pair);
  if (countsOf(hand).some((n) => n > 4)) continue;
  const cut = hand.slice(0, 17 - (k % 3));
  assert.equal(E.shanten(cut), referenceShanten(cut), JSON.stringify(cut));
  checked++;
}
// 4. 速度：新版要明顯比原版快
const sample = Array.from({ length: 1500 }, () => wall().slice(0, 17));
let t = Date.now();
sample.forEach((h) => referenceShanten(h));
const before = Date.now() - t;
t = Date.now();
sample.forEach((h) => E.shanten(h));
const after = Date.now() - t;
assert.ok(after * 3 < before, '新版應該快很多（原版 ' + before + 'ms，新版 ' + after + 'ms）');
console.log(
  'PASS: ' +
    checked +
    ' 手牌的進聽數與原始實作完全相同；1500 手：原版 ' +
    before +
    'ms → 新版 ' +
    after +
    'ms。',
);
