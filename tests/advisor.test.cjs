// 決策核心（src/core/advisor.js）：教練的建議前後一致。
// 1. 建議吃碰時說的「吃完打 X」，照做之後教練一定也建議打 X（大量實戰局面逐一驗證）。
// 2. 標題、場況判斷、覆盤評分讀的是同一個決定。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const AI = require('../src/core/ai.js');
const A = require('../src/core/advisor.js');
const C = require('../src/core/coach.js');
const { createUiContext } = require('./helpers.cjs');

// 1. 實戰局面：你（0 號）遇到能吃碰的牌時，照建議吃碰，吃完後的建議必須等於承諾的那張
let checked = 0,
  mismatch = [];
for (let seed = 1; seed <= 120 && checked < 110; seed++) {
  const g = E.create(seed);
  let steps = 0;
  while (g.phase !== 'ended' && steps++ < 400) {
    AI.act(g, g.turn, 'normal');
    if (g.phase !== 'claim') continue;
    if (!g.pending.decisions[0]) {
      const report = A.claims(g, 0);
      for (const o of report.options) {
        if (!o.after || !['chi', 'pon'].includes(o.action.type)) continue;
        const h = A.afterClaim(g, 0, o.action);
        if (!h) continue;
        checked++;
        const d = A.decide(h, 0);
        if (d.tile !== o.after.tile)
          mismatch.push(seed + '：' + C.label(o.after.tile) + ' → ' + C.label(d.tile));
        // 卡片文字裡寫的也是同一張（能胡時卡片改成建議胡牌，不寫吃碰後打哪張）
        if (!report.options.some((x) => x.action.type === 'ron'))
          assert.match(o.compact, new RegExp('後打' + C.label(d.tile)));
      }
      E.respond(g, 0, { type: 'pass' });
    }
    for (let q = 1; q < 4 && g.phase === 'claim'; q++)
      if (!g.pending.decisions[q]) E.respond(g, q, AI.chooseClaim(g, q, 'normal'));
  }
}
assert.ok(checked >= 100, '驗證的吃碰局面太少：' + checked);
assert.deepEqual(mismatch, [], '吃碰前後建議不一致');

// 2. 同一個局面的決定是固定的；效率首選和解說的首選相同
{
  const g = E.create(7);
  while (!(g.turn === 0 && g.phase === 'discard')) AI.act(g, g.turn, 'normal');
  const a = A.decide(g, 0),
    b = A.decide(structuredClone(g), 0);
  assert.equal(a.tile, b.tile);
  const ex = C.explainTurn(g.hands[0], a.options, a.ctx);
  assert.equal(ex.best.tile, a.efficiency.tile);
}

// 3. 要守的局面：吃碰後會變成先守時，不建議吃碰
{
  const g = E.create(3);
  g.hands[0] = [0, 4, 8, 9, 13, 17, 18, 22, 26, 27, 28, 29, 30, 31, 3, 5];
  g.melds = [
    [],
    [
      { type: 'pon', tiles: [2, 2, 2] },
      { type: 'pon', tiles: [11, 11, 11] },
    ],
    [],
    [
      { type: 'pon', tiles: [20, 20, 20] },
      { type: 'pon', tiles: [32, 32, 32] },
      { type: 'pon', tiles: [33, 33, 33] },
    ],
  ];
  g.rivers = [[], [], [], [5, 7, 12, 16, 21, 23, 25, 4]];
  g.cuts = [[], [], [], Array(8).fill('hand')];
  g.log = [{ player: 3, action: 'discard', tile: 4, cut: 'hand' }];
  g.turn = 0;
  g.phase = 'claim';
  g.pending = {
    from: 3,
    tile: 4,
    decisions: { 1: { type: 'pass' }, 2: { type: 'pass' }, 3: { type: 'pass' } },
  };
  const report = A.claims(g, 0);
  const chi = report.options.find((o) => o.action.type === 'chi');
  assert.ok(chi, '上家打的 5 萬可以吃');
  assert.equal(chi.recommend, false);
  assert.match(chi.text, /先守/);
}

// 4. 畫面：標題的建議就是決策核心的建議；覆盤記錄的教練建議也相同
const ui = createUiContext();
ui.button('#openingActions', '開始').onclick();
ui.run(
  "clearTimeout(timer); game.hands[0] = [0,4,8,9,13,17,18,22,26,27,28,29,30,31,1,10,19]; game.melds[1] = [{type:'pon',tiles:[2,2,2]},{type:'pon',tiles:[11,11,11]},{type:'pon',tiles:[20,20,20]}]; game.rivers[1].push(5,7,12,16,21,23,25,27); game.cuts[1].push('hand','hand','hand','hand','hand','hand','hand','tsumo'); game.log.push({player:1,action:'discard',tile:27,cut:'tsumo'},{action:'resolution',player:1,choice:'pass',tile:27}); game.turn = 0; game.phase = 'discard'; game.pending = null; game.fresh = null; analyze(); coach();",
);
const d = ui.run('currentDecision()');
assert.equal(d.stance, 'balance', '東是效率首選也是最安全的牌，不必拆牌就能兼顧');
assert.equal(d.tile, 27);
assert.match(ui.text(ui.get('#coachBody')), /攻守兼顧.*東/);
ui.run('selected = game.hands[0].indexOf(27)');
ui.get('#discardButton').onclick();
const rec = ui.run('turnLog[turnLog.length - 1]');
assert.equal(rec.best, 27, '覆盤的教練建議就是標題上的建議');
assert.equal(rec.judge.verdict, 'best');
assert.equal(rec.mistake, false);

console.log('advisor tests passed：' + checked + ' 個吃碰局面前後一致');
