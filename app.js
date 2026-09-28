'use strict';
const E=Mahjong, $=s=>document.querySelector(s);
const seats=['你（東家・莊家）','南家','西家','北家'],WINDS=['東','南','西','北'],REL=['','下家','對家','上家'];
// 設定（存在本機）：電腦難度、教練提示、危險度、抓位、底台
const settings={level:'normal',coach:true,danger:false,seatDraw:true,stake:'100/20'};
try{Object.assign(settings,JSON.parse(localStorage.getItem('mahjong-coach-settings')||'{}'));}catch(e){}
function saveSettings(){try{localStorage.setItem('mahjong-coach-settings',JSON.stringify(settings));}catch(e){}}
// 一將：莊家、圈風、連莊次數與四家累計分數。第一次開頁直接由你當東家莊家，按 ↻ 才抓位。
let session={firstDealer:0,dealer:0,round:0,streak:0,hand:1,scores:[0,0,0,0],settled:false,last:null,next:null};
let game=E.create(Date.now(),{dealer:0}), selected=null, timer=null, generation=0, suggestions=[], lessonStep=0;
let peek=false, replayIndex=0, replayMistakes=false, dangerCache={key:'',value:null};
let scoreCache={log:-1,value:null};
let lastDrawn=null, turnLog=[], lastReview=null, explainCache={key:'',value:null};
let reviewTimeline=[];
let heard={log:0,phase:game.phase}, neatRiver=false, shownPile=0;
let claimCache={key:'',value:null},kanCache={key:'',value:[]};
function decisionKey(){return JSON.stringify([game.phase,game.hands[0],game.melds[0],E.publicTiles(game),game.pending?.tile,game.pending?.from,game.pending?.kind,game.wall.length>0]);}
function currentClaim(){const key=decisionKey();if(claimCache.key!==key)claimCache={key,value:Coach.claimDecision(game,0)};return claimCache.value;}
function currentKans(){const key=decisionKey();if(kanCache.key!==key)kanCache={key,value:Coach.selfKanDecision(game,0)};return kanCache.value;}
try{neatRiver=localStorage.getItem('mahjong-coach-river')==='neat';}catch(e){}
// 提示訊息用 CSS 動畫淡出，不另外排計時器
function notify(text){const t=$('#toast');t.textContent=text;t.classList.remove('show');void t.offsetWidth;t.classList.add('show');}
function tile(t){return E.names[t];}
const actionName={chi:'吃',pon:'碰',kan:'明槓',ron:'胡',concealed:'暗槓',added:'加槓'};
function readiness(n){return n===0?'已聽牌':(['','一','兩','三','四','五','六','七','八','九','十'][n]||n)+'進聽';}
function waiting(){return game.phase==='claim'&&!game.pending.decisions[0];}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=text;return x;}
function tileRow(tiles,size='xs'){const row=el('span','tile-row');tiles.forEach(t=>row.append(Tiles.node(t,size)));return row;}
function decisionCard(o){const card=el('div','coach-option claim-detail');card.append(el('p',null,o.compact));if(o.after)card.append(el('p','defense-note','吃碰後的出牌風險：'+Defense.describe(Defense.inspect(game,0,o.after.tile))));const more=el('details');more.append(el('summary',null,'看詳細計算與取捨'),el('p',null,o.text));card.append(more);return card;}
function defenseCard(body){
 const lead=currentExplain()?.best,options=lead?[lead,...suggestions.filter(o=>o!==lead)]:suggestions;
 const report=Defense.compare(game,options);if(!report)return;
 const card=el('section','defense-card');card.append(el('h5',null,'攻守取捨（不自動替你出牌）'),el('p',null,Defense.summary(game,options)));
 const t=selected===null?report.guard.option.tile:game.hands[0][selected],risk=Defense.inspect(game,0,t),details=el('details');details.append(el('summary',null,'看'+Coach.label(t)+'對三家的判斷'));
 for(const opponent of risk.opponents)details.append(el('p',null,seats[opponent.player]+'：已固定 '+opponent.groups+' 組；'+(opponent.ways.length?'尚可能以'+opponent.ways.map(w=>w.kind+'（持有'+w.needs.map(Coach.label).join('、')+'）').join('、')+'胡這張。':'已排除一般胡牌組合。')));
 card.append(details);body.append(card);
}
function decisionRecord(choice,options,summary,kind='claim'){
 return {kind,choice,at:game.log.length,tile:game.pending?.tile??choice.tile,summary,details:options.map(o=>o.compact).join('\n\n')};
}
function resolutionText(x){
 if(x.kind==='skip-kan')return '未槓，已出牌。';
 const events=game.log.slice(x.at);
 if(x.kind==='self-kan'){
  const result=events.find(e=>(e.action==='ron'&&e.robKan)||(e.player===0&&e.action===x.choice.type&&e.tile===x.choice.tile));
  if(result?.robKan)return '加槓遭搶胡，未補牌。';
  return result?'已完成槓牌與補牌流程（無牌可補時流局）。':'等待搶槓回應。';
 }
 const result=events.find(e=>e.action==='resolution');
 if(!result)return '等待其他家回應。';
 if(x.choice.type==='pass')return result.choice==='pass'?'全員略過，依序繼續。':seats[result.player]+'取得'+(actionName[result.choice]||result.choice)+'。';
 return result.player===0&&result.choice===x.choice.type?'已取得'+actionName[x.choice.type]+'。':'未取得：其他家的優先權較高。';
}
function currentExplain(){
 if(!(game.turn===0&&game.phase==='discard'&&suggestions.length))return null;
 const pub=E.publicTiles(game),key=game.hands[0].join(',')+'|'+lastDrawn+'|'+pub.length+'|'+game.melds[0].length;
 if(explainCache.key!==key)explainCache={key,value:Coach.explainTurn(game.hands[0],suggestions,{drawn:lastDrawn,publicTiles:pub,open:game.melds[0].length})};
 return explainCache.value;
}
function reviewCard(body){
 if(!lastReview)return;
 const card=el('div','coach-last '+lastReview.judge.verdict);
 const head=el('div','coach-last-head');head.append(el('span','coach-tag',lastReview.judge.verdict==='best'?'上一手 ✓':'上一手回顧'),el('span',null,'你打出'),Tiles.node(lastReview.tile,'xs'));
 card.append(head,el('p',null,lastReview.judge.text));body.append(card);
}
function coach(){
 const body=$('#coachBody');body.replaceChildren();
 const title=el('h4'),copy=el('p');body.append(title,copy);
 if(game.phase==='ended'){
  title.textContent=game.result;
  const ws=winScore();if(ws)body.append(scoreCard(ws));
  if(session.last)body.append(settleCard());
  const good=turnLog.filter(x=>x.judge.verdict==='best').length;
  body.append(copy);copy.textContent=turnLog.length?'這局你出牌 '+turnLog.length+' 次，其中 '+good+' 次和教練首選相同。到「牌局覆盤」可以逐手回看差在哪裡。':'可到牌局覆盤查看本局操作，或重新開始。';return;
 }
 if(!settings.coach&&!peek){
  title.textContent=game.phase==='claim'&&waiting()?'有人出牌：自己決定吃碰槓胡或略過':game.turn===0?'教練提示已關閉':'等待'+seats[game.turn];
  copy.textContent='專心打這一局；打完可到「牌局覆盤」逐手回放，看每一手和教練首選差在哪裡。需要時按「看提示」臨時看一次。';return;
 }
 if(game.phase==='claim'){
  title.replaceChildren(el('span',null,seats[game.pending.from]+(game.pending.kind==='robkan'?'加槓，是否搶胡？':'打出 ')),Tiles.node(game.pending.tile,'sm'));
  if(!waiting()){copy.textContent='你已完成回應，等待其他玩家決定。';return;}
  const decision=currentClaim();copy.textContent=decision.summary;
  decision.options.forEach(o=>body.append(decisionCard(o)));
  body.append(el('p','claim-limit',decision.limit));
  reviewCard(body);return;
 }
 if(game.turn!==0){title.textContent='等待'+seats[game.turn];copy.textContent='電腦依自己的手牌出牌，你可以趁這時看看牌河。';reviewCard(body);return;}
 if(game.phase==='draw'){
  title.textContent='輪到你摸牌';copy.textContent='目前'+readiness(E.shanten(game.hands[0],game.melds[0].length))+'。摸牌後，教練會解說這一手該怎麼打。';reviewCard(body);return;
 }
 if(E.winning(game.hands[0],game.melds[0].length)){title.textContent='可以自摸！';copy.textContent='五組加一對已成立，按「胡牌」結束本局。';return;}
 for(const o of currentKans())body.append(decisionCard(o));
 const ex=currentExplain();if(!ex){title.textContent='請選牌出牌';copy.remove();return;}
 const best=ex.best;
 defenseCard(body);
 title.replaceChildren(el('span',null,'建議打出 '),Tiles.node(best.tile,'md'));
 copy.className='coach-chips';copy.replaceChildren(el('span','chip',best.shanten===0?'打後聽牌':'打後'+readiness(best.shanten)),el('span','chip',(best.shanten===0?'可胡 ':'有效牌 ')+best.remaining+' 張'));
 const recommendedKan=currentKans().find(o=>o.recommend);
 if(recommendedKan){title.replaceChildren(el('span',null,'建議先'+actionName[recommendedKan.action.type]+' '),Tiles.node(recommendedKan.action.tile,'md'));copy.textContent='先看上方槓／不槓比較；以下是選擇不槓時的出牌方案。';}
 body.append(el('h5',null,recommendedKan?'若不槓，這一手怎麼打':'這一手怎麼看'));
 const list=el('ul','coach-lines');ex.lines.forEach(line=>list.append(el('li',null,line)));body.append(list);
 body.append(el('h5',null,best.shanten===0?'聽的牌（未見張數）':'打掉後的有效牌（未見張數）'));
 const outs=el('div','out-grid');best.outs.forEach(o=>{const cell=el('span','out');cell.append(Tiles.node(o.tile,'xs'),el('b',null,String(o.remaining)));outs.append(cell);});body.append(outs);
 if(best.shanten===0){const rest=game.hands[0].slice();rest.splice(rest.indexOf(best.tile),1);const est=tenpaiEstimate(rest,best.outs.map(o=>o.tile));if(est){body.append(el('h5',null,'聽牌台數預估（胡別人／自摸）'));body.append(est);}}
 body.append(el('h5',null,'打法比較'));
 const table=el('div','compare-table'),max=Math.max(1,...suggestions.map(o=>o.remaining));
 const rows=[...ex.tied.slice(0,2),...suggestions.filter(o=>!ex.tied.includes(o)).slice(0,3)];
 const pick=selected===null?null:suggestions.find(o=>o.tile===game.hands[0][selected]);
 if(pick&&!rows.includes(pick))rows.push(pick);
 rows.forEach(o=>{
  const row=el('div','compare-row'+(Coach.same(o,best)?' top':o.shanten>best.shanten?' behind':'')+(pick===o?' picked':''));
  const bar=el('span','bar'),fill=el('i');fill.style.width=Math.round(o.remaining/max*100)+'%';bar.append(fill);
  row.append(Tiles.node(o.tile,'xs'),el('span','rank',readiness(o.shanten)),bar,el('span','count',o.remaining+' 張'));table.append(row);
 });
 if(ex.tied.length>2)table.append(el('p','compare-note','並列最佳還有：'+ex.tied.slice(2).map(o=>Coach.label(o.tile)).join('、')));
 body.append(table);
 body.append(el('h5',null,'打掉後的手牌結構'));
 const groups=el('div','group-list');
 ex.structure.groups.slice().sort((a,b)=>groupOrder(a)-groupOrder(b)).forEach(g=>{const item=el('span','group '+g.kind);item.append(tileRow(g.tiles),el('small',null,Coach.KIND[g.kind]));groups.append(item);});
 game.melds[0].forEach(m=>{const item=el('span','group meld');item.append(tileRow(m.tiles),el('small',null,'攤牌'));groups.append(item);});
 body.append(groups);
 if(pick){
  const j=Coach.judge(suggestions,pick.tile,best);
  const card=el('div','coach-last '+j.verdict),head=el('div','coach-last-head');head.append(el('span','coach-tag','你選的牌'),Tiles.node(pick.tile,'xs'));
  card.append(head,el('p',null,j.text+(j.verdict==='best'?'':' '+Coach.tileRole(game.hands[0],pick.tile,E.publicTiles(game),game.melds[0].length))));body.append(card);
 }
 for(const text of Coach.patternHints(game.hands[0]))body.append(el('p','coach-option',text));
}
function groupOrder(g){return ['seq','tri','head','ryanmen','kanchan','penchan','pair','single'].indexOf(g.kind);}
// 依出牌順序還原桌上的牌（被吃碰槓胡拿走的牌不留在桌上）
function discardPile(){
 const pile=[];
 for(const e of game.log){
  if(e.action==='discard')pile.push({tile:e.tile,player:e.player});
  else if(['chi','pon','kan','ron'].includes(e.action)&&!e.robKan)pile.pop();
 }
 return pile;
}
// 散落模式：像真的牌桌一樣丟在中間一堆；位置與角度依序號固定，不會每次重畫亂跳
function scatter(i){
 const hash=n=>{const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
 const angle=i*2.39996+hash(i)*.9,radius=Math.sqrt(i+.6)/Math.sqrt(96);
 return {x:Math.cos(angle)*Math.min(radius,1.08)+(hash(i+7)-.5)*.12,y:Math.sin(angle)*Math.min(radius,1.08)+(hash(i+13)-.5)*.14,rot:(hash(i+29)-.5)*70};
}
function renderRiver(){
 const river=$('#discardRiver');river.replaceChildren();
 river.classList.toggle('neat',neatRiver);
 if(neatRiver){
  game.rivers.forEach((tiles,p)=>{const section=el('div','river-group');section.append(el('strong',null,seats[p]));const box=el('div','river-tiles');tiles.forEach(t=>box.append(Tiles.node(t,'sm')));section.append(box);river.append(section);});
  return;
 }
 const pile=discardPile(),w=(river.clientWidth||420)/2-18,h=(river.clientHeight||240)/2-22;
 pile.forEach((d,i)=>{
  const node=Tiles.node(d.tile,'sm'),pos=scatter(i);
  node.classList.add('pile-tile');if(i===pile.length-1){node.classList.add('latest');if(pile.length>shownPile)node.classList.add('toss');}
  node.style.left=Math.round(w+pos.x*w)+'px';node.style.top=Math.round(h+pos.y*h)+'px';node.style.setProperty?.('--rot',pos.rot.toFixed(1)+'deg');
  node.title=seats[d.player]+'打出 '+Coach.label(d.tile);river.append(node);
 });
 shownPile=pile.length;
 if(pile.length&&game.phase!=='ended'){const last=pile[pile.length-1],tag=el('span','pile-caption',seats[last.player]+'打出 '+Coach.label(last.tile));river.append(tag);}
}
// 依牌局紀錄播放音效與喊牌
function soundEvents(){
 if(typeof Sound==='undefined')return;
 const fresh=game.log.slice(heard.log);heard.log=game.log.length;
 const calls={chi:'吃',pon:'碰',kan:'槓',concealed:'槓',added:'槓',ron:'胡'};
 for(const e of fresh){
  if(e.action==='draw'&&e.player===0)Sound.play('draw');
  else if(e.action==='discard'){Sound.play('discard');Sound.say(Sound.tileName(e.tile));}
  else if(calls[e.action]){Sound.play(e.action==='ron'?'win':'claim');Sound.say(calls[e.action]);}
 }
 if(game.phase==='ended'&&heard.phase!=='ended'){
  if(/自摸/.test(game.result)){Sound.play(game.turn===0?'win':'lose');Sound.say('自摸');}
  else if(/流局/.test(game.result))Sound.play('lose');
  else if(!fresh.some(e=>e.action==='ron'))Sound.play(game.turn===0?'win':'lose');
 }
 heard.phase=game.phase;
}
function render(){
 const mine=game.turn===0, choosing=mine&&game.phase==='discard';
 const ws=winScore(),status=game.phase==='ended'?game.result+(ws?'・'+ws.result.total+' 台':''):game.phase==='claim'?(game.pending.kind==='robkan'?'加槓確認：等待搶槓胡或略過':'有人出牌：請選擇吃碰槓胡或略過'):seats[game.turn]+(game.phase==='draw'?'：請摸牌':'：請出牌');
 $('#turnStatus').textContent=status;$('#wallCount').textContent=game.wall.length;
 $('.player-label small').textContent=status;
 $('#phaseHelp').textContent=choosing?'點一張牌選取，再點一次（或按「確認出牌」、Enter）就打出。← → 可換選牌。':status;
 $('#drawButton').disabled=!(mine&&game.phase==='draw');
 $('#drawButton').textContent='摸牌';
 $('#discardButton').disabled=!choosing||selected===null;
 $('#winButton').disabled=!choosing||!E.winning(game.hands[0],game.melds[0].length);
 $('#sortButton').disabled=!mine||game.phase==='ended'||game.phase==='claim';
 $('#askSelected').disabled=!choosing||selected===null;
 $('#askAnswer').textContent='';
 if(game.phase==='ended'&&!session.settled)finishHand();
 renderSeats();
 renderClaims();
 const hand=$('#hand');hand.replaceChildren();
 const risk=settings.danger&&choosing?dangerMap():null;
 const own=game.hands[0],justDrew=choosing&&lastDrawn!==null&&own[own.length-1]===lastDrawn;
 own.forEach((t,i)=>{const b=document.createElement('button');b.className='tile mj mj-lg'+(selected===i?' selected':'')+(justDrew&&i===own.length-1?' drawn':'');b.innerHTML=Tiles.svg(t);b.setAttribute('aria-label',tile(t)+'，第 '+(i+1)+' 張');b.setAttribute('aria-pressed',selected===i);b.title=Coach.label(t);if(risk){const r=risk[t];b.className+=' risk-'+r.level;b.title+='・危險度：'+r.text;b.append(el('i','risk-dot'));}b.disabled=!choosing;b.onclick=()=>{if(selected===i){$('#discardButton').onclick();return;}selected=i;if(typeof Sound!=='undefined')Sound.play('select');render();};hand.append(b);});
 renderRiver();
 document.querySelectorAll('[data-seat]').forEach(box=>{const p=+box.dataset.seat;box.replaceChildren(...game.hands[p].map(()=>Tiles.back('xs')));box.title=seats[p]+'手牌 '+game.hands[p].length+' 張';});
 document.querySelectorAll('[data-meld-seat]').forEach(box=>{
  const p=+box.dataset.meldSeat,items=[];
  game.melds[p].forEach(m=>{const g=el('span','meld-group');g.title=actionName[m.type];m.tiles.forEach((t,i)=>g.append(m.type==='concealed'&&(p!==0||i===0||i===3)?Tiles.back('sm'):Tiles.node(t,'sm')));items.push(g);});
  if(game.flowers[p].length){const f=el('span','flower-group');f.title='補花';game.flowers[p].forEach(t=>f.append(Tiles.node(t,'xs')));items.push(f);}
  box.replaceChildren(...items);
 });
 coach();
 renderReview();
 soundEvents();
}
// 胡牌後的台數（依牌局紀錄計算一次後快取）
function winScore(){
 if(game.phase!=='ended'||typeof Scoring==='undefined')return null;
 const w=[...game.log].reverse().find(e=>['ron','tsumo','flowers'].includes(e.action));
 if(!w)return null;
 if(scoreCache.log!==game.log.length)scoreCache={log:game.log.length,value:{winner:w.player,result:Scoring.score(game,w.player)}};
 return scoreCache.value;
}
function scoreCard(ws){
 const card=el('div','score-card'),head=el('div','score-head');
 head.append(el('strong',null,(ws.winner===0?'你':seats[ws.winner])+' 胡牌'),el('span','score-total',ws.result.total+' 台'));
 card.append(head);
 const hand=el('div','score-hand');game.melds[ws.winner].forEach(m=>{const g=el('span','meld-group');m.tiles.forEach(t=>g.append(Tiles.node(t,'xs')));hand.append(g);});
 const closed=el('span','meld-group');game.hands[ws.winner].forEach(t=>closed.append(Tiles.node(t,'xs')));hand.append(closed);
 if(game.flowers[ws.winner].length){const f=el('span','flower-group');game.flowers[ws.winner].forEach(t=>f.append(Tiles.node(t,'xs')));hand.append(f);}
 card.append(hand);
 const list=el('ul','score-items');
 if(!ws.result.items.length)list.append(el('li',null,'沒有台數（屁胡），只算底。'));
 ws.result.items.forEach(x=>{const li=el('li');li.append(el('span','score-name',x.name),el('span','score-tai',x.tai+' 台'));if(x.note)li.append(el('small',null,x.note));list.append(li);});
 card.append(list);
 if(ws.result.payer)card.append(el('p','score-payer','付款：'+ws.result.payer));
 return card;
}
// 聽牌時預估每張胡牌的台數（放槍／自摸）
function tenpaiEstimate(rest,waits){
 if(typeof Scoring==='undefined')return null;
 const box=el('div','tai-estimate');
 waits.forEach(t=>{
  const g={...game,hands:game.hands.map((h,i)=>i===0?[...rest,t]:h),log:[...game.log]};
  const later={anyDiscard:true,ownDiscards:1,special:null,robKan:false,afterKan:false,lastTile:false}; // 預估的是打出這張之後才胡，天地人胡不適用
  const ron=Scoring.score(g,0,{...later,tsumo:false,tile:t,from:null});
  const tsumo=Scoring.score(g,0,{...later,tsumo:true,tile:t,from:null});
  const row=el('span','estimate');row.title=Scoring.summary(ron);
  row.append(Tiles.node(t,'xs'),el('b',null,'胡 '+ron.total+' 台'),el('small',null,'自摸 '+tsumo.total+' 台'));box.append(row);
 });
 return box;
}
function renderReview(){
 const review=$('#reviewView .empty-review');review.replaceChildren();
 const ws=winScore();if(ws)review.append(scoreCard(ws));
 if(!reviewTimeline.length){review.append(el('strong',null,'還沒有可覆盤的決策'),el('small',null,'出牌、吃碰槓與略過都會記錄當時的比較。'));return;}
 const good=turnLog.filter(x=>x.judge.verdict==='best').length,miss=turnLog.filter(x=>x.mistake).length;
 review.append(el('p','review-summary','你出牌 '+turnLog.length+' 次，其中 '+good+' 次與教練首選相同；標記為關鍵失誤 '+miss+' 次（退一步或少 4 張以上進張）。不同不代表錯誤，可以比較進聽數與有效牌差在哪裡。'));
 replayPanel(review);
 reviewTimeline.forEach((x,i)=>{
  if(x.kind){
   const item=el('div','review-item claim-detail');
   const chosenTiles=['chi','pon','kan'].includes(x.choice.type)?[...x.choice.tiles,x.tile].sort((a,b)=>a-b).map(Coach.label).join('、'):(x.tile==null?'':Coach.label(x.tile));
   item.append(el('strong',null,(i+1)+'. '+(x.choice.type==='pass'?'略過':actionName[x.choice.type])+' '+chosenTiles),el('p',null,x.summary),el('p',null,resolutionText(x)));
   const details=el('details');details.append(el('summary',null,'當時行動／略過比較'),el('p',null,x.details));item.append(details);review.append(item);return;
  }
  const item=el('div','review-item '+x.judge.verdict+(x.mistake?' mistake':'')),head=el('div','review-head');
  head.append(el('span','review-turn',(x.mistake?'⚠ ':'')+'第 '+(i+1)+' 手'),el('span',null,'摸'),x.drawn==null?el('span',null,'—'):Tiles.node(x.drawn,'xs'),el('span',null,'打'),Tiles.node(x.tile,'xs'),el('span','verdict',x.judge.verdict==='best'?'✓ 與教練相同':'教練建議'),...(x.judge.verdict==='best'?[]:[Tiles.node(x.best,'xs')]));
  item.append(head,el('p',null,x.judge.text+(x.reason?' '+x.reason:'')));if(x.defense)item.append(el('p','defense-note','當時的防守觀察：'+x.defense));review.append(item);
 });
 const log=el('details','review-log');log.append(el('summary',null,'完整動作紀錄'));
 game.log.filter(e=>e.action!=='draw').forEach((e,i)=>log.append(el('div',null,(i+1)+'. '+seats[e.player]+' '+(e.action==='response'?'選擇'+(actionName[e.choice]||'略過'):e.action==='resolution'?'回應結果：'+(actionName[e.choice]||'全員略過'):e.action==='added-attempt'?'嘗試加槓':e.robKan?'搶槓胡':actionName[e.action]||'打')+' '+tile(e.tile))));review.append(log);
}
function analyze(){suggestions=game.turn===0&&game.phase==='discard'?E.analyze(game.hands[0],E.publicTiles(game),game.melds[0].length):[];}
function computers(){
 if(game.phase==='claim'){
  for(let p=1;p<4&&game.phase==='claim';p++)if(!game.pending.decisions[p]){
   const choice=AI.chooseClaim(game,p,settings.level);
   E.respond(game,p,choice);
  }
  analyze();render();
  if(game.phase==='claim')return;
 }
 if(game.phase==='ended'||game.turn===0)return;
 const epoch=generation;
 timer=setTimeout(()=>{
  if(epoch!==generation)return;
  AI.act(game,game.turn,settings.level);
  render();computers();
 },450);
}
$('#drawButton').onclick=()=>{if(E.draw(game,0)){selected=null;lastDrawn=game.log[game.log.length-1].tile;analyze();}render();};
$('#discardButton').onclick=()=>{
 if(selected===null||game.phase!=='discard'||game.turn!==0)return;
 const t=game.hands[0][selected],ex=currentExplain(),best=ex?ex.best:suggestions[0];
 const kans=currentKans(),skipped=kans.length?decisionRecord({type:'pass'},kans,'未槓，選擇打'+tile(t),'skip-kan'):null;
 const record=best?{tile:t,drawn:lastDrawn,best:best.tile,judge:Coach.judge(suggestions,t,best),reason:Coach.tileRole(game.hands[0],best.tile,E.publicTiles(game),game.melds[0].length)}:null;
 if(record){
  record.defense=Defense.describe(Defense.inspect(game,0,t));
  const pick=suggestions.find(o=>o.tile===t),lost=pick?best.remaining-pick.remaining:0;
  record.mistake=!!pick&&(pick.shanten>best.shanten||lost>=4);
  record.warning=!record.mistake?'':pick.shanten>best.shanten?'這張打掉退了一步：'+readiness(best.shanten)+' 變成 '+readiness(pick.shanten)+'（建議打'+tile(best.tile)+'）':'這張打掉損失了 '+lost+' 張進張（建議打'+tile(best.tile)+'）';
  record.snapshot={hand:game.hands[0].slice(),melds:game.melds.map(ms=>ms.map(m=>({...m,tiles:m.tiles.slice()}))),rivers:game.rivers.map(r=>r.slice()),wall:game.wall.length,options:suggestions.slice(0,4).map(o=>({tile:o.tile,shanten:o.shanten,remaining:o.remaining}))};
 }
 if(E.discard(game,0,selected)){if(skipped)reviewTimeline.push(skipped);if(record){turnLog.push(record);reviewTimeline.push(record);lastReview=record;if(record.warning&&settings.coach)notify('⚠ '+record.warning);}selected=null;lastDrawn=null;suggestions=[];peek=false;render();computers();}
};
$('#winButton').onclick=()=>{if(E.win(game,0)){clearTimeout(timer);render();}};
$('#sortButton').onclick=()=>{game.hands[0].sort((a,b)=>a-b);selected=null;render();};
$('#resetButton').onclick=()=>newMatch();
$('#hintButton').onclick=()=>{peek=true;analyze();coach();};
// 新的一將：抓位（四張風牌蓋著洗，你抽一張）決定座位，抽到東的人當莊
function newMatch(){
 let dealer=0,msg='';
 if(settings.seatDraw){const w=Math.floor(Math.random()*4);dealer=(4-w)%4;msg='抓位：你抽到「'+WINDS[w]+'」，坐'+WINDS[w]+'位'+(w?'；東位的'+REL[dealer]+'當莊。':'，由你當莊。');}
 session={firstDealer:dealer,dealer,round:0,streak:0,hand:1,scores:[0,0,0,0],settled:false,last:null,next:null};
 newHand(msg);
}
function newHand(msg=''){
 generation++;clearTimeout(timer);
 game=E.create(Date.now(),{dealer:session.dealer,roundWind:session.round,streak:session.streak});
 session.settled=false;session.last=null;session.next=null;
 scoreCache={log:-1,value:null};selected=null;suggestions=[];lastDrawn=null;turnLog=[];reviewTimeline=[];lastReview=null;peek=false;replayIndex=0;
 heard={log:0,phase:game.phase};if(typeof Sound!=='undefined'){Sound.stop();Sound.play('shuffle');}
 updateSeats();
 const d=game.dice;notify((msg?msg+' ':'')+(game.dealer===0?'你':seats[game.dealer])+'擲骰 '+d.join('＋')+'＝'+(d[0]+d[1]+d[2])+'，從'+(game.wallOwner===0?'你':seats[game.wallOwner])+'的牌牆開門。');
 render();computers();
}
function updateSeats(){for(let p=0;p<4;p++){const w=WINDS[E.seatWind(game,p)],d=p===game.dealer;seats[p]=p===0?'你（'+w+'家'+(d?'・莊家':'')+'）':w+'家'+(d?'（莊）':'');}}
function roundName(){return WINDS[session.round]+'風'+WINDS[((game.dealer-session.firstDealer)%4+4)%4]+'局'+(game.streak?'・連'+game.streak:'');}
function fmt(n){return (n>0?'+':'')+n;}
function renderSeats(){
 $('#roundWind').textContent=WINDS[session.round];$('#roundName').textContent=roundName();
 for(const p of [1,2,3])$('#seatInfo'+p).textContent=WINDS[E.seatWind(game,p)]+'家・'+REL[p]+(p===game.dealer?'・莊':'')+'｜'+fmt(session.scores[p]);
 $('#myInfo').textContent='我的手牌｜'+fmt(session.scores[0])+(game.dealer===0?'・莊':'');
}
// 一局結束：計台、算點數、決定連莊或下莊，並記錄學習進度
function finishHand(){
 session.settled=true;
 const ws=winScore(),[base,perTai]=settings.stake.split('/').map(Number);
 let deltas=[0,0,0,0],payments=[];
 if(ws&&typeof Scoring!=='undefined'&&Scoring.settle){({deltas,payments}=Scoring.settle(game,ws.result,{base,perTai}));}
 session.scores=session.scores.map((v,i)=>v+deltas[i]);
 const dealerStays=!ws||ws.winner===game.dealer,nextDealer=dealerStays?game.dealer:(game.dealer+1)%4;
 const nextRound=!dealerStays&&nextDealer===session.firstDealer?(session.round+1)%4:session.round;
 session.next={dealer:nextDealer,streak:dealerStays?game.streak+1:0,round:nextRound};
 session.last={winner:ws?ws.winner:null,deltas,payments,dealerStays,base,perTai};
 if(typeof Quiz!=='undefined'){const p=Quiz.load();Quiz.recordGame(p,{won:!!ws&&ws.winner===0,tsumo:!!ws&&ws.winner===0&&ws.result.tsumo,dealIn:!!ws&&!ws.result.tsumo&&ws.result.ctx.from===0,draw:!ws,mistakes:turnLog.filter(x=>x.mistake).length,delta:deltas[0]});Quiz.save(p);}
}
function settleCard(){
 const x=session.last,card=el('div','settle-card');
 card.append(el('h5',null,'本局結算（'+x.base+' 底 '+x.perTai+' 台）'));
 if(x.payments.length)x.payments.forEach(y=>card.append(el('p',null,(y.payer===0?'你':seats[y.payer])+' 付 '+y.amount+'（'+y.tai+' 台）')));
 else card.append(el('p',null,'流局，沒有人付錢。'));
 const board=el('div','score-board');[0,1,2,3].forEach(p=>{const cell=el('span',x.deltas[p]>0?'up':x.deltas[p]<0?'down':'');cell.append(el('b',null,p===0?'你':seats[p]),el('small',null,fmt(x.deltas[p])+' → '+fmt(session.scores[p])));board.append(cell);});card.append(board);
 const n=session.next;card.append(el('p','settle-next',x.dealerStays?'莊家'+(x.winner===null?'流局':'胡牌')+'，連莊（下一局連 '+n.streak+'）。':'下莊，下一局由'+(n.dealer===0?'你':'你的'+REL[n.dealer])+'當莊'+(n.round!==session.round?'，進入'+WINDS[n.round]+'風圈':'')+'。'));
 const go=document.createElement('button');go.className='primary-button next-hand';go.textContent='下一局 ▶';go.onclick=()=>{Object.assign(session,session.next);session.hand++;newHand();};card.append(go);
 return card;
}
// 危險度：依公開資訊估計三家的威脅程度，算出每張牌可被胡的組合
function dangerMap(){
 const key=decisionKey();if(dangerCache.key===key)return dangerCache.value;
 const list=AI.threats(game,0),map={};
 for(const t of new Set(game.hands[0])){const d=AI.danger(game,0,t,list),lv=AI.dangerLevel(d);map[t]={level:lv,text:(lv==='safe'?'低':lv==='mid'?'中':'高')+'（'+d.per.map(x=>WINDS[E.seatWind(game,x.player)]+'家 '+x.ways+' 種'+(x.level?'・威脅'+x.level:'')).join('、')+'）'};}
 dangerCache={key,value:map};return map;
}
// 逐手回放：每一手的手牌快照、實際打出與教練首選；可只看關鍵失誤
function replayPanel(root){
 const list=turnLog.filter(x=>x.snapshot&&(!replayMistakes||x.mistake));
 const box=el('section','replay');root.append(box);
 const bar=el('div','replay-bar');box.append(bar);
 bar.append(el('strong',null,'逐手回放'));
 const only=el('button','secondary-button'+(replayMistakes?' on':''),replayMistakes?'顯示全部':'只看關鍵失誤');only.onclick=()=>{replayMistakes=!replayMistakes;replayIndex=0;renderReview();};
 if(!list.length){bar.append(only);box.append(el('p',null,replayMistakes?'這局沒有關鍵失誤。':'出牌後就能逐手回放。'));return;}
 replayIndex=Math.min(replayIndex,list.length-1);
 const x=list[replayIndex],prev=el('button','secondary-button','◀ 上一手'),next=el('button','secondary-button','下一手 ▶');
 prev.disabled=replayIndex===0;next.disabled=replayIndex===list.length-1;
 prev.onclick=()=>{replayIndex--;renderReview();};next.onclick=()=>{replayIndex++;renderReview();};
 bar.append(prev,el('span','replay-count',(replayIndex+1)+' / '+list.length),next,only);
 const n=turnLog.indexOf(x)+1,snap=x.snapshot;
 box.append(el('p','replay-head',(x.mistake?'⚠ 關鍵失誤・':'')+'你的第 '+n+' 次出牌（牌牆剩 '+snap.wall+' 張）'+(x.drawn==null?'':'，摸進 '+Coach.label(x.drawn))));
 const hand=el('div','replay-hand'),pickAt=snap.hand.indexOf(x.tile),bestAt=x.best===x.tile?-1:snap.hand.indexOf(x.best);snap.hand.forEach((t,i)=>{const n=Tiles.node(t,'sm');if(i===pickAt)n.classList.add('picked');if(i===bestAt)n.classList.add('best');hand.append(n);});
 box.append(el('small','replay-legend','紅框：你打出的牌　綠框：教練首選'));box.append(hand);
 box.append(el('p',null,'你打 '+Coach.label(x.tile)+(x.best===x.tile?'，與教練首選相同。':'；教練首選 '+Coach.label(x.best)+'。')+' '+x.judge.text));
 if(x.warning)box.append(el('p','defense-note',x.warning));
 const opts=el('div','compare-table');snap.options.forEach(o=>{const row=el('div','compare-row'+(o.tile===x.best?' top':'')+(o.tile===x.tile?' picked':''));row.append(Tiles.node(o.tile,'xs'),el('span','rank',readiness(o.shanten)),el('span','count',o.remaining+' 張'));opts.append(row);});box.append(opts);
 const rivers=el('details','replay-rivers');rivers.append(el('summary',null,'當時的牌河'));snap.rivers.forEach((r,p)=>{const row=el('div','river-line');row.append(el('small',null,p===0?'你':seats[p]));r.forEach(t=>row.append(Tiles.node(t,'xs')));rivers.append(row);});box.append(rivers);
}
$('#explainButton').onclick=()=>{const open=!$('#coachGlossary').classList.toggle('hidden');$('#explainButton').setAttribute('aria-expanded',String(open));};
function askCoach(question){
 if(/防守|安全|危險|放槍/.test(question)){if(game.turn===0&&game.phase==='discard'){analyze();$('#askAnswer').textContent=Defense.summary(game,suggestions)+(selected===null?'':'\n你選的牌：'+Defense.describe(Defense.inspect(game,0,game.hands[0][selected])));}else $('#askAnswer').textContent='輪到你出牌時可比較防守；吃碰回應卡會提示後續出牌風險。';return;}
 $('#askAnswer').textContent=Coach.contextualAnswer(question,game,selected===null?null:game.hands[0][selected]);
}
$('#askSelected').onclick=()=>askCoach('這張可以嗎');
$('#askForm').onsubmit=e=>{e.preventDefault();askCoach($('#askInput').value);};
function mode(name){for(const n of ['table','lesson','review'])$('#'+n+'View').classList.toggle('hidden',n!==name);document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===name));}
document.querySelectorAll('.mode-tab').forEach(b=>b.onclick=()=>mode(b.dataset.mode));
$('#riverToggle').onclick=()=>{neatRiver=!neatRiver;try{localStorage.setItem('mahjong-coach-river',neatRiver?'neat':'pile');}catch(e){}syncToggles();render();};
$('#soundButton').onclick=()=>{Sound.setEnabled(!Sound.isEnabled());syncToggles();if(Sound.isEnabled())Sound.play('tick');};
function syncToggles(){
 $('#riverToggle').textContent=neatRiver?'牌河：分家':'牌河：散落';$('#riverToggle').setAttribute('aria-pressed',String(neatRiver));
 $('#coachQuick').textContent=settings.coach?'提示：開':'提示：關';$('#coachQuick').setAttribute('aria-pressed',String(settings.coach));
 if(typeof Sound!=='undefined'){const on=Sound.isEnabled();$('#soundButton').textContent=on?'🔊':'🔇';$('#soundButton').title=on?'音效：開':'音效：關';$('#soundButton').setAttribute('aria-pressed',String(on));}
}
// 鍵盤：空白鍵摸牌、Enter 確認出牌、← → 選牌
document.addEventListener?.('keydown',e=>{
 if(e.target&&/INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY/.test(e.target.tagName))return;
 const choosing=game.turn===0&&game.phase==='discard';
 if(e.key===' '&&!$('#drawButton').disabled){e.preventDefault();$('#drawButton').onclick();}
 else if(e.key==='Enter'&&choosing&&selected!==null){e.preventDefault();$('#discardButton').onclick();}
 else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&choosing){e.preventDefault();const n=game.hands[0].length;selected=selected===null?(e.key==='ArrowLeft'?n-1:0):(selected+(e.key==='ArrowLeft'?n-1:1))%n;render();}
});
function renderClaims(){
 const target=$('#claimActions');target.replaceChildren();
 if(game.phase==='ended'&&session.next){const b=document.createElement('button');b.className='primary-button next-hand';b.textContent='下一局 ▶';b.onclick=()=>{Object.assign(session,session.next);session.hand++;newHand();};target.append(b);return;}
 if(waiting()){
  for(const a of [...E.claims(game,0),{type:'pass'}]){
   const button=document.createElement('button');button.className='secondary-button';
   button.textContent=a.type==='pass'?'略過（不吃碰槓胡）':actionName[a.type]+' '+a.tiles.map(tile).join(' ');
   button.onclick=()=>{const report=currentClaim(),record=decisionRecord(a,report.options,report.summary);if(E.respond(game,0,a)){reviewTimeline.push(record);selected=null;lastDrawn=null;analyze();render();computers();}};target.append(button);
  }
 }else for(const a of E.selfKans(game,0)){
  const button=document.createElement('button');button.className='secondary-button';button.textContent=actionName[a.type]+' '+tile(a.tile);
  button.onclick=()=>{const options=currentKans(),chosen=options.find(o=>JSON.stringify(o.action)===JSON.stringify(a)),record=decisionRecord(a,options,chosen?.compact||'','self-kan');record.tile=a.tile;if(E.selfKan(game,0,a)){reviewTimeline.push(record);selected=null;lastDrawn=null;analyze();render();computers();}};target.append(button);
 }
}
function setupVoice(){
 if(typeof Sound==='undefined'||!Sound.voices)return;
 const select=$('#voiceSelect'),style=$('#voiceStyle');
 for(const [key,p] of Object.entries(Sound.profiles)){const o=el('option',null,p.label);o.value=key;style.append(o);}
 style.value=Sound.settings().profile;
 const refresh=()=>{const list=Sound.voices(),saved=Sound.settings();select.replaceChildren();const auto=el('option',null,'自動選擇中文語音');auto.value='';select.append(auto);for(const v of list){const o=el('option',null,v.name+'（'+v.lang+'）');o.value=v.voiceURI;select.append(o);}select.value=list.some(v=>v.voiceURI===saved.voiceId)?saved.voiceId:'';$('#voiceStatus').textContent=list.length?'系統聲線依裝置提供；男女老少風格為音高／語速模擬，不是真人錄音。'+(saved.voiceId&&!list.some(v=>v.voiceURI===saved.voiceId)?'原聲線不可用，暫用自動選擇。':''):'目前沒有可用中文語音。請在系統安裝中文語音後重新開啟瀏覽器；碰牌音效仍可使用。';};
 select.onchange=style.onchange=()=>{Sound.stop();Sound.setVoice(select.value,style.value);};
 $('#voicePreview').onclick=()=>{Sound.stop();if(!Sound.say('八萬，三筒，六條，白板'))$('#voiceStatus').textContent=Sound.isEnabled()?'無法播放：尚無可用中文語音或瀏覽器不支援。':'目前已靜音，請先開啟右上角音效。';};
 globalThis.speechSynthesis?.addEventListener('voiceschanged',refresh);refresh();
}
// 量測實際牌桌外框，避免標題、字型或視窗寬度改變後錯位。
function setupCoachSize(){
 if(typeof ResizeObserver==='undefined')return;
 const table=$('.mahjong-table'),column=$('.table-column'),card=$('.coach-card');
 const sync=()=>{const rect=table.getBoundingClientRect(),parent=column.getBoundingClientRect();if(rect.height){card.style.setProperty('--table-height',rect.height+'px');card.style.setProperty('--table-offset',(rect.top-parent.top)+'px');}};
 const observer=new ResizeObserver(sync);observer.observe(table);observer.observe(column);sync();
}
function setupSettings(){
 const level=$('#levelSelect'),coachBox=$('#coachToggle'),dangerBox=$('#dangerToggle'),seatBox=$('#seatDrawToggle'),stake=$('#stakeSelect');
 level.value=settings.level;coachBox.checked=settings.coach;dangerBox.checked=settings.danger;seatBox.checked=settings.seatDraw;stake.value=settings.stake;
 level.onchange=()=>{settings.level=level.value;saveSettings();notify('電腦難度：'+AI.LEVELS[settings.level]);};
 coachBox.onchange=()=>{settings.coach=coachBox.checked;saveSettings();syncToggles();render();};
 dangerBox.onchange=()=>{settings.danger=dangerBox.checked;saveSettings();render();};
 seatBox.onchange=()=>{settings.seatDraw=seatBox.checked;saveSettings();};
 stake.onchange=()=>{settings.stake=stake.value;saveSettings();};
 $('#coachQuick').onclick=()=>{settings.coach=!settings.coach;coachBox.checked=settings.coach;saveSettings();syncToggles();render();};
 $('#rotateDismiss').onclick=()=>{$('#rotateHint').classList.add('hidden');try{localStorage.setItem('mahjong-coach-rotate','1');}catch(e){}};
 try{if(localStorage.getItem('mahjong-coach-rotate'))$('#rotateHint').classList.add('hidden');}catch(e){}
}
setupVoice();setupSettings();updateSeats();syncToggles();render();setupCoachSize();
if(typeof setupLessons==='function')setupLessons($,name=>{if(typeof Stages!=='undefined')Stages.complete(0);mode(name);});
if(typeof Stages!=='undefined')Stages.setup($,mode);
if('serviceWorker' in navigator){
 let reloading=false;
 const hadController=!!navigator.serviceWorker.controller; // 第一次安裝時不重新整理，避免打到一半的牌局被重置
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!reloading){reloading=true;location.reload();}});
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}
