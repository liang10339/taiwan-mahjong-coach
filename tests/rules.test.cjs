const assert=require('node:assert/strict'),E=require('../src/core/engine.js'),A=require('../src/core/ai.js'),S=require('../src/core/scoring.js');
// 摸切、手切、空切
let g=E.create(11);g.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,31,5];g.wall.push(5);
E.draw(g,0);assert.equal(g.hands[0].at(-1),5);
assert.equal(E.cutType(g,0,g.hands[0].length-1),'tsumo');
assert.equal(E.cutType(g,0,g.hands[0].indexOf(5)),'empty','打出手中另一張 5 是空切');
assert.equal(E.cutType(g,0,0),'hand');
E.discard(g,0,g.hands[0].indexOf(5));assert.deepEqual(g.cuts[0],['empty']);assert.equal(g.log.findLast(e=>e.action==='discard').cut,'empty');
for(let q=1;q<4&&g.phase==='claim';q++)if(!g.pending.decisions[q])E.respond(g,q,{type:'pass'});
// 被吃碰時牌河與摸切紀錄一起移除
g=E.create(12);g.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,31,31];g.hands[1]=[31,31,...g.hands[1].slice(2)];g.turn=0;g.phase='discard';g.fresh=null;
E.discard(g,0,g.hands[0].indexOf(31));assert.deepEqual(g.cuts[0],['hand']);
E.respond(g,1,{type:'pon',tiles:[31,31]});for(let q of [2,3])if(g.phase==='claim'&&!g.pending.decisions[q])E.respond(g,q,{type:'pass'});
assert.equal(g.rivers[0].length,0);assert.equal(g.cuts[0].length,0);
// 吃碰後出牌一定是手切
const p=g.turn;E.discard(g,p,0);assert.equal(g.cuts[p].at(-1),'hand');
// 過水：放過胡牌後，自己打出一張前不能胡；自摸不受影響
g=E.create(13,{passWater:true});g.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,27,31];g.hands[3]=[31,...g.hands[3].slice(1)];g.turn=3;g.phase='discard';
E.discard(g,3,0);assert.ok(E.claims(g,0).some(a=>a.type==='ron'));E.respond(g,0,{type:'pass'});assert.equal(g.water[0],true);
for(let q of [1,2])if(g.phase==='claim'&&!g.pending.decisions[q])E.respond(g,q,{type:'pass'});
g.hands[1].push(31);g.turn=1;g.phase='discard';E.discard(g,1,g.hands[1].length-1);
assert.equal(E.claims(g,0).some(a=>a.type==='ron'),false,'過水中不能胡');
E.respond(g,0,{type:'pass'});for(let q of [2,3])if(g.phase==='claim'&&!g.pending.decisions[q])E.respond(g,q,{type:'pass'});
g.turn=0;g.phase='discard';g.hands[0].push(8);E.discard(g,0,g.hands[0].length-1);assert.equal(g.water[0],false,'自己打出一張後解除過水');
// 沒開過水時照常可胡
g=E.create(13);g.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,27,31];g.turn=3;g.phase='discard';g.hands[3].push(31);E.discard(g,3,g.hands[3].length-1);E.respond(g,0,{type:'pass'});assert.equal(g.water[0],false);
// 保留八墩：剩 16 張就流局，最後一張可摸的牌算海底
g=E.create(14,{reserve:16});let steps=0;
while(g.phase!=='ended'&&steps++<400){if(g.phase==='claim'){for(let q=0;q<4&&g.phase==='claim';q++)if(!g.pending.decisions[q])E.respond(g,q,{type:'pass'});}else if(g.phase==='draw')E.draw(g,g.turn);else E.discard(g,g.turn,g.hands[g.turn].length-1);}
assert.equal(g.wall.length,16);assert.match(g.result,/8 墩/);
g=E.create(15,{reserve:16});g.wall=g.wall.slice(0,16);g.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,27,31];g.wall.push(31);g.turn=0;g.phase='draw';
E.draw(g,0);assert.ok(E.win(g,0));assert.ok(S.score(g,0).items.some(x=>x.name==='海底撈月'));
// 讀牌：連續摸切、攤牌同花色
g=E.create(16);g.rivers[2]=[27,28,5,6,7];g.cuts[2]=['hand','hand','tsumo','tsumo','tsumo'];g.wall=g.wall.slice(0,60);
let r=A.reading(g,2);assert.equal(r.streak,3);assert.deepEqual(r.recentHand,[27,28]);assert.equal(A.threat(g,2),1);
g.rivers[2].push(8);g.cuts[2].push('tsumo');assert.equal(A.reading(g,2).streak,4);assert.equal(A.threat(g,2),2);
g=E.create(17);g.melds[1]=[{type:'pon',tiles:[10,10,10]},{type:'chi',tiles:[12,13,14]}];assert.equal(A.reading(g,1).oneSuit,1);
const pin=A.danger(g,0,15),man=A.danger(g,0,6);assert.ok(pin.per.find(x=>x.player===1).suitHit);assert.ok(!man.per.find(x=>x.player===1).suitHit);
console.log('PASS: 摸切／手切／空切、被鳴牌時同步移除、過水與解除、保留八墩流局與海底、連續摸切與同花色讀牌。');
