// 離線標準答案（scripts/lib/oracle.cjs）：猜牌只能用該座位看得到的資訊、牌數守恆、結果可重現。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const Observation = require('../src/core/observation.js');
const Oracle = require('../scripts/lib/oracle.cjs');
const Positions = require('../scripts/lib/positions.cjs');

const positions = [7, 8, 9].flatMap((s) => Positions.positionsOf(s));
assert.ok(positions.length >= 6, '應該挑得到局面');

const counts = (tiles) => {
  const c = Array(42).fill(0);
  tiles.forEach((t) => c[t]++);
  return c;
};
const deck = counts(
  [...Array(34).keys()].flatMap((t) => [t, t, t, t]).concat([34, 35, 36, 37, 38, 39, 40, 41]),
);

for (const pos of positions) {
  const real = pos.game,
    p = Positions.SEAT;
  const view = Observation.forPlayer(real, p);
  const g = Oracle.determinize(view, p, Oracle.rng(1), real.rules);
  // 1. 自己的手牌不變；別家手牌張數、牌牆張數不變
  assert.deepEqual(g.hands[p], real.hands[p]);
  for (let q = 0; q < 4; q++) assert.equal(g.hands[q].length, real.hands[q].length);
  assert.equal(g.wall.length, real.wall.length);
  // 2. 整副牌的牌數守恆（手牌、牌河、攤牌、花、牌牆加起來剛好一副）
  const all = [
    ...g.hands.flat(),
    ...g.rivers.flat(),
    ...g.melds.flatMap((ms) => ms.flatMap((m) => m.tiles)),
    ...g.flowers.flat(),
    ...g.wall,
  ];
  assert.deepEqual(counts(all), deck, pos.id + ' 牌數應該守恆');
  // 3. 別家手上不會有花牌
  for (let q = 0; q < 4; q++) assert.ok(g.hands[q].every((t) => t < 34));
  // 4. 沒有偷看：把真正的別家手牌與牌牆洗亂（張數不變），猜出來的牌必須完全相同
  const scrambled = structuredClone(real);
  const hidden = [...[1, 2, 3].flatMap((q) => scrambled.hands[q]), ...scrambled.wall].reverse();
  for (const q of [1, 2, 3]) scrambled.hands[q] = hidden.splice(0, scrambled.hands[q].length);
  scrambled.wall = hidden;
  const g2 = Oracle.determinize(Observation.forPlayer(scrambled, p), p, Oracle.rng(1), real.rules);
  assert.deepEqual(g2.hands, g.hands, pos.id + ' 猜牌不應該依賴真正的別家手牌');
  assert.deepEqual(g2.wall, g.wall);
  // 5. 不同的亂數會猜出不同的牌
  const g3 = Oracle.determinize(view, p, Oracle.rng(2), real.rules);
  assert.notDeepEqual(g3.wall, g.wall);
}

// 對手有暗槓（看不到牌值）時無法猜，要明確丟錯
{
  const real = structuredClone(positions[0].game);
  real.melds[1] = [{ type: 'concealed', tiles: [3, 3, 3, 3], from: 1 }];
  assert.throws(
    () => Oracle.determinize(Observation.forPlayer(real, 0), 0, Oracle.rng(1), real.rules),
    /暗槓/,
  );
}

// 評估：可重現、有且只有一個最佳、最佳的差距標準誤是 0、候選牌包含指定的牌
{
  const real = positions[0].game,
    p = Positions.SEAT;
  const cands = Oracle.candidates(real, p, [real.hands[p][0]]);
  assert.ok(cands.includes(real.hands[p][0]) && new Set(cands).size === cands.length);
  const a = Oracle.evaluate(real, p, cands.slice(0, 3), { n: 4, seed: 3, env: 'friends' }),
    b = Oracle.evaluate(real, p, cands.slice(0, 3), { n: 4, seed: 3, env: 'friends' });
  assert.deepEqual(a, b);
  assert.equal(a.filter((x) => x.best).length, 1);
  assert.equal(a.find((x) => x.best).diffSe, 0);
  assert.ok(a.every((x) => Number.isFinite(x.ev) && x.sd >= 0));
}

// 局面可以用種子重現
assert.deepEqual(
  Positions.positionsOf(7).map((x) => [x.id, x.game.hands[0]]),
  Positions.positionsOf(7).map((x) => [x.id, x.game.hands[0]]),
);

console.log(
  'PASS: 離線標準答案——猜牌牌數守恆、不偷看別家手牌與牌牆、暗槓會拒絕、評估可重現（' +
    positions.length +
    ' 個局面）。',
);
