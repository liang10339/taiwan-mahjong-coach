// CI 守門：固定 24 副牌（種子 9001–9024，和大樣本評估的範圍不重疊）的公平對照，
// 「照教練打」輪流坐四個座位，各和「只看效率」比。樣本小、不能證明教練比較好，
// 只用來擋下明顯退步：防守失靈（放槍比只看效率還多）或得失大幅變差。
// 大樣本、有標準誤的結論請用 scripts/evaluate-coach.cjs。
const test = require('node:test');
const assert = require('node:assert/strict');
const Arena = require('../scripts/lib/arena.cjs');

const SEEDS = Array.from({ length: 24 }, (_, i) => 9001 + i);

test('公平對照可重現：同一副牌打兩次結果完全相同', () => {
  assert.deepEqual(Arena.duel(9001, 'coach', 'normal'), Arena.duel(9001, 'coach', 'normal'));
});

test('固定牌組：教練放槍不多於只看效率，平均得失沒有大幅退步', () => {
  const rows = SEEDS.map((s) => Arena.duel(s, 'coach', 'normal'));
  const sum = Arena.summarize(rows);
  const dealIns = (side) => rows.reduce((a, r) => a + r[side].dealIn, 0);
  console.log(
    '教練 放槍',
    dealIns('a'),
    '胡',
    rows.reduce((a, r) => a + r.a.won, 0),
    '｜效率 放槍',
    dealIns('b'),
    '胡',
    rows.reduce((a, r) => a + r.b.won, 0),
    '｜每局差',
    sum.mean.toFixed(2),
    '±',
    sum.se.toFixed(2),
  );
  // v2.8 時：教練放槍 11、效率 20；每局差 +1.19 ± 0.64 台
  assert.ok(dealIns('a') <= dealIns('b'), '教練放槍次數不應多於只看效率');
  assert.ok(sum.mean > -1, '每局平均得失不應比只看效率少一台以上');
});
