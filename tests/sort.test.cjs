// 整理手牌：第一次保留剛摸的牌在最右邊；其餘已排好時再按一次，連剛摸的牌一起插進去。
const assert = require('node:assert/strict');
const { createUiContext } = require('./helpers.cjs');

const ui = createUiContext();
ui.button('#openingActions', '開始').onclick();
ui.run(
  "clearTimeout(timer); game.hands[0]=[27,20,19,18,11,10,9,5,4,3,2,1,0,31,27,8]; game.wall.push(13); game.turn=0; game.phase='draw'; game.pending=null; render();",
);
ui.get('#drawButton').onclick();
assert.equal(ui.run('lastDrawn'), 13);
const sorted = (a) => a.every((t, i) => i === 0 || a[i - 1] <= t);

// 第一次：其餘排好，剛摸的 5筒 留在最右邊
ui.get('#sortButton').onclick();
assert.equal(ui.run('game.hands[0].at(-1)'), 13);
assert.ok(sorted(ui.run('game.hands[0].slice(0, -1)')));

// 再按一次：連 5筒 一起排進去
ui.get('#sortButton').onclick();
const hand = ui.run('game.hands[0]');
assert.ok(sorted(hand), '整手都要排好');
assert.notEqual(hand.at(-1), 13);

// 插進去後再打出它：引擎記為「空切」（別家看起來是手切），和實際牌桌一樣
ui.run('selected = game.hands[0].indexOf(13)');
ui.get('#discardButton').onclick();
const last = ui.run("game.log.filter((e) => e.action === 'discard' && e.player === 0).at(-1)");
assert.equal(last.tile, 13);
assert.equal(last.cut, 'empty');

console.log('sort tests passed');
