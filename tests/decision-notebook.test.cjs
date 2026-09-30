// 覆習使用當時的攻守報告，不把防守選擇重新判成牌效率錯誤。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const N = require('../src/core/notebook.js');

const hand = [0, 1, 2, 9, 10, 11, 18, 19, 20, 3, 4, 13, 14, 23, 24, 27, 33];
const legacy = N.fromMistake({ hand, pub: [5, 6], played: 0 });
const legacyResult = N.check(legacy, 0);
assert.equal(legacyResult.basis, 'legacy-efficiency');
assert.match(legacyResult.lines.join('\n'), /舊題目.*僅依牌效率/);

// 報告推薦一張效率較差但防守較好的牌，合理替代牌也要接受；不再重算效率。
const efficiency = E.analyze(hand)[0].tile;
const recommended = E.analyze(hand).at(-1).tile;
assert.notEqual(efficiency, recommended);
const close = hand.find((tile) => ![efficiency, recommended].includes(tile));
const decision = {
  version: 1,
  recommended,
  efficiency,
  stance: 'fold',
  rationale: '自己的手牌較慢，依當時牌面優先防守。',
  options: [{ tile: recommended, shanten: 3, remaining: 8 }],
  assessments: [
    {
      tile: recommended,
      verdict: 'best',
      text: '推薦：優先防守。',
      mistake: false,
      warning: false,
      reason: '先打目前較安全的牌。',
    },
    {
      tile: close,
      verdict: 'close',
      text: '合理的替代選擇。',
      mistake: false,
      warning: false,
      reason: '安全性接近首選。',
    },
    {
      tile: efficiency,
      verdict: 'worse',
      text: '速度較好，但此時風險偏高。',
      mistake: true,
      warning: true,
      reason: '攻守綜合比較後不建議。',
    },
  ],
};
const item = N.fromMistake({ hand, played: efficiency, decision });
assert.notEqual(item.decision, decision, '報告要複製，不能和目前牌局共用參考');
decision.assessments[0].text = '已改動';
assert.equal(item.decision.assessments[0].text, '推薦：優先防守。');
const restored = JSON.parse(JSON.stringify(item));
assert.equal(N.check(restored, recommended).correct, true, '保存的防守推薦仍應算對');
assert.equal(N.check(restored, close).correct, true, '合理替代選擇也算對');
assert.equal(N.check(restored, efficiency).correct, false, '不改用效率排序推翻當時的攻守評估');
assert.equal(N.check(restored, efficiency).judge, '速度較好，但此時風險偏高。');
assert.equal(N.check(restored, recommended).basis, 'decision');
assert.deepEqual(N.check(restored, recommended).answers, [recommended, close]);
assert.match(N.check(restored, recommended).lines.join('\n'), /自己的手牌較慢.*\n先打目前較安全/);

// 去重：公開牌張數相同而牌種不同、攤牌數、規則、背景或報告版本不同，不能吞掉新題目。
const base = {
  hand,
  pub: [5, 5, 6],
  played: efficiency,
  rules: { version: 1, liguLigu: true },
  context: { base: 2.5, drawn: 0 },
  decision,
};
const id = N.fromMistake(base).id;
assert.equal(
  id,
  N.fromMistake({
    ...base,
    hand: hand.slice().reverse(),
    pub: [6, 5, 5],
    rules: { liguLigu: true, version: 1 },
    context: { drawn: 0, base: 2.5 },
  }).id,
);
for (const change of [
  { pub: [5, 6, 6] },
  { open: 1 },
  { melds: [[7, 7, 7]] },
  { rules: { version: 1, liguLigu: false } },
  { context: { base: 3, drawn: 0 } },
  { decision: { ...decision, version: 2 } },
])
  assert.notEqual(N.fromMistake({ ...base, ...change }).id, id, JSON.stringify(change));

// 放槍題只練防守，說明必須避免把結果反推為出牌錯誤。
const defense = N.fromDealIn({
  hand,
  played: efficiency,
  safety: [{ tile: efficiency, dealIn: 0.03, text: '估計風險 3%' }],
});
assert.equal(N.check(defense, efficiency).correct, true, '即使放槍，當時選擇仍可能最安全');
assert.equal(N.check(defense, efficiency).basis, 'defense');
assert.match(N.check(defense, efficiency).lines.join('\n'), /放槍不等於打錯/);

console.log('decision notebook tests passed');
