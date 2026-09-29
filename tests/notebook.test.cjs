// 錯題本（src/core/notebook.js）與畫面（src/ui/app/notebook-panel.js）。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const N = require('../src/core/notebook.js');
const { createUiContext } = require('./helpers.cjs');

// 17 張手牌：打掉孤張 27（東）或 33（中）才是正確答案，拆順子是失誤
const hand = [0, 1, 2, 9, 10, 11, 18, 19, 20, 3, 4, 13, 14, 23, 24, 27, 33];
const options = E.analyze(hand, [], 0);
const worst = options.at(-1).tile;
const T0 = 1_000_000;

// 1. 建立題目：複製資料、馬上到期；同一局面不重複加入
const item = N.fromMistake({ hand, pub: [5, 6], played: worst, label: '東風東局', time: T0 });
assert.notEqual(item.hand, hand, '要複製手牌，不能共用原陣列');
assert.equal(item.box, 0);
assert.equal(item.due, T0);
let book = N.add([], item);
book = N.add(book, N.fromMistake({ hand: hand.slice().reverse(), pub: [5, 6], played: worst, time: T0 + 5 }));
assert.equal(book.length, 1, '手牌順序不同但同一局面，不重複加入');
assert.deepEqual(N.stats(book, T0), { total: 1, due: 1, mastered: 0 });

// 2. 評分：並列最佳的牌都算對，失誤的牌算錯並附解說
const wrong = N.check(item, worst);
assert.equal(wrong.correct, false);
assert.ok(wrong.answers.length >= 1 && !wrong.answers.includes(worst));
assert.ok(wrong.judge && wrong.lines.length > 0, '答錯要有教練解說');
for (const t of wrong.answers) assert.equal(N.check(item, t).correct, true, '並列最佳都算對：' + t);

// 3. 間隔重複：答錯十分鐘後再考；連續答對逐盒拉長，第五次答對就熟練、不再出現
book = N.answer(book, item.id, false, T0);
assert.equal(book[0].box, 0);
assert.equal(book[0].due, T0 + N.RETRY);
assert.equal(N.due(book, T0 + N.RETRY - 1).length, 0, '還沒到十分鐘不出題');
assert.equal(N.due(book, T0 + N.RETRY).length, 1);
let now = T0 + N.RETRY;
for (let i = 1; i <= N.MASTERED; i++) {
  book = N.answer(book, item.id, true, now);
  assert.equal(book[0].box, i);
  if (i < N.MASTERED) {
    assert.equal(book[0].due, now + N.INTERVALS[i]);
    now = book[0].due;
  }
}
assert.deepEqual(N.stats(book, now * 10), { total: 1, due: 0, mastered: 1 });
assert.equal(book[0].seen, 6);
assert.equal(book[0].right, 5);
// 存成 JSON 再讀回來，熟練的題目依然不會到期
const restored = JSON.parse(JSON.stringify(book));
assert.equal(N.due(restored, Number.MAX_SAFE_INTEGER - 1).length, 0);

// 4. answer 不改動原陣列；上限滿了先刪熟練的題目
const before = [N.fromMistake({ hand, played: worst, time: T0 })];
N.answer(before, before[0].id, true, T0);
assert.equal(before[0].box, 0);
let full = [{ ...item, id: 'done', box: N.MASTERED }];
for (let i = 1; i < N.LIMIT; i++) full.push({ ...item, id: 'x' + i });
full = N.add(full, { ...item, id: 'new' });
assert.equal(full.length, N.LIMIT);
assert.equal(full[0].id, 'new');
assert.ok(!full.some((x) => x.id === 'done'), '超過上限時先刪熟練的題目');

// 5. 畫面：實戰失誤存進錯題本 → 分頁顯示待複習數 → 開始複習、作答、看結果
const ui = createUiContext();
ui.button('#openingActions', '開始').onclick();
ui.run('game.hands[0] = ' + JSON.stringify(hand) + '; rememberMistake(' + worst + ');');
const saved = JSON.parse(ui.store.get('mahjong-coach-notebook'));
assert.equal(saved.length, 1);
assert.equal(saved[0].played, worst);
assert.equal(ui.get('.mode-tab[data-mode="review"]').dataset.badge, '1');

ui.run('renderNotebook()');
assert.match(ui.text(ui.get('#notebookPanel')), /今天要複習 1 題/);
ui.button('#notebookPanel', '開始複習').onclick();
const tileButtons = () =>
  ui.get('#notebookPanel').children.find((x) => x.className === 'notebook-hand').children;
assert.equal(tileButtons().length, hand.length);
tileButtons()[hand.indexOf(worst)].onclick();
assert.match(ui.text(ui.get('#notebookPanel')), /教練建議打/);
assert.equal(JSON.parse(ui.store.get('mahjong-coach-notebook'))[0].seen, 1, '作答結果要存起來');
ui.button('#notebookPanel', '看結果').onclick();
assert.match(ui.text(ui.get('#notebookPanel')), /答對 0 \/ 1 題/);
ui.button('#notebookPanel', '回到錯題本').onclick();
assert.match(ui.text(ui.get('#notebookPanel')), /沒有到期的題目/, '答錯的題目十分鐘後才再出現');
assert.equal(ui.get('.mode-tab[data-mode="review"]').dataset.badge, '');

console.log('notebook tests passed');
