// 一炮多響（rules.multiRon）：同一張牌好幾家能胡時全部都胡；預設關閉時照舊只有最近一家胡（頭跳）。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const AI = require('../src/core/ai.js');
const S = require('../src/core/scoring.js');
const R = require('../src/core/record.js');

// 五組加一對，等 31（北風）：012、九十十一、18 19 20、東東東、30 30 30，單吊 31
const waiting = [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 30, 30, 30, 31];
const base = [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 31, 31, 32, 33];

/** 3 號位打出 31，0、1、2 號位都在等這張 */
function fixture(multiRon) {
  const g = E.create(123, { rules: { multiRon } });
  g.hands = Array.from({ length: 4 }, () => base.slice());
  for (const p of [0, 1, 2]) g.hands[p] = waiting.slice();
  g.hands[3].push(31);
  g.phase = 'discard';
  g.turn = 3;
  assert.ok(E.discard(g, 3, g.hands[3].length - 1));
  assert.equal(g.phase, 'claim');
  return g;
}
const ron = (g, p) => E.claims(g, p).find((a) => a.type === 'ron');

// 1. 預設關閉：三家都喊胡，只有出牌者下家方向最近的 0 號位胡
let g = fixture(false);
for (const p of [0, 1, 2]) assert.ok(ron(g, p), p + ' 號位應該能胡');
for (const p of [0, 1, 2, 3])
  if (g.phase === 'claim' && !g.pending.decisions[p]) E.respond(g, p, ron(g, p) || { type: 'pass' });
assert.equal(g.phase, 'ended');
assert.deepEqual(E.winners(g), [0]);
assert.equal(g.hands[1].length, 16, '沒胡的家手牌不變');
assert.equal(g.log.filter((e) => e.action === 'ron').length, 1);

// 2. 開啟：三家都胡，牌河上的那張牌只拿走一次
g = fixture(true);
assert.equal(g.rules.multiRon, true);
for (const p of [0, 1, 2, 3])
  if (g.phase === 'claim' && !g.pending.decisions[p]) E.respond(g, p, ron(g, p) || { type: 'pass' });
assert.equal(g.phase, 'ended');
assert.deepEqual(E.winners(g), [0, 1, 2]);
assert.equal(g.turn, 0, '第一位贏家是出牌者下家方向最近的一家');
assert.equal(g.rivers[3].length, 0);
for (const p of [0, 1, 2]) assert.equal(g.hands[p].length, 17);
assert.equal(g.log.filter((e) => e.action === 'ron').length, 3);
assert.match(g.result, /胡/);

// 3. 只有部分人喊胡（1 號位選擇略過）：贏家是 0 和 2
g = fixture(true);
for (const p of [0, 1, 2, 3])
  if (g.phase === 'claim' && !g.pending.decisions[p])
    E.respond(g, p, p === 1 ? { type: 'pass' } : ron(g, p) || { type: 'pass' });
assert.deepEqual(E.winners(g), [0, 2]);

// 4. 結算：每位贏家各自向放槍者收，放槍者付總和；只有一位贏家時和 settle 相同
g = fixture(true);
for (const p of [0, 1, 2, 3])
  if (g.phase === 'claim' && !g.pending.decisions[p]) E.respond(g, p, ron(g, p) || { type: 'pass' });
const results = E.winners(g).map((w) => S.score(g, w));
const stake = { base: 100, perTai: 20 };
const all = S.settleAll(g, results, stake);
assert.equal(
  all.deltas.reduce((a, b) => a + b, 0),
  0,
  '點數守恆',
);
const singles = results.map((r) => S.settle(g, r, stake));
for (let i = 0; i < 4; i++)
  assert.equal(
    all.deltas[i],
    singles.reduce((n, s) => n + s.deltas[i], 0),
  );
assert.ok(all.deltas[3] < Math.min(...singles.map((s) => s.deltas[3])), '放槍者付的比任何一人單獨胡都多');
assert.equal(all.payments.length, 3);
assert.deepEqual(S.settleAll(g, [results[0]], stake).deltas, S.settle(g, results[0], stake).deltas);

// 5. 搶槓也一樣：3 號位加槓 31，0 和 1 號位都能搶
function robFixture(multiRon) {
  const g = E.create(7, { rules: { multiRon } });
  g.hands = Array.from({ length: 4 }, () => base.slice());
  for (const p of [0, 1]) g.hands[p] = waiting.slice();
  g.hands[3].push(31);
  g.phase = 'claim';
  g.turn = 3;
  g.pending = { from: 3, tile: 31, kind: 'robkan', kan: null, decisions: { 3: { type: 'pass' } } };
  return g;
}
for (const multi of [false, true]) {
  g = robFixture(multi);
  const before = g.hands[3].filter((t) => t === 31).length;
  for (const p of [0, 1, 2]) E.respond(g, p, ron(g, p) || { type: 'pass' });
  assert.equal(g.phase, 'ended');
  assert.deepEqual(E.winners(g), multi ? [0, 1] : [0]);
  assert.ok(g.log.filter((e) => e.action === 'ron').every((e) => e.robKan));
  assert.equal(g.hands[3].filter((t) => t === 31).length, before - 1, '被搶的那張離開加槓者手上');
}

// 6. 牌譜：預設不寫出 multiRon（舊牌譜內容不變），開啟時寫出並能重播
g = E.create(5);
assert.equal('multiRon' in R.fromGame(g).options.rules, false);
assert.equal(R.fromGame(E.create(5, { rules: { multiRon: true } })).options.rules.multiRon, true);

/** 用電腦打完一局（四家都照電腦），回傳牌局 */
function play(seed, multiRon) {
  const g = E.create(seed, { dealer: seed % 4, reserve: 16, passWater: true, rules: { multiRon } });
  for (let steps = 0; g.phase !== 'ended' && steps < 600; steps++) {
    AI.act(g, g.turn, 'normal');
    for (let q = 0; q < 4 && g.phase === 'claim'; q++)
      if (!g.pending.decisions[q]) E.respond(g, q, AI.chooseClaim(g, q, 'normal'));
  }
  return g;
}
const state = (x) =>
  JSON.stringify({
    hands: x.hands.map((h) => h.slice().sort((a, b) => a - b)),
    phase: x.phase,
    result: x.result,
    log: x.log.length,
  });
let multiGames = 0;
for (let seed = 1; seed <= 400; seed++) {
  const game = play(seed, true);
  assert.equal(game.phase, 'ended');
  const winners = E.winners(game);
  if (winners.length > 1) multiGames++;
  const back = R.replay(R.parse(JSON.stringify(R.fromGame(game))).record);
  assert.equal(back.error, null, '第 ' + seed + ' 局無法重播：' + back.error);
  assert.equal(state(back.game), state(game), '第 ' + seed + ' 局重播後不一致');
  // 沒人胡的局牌數守恆；有人胡的局，贏家人數以外的牌數不變
  if (!winners.length) {
    const total =
      game.wall.length +
      game.hands.concat(game.rivers, game.flowers).reduce((n, a) => n + a.length, 0) +
      game.melds.flat().reduce((n, m) => n + m.tiles.length, 0);
    assert.equal(total, 144, '第 ' + seed + ' 局牌數應該守恆');
  }
}
console.log(
  'PASS: 一炮多響（開關、三家同胡、部分略過、搶槓、結算、牌譜重播；400 局電腦自戰中 ' +
    multiGames +
    ' 局自然出現多家胡牌）。',
);
