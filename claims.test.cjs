const E=require('./engine.js'),assert=require('node:assert/strict');
const base=[0,1,2,9,10,11,18,19,20,27,27,27,31,31,32,33];
function fixture(from,t,overrides={}){const g=E.create(123);g.hands=Array.from({length:4},()=>base.slice());for(const [p,h]of Object.entries(overrides))g.hands[p]=h.slice();g.hands[from].push(t);g.phase='discard';g.turn=from;assert.ok(E.discard(g,from,g.hands[from].length-1));return g;}
function settle(g,choices={}){for(let p=0;p<4&&g.phase==='claim';p++)if(!g.pending.decisions[p])E.respond(g,p,choices[p]||{type:'pass'});}
let g=fixture(3,3,{0:[1,2,4,5,...base.slice(4)]});
assert.equal(E.draw(g,0),false);assert.equal(E.claims(g,0).filter(a=>a.type==='chi').length,3);
assert.equal(E.claims(g,1).some(a=>a.type==='chi'),false);
const chi=E.claims(g,0).find(a=>a.type==='chi');settle(g,{0:chi});assert.equal(g.phase,'discard');assert.equal(g.hands[0].length,14);assert.equal(g.melds[0].length,1);assert.equal(E.draw(g,0),false);assert.equal(g.rivers[3].length,0);
g=fixture(3,3,{0:[1,2,4,5,...base.slice(4)],1:[3,3,...base.slice(2)]});const c=E.claims(g,0).find(a=>a.type==='chi'),p=E.claims(g,1).find(a=>a.type==='pon');settle(g,{0:c,1:p});assert.equal(g.turn,1);assert.equal(g.melds[1][0].type,'pon');
g=fixture(1,8,{0:[8,8,8,...base.slice(3)]});const n=g.wall.length;settle(g,{0:E.claims(g,0).find(a=>a.type==='kan')});assert.equal(g.melds[0][0].tiles.length,4);assert.equal(g.hands[0].length,14);assert.ok(g.wall.length<n);
g=E.create(1);g.hands[0]=[5,5,5,5,...base.slice(3)];g.phase='discard';assert.ok(E.selfKan(g,0,E.selfKans(g,0)[0]));assert.equal(g.melds[0][0].type,'concealed');assert.equal(g.hands[0].length,14);
g=E.create(1);g.melds[0]=[{type:'pon',tiles:[5,5,5],from:1}];g.hands[0]=[5,...base.slice(3)];g.phase='discard';assert.ok(E.selfKan(g,0,E.selfKans(g,0)[0]));assert.equal(g.melds[0][0].type,'added');assert.equal(g.hands[0].length,14);
const openWin=[9,10,11,18,19,20,27,27,27,30,30,30,31,31];assert.ok(E.winning(openWin,1));assert.equal(E.shanten(openWin.slice(0,-1),1),0);
g=fixture(2,31,{0:[0,1,2,9,10,11,18,19,20,27,27,27,30,30,30,31],1:[31,31,...base.slice(2)]});settle(g,{0:E.claims(g,0).find(a=>a.type==='ron'),1:E.claims(g,1).find(a=>a.type==='pon')});assert.equal(g.phase,'ended');assert.equal(g.turn,0);
// Full games with claims: conservation includes exposed sets and concealed kongs.
for(let seed=0;seed<20;seed++){
 g=E.create(seed);let steps=0;
 while(g.phase!=='ended'){
  assert.ok(++steps<400);
  if(g.phase==='claim'){for(let p=0;p<4&&g.phase==='claim';p++)if(!g.pending.decisions[p])E.respond(g,p,E.claims(g,p)[0]||{type:'pass'});}
  else if(g.phase==='draw')E.draw(g,g.turn);
  else{const k=E.selfKans(g,g.turn);if(k.length)E.selfKan(g,g.turn,k[0]);else if(E.winning(g.hands[g.turn],g.melds[g.turn].length))E.win(g,g.turn);else E.discard(g,g.turn,0);}
  const all=[...g.wall,...g.hands.flat(),...g.flowers.flat(),...g.rivers.flat(),...g.melds.flatMap(ms=>ms.flatMap(m=>m.tiles))];assert.equal(all.length,144);for(let t=0;t<42;t++)assert.equal(all.filter(x=>x===t).length,t<34?4:1);
 }
}
console.log('PASS: chi restrictions and combinations, priority, pon, open/concealed/added kong, supplement, open-hand win, ron and 20 claim-game conservation checks.');
