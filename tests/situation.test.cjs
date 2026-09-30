// 場況判斷（src/core/situation.js）與教練欄的「場況判斷」卡片（src/ui/app/situation-panel.js）。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const S = require('../src/core/situation.js');
const { createUiContext } = require('./helpers.cjs');

/** 輪到你出牌的局面：三家沒有攤牌、牌河空白，可再個別覆寫 */
function position(hand, edit = (g) => g) {
  const g = E.create(42, { reserve: 16 });
  g.hands[0] = hand.slice();
  g.melds = [[], [], [], []];
  g.rivers = [[], [], [], []];
  g.cuts = [[], [], [], []];
  g.log = [];
  g.turn = 0;
  g.phase = 'discard';
  g.pending = null;
  edit(g);
  return g;
}
const discard = (player, tile, cut = 'hand') => [
  { player, action: 'discard', tile, cut },
  { action: 'resolution', player, choice: 'pass', tile },
];
const read = (g) => S.read(g, 0, E.analyze(g.hands[0], E.publicTiles(g), g.melds[0].length));
const keys = (r) => r.points.map((p) => p.key);

// 1. 放過的牌：手切（改變手牌）之後，自己摸切的牌和別家打出沒胡的牌；還沒回應完的牌不算
{
  const g = position([0]);
  g.log = [
    ...discard(1, 5),
    ...discard(2, 7),
    ...discard(1, 9, 'tsumo'),
    { player: 3, action: 'discard', tile: 11 },
  ];
  assert.deepEqual(
    [...S.passedSince(g, 1)].sort((a, b) => a - b),
    [7, 9],
  );
  g.log.push(
    { action: 'resolution', player: 3, choice: 'pass', tile: 11 },
    { player: 1, action: 'pon', tile: 13 },
  );
  assert.equal(S.passedSince(g, 1).size, 0, '碰牌後手牌變了，之前放過的牌不再算');
}

// 2. 對手很可能聽牌、你還差很遠：先守，並建議打他放過的牌
const messy = [0, 4, 8, 9, 13, 17, 18, 22, 26, 27, 28, 29, 30, 31, 1, 10, 19];
const fold = position(messy, (g) => {
  g.melds[1] = [
    { type: 'pon', tiles: [2, 2, 2] },
    { type: 'pon', tiles: [11, 11, 11] },
    { type: 'pon', tiles: [20, 20, 20] },
  ];
  g.rivers[1] = [5, 7, 12, 16, 21, 23, 25, 27]; // 打過好幾張才是「很可能聽牌」
  g.cuts[1] = ['hand', 'hand', 'hand', 'hand', 'hand', 'hand', 'hand', 'tsumo'];
  g.log = discard(1, 27, 'tsumo');
});
const r = read(fold);
assert.equal(r.stance, 'fold');
assert.equal(r.guard.tile, 27, '他放過的東風最安全');
assert.match(r.headline, /下家很可能聽牌.*打東/);
assert.match(r.points[0].text, /下家很可能聽牌（約 \d+%：攤了 3 組）.*東.*模型推估較安全/);
assert.match(r.points[0].text, /不適用真人故意不胡/);

// 3. 已聽牌、沒人有威脅：進攻，說明聽哪些牌、剩幾張
const tenpai = [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27, 12, 13, 31];
const push = read(position(tenpai));
assert.equal(push.stance, 'push');
assert.ok(keys(push).includes('tenpai'));
assert.match(push.headline, /已聽牌.*放手進攻/);
assert.ok(!keys(push).some((k) => k.startsWith('hot')), '沒人攤牌、牌牆還多，不能亂喊有人聽牌');

// 4. 牌牆快摸完、你還差很遠：轉守，並說明剩幾次摸牌
const late = read(position(messy, (g) => (g.wall = g.wall.slice(0, 20))));
assert.equal(late.left, 4);
assert.equal(late.stance, 'fold');
assert.match(late.points.find((p) => p.key === 'late').text, /只剩 4 張.*不放槍/);

// 5. 一色方向：筒子很多、其他花色只剩三張 → 提醒混一色，並比較打雜色的代價
const flush = read(position([9, 10, 11, 12, 13, 14, 15, 16, 17, 9, 10, 27, 27, 31, 0, 5, 22]));
const f = flush.points.find((p) => p.key === 'flush-me:1');
assert.ok(f, '要提醒往一色做');
assert.match(f.text, /混一色（4 台）/);

// 6. 死搭子：嵌張要的牌都出現了；字牌對子另外兩張都打出來
{
  const g = position([0, 2, 9, 10, 11, 18, 19, 20, 3, 4, 5, 31, 31, 14, 15, 24, 33], (g) => {
    g.rivers[2] = [1, 1, 1, 31, 31];
  });
  const res = S.read(g, 0, [{ tile: 33, shanten: 1, remaining: 8, outs: [] }]);
  assert.match(res.points.find((p) => p.key === 'dead:0,2').text, /嵌張.*只剩 1 張/);
  assert.match(res.points.find((p) => p.key.startsWith('honor-pair:31')).text, /碰不到/);
}

// 7. 下家做一色：你要打的正好是那一門時，警告加重
{
  const g = position(messy, (g) => {
    g.melds[1] = [
      { type: 'chi', tiles: [9, 10, 11] },
      { type: 'pon', tiles: [15, 15, 15] },
    ];
  });
  const res = S.read(g, 0, [{ tile: 13, shanten: 3, remaining: 20, outs: [] }]);
  const p = res.points.find((x) => x.key === 'flush:1');
  assert.equal(p.weight, 4);
  assert.match(p.text, /下家攤牌全是筒子.*正好/);
  assert.ok(keys(res).includes('feed'), '下家吃過筒子，打筒子可能再被吃');
}

// 8. 畫面：輪到你出牌時教練欄最上面是場況判斷；低重要性的話幾手內不重複，重要警告每次都講
const ui = createUiContext();
ui.button('#openingActions', '開始').onclick();
ui.run(
  'clearTimeout(timer); game.hands[0] = ' +
    JSON.stringify(tenpai) +
    "; game.melds[0] = []; game.turn = 0; game.phase = 'discard'; game.pending = null; analyze(); coach();",
);
const body = ui.get('#coachBody');
const card = body.children.find((x) => String(x.className).startsWith('situation'));
assert.ok(card, '教練欄要有場況判斷');
assert.match(ui.text(card), /進攻/);
const fresh = (n) =>
  ui.run(
    'turnLog = Array(' +
      n +
      ').fill({}); freshPoints([{text:"a",weight:1},{text:"b",weight:5}], 3).map(p=>p.text).join("")',
  );
ui.run('resetSituation()');
assert.equal(fresh(0), 'ab');
assert.equal(fresh(0), 'ab', '同一手重畫時照樣顯示');
assert.equal(fresh(2), 'b', '兩手內不重複一般提醒');
assert.equal(fresh(4), 'ab', '隔了幾手可以再提');

console.log('situation tests passed');
