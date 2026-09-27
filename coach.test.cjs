const assert=require('node:assert/strict'),E=require('./engine'),C=require('./coach');
const hand=[2,3,6,8,8,9,12,15,17,18,19,21,23,27,27,27,33],visible=[30,31,12,15,1,5,12,9];
const options=E.analyze(hand,visible),white=options.find(o=>o.tile===33);
assert.equal(white.shanten,3);assert.equal(white.remaining,19);assert.ok(C.same(white,options[0]));
assert.match(C.answer('打白板可以嗎',hand,options,null),/並列/);assert.match(C.answer('為什麼不推薦白板',hand,options,33),/只是畫面截斷/);
assert.match(C.answer('這張可以嗎',hand,options,27),/距離聽牌多/);
assert.match(C.answer('打紅中',hand,options,null),/目前手牌沒有/);
assert.match(C.answer('今天幾號',hand,options,null),/尚未支援/);
assert.match(C.answer('147是什麼',hand,options,null),/不是固定留/);
for(let suit=0;suit<3;suit++)for(const pattern of C.patterns){
 const fragment=pattern.shape.map(n=>suit*9+n-1);
 const other=(suit+1)%3*9;
 const rest=[other,other+1,other+2,other+3,other+4,other+5,27,27,27,31,31];
 const waits=[];for(let t=0;t<34;t++)if(E.winning([...fragment,...rest,t]))waits.push(t);
 assert.deepEqual(waits,pattern.waits.map(n=>suit*9+n-1));
 assert.ok(C.patternHints(fragment).length);
}
assert.equal(C.patternHints([0,3,6]).length,0);
console.log('PASS: screenshot white tile tie, nonrecommended discard, questions, absent tiles, and all nine three-sided waiting examples.');
