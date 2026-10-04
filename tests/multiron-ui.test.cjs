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
c.Coach = require('../src/core/coach.js');
c.Scoring = require('../src/core/scoring.js');
c.AI = require('../src/core/ai.js');
c.Opponents = require('../src/core/opponents.js');
c.Safety = require('../src/core/safety.js');
c.Policy = require('../src/core/policy.js');
c.Situation = require('../src/core/situation.js');
c.Advisor = require('../src/core/advisor.js');
c.Quiz = require('../src/core/quiz.js');
c.Sound = { play() {}, say() {}, tileName: () => '', stop() {}, setEnabled() {}, isEnabled: () => true };
require('./helpers.cjs').loadApp(c);
const run = (code) => vm.runInContext(code, c);
const text = (n) => [n.textContent || '', ...(n.children || []).map(text)].join(' ');
run('settings.seatDraw=false');

// 3 號位打出北風，0、1 號位等這張（一炮雙響）；開啟一炮多響
const waiting = [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 30, 30, 30, 31];
const base = [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 31, 31, 32, 33];
/** 開一局：dealer 當莊，winnersWaiting 是等這張牌的座位 */
function setup(dealer, winnersWaiting, multiRon) {
  run(
    `settings.multiRon=${multiRon};session.dealer=${dealer};session.settled=false;session.last=null;
     game=Mahjong.create(11,{dealer:${dealer},rules:{multiRon:${multiRon}}});
     game.hands=[0,1,2,3].map(()=>${JSON.stringify(base)}.slice());
     for(const p of ${JSON.stringify(winnersWaiting)}) game.hands[p]=${JSON.stringify(waiting)}.slice();
     game.hands[3].push(31);game.phase='discard';game.turn=3;
     Mahjong.discard(game,3,game.hands[3].length-1);`,
  );
  for (const p of [0, 1, 2]) {
    if (run('game.phase') !== 'claim') break;
    const ron = run(`Mahjong.claims(game,${p}).find(a=>a.type==='ron')||null`);
    run(`Mahjong.respond(game,${p},${JSON.stringify(ron || { type: 'pass' })})`);
  }
  run('render()');
}

// 1. 閒家一炮雙響，莊家（2 號位）沒胡：兩位贏家、各算台、點數守恆、下莊
setup(2, [0, 1], true);
assert.equal(run('game.phase'), 'ended');
assert.deepEqual(run('session.last.winners'), [0, 1]);
const d1 = run('session.last.deltas');
assert.equal(
  d1.reduce((a, b) => a + b, 0),
  0,
);
assert.ok(d1[0] > 0 && d1[1] > 0 && d1[3] < 0 && d1[2] === 0);
assert.equal(run('session.last.dealerStays'), false);
assert.equal(run('session.next.dealer'), 3);
assert.equal(run('winScores().length'), 2);
assert.match(text(get('#coachBody')), /胡牌[\s\S]*胡牌/, '教練欄應該列出兩張台數卡');
assert.match(get('#turnStatus').textContent, /台/);
assert.equal(run('discardPile().length'), 0, '被胡的牌只從牌河拿走一次');

// 2. 贏家裡有莊家：連莊
setup(1, [0, 1], true);
assert.deepEqual(run('session.last.winners'), [0, 1]);
assert.equal(run('session.last.dealerStays'), true);
assert.equal(run('session.next.dealer'), 1);

// 3. 預設（關閉）：同樣的局面只有最近的 0 號位胡
setup(2, [0, 1], false);
assert.deepEqual(run('session.last.winners'), [0]);
assert.equal(run('winScores().length'), 1);

console.log(
  'PASS: 一炮多響的畫面——多位贏家、各自台數卡、點數守恆、連莊與下莊、牌河只拿走一次、預設只有一家。',
);
