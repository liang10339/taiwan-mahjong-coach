const assert=require('node:assert/strict'),E=require('../src/core/engine.js'),C=require('../src/core/coach.js');
function fixture(hand,t,seed=1){const g=E.create(seed);g.hands[0]=hand.slice();g.rivers=[[],[],[],[t]];g.melds=[[],[],[],[]];g.phase='claim';g.pending={from:3,tile:t,decisions:{3:{type:'pass'}}};return g;}
const ready=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,31,31];
let g=fixture(ready,2),r=C.claimDecision(g);
assert.equal(r.best,undefined);assert.equal(r.options.length,3);assert.ok(r.options.every(o=>!o.recommend));
assert.equal(r.baseline.shanten,0);assert.equal(r.baseline.remaining,4);
assert.ok(r.options.some(o=>o.after.shanten===1));assert.match(r.summary,/略過/);
assert.ok(r.options.every(o=>/建議不吃/.test(o.text)&&/不吃：/.test(o.text)&&/建議打/.test(o.text)));
for(const o of r.options){
 const h=ready.slice();for(const t of o.action.tiles)h.splice(h.indexOf(t),1);h.splice(h.indexOf(o.after.tile),1);
 assert.equal(E.shanten(h,1),o.after.shanten);
 // Claimed tile is moved, not duplicated; discarded tile remains known.
 const known=[...ready,2];for(const out of o.after.outs)assert.equal(out.remaining,4-known.filter(t=>t===out.tile).length);
}
for(const seed of [2,5]){const s=E.create(seed);g=fixture(s.hands[0],s.hands[0][0]);r=C.claimDecision(g);assert.ok(r.best);assert.equal(r.best.action.type,seed===2?'pon':'chi');assert.ok(r.best.after.shanten<r.baseline.shanten||r.best.after.remaining>r.baseline.remaining);}
g=fixture(ready,27);r=C.claimDecision(g);assert.equal(r.best.action.type,'ron');assert.ok(r.options.filter(o=>o.action.type!=='ron').every(o=>!o.recommend&&/不建議/.test(o.text)));
g=fixture([27,27,27,0,1,2,9,10,11,18,19,20,31,31,32,33],27);
const snapshot=JSON.stringify(g);r=C.claimDecision(g);const kan=r.options.find(o=>o.action.type==='kan');assert.ok(kan.outcomes.length);assert.ok(kan.outcomes.every(o=>o.tile!==27));
for(const o of kan.outcomes){const h=g.hands[0].slice();for(let i=0;i<3;i++)h.splice(h.indexOf(27),1);h.push(o.tile);if(o.discard===null)assert.ok(E.winning(h,1));else {h.splice(h.indexOf(o.discard),1);assert.equal(E.shanten(h,1),o.shanten);}}
assert.equal(JSON.stringify(g),snapshot,'Advice cannot mutate game');
for(const o of kan.outcomes){if(o.discard!==null){assert.equal(o.effective,o.outs.reduce((n,x)=>n+x.remaining,0));const known=[...g.hands[0],...E.publicTiles(g),o.tile];for(const out of o.outs)assert.equal(out.remaining,4-known.filter(t=>t===out.tile).length);}}
if(kan.recommend){assert.equal(kan.narrower.length,0);assert.equal(kan.worse.length,0);}
const hidden=structuredClone(g);hidden.wall.reverse();hidden.hands[1]=[33];hidden.hands[2]=[0];assert.deepEqual(C.claimDecision(hidden),r,'Advice cannot depend on unseen tiles');
g.phase='discard';g.turn=0;g.hands[0].push(27);const self=C.selfKanDecision(g);assert.equal(self[0].action.type,'concealed');assert.match(self[0].text,/若不槓，現在建議打/);
g.melds[0]=[{type:'pon',tiles:[27,27,27],from:1}];g.hands[0]=[27,0,1,2,9,10,11,18,19,20,31,31,32,33];assert.equal(C.selfKanDecision(g)[0].action.type,'added');
console.log('PASS: decline tied/regressive chi, multiple chi choices, accept chi/pon, ron priority, exact visible counts, kan scenarios, self kans, no mutation or hidden-info leakage.');
