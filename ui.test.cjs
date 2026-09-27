const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const nodes=new Map();class Element{constructor(){this.children=[];this.classList={add(){},remove(){},toggle(){}};this.style={};}replaceChildren(){this.children=[];}append(...x){this.children.push(...x);}setAttribute(){}}
const get=s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s);};
const timers=new Map();let id=0;
const c=vm.createContext({Mahjong:require('./engine.js'),document:{querySelector:get,querySelectorAll:()=>[],createElement:()=>new Element()},navigator:{},setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:i=>timers.delete(i),console});
vm.runInContext(fs.readFileSync('app.js','utf8'),c);
get('#drawButton').onclick();assert.equal(get('#hand').children.length,17);assert.equal(get('#drawButton').disabled,true);
get('#drawButton').onclick();assert.equal(get('#hand').children.length,17);
get('#hand').children[0].onclick();assert.equal(get('#hand').children.length,17);assert.equal(get('#discardButton').disabled,false);
get('#discardButton').onclick();assert.equal(get('#hand').children.length,16);assert.equal(get('#drawButton').disabled,true);
const stale=[...timers.values()][0];get('#resetButton').onclick();const afterReset=get('#wallCount').textContent;stale();assert.equal(get('#wallCount').textContent,afterReset);assert.equal(timers.size,0);
get('#drawButton').onclick();get('#hand').children[0].onclick();get('#discardButton').onclick();
while(timers.size||vm.runInContext('waiting()',c)){if(vm.runInContext('waiting()',c))get('#claimActions').children.at(-1).onclick();else{const [i,f]=timers.entries().next().value;timers.delete(i);f();}}
assert.equal(get('#drawButton').disabled,false);assert.equal(get('#hand').children.length,16);
vm.runInContext("game.hands[0]=[0,1,2,3,4,5,9,10,11,18,19,20,27,27,27,31,31];game.turn=0;game.phase='discard';render();",c);
get('#winButton').onclick();assert.equal(get('#winButton').disabled,true);assert.equal(get('#drawButton').disabled,true);assert.equal(get('#discardButton').disabled,true);
console.log('PASS: real UI handlers, repeat draw, select/confirm, complete AI round, stale timer after reset and ended-game locks.');
