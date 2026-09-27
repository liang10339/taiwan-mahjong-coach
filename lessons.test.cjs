const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const nodes=new Map();class Node{constructor(){this.children=[];this.style={};}replaceChildren(){this.children=[];}append(x){this.children.push(x);}}
const $=s=>{if(!nodes.has(s))nodes.set(s,new Node());return nodes.get(s);};let mode='';
const math=Object.create(Math);math.random=()=>.3;
const c=vm.createContext({document:{createElement:()=>new Node()},Math:math,$,mode:n=>mode=n});
vm.runInContext(fs.readFileSync('lessons.js','utf8')+'\nsetupLessons($,mode);',c);
const next=()=>$('#lessonNext').onclick(),click=t=>{const b=$('#lessonDemo').children.find(x=>x.textContent===t);assert.ok(b,t);b.onclick();};
next();assert.equal($('#lessonNext').disabled,true);click('第 1 張蓋牌');assert.equal($('#lessonNext').disabled,false);
next();click('擲三顆骰子');click('東家牌牆');assert.equal($('#lessonNext').disabled,true);click('南家牌牆');assert.equal($('#lessonNext').disabled,false);
next();const wall=$('#lessonDemo').children.find(x=>x.className==='lesson-wall');wall.children.find(x=>x.textContent==='6墩').onclick();assert.equal($('#lessonNext').disabled,true);wall.children.find(x=>x.textContent==='7墩').onclick();assert.equal($('#lessonNext').disabled,false);
next();for(let i=0;i<4;i++)click('四家依序各拿四張');assert.equal($('#lessonNext').disabled,true);click('莊家拿門牌');assert.equal($('#lessonNext').disabled,false);
next();next();click('可以吃');assert.equal($('#lessonNext').disabled,true);click('不能吃，只有上家可以');next();assert.match($('#lessonTitle').textContent,/一進聽/);next();assert.equal(mode,'table');
console.log('PASS: seat draw, dice/wall choice, incorrect-answer gating, stack boundary, dealing and claim lesson.');
