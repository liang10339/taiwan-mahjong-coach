// 期望值模擬（src/core/value.js）與背景執行緒（src/workers/value-worker.js）。
const assert = require('node:assert/strict');
const vm = require('node:vm');
const E = require('../src/core/engine.js');
const V = require('../src/core/value.js');
const { read } = require('./helpers.cjs');

/** 建立輪到你出牌的局面 */
function position(hand) {
  const g = E.create(42);
  g.hands[0] = hand.slice();
  g.melds = [[], [], [], []];
  g.flowers = [[], [], [], []];
  g.rivers = [[], [], [], []];
  g.log = [
    { player: 1, action: 'discard', tile: 33 },
    { player: 0, action: 'draw', tile: hand.at(-1) },
  ];
  g.turn = 0;
  g.phase = 'discard';
  return g;
}

// 萬子很多（混一色方向）的手牌，以及一般手牌
const flush = [0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 4, 5, 31, 31, 12, 22];
const plain = [0, 1, 2, 9, 10, 11, 18, 19, 20, 3, 4, 13, 14, 23, 24, 27, 33];

// 1. 同一個種子結果完全相同；數值範圍合理；期望台數＝胡牌率×平均台數
const a = V.evaluate(position(plain), 0, { trials: 120, seed: 7 });
const b = V.evaluate(position(plain), 0, { trials: 120, seed: 7 });
assert.deepEqual(a, b, '同一個種子要得到同樣的模擬結果');
for (const o of a.options) {
  assert.ok(o.winRate >= 0 && o.winRate <= 1);
  assert.ok(o.tsumoRate <= o.winRate);
  assert.ok(Math.abs(o.expectedTai - o.winRate * o.avgTai) < 1e-9);
}
// 2. 候選打法包含牌效率最好的那張
const best = E.analyze(plain, E.publicTiles(position(plain), 0), 0)[0];
assert.ok(a.options.some((o) => o.tile === best.tile));
// 3. 模擬不會改到真正的牌局
const g = position(plain),
  before = JSON.stringify(g);
V.evaluate(g, 0, { trials: 30, seed: 1 });
assert.equal(JSON.stringify(g), before, '模擬不能改動牌局');
// 4. 兩張孤立字牌（東、白）效果相同：同一串亂數下結果要非常接近
const iso = V.evaluate(position(plain), 0, { trials: 200, seed: 3, tiles: [27, 33] }).options;
assert.ok(Math.abs(iso[0].winRate - iso[1].winRate) < 0.05, JSON.stringify(iso));
// 5. 保留一門花色（打孤筒）比拆萬子胡了平均更多台
const f = V.evaluate(position(flush), 0, { trials: 200, seed: 5, tiles: [12, 4] }).options;
const keep = f.find((o) => o.tile === 12),
  breakFlush = f.find((o) => o.tile === 4);
assert.ok(keep.avgTai > breakFlush.avgTai + 1, '保留混一色方向的平均台數要明顯較高');
// 6. 已聽牌的手一定有機會胡
const ready = [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27, 27, 31, 33];
const r = V.evaluate(position(ready), 0, { trials: 100, seed: 9, tiles: [33] }).options[0];
assert.ok(r.winRate > 0.2, '聽牌後胡牌率應該不低：' + r.winRate);
// 7. 別家先胡的機率隨巡目增加
assert.ok(V.othersWin(1) < V.othersWin(6) && V.othersWin(6) < V.othersWin(12));
assert.ok(V.othersWin(30) <= 1 - Math.pow(0.89, 3) + 1e-9);
// 8. 建議：期望台數差距夠大才建議改打；差距小仍以速度為主
const mk = (tile, winRate, avgTai) => ({ tile, winRate, avgTai, expectedTai: winRate * avgTai });
let adv = V.advice({ horizon: 10, trials: 100, options: [mk(1, 0.3, 2), mk(2, 0.25, 6)] });
assert.equal(adv.differs, true);
assert.equal(adv.richest.tile, 2);
assert.match(adv.text, /更划算/);
adv = V.advice({ horizon: 10, trials: 100, options: [mk(1, 0.3, 2), mk(2, 0.29, 2.1)] });
assert.equal(adv.differs, false);
assert.match(adv.text, /先求胡|又快又划算/);
// 9. 模擬中的吃碰：碰任何一家、吃只限上家，且只在能加快聽牌時才做
{
  // 手上有 5筒5筒、3萬4萬，其餘湊不成組
  const hand = [2, 3, 13, 13, 0, 8, 10, 16, 18, 22, 26, 27, 28, 29, 30, 31];
  const sh = E.shanten(hand, 0);
  const pon = V.tryClaim(hand, [], 13, false, sh);
  assert.ok(pon, '別家打 5筒 可以碰');
  assert.equal(pon.melds[0].type, 'pon');
  assert.equal(pon.hand.length + pon.melds.length * 3, 16, '碰後打出一張，張數要對');
  assert.equal(V.tryClaim(hand, [], 1, false, sh), null, '不是上家打的 2萬 不能吃');
  const chi = V.tryClaim(hand, [], 1, true, sh);
  assert.ok(chi && chi.melds[0].type === 'chi', '上家打的 2萬 可以吃 2萬3萬4萬');
  assert.equal(V.tryClaim(hand, [], 7, true, sh), null, '沒有對子也連不起來的牌不吃碰');
}
// 10. 背景執行緒：依 ?v= 載入核心檔案，回傳同樣的結果
{
  const sent = [];
  const loaded = [];
  const worker = {
    location: { search: '?v=99' },
    postMessage: (m) => sent.push(m),
    importScripts: (...files) => {
      for (const file of files) {
        loaded.push(file);
        const path = 'src/' + file.replace('../', '').replace(/\?.*$/, '');
        vm.runInContext(read(path), context);
      }
    },
  };
  const context = vm.createContext(worker);
  worker.self = context;
  vm.runInContext(read('src/workers/value-worker.js'), context);
  assert.deepEqual(loaded, ['../core/engine.js?v=99', '../core/scoring.js?v=99', '../core/value.js?v=99']);
  const game = JSON.parse(JSON.stringify(position(plain)));
  context.onmessage({ data: { job: 5, game, player: 0, options: { trials: 60, seed: 7 } } });
  assert.equal(sent[0].job, 5);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sent[0].report)),
    JSON.parse(JSON.stringify(V.evaluate(position(plain), 0, { trials: 60, seed: 7 }))),
  );
}
console.log(
  'PASS: 模擬可重現、數值範圍、不改牌局、同效打法結果相同、保留花色台數較高、聽牌胡牌率、別家先胡機率、建議門檻與背景執行緒。',
);
