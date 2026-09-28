const assert=require('node:assert/strict'),E=require('./engine'),C=require('./coach');
function fixture(){
 const g=E.create(1),wall=[];for(let t=0;t<42;t++)for(let i=0;i<(t<34?4:1);i++)wall.push(t);
 const take=h=>{for(const t of h){const i=wall.indexOf(t);assert.ok(i>=0);wall.splice(i,1);}return h;};
 g.melds=[[{type:'pon',tiles:take([4,4,4]),from:2}],[],[],[]];
 g.hands=[take([4,0,0,0,6,6,6,21,21,21,28,28,28,33]),take([2,3,9,10,11,12,13,14,18,19,20,27,27,27,31,31]),[],[]];
 g.rivers=[[],[],take([8]),[]];g.flowers=[[],[],[],[]];g.wall=wall;g.phase='discard';g.turn=0;g.pending=null;g.log=[];return g;
}
function conservation(g){const all=[...g.wall,...g.hands.flat(),...g.rivers.flat(),...g.flowers.flat(),...g.melds.flatMap(ms=>ms.flatMap(m=>m.tiles))];assert.equal(all.length,144);for(let t=0;t<42;t++)assert.equal(all.filter(x=>x===t).length,t<34?4:1);}
let g=fixture(),n=g.wall.length;assert.ok(E.selfKan(g,0,E.selfKans(g,0)[0]));assert.equal(g.phase,'claim');assert.equal(g.pending.kind,'robkan');assert.equal(g.wall.length,n);assert.equal(g.melds[0][0].type,'pon');assert.equal(E.draw(g,0),false);assert.equal(E.discard(g,0,0),false);assert.equal(E.selfKan(g,0,{type:'added',tile:4,meld:0}),false);
assert.deepEqual(E.claims(g,1).map(a=>a.type),['ron']);assert.equal(E.publicTiles(g,1).filter(t=>t===4).length,4);assert.equal(E.publicTiles(g,0).filter(t=>t===4).length,3);conservation(g);
assert.equal(C.chooseClaim(g,1).type,'ron');E.respond(g,1,{type:'ron',tiles:[4]});assert.equal(g.phase,'ended');assert.match(g.result,/搶槓胡/);assert.equal(g.wall.length,n);assert.deepEqual(g.rivers[2],[8]);assert.equal(g.melds[0][0].tiles.length,3);assert.ok(g.log.at(-1).robKan);conservation(g);
g=fixture();n=g.wall.length;E.selfKan(g,0,E.selfKans(g,0)[0]);assert.ok(E.respond(g,1,{type:'pass'}));assert.equal(g.phase,'discard');assert.equal(g.turn,0);assert.equal(g.melds[0][0].type,'added');assert.ok(g.wall.length<n);assert.equal(E.respond(g,1,{type:'pass'}),false);conservation(g);
// All supplement tiles are flowers: finish the kan, then draw game rather than illegal discard.
g=fixture();g.wall=[34];E.selfKan(g,0,E.selfKans(g,0)[0]);E.respond(g,1,{type:'pass'});assert.equal(g.phase,'ended');assert.match(g.result,/流局/);
// Closest claimant wins; multiple rob-kan declarations never duplicate the tile.
g=fixture();g.hands[2]=g.hands[1].slice();E.selfKan(g,0,E.selfKans(g,0)[0]);E.respond(g,2,{type:'ron',tiles:[4]});assert.equal(g.phase,'claim');E.respond(g,1,{type:'ron',tiles:[4]});assert.equal(g.turn,1);
console.log('PASS: rob-kan window, ron-only claims, guards, visibility, all-pass supplement, empty supplement, nearest winner and 144-tile conservation.');
