'use strict';
const E=Mahjong, $=s=>document.querySelector(s);
const seats=['你（東家・莊家）','南家','西家','北家'];
let game=E.create(), selected=null, timer=null, generation=0, suggestions=[], lessonStep=0;
let lastDrawn=null, turnLog=[], lastReview=null, explainCache={key:'',value:null};
function notify(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').classList.remove('show'),2400);}
function tile(t){return E.names[t];}
const actionName={chi:'吃',pon:'碰',kan:'明槓',ron:'胡',concealed:'暗槓',added:'加槓'};
function readiness(n){return n===0?'已聽牌':(['','一','兩','三','四','五','六','七','八','九','十'][n]||n)+'進聽';}
function waiting(){return game.phase==='claim'&&!game.pending.decisions[0];}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=text;return x;}
function tileRow(tiles,size='xs'){const row=el('span','tile-row');tiles.forEach(t=>row.append(Tiles.node(t,size)));return row;}
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
  const good=turnLog.filter(x=>x.judge.verdict==='best').length;
  copy.textContent=turnLog.length?'這局你出牌 '+turnLog.length+' 次，其中 '+good+' 次和教練首選相同。到「牌局覆盤」可以逐手回看差在哪裡。':'可到牌局覆盤查看本局操作，或重新開始。';return;
 }
 if(game.phase==='claim'){
  title.replaceChildren(el('span',null,seats[game.pending.from]+'打出 '),Tiles.node(game.pending.tile,'sm'));
  copy.textContent='先決定要不要吃碰槓胡，再繼續摸打。胡優先於碰／槓，碰／槓優先於吃。';
  E.claims(game,0).forEach(a=>body.append(el('p','coach-option',actionName[a.type]+'：'+E.claimAdvice(game,0,a))));
  reviewCard(body);return;
 }
 if(game.turn!==0){title.textContent='等待'+seats[game.turn];copy.textContent='電腦依自己的手牌出牌，你可以趁這時看看牌河。';reviewCard(body);return;}
 if(game.phase==='draw'){
  title.textContent='輪到你摸牌';copy.textContent='目前'+readiness(E.shanten(game.hands[0],game.melds[0].length))+'。摸牌後，教練會解說這一手該怎麼打。';reviewCard(body);return;
 }
 if(E.winning(game.hands[0],game.melds[0].length)){title.textContent='可以自摸！';copy.textContent='五組加一對已成立，按「胡牌」結束本局。';return;}
 const ex=currentExplain();if(!ex){title.textContent='請選牌出牌';copy.remove();return;}
 const best=ex.best;
 title.replaceChildren(el('span',null,'建議打出 '),Tiles.node(best.tile,'md'));
 copy.className='coach-chips';copy.replaceChildren(el('span','chip',best.shanten===0?'打後聽牌':'打後'+readiness(best.shanten)),el('span','chip',(best.shanten===0?'可胡 ':'有效牌 ')+best.remaining+' 張'));
 body.append(el('h5',null,'這一手怎麼看'));
 const list=el('ul','coach-lines');ex.lines.forEach(line=>list.append(el('li',null,line)));body.append(list);
 body.append(el('h5',null,best.shanten===0?'聽的牌（未見張數）':'打掉後的有效牌（未見張數）'));
 const outs=el('div','out-grid');best.outs.forEach(o=>{const cell=el('span','out');cell.append(Tiles.node(o.tile,'xs'),el('b',null,String(o.remaining)));outs.append(cell);});body.append(outs);
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
function render(){
 const mine=game.turn===0, choosing=mine&&game.phase==='discard';
 const status=game.phase==='ended'?game.result:game.phase==='claim'?'有人出牌：請選擇吃碰槓胡或略過':seats[game.turn]+(game.phase==='draw'?'：請摸牌':'：請出牌');
 $('#turnStatus').textContent=status;$('#wallCount').textContent=game.wall.length;
 $('.player-label small').textContent=status;
 $('#phaseHelp').textContent=choosing?'點選任意一張手牌，再按「確認出牌」。摸牌按鈕已鎖定。':status;
 $('#drawButton').disabled=!(mine&&game.phase==='draw');
 $('#drawButton').textContent='摸牌';
 $('#discardButton').disabled=!choosing||selected===null;
 $('#winButton').disabled=!choosing||!E.winning(game.hands[0],game.melds[0].length);
 $('#sortButton').disabled=!mine||game.phase==='ended'||game.phase==='claim';
 $('#askSelected').disabled=!choosing||selected===null;
 $('#askAnswer').textContent='';
 renderClaims();
 const hand=$('#hand');hand.replaceChildren();
 const own=game.hands[0],justDrew=choosing&&lastDrawn!==null&&own[own.length-1]===lastDrawn;
 own.forEach((t,i)=>{const b=document.createElement('button');b.className='tile mj mj-lg'+(selected===i?' selected':'')+(justDrew&&i===own.length-1?' drawn':'');b.innerHTML=Tiles.svg(t);b.setAttribute('aria-label',tile(t)+'，第 '+(i+1)+' 張');b.setAttribute('aria-pressed',selected===i);b.title=Coach.label(t);b.disabled=!choosing;b.onclick=()=>{selected=selected===i?null:i;render();};hand.append(b);});
 $('#discardRiver').replaceChildren();
 game.rivers.forEach((river,p)=>{const section=document.createElement('div');section.className='river-group';const label=document.createElement('strong');label.textContent=seats[p];section.append(label);const box=el('div','river-tiles');river.forEach(t=>box.append(Tiles.node(t,'sm')));section.append(box);$('#discardRiver').append(section);});
 $('#flowerInfo').replaceChildren(...game.flowers.map((f,p)=>{const x=el('span','flower-line');x.append(el('b',null,seats[p]+'補花'));if(f.length)f.forEach(t=>x.append(Tiles.node(t,'xs')));else x.append(el('span',null,'無'));return x;}));
 document.querySelectorAll('[data-seat]').forEach(box=>{const p=+box.dataset.seat;box.replaceChildren(...game.hands[p].map(()=>Tiles.back('xxs')));box.title=seats[p]+'手牌 '+game.hands[p].length+' 張';});
 $('#meldInfo').replaceChildren();
 game.melds.forEach((ms,p)=>{if(!ms.length)return;const line=el('p','meld-line');line.append(el('b',null,seats[p]+'攤牌'));ms.forEach(m=>{const g=el('span','meld-group');g.append(el('small',null,actionName[m.type]));m.tiles.forEach((t,i)=>g.append(m.type==='concealed'&&(p!==0||i===0||i===3)?Tiles.back('sm'):Tiles.node(t,'sm')));line.append(g);});$('#meldInfo').append(line);});
 coach();
 renderReview();
}
function renderReview(){
 const review=$('#reviewView .empty-review');review.replaceChildren();
 if(!turnLog.length){review.append(el('strong',null,'還沒有可覆盤的出牌'),el('small',null,'摸牌並出牌後，這裡會逐手記錄你的選擇與教練的解說。'));return;}
 const good=turnLog.filter(x=>x.judge.verdict==='best').length;
 review.append(el('p','review-summary','你出牌 '+turnLog.length+' 次，其中 '+good+' 次與教練首選相同。不同不代表錯誤，可以比較進聽數與有效牌差在哪裡。'));
 turnLog.forEach((x,i)=>{
  const item=el('div','review-item '+x.judge.verdict),head=el('div','review-head');
  head.append(el('span','review-turn','第 '+(i+1)+' 手'),el('span',null,'摸'),x.drawn==null?el('span',null,'—'):Tiles.node(x.drawn,'xs'),el('span',null,'打'),Tiles.node(x.tile,'xs'),el('span','verdict',x.judge.verdict==='best'?'✓ 與教練相同':'教練建議'),...(x.judge.verdict==='best'?[]:[Tiles.node(x.best,'xs')]));
  item.append(head,el('p',null,x.judge.text+(x.reason?' '+x.reason:'')));review.append(item);
 });
 const log=el('details','review-log');log.append(el('summary',null,'完整動作紀錄'));
 game.log.filter(e=>e.action!=='draw').forEach((e,i)=>log.append(el('div',null,(i+1)+'. '+seats[e.player]+' '+(actionName[e.action]||'打')+' '+tile(e.tile))));review.append(log);
}
function analyze(){suggestions=game.turn===0&&game.phase==='discard'?E.analyze(game.hands[0],E.publicTiles(game),game.melds[0].length):[];}
function computers(){
 if(game.phase==='claim'){
  for(let p=1;p<4&&game.phase==='claim';p++)if(!game.pending.decisions[p]){
   const options=E.claims(game,p);
   const choice=options.find(a=>a.type==='ron')||options.find(a=>a.type==='pon')||{type:'pass'};
   E.respond(game,p,choice);
  }
  analyze();render();
  if(game.phase==='claim')return;
 }
 if(game.phase==='ended'||game.turn===0)return;
 const epoch=generation;
 timer=setTimeout(()=>{
  if(epoch!==generation)return;
  const p=game.turn;
  if(game.phase==='draw'){E.draw(game,p);if(game.phase==='discard'&&E.winning(game.hands[p],game.melds[p].length))E.win(game,p);}
  else E.discard(game,p,E.aiIndex(game.hands[p],game.melds[p].length));
  render();computers();
 },450);
}
$('#drawButton').onclick=()=>{if(E.draw(game,0)){selected=null;lastDrawn=game.log[game.log.length-1].tile;analyze();}render();};
$('#discardButton').onclick=()=>{
 if(selected===null||game.phase!=='discard'||game.turn!==0)return;
 const t=game.hands[0][selected],ex=currentExplain(),best=ex?ex.best:suggestions[0];
 const record=best?{tile:t,drawn:lastDrawn,best:best.tile,judge:Coach.judge(suggestions,t,best),reason:Coach.tileRole(game.hands[0],best.tile,E.publicTiles(game),game.melds[0].length)}:null;
 if(E.discard(game,0,selected)){if(record){turnLog.push(record);lastReview=record;}selected=null;lastDrawn=null;suggestions=[];render();computers();}
};
$('#winButton').onclick=()=>{if(E.win(game,0)){clearTimeout(timer);render();}};
$('#sortButton').onclick=()=>{game.hands[0].sort((a,b)=>a-b);selected=null;render();};
$('#resetButton').onclick=()=>{generation++;clearTimeout(timer);game=E.create();selected=null;suggestions=[];lastDrawn=null;turnLog=[];lastReview=null;render();};
$('#hintButton').onclick=()=>{analyze();coach();};
$('#explainButton').onclick=()=>{const open=!$('#coachGlossary').classList.toggle('hidden');$('#explainButton').setAttribute('aria-expanded',String(open));};
function askCoach(question){
 $('#askAnswer').textContent=Coach.contextualAnswer(question,game,selected===null?null:game.hands[0][selected]);
}
$('#askSelected').onclick=()=>askCoach('這張可以嗎');
$('#askForm').onsubmit=e=>{e.preventDefault();askCoach($('#askInput').value);};
function mode(name){for(const n of ['table','lesson','review'])$('#'+n+'View').classList.toggle('hidden',n!==name);document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===name));}
document.querySelectorAll('.mode-tab').forEach(b=>b.onclick=()=>mode(b.dataset.mode));
function renderClaims(){
 const target=$('#claimActions');target.replaceChildren();
 if(waiting()){
  for(const a of [...E.claims(game,0),{type:'pass'}]){
   const button=document.createElement('button');button.className='secondary-button';
   button.textContent=a.type==='pass'?'略過（不吃碰槓胡）':actionName[a.type]+' '+a.tiles.map(tile).join(' ');
   button.onclick=()=>{if(E.respond(game,0,a)){selected=null;lastDrawn=null;analyze();render();computers();}};target.append(button);
  }
 }else for(const a of E.selfKans(game,0)){
  const button=document.createElement('button');button.className='secondary-button';button.textContent=actionName[a.type]+' '+tile(a.tile);
  button.onclick=()=>{if(E.selfKan(game,0,a)){selected=null;lastDrawn=null;analyze();render();}};target.append(button);
 }
}
render();
if(typeof setupLessons==='function')setupLessons($,mode);
if('serviceWorker' in navigator){
 let reloading=false;
 const hadController=!!navigator.serviceWorker.controller; // 第一次安裝時不重新整理，避免打到一半的牌局被重置
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!reloading){reloading=true;location.reload();}});
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}
