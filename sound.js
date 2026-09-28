(function(root){
'use strict';
// 音效全部以 Web Audio 即時合成，不需要音檔；喊牌使用瀏覽器內建的中文語音。
const KEY='mahjong-coach-sound';
let enabled=true,ctx=null;
try{enabled=root.localStorage.getItem(KEY)!=='off';}catch(e){}

function audio(){
 if(!enabled)return null;
 const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return null;
 if(!ctx)ctx=new AC();
 if(ctx.state==='suspended')ctx.resume();
 return ctx;
}
let noiseBuffer=null;
function noise(c){
 if(noiseBuffer)return noiseBuffer;
 noiseBuffer=c.createBuffer(1,c.sampleRate*.25,c.sampleRate);
 const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
 return noiseBuffer;
}
// 一次「喀」：高頻的撞擊聲＋低頻的桌面悶響
function clack(c,when,{gain=.5,pitch=2600,thump=170,length=.07}={}){
 const src=c.createBufferSource();src.buffer=noise(c);
 const band=c.createBiquadFilter();band.type='bandpass';band.frequency.value=pitch;band.Q.value=2.2;
 const g=c.createGain();g.gain.setValueAtTime(0,when);g.gain.linearRampToValueAtTime(gain,when+.002);g.gain.exponentialRampToValueAtTime(.001,when+length);
 src.connect(band).connect(g).connect(c.destination);src.start(when);src.stop(when+length+.02);
 if(thump){
  const osc=c.createOscillator(),og=c.createGain();osc.frequency.setValueAtTime(thump,when);osc.frequency.exponentialRampToValueAtTime(thump*.55,when+.09);
  og.gain.setValueAtTime(gain*.7,when);og.gain.exponentialRampToValueAtTime(.001,when+.1);
  osc.connect(og).connect(c.destination);osc.start(when);osc.stop(when+.12);
 }
}
function tone(c,when,freq,dur,gain=.18,type='triangle'){
 const osc=c.createOscillator(),g=c.createGain();osc.type=type;osc.frequency.value=freq;
 g.gain.setValueAtTime(0,when);g.gain.linearRampToValueAtTime(gain,when+.02);g.gain.exponentialRampToValueAtTime(.001,when+dur);
 osc.connect(g).connect(c.destination);osc.start(when);osc.stop(when+dur+.05);
}
const effects={
 select:c=>clack(c,c.currentTime,{gain:.12,pitch:3400,thump:0,length:.03}),
 draw:c=>clack(c,c.currentTime,{gain:.28,pitch:3000,thump:220,length:.05}),
 discard:c=>{const t=c.currentTime;clack(c,t,{gain:.6,pitch:2400,thump:160});clack(c,t+.045,{gain:.18,pitch:2900,thump:0,length:.04});},
 claim:c=>{const t=c.currentTime;clack(c,t,{gain:.5});clack(c,t+.11,{gain:.5,pitch:2200});clack(c,t+.2,{gain:.35,pitch:2700,thump:0});},
 shuffle:c=>{const t=c.currentTime;for(let i=0;i<46;i++)clack(c,t+Math.random()*1.3,{gain:.08+Math.random()*.18,pitch:2000+Math.random()*1800,thump:Math.random()<.3?140:0,length:.04});},
 win:c=>{const t=c.currentTime;[523.25,659.25,783.99,1046.5,1318.5].forEach((f,i)=>tone(c,t+i*.11,f,.7-i*.05));tone(c,t+.55,1567.98,1.1,.12,'sine');},
 lose:c=>{const t=c.currentTime;[392,329.63,261.63].forEach((f,i)=>tone(c,t+i*.16,f,.5,.14));},
 tick:c=>tone(c,c.currentTime,880,.08,.06,'sine')
};
function play(name){try{const c=audio();if(c&&effects[name])effects[name](c);}catch(e){}}
// 喊牌：碰、吃、槓、胡、自摸
function say(text){
 if(!enabled||!root.speechSynthesis||!root.SpeechSynthesisUtterance)return;
 try{
  const u=new root.SpeechSynthesisUtterance(text);u.lang='zh-TW';u.rate=1.05;u.pitch=1;
  const voice=root.speechSynthesis.getVoices().find(v=>/zh[-_]TW|zh[-_]HK|zh/i.test(v.lang));if(voice)u.voice=voice;
  root.speechSynthesis.cancel();root.speechSynthesis.speak(u);
 }catch(e){}
}
function setEnabled(on){enabled=!!on;try{root.localStorage.setItem(KEY,on?'on':'off');}catch(e){}if(!on&&root.speechSynthesis)try{root.speechSynthesis.cancel();}catch(e){}}
const api={play,say,setEnabled,isEnabled:()=>enabled};
if(typeof module!=='undefined')module.exports=api;else root.Sound=api;
})(globalThis);
