const assert=require('node:assert/strict'),E=require('./engine.js'),S=require('./scoring.js');
// 建立一個「已胡牌」的牌局狀態；w=萬 0-8、p=筒 9-17、s=索 18-26、東南西北 27-30、中發白 31-33
const W=n=>n-1,P=n=>8+n,S_=n=>17+n,EAST=27,SOUTH=28,WEST=29,NORTH=30,RED=31,GREEN=32,WHITE=33;
function game({hand,player=0,melds=[],flowers=[],tsumo=true,tile,from,log=[],wall=50,robKan=false,afterKan=false}){
 const g={hands:[[],[],[],[]],melds:[[],[],[],[]],flowers:[[],[],[],[]],wall:Array(wall).fill(0),log:[...log]};
 g.hands[player]=hand.slice();g.melds[player]=melds;g.flowers[player]=flowers;
 g.log.push(tsumo?{player,action:'tsumo',tile,afterKan}:{player,action:'ron',tile,from,robKan});
 return S.score(g,player);
}
const names=r=>r.items.map(x=>x.name);
const has=(r,n)=>names(r).some(x=>x.startsWith(n));
const busy=[{player:1,action:'discard',tile:0},{player:0,action:'draw',tile:1},{player:0,action:'discard',tile:2}];

// 平胡：五組順子、無字無花、胡別人、雙頭聽
let r=game({player:1,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tsumo:false,tile:W(4),from:2,log:busy});
assert.ok(has(r,'平胡'),names(r));assert.ok(has(r,'門清'));assert.ok(!has(r,'獨聽'));assert.equal(r.payer,'西家付（放槍）');
// 有花就不是平胡
r=game({player:1,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],flowers:[35],tsumo:false,tile:W(4),from:2,log:busy});
assert.ok(!has(r,'平胡'));assert.ok(has(r,'正花（夏）'));
// 門清自摸 3 台（不再另算門清、自摸），莊家胡牌加莊家
r=game({hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tile:S_(8),log:busy});
assert.ok(has(r,'門清自摸'));assert.ok(!names(r).includes('門清'));assert.ok(!names(r).includes('自摸'));assert.ok(has(r,'莊家'));assert.ok(has(r,'獨聽'));
// 閒家自摸：莊家另加 1 台，不算進總台
r=game({player:2,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tile:S_(8),log:busy});
assert.ok(!has(r,'莊家'));assert.equal(r.dealerExtra,1);assert.match(r.payer,/莊家另加/);
// 碰碰胡＋三暗刻＋大三元＋混一色
r=game({player:1,hand:[RED,RED,RED,GREEN,GREEN,GREEN,WHITE,WHITE,WHITE,W(5),W(5)],melds:[{type:'pon',tiles:[W(1),W(1),W(1)],from:0},{type:'pon',tiles:[W(9),W(9),W(9)],from:2}],tsumo:false,tile:W(5),from:0,log:busy});
assert.ok(has(r,'碰碰胡'));assert.ok(has(r,'三暗刻'));assert.ok(has(r,'大三元'));assert.ok(!has(r,'三元刻'));assert.ok(has(r,'混一色'));assert.ok(has(r,'莊家'),'莊家放槍');
// 胡別人完成的刻子不算暗刻
r=game({player:1,hand:[RED,RED,RED,GREEN,GREEN,GREEN,WHITE,WHITE,WHITE,W(5),W(5)],melds:[{type:'pon',tiles:[W(1),W(1),W(1)],from:0},{type:'pon',tiles:[W(9),W(9),W(9)],from:2}],tsumo:false,tile:RED,from:3,log:busy});
assert.ok(has(r,'二暗刻')===false&&!has(r,'三暗刻'));
// 小三元
r=game({player:3,hand:[RED,RED,RED,GREEN,GREEN,GREEN,WHITE,WHITE,W(1),W(2),W(3),W(4),W(5),W(6),W(7),W(8),W(9)],tile:W(9),log:busy});
assert.ok(has(r,'小三元'));assert.ok(has(r,'混一色'));
// 清一色、字一色
r=game({player:1,hand:[W(1),W(1),W(1),W(2),W(3),W(4),W(5),W(6),W(7),W(8),W(8),W(8),W(9),W(9),W(9),W(2),W(2)],tile:W(2),log:busy});
assert.ok(has(r,'清一色'));
r=game({player:1,hand:[EAST,EAST,EAST,SOUTH,SOUTH,SOUTH,WEST,WEST,WEST,NORTH,NORTH,NORTH,RED,RED,RED,WHITE,WHITE],tile:WHITE,log:busy});
assert.ok(has(r,'字一色'));assert.ok(has(r,'大四喜'));assert.ok(has(r,'五暗刻'));assert.ok(!has(r,'風位牌'));
// 小四喜
r=game({player:1,hand:[EAST,EAST,EAST,SOUTH,SOUTH,SOUTH,WEST,WEST,WEST,NORTH,NORTH,W(1),W(2),W(3),P(5),P(6),P(7)],tile:P(7),log:busy});
assert.ok(has(r,'小四喜'));
// 風位、風圈：南家有南風刻、東風刻
r=game({player:1,hand:[EAST,EAST,EAST,SOUTH,SOUTH,SOUTH,W(1),W(2),W(3),P(5),P(6),P(7),S_(2),S_(3),S_(4),W(9),W(9)],tile:W(9),log:busy});
assert.ok(has(r,'風位牌（南）'));assert.ok(has(r,'風圈牌（東）'));
// 全求人、搶槓、河底、海底、槓上開花
const five=[{type:'chi',tiles:[0,1,2],from:0},{type:'chi',tiles:[3,4,5],from:0},{type:'pon',tiles:[9,9,9],from:2},{type:'pon',tiles:[10,10,10],from:3},{type:'chi',tiles:[18,19,20],from:0}];
r=game({player:1,hand:[27,27],melds:five,tsumo:false,tile:27,from:2,log:busy});assert.ok(has(r,'全求人'));assert.ok(has(r,'獨聽'));
r=game({player:1,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tsumo:false,tile:W(4),from:2,robKan:true,log:busy});assert.ok(has(r,'搶槓'));
r=game({player:1,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tsumo:false,tile:W(4),from:2,wall:0,log:busy});assert.ok(has(r,'河底撈魚'));
r=game({player:1,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tile:W(4),wall:0,log:busy});assert.ok(has(r,'海底撈月'));
r=game({player:1,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tile:W(4),afterKan:true,log:busy});assert.ok(has(r,'槓上開花'));assert.ok(!has(r,'海底'));
// 天胡、地胡、人胡；有人吃碰槓就不算
r=game({hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tile:S_(8),log:[{player:0,action:'draw',tile:S_(8)}]});
assert.ok(has(r,'天胡'));assert.equal(r.items.find(x=>x.name==='天胡').tai,24);
r=game({player:2,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tile:S_(8),log:[{player:0,action:'discard',tile:5},{player:1,action:'discard',tile:6},{player:2,action:'draw',tile:S_(8)}]});
assert.ok(has(r,'地胡'));
r=game({player:2,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tsumo:false,tile:S_(8),from:0,log:[{player:0,action:'discard',tile:S_(8)}]});
assert.ok(has(r,'人胡'));
r=game({player:2,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],tsumo:false,tile:S_(8),from:0,log:[{player:0,action:'discard',tile:1},{player:1,action:'pon',tile:1},{player:1,action:'discard',tile:S_(8)}]});
assert.ok(!has(r,'人胡'));
// 花：正花、花槓
r=game({player:1,hand:[W(1),W(2),W(3),W(4),W(5),W(6),P(2),P(3),P(4),P(5),P(6),P(7),S_(3),S_(4),S_(5),S_(8),S_(8)],flowers:[34,35,36,37,39],tile:S_(8),log:busy});
assert.ok(has(r,'正花（夏）'));assert.ok(has(r,'正花（蘭）'));assert.ok(has(r,'花槓（春夏秋冬）'));
// 嚦咕嚦咕
const ligu=[W(1),W(1),W(3),W(3),P(2),P(2),P(9),P(9),S_(4),S_(4),S_(7),S_(7),EAST,EAST,RED,RED,RED];
assert.ok(E.liguLigu(ligu));assert.ok(E.winning(ligu));assert.ok(!E.winning(ligu,1));
r=game({player:1,hand:ligu,tile:EAST,log:busy});assert.ok(has(r,'嚦咕嚦咕'));
// 八仙過海（引擎）
const g=E.create(5);g.flowers=[[34,35,36,37,38,39,40],[],[],[]];g.wall.push(41);g.phase='draw';g.turn=0;g.flowerWin=null;
assert.ok(E.draw(g,0));assert.equal(g.phase,'ended');assert.match(g.result,/八仙過海/);assert.equal(S.score(g,0).items.find(x=>x.name==='八仙過海').tai,8);
// 七搶一（引擎）
const h=E.create(5);h.flowers=[[34,35,36,37,38,39,40],[],[],[]];h.wall.push(41);h.phase='draw';h.turn=1;h.flowerWin=null;
E.draw(h,1);assert.equal(h.phase,'ended');assert.match(h.result,/七搶一/);assert.equal(h.flowers[0].length,8);assert.ok(has(S.score(h,0),'七搶一'));
// 真實牌局：自動打完的胡牌都能計台
let scored=0;
for(let seed=0;seed<60;seed++){
 const x=E.create(seed);let steps=0;
 while(x.phase!=='ended'&&steps++<500){
  if(x.phase==='claim'){for(let q=0;q<4&&x.phase==='claim';q++)if(!x.pending.decisions[q]){const c=E.claims(x,q);E.respond(x,q,c.find(a=>a.type==='ron')||c.find(a=>a.type==='pon')||{type:'pass'});}}
  else if(x.phase==='draw')E.draw(x,x.turn);
  else if(E.winning(x.hands[x.turn],x.melds[x.turn].length))E.win(x,x.turn);
  else E.discard(x,x.turn,E.aiIndex(x.hands[x.turn],x.melds[x.turn].length));
 }
 const w=[...x.log].reverse().find(e=>['ron','tsumo','flowers'].includes(e.action));
 if(w){const res=S.score(x,w.player);assert.ok(Number.isInteger(res.total)&&res.total>=0,x.result);assert.equal(res.total,res.items.reduce((n,i)=>n+i.tai,0));if(seed<40&&process.env.SHOW)console.log(x.result,'→',S.summary(res));scored++;}
}
assert.ok(scored>10,'scored '+scored);
console.log('PASS: 平胡, 門清自摸, 莊家, 碰碰胡, 暗刻, 三元, 四喜, 風位風圈, 一色, 全求人, 搶槓, 海底河底, 槓上開花, 天地人胡, 花, 嚦咕嚦咕, 八仙過海, 七搶一 and '+scored+' real games scored.');
