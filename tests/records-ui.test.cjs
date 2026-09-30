// 牌譜畫面（src/ui/app/records-panel.js）：自動保存、重新整理後接續、打完放進歷史、回放、匯入。
const assert = require('node:assert/strict');
const { createUiContext } = require('./helpers.cjs');

// 1. 打幾步後自動保存；剛開頁（還沒有動作）不會蓋掉存檔
const ui = createUiContext();
ui.button('#openingActions', '開始').onclick();
for (let i = 0; i < 40 && !ui.run("game.turn === 0 && game.phase === 'draw'"); i++) ui.flush();
ui.run("if (game.turn === 0 && game.phase === 'draw') { $('#drawButton').onclick(); }");
ui.run(
  "if (game.turn === 0 && game.phase === 'discard') { selected = game.hands[0].length - 1; $('#discardButton').onclick(); }",
);
const saved = JSON.parse(ui.store.get('mahjong-coach-current'));
assert.ok(saved && saved.record.commands.length > 0, '有動作後要自動保存');
const logLength = ui.run('game.log.length');
const turns = ui.run('turnLog.length');

// 2. 重新整理（新的畫面、同一份儲存）：開始畫面出現「接續上一局」，按下後回到同一個局面
const again = createUiContext({ storage: Object.fromEntries(ui.store) });
assert.ok(again.button('#openingActions', '接續上一局'), '要能接續上一局');
again.button('#openingActions', '接續上一局').onclick();
assert.equal(again.run('game.log.length'), logLength);
assert.equal(again.run('turnLog.length'), turns, '覆盤紀錄一起接回來');
assert.equal(again.run('openingActive'), false);

// 3. 打完一局：完整牌譜放進歷史、未完成存檔清掉；覆盤分頁可以回放
again.run("clearTimeout(timer); game.phase = 'ended'; game.result = '測試流局'; render();");
const records = JSON.parse(again.store.get('mahjong-coach-records'));
assert.equal(records.length, 1);
assert.equal(again.store.has('mahjong-coach-current'), false, '打完就不再提示接續');
again.run('renderRecords()');
const row = again.get('#recordPanel').children.find((x) => x.className === 'record-row');
row.children.find((x) => x.tagName === 'BUTTON' && x.textContent === '回放').onclick();
assert.match(again.text(again.get('#recordPanel')), /第 0 \/ \d+ 步/);
again.run('viewer.step = 2; renderRecords()');
assert.match(again.text(again.get('#recordPanel')), /第 2 \/ \d+ 步/);
again.run('viewer.step = 9999; renderRecords()');
assert.match(again.text(again.get('#recordPanel')), /第 (\d+) \/ \1 步/, '超過最後一步就停在最後一步');
assert.match(again.text(again.get('#recordPanel')), /你|南家|西家|北家/);

// 4. 匯入：錯誤的檔案要說明原因；正確的牌譜直接打開回放
const notes = [];
again.run('notify = (t) => notes.push(t)'.replace('notes', 'globalThis.__notes'));
again.context.__notes = notes;
assert.equal(again.run('importRecordText("{}")'), false);
assert.match(notes.join(''), /不是本程式的牌譜/);
assert.equal(again.run('importRecordText(' + JSON.stringify(JSON.stringify(records[0].record)) + ')'), true);
assert.match(again.text(again.get('#recordPanel')), /匯入的牌譜/);

console.log('records UI tests passed');
