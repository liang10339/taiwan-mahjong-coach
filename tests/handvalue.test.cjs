// 手牌價值（src/core/handvalue.js）：胡了大約幾台，以及教練怎麼用它取捨。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const HV = require('../src/core/handvalue.js');
const A = require('../src/core/advisor.js');

/** 一局剛開始、輪到 0 號出牌、0 號不是莊家的局面 */
function table(hand) {
  const g = E.create(11, { dealer: 1 });
  g.hands[0] = hand;
  g.melds = [[], [], [], []];
  g.flowers = [[], [], [], []];
  g.rivers = [[], [], [], []];
  g.cuts = [[], [], [], []];
  g.turn = 0;
  g.phase = 'discard';
  g.fresh = null;
  return g;
}

test('已聽牌：逐張聽牌實際計台，自摸含門清自摸', () => {
  // 123 456 789 萬、123 456 筒、單吊東：只聽一張
  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 27];
  const g = table([...hand, 33]);
  const t = HV.estimate(g, 0, hand);
  assert.equal(t.exact, true);
  assert.deepEqual(t.waits, [27]);
  // 胡別人：門清 1＋獨聽 1；自摸：門清自摸 3＋獨聽 1
  assert.equal(t.ron, 2);
  assert.equal(t.tsumo, 4);
});

test('還沒聽牌：字牌對子、門清、一色都看得出來', () => {
  const plain = [0, 1, 4, 9, 10, 14, 18, 19, 22, 24, 25, 2, 3, 12, 20, 21];
  const withDragons = [...plain.slice(0, 14), 31, 31];
  const g = table([...plain, 5]);
  const a = HV.estimate(g, 0, plain),
    b = HV.estimate(g, 0, withDragons);
  assert.equal(a.exact, false);
  assert.ok(b.ron > a.ron, '中中一對應該讓期望台數變高');
  // 已經是清一色（萬子）的手：期望台數明顯較高
  const oneSuit = [0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 2, 4, 5, 6, 7];
  assert.ok(HV.estimate(g, 0, oneSuit).ron > a.ron + 2);
});

test('收入：自摸三家都付；閒家胡牌時另外算進莊家那份', () => {
  const g = table([0]);
  const tai = { ron: 2, tsumo: 4 };
  const all = HV.income(g, 0, tai, 2.5, 1),
    ron = HV.income(g, 0, tai, 2.5, 0);
  assert.equal(all, 3 * (2.5 + 4) + 1);
  assert.ok(Math.abs(ron - (2.5 + 2 + 1 / 3)) < 1e-9);
});

test('教練：每張候選牌都有胡了的台數估計；換牌時標明是防守還是做台', () => {
  const g = table([0, 1, 4, 9, 10, 14, 18, 19, 22, 24, 25, 2, 3, 12, 31, 31, 30]);
  const d = A.decide(g, 0);
  for (const o of d.options) assert.ok(d.worth.has(o.tile));
  // 打中（拆掉字牌對）胡了的台數不會比打北高
  assert.ok(d.worth.get(31).tai.ron <= d.worth.get(30).tai.ron);
  assert.ok(!(d.folding && d.forValue));
});
