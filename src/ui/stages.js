(function(root){
'use strict';
// 新手學堂的關卡選單：階段 0 沿用互動開局教學（lessons.js），階段 1–4 是講解卡片與練習題。
let $=null,stage=0,tab='learn',current=null,answered=null,picked=new Set(),mode=null;
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=text;return x;}
function tileButton(t,onclick,cls=''){const b=el('button','quiz-tile '+cls);b.type='button';b.append(Tiles.node(t,'md'));b.title=Tiles.label(t);b.setAttribute('aria-label',Tiles.label(t));b.onclick=onclick;return b;}
function progress(){return Quiz.load();}
function complete(id){const p=progress();const s=p.stages[id]||(p.stages[id]={answered:0,correct:0,done:false});s.done=true;Quiz.save(p);if($)renderNav();}

function renderNav(){
 const nav=$('#stageNav'),p=progress();nav.replaceChildren();
 for(const s of Quiz.STAGES){
  const rec=p.stages[s.id]||{answered:0,correct:0,done:false};
  const b=el('button','stage-tab'+(s.id===stage?' active':'')+(rec.done?' done':''));b.type='button';
  b.append(el('b',null,(rec.done?'✓ ':'')+s.id+' '+s.name),el('small',null,s.id===0?(rec.done?'已完成':'開局流程'):rec.answered?rec.correct+' / '+rec.answered+' 題答對':s.who));
  b.onclick=()=>{stage=s.id;tab='learn';current=null;render();};nav.append(b);
 }
 const g=p.games,stat=el('div','stage-stats');
 stat.append(el('span',null,'實戰 '+g.played+' 局'),el('span',null,'胡牌 '+g.won+'（自摸 '+g.tsumo+'）'),el('span',null,'放槍 '+g.dealIn),el('span',null,'關鍵失誤 '+g.mistakes+' 次'),el('span',null,'累計 '+(g.points>0?'+':'')+g.points));
 nav.append(stat);
}
function render(){
 renderNav();
 const card=$('#stageCard'),lesson=$('.lesson-card');
 card.classList.toggle('hidden',stage===0);lesson.classList.toggle('hidden',stage!==0);
 if(stage===0)return;
 const s=Quiz.STAGES[stage];card.replaceChildren();
 const head=el('div','stage-head');head.append(el('p','eyebrow','階段 '+s.id+'・'+s.who),el('h2',null,s.name+'：'+s.goal));card.append(head);
 const tabs=el('div','stage-tabs');
 for(const [key,name] of [['learn','講解'],['quiz','何切／練習題']]){const b=el('button','secondary-button'+(tab===key?' on':''),name);b.type='button';b.onclick=()=>{tab=key;if(key==='quiz'&&!current)nextQuestion();render();};tabs.append(b);}
 card.append(tabs);
 if(tab==='learn'){
  for(const [title,text,shapes] of s.lessons){
   const box=el('article','stage-lesson');box.append(el('h3',null,title),el('p',null,text));
   if(shapes)shapes.forEach(sh=>{const row=el('div','tile-strip');sh.forEach(t=>row.append(Tiles.node(t,'sm')));box.append(row);});
   card.append(box);
  }
  const go=el('button','primary-button','開始練習題');go.type='button';go.onclick=()=>{tab='quiz';if(!current)nextQuestion();render();};card.append(go);
  return;
 }
 renderQuestion(card);
}
function nextQuestion(){
 const p=progress(),rec=p.stages[stage]||{answered:0};
 current=null;for(let k=0;k<5&&!current;k++)current=Quiz.question(stage,rec.answered+k+Math.floor(Math.random()*50));
 answered=null;picked=new Set();
}
function answer(value){
 if(answered)return;
 answered=Quiz.check(current,value);answered.value=value;
 const p=progress();Quiz.recordAnswer(p,stage,answered.correct);Quiz.save(p);render();
}
function renderQuestion(card){
 const q=current;if(!q){card.append(el('p',null,'題目產生失敗，請再按一次「下一題」。'));}
 else{
  const box=el('section','quiz-box');card.append(box);
  box.append(el('h3',null,q.prompt));
  if(q.game){ // 防守題：顯示對手攤牌與牌河
   const g=q.game,info=el('div','quiz-table');
   [1,2,3].forEach(p=>{const row=el('div','quiz-seat');row.append(el('b',null,['','下家','對家','上家'][p]+(g.melds[p].length?'・攤 '+g.melds[p].length+' 組':'')));
    const m=el('span','tile-strip');g.melds[p].forEach(x=>x.tiles.forEach(t=>m.append(Tiles.node(t,'xs'))));row.append(m);
    const r=el('span','tile-strip river');g.rivers[p].forEach(t=>r.append(Tiles.node(t,'xs')));row.append(el('small',null,'牌河'),r);info.append(row);});
   const mine=el('div','quiz-seat');mine.append(el('b',null,'你的牌河'));const r=el('span','tile-strip river');g.rivers[0].forEach(t=>r.append(Tiles.node(t,'xs')));mine.append(r);info.append(mine);
   box.append(info);
  }
  if(q.melds&&q.melds.length){const m=el('div','tile-strip');m.append(el('small',null,'攤牌'));q.melds.forEach(x=>x.tiles.forEach(t=>m.append(Tiles.node(t,'sm'))));box.append(m);}
  if(q.flowers&&q.flowers.length){const f=el('div','tile-strip');f.append(el('small',null,'花'));q.flowers.forEach(t=>f.append(Tiles.node(t,'sm')));box.append(f);}
  if(q.type==='discard'){
   const hand=el('div','quiz-hand');
   q.hand.forEach(t=>hand.append(tileButton(t,()=>answer(t),answered?(q.answerTiles.includes(t)?'right':t===answered.value?'wrong':''):'')));
   box.append(el('small',null,'點一張牌打出：'),hand);
  }else{
   if(q.hand){const h=el('div','tile-strip');q.hand.forEach(t=>h.append(Tiles.node(t,'sm')));box.append(h);}
   if(q.type==='choice'){
    const opts=el('div','quiz-options');
    q.options.forEach((o,i)=>{const b=el('button','secondary-button'+(answered?(i===q.answer?' right':i===answered.value?' wrong':''):''),o);b.type='button';b.onclick=()=>answer(i);opts.append(b);});box.append(opts);
   }
   if(q.type==='multi'){
    const opts=el('div','quiz-hand');
    q.choices.forEach(t=>opts.append(tileButton(t,()=>{if(answered)return;picked.has(t)?picked.delete(t):picked.add(t);render();},(picked.has(t)?'on ':'')+(answered?(q.answer.includes(t)?'right':picked.has(t)?'wrong':''):''))));
    const send=el('button','primary-button','送出答案');send.type='button';send.disabled=!!answered||!picked.size;send.onclick=()=>answer([...picked]);
    box.append(el('small',null,'可複選：'),opts,send);
   }
  }
  if(answered){
   const fb=el('div','quiz-feedback '+(answered.correct?'good':'bad'));fb.append(el('strong',null,answered.correct?'答對了！':'再想想'),el('p',null,answered.text));
   if(answered.lines&&answered.lines.length){const ul=el('ul','coach-lines');answered.lines.forEach(l=>ul.append(el('li',null,l)));fb.append(ul);}
   box.append(fb);
  }
 }
 const row=el('div','lesson-actions');
 const next=el('button','primary-button',answered?'下一題':'換一題');next.type='button';next.onclick=()=>{nextQuestion();render();};
 const play=el('button','secondary-button','去實戰練習');play.type='button';play.onclick=()=>mode&&mode('table');
 row.append(play,next);card.append(row);
 const rec=progress().stages[stage];if(rec)card.append(el('p','lesson-map','本階段：答對 '+rec.correct+' / '+rec.answered+' 題'+(rec.done?'，已通過（答對 5 題）':'，答對 5 題即通過')));
}
function setup(query,modeFn){$=query;mode=modeFn;render();}
const api={setup,complete,render};
root.Stages=api;
})(globalThis);
