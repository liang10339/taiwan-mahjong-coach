const vm = require('node:vm'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const nodes = new Map();
class Element {
  constructor() {
    this.children = [];
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.style = {};
  }
  replaceChildren(...x) {
    this.children = [...x];
  }
  append(...x) {
    this.children.push(...x);
  }
  setAttribute() {}
}
const get = (s) => {
  if (!nodes.has(s)) nodes.set(s, new Element());
  return nodes.get(s);
};
const timers = new Map();
let id = 0;
const c = vm.createContext({
  Mahjong: require('../src/core/engine.js'),
  document: { querySelector: get, querySelectorAll: () => [], createElement: () => new Element() },
  navigator: {},
  setTimeout: (f) => {
    timers.set(++id, f);
    return id;
  },
  clearTimeout: (i) => timers.delete(i),
  console,
  Math,
});
c.Defense = require('../src/core/defense.js');
c.Coach = require('../src/core/coach.js');
c.Scoring = require('../src/core/scoring.js');
c.AI = require('../src/core/ai.js');
c.Quiz = require('../src/core/quiz.js');
c.Sound = { play() {}, say() {}, tileName: () => '', stop() {}, setEnabled() {}, isEnabled: () => true };
require('./helpers.cjs').loadApp(c);
const run = (code) => vm.runInContext(code, c);
const text = (n) => [n.textContent || '', ...(n.children || []).map(text)].join(' ');
run('settings.seatDraw=false');
// 開頁：你是東家莊家，座位資訊有分數
assert.equal(run('game.dealer'), 0);
assert.match(get('#myInfo').textContent, /莊/);
assert.match(get('#roundName').textContent, /東風東局/);
// 莊家自摸：計台、結算、連莊
run(
  "game.hands[0]=[0,1,2,3,4,5,15,16,17,19,20,21,22,23,24,13];game.melds=[[],[],[],[]];game.flowers=[[],[],[],[]];game.log=[{player:1,action:'discard',tile:30},{player:0,action:'discard',tile:31}];game.wall.push(13);game.turn=0;game.phase='draw';render();",
);
get('#drawButton').onclick();
get('#winButton').onclick();
assert.equal(run('game.phase'), 'ended');
assert.equal(run('session.settled'), true);
const deltas = run('session.last.deltas');
assert.equal(
  deltas.reduce((a, b) => a + b, 0),
  0,
);
assert.ok(deltas[0] > 0);
assert.equal(run('session.next.dealer'), 0);
assert.equal(run('session.next.streak'), 1);
assert.match(text(get('#coachBody')), /連莊/);
// 下一局：連一，台數含連莊
get('#claimActions').children[0].onclick();
assert.equal(run('game.streak'), 1);
assert.equal(run('session.hand'), 2);
assert.match(get('#roundName').textContent, /連1/);
// 閒家胡牌 → 下莊
run(
  "game.hands[1]=[0,1,2,3,4,5,15,16,17,19,20,21,22,23,24,13,13];game.melds=[[],[],[],[]];game.log.push({player:0,action:'discard',tile:8},{player:1,action:'tsumo',tile:13});game.phase='ended';game.result='南家自摸';render();",
);
assert.equal(run('session.next.dealer'), 1);
assert.equal(run('session.next.streak'), 0);
const before = run('session.scores.slice()');
assert.ok(before[1] > 0 && before.reduce((a, b) => a + b, 0) === 0);
get('#claimActions').children[0].onclick();
assert.equal(run('game.dealer'), 1);
assert.match(get('#roundName').textContent, /東風南局/);
// 電腦當莊先動：清空計時器後輪到你
let guard = 0;
while (timers.size && run("game.turn!==0&&game.phase!=='ended'") && guard++ < 50) {
  const [i, f] = timers.entries().next().value;
  timers.delete(i);
  f();
}
// 打錯提醒：故意打教練首選以外、差很多的牌
run(
  "game.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,31,31,33];game.melds=[[],[],[],[]];game.turn=0;game.phase='discard';game.pending=null;analyze();render();",
);
const bad = run('game.hands[0].indexOf(19)');
get('#hand').children[bad].onclick();
get('#discardButton').onclick();
assert.equal(run('turnLog.at(-1).mistake'), true);
assert.match(run('turnLog.at(-1).warning'), /退了一步|損失了/);
assert.match(get('#toast').textContent, /⚠/);
// 覆盤：逐手回放面板
const review = get('#reviewView .empty-review');
assert.ok(review.children.some((n) => /逐手回放/.test(text(n))));
// 關閉提示：教練面板只留簡短說明；看提示可臨時顯示
run(
  "settings.coach=false;game.turn=0;game.phase='discard';game.pending=null;game.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,31,31,33];analyze();render();",
);
assert.match(text(get('#coachBody')), /教練提示已關閉/);
get('#hintButton').onclick();
assert.doesNotMatch(text(get('#coachBody')), /教練提示已關閉/);
// 危險度：開啟後手牌有標記
run('settings.danger=true;render();');
assert.ok(get('#hand').children.every((b) => /risk-(safe|mid|high)/.test(b.className)));
console.log(
  'PASS: dealer continuation, rotation, settlement, next hand, AI dealer start, mistake warning, replay, coach toggle and danger markers.',
);
