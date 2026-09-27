(function(root){
'use strict';
const names = [...['萬','筒','索'].flatMap(s=>Array.from({length:9},(_,i)=>`${i+1}${s}`)),...'東南西北'.split(''), '中','發','白','春','夏','秋','冬','梅','蘭','竹','菊'];
const countsOf = hand => { const c=Array(34).fill(0); for(const t of hand){if(!Number.isInteger(t)||t<0||t>=34)throw Error('Invalid tile'); c[t]++;} return c; };
// Standard 16-tile hand: five melds and one pair. No special hands.
function shanten(hand){
 const c=countsOf(hand); let best=10; const seen=new Set();
 function visit(m,t,p){
  const key=c.join('')+':'+m+','+t+','+p; if(seen.has(key))return; seen.add(key);
  const i=c.findIndex(n=>n>0); if(i<0){best=Math.min(best,10-2*m-Math.min(t,5-m)-p);return;}
  if(m<5&&c[i]>=3){c[i]-=3;visit(m+1,t,p);c[i]+=3;}
  if(m<5&&i<27&&i%9<=6&&c[i+1]&&c[i+2]){c[i]--;c[i+1]--;c[i+2]--;visit(m+1,t,p);c[i]++;c[i+1]++;c[i+2]++;}
  if(c[i]>=2){c[i]-=2;if(!p)visit(m,t,1);if(t<5)visit(m,t+1,p);c[i]+=2;}
  if(t<5&&i<27)for(const d of [1,2])if(i%9+d<9&&c[i+d]){c[i]--;c[i+d]--;visit(m,t+1,p);c[i]++;c[i+d]++;}
  c[i]--;visit(m,t,p);c[i]++;
 } visit(0,0,0);return best;
}
function winning(hand){return hand.length===17&&countsOf(hand).every(n=>n<=4)&&shanten(hand)===-1;}
function analyze(hand,publicTiles=[]){
 const known=countsOf([...hand,...publicTiles.filter(t=>t<34)]); const memo=new Map();
 const value=h=>{const key=countsOf(h).join('');if(!memo.has(key))memo.set(key,shanten(h));return memo.get(key);};
 const options=[...new Set(hand)].map(tile=>{
  const rest=hand.slice();rest.splice(rest.indexOf(tile),1);const s=value(rest);const improving=[];let remaining=0;
  for(let t=0;t<34;t++)if(known[t]<4&&value([...rest,t])<s){improving.push(t);remaining+=4-known[t];}
  return {tile,shanten:s,remaining,improving};
 });return options.sort((a,b)=>a.shanten-b.shanten||b.remaining-a.remaining||a.tile-b.tile);
}
function create(seed=Date.now()){
 let n=seed>>>0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
 const wall=[];for(let t=0;t<34;t++)for(let i=0;i<4;i++)wall.push(t);for(let t=34;t<42;t++)wall.push(t);
 for(let i=wall.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[wall[i],wall[j]]=[wall[j],wall[i]];}
 const g={seed,wall,hands:[[],[],[],[]],flowers:[[],[],[],[]],rivers:[[],[],[],[]],turn:0,phase:'draw',result:'',log:[]};
 for(let r=0;r<16;r++)for(let p=0;p<4;p++)take(g,p);
 g.hands.forEach(h=>h.sort((a,b)=>a-b));return g;
}
function take(g,p){while(g.wall.length){const t=g.wall.pop();if(t>=34){g.flowers[p].push(t);continue;}g.hands[p].push(t);return t;}return null;}
function draw(g,p){if(g.phase!=='draw'||g.turn!==p)return false;const t=take(g,p);if(t===null){g.phase='ended';g.result='牌牆已空，流局';return false;}g.phase='discard';g.log.push({player:p,action:'draw',tile:t});return true;}
function discard(g,p,index){if(g.phase!=='discard'||g.turn!==p||!Number.isInteger(index)||index<0||index>=g.hands[p].length)return false;const [t]=g.hands[p].splice(index,1);g.rivers[p].push(t);g.log.push({player:p,action:'discard',tile:t});g.turn=(p+1)%4;g.phase='draw';if(!g.wall.length){g.phase='ended';g.result='牌牆已空，流局';}return true;}
function win(g,p){if(g.phase!=='discard'||g.turn!==p||!winning(g.hands[p]))return false;g.phase='ended';g.result=(p===0?'你':names[27+p]+'家')+'自摸，五組加一對成立';return true;}
function aiIndex(hand){let best=Infinity,index=0;for(let i=0;i<hand.length;i++){const h=hand.filter((_,j)=>i!==j),s=shanten(h);if(s<best){best=s;index=i;}}return index;}
const api={names,shanten,winning,analyze,create,draw,discard,win,aiIndex};
if(typeof module!=='undefined')module.exports=api;else root.Mahjong=api;
})(globalThis);
