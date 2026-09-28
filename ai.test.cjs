const assert=require('node:assert/strict'),E=require('./engine'),C=require('./coach');
for(const seed of [2,5]){const g=E.create(seed);g.phase='claim';g.pending={from:3,tile:g.hands[0][0],decisions:{}};g.rivers[3]=[g.pending.tile];assert.equal(C.chooseClaim(g,0).type,seed===2?'pon':'chi');}
const actions=new Set();
const kg=E.create(1);kg.hands[0]=[27,27,27,27,0,1,2,9,10,11,18,19,20,31,31,32,33];kg.melds=[[],[],[],[]];kg.rivers=[[],[],[],[]];kg.phase='discard';assert.equal(C.chooseKan(kg,0).type,'concealed');
kg.hands[0]=[27,0,1,2,9,10,11,18,19,20,31,31,32,33];kg.melds[0]=[{type:'pon',tiles:[27,27,27],from:1}];assert.equal(C.chooseKan(kg,0).type,'added');
for(const seed of [2,5,13]){
 const g=E.create(seed);let steps=0;
 while(g.phase!=='ended'){
  assert.ok(++steps<450,'AI game must terminate');
  if(g.phase==='claim'){for(let p=0;p<4&&g.phase==='claim';p++)if(!g.pending.decisions[p]){const a=C.chooseClaim(g,p);actions.add(a.type);assert.ok(E.respond(g,p,a));}}
  else if(g.phase==='draw')E.draw(g,g.turn);
  else {const p=g.turn;if(E.winning(g.hands[p],g.melds[p].length))E.win(g,p);else {const a=C.chooseKan(g,p);if(a){actions.add(a.type);assert.ok(E.selfKan(g,p,a));}else {const best=E.analyze(g.hands[p],E.publicTiles(g,p),g.melds[p].length)[0];assert.ok(E.discard(g,p,g.hands[p].indexOf(best.tile)));}}}
  const all=[...g.wall,...g.hands.flat(),...g.rivers.flat(),...g.flowers.flat(),...g.melds.flatMap(ms=>ms.flatMap(m=>m.tiles))];assert.equal(all.length,144);for(let t=0;t<42;t++)assert.equal(all.filter(x=>x===t).length,t<34?4:1);
 }
}
console.log('PASS: AI chi/pon decisions, three full strategy games, termination and tile conservation; actions:',[...actions].join(', '));
