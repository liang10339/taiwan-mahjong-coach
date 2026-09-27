const assert=require('node:assert/strict');
const E=require('./engine.js');
function conserved(g){const all=[...g.wall,...g.hands.flat(),...g.flowers.flat(),...g.rivers.flat()];assert.equal(all.length,144);for(let t=0;t<42;t++)assert.equal(all.filter(x=>x===t).length,t<34?4:1);}
for(let seed=0;seed<40;seed++){
 const g=E.create(seed);conserved(g);assert.deepEqual(g,E.create(seed));g.hands.forEach(h=>assert.equal(h.length,16));
 let rounds=0;
 while(g.phase!=='ended'){
  const p=g.turn;assert.equal(E.draw(g,(p+1)%4),false);
  if(!E.draw(g,p))break;
  assert.equal(g.hands[p].length,17);assert.equal(E.draw(g,p),false);
  assert.equal(E.discard(g,p,99),false);assert.equal(E.discard(g,p,0),true);assert.equal(g.hands[p].length,16);conserved(g);
  for(let q=0;q<4&&g.phase==='claim';q++)if(!g.pending.decisions[q])E.respond(g,q,{type:'pass'});
  assert.ok(++rounds<=80);
 }
 assert.equal(g.wall.length,0);assert.equal(E.draw(g,g.turn),false);assert.equal(E.discard(g,g.turn,0),false);conserved(g);
}
const won=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,27,31,31];
assert.equal(E.winning(won),true);assert.equal(E.shanten(won),-1);assert.equal(E.shanten(won.slice(0,-1)),0);
assert.equal(E.winning([7,8,9,3,4,5,9,10,11,18,19,20,27,27,27,31,31]),false);
assert.equal(E.winning(Array(17).fill(0)),false);
const g=E.create(99);E.draw(g,0);console.time('coach');const choices=E.analyze(g.hands[0],g.rivers.flat());console.timeEnd('coach');
assert.ok(choices.length);const known=g.hands[0];for(const c of choices){assert.equal(c.remaining,c.improving.reduce((n,t)=>n+4-known.filter(x=>x===t).length,0));}
console.log('PASS: 40 complete games, 144-tile conservation, phase guards, reproducibility, win/shanten and coach counts.');
