const tiles = ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏','🀐','🀑','🀒','🀓','🀔','🀕','🀀'];
const hand = document.querySelector('#hand');
const toast = document.querySelector('#toast');
const drawButton = document.querySelector('#drawButton');
const winButton = document.querySelector('#winButton');
const wallCount = document.querySelector('#wallCount');
const discardRiver = document.querySelector('#discardRiver');
const turnStatus = document.querySelector('#turnStatus');
const phaseHelp = document.querySelector('#phaseHelp');

let currentHand = [0,1,2,3,4,5,6,7,9,10,10,11,12,15,15,8];
let aiHands = [[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[0,0,1,2,3,4,5,6,7,9,10,11,12,14,15,15],[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15]];
let wallRemaining = 68;
let hasDrawn = false;
let phase = 'player';
let lessonStep = 1;

function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2200);}
function isPlayerTurn(){return phase==='player';}
function updateStatus(){wallCount.textContent=wallRemaining;const canDraw=isPlayerTurn()&&!hasDrawn&&wallRemaining>0;drawButton.textContent=wallRemaining===0?'牌牆已空':hasDrawn?'先出牌':phase==='ai'?'電腦出牌中…':'摸牌';drawButton.disabled=!canDraw;winButton.disabled=!hasDrawn||!isWinningHand(currentHand);turnStatus.textContent=phase==='ai'?'電腦正在依序摸牌、出牌':phase==='ended'?'本局結束':hasDrawn?'輪到你出牌':'輪到你摸牌';phaseHelp.textContent=phase==='ai'?'請稍候，三位電腦會各完成一個摸打回合。':phase==='ended'?'牌局已結束，按右上角重新開始。':hasDrawn?'你現在有 17 張牌，請點一張牌打出；此時不能再次摸牌。':'先摸一張牌；摸牌後請從 17 張牌中選一張打出。';}
function updateCoach(title,copy,tag='本回合教練'){document.querySelector('#coachBody').innerHTML=`<div class="coach-tag">${tag}</div><h4>${title}</h4><p>${copy}</p><div class="coach-divider"></div><div class="stat-grid"><div><span>目前向聽</span><strong>${hasDrawn?'1':'2'} 向聽</strong></div><div><span>有效進張</span><strong>${hasDrawn?'12':'18'} 張</strong></div></div>`;}
function renderHand(){hand.innerHTML='';currentHand.forEach((tileIndex,index)=>{const el=document.createElement('button');el.className='tile';el.textContent=tiles[tileIndex];el.setAttribute('aria-label',`第 ${index+1} 張 ${tiles[tileIndex]}`);el.disabled=phase!=='player'||!hasDrawn;el.addEventListener('click',()=>{if(phase==='player'&&hasDrawn)discardTile(index);});hand.appendChild(el);});}
function addDiscard(tileIndex,who='電腦'){const item=document.createElement('span');item.textContent=tiles[tileIndex];item.title=who;discardRiver.appendChild(item);}
function drawPlayer(){if(!isPlayerTurn()||hasDrawn||wallRemaining===0)return;currentHand.push(Math.floor(Math.random()*16));wallRemaining-=1;hasDrawn=true;renderHand();updateStatus();updateCoach('摸牌完成，現在請選一張牌打出','你現在有 17 張牌。先找孤張或重複價值較低的牌；點牌後會立即打出，不能連續摸牌。','出牌階段');showToast('摸牌完成，請點一張牌出牌');}
function discardTile(index){if(!isPlayerTurn()||!hasDrawn)return;const discarded=currentHand.splice(index,1)[0];addDiscard(discarded,'你');hasDrawn=false;phase='ai';renderHand();updateStatus();updateCoach('電腦正在回合中','先觀察牌河，不要急著替電腦做決定。三家完成摸打後會輪回你。','等待電腦');showToast(`已打出 ${tiles[discarded]}，等待三位電腦出牌`);runComputerTurn(0);}
function runComputerTurn(aiIndex){if(wallRemaining===0){phase='ended';renderHand();updateStatus();showToast('牌牆摸完，本局流局');return;}if(aiIndex>=3){phase='player';renderHand();updateStatus();updateCoach('輪到你摸牌','先摸牌，再從 17 張牌中選一張打出。教練會在摸牌後重新分析。','你的回合');showToast('輪到你摸牌');return;}window.setTimeout(()=>{wallRemaining-=1;const ai=aiHands[aiIndex];ai.push(Math.floor(Math.random()*16));const discardIndex=Math.floor(Math.random()*ai.length);const discarded=ai.splice(discardIndex,1)[0];addDiscard(discarded,`電腦 ${aiIndex+1}`);updateStatus();runComputerTurn(aiIndex+1);},520);}
function resetGame(){currentHand=[0,1,2,3,4,5,6,7,9,10,10,11,12,15,15,8];aiHands=[[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],[0,0,1,2,3,4,5,6,7,9,10,11,12,14,15,15],[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15]];wallRemaining=68;hasDrawn=false;phase='player';discardRiver.innerHTML='<span>🀙</span><span>🀐</span><span>🀀</span><span>🀒</span><span>🀇</span><span>🀅</span>';renderHand();updateStatus();updateCoach('先想想：你想保留哪一組搭子？','先觀察手牌中的兩面搭子。兩面搭子可以等到兩張牌，通常比孤張更有延伸空間。','這一手先想想');setMode('table');showToast('牌局已重新開始');}

