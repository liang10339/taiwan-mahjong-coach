const assert=require('node:assert/strict'),E=require('./engine.js'),C=require('./coach.js');
// 拆解結果必須與引擎的進聽數一致，且每張牌都被分配到一組
let seed=7;const rand=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
for(let k=0;k<1500;k++){
 const wall=[];for(let t=0;t<34;t++)for(let i=0;i<4;i++)wall.push(t);
 for(let i=wall.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[wall[i],wall[j]]=[wall[j],wall[i]];}
 const hand=wall.slice(0,16+k%2).sort((a,b)=>a-b),d=C.decompose(hand);
 assert.equal(d.shanten,E.shanten(hand));assert.equal(d.groups.flatMap(g=>g.tiles).length,hand.length);
}
// 搭子等牌
assert.deepEqual(C.groupWaits({kind:'ryanmen',tiles:[2,3]}),[1,4]);
assert.deepEqual(C.groupWaits({kind:'penchan',tiles:[0,1]}),[2]);
assert.deepEqual(C.groupWaits({kind:'penchan',tiles:[7,8]}),[6]);
assert.deepEqual(C.groupWaits({kind:'kanchan',tiles:[12,14]}),[13]);
// 並列時先建議單張字牌，並說明摸切
const hand=[2,3,6,8,8,9,12,15,17,18,19,21,23,27,27,27,33],pub=[30,31,12,15,1,5,12,9];
const options=E.analyze(hand,pub),ex=C.explainTurn(hand,options,{drawn:33,publicTiles:pub});
assert.equal(ex.best.tile,33);assert.match(ex.lines[0],/摸切/);assert.match(ex.lines[1],/單張字牌/);
assert.ok(ex.tied.length>=2);assert.match(ex.lines.join(''),/效果完全相同/);
// 聽牌時列出可胡的牌
const tenpai=[0,1,2,3,4,5,9,10,11,18,19,27,27,27,31,31,33];
const t=C.explainTurn(tenpai,E.analyze(tenpai,[]),{});
assert.equal(t.best.tile,33);assert.equal(t.best.shanten,0);assert.match(t.lines.join(''),/就聽牌/);
// 評語
assert.equal(C.judge(options,33,ex.best).verdict,'best');
assert.equal(C.judge(options,18,ex.best).verdict,'worse');
console.log('PASS: decomposition matches shanten, partial waits, tied-lead teaching order, tenpai explanation and discard judgement.');
