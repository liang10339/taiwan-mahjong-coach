'use strict';
const E=Mahjong, $=s=>document.querySelector(s);
const seats=['你（東家・莊家）','南家','西家','北家'];
let game=E.create(), selected=null, timer=null, generation=0, suggestions=[], lessonStep=0;
function notify(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').classList.remove('show'),2400);}
function tile(t){return E.names[t];}
function coach(){
 const body=$('#coachBody');body.replaceChildren();
 const title=document.createElement('h4'),copy=document.createElement('p');body.append(title,copy);
 if(game.phase==='ended'){title.textContent=game.result;copy.textContent='可到牌局覆盤查看本局操作，或重新開始。';return;}
 if(game.turn!==0){title.textContent='等待'+seats[game.turn];copy.textContent='電腦只能依自己的手牌選擇出牌。';return;}
 if(game.phase==='draw'){title.textContent='輪到你摸牌';copy.textContent='目前 '+game.hands[0].length+' 張。摸一張後再比較出牌選擇。';return;}
 if(E.winning(game.hands[0])){title.textContent='可以自摸';copy.textContent='五組加一對已成立，按「胡牌」結束本局。';return;}
 title.textContent='依目前手牌比較出牌';
 copy.textContent='優先減少向聽，再比較有效進張。剩餘數量只扣除你看得到的牌，包含可能在對手手上的牌，不是牌牆實際數量。尚未考慮台數與防守。';
 for(const option of suggestions.slice(0,3)){
  const row=document.createElement('p');row.className='coach-option';
  row.textContent='打 '+tile(option.tile)+' → '+(option.shanten===0?'聽牌':option.shanten+' 向聽')+'；有效進張 '+option.remaining+' 張（'+option.improving.map(tile).join('、')+'）';
  body.append(row);
 }
}
function render(){
 const mine=game.turn===0, choosing=mine&&game.phase==='discard';
 const status=game.phase==='ended'?game.result:seats[game.turn]+(game.phase==='draw'?'：請摸牌':'：請出牌');
 $('#turnStatus').textContent=status;$('#wallCount').textContent=game.wall.length;
 $('.player-label small').textContent=status;
 $('#phaseHelp').textContent=choosing?'點選任意一張手牌，再按「確認出牌」。摸牌按鈕已鎖定。':status;
 $('#drawButton').disabled=!(mine&&game.phase==='draw');
 $('#drawButton').textContent='摸牌';
 $('#discardButton').disabled=!choosing||selected===null;
 $('#winButton').disabled=!choosing||!E.winning(game.hands[0]);
 $('#sortButton').disabled=!mine||game.phase==='ended';
 const hand=$('#hand');hand.replaceChildren();
 game.hands[0].forEach((t,i)=>{const b=document.createElement('button');b.className='tile'+(selected===i?' selected':'');b.textContent=tile(t);b.setAttribute('aria-label',tile(t)+'，第 '+(i+1)+' 張');b.setAttribute('aria-pressed',selected===i);b.disabled=!choosing;b.onclick=()=>{selected=i;render();};hand.append(b);});
 $('#discardRiver').replaceChildren();
 game.rivers.forEach((river,p)=>{const section=document.createElement('div');section.className='river-group';const label=document.createElement('strong');label.textContent=seats[p];section.append(label);river.forEach(t=>{const x=document.createElement('span');x.textContent=tile(t);section.append(x);});$('#discardRiver').append(section);});
 $('#flowerInfo').textContent=game.flowers.map((f,p)=>seats[p]+'補花：'+(f.map(tile).join('、')||'無')).join(' ｜ ');
 coach();
 const review=$('#reviewView .empty-review');review.replaceChildren();
 const header=document.createElement('p');header.textContent='本局出牌紀錄（非完整逐手覆盤）';review.append(header);
 game.log.filter(e=>e.action==='discard').forEach((e,i)=>{const p=document.createElement('div');p.textContent=(i+1)+'. '+seats[e.player]+' 打 '+tile(e.tile);review.append(p);});
}
function analyze(){suggestions=game.turn===0&&game.phase==='discard'?E.analyze(game.hands[0],game.rivers.flat()):[];}
function computers(){
 if(game.phase==='ended'||game.turn===0)return;
 const epoch=generation;
 timer=setTimeout(()=>{
  if(epoch!==generation)return;
  const p=game.turn;
  if(game.phase==='draw'){E.draw(game,p);if(game.phase==='discard'&&E.winning(game.hands[p]))E.win(game,p);}
  else E.discard(game,p,E.aiIndex(game.hands[p]));
  render();computers();
 },450);
}
$('#drawButton').onclick=()=>{if(E.draw(game,0)){selected=null;analyze();}render();};
$('#discardButton').onclick=()=>{if(E.discard(game,0,selected)){selected=null;suggestions=[];render();computers();}};
$('#winButton').onclick=()=>{if(E.win(game,0)){clearTimeout(timer);render();}};
$('#sortButton').onclick=()=>{game.hands[0].sort((a,b)=>a-b);selected=null;render();};
$('#resetButton').onclick=()=>{generation++;clearTimeout(timer);game=E.create();selected=null;suggestions=[];render();};
$('#hintButton').onclick=()=>{analyze();coach();};
$('#explainButton').onclick=()=>notify('向聽表示距離聽牌還差幾步；有效進張是可降低向聽的牌。建議只比較牌效率。');
function mode(name){for(const n of ['table','lesson','review'])$('#'+n+'View').classList.toggle('hidden',n!==name);document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===name));}
document.querySelectorAll('.mode-tab').forEach(b=>b.onclick=()=>mode(b.dataset.mode));
const lessons=[
 ['認識三種數字牌','萬、筒、索各有一到九，每種四張。另外有東南西北、中發白與八張花牌。',['1萬','1筒','1索','東','春']],
 ['五組加一對','本練習用五個順子或刻子，加上一對判定胡牌。字牌不能組順子。',['123萬','777筒','東東']],
 ['本版自動配牌','目前自動洗牌、每人配十六張並補花，你固定坐東家。抓位、擲骰與開門的互動教學尚未實作。',['洗牌','配牌','補花']],
 ['摸牌後選牌，再確認','按摸牌後手牌變十七張。點任一張選取，再按確認出牌，回到十六張。',['摸牌','選牌','確認出牌']],
 ['觀察提示','教練比較不同出牌後的向聽與可見剩餘進張。不要固定丟字牌：對子、刻子也有價值。',['比較','選擇','實戰']]
];
function lesson(){const [title,description,items]=lessons[lessonStep];$('#lessonTitle').textContent=title;$('#lessonDescription').textContent=description;$('#lessonStepNumber').textContent=lessonStep+1;$('#lessonDemo').replaceChildren();for(const text of items){const span=document.createElement('span');span.className='demo-tile wide';span.textContent=text;$('#lessonDemo').append(span);}$('#lessonBack').disabled=!lessonStep;$('#lessonNext').textContent=lessonStep===4?'進入實戰':'下一步';$('#lessonProgressBar').style.width=(lessonStep+1)*20+'%';document.querySelectorAll('.lesson-node').forEach((n,i)=>n.classList.toggle('active',i===lessonStep));}
$('#lessonBack').onclick=()=>{lessonStep=Math.max(0,lessonStep-1);lesson();};
$('#lessonNext').onclick=()=>{if(lessonStep===4)mode('table');else{lessonStep++;lesson();}};
render();lesson();
if('serviceWorker' in navigator){
 let reloading=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!reloading){reloading=true;location.reload();}});
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}
