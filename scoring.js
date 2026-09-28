(function(root){
'use strict';
// 台灣十六張麻將台數（北部台算法）。
// 牌型編號：0–8 萬、9–17 筒、18–26 索、27–30 東南西北、31–33 中發白、34–41 春夏秋冬梅蘭竹菊。
// 本練習固定：你（座位 0）是東家莊家，圈風為東；每局單局結算，沒有連莊。
const WIND_NAMES=['東','南','西','北'];
const NAMES=[...['萬','筒','索'].flatMap(s=>Array.from({length:9},(_,i)=>`${i+1}${s}`)),'東','南','西','北','中','發','白','春','夏','秋','冬','梅','蘭','竹','菊'];
const DEALER=0,ROUND_WIND=27;
const counts=tiles=>{const c=Array(34).fill(0);tiles.forEach(t=>{if(t<34)c[t]++;});return c;};

// 列出閉合手牌所有「N 組＋一對」的拆法（只用於計台，所以把每一種拆法都列出來取最高台）
function decompositions(hand,groupsNeeded){
 const c=counts(hand),out=[];
 function groups(need,acc){
  const i=c.findIndex(n=>n>0);
  if(i<0){if(need===0)out.push(acc.slice());return;}
  if(need===0)return;
  if(c[i]>=3){c[i]-=3;acc.push({type:'triplet',tile:i});groups(need-1,acc);acc.pop();c[i]+=3;}
  if(i<27&&i%9<=6&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;acc.push({type:'sequence',tile:i});groups(need-1,acc);acc.pop();c[i]++;c[i+1]++;c[i+2]++;}
 }
 const result=[];
 for(let p=0;p<34;p++){
  if(c[p]<2)continue;c[p]-=2;out.length=0;groups(groupsNeeded,[]);
  out.forEach(gs=>result.push({pair:p,groups:gs}));c[p]+=2;
 }
 return result;
}
// 嚦咕嚦咕：門清，七對加一刻
function isLiguLigu(hand,open){
 if(open||hand.length!==17)return false;
 const c=counts(hand);let pairs=0,triples=0;
 for(const n of c){if(n===2)pairs++;else if(n===4)pairs+=2;else if(n===3)triples++;else if(n)return false;}
 return pairs===7&&triples===1;
}
function winningTiles(hand,open){
 const out=[];
 for(let t=0;t<34;t++){
  if(counts(hand)[t]>=4)continue;
  const h=[...hand,t];
  if(decompositions(h,5-open).length||isLiguLigu(h,open))out.push(t);
 }
 return out;
}

// 依牌局紀錄整理胡牌當下的情境
function context(g,p){
 const log=g.log||[],winEvent=[...log].reverse().find(e=>['ron','tsumo','flowers'].includes(e.action)&&e.player===p)||{};
 const tsumo=winEvent.action==='tsumo',tile=winEvent.tile;
 const claimsBefore=log.some(e=>['chi','pon','kan','concealed','added'].includes(e.action));
 const discards=log.filter(e=>e.action==='discard');
 const ownDiscards=discards.filter(e=>e.player===p).length;
 const ownDraws=log.filter(e=>e.action==='draw'&&e.player===p).length;
 return {special:winEvent.special,tsumo,tile,from:winEvent.from,robKan:!!winEvent.robKan,afterKan:!!winEvent.afterKan,
  lastTile:(g.wall||[]).length===0,claimsBefore,ownDiscards,ownDraws,anyDiscard:discards.length>0};
}

// 主要函式：回傳 {total, items:[{name,tai,note}], ...}
function score(g,p,override={}){
 const ctx=Object.assign(context(g,p),override);
 const melds=g.melds[p]||[],open=melds.length,exposed=melds.filter(m=>m.type!=='concealed').length;
 const hand=g.hands[p].slice(),flowers=g.flowers[p]||[],seatWind=27+p;
 const items=[];const add=(name,tai,note='')=>items.push({name,tai,note});

 // 特殊胡：花牌
 if(ctx.special==='eightFlowers'){add('八仙過海',8,'集滿八張花');return finish(items,g,p,ctx);}
 if(ctx.special==='sevenRobOne'){add('七搶一',8,'手上七張花，搶走別家的第八張');return finish(items,g,p,ctx);}

 // 天地人胡：均不能有人吃、碰、槓
  if(!ctx.claimsBefore){
  if(ctx.tsumo&&p===DEALER&&!ctx.anyDiscard)add('天胡',24,'莊家起手即自摸');
  else if(ctx.tsumo&&p!==DEALER&&ctx.ownDiscards===0&&ctx.ownDraws===1)add('地胡',16,'閒家第一張即自摸');
  else if(!ctx.tsumo&&p!==DEALER&&ctx.ownDiscards===0)add('人胡',16,'閒家第一巡內胡牌');
 }

 // 找出最高台的拆法
 const concealedHand=hand;
 const decs=decompositions(concealedHand,5-open);
 const ligu=isLiguLigu(concealedHand,open);
 const waitsBefore=(()=>{if(ctx.tile==null)return [];const h=concealedHand.slice();const i=h.indexOf(ctx.tile);if(i<0)return [];h.splice(i,1);return winningTiles(h,open);})();
 const single=waitsBefore.length===1;

 let best=null;
 const options=decs.map(d=>({kind:'standard',d}));if(ligu)options.push({kind:'ligu'});
 for(const opt of options){
  const local=[];const L=(n,t,note='')=>local.push({name:n,tai:t,note});
  const all=[...concealedHand,...melds.flatMap(m=>m.tiles)];
  if(opt.kind==='ligu')L('嚦咕嚦咕',8,'七對加一刻');
  else{
   const groups=[...opt.d.groups.map(x=>({...x,concealed:true})),...melds.map(m=>({type:m.type==='chi'?'sequence':'triplet',tile:m.tiles[0],concealed:m.type==='concealed',kong:m.tiles.length===4}))];
   // 由放槍牌完成的刻子不算暗刻
   let concealedTriplets=groups.filter(x=>x.type==='triplet'&&x.concealed).length;
   if(!ctx.tsumo&&ctx.tile!=null&&opt.d.groups.some(x=>x.type==='triplet'&&x.tile===ctx.tile)){
    const canBeSeq=opt.d.groups.some(x=>x.type==='sequence'&&ctx.tile>=x.tile&&ctx.tile<=x.tile+2);const canBePair=opt.d.pair===ctx.tile;
    if(!canBeSeq&&!canBePair)concealedTriplets--;
   }
   const triplets=groups.filter(x=>x.type==='triplet');
   if(triplets.length===5)L('碰碰胡',4,'五組都是刻子或槓');
   if(concealedTriplets>=5)L('五暗刻',8);else if(concealedTriplets===4)L('四暗刻',5);else if(concealedTriplets===3)L('三暗刻',2);
   const dragons=[31,32,33],dragonTrip=dragons.filter(t=>triplets.some(x=>x.tile===t)).length,dragonPair=dragons.includes(opt.d.pair);
   if(dragonTrip===3)L('大三元',8,'中發白三組刻子');
   else if(dragonTrip===2&&dragonPair)L('小三元',4,'兩組三元刻加一對');
   else dragons.forEach(t=>{if(triplets.some(x=>x.tile===t))L('三元刻（'+NAMES[t]+'）',1);});
   const winds=[27,28,29,30],windTrip=winds.filter(t=>triplets.some(x=>x.tile===t)).length,windPair=winds.includes(opt.d.pair);
   if(windTrip===4)L('大四喜',16,'四組風牌刻子');
   else if(windTrip===3&&windPair)L('小四喜',8,'三組風刻加一對風牌');
   else{
    if(triplets.some(x=>x.tile===seatWind))L('風位牌（'+WIND_NAMES[p]+'）',1,'自己的門風刻子');
    if(triplets.some(x=>x.tile===ROUND_WIND))L('風圈牌（東）',1,'圈風刻子');
   }
   const allSeq=groups.every(x=>x.type==='sequence');
   if(allSeq&&!flowers.length&&!all.some(t=>t>=27)&&!ctx.tsumo&&!single)L('平胡',2,'五組順子、無字無花、胡別人且非獨聽');
  }
  // 一色
  const suits=new Set(all.filter(t=>t<27).map(t=>Math.floor(t/9))),honors=all.some(t=>t>=27);
  if(!suits.size)L('字一色',16,'全部都是字牌');
  else if(suits.size===1)L(honors?'混一色':'清一色',honors?4:8,honors?'一種花色加字牌':'只有一種花色');
  const tai=local.reduce((n,x)=>n+x.tai,0);
  if(!best||tai>best.tai)best={tai,items:local};
 }
 if(best)items.push(...best.items);

 // 門清／自摸／求人
 const menqing=exposed===0;
 if(menqing&&ctx.tsumo)add('門清自摸',3,'門清＋自摸＋不求人');
 else{
  if(menqing)add('門清',1,'沒有吃碰明槓');
  if(ctx.tsumo)add('自摸',1);
 }
 if(!ctx.tsumo&&exposed===5)add('全求人',1,'五組都攤開，最後胡別人');
 if(single&&!ligu)add('獨聽',1,'只聽一張（邊張、嵌張或單吊）');
 if(ctx.robKan)add('搶槓',1,'胡別人加槓的牌');
 if(ctx.tsumo&&ctx.afterKan)add('槓上開花',1,'槓後補牌自摸');
 if(ctx.tsumo&&ctx.lastTile&&!ctx.afterKan)add('海底撈月',1,'摸最後一張牌自摸');
 if(!ctx.tsumo&&ctx.lastTile&&!ctx.robKan)add('河底撈魚',1,'最後一張打出的牌放槍');

 // 花
 const own=[34+p,38+p];
 flowers.filter(f=>own.includes(f)).forEach(f=>add('正花（'+NAMES[f]+'）',1,WIND_NAMES[p]+'家的正花'));
 if([34,35,36,37].every(f=>flowers.includes(f)))add('花槓（春夏秋冬）',1,'一組四季');
 if([38,39,40,41].every(f=>flowers.includes(f)))add('花槓（梅蘭竹菊）',1,'一組四君子');
 return finish(items,g,p,ctx);
}
function finish(items,g,p,ctx){
 // 莊家台：莊家胡牌或莊家放槍時算進總台數；閒家自摸時只有莊家付的那一份加 1 台
 if(p===DEALER)items.unshift({name:'莊家',tai:1,note:'莊家胡牌'});
 else if(!ctx.tsumo&&ctx.from===DEALER)items.unshift({name:'莊家',tai:1,note:'莊家放槍'});
 const total=items.reduce((n,x)=>n+x.tai,0);
 const dealerExtra=p!==DEALER&&(ctx.tsumo||ctx.special)?1:0;
 const payer=ctx.special||ctx.tsumo?'三家各付'+(dealerExtra?'（莊家另加 1 台）':''):ctx.from!=null?WIND_NAMES[ctx.from]+'家付（放槍）':'';
 return {total,items,tsumo:!!ctx.tsumo,payer,dealerExtra,ctx};
}
function summary(result){return result.items.length?result.items.map(x=>x.name+' '+x.tai+'台').join('、')+'，共 '+result.total+' 台':'沒有台數（屁胡），只算底';}
const api={score,summary,decompositions,isLiguLigu,winningTiles,context};
if(typeof module!=='undefined')module.exports=api;else root.Scoring=api;
})(globalThis);
