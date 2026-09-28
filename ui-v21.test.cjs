const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const nodes=new Map();
class Element{constructor(){this.children=[];const cls=new Set();this.cls=cls;this.classList={add:(...x)=>x.forEach(c=>cls.add(c)),remove:(...x)=>x.forEach(c=>cls.delete(c)),toggle:(c,on)=>{if(on===undefined?!cls.has(c):on)cls.add(c);else cls.delete(c);return cls.has(c);},contains:c=>cls.has(c)};this.style={setProperty(){}};}replaceChildren(...x){this.children=[...x];}append(...x){this.children.push(...x);}setAttribute(){}}
const get=s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s);};
const timers=new Map();let id=0;
const c=vm.createContext({Mahjong:require('./engine.js'),document:{querySelector:get,querySelectorAll:()=>[],createElement:()=>new Element()},navigator:{},setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:i=>timers.delete(i),console,Math});
c.Defense=require('./defense.js');c.Coach=require('./coach.js');c.Scoring=require('./scoring.js');c.AI=require('./ai.js');c.Quiz=require('./quiz.js');
c.Sound={play(){},say(){},tileName:()=>'',stop(){},setEnabled(){},isEnabled:()=>true};
vm.runInContext(fs.readFileSync('tiles.js','utf8'),c);
vm.runInContext(fs.readFileSync('app.js','utf8'),c);
const run=code=>vm.runInContext(code,c),text=n=>[n.textContent||'',...(n.children||[]).map(text)].join(' ');
// 預設桌規：過水、保留八墩
assert.equal(run('game.passWater'),true);assert.equal(run('game.reserve'),16);assert.equal(+get('#wallCount').textContent,run('game.wall.length-16'));
// 摸切：點最右邊剛摸的牌
run("game.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,31,8];game.wall.push(8);game.turn=0;game.phase='draw';render();");
get('#drawButton').onclick();assert.equal(run('lastDrawn'),8);
// 整理手牌時剛摸的牌仍在最右邊
run("game.hands[0].reverse();game.hands[0].push(game.hands[0].splice(game.hands[0].indexOf(8),1)[0]);");get('#sortButton').onclick();
assert.equal(run('game.hands[0].at(-1)'),8);assert.deepEqual(run('game.hands[0].slice(0,-1)'),run('game.hands[0].slice(0,-1).slice().sort((a,b)=>a-b)'));
// 選手中另一張 8萬 → 空切提示
const hand=get('#hand');const other=run('game.hands[0].indexOf(8)');assert.notEqual(other,16);
hand.children[other].onclick();assert.match(get('#phaseHelp').textContent,/空切/);
hand.children[other].onclick();
assert.equal(run("game.log.findLast(e=>e.action==='discard'&&e.player===0).cut"),'empty');assert.equal(run('turnLog.at(-1).cut'),'empty');assert.match(get('#toast').textContent,/空切/);
// 牌河：自己的空切標「空」，別家的空切看起來是手切
run("neatRiver=true;render();");
assert.equal(run("cutShown(0,'empty')"),'empty');assert.equal(run("cutShown(2,'empty')"),'hand');
// 讀牌：下家連續摸切顯示在座位資訊與讀牌筆記
run("game.rivers[1]=[27,5,6,7];game.cuts[1]=['hand','tsumo','tsumo','tsumo'];game.wall=game.wall.slice(0,70);game.turn=2;game.phase='draw';game.pending=null;render();");
assert.match(get('#seatInfo1').textContent,/連續摸切 3/);
assert.match(text(get('#coachBody')),/讀牌筆記/);assert.match(text(get('#coachBody')),/連續摸切 3 次/);
// 過水：放過胡牌後，打出一張前不能胡
run("game.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,27,31];game.melds=[[],[],[],[]];game.rivers[3]=[31];game.cuts[3]=['hand'];game.turn=0;game.phase='claim';game.pending={from:3,tile:31,decisions:{1:{type:'pass'},2:{type:'pass'},3:{type:'pass'}}};render();");
const actions=get('#claimActions').children;assert.ok(actions.some(b=>/胡/.test(b.textContent)));
actions.at(-1).onclick();assert.equal(run('game.water[0]'),true);assert.match(get('#toast').textContent,/過水/);
run("game.phase='claim';game.pending={from:1,tile:31,decisions:{2:{type:'pass'},3:{type:'pass'},1:{type:'pass'}}};render();");
assert.ok(!get('#claimActions').children.some(b=>/^胡/.test(b.textContent)),'過水中沒有胡的按鈕');
assert.match(text(get('#coachBody')),/過水中/);
// 教練：效率相同先打客風
run("game.water=[false,false,false,false];game.phase='discard';game.turn=0;game.pending=null;game.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,13,13,28,31,6];game.rivers=[[],[],[],[]];game.cuts=[[],[],[],[]];game.melds=[[],[],[],[]];lastDrawn=6;analyze();render();");
assert.equal(run('currentExplain().best.tile'),28);assert.match(run('currentExplain().lines.join()'),/客風/);
console.log('PASS: 預設過水與保留八墩、摸切／空切、整理手牌保留摸牌位置、別家空切顯示為手切、連續摸切讀牌、過水封鎖胡牌、客風優先。');
