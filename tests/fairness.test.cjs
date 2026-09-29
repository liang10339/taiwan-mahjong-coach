// 公平性證明（src/core/fairness.js）與畫面（src/ui/app/fairness-panel.js）。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const AI = require('../src/core/ai.js');
const F = require('../src/core/fairness.js');
const { createUiContext } = require('./helpers.cjs');

const rules = { dealer: 2, roundWind: 1, streak: 3, reserve: 16, passWater: true };

// 1. 指紋：同一個種子與桌規一定相同；換種子或換莊家就不同
const g = E.create(123456789, rules);
const print = F.fingerprint(g);
assert.match(print, /^[0-9a-f]{8}$/);
assert.equal(F.fingerprint(E.create(123456789, rules)), print);
assert.notEqual(F.fingerprint(E.create(123456790, rules)), print);
assert.notEqual(F.fingerprint(E.create(123456789, { ...rules, dealer: 1 })), print);

// 2. 打完一整局：開局的指紋可以重現，剩下的牌牆是重洗結果中連續的一段
const played = E.create(987654, rules),
  playedPrint = F.fingerprint(played);
let guard = 0;
while (played.phase !== 'ended' && guard++ < 400) {
  AI.act(played, played.turn, 'normal');
  if (played.phase === 'claim')
    for (let q = 0; q < 4 && played.phase === 'claim'; q++)
      if (!played.pending.decisions[q]) E.respond(played, q, AI.chooseClaim(played, q, 'normal'));
}
assert.equal(played.phase, 'ended');
assert.ok(played.wall.length < 60, '模擬的牌局要真的摸過很多牌');
const ok = F.verify(played, playedPrint);
assert.deepEqual(ok, { fingerprint: playedPrint, matches: true, wallIntact: true, ok: true });

// 3. 竄改：換掉一張剩下的牌，或公布的指紋不同，驗證都要失敗
const swapped = { ...played, wall: played.wall.slice() };
const i = swapped.wall.findIndex((t) => t !== swapped.wall[0]);
[swapped.wall[0], swapped.wall[i]] = [swapped.wall[i], swapped.wall[0]];
assert.equal(F.verify(swapped, playedPrint).wallIntact, false);
assert.equal(F.verify(swapped, playedPrint).ok, false);
assert.equal(F.verify(played, '00000000').ok, false);

// 4. 分享字串：編碼後解碼得到同一副牌；亂填的字串回傳 null
const code = F.encodeDeal(g);
const back = F.decodeDeal('https://x.test/app/#deal=' + code);
assert.deepEqual(back.opts, rules);
assert.equal(F.fingerprint(E.create(back.seed, back.opts)), print);
assert.equal(F.decodeDeal(code).seed, 123456789);
const big = E.create(Date.now(), rules); // 實際使用的種子是毫秒時間，大於 32 位元
assert.equal(F.fingerprint(E.create(F.decodeDeal(F.encodeDeal(big)).seed, rules)), F.fingerprint(big));
for (const bad of [
  '',
  '#deal=',
  '#deal=zz.9.0.0.16.1',
  '#deal=abc.1.0.0.8.1',
  'deal=abc.1.0.0.16.2',
  '#deal=zzzzzzzz.0.0.0.0.0',
])
  assert.equal(F.decodeDeal(bad), null, bad);

// 5. 畫面：開局顯示指紋；一局結束後攤牌、驗證通過；「再打一次」得到同一副牌
const ui = createUiContext();
ui.button('#openingActions', '開始').onclick();
assert.match(ui.get('#dealPrint').textContent, /^牌牆指紋 [0-9a-f]{6}$/);
const first = ui.run('F0 = Fairness.fingerprint(E.create(game.seed, Fairness.rulesOf(game))); dealPrint');
assert.equal(ui.run('F0'), first);
ui.run("game.phase = 'ended'; game.result = '流局';");
const card = ui.run('fairnessCard()');
assert.match(ui.text(card), /✓ 公平性驗證通過/);
assert.match(ui.text(card), /南家/);
const again = card.children
  .find((x) => x.className === 'fairness-actions')
  .children.find((x) => x.textContent.includes('再打一次'));
const seed = ui.run('game.seed');
again.onclick();
assert.equal(ui.run('game.seed'), seed, '同一副牌再打一次');
assert.equal(ui.run('dealPrint'), first);

// 6. 從分享連結打開：第一局就是分享的那副牌，莊家與圈風也照連結
const shared = createUiContext();
shared.run("location.hash = '#deal=" + code + "'; pendingDeal = Fairness.decodeDeal(location.hash);");
shared.button('#openingActions', '開始').onclick();
assert.equal(shared.run('game.seed'), 123456789);
assert.equal(shared.run('game.dealer'), 2);
assert.equal(shared.run('session.round'), 1);
assert.equal(shared.run('dealPrint'), print);
assert.equal(shared.run('pendingDeal'), null, '分享的牌局只用一次');

console.log('fairness tests passed');
