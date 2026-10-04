// 實戰記錄（src/core/seatrecord.js）：只記你看得到的事件，重建出來的局面要和真正的牌局「從你的座位看」一模一樣，
// 教練在每一次出牌給的建議也要相同——這樣你在別處打的牌，覆盤結果才和在本程式打的一樣可信。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const AI = require('../src/core/ai.js');
const A = require('../src/core/advisor.js');
const S = require('../src/core/seatrecord.js');
const Observation = require('../src/core/observation.js');

/**
 * 用電腦打一局，同時像真人一樣「只記看得到的事」寫成實戰記錄；也記下每次你（0 號）出牌時教練在真實牌局上的建議。
 */
function playAndRecord(seed) {
  const g = E.create(seed, { reserve: 16, passWater: true, dealer: seed % 4 });
  const record = S.create({ dealer: g.dealer, reserve: 16, passWater: true });
  record.start.hand = g.hands[0].slice();
  record.start.flowers = g.flowers[0].slice();
  for (const p of [1, 2, 3]) if (g.flowers[p].length) record.start.otherFlowers[p] = g.flowers[p].slice();
  const truth = [];
  let seenLog = 0,
    seenFlowers = g.flowers.map((f) => f.length);
  const sync = () => {
    for (; seenLog < g.log.length; seenLog++) {
      const e = g.log[seenLog],
        p = e.player,
        mine = p === 0;
      // 這次摸牌（或槓後補牌）途中翻出的花
      const flowersOf = (q) => {
        for (const f of g.flowers[q].slice(seenFlowers[q]))
          record.events.push({ p: q, a: 'flower', tile: f });
        seenFlowers[q] = g.flowers[q].length;
      };
      if (e.action === 'draw') {
        flowersOf(p);
        record.events.push({ p, a: 'draw', ...(mine ? { tile: e.tile } : {}) });
      } else if (e.action === 'discard') record.events.push({ p, a: 'discard', tile: e.tile, cut: e.cut });
      else if (['chi', 'pon', 'kan'].includes(e.action)) {
        record.events.push({ p, a: e.action, tiles: e.tiles.slice() });
        if (e.action === 'kan') {
          flowersOf(p);
          record.events.push({ p, a: 'draw', ...(mine ? { tile: g.fresh.tile } : {}) });
        }
      } else if (e.action === 'concealed' || e.action === 'added') {
        record.events.push({ p, a: e.action, ...(mine || e.action === 'added' ? { tile: e.tile } : {}) });
        flowersOf(p);
        record.events.push({ p, a: 'draw', ...(mine ? { tile: g.fresh.tile } : {}) });
      } else if (e.action === 'ron' || e.action === 'tsumo') record.events.push({ p, a: e.action });
    }
  };
  let steps = 0;
  while (g.phase !== 'ended' && steps++ < 600) {
    const p = g.turn;
    if (p === 0 && g.phase === 'discard' && !E.winning(g.hands[0], g.melds[0].length)) {
      const kan = AI.chooseKan(g, 0, 'normal');
      if (kan && E.selfKan(g, 0, kan)) {
        sync();
        continue;
      }
      const d = A.decide(g, 0);
      truth.push(d.tile);
      const f = g.fresh;
      E.discard(
        g,
        0,
        f && f.player === 0 && f.tile === d.tile ? g.hands[0].length - 1 : g.hands[0].indexOf(d.tile),
      );
    } else AI.act(g, p, 'normal');
    if (g.phase === 'claim')
      for (let q = 0; q < 4 && g.phase === 'claim'; q++)
        if (!g.pending.decisions[q]) E.respond(g, q, AI.chooseClaim(g, q, 'normal'));
    sync();
  }
  return { g, record, truth };
}

test('重建的局面和真正的牌局從你的座位看完全相同', () => {
  for (const seed of [3, 8, 21]) {
    const { g, record } = playAndRecord(seed);
    const r = S.state(JSON.parse(JSON.stringify(record)));
    assert.equal(r.error, null, 'seed ' + seed);
    const a = Observation.forPlayer(g, 0),
      b = Observation.forPlayer(r.game, 0);
    assert.deepEqual(b.hands[0].slice().sort(), a.hands[0].slice().sort());
    assert.deepEqual(b.handCounts, a.handCounts);
    assert.deepEqual(b.rivers, a.rivers);
    assert.deepEqual(b.flowers, a.flowers);
    assert.deepEqual(
      b.melds.map((ms) => ms.map((m) => m.tiles.length)),
      a.melds.map((ms) => ms.map((m) => m.tiles.length)),
    );
    assert.equal(b.wall.length, a.wall.length, '牌牆剩餘張數由看得到的牌推算');
    assert.equal(r.game.phase, 'ended');
  }
});

test('每一次出牌，教練在實戰記錄上的建議和在真實牌局上相同', () => {
  let n = 0;
  for (const seed of [3, 8, 21, 34]) {
    const { record, truth } = playAndRecord(seed);
    const rows = S.review(record, A);
    assert.deepEqual(
      rows.map((x) => x.decision.tile),
      truth,
      'seed ' + seed,
    );
    for (const x of rows) assert.equal(x.verdict.verdict, 'best', '照教練打，每一手都是最佳');
    n += rows.length;
  }
  assert.ok(n >= 20, '驗證的出牌次數太少：' + n);
});

test('不合理的記錄會指出第幾個事件有問題', () => {
  const record = S.create();
  assert.match(S.state(record).error, /起手牌要 16 張/);
  record.start.hand = [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  assert.equal(S.state(record).error, null);
  record.events.push({ p: 0, a: 'draw', tile: 0 });
  assert.match(S.state(record).error, /超過 4 張/);
  record.events[0] = { p: 0, a: 'draw', tile: 13 };
  record.events.push({ p: 0, a: 'discard', tile: 30 });
  assert.match(S.state(record).error, /第 2 個事件：你手上沒有北/);
  record.events[1] = { p: 0, a: 'discard', tile: 13 };
  record.events.push({ p: 2, a: 'chi', tiles: [11, 12] });
  assert.match(S.state(record).error, /只能吃上家/);
  assert.match(S.parse('{').error, /JSON/);
});