function tileSuit(tile){return tile<9?'number-a':tile<15?'number-b':'honor';}
function isWinningHand(input){if(input.length!==17)return false;const counts=Array(16).fill(0);input.forEach(tile=>counts[tile]++);for(let pair=0;pair<16;pair++){if(counts[pair]<2)continue;counts[pair]-=2;if(canMakeGroups(counts,5)){counts[pair]+=2;return true;}counts[pair]+=2;}return false;}
function canMakeGroups(counts,groupsLeft){if(groupsLeft===0)return counts.every(count=>count===0);const first=counts.findIndex(count=>count>0);if(first<0)return false;if(counts[first]>=3){counts[first]-=3;if(canMakeGroups(counts,groupsLeft-1)){counts[first]+=3;return true;}counts[first]+=3;}if(tileSuit(first)!=='honor'&&first+2<15&&tileSuit(first+1)===tileSuit(first)&&tileSuit(first+2)===tileSuit(first)&&counts[first+1]>0&&counts[first+2]>0){counts[first]--;counts[first+1]--;counts[first+2]--;if(canMakeGroups(counts,groupsLeft-1)){counts[first]++;counts[first+1]++;counts[first+2]++;return true;}counts[first]++;counts[first+1]++;counts[first+2]++;}return false;}

function setMode(mode){document.querySelectorAll('.mode-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.mode===mode));document.querySelector('#tableView').classList.toggle('hidden',mode!=='table');document.querySelector('#lessonView').classList.toggle('hidden',mode!=='lesson');document.querySelector('#reviewView').classList.toggle('hidden',mode!=='review');}
document.querySelectorAll('.mode-tab').forEach(tab=>tab.addEventListener('click',()=>setMode(tab.dataset.mode)));
document.querySelector('#hintButton').addEventListener('click',()=>{document.querySelector('#coachBody').innerHTML='<div class="coach-tag">教練建議</div><h4>先保留 3、4 萬的兩面搭子</h4><p>打出孤張字牌會保留更多進張。這不是唯一答案，但目前能讓手牌最快靠近聽牌。</p><div class="coach-divider"></div><div class="stat-grid"><div><span>目前向聽</span><strong>2 向聽</strong></div><div><span>有效進張</span><strong>18 張</strong></div></div>';showToast('已顯示本回合提示');});
document.querySelector('#explainButton').addEventListener('click',()=>showToast('兩面搭子可等待兩種牌，通常比孤張更有效率。'));
document.querySelector('#sortButton').addEventListener('click',()=>{if(hasDrawn){showToast('請先出牌，再整理下一巡的手牌');return;}if(!isPlayerTurn()){showToast('請等待電腦完成出牌');return;}currentHand.sort((a,b)=>a-b);renderHand();showToast('手牌已依花色整理');});
drawButton.addEventListener('click',drawPlayer);
winButton.addEventListener('click',()=>{if(isWinningHand(currentHand)){phase='ended';renderHand();updateStatus();showToast('恭喜胡牌！這一局完成。');}});
document.querySelector('#resetButton').addEventListener('click',resetGame);

const lessonContent=[['先認識一張牌','麻將牌不是一整副要背起來的符號。先分清楚花色，之後看牌效率才不會迷路。',['🀇','🀐','🀑','🀀','🀢']],['胡牌就是五組加一對','順子、刻子或槓子算一組，另外留一對作為眼睛。先找出手牌裡已經成形的部分。',['🀇🀈🀉','🀐🀑🀒','🀀🀀']],['開局不是靠猜','抓位決定座位，擲骰決定從哪一面牌牆開門。第一次可以慢慢數，熟悉後再自動略過。',['抓位','擲骰','開門']],['一巡就是摸一張、打一張','你摸牌時手上會暫時有 17 張；選一張打出後，才回到 16 張，輪到下一家。',['摸牌','選牌','出牌']],['開始用教練打一局','現在回到教練實戰。先打出孤張字牌，觀察教練如何比較不同選擇。',['開始實戰']]];
function renderLesson(){const item=lessonContent[lessonStep-1];document.querySelector('#lessonStepNumber').textContent=lessonStep;document.querySelector('#lessonTitle').textContent=item[0];document.querySelector('#lessonDescription').textContent=item[1];document.querySelector('#lessonDemo').innerHTML=item[2].map(text=>`<span class="demo-tile ${text.length>2?'wide':''}">${text}</span>`).join('');document.querySelector('#lessonProgressBar').style.width=`${lessonStep*20}%`;document.querySelector('#lessonBack').disabled=lessonStep===1;document.querySelector('#lessonNext').textContent=lessonStep===5?'進入教練實戰':'下一步';document.querySelectorAll('.lesson-node').forEach((node,index)=>node.classList.toggle('active',index===lessonStep-1));}
document.querySelector('#lessonNext').addEventListener('click',()=>{if(lessonStep<5){lessonStep+=1;renderLesson();}else{lessonStep=1;renderLesson();setMode('table');showToast('教練實戰已準備好');}});
document.querySelector('#lessonBack').addEventListener('click',()=>{if(lessonStep>1){lessonStep-=1;renderLesson();}});
renderHand();updateStatus();renderLesson();
if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}
