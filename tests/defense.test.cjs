const assert = require('node:assert/strict'),
  E = require('../src/core/engine.js'),
  D = require('../src/core/defense.js'),
  T = require('../src/ui/tiles.js');
const g = E.create(1);
g.hands[0] = [33];
g.rivers = [[33], [33], [], []];
g.melds = [[], [], [], []];
let r = D.inspect(g, 0, 33);
assert.equal(r.excluded, false);
assert.deepEqual(
  r.opponents[0].ways.map((w) => w.kind),
  ['單吊'],
);
g.rivers[3] = [33];
assert.equal(D.inspect(g, 0, 33).excluded, true);
g.hands[0] = [0];
g.rivers = [[0, 0, 0], [], [], []];
assert.equal(D.inspect(g, 0, 0).excluded, false, 'Four known number tiles may still complete sequences');
g.rivers[1] = [1, 1, 1, 1];
assert.equal(D.inspect(g, 0, 0).excluded, true, 'All 2s known block the only sequence for 1');
g.rivers = [[], [0], [], []];
assert.ok(D.inspect(g, 0, 0).opponents[0].discarded);
assert.equal(D.inspect(g, 0, 0).excluded, false);
g.melds[1] = Array.from({ length: 5 }, () => ({ type: 'chi', tiles: [9, 10, 11] }));
assert.ok(D.inspect(g, 0, 0).opponents[0].ways.every((w) => w.kind === '單吊'));
g.melds = [[], [], [], []];
const snapshot = JSON.stringify(g),
  baseline = D.inspect(g, 0, 0),
  hidden = structuredClone(g);
hidden.wall.reverse();
hidden.hands[1] = [33, 33, 33];
assert.deepEqual(D.inspect(hidden, 0, 0), baseline);
assert.equal(JSON.stringify(g), snapshot);
g.hands[0] = [0, 33];
g.rivers = [[33, 33, 33], [], [], []];
const options = [
  { tile: 0, shanten: 0, remaining: 8 },
  { tile: 33, shanten: 1, remaining: 20 },
];
let report = D.compare(g, options);
assert.equal(report.guard.option.tile, 33);
assert.match(report.tradeoff, /多 1 步/);
assert.match(D.summary(g, options), /不是放槍機率/);
// Any actual standard ron must remain possible under the public-information upper bound.
for (let seed = 0; seed < 12; seed++) {
  const game = E.create(seed);
  let steps = 0;
  while (game.phase !== 'ended' && steps++ < 400) {
    if (game.phase === 'draw') E.draw(game, game.turn);
    else if (game.phase === 'discard') {
      const p = game.turn;
      for (const t of new Set(game.hands[p]))
        for (let other = 0; other < 4; other++)
          if (other !== p && E.winning([...game.hands[other], t], game.melds[other].length))
            assert.ok(D.inspect(game, p, t).opponents.find((o) => o.player === other).ways.length);
      E.discard(game, p, 0);
    } else
      for (let p = 0; p < 4 && game.phase === 'claim'; p++)
        if (!game.pending.decisions[p]) E.respond(game, p, E.claims(game, p)[0] || { type: 'pass' });
  }
}
const svg = T.svg(25);
assert.equal((svg.match(/data-eight-row/g) || []).length, 2);
assert.equal((svg.match(/transform="rotate/g) || []).length, 8);
assert.match(svg, /#1d2b4f/);
assert.match(svg, /#1b7a47/);
for (let t = 0; t < 42; t++) assert.ok(!T.svg(t).includes('NaN'));
console.log(
  'PASS: honor single waits, sequence walls, no false genbutsu, five melds, hidden-info isolation, tradeoff costs, actual ron bounds, and eight-bamboo structure.',
);
