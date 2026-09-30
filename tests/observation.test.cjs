const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const View = require('../src/core/observation.js');
const AI = require('../src/core/ai.js');
const O = require('../src/core/opponents.js');
const Safety = require('../src/core/safety.js');
const Defense = require('../src/core/defense.js');
const Value = require('../src/core/value.js');

// Construct a legal 144-tile inventory with an unrevealed kan, not just an
// arbitrary state whose duplicate tiles might accidentally explain a difference.
function position() {
  const g = E.create(71, { reserve: 16, passWater: true });
  g.hands = [[0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 27, 27, 33], [], [], []];
  g.melds = [
    [],
    [
      { type: 'pon', tiles: [14, 14, 14], from: 2 },
      { type: 'concealed', tiles: [12, 12, 12, 12], from: 1 },
    ],
    [],
    [],
  ];
  g.rivers = [[], [13, 22], [], []];
  g.flowers = [[], [], [], []];
  const counts = Array.from({ length: 42 }, (_, t) => (t < 34 ? 4 : 1));
  for (const t of [...g.hands[0], ...g.melds[1].flatMap((m) => m.tiles), ...g.rivers[1]]) counts[t]--;
  const pool = counts.flatMap((n, t) => Array(n).fill(t));
  for (const [q, count] of [
    [1, 10],
    [2, 16],
    [3, 16],
  ])
    g.hands[q] = pool.splice(0, count);
  g.wall = pool;
  g.phase = 'discard';
  g.turn = 0;
  g.pending = null;
  g.fresh = { player: 0, tile: 33 };
  g.lastTake = { player: 0, tile: 33, afterKan: false };
  g.cuts = [[], ['empty', 'tsumo'], [], []];
  g.log = [
    { action: 'concealed', player: 1, tile: 12 },
    { action: 'draw', player: 1, tile: 13 },
    { action: 'discard', player: 1, tile: 13, cut: 'empty' },
    { action: 'response', player: 2, tile: 13, choice: 'pass' },
    { action: 'resolution', player: 1, tile: 13, choice: 'pass' },
    { action: 'draw', player: 1, tile: 22 },
    { action: 'discard', player: 1, tile: 22, cut: 'tsumo' },
    { action: 'resolution', player: 1, tile: 22, choice: 'pass' },
    { action: 'draw', player: 0, tile: 33 },
  ];
  return g;
}

function hiddenTwin(g) {
  const twin = structuredClone(g);
  const swap = (t) => (t === 12 ? 28 : t === 28 ? 12 : t);
  twin.wall = twin.wall.map(swap).reverse();
  for (let p = 1; p < 4; p++) twin.hands[p] = twin.hands[p].map(swap).reverse();
  twin.melds[1][1].tiles = twin.melds[1][1].tiles.map(swap);
  twin.seed ^= 98765;
  twin.water = [false, true, true, true];
  twin.cuts[1][0] = 'hand';
  twin.log[0].tile = 28;
  twin.log[1].tile = 30;
  twin.log[2].cut = 'hand';
  twin.log[3].choice = 'pon';
  twin.log.push({ action: 'secret-future-engine-field', player: 1, tile: 5 });
  twin.unannouncedEngineSecret = { tile: 7 };
  return twin;
}

const g = position(),
  twin = hiddenTwin(g);
const inventory = (s) =>
  [
    ...s.wall,
    ...s.hands.flat(),
    ...s.melds.flatMap((ms) => ms.flatMap((m) => m.tiles)),
    ...s.rivers.flat(),
  ].sort((a, b) => a - b);
