'use strict';
// 共用的 DOM 小工具：查元素、建元素、提示訊息、是否播放動畫
const $ = (s) => document.querySelector(s);
function el(tag, cls, text) {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (text != null) x.textContent = text;
  return x;
}
function tileRow(tiles, size = 'xs') {
  const row = el('span', 'tile-row');
  tiles.forEach((t) => row.append(Tiles.node(t, size)));
  return row;
}
// 提示訊息用 CSS 動畫淡出，不另外排計時器
function notify(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
}
function motionOK() {
  try {
    return !globalThis.matchMedia || !matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return true;
  }
}
