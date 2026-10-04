// 高級電腦的三種風格（src/core/ai.js 的 STYLES）：同一個決策核心、不同參數；風格是公開資訊，
// 教練讀牌時用該風格自己校準的聽牌模型。
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const AI = require('../src/core/ai.js');
const O = require('../src/core/opponents.js');
const CAL = require('../src/core/data/calibration.js');
const Observation = require('../src/core/observation.js');
const { createUiContext } = require('./helpers.cjs');

test('三種風格都能完整打完一局，牌數守恆', () => {
  for (const style of Object.keys(AI.STYLES)) {
    const g = E.create(31, { reserve: 16, passWater: true });
    let steps = 0;
    while (g.phase !== 'ended' && steps++ < 600) {
      AI.act(g, g.turn, style);
      if (g.phase === 'claim')
        for (let q = 0; q < 4 && g.phase === 'claim'; q++)
          if (!g.pending.decisions[q]) assert.ok(E.respond(g, q, AI.chooseClaim(g, q, style)));
    }
    assert.equal(g.phase, 'ended', style);
    const all = [
      ...g.wall,
      ...g.hands.flat(),
      ...g.rivers.flat(),
      ...g.flowers.flat(),
      ...g.melds.flatMap((ms) => ms.flatMap((m) => m.tiles)),
    ];
    assert.equal(all.length, 144, style);
  }
});

test('風格參數：速攻不看門清台、保守多算之後的放槍、大牌把台數看重', () => {
  assert.equal(AI.coreOpts('fast').claimMode, 'efficiency');
  assert.equal(AI.coreOpts('safe').future, 2);
  assert.equal(AI.coreOpts('big').valueWeight, 2);
  assert.deepEqual(AI.coreOpts('hard'), {});
  assert.equal(AI.coreOpts('normal'), null);
});

test('風格是公開資訊；已知風格時用該風格的聽牌模型', () => {
  const g = E.create(9);
  g.playerStyles = [null, 'fast', 'big', 'safe'];
  assert.deepEqual(Observation.forPlayer(g, 0).playerStyles, [null, 'fast', 'big', 'safe']);
  assert.ok(CAL.styles && CAL.styles.fast && CAL.styles.fast.tenpaiModel, '校準資料要有各風格的模型');
  g.rivers[1] = [27, 28, 0, 8, 9, 17, 18, 26, 31, 32];
  g.cuts[1] = Array(10).fill('tsumo');
  g.melds[1] = [{ type: 'pon', tiles: [4, 4, 4], from: 2 }];
  g.wall = g.wall.slice(0, 30); // 後盤：連續摸切、攤了一組
  const known = O.tenpaiProb(g, 1);
  delete g.playerStyles;
  const unknown = O.tenpaiProb(g, 1);
  assert.ok(known > 0 && unknown > 0);
  assert.notEqual(known, unknown, '速攻的模型和混合模型不同');
});

test('畫面：高級＋混合時三家各一種風格，並寫進牌局', () => {
  const ui = createUiContext({
    storage: { 'mahjong-coach-settings': JSON.stringify({ level: 'hard', style: 'mixed' }) },
  });
  assert.deepEqual(JSON.parse(ui.run('JSON.stringify([1,2,3].map(levelFor))')), ['fast', 'big', 'safe']);
  assert.deepEqual(JSON.parse(ui.run('JSON.stringify(declareStyles({}).playerStyles)')), [
    null,
    'fast',
    'big',
    'safe',
  ]);
  ui.run("settings.style = 'safe'");
  assert.deepEqual(JSON.parse(ui.run('JSON.stringify([1,2,3].map(levelFor))')), ['safe', 'safe', 'safe']);
  ui.run("settings.level = 'normal'");
  assert.equal(ui.run('levelFor(2)'), 'normal');
  assert.equal(ui.run('declareStyles({}).playerStyles'), undefined);
});
