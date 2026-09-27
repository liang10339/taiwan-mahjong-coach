const tiles = ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏','🀐','🀑','🀒','🀓','🀔','🀕','🀀'];
const hand = document.querySelector('#hand');
const toast = document.querySelector('#toast');
let currentHand = [0,1,2,3,4,5,6,7,9,10,10,11,12,15,15,8];
let wallRemaining = 68;
let hasDrawn = false;
let lessonStep = 1;
function renderHand(){hand.innerHTML=''; currentHand.forEach((tileIndex,index)=>{const el=document.createElement('button');el.className='tile';el.textContent=tiles[tileIndex];el.setAttribute('aria-label',`第 ${index+1} 張 ${tiles[tileIndex]}`);el.addEventListener('click',()=>{document.querySelectorAll('.tile').forEach(t=>t.classList.remove('selected'));el.classList.add('selected');if(hasDrawn){discardTile(index);}});hand.appendChild(el);});}
function updateWall(){document.querySelector('#wallCount').textContent=wallRemaining;const button=document.querySelector('#drawButton');button.textContent=wallRemaining===0?'牌牆已空':hasDrawn?'請選牌出牌':'摸牌';button.disabled=wallRemaining===0||hasDrawn;}
function discardTile(index){const discarded=currentHand.splice(index,1)[0];document.querySelector('#discardRiver').insertAdjacentHTML('beforeend',`<span>${tiles[discarded]}</span>`);hasDrawn=false;renderHand();updateWall();showToast(`已打出 ${tiles[discarded]}，輪到電腦思考`);setTimeout(()=>{if(wallRemaining>0)document.querySelector('#drawButton').disabled=false;},650);}
function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2200);}
function setMode(mode){document.querySelectorAll('.mode-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.mode===mode));document.querySelector('#tableView').classList.toggle('hidden',mode!=='table');document.querySelector('#lessonView').classList.toggle('hidden',mode!=='lesson');document.querySelector('#reviewView').classList.toggle('hidden',mode!=='review');}
document.querySelectorAll('.mode-tab').forEach(tab=>tab.addEventListener('click',()=>setMode(tab.dataset.mode)));
document.querySelector('#hintButton').addEventListener('click',()=>{document.querySelector('#coachBody').innerHTML='<div class="coach-tag">教練建議</div><h4>先保留 3、4 萬的兩面搭子</h4><p>打出孤張字牌會保留更多進張。這不是唯一答案，但目前能讓手牌最快靠近聽牌。</p><div class="coach-divider"></div><div class="stat-grid"><div><span>目前向聽</span><strong>2 向聽</strong></div><div><span>有效進張</span><strong>18 張</strong></div></div>';showToast('已顯示本回合提示');});
document.querySelector('#explainButton').addEventListener('click',()=>showToast('兩面搭子可等待兩種牌，通常比孤張更有效率。'));
document.querySelector('#sortButton').addEventListener('click',()=>{if(hasDrawn){showToast('請先出牌，再整理下一巡的手牌');return;}currentHand.sort((a,b)=>a-b);renderHand();showToast('手牌已依花色整理');});
document.querySelector('#drawButton').addEventListener('click',()=>{if(wallRemaining===0){showToast('牌牆已摸完，本局流局');return;}if(hasDrawn)return;currentHand.push(Math.floor(Math.random()*16));wallRemaining-=1;hasDrawn=true;renderHand();updateWall();showToast('摸到一張牌，請點選要打出的牌');});
document.querySelector('#resetButton').addEventListener('click',()=>{currentHand=[0,1,2,3,4,5,6,7,9,10,10,11,12,15,15,8];wallRemaining=68;hasDrawn=false;renderHand();updateWall();setMode('table');showToast('牌局已重新開始');});
const lessonContent=[
  ['先認識一張牌','麻將牌不是一整副要背起來的符號。先分清楚花色，之後看牌效率才不會迷路。',['🀇','🀐','🀑','🀀','🀢']],
  ['胡牌就是五組加一對','順子、刻子或槓子算一組，另外留一對作為眼睛。先找出手牌裡已經成形的部分。',['🀇🀈🀉','🀐🀑🀒','🀀🀀']],
  ['開局不是靠猜','抓位決定座位，擲骰決定從哪一面牌牆開門。第一次可以慢慢數，熟悉後再自動略過。',['抓位','擲骰','開門']],
  ['一巡就是摸一張、打一張','你摸牌時手上會暫時有 17 張；選一張打出後，才回到 16 張，輪到下一家。',['摸牌','選牌','出牌']],
  ['開始用教練打一局','現在回到教練實戰。先打出孤張字牌，觀察教練如何比較不同選擇。',['開始實戰']]
];
function renderLesson(){const item=lessonContent[lessonStep-1];document.querySelector('#lessonStepNumber').textContent=lessonStep;document.querySelector('#lessonTitle').textContent=item[0];document.querySelector('#lessonDescription').textContent=item[1];document.querySelector('#lessonDemo').innerHTML=item[2].map(text=>`<span class="demo-tile ${text.length>2?'wide':''}">${text}</span>`).join('');document.querySelector('#lessonProgressBar').style.width=`${lessonStep*20}%`;document.querySelector('#lessonBack').disabled=lessonStep===1;document.querySelector('#lessonNext').textContent=lessonStep===5?'進入教練實戰':'下一步';document.querySelectorAll('.lesson-node').forEach((node,index)=>node.classList.toggle('active',index===lessonStep-1));}
document.querySelector('#lessonNext').addEventListener('click',()=>{if(lessonStep<5){lessonStep+=1;renderLesson();}else{lessonStep=1;renderLesson();setMode('table');showToast('教練實戰已準備好');}});
document.querySelector('#lessonBack').addEventListener('click',()=>{if(lessonStep>1){lessonStep-=1;renderLesson();}});
renderHand();
updateWall();
renderLesson();
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}
