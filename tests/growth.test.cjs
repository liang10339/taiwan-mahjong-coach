// 成長報告（src/core/growth.js）與畫面（src/ui/app/growth-panel.js）。
const assert = require('node:assert/strict');
const G = require('../src/core/growth.js');
const { createUiContext } = require('./helpers.cjs');

// 1. 一局的出牌紀錄 → 歷史欄位：依牌牆剩餘張數分到序盤／中盤／終盤
const turn = (wall, best, mistake = false) => ({
  judge: { verdict: best ? 'best' : 'other' },
  mistake,
  snapshot: { wall },
});
const s = G.summarize([
  turn(70, true),
  turn(60, false, true),
  turn(40, true),
  turn(20, true),
  turn(17, false),
]);
assert.deepEqual(s, {
  turns: 5,
  good: 3,
  mistakes: 1,
  stages: [
    [1, 2],
    [1, 1],
    [1, 2],
  ],
});
assert.equal(G.stageOf(G.EARLY), 0);
assert.equal(G.stageOf(G.MID), 1);
assert.equal(G.stageOf(G.MID - 1), 2);

// 2. 報告：最近 10 局和之前 10 局比較；趨勢由舊到新；舊版紀錄（沒有 won／stages）也能算
const hand = (good, extra = {}) => ({
  time: 0,
  turns: 10,
  good,
  mistakes: 10 - good > 4 ? 2 : 0,
  delta: 0,
  ...extra,
});
const history = [];
for (let i = 0; i < 10; i++)
  history.push(
    hand(8, {
      won: i < 3,
      dealIn: i === 9,
      stages: [
        [3, 3],
        [3, 4],
        [2, 3],
      ],
    }),
  );
for (let i = 0; i < 10; i++) history.push(hand(5)); // 較早的舊版紀錄
const r = G.report(history);
assert.equal(r.all.hands, 20);
assert.equal(r.recent.agreement, 0.8);
assert.equal(r.before.agreement, 0.5);
assert.equal(r.recent.winRate, 0.3);
assert.equal(r.recent.dealInRate, 0.1);
assert.equal(r.before.winRate, null, '舊版紀錄沒有胡牌資料，不能當成 0%');
assert.equal(r.recent.mistakesPer100, 0);
assert.equal(r.before.mistakesPer100, 20);
assert.equal(r.series.length, 20);
assert.equal(r.series[0].rate, 0.5, 'series 由舊到新');
assert.equal(r.series.at(-1).rate, 0.8);
assert.equal(r.series[10].avg, (5 * 4 + 8) / 50, '移動平均取最近 5 局');
assert.match(r.tips.join(''), /高 30 個百分點/);
assert.deepEqual(
  r.recent.stages.map((x) => x.rate),
  [1, 0.75, 2 / 3],
);
assert.equal(G.report([]).tips.length, 0);
assert.equal(G.report([{ turns: 0 }]).all.hands, 0, '沒出過牌的局（例如別家天胡）不算');

// 3. 退步與弱點提示
const worse = G.report([
  ...history.slice(10).map((x) => ({ ...x, good: 3, mistakes: 3 })),
  ...history.slice(0, 10),
]);
assert.match(worse.tips.join(''), /低 50 個百分點/);
assert.match(worse.tips.join(''), /錯題本/);
const weakLate = G.report(
  Array.from({ length: 5 }, () =>
    hand(7, {
      stages: [
        [4, 4],
        [3, 3],
        [0, 3],
      ],
    }),
  ),
);
assert.match(weakLate.tips.join(''), /終盤最弱/);

// 4. 畫面：沒有紀錄時顯示說明；有紀錄時顯示指標卡、趨勢圖、各階段與建議
const empty = createUiContext();
empty.run('renderGrowth()');
assert.match(empty.text(empty.get('#growthPanel')), /打完一局後/);

const ui = createUiContext({ storage: { 'mahjong-coach-history': JSON.stringify(history) } });
ui.run('renderGrowth()');
const panel = ui.get('#growthPanel');
const text = ui.text(panel);
assert.match(text, /與教練一致率\s+80%\s+▲ 30 個百分點/);
assert.match(text, /放槍率\s+10%/);
const chart = panel.children.find((x) => x.className === 'growth-chart');
assert.equal((chart.innerHTML.match(/class="dot"/g) || []).length, 20, '每局一個點');
assert.match(chart.innerHTML, /<title>第 20 局：一致率 80%/, '滑過點可以看到那一局的數字');
assert.match(text, /序盤\s+100%/);

// 5. 一局結束時寫入的歷史紀錄包含成長報告需要的欄位
const game = createUiContext();
game.button('#openingActions', '開始').onclick();
game.run(
  "turnLog = [{judge:{verdict:'best'}, snapshot:{wall:70}}, {judge:{verdict:'other'}, mistake:true, snapshot:{wall:30}}];" +
    "game.phase = 'end'; game.result = 'draw'; finishHand();",
);
const saved = JSON.parse(game.store.get('mahjong-coach-history'))[0];
assert.equal(saved.turns, 2);
assert.equal(saved.good, 1);
assert.equal(saved.mistakes, 1);
assert.equal(saved.won, false);
assert.equal(saved.dealIn, false);
assert.deepEqual(saved.stages, [
  [1, 1],
  [0, 0],
  [0, 1],
]);

console.log('growth tests passed');