assert.equal(inventory(g).length, 144);
assert.deepEqual(inventory(g), inventory(twin));
const view = View.forPlayer(g, 0);
assert.deepEqual(
  view,
  View.forPlayer(twin, 0),
  'all hidden substitutions produce exactly the same input to analysis',
);
assert.equal(view.seed, undefined);
assert.equal(view._ai, undefined);
assert.ok(view.wall.every((t) => t === null));
assert.ok(
  view.hands
    .slice(1)
    .flat()
    .every((t) => t === null),
);
assert.deepEqual(view.melds[1][1].tiles, []);
assert.deepEqual(view.water, [false, null, null, null]);
assert.equal(view.log.find((e) => e.action === 'draw' && e.player === 1).tile, undefined);
assert.equal(view.log.find((e) => e.action === 'concealed').tile, undefined);
assert.ok(!view.log.some((e) => e.action === 'response' && e.player !== 0));
assert.equal(view.cuts[1][0], 'hand');
assert.equal(View.forPlayer(view, 0), view, 'same-seat projection is idempotent');
assert.throws(() => View.forPlayer(view, 1), /another seat/);
assert.deepEqual(View.forPlayer(g, 1).melds[1][1].tiles, [12, 12, 12, 12], 'own concealed kan remains known');
assert.deepEqual(View.forPlayer(g, 0).hands[0], g.hands[0]);
view.hands[0][0] = 32;
assert.equal(g.hands[0][0], 0, 'analysis cannot mutate the engine through shared arrays');

for (const sample of [g, twin]) {
  assert.equal(
    AI.reading(sample, 1).oneSuit,
    null,
    'one exposed meld plus a hidden kan cannot reveal a flush',
  );
  assert.equal(O.expectedTai(sample, 1), O.expectedTai(g, 1));
}
assert.deepEqual(O.read(g, 0), O.read(twin, 0));
assert.deepEqual(Safety.evaluate(g, 0), Safety.evaluate(twin, 0));
assert.deepEqual(Defense.inspect(g, 0, 13), Defense.inspect(twin, 0, 13));
for (const level of ['easy', 'normal', 'hard'])
  assert.equal(
    AI.chooseDiscard(structuredClone(g), 0, level),
    AI.chooseDiscard(structuredClone(twin), 0, level),
    level + ' must not use the shuffle seed or hidden kan',
  );
assert.deepEqual(
  Value.evaluate(g, 0, { trials: 8, tiles: [33, 4] }),
  Value.evaluate(twin, 0, { trials: 8, tiles: [33, 4] }),
  'default simulation randomness must not depend on the shuffle seed or private events',
);

// Pending opponents' decisions are not observable; one's own legal options and
// pass-water restriction must still agree with the authoritative engine.
const claim = E.create(3, { passWater: true });
claim.hands[0] = [0, 1, 2, 3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27, 27, 31];
claim.phase = 'claim';
claim.pending = {
  from: 3,
  tile: 31,
  decisions: { 1: { type: 'pon', tiles: [31, 31] }, 3: { type: 'pass' } },
};
assert.deepEqual(View.forPlayer(claim, 0).pending.decisions, {});
assert.deepEqual(E.claims(View.forPlayer(claim, 0), 0), E.claims(claim, 0));
assert.ok(E.claims(claim, 0).some((a) => a.type === 'ron'));
claim.water[0] = true;
assert.deepEqual(E.claims(View.forPlayer(claim, 0), 0), E.claims(claim, 0));
assert.ok(!E.claims(View.forPlayer(claim, 0), 0).some((a) => a.type === 'ron'));

// Passing is evidence only under an explicit always-win policy, never a rule
// prohibiting a human from winning later. Empty cuts reset that inference.
const human = position();
human.log = [
  { action: 'discard', player: 2, tile: 33, cut: 'tsumo' },
  { action: 'resolution', player: 2, tile: 33, choice: 'pass' },
];
assert.equal(O.passedSince(human, 0).size, 0);
human.playerPolicies = [{ alwaysWin: true }, { alwaysWin: false }, { alwaysWin: true }, { alwaysWin: true }];
assert.equal(O.passedSince(human, 1).size, 0);
assert.ok(O.passedSince(human, 0).has(33));
const botRisk = Safety.evaluate(g, 0)
  .flatMap((r) => r.per)
  .filter((r) => r.assumedSafe);
for (const r of botRisk) {
  assert.equal(r.safe, false);
  assert.match(r.reasons[0], /模型推估/);
}
human.log.push({ action: 'discard', player: 0, tile: 22, cut: 'empty' });
assert.equal(
  O.passedSince(human, 0).size,
  0,
  'an empty cut is visibly a hand change, so no inference survives',
);

console.log(
  'PASS: seat observation, hidden-kan/seed/log/water invariance, own legal claims, and qualified pass inference.',
);
