// 配牌程序（engine.js 的 DEALINGS）：實際取墩（engine-v2）與舊牌譜的相容（engine-v1）。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const AI = require('../src/core/ai.js');
const R = require('../src/core/record.js');
const Observation = require('../src/core/observation.js');

/** 所有牌都還在：牌牆＋手牌＋花＝144 張，而且每種牌張數正確 */
function conserved(g) {
  const all = [...g.wall, ...g.hands.flat(), ...g.flowers.flat()].sort((a, b) => a - b);
  assert.equal(all.length, 144);
  for (let t = 0; t < 34; t++) assert.equal(all.filter((x) => x === t).length, 4);
}

test('實際取墩：從莊家起每人每次 4 張、四輪，配完再依序補花', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = E.create(seed, { dealer: seed % 4 });
    assert.equal(g.dealing, 'engine-v2');
    const deals = g.opening.filter((e) => e.type === 'deal');
    assert.equal(deals.length, 16);
    deals.forEach((e, i) => {
      assert.equal(e.player, (g.dealer + (i % 4)) % 4, '從莊家開始逆時針輪流');
      assert.equal(e.round, Math.floor(i / 4));
      assert.equal(e.tiles.length, 4, '每次兩墩');
    });
    // 補花在配牌之後，從莊家開始依座位順序
    const flowerEvents = g.opening.filter((e) => e.type === 'flowers');
    assert.ok(g.opening.slice(16).every((e) => e.type === 'flowers'));
    const order = flowerEvents.map((e) => (e.player - g.dealer + 4) % 4);
    assert.deepEqual(
      order,
      order.slice().sort((a, b) => a - b),
    );
    if (!g.flowerWin) {
      for (let p = 0; p < 4; p++) {
        assert.equal(g.hands[p].length, 16);
        assert.ok(
          g.hands[p].every((t) => t < 34),
          '補完花手上沒有花牌',
        );
        assert.deepEqual(
          flowerEvents
            .filter((e) => e.player === p)
            .flatMap((e) => e.flowers)
            .sort(),
          g.flowers[p].slice().sort(),
        );
      }
      assert.equal(g.turn, g.dealer);
      assert.equal(g.phase, 'draw', '莊家先摸門牌');
    }
    conserved(g);
  }
});

test('兩種程序同一個種子配出不同的牌，但 engine-v1 仍和以前完全一樣', () => {
  const v1 = E.create(123, { dealing: 'engine-v1' }),
    v2 = E.create(123);
  assert.notDeepEqual(v1.hands, v2.hands);
  assert.deepEqual(v1.opening, [], '舊程序不記開局事件');
  // v2.7 的 E.create(123)：0 號起手與四家的花（固定值，確保舊牌譜重播得到同一局）
  assert.deepEqual(v1.hands[0], [1, 2, 2, 8, 9, 10, 12, 13, 16, 17, 24, 25, 26, 26, 29, 31]);
  assert.deepEqual(v1.flowers, [[40], [39], [36, 35], []]);
  assert.equal(v1.wall.length, 76);
  assert.throws(() => E.create(1, { dealing: 'engine-v9' }), /Unsupported dealing/);
});

test('舊牌譜（engine-v1）照舊程序重播；新牌局存成 engine-v2', () => {
  for (const dealing of ['engine-v1', 'engine-v2']) {
    const g = E.create(77, { dealing, reserve: 16, passWater: true });
    let steps = 0;
    while (g.phase !== 'ended' && steps++ < 500) {
      AI.act(g, g.turn, 'normal');
      if (g.phase === 'claim')
        for (let q = 0; q < 4 && g.phase === 'claim'; q++)
          if (!g.pending.decisions[q]) E.respond(g, q, AI.chooseClaim(g, q, 'normal'));
    }
    const record = R.fromGame(g);
    assert.equal(record.dealing, dealing);
    const back = R.replay(JSON.parse(JSON.stringify(record)));
    assert.equal(back.error, null);
    assert.deepEqual(back.game.hands, g.hands);
    assert.equal(back.game.result, g.result);
  }
});

test('開局事件只讓自己看到自己的牌；花是公開的', () => {
  const g = E.create(5);
  const view = Observation.forPlayer(g, 0);
  for (const e of view.opening) {
    if (e.type === 'deal')
      assert.ok(e.player === 0 ? e.tiles.every((t) => t !== null) : e.tiles.every((t) => t === null));
    else {
      assert.ok(e.flowers.every((t) => t >= 34));
      if (e.player !== 0) assert.ok(e.replacements.every((t) => t === null));
    }
  }
});
