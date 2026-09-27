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
 const count=hand.filter(x=>x===t).length;
 if(t>=27)answer+=count===1?'這張是單張字牌，不能接成順子；打掉它不會拆掉目前的對子或刻子。':count===2?'這張字牌已有一對，打掉會拆對。':'這張字牌已有刻子，打掉會拆組。';
 answer+='有幫助的牌：'+outSummary(candidate)+'。每種牌最多四張，扣除自己手牌與公開可見牌；剛打出的牌仍算已見，不會加回。未見牌可能在對手手上，不是摸中機率。這裡只比較進聽數與張數，沒有計入台數或放槍風險；並列也不代表所有策略價值相同。';return answer;
}
function outSummary(option){return option.outs?option.outs.map(o=>label(o.tile)+'（未見 '+o.remaining+' 張）').join('、')||'無':option.improving.map(label).join('、')||'無';}
function contextualAnswer(question,g,selected=null){
 const q=question.trim();
 if(g.phase==='ended')return '本局已結束，請重新開局再詢問目前牌況。';
 if(g.phase==='claim'){
  if(g.pending.decisions[0])return '你已完成回應，正在等待其他玩家決定。';
  const actions=E.claims(g,0),names={chi:'吃',pon:'碰',kan:'明槓',ron:'胡'};
  const requested=/槓/.test(q)?'kan':/碰/.test(q)?'pon':/吃/.test(q)?'chi':/胡/.test(q)?'ron':null;
  const matches=requested?actions.filter(a=>a.type===requested):actions;
  if(requested&&!matches.length)return '這張'+label(g.pending.tile)+'目前不能'+names[requested]+'。吃只限上家、且手牌須能組順子；碰要有兩張同牌，明槓要有三張同牌且有牌可補，胡須完成牌型。';
  return '目前有人打出'+label(g.pending.tile)+'，先回應，不要摸牌。'+matches.map(a=>names[a.type]+' '+a.tiles.map(label).join('、')+'：'+E.claimAdvice(g,0,a)).join('\n')+'\n略過不會立即摸牌，仍要先處理其他人的回應並確認輪到誰。';
 }
 if(g.turn!==0)return '目前輪到其他玩家，請等輪到你再依新牌況比較。';
 if(g.phase==='draw')return '輪到你摸牌：先按「摸牌」，補花完成後再選牌出牌。現在不能先出牌。';
 if(/槓/.test(q)){
  const actions=E.selfKans(g,0);
  return actions.length?actions.map(a=>(a.type==='concealed'?'暗槓':'加槓')+' '+label(a.tile)+'：槓後從牌尾補牌，再重新比較出牌；補到什麼未知，不能保證進步。').join('\n')+'本練習尚未實作搶槓，不能用此結果判斷真實牌桌的加槓風險。':'目前沒有可暗槓或加槓的牌；不能只因有三張相同牌就暗槓。';
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
const api={compare,answer,contextualAnswer,outSummary,patternHints,patterns,progress,same,label};if(typeof module!=='undefined')module.exports=api;else root.Coach=api;
})(globalThis);
