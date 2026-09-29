(function(root){
'use strict';
// 以 SVG 繪製接近實體台灣麻將的牌面：象牙白牌面、綠色牌背。
// 牌型編號同 engine.js：0–8 萬、9–17 筒、18–26 索、27–33 東南西北中發白、34–41 春夏秋冬梅蘭竹菊。
const INK='#1d2b4f', RED='#b8232f', GREEN='#1b7a47', BLUE='#1f4f96';
const SERIF="'Noto Serif TC','Songti TC','STSong','PMingLiU','MingLiU',serif";
const NUMERALS=['一','二','三','四','五','六','七','八','九'];
const LABELS=[...['萬','筒','索'].flatMap(s=>Array.from({length:9},(_,i)=>`${i+1}${s}`)),'東','南','西','北','紅中','青發','白板','春','夏','秋','冬','梅','蘭','竹','菊'];

const text=(x,y,size,color,s,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-family="${SERIF}" font-weight="900" text-anchor="middle" dominant-baseline="central"${extra}>${s}</text>`;

function pip(x,y,r,color){
 return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fffdf4" stroke="${color}" stroke-width="${r*.28}"/>`+
  `<circle cx="${x}" cy="${y}" r="${r*.52}" fill="none" stroke="${color}" stroke-width="${r*.14}" stroke-dasharray="${r*.35} ${r*.18}"/>`+
  `<circle cx="${x}" cy="${y}" r="${r*.22}" fill="${color}"/>`;
}
const DOTS={
 2:[[30,22,12,GREEN],[30,58,12,BLUE]],
 3:[[16,17,9.5,BLUE],[30,40,9.5,RED],[44,63,9.5,GREEN]],
 4:[[18,23,10.5,BLUE],[42,23,10.5,GREEN],[18,57,10.5,GREEN],[42,57,10.5,BLUE]],
 5:[[17,19,9.5,BLUE],[43,19,9.5,GREEN],[30,40,9.5,RED],[17,61,9.5,GREEN],[43,61,9.5,BLUE]],
 6:[[19,15,8.5,GREEN],[41,15,8.5,GREEN],[19,43,8.5,RED],[41,43,8.5,RED],[19,65,8.5,RED],[41,65,8.5,RED]],
 7:[[14,11,7,GREEN],[30,20,7,GREEN],[46,29,7,GREEN],[19,48,8,RED],[41,48,8,RED],[19,67,8,RED],[41,67,8,RED]],
 8:[19,41].flatMap(x=>[12.5,31,49,67.5].map(y=>[x,y,8,BLUE])),
 9:[[16,BLUE],[40,RED],[64,GREEN]].flatMap(([y,c])=>[14,30,46].map(x=>[x,y,7.6,c]))
};
function oneDot(){
 let s=`<circle cx="30" cy="40" r="23" fill="#fffdf4" stroke="${GREEN}" stroke-width="3"/>`;
 for(let i=0;i<12;i++){const a=i*Math.PI/6;s+=`<circle cx="${(30+17.5*Math.cos(a)).toFixed(1)}" cy="${(40+17.5*Math.sin(a)).toFixed(1)}" r="2.6" fill="${i%2?BLUE:GREEN}"/>`;}
 return s+`<circle cx="30" cy="40" r="11.5" fill="${RED}"/><circle cx="30" cy="40" r="7.5" fill="#fffdf4"/><circle cx="30" cy="40" r="3.8" fill="${BLUE}"/>`;
}

function stick(x,y,h,color,angle=0){
 // 竹節造型：細竹身＋上、中、下三個鼓起的竹節
 const top=y-h/2,bottom=y+h/2,knot=(cy)=>`<ellipse cx="${x}" cy="${cy}" rx="3.3" ry="1.7" fill="${color}"/>`;
 return `<g transform="rotate(${angle} ${x} ${y})"><rect x="${x-2.1}" y="${top+1}" width="4.2" height="${h-2}" rx="2" fill="${color}"/>`+
  knot(top+1.6)+knot(y)+knot(bottom-1.6)+
  `<line x1="${x}" y1="${top+3.5}" x2="${x}" y2="${y-2.5}" stroke="#fffdf4" stroke-width=".9" opacity=".8"/>`+
  `<line x1="${x}" y1="${y+2.5}" x2="${x}" y2="${bottom-3.5}" stroke="#fffdf4" stroke-width=".9" opacity=".8"/></g>`;
}
// 八條依參考牌面：上排 M、下排 W；每排四支竹身，端點相接，中間留白。
function eightBamboo(){
 const paths=[[[10,31],[10,12],[30,28],[50,12],[50,31]],[[10,49],[10,68],[30,52],[50,68],[50,49]]];
 return paths.map((points,row)=>'<g data-eight-row="'+row+'">'+points.slice(1).map(([x2,y2],i)=>{const [x1,y1]=points[i],h=Math.hypot(x2-x1,y2-y1),angle=Math.atan2(-(x2-x1),y2-y1)*180/Math.PI;return stick((x1+x2)/2,(y1+y2)/2,h,row===0?INK:GREEN,angle);}).join('')+'</g>').join('');
}
const STICKS={
 2:[[30,22,26,GREEN],[30,58,26,BLUE]],
 3:[[30,22,26,BLUE],[19,58,26,GREEN],[41,58,26,GREEN]],
 4:[[19,22,26,GREEN],[41,22,26,BLUE],[19,58,26,BLUE],[41,58,26,GREEN]],
 5:[[16,22,26,GREEN],[44,22,26,BLUE],[30,40,26,RED],[16,58,26,BLUE],[44,58,26,GREEN]],
 6:[15,30,45].flatMap(x=>[[x,22,26,GREEN],[x,58,26,BLUE]]),
 7:[[30,14,18,RED],...[15,30,45].flatMap(x=>[[x,41,20,GREEN],[x,66,20,GREEN]])],
 9:[16,40,64].flatMap(y=>[[15,y,20,GREEN],[30,y,20,RED],[45,y,20,BLUE]])
};
function bird(){
 // 一索：傳統上畫成一隻鳥
 return `<path d="M14 58 Q8 70 18 72 Q14 64 22 60Z" fill="${BLUE}"/>`+
  `<path d="M18 60 Q10 50 16 40 Q20 50 26 54Z" fill="${GREEN}"/>`+
  `<ellipse cx="32" cy="50" rx="13" ry="10" fill="${GREEN}"/>`+
  `<path d="M26 46 Q34 36 44 44 Q36 46 30 54Z" fill="${BLUE}"/>`+
  `<path d="M24 50 Q30 58 40 56" fill="none" stroke="#fffdf4" stroke-width="1.4"/>`+
  `<path d="M40 44 Q42 28 38 20" fill="none" stroke="${GREEN}" stroke-width="5" stroke-linecap="round"/>`+
  `<circle cx="38" cy="18" r="6.5" fill="${RED}"/><circle cx="39.5" cy="16.5" r="1.6" fill="#fffdf4"/>`+
  `<path d="M44 17 L52 19 L44 21Z" fill="#c98b1c"/>`+
  `<path d="M30 60 L27 70 M34 60 L35 70" stroke="${RED}" stroke-width="2" stroke-linecap="round"/>`;
}

const FLOWER_COLORS=[GREEN,RED,BLUE,INK,RED,BLUE,GREEN,RED];
function face(t){
 if(t<9)return text(30,24,28,INK,NUMERALS[t])+text(30,58,30,RED,'萬');
 if(t<18){const n=t-9+1;return n===1?oneDot():DOTS[n].map(d=>pip(...d)).join('');}
 if(t<27){const n=t-18+1;return n===1?bird():n===8?eightBamboo():STICKS[n].map(s=>stick(...s)).join('');}
 if(t<31)return text(30,41,40,INK,'東南西北'[t-27]);
 if(t===31)return text(30,41,42,RED,'中');
 if(t===32)return text(30,41,42,GREEN,'發');
 if(t===33)return `<rect x="12" y="13" width="36" height="54" rx="3" fill="none" stroke="${BLUE}" stroke-width="3.2"/><rect x="17" y="18" width="26" height="44" rx="2" fill="none" stroke="${BLUE}" stroke-width="1.2"/>`;
 const f=t-34,color=FLOWER_COLORS[f];
 return text(12,11,12,RED,String(f%4+1))+
  `<path d="M14 58 Q30 50 46 58" fill="none" stroke="${color}" stroke-width="1.2" opacity=".6"/>`+
  text(30,37,26,color,'春夏秋冬梅蘭竹菊'[f])+text(30,66,10,INK,f<4?'季':'花');
}
function svg(t){return `<svg viewBox="0 0 60 80" aria-hidden="true" focusable="false">${face(t)}</svg>`;}
function label(t){return LABELS[t];}
// 建立一張牌的元素；size：'lg'（手牌）、'md'、'sm'（牌河、攤牌）、'xs'（教練列表）
function node(t,size='sm',tag='span'){
 const el=document.createElement(tag);
 el.className='mj mj-'+size+(t>=34?' mj-flower':'');
 el.innerHTML=svg(t);
 if(el.setAttribute){el.setAttribute('role','img');el.setAttribute('aria-label',label(t));}
 el.title=label(t);
 return el;
}
function back(size='sm'){const el=document.createElement('span');el.className='mj mj-back mj-'+size;return el;}
const api={svg,node,back,label,face};
if(typeof module!=='undefined')module.exports=api;else root.Tiles=api;
})(globalThis);
