(function(root){
'use strict';
const E=typeof module!=='undefined'?require('./engine.js'):root.Mahjong;
const progress=n=>n===0?'已聽牌':(['','一','兩','三','四','五','六','七','八','九','十'][n]||n)+'進聽';
const label=t=>t===33?'白板':E.names[t];
const same=(a,b)=>a.shanten===b.shanten&&a.remaining===b.remaining;
const patterns=[{shape:[2,3,4,5,6],waits:[1,4,7],splits:['123＋456','234＋456','234＋567']},{shape:[3,4,5,6,7],waits:[2,5,8],splits:['234＋567','345＋567','345＋678']},{shape:[4,5,6,7,8],waits:[3,6,9],splits:['345＋678','456＋678','456＋789']}];
function compare(hand,options,t){
 const candidate=options.find(o=>o.tile===t),best=options[0];
 if(!hand.includes(t))return '目前手牌沒有'+label(t)+'，請選擇手上實際持有的牌來比較。';
 if(!candidate||!best)return '請先摸牌，並選擇目前手上要比較的牌。';
 let answer='打'+label(t)+'後：'+progress(candidate.shanten)+'，有幫助的牌尚未看見 '+candidate.remaining+' 張。';
 if(same(candidate,best))answer+='和目前第一名打'+label(best.tile)+'並列，這是牌效率上的合理選擇。'+(options.indexOf(candidate)>=3?'沒列在前三名只是畫面截斷與排序，不是判定它比較差。':'');
 else if(candidate.shanten>best.shanten)answer+='相較打'+label(best.tile)+'（'+progress(best.shanten)+'），距離聽牌多 '+(candidate.shanten-best.shanten)+' 步。不同進聽數的牌不能只比張數大小。';
 else answer+='進聽數和打'+label(best.tile)+'相同，但有幫助的牌少 '+(best.remaining-candidate.remaining)+' 張。';
 answer+='有幫助的牌：'+outSummary(candidate)+'。'+tileRole(hand,t)+'（張數為未見張數，不是牌牆剩餘。）';return answer;
}
function outSummary(option){return option.outs?option.outs.map(o=>label(o.tile)+'（未見 '+o.remaining+' 張）').join('、')||'無':option.improving.map(label).join('、')||'無';}
function contextualAnswer(question,g,selected=null){
 const q=question.trim();
 if(g.phase==='ended')return '本局已結束，請重新開局再詢問目前牌況。';
 if(g.phase==='claim'){
  if(g.pending.decisions[0])return '你已完成回應，正在等待其他玩家決定。';
  const actions=E.claims(g,0),names={chi:'吃',pon:'碰',kan:'明槓',ron:'胡'};
  const requested=/胡/.test(q)?'ron':/槓/.test(q)?'kan':/碰/.test(q)?'pon':/吃/.test(q)?'chi':null;
  const matches=requested?actions.filter(a=>a.type===requested):actions;
  if(requested&&!matches.length)return '這張'+label(g.pending.tile)+'目前不能'+names[requested]+'。吃只限上家、且手牌須能組順子；碰要有兩張同牌，明槓要有三張同牌且有牌可補，胡須完成牌型。';
  const report=claimDecision(g,0);
  return report.summary+'\n'+report.options.filter(o=>!requested||o.action.type===requested).map(o=>o.compact).join('\n\n')+'\n'+report.limit;
 }
 if(g.turn!==0)return '目前輪到其他玩家，請等輪到你再依新牌況比較。';
 if(g.phase==='draw')return '輪到你摸牌：先按「摸牌」，補花完成後再選牌出牌。現在不能先出牌。';
 if(/槓/.test(q)){
  if(E.winning(g.hands[0],g.melds[0].length))return '建議先自摸，不建議為了槓牌放棄已完成的胡牌。';
  const actions=E.selfKans(g,0);
  return actions.length?selfKanDecision(g,0).map(o=>o.compact).join('\n\n')+'\n'+claimLimit:'目前沒有可暗槓或加槓的牌；不能只因有三張相同牌就暗槓。';
 }
 if(/吃|碰/.test(q))return '目前是你的出牌階段，不能吃碰；吃碰要在別人剛打出牌的回應階段決定。';
 return answer(q,g.hands[0],E.analyze(g.hands[0],E.publicTiles(g),g.melds[0].length),selected);
}
function patternHints(hand){
 const out=[];for(let suit=0;suit<3;suit++)for(const p of patterns)if(p.shape.every(n=>hand.includes(suit*9+n-1)))out.push('手中有 '+p.shape.map(n=>E.names[suit*9+n-1]).join('、')+' 五連張，可留意 '+p.waits.map(n=>E.names[suit*9+n-1]).join('、')+' 的三面聽形狀。必須配合整手其他組合，不能直接認定現在已聽這三張。');return out;
}
function answer(question,hand,options,selected){
 const q=question.trim();
 if(/147|258|369|口訣|公式|三面聽/.test(q))return '不是固定留147、258、369，而是同花色五連張：23456等147、34567等258、45678等369。例：23456進1成123＋456，進4成234＋456，進7成234＋567。其他部分須已完成三組加一對（含攤牌），才是整手三面聽。已出現的牌會減少可胡張數，也不能把同一路牌當作必定安全。'+(patternHints(hand).join('')||'目前未找到這三種完整五連張，先看實際出牌比較。');
 if(/白板|白/.test(q))return compare(hand,options,33);
 if(/紅中|中/.test(q)&&/打|留|出|碰/.test(q))return compare(hand,options,31);
 for(let t=0;t<34;t++)if(q.includes(E.names[t]))return compare(hand,options,t);
 if(selected!==null&&/這張|這個|為什麼|可以|比較/.test(q))return compare(hand,options,selected);
 return '目前是依牌局計算的本機教練，可問「打白板可以嗎」「打3萬為什麼不好」「這張和推薦差在哪」或「147是什麼」。其他自由問答尚未支援。';
}
// ---- 手牌拆解：找出面子、搭子、對子與孤張，供逐手解說使用 ----
const KIND={tri:'刻子',seq:'順子',head:'眼（對子）',pair:'對子',ryanmen:'兩面搭子',penchan:'邊張搭子',kanchan:'嵌張搭子',single:'孤張'};
const suitMemo=new Map();
function suitDecomps(arr,honor){
 const key=(honor?'h':'s')+arr.join('');if(suitMemo.has(key))return suitMemo.get(key);
 const c=arr.slice(),local=new Map();
 function rec(){
  const k=c.join('');if(local.has(k))return local.get(k);
  const i=c.findIndex(n=>n>0),out=new Map();
  if(i<0){out.set('0,0,0',{groups:[],q:0});local.set(k,out);return out;}
  const opt=(rm,kind,dm,dt,dp,dq)=>{
   rm.forEach(j=>c[j]--);const sub=rec();rm.forEach(j=>c[j]++);
   for(const [sk,v] of sub){const [m,t,p]=sk.split(',').map(Number),nk=(m+dm)+','+(t+dt)+','+(p+dp),q=v.q+dq,prev=out.get(nk);
    if(!prev||q>prev.q)out.set(nk,{groups:[{kind,idx:rm},...v.groups],q});}
  };
  if(c[i]>=3)opt([i,i,i],'tri',1,0,0,0);
  if(!honor&&i<=6&&c[i+1]&&c[i+2])opt([i,i+1,i+2],'seq',1,0,0,0);
  if(c[i]>=2)opt([i,i],'pair',0,0,1,1);
  if(!honor&&i<=7&&c[i+1])opt([i,i+1],i===0||i===7?'penchan':'ryanmen',0,1,0,i===0||i===7?1:2);
  if(!honor&&i<=6&&c[i+2])opt([i,i+2],'kanchan',0,1,0,1);
  opt([i],'single',0,0,0,0);
  local.set(k,out);return out;
 }
 const res=[...rec().entries()].map(([k,v])=>({k:k.split(',').map(Number),v}));suitMemo.set(key,res);return res;
}
function decompose(hand,open=0){
 const c=Array(34).fill(0);hand.forEach(t=>c[t]++);
 const ranges=[[0,9,false],[9,18,false],[18,27,false],[27,34,true]];
 const lists=ranges.map(([a,b,h])=>suitDecomps(c.slice(a,b),h));
 let best=null;const pick=[0,0,0,0];
 (function walk(si,m,t,p,q){
  if(si===4){const head=p>0?1:0,partial=t+p-head,mm=Math.min(m,5),score=2*mm+Math.min(partial,5-mm)+head;
   if(!best||score>best.score||(score===best.score&&q>best.q))best={score,q,pick:pick.slice()};return;}
  lists[si].forEach((e,i)=>{pick[si]=i;walk(si+1,m+e.k[0],t+e.k[1],p+e.k[2],q+e.v.q);});
 })(0,open,0,0,0);
 const groups=best.pick.flatMap((i,si)=>lists[si][i].v.groups.map(g=>({kind:g.kind,tiles:g.idx.map(j=>j+ranges[si][0])})));
 const head=groups.find(g=>g.kind==='pair');if(head)head.kind='head';
 return {shanten:10-best.score,groups,melds:open+groups.filter(g=>g.kind==='tri'||g.kind==='seq').length};
}
function groupWaits(g){
 const [a,b]=g.tiles,base=Math.floor(a/9)*9;
 if(g.kind==='ryanmen')return [a-1,b+1].filter(x=>x>=base&&x<base+9);
 if(g.kind==='penchan')return a%9===0?[a+2]:[a-1];
 if(g.kind==='kanchan')return [a+1];
 if(g.kind==='pair'||g.kind==='head')return [a];
 return [];
}
const tilesText=ts=>ts.map(label).join('');
function describeGroup(g){const w=groupWaits(g);return KIND[g.kind]+' '+tilesText(g.tiles)+(w.length&&g.kind!=='head'?'（等 '+w.map(label).join('、')+'）':'');}
function unseen(t,hand,publicTiles){return Math.max(0,4-hand.filter(x=>x===t).length-publicTiles.filter(x=>x===t).length);}

// 說明「為什麼這張最不重要」
function tileRole(hand,t,publicTiles=[],open=0){
 const count=hand.filter(x=>x===t).length,name=label(t);
 if(t>=27){
  if(count===1)return name+'是單張字牌：字牌不能組順子，只能再摸到同一張才會成對，未見只剩 '+unseen(t,hand,publicTiles)+' 張。';
  if(count===2){const pairs=new Set(hand.filter(x=>hand.filter(y=>y===x).length>=2)).size;return name+'是對子，但你手上有 '+pairs+' 組對子，胡牌只需要一對當眼，多的對子只能靠碰或摸成刻子。';}
  return name+'已成刻子，一般不建議拆。';
 }
 const suit=Math.floor(t/9),pos=t%9;
 const near=hand.filter(x=>x!==t&&Math.floor(x/9)===suit&&x<27&&Math.abs(x-t)<=2);
 if(!near.length)return name+'是孤張：同花色前後兩張內都沒有牌可以連接'+(pos===0||pos===8?'，而且是邊緣的'+(pos+1)+'，只能往一邊延伸，比中張更難用':'')+'。';
 const whole=decompose(hand,open),g=whole.groups.find(x=>x.tiles.includes(t));
 const blocks=whole.melds+whole.groups.filter(x=>['ryanmen','penchan','kanchan','pair'].includes(x.kind)).length;
 if(g&&['penchan','kanchan','pair'].includes(g.kind)&&blocks>5)return '手上的面子加搭子已有 '+blocks+' 塊，超過五組所需；'+name+'所在的'+describeGroup(g)+'只能等一種牌，是最弱的一塊，可以先拆。';
 if(g&&g.kind==='single')return name+'在目前最佳的拆法裡沒有搭配：附近的'+tilesText(near)+'已經有更好的組合，它是多出來的一張。';
 if(count>=2&&g&&g.kind!=='tri')return '你有 '+count+' 張'+name+'，多出來的一張不會增加新的組合。';
 return '打掉'+name+'後，其他牌仍能維持同樣的組合，它是目前貢獻最少的一張。';
}

// 並列時，依教學習慣先建議：單張字牌 → 孤張么九 → 其他孤張 → 剛摸到的牌
// 同效率時的出牌順序（依常見台灣麻將口訣）：
// 單張字牌先打，其中「客風」（不是門風、圈風、三元，碰了也沒台）比有台的字牌先打；再來是孤張么九、孤張中張。
// 同一級再比：下家打過的牌（盯下家，不餵下家吃）→ 場上已見張數多的熟張 → 剛摸進的牌。
function leadOrder(hand,tied,drawn,ctx={}){
 const value=new Set(ctx.value||[]),next=new Set(ctx.nextRiver||[]),seen=t=>(ctx.publicTiles||[]).filter(x=>x===t).length;
 const rank=o=>{const t=o.tile,count=hand.filter(x=>x===t).length;
  if(t>=27)return count===1?(value.has(t)?0.5:0):4;
  const near=hand.some(x=>x!==t&&x<27&&Math.floor(x/9)===Math.floor(t/9)&&Math.abs(x-t)<=2);
  if(!near)return t%9===0||t%9===8?1:2;
  return o.tile===drawn?3:4;};
 return tied.slice().sort((a,b)=>rank(a)-rank(b)||next.has(b.tile)-next.has(a.tile)||seen(b.tile)-seen(a.tile)||(b.tile===drawn)-(a.tile===drawn)||a.tile-b.tile);
}
// 每一手的完整解說
function explainTurn(hand,options,ctx={}){
 const open=ctx.open||0,pub=ctx.publicTiles||[];
 if(!options[0])return null;
 const tied=leadOrder(hand,options.filter(o=>same(o,options[0])),ctx.drawn,ctx),best=tied[0],runner=options.find(o=>!same(o,best));
 const rest=hand.slice();rest.splice(rest.indexOf(best.tile),1);
 const structure=decompose(rest,open);
 const lines=[];
 if(ctx.drawn!=null&&hand.includes(ctx.drawn)){
  const before=hand.slice();before.splice(before.indexOf(ctx.drawn),1);
  const b=E.shanten(before,open),d=label(ctx.drawn);
  if(tied.some(o=>o.tile===ctx.drawn))lines.push('摸到'+d+'沒有幫上忙：最好的打法就是把它直接打掉（摸切），手牌維持'+progress(b)+'。');
  else if(best.shanten<b){const g=structure.groups.find(x=>x.tiles.includes(ctx.drawn));lines.push('摸到'+d+'是有效牌：手牌從'+progress(b)+'前進到'+progress(best.shanten)+(g&&g.tiles.length>1?'，它和手上的牌組成了'+KIND[g.kind]+' '+tilesText(g.tiles):'')+'。');}
  else lines.push('摸到'+d+'沒有讓進聽數前進（仍是'+progress(b)+'），但可以留下它、改打別張，換取更多有效牌。');
 }
 lines.push(tileRole(hand,best.tile,pub,open));
 if(best.shanten===0)lines.push('打掉後就聽牌，可以胡 '+best.outs.map(o=>label(o.tile)).join('、')+'，未見共 '+best.remaining+' 張。');
 else lines.push('打掉後是'+progress(best.shanten)+'：有 '+best.outs.length+' 種牌能讓手牌再前進，未見共 '+best.remaining+' 張。');
 const blocks=structure.groups.filter(g=>['ryanmen','penchan','kanchan','pair'].includes(g.kind)).length,hasHead=structure.groups.some(g=>g.kind==='head');
 lines.push('目前已完成 '+structure.melds+' 組面子、'+blocks+' 個搭子'+(hasHead?'、一對眼':'，還沒有眼')+'；胡牌需要五組加一對，還差 '+(5-Math.min(5,structure.melds))+' 組。'+
  (structure.groups.some(g=>g.kind==='ryanmen')?'兩面搭子能等兩種牌，是最好的搭子。':blocks?'搭子多是邊張或嵌張，進張較窄，之後摸到能改成兩面的牌要優先留。':''));
 if(tied.length>1){
  lines.push('打 '+tied.filter(o=>o.tile!==best.tile).map(o=>label(o.tile)).join('、')+' 的效果完全相同，可以依防守或台數再選。');
  const value=new Set(ctx.value||[]),others=tied.filter(o=>o.tile!==best.tile);
  if(best.tile>=27&&!value.has(best.tile)&&others.some(o=>value.has(o.tile)))lines.push('先打客風'+label(best.tile)+'：它碰了也沒有台；'+others.filter(o=>value.has(o.tile)).map(o=>label(o.tile)).join('、')+'是門風、圈風或三元，碰出來有台，可以晚一點再打（場上已見兩張以上就不必留）。');
  else if((ctx.nextRiver||[]).includes(best.tile)&&others.some(o=>!(ctx.nextRiver||[]).includes(o.tile)))lines.push('盯下家：下家打過'+label(best.tile)+'，打它比較不會讓下家吃到。');
 }
 let compareText='';
 if(runner){
  compareText=runner.shanten>best.shanten?'如果改打'+label(runner.tile)+'，會退到'+progress(runner.shanten)+'，距離聽牌多 '+(runner.shanten-best.shanten)+' 步。':
   '如果改打'+label(runner.tile)+'，一樣是'+progress(runner.shanten)+'，但有效牌少 '+(best.remaining-runner.remaining)+' 張。';
  lines.push(compareText);
 }
 return {best,tied,runner,structure,lines};
}
// 評估玩家實際打出的牌（覆盤與「上一手」使用）
function judge(options,t,lead=options[0]){
 const best=lead,c=options.find(o=>o.tile===t);
 if(!best||!c)return {verdict:'unknown',text:''};
 if(same(c,best))return {verdict:'best',text:'和教練首選相同（'+progress(c.shanten)+'，有效 '+c.remaining+' 張）。'};
 if(c.shanten>best.shanten)return {verdict:'worse',text:'教練首選是打'+label(best.tile)+'（'+progress(best.shanten)+'）；打'+label(t)+'會變成'+progress(c.shanten)+'，多一步才聽牌。'};
 return {verdict:'close',text:'進聽數相同，但打'+label(best.tile)+'有效牌多 '+(best.remaining-c.remaining)+' 張（'+best.remaining+' 對 '+c.remaining+'）。'};
}
const claimLimit='只比進攻牌效率，未計台數與防守。未見張數不是牌牆張數或機率；加槓可被搶胡。';
const claimNames={chi:'吃',pon:'碰',kan:'明槓',concealed:'暗槓',added:'加槓',ron:'胡'};
function knownCounts(hand,pub){const c=Array(34).fill(0);for(const t of [...hand,...pub])if(t<34)c[t]++;return c;}
// 比較略過後的待摸手牌，與吃碰後已出牌的手牌，保持相同張數階段。
function waitValue(hand,open,known){
 const shanten=E.shanten(hand,open),outs=[];
 for(let t=0;t<34;t++)if(known[t]<4&&E.shanten([...hand,t],open)<shanten)outs.push({tile:t,remaining:4-known[t]});
 return {shanten,outs,improving:outs.map(o=>o.tile),remaining:outs.reduce((n,o)=>n+o.remaining,0)};
}
function better(a,b){return a.shanten<b.shanten||(a.shanten===b.shanten&&a.remaining>b.remaining);}
function valueText(v){return progress(v.shanten)+'，'+(v.shanten===0?'可胡牌':'有效牌')+'未見 '+v.remaining+' 張：'+outSummary(v);}
function removeTiles(hand,tiles){const rest=hand.slice();for(const t of tiles){const i=rest.indexOf(t);if(i<0)throw Error('Illegal claim tiles');rest.splice(i,1);}return rest;}
function kanDecision(g,p,a,baseline,known){
 const added=a.type==='added',t=a.tile??g.pending.tile;
 const used=a.tiles||Array(added?1:4).fill(t),rest=removeTiles(g.hands[p],used),open=g.melds[p].length+(added?0:1);
 const outcomes=[],memo=new Map(),restCounts=knownCounts(rest,[]),visible=known.flatMap((n,t)=>Array(Math.max(0,n-restCounts[t])).fill(t));
 // 不讀牌牆或對手暗牌。枚舉所有未見一般牌作為「可能補到」的情境。
 for(let draw=0;draw<34;draw++)if(known[draw]<4){
  const h=[...rest,draw],win=E.winning(h,open),best=win?null:E.analyze(h,visible,open,memo)[0];
  outcomes.push({tile:draw,remaining:4-known[draw],shanten:win?-1:best.shanten,discard:win?null:best.tile,outs:best?.outs||[],effective:best?.remaining||0});
 }
 const improving=outcomes.filter(o=>o.shanten<baseline.shanten),worse=outcomes.filter(o=>o.shanten>baseline.shanten);
 const narrower=outcomes.filter(o=>o.shanten===baseline.shanten&&o.effective<baseline.remaining-(baseline.outs.some(x=>x.tile===o.tile)?1:0));
 const wider=outcomes.filter(o=>o.shanten===baseline.shanten&&o.effective>baseline.remaining-(baseline.outs.some(x=>x.tile===o.tile)?1:0));
 const recommend=outcomes.length>0&&!worse.length&&!narrower.length&&(improving.length+wider.length)>0;
 const describe=xs=>xs.length?xs.map(o=>label(o.tile)+'→'+(o.shanten===-1?'可胡':progress(o.shanten)+'／有效 '+o.effective+' 張')+(o.discard===null?'':'（打'+label(o.discard)+'）')).join('、'):'無';
 const name=claimNames[a.type];
 const reason=worse.length?'有 '+worse.length+' 種補牌會多一步以上才聽牌。':narrower.length?'有 '+narrower.length+' 種補牌使同進聽數的有效牌變少。':recommend?'補牌後不退步、不縮窄，且有改善機會。':'沒有明確效率收益，保留彈性。';
 const compact=(recommend?'建議':'暫不')+name+' '+label(t)+'\n不槓：'+progress(baseline.shanten)+'／有效 '+baseline.remaining+' 張'+(baseline.tile!==undefined?'，打'+label(baseline.tile):'')+'。\n槓：'+improving.length+' 種補牌前進、'+narrower.length+' 種變窄、'+worse.length+' 種退步。\n'+reason;
 const text=compact+'\n補牌結果未知，以下是所有未見一般牌的假設情境，不是機率；未模擬補花至牌牆耗盡。\n前進：'+describe(improving)+'\n退步：'+describe(worse)+'\n變窄：'+describe(narrower)+'\n完整補牌／出牌／有效牌比較：'+describe(outcomes)+(added?'\n加槓須先通過其他家的搶槓胡回應；此建議不估計對手胡牌機率。':'');
 return {action:a,baseline,outcomes,narrower,worse,recommend,compact,text};
}
function claimDecision(g,p=0){
 const hand=g.hands[p],pub=E.publicTiles(g,p),open=g.melds[p].length,known=knownCounts(hand,pub),baseline=waitValue(hand,open,known);
 const options=E.claims(g,p).map(action=>{
  if(action.type==='ron')return {action,recommend:true,compact:'建議'+(g.pending.kind==='robkan'?'搶槓胡':'胡牌')+'：五組加一對已成立。',text:'建議胡牌：牌型已成立，不必為了吃碰槓放棄這次胡牌。'};
  if(action.type==='kan')return kanDecision(g,p,action,baseline,known);
  const rest=removeTiles(hand,action.tiles);
  // 河中的被吃牌已算在 pub；只把從手牌移到攤牌的牌加入 pub，避免重複扣張。
  const after=E.analyze(rest,[...pub,...action.tiles],open+1)[0],name=claimNames[action.type];
  const recommend=better(after,baseline),combo=[...action.tiles,g.pending.tile].sort((a,b)=>a-b);
  const difference=after.shanten<baseline.shanten?'少 '+(baseline.shanten-after.shanten)+' 步進聽':after.shanten>baseline.shanten?'多 '+(after.shanten-baseline.shanten)+' 步才聽牌':after.remaining>baseline.remaining?'同進聽數但有效牌多 '+(after.remaining-baseline.remaining)+' 張':after.remaining<baseline.remaining?'同進聽數但有效牌少 '+(baseline.remaining-after.remaining)+' 張':'進聽數與有效牌張數均相同';
  const text=(recommend?'建議'+name:'建議不'+name)+' '+combo.map(label).join('、')+'。\n'+name+'後再出一張：建議打'+label(after.tile)+' → '+valueText(after)+'。相較略過，'+difference+'。\n不'+name+'：'+valueText(baseline)+'。\n'+name+'的優勢：立即完成這一組'+(recommend?'，取得上述牌效率改善':'，但目前沒有比略過更好的牌效率')+'。代價：手上的 '+action.tiles.map(label).join('、')+' 被固定成攤牌，不能再拆作其他組合'+(g.melds[p].every(m=>m.type==='concealed')?'，也放棄門清':'')+'。\n不'+name+'的優勢：保留上述牌的重組彈性'+(g.melds[p].every(m=>m.type==='concealed')?'與門清':'')+'；代價是放過這張現成可組牌，之後仍需等進牌。'+(recommend?'這次優先取進攻效率，建議接受。':'這次沒有足夠效率收益，建議略過。');
  const affected=decompose(hand,open).groups.filter(group=>group.tiles.some(t=>action.tiles.includes(t)));
  const compact=(recommend?'可'+name:'不建議'+name)+' '+combo.map(label).join('、')+'\n'+name+'後打'+label(after.tile)+'：'+progress(after.shanten)+'／有效 '+after.remaining+' 張\n略過：'+progress(baseline.shanten)+'／有效 '+baseline.remaining+' 張\n'+difference+'；'+(recommend?'換取效率，但固定牌組。':'保留拆組彈性。');
  return {action,after,recommend,compact,text:text+'\n原手牌的一種最佳拆法中，相關組合是：'+affected.map(describeGroup).join('、')+'。吃碰會固定用掉上述指定牌張；同牌可能有其他拆法，實際收益以整手計算為準。'};
 });
 const ron=options.find(o=>o.action.type==='ron'),ranked=options.filter(o=>o.after&&o.recommend).sort((a,b)=>a.after.shanten-b.after.shanten||b.after.remaining-a.after.remaining);
 const best=ron||ranked[0]||options.find(o=>o.action.type==='kan'&&o.recommend);
 if(ron)for(const o of options)if(o!==ron){o.recommend=false;o.compact=o.text='建議胡牌，不建議'+claimNames[o.action.type]+'：目前已能完成五組加一對，不必放棄這次胡牌再求進牌。';}
 const summary=best?'本次首選：'+claimNames[best.action.type]+(best.after?' '+[...best.action.tiles,g.pending.tile].sort((a,b)=>a-b).map(label).join('、')+'，再打'+label(best.after.tile):'')+'。':'本次首選：略過，不吃碰槓。';
 return {baseline,options,best,summary,limit:claimLimit};
}
function selfKanDecision(g,p=0){const actions=E.selfKans(g,p);if(!actions.length)return [];const hand=g.hands[p],pub=E.publicTiles(g,p),baseline=E.analyze(hand,pub,g.melds[p].length)[0],known=knownCounts(hand,pub);return actions.map(a=>{const result=kanDecision(g,p,a,baseline,known);result.text+='\n若不槓，現在建議打'+label(baseline.tile)+'。';return result;});}
function chooseClaim(g,p){const options=E.claims(g,p);return options.find(a=>a.type==='ron')||(options.length?claimDecision(g,p).best?.action:null)||{type:'pass'};}
function chooseKan(g,p){return E.winning(g.hands[p],g.melds[p].length)?null:selfKanDecision(g,p).find(o=>o.recommend)?.action;}
const api={chooseClaim,chooseKan,claimDecision,selfKanDecision,waitValue,claimLimit,leadOrder,decompose,groupWaits,describeGroup,tileRole,explainTurn,judge,KIND,compare,answer,contextualAnswer,outSummary,patternHints,patterns,progress,same,label};if(typeof module!=='undefined')module.exports=api;else root.Coach=api;
})(globalThis);
