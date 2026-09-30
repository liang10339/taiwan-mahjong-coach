// 實戰記錄畫面（src/ui/app/manual-panel.js）：輸入起手、記幾手、覆盤。
const assert = require('node:assert/strict');
const { createUiContext } = require('./helpers.cjs');

const ui = createUiContext();
const panel = () => ui.get('#manualPanel');
/** 在面板裡（含子元素）找按鈕 */
function find(node, test) {
  if (node.tagName === 'BUTTON' && test(node)) return node;
  for (const c of node.children || []) {
    const hit = find(c, test);
    if (hit) return hit;
  }
  return null;
}
const click = (label) => {
  const b = find(panel(), (x) => x.textContent === label);
  if (!b) throw new Error('找不到按鈕：' + label + '｜' + ui.text(panel()));
  b.onclick();
};
/** 點調色盤裡的某張牌（依 aria-label） */
const tile = (name) => {
  const b = find(panel(), (x) => x.attributes['aria-label'] === name);
  if (!b) throw new Error('找不到牌：' + name);
  b.onclick();
};

ui.run('renderManual()');
assert.match(ui.text(panel()), /實戰記錄/);
click('新增實戰記錄');
// 起手 16 張：1-9 萬、1-7 筒
for (const n of [
  '1萬',
  '2萬',
  '3萬',
  '4萬',
  '5萬',
  '6萬',
  '7萬',
  '8萬',
  '9萬',
  '1筒',
  '2筒',
  '3筒',
  '4筒',
  '5筒',
  '6筒',
  '7筒',
])
  tile(n);
assert.match(ui.text(panel()), /起手 16 \/ 16/);
click('開始記錄');
// 你是莊家：摸 9 筒、打 9 筒；下家摸、打東；對家碰東
click('摸');
tile('9筒');
click('打');
tile('9筒');
assert.match(ui.text(panel()), /輪到下家摸牌/);
click('摸');
click('打');
tile('東');
click('對家');
click('碰');
assert.match(ui.text(panel()), /對家碰/);
// 不合理的一步會被拒絕（對家碰完該出牌，你手上沒有東）
const before = ui.run('manual.record.events.length');
click('你');
click('打');
assert.equal(
  find(panel(), (x) => x.attributes['aria-label'] === '東'),
  null,
  '你出牌只能選手上的牌',
);
assert.equal(ui.run('manual.record.events.length'), before);
click('撤銷上一步');
assert.equal(ui.run('manual.record.events.length'), before - 1);
// 存檔：重新整理後草稿還在
assert.ok(ui.store.get('mahjong-coach-manual-draft'));
click('記到這裡（流局或不記了）並覆盤');
assert.match(ui.text(panel()), /共 1 手出牌/);
assert.ok(JSON.parse(ui.store.get('mahjong-coach-manual')).length === 1);
click('關閉覆盤');
assert.ok(
  find(panel(), (x) => x.textContent === '覆盤'),
  '清單裡有剛才的記錄',
);
console.log('manual record UI tests passed');
