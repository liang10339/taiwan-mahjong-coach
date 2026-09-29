const assert = require('node:assert/strict'),
  E = require('../src/core/engine.js'),
  A = require('../src/core/ai.js');
function conserve(g) {
  const all = [
    ...g.wall,
    ...g.hands.flat(),
    ...g.rivers.flat(),
    ...g.flowers.flat(),
    ...g.melds.flatMap((ms) => ms.flatMap((m) => m.tiles)),
  ];
  assert.equal(all.length, 144);
  for (let t = 0; t < 42; t++) assert.equal(all.filter((x) => x === t).length, t < 34 ? 4 : 1);
}
const results = { easy: 0, normal: 0, hard: 0 };
for (const level of Object.keys(A.LEVELS))
  for (let seed = 1; seed <= 3; seed++) {
    const g = E.create(seed, { dealer: seed % 4 });
    assert.equal(g.turn, seed % 4);
    let steps = 0;
    while (g.phase !== 'ended') {
      assert.ok(++steps < 500, 'game must end');
      if (g.phase === 'claim') {
        for (let p = 0; p < 4 && g.phase === 'claim'; p++)
          if (!g.pending.decisions[p]) assert.ok(E.respond(g, p, A.chooseClaim(g, p, level)));
      } else A.act(g, g.turn, level);
      conserve(g);
    }
    if (g.win) results[level]++;
  }
// 高級：對手已攤三組（很可能聽牌）、自己還很遠 → 打可排除的安全牌
const g = E.create(3);
g.melds[1] = [
  { type: 'pon', tiles: [27, 27, 27], from: 2 },
  { type: 'pon', tiles: [28, 28, 28], from: 3 },
  { type: 'chi', tiles: [0, 1, 2], from: 0 },
];
g.hands[1] = g.hands[1].slice(0, 7);
g.hands[0] = [3, 5, 7, 9, 12, 15, 18, 21, 24, 29, 30, 31, 32, 33, 4, 13, 22];
g.turn = 0;
g.phase = 'discard';
g.rivers = [[29, 29], [30, 30], [31, 31], [29]];
const hard = A.chooseDiscard(g, 0, 'hard'),
  normal = A.chooseDiscard(g, 0, 'normal');
assert.equal(A.threat(g, 1), 2);
assert.ok(
  A.danger(g, 0, hard).score <= Math.min(...g.hands[0].map((t) => A.danger(g, 0, t).score)),
  'hard AI folds with the safest tile',
);
assert.ok(A.danger(g, 0, hard).score < A.danger(g, 0, normal).score || hard === normal);
assert.equal(A.dangerLevel(A.danger(g, 0, 29)), 'safe'); // 北：自己一張、牌河三張，四張全見，三家都無法用它胡
// 初級：能碰就碰
const pg = E.create(4);
pg.hands[1] = [5, 5, ...pg.hands[1].slice(2)];
pg.phase = 'claim';
pg.pending = { from: 0, tile: 5, decisions: { 0: { type: 'pass' } } };
let took = 0;
for (let i = 0; i < 10; i++) {
  pg._ai = i * 977;
  if (A.chooseClaim(pg, 1, 'easy').type !== 'pass') took++;
}
assert.ok(took >= 6);
console.log(
  'PASS: easy/normal/hard full games with conservation, hard fold under threat, danger levels, easy greedy claims; wins:',
  JSON.stringify(results),
);
