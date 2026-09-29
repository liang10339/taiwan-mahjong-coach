const assert=require('node:assert/strict'),E=require('../src/core/engine.js'),Q=require('../src/core/quiz.js');
// 聽牌題：每種牌型都是 16 張、答案與引擎一致
for(let i=0;i<10;i++){const q=Q.waitQuestion(i);assert.equal(q.hand.length,16,q.explain);assert.ok(q.answer.length>=1);for(const t of q.answer)assert.ok(E.winning([...q.hand,t]));assert.ok(q.answer.every(t=>q.choices.includes(t)),'choices include answers');assert.ok(Q.check(q,q.answer).correct);}
assert.deepEqual(Q.waitQuestion(0).answer,[0,3]);assert.deepEqual(Q.waitQuestion(1).answer,[2]);assert.deepEqual(Q.waitQuestion(6).answer,[0,3,6]);
// 算台題：有題、正解可判對、錯解可判錯
for(let i=0;i<5;i++){const q=Q.scoringQuestion(i);assert.ok(q.options[q.answer]);assert.ok(Q.check(q,q.answer).correct);assert.equal(Q.check(q,(q.answer+1)%q.options.length).correct,false);}
// 何切題：答案在並列最佳裡、錯的牌會說明損失
for(let s=1;s<=4;s++){const q=Q.discardQuestion(s);assert.ok(q,'eff '+s);assert.equal(q.hand.length,17);const ok=Q.check(q,q.answerTiles[0]);assert.ok(ok.correct);const wrong=q.hand.find(t=>!q.answerTiles.includes(t));const r=Q.check(q,wrong);assert.equal(r.correct,false);assert.match(r.text,/教練首選/);}
// 防守題：牌數守恆、最安全牌與牌效率首選不同
for(let s=1;s<=3;s++){const q=Q.defenseQuestion(s);assert.ok(q,'def '+s);const g=q.game,all=[...g.wall,...g.hands.flat(),...g.rivers.flat(),...g.melds.flatMap(ms=>ms.flatMap(m=>m.tiles))];for(let t=0;t<34;t++)assert.equal(all.filter(x=>x===t).length,4);assert.ok(Q.check(q,q.answerTiles[0]).correct);}
// 攻守判斷題與關卡出題
for(let i=0;i<6;i++){const q=Q.judgementQuestion(i);assert.ok(Q.check(q,q.answer).correct);}
for(const st of [1,2,3,4])for(let n=0;n<4;n++)assert.ok(Q.question(st,n),'stage '+st+' q'+n);
// 進度紀錄
const mem=new Map(),store={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)};
let p=Q.load(store);for(let i=0;i<5;i++)Q.recordAnswer(p,2,true);Q.recordGame(p,{won:true,tsumo:true,delta:300});Q.save(p,store);
p=Q.load(store);assert.equal(p.stages[2].done,true);assert.equal(p.games.won,1);assert.equal(p.games.points,300);
console.log('PASS: wait-shape, scoring, efficiency 何切, defense 何切, judgement questions and saved progress.');
