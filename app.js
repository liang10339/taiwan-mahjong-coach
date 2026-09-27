'use strict';
const E=Mahjong, $=s=>document.querySelector(s);
const seats=['你（東家・莊家）','南家','西家','北家'];
let game=E.create(), selected=null, timer=null, generation=0, suggestions=[], lessonStep=0;
function notify(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').classList.remove('show'),2400);}
function tile(t){return E.names[t];}
const actionName={chi:'吃',pon:'碰',kan:'明槓',ron:'胡',concealed:'暗槓',added:'加槓'};
function readiness(n){return n===0?'已聽牌':(['','一','兩','三','四','五','六','七','八','九','十'][n]||n)+'進聽';}
function waiting(){return game.phase==='claim'&&!game.pending.decisions[0];}
function coach(){
 const body=$('#coachBody');body.replaceChildren();
 const title=document.createElement('h4'),copy=document.createElement('p');body.append(title,copy);
 if(game.phase==='ended'){title.textContent=game.result;copy.textContent='可到牌局覆盤查看本局操作，或重新開始。';return;}
 if(game.phase==='claim'){
  title.textContent=seats[game.pending.from]+'打出 '+tile(game.pending.tile);
  copy.textContent='先決定要不要吃碰槓胡，再繼續摸打。胡優先於碰／槓，碰／槓優先於吃；同時胡時本練習採出牌者下家方向最近的一家。';
  E.claims(game,0).forEach(a=>{const p=document.createElement('p');p.className='coach-option';p.textContent=actionName[a.type]+'：'+E.claimAdvice(game,0,a);body.append(p);});return;
 }
 if(game.turn!==0){title.textContent='等待'+seats[game.turn];copy.textContent='電腦只能依自己的手牌選擇出牌。';return;}
 if(game.phase==='draw'){title.textContent='輪到你摸牌';copy.textContent='目前 '+game.hands[0].length+' 張。摸一張後再比較出牌選擇。';return;}
 if(E.winning(game.hands[0],game.melds[0].length)){title.textContent='可以自摸';copy.textContent='五組加一對已成立，按「胡牌」結束本局。';return;}
 title.textContent='依目前手牌比較出牌';
 copy.textContent='先比較哪種打法能更快聽牌，再看摸到哪些牌能讓手牌更進一步。「一進聽」表示再進一張合適的牌、出牌後就有機會聽牌，不是再摸一次就一定聽。張數只扣除你看得到的牌，也可能包含對手手上的牌，並非牌牆實際剩餘數量。尚未考慮台數與防守。';
 for(const option of suggestions.slice(0,3)){
  const row=document.createElement('p');row.className='coach-option';
  row.textContent='打 '+tile(option.tile)+' → '+readiness(option.shanten)+'；'+(option.shanten===0?'可胡的牌':'摸到能更接近聽牌的牌')+'：'+(option.improving.map(tile).join('、')||'目前沒有')+'（尚未看見 '+option.remaining+' 張）';
  body.append(row);
 }
}
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
 renderClaims();
 const hand=$('#hand');hand.replaceChildren();
 game.hands[0].forEach((t,i)=>{const b=document.createElement('button');b.className='tile'+(selected===i?' selected':'');b.textContent=tile(t);b.setAttribute('aria-label',tile(t)+'，第 '+(i+1)+' 張');b.setAttribute('aria-pressed',selected===i);b.disabled=!choosing;b.onclick=()=>{selected=i;render();};hand.append(b);});
 $('#discardRiver').replaceChildren();
 game.rivers.forEach((river,p)=>{const section=document.createElement('div');section.className='river-group';const label=document.createElement('strong');label.textContent=seats[p];section.append(label);river.forEach(t=>{const x=document.createElement('span');x.textContent=tile(t);section.append(x);});$('#discardRiver').append(section);});
 $('#flowerInfo').textContent=game.flowers.map((f,p)=>seats[p]+'補花：'+(f.map(tile).join('、')||'無')).join(' ｜ ');
 $('#meldInfo').replaceChildren();
 game.melds.forEach((ms,p)=>{const line=document.createElement('p');line.textContent=seats[p]+'攤牌：'+(ms.map(m=>actionName[m.type]+' '+(m.type==='concealed'&&p!==0?'四張蓋牌':m.tiles.map(tile).join(' '))).join(' ｜ ')||'無');$('#meldInfo').append(line);});
 coach();
 const review=$('#reviewView .empty-review');review.replaceChildren();
 const header=document.createElement('p');header.textContent='本局出牌紀錄（非完整逐手覆盤）';review.append(header);
 game.log.filter(e=>e.action!=='draw').forEach((e,i)=>{const p=document.createElement('div');p.textContent=(i+1)+'. '+seats[e.player]+' '+(actionName[e.action]||'打')+' '+tile(e.tile);review.append(p);});
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
$('#drawButton').onclick=()=>{if(E.draw(game,0)){selected=null;analyze();}render();};
$('#discardButton').onclick=()=>{if(E.discard(game,0,selected)){selected=null;suggestions=[];render();computers();}};
$('#winButton').onclick=()=>{if(E.win(game,0)){clearTimeout(timer);render();}};
$('#sortButton').onclick=()=>{game.hands[0].sort((a,b)=>a-b);selected=null;render();};
$('#resetButton').onclick=()=>{generation++;clearTimeout(timer);game=E.create();selected=null;suggestions=[];render();};
$('#hintButton').onclick=()=>{analyze();coach();};
$('#explainButton').onclick=()=>notify('一進聽：再進一張合適的牌、出牌後就有機會聽牌；兩進聽則還要改善兩步。這不是保證摸幾次就會聽牌。');
function mode(name){for(const n of ['table','lesson','review'])$('#'+n+'View').classList.toggle('hidden',n!==name);document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===name));}
document.querySelectorAll('.mode-tab').forEach(b=>b.onclick=()=>mode(b.dataset.mode));
function renderClaims(){
 const target=$('#claimActions');target.replaceChildren();
 if(waiting()){
  for(const a of [...E.claims(game,0),{type:'pass'}]){
   const button=document.createElement('button');button.className='secondary-button';
   button.textContent=a.type==='pass'?'略過（不吃碰槓胡）':actionName[a.type]+' '+a.tiles.map(tile).join(' ');
   button.onclick=()=>{if(E.respond(game,0,a)){selected=null;analyze();render();computers();}};target.append(button);
  }
 }else for(const a of E.selfKans(game,0)){
  const button=document.createElement('button');button.className='secondary-button';button.textContent=actionName[a.type]+' '+tile(a.tile);
  button.onclick=()=>{if(E.selfKan(game,0,a)){selected=null;analyze();render();}};target.append(button);
 }
}
render();
if(typeof setupLessons==='function')setupLessons($,mode);
if('serviceWorker' in navigator){
 let reloading=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;location.reload();}});
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}
