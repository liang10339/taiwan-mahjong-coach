const tiles = ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏','🀐','🀑','🀒','🀓','🀔','🀕','🀀'];
const hand = document.querySelector('#hand');
const toast = document.querySelector('#toast');
let currentHand = [0,1,2,3,4,5,6,7,9,10,10,11,12,15,15,8];
function renderHand(){hand.innerHTML=''; currentHand.forEach((tileIndex,index)=>{const el=document.createElement('button');el.className='tile';el.textContent=tiles[tileIndex];el.setAttribute('aria-label',`第 ${index+1} 張 ${tiles[tileIndex]}`);el.addEventListener('click',()=>{document.querySelectorAll('.tile').forEach(t=>t.classList.remove('selected'));el.classList.add('selected');showToast('已選擇這張牌，可以查看教練建議');});hand.appendChild(el);});}
function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2200);}
function setMode(mode){document.querySelectorAll('.mode-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.mode===mode));document.querySelector('#tableView').classList.toggle('hidden',mode!=='table');document.querySelector('#lessonView').classList.toggle('hidden',mode!=='lesson');document.querySelector('#reviewView').classList.toggle('hidden',mode!=='review');}
document.querySelectorAll('.mode-tab').forEach(tab=>tab.addEventListener('click',()=>setMode(tab.dataset.mode)));
document.querySelector('#hintButton').addEventListener('click',()=>{document.querySelector('#coachBody').innerHTML='<div class="coach-tag">教練建議</div><h4>先保留 3、4 萬的兩面搭子</h4><p>打出孤張字牌會保留更多進張。這不是唯一答案，但目前能讓手牌最快靠近聽牌。</p><div class="coach-divider"></div><div class="stat-grid"><div><span>目前向聽</span><strong>2 向聽</strong></div><div><span>有效進張</span><strong>18 張</strong></div></div>';showToast('已顯示本回合提示');});
document.querySelector('#explainButton').addEventListener('click',()=>showToast('兩面搭子可等待兩種牌，通常比孤張更有效率。'));
document.querySelector('#sortButton').addEventListener('click',()=>{currentHand.sort((a,b)=>a-b);renderHand();showToast('手牌已依花色整理');});
document.querySelector('#drawButton').addEventListener('click',()=>{currentHand.push(Math.floor(Math.random()*16));if(currentHand.length>16)currentHand.shift();renderHand();showToast('摸到一張牌，請選擇要打出的牌');});
document.querySelector('#resetButton').addEventListener('click',()=>{currentHand=[0,1,2,3,4,5,6,7,9,10,10,11,12,15,15,8];renderHand();setMode('table');showToast('牌局已重新開始');});
renderHand();
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}
