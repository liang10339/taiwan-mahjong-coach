// 技能標籤與熟練度（src/core/skills.js）、成長報告的技能區、錯題本的針對練習。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const A = require('../src/core/advisor.js');
const Sk = require('../src/core/skills.js');
const { createUiContext } = require('./helpers.cjs');

function table(hand) {
  const g = E.create(11, { dealer: 1 });
  g.hands[0] = hand;
  g.melds = [[], [], [], []];
  g.flowers = [[], [], [], []];
  g.rivers = [[], [], [], []];
  g.cuts = [[], [], [], []];
  g.turn = 0;
  g.phase = 'discard';
  g.fresh = null;
  return g;
}

test('孤張：只有一張、同門前後兩張內沒有別的牌', () => {
  assert.equal(Sk.isolated([0, 8, 27], 27), true);
  assert.equal(Sk.isolated([0, 2, 27], 0), false, '1、3 萬是嵌張搭子');
  assert.equal(Sk.isolated([0, 4, 27], 0), true);
  assert.equal(Sk.isolated([27, 27], 27), false, '一對不算孤張');
});

test('出牌的技能標籤', () => {
  // 早巡、有一張孤立的北：考孤張順序
  const hand = [0, 1, 2, 9, 10, 11, 18, 19, 20, 3, 4, 12, 13, 21, 22, 30, 5];
  const d = A.decide(table(hand), 0);
  assert.equal(d.efficiency.tile, 30);
  assert.deepEqual(Sk.ofDecision(d, hand), ['isolated']);
  // 打了就聽牌：考聽牌選擇
  const ready = [0, 1, 2, 9, 10, 11, 18, 19, 20, 3, 4, 5, 12, 13, 14, 27, 30];
  assert.ok(Sk.ofDecision(A.decide(table(ready), 0), ready).includes('tenpai'));
  assert.deepEqual(Sk.ofDecision(null), []);
});

test('累計與熟練度：樣本不足的不評，最弱的排前面', () => {
  const turns = [
    { skills: ['shape'], judge: { verdict: 'best' } },
    { skills: ['shape', 'defense'], judge: { verdict: 'worse' } },
    { skills: ['tenpai'], judge: { verdict: 'close' } },
  ];
  const t = Sk.tally(turns, [{ agree: true }, { agree: false }, { agree: null }]);
  assert.deepEqual(t, { shape: [1, 2], defense: [0, 1], tenpai: [0, 1], claim: [1, 2] });
  const history = [
    { skills: { shape: [9, 10], defense: [3, 10], tenpai: [1, 2] } },
    { skills: { defense: [2, 5] } },
  ];
  const m = Sk.mastery(history);
  assert.equal(m[0].tag, 'defense');
  assert.equal(m[0].status, 'practice');
  assert.equal(m.find((x) => x.tag === 'shape').status, 'mastered');
  assert.equal(m.find((x) => x.tag === 'tenpai').status, 'few');
  assert.equal(Sk.weakest(history).tag, 'defense');
  assert.equal(Sk.weakest([]), null);
});

test('畫面：成長報告列出技能熟練度，按鈕只練最弱的技能', () => {
  const history = [
    {
      time: 1,
      turns: 20,
      good: 12,
      mistakes: 3,
      stages: [
        [4, 6],
        [4, 7],
        [4, 7],
      ],
      skills: { defense: [2, 10], shape: [9, 10] },
    },
  ];
  const book = [
    {
      id: 'a',
      hand: [0, 1],
      open: 0,
      melds: [],
      pub: [],
      played: 0,
      box: 0,
      due: 0,
      created: 1,
      seen: 0,
      right: 0,
      skills: ['defense'],
      kind: 'defense',
      answers: [0],
      safety: [],
    },
    {
      id: 'b',
      hand: [0, 1],
      open: 0,
      melds: [],
      pub: [],
      played: 1,
      box: 0,
      due: 0,
      created: 2,
      seen: 0,
      right: 0,
      skills: ['shape'],
    },
  ];
  const ui = createUiContext({
    storage: {
      'mahjong-coach-history': JSON.stringify(history),
      'mahjong-coach-notebook': JSON.stringify(book),
    },
  });
  ui.run('renderGrowth()');
  const text = ui.text(ui.get('#growthPanel'));
  assert.match(text, /技能熟練度/);
  assert.match(text, /建議先練「防守判斷」/);
  const find = (node) =>
    node.tagName === 'BUTTON' && /到錯題本練/.test(node.textContent)
      ? node
      : (node.children || []).map(find).find(Boolean);
  find(ui.get('#growthPanel')).onclick();
  assert.deepEqual(JSON.parse(ui.run('JSON.stringify(notebookRun.queue)')), ['a']);
});
