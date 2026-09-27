'use strict';

// ---------------------------------------------------------------------------
// 牌型定義：0–8 萬、9–17 筒、18–26 條、27–33 字牌（東南西北中發白）、34–41 花牌
// ---------------------------------------------------------------------------
const TILE_TYPES = 34;
const FLOWER_START = 34;
const FLOWER_END = 42;
const TEXT_STYLE = '︎'; // 讓 🀄 以文字字形顯示，避免變成彩色 emoji 與其他牌不一致
const NUMERALS = ['一','二','三','四','五','六','七','八','九'];
const HONOR_NAMES = ['東','南','西','北','紅中','青發','白板'];
const FLOWER_NAMES = ['春','夏','秋','冬','梅','蘭','竹','菊'];
const SEAT_WINDS = ['東','南','西','北'];

function tileGlyph(tile){
  let code;
  if(tile < 9) code = 0x1F007 + tile;                       // 萬
  else if(tile < 18) code = 0x1F019 + (tile - 9);           // 筒
  else if(tile < 27) code = 0x1F010 + (tile - 18);          // 條
  else if(tile < 34) code = [0x1F000,0x1F001,0x1F002,0x1F003,0x1F004,0x1F005,0x1F006][tile - 27];
  else code = [0x1F026,0x1F027,0x1F028,0x1F029,0x1F022,0x1F023,0x1F024,0x1F025][tile - FLOWER_START];
  return String.fromCodePoint(code) + TEXT_STYLE;
}
function tileName(tile){
  if(tile < 9) return `${NUMERALS[tile]}萬`;
  if(tile < 18) return `${NUMERALS[tile - 9]}筒`;
  if(tile < 27) return `${NUMERALS[tile - 18]}條`;
  if(tile < 34) return HONOR_NAMES[tile - 27];
  return `花牌・${FLOWER_NAMES[tile - FLOWER_START]}`;
}
function isFlower(tile){ return tile >= FLOWER_START; }
function isHonor(tile){ return tile >= 27 && tile < TILE_TYPES; }

// ---------------------------------------------------------------------------
// 規則核心：胡牌判定、向聽數、有效進張（台灣 16 張：五組加一對）
// ---------------------------------------------------------------------------
const MELDS_NEEDED = 5;

function toCounts(tiles){
  const counts = Array(TILE_TYPES).fill(0);
  tiles.forEach(tile => { counts[tile] += 1; });
  return counts;
}

function canMakeGroups(counts, groupsLeft){
  const first = counts.findIndex(count => count > 0);
  if(first < 0) return groupsLeft === 0;
  if(groupsLeft === 0) return false;
  if(counts[first] >= 3){
    counts[first] -= 3;
    const ok = canMakeGroups(counts, groupsLeft - 1);
    counts[first] += 3;
    if(ok) return true;
  }
  const position = first % 9;
  if(!isHonor(first) && position <= 6 && counts[first + 1] > 0 && counts[first + 2] > 0){
    counts[first] -= 1; counts[first + 1] -= 1; counts[first + 2] -= 1;
    const ok = canMakeGroups(counts, groupsLeft - 1);
    counts[first] += 1; counts[first + 1] += 1; counts[first + 2] += 1;
    if(ok) return true;
  }
  return false;
}

function isWinningHand(tiles){
  if(tiles.length !== MELDS_NEEDED * 3 + 2 || tiles.some(isFlower)) return false;
  const counts = toCounts(tiles);
  for(let pair = 0; pair < TILE_TYPES; pair++){
    if(counts[pair] < 2) continue;
    counts[pair] -= 2;
    const ok = canMakeGroups(counts, MELDS_NEEDED);
    counts[pair] += 2;
    if(ok) return true;
  }
  return false;
}

// 將單一花色拆成（面子數, 搭子數）的所有可能組合，結果依花色內容快取
const suitCache = new Map();
function suitPatterns(slice, honor){
  const key = (honor ? 'h' : 's') + slice.join('');
  if(suitCache.has(key)) return suitCache.get(key);
  const found = new Set();
  const counts = slice.slice();
  (function search(start, melds, partials){
    let i = start;
    while(i < counts.length && counts[i] === 0) i++;
    if(i >= counts.length){ found.add(melds * 10 + partials); return; }
    if(counts[i] >= 3){ counts[i] -= 3; search(i, melds + 1, partials); counts[i] += 3; }
    if(!honor && i + 2 < counts.length && counts[i + 1] && counts[i + 2]){
      counts[i]--; counts[i + 1]--; counts[i + 2]--; search(i, melds + 1, partials); counts[i]++; counts[i + 1]++; counts[i + 2]++;
    }
    if(counts[i] >= 2){ counts[i] -= 2; search(i, melds, partials + 1); counts[i] += 2; }
    if(!honor && i + 1 < counts.length && counts[i + 1]){
      counts[i]--; counts[i + 1]--; search(i, melds, partials + 1); counts[i]++; counts[i + 1]++;
    }
    if(!honor && i + 2 < counts.length && counts[i + 2]){
      counts[i]--; counts[i + 2]--; search(i, melds, partials + 1); counts[i]++; counts[i + 2]++;
    }
    counts[i]--; search(i, melds, partials); counts[i]++; // 視為孤張
  })(0, 0, 0);
  const patterns = [...found].map(value => [Math.floor(value / 10), value % 10]);
  suitCache.set(key, patterns);
  return patterns;
}

function shantenWithoutPair(counts){
  const groups = [
    suitPatterns(counts.slice(0, 9), false),
    suitPatterns(counts.slice(9, 18), false),
    suitPatterns(counts.slice(18, 27), false),
    suitPatterns(counts.slice(27, 34), true)
  ];
  let best = Infinity;
  for(const [m1, t1] of groups[0]) for(const [m2, t2] of groups[1]) for(const [m3, t3] of groups[2]) for(const [m4, t4] of groups[3]){
    const melds = Math.min(m1 + m2 + m3 + m4, MELDS_NEEDED);
    const partials = Math.min(t1 + t2 + t3 + t4, MELDS_NEEDED - melds);
    best = Math.min(best, 2 * (MELDS_NEEDED - melds) - partials);
  }
  return best;
}

// 向聽數：-1 = 已胡牌、0 = 聽牌、n = 還差 n 張有效牌才聽牌
function shanten(tiles){
  const counts = toCounts(tiles.filter(tile => !isFlower(tile)));
  let best = shantenWithoutPair(counts);
  for(let pair = 0; pair < TILE_TYPES; pair++){
    if(counts[pair] < 2) continue;
    counts[pair] -= 2;
    best = Math.min(best, shantenWithoutPair(counts) - 1);
    counts[pair] += 2;
  }
  return best;
}

// 有效進張：能讓向聽數下降的牌，以及扣除「看得到的牌」後剩下的張數
function effectiveTiles(tiles, visibleCounts){
  const base = shanten(tiles);
  const handCounts = toCounts(tiles);
  const result = [];
  for(let tile = 0; tile < TILE_TYPES; tile++){
    const left = 4 - handCounts[tile] - (visibleCounts ? visibleCounts[tile] : 0);
    if(left <= 0) continue;
    if(shanten([...tiles, tile]) < base) result.push({ tile, left });
  }
  return { shanten: base, tiles: result, total: result.reduce((sum, item) => sum + item.left, 0) };
}

// 比較每一種可打出的牌：先看向聽數，再看有效進張
function rankDiscards(tiles, visibleCounts){
  const seen = new Set();
  const options = [];
  tiles.forEach(tile => {
    if(seen.has(tile)) return;
    seen.add(tile);
    const rest = tiles.slice();
    rest.splice(rest.indexOf(tile), 1);
    const info = effectiveTiles(rest, visibleCounts);
    options.push({ tile, shanten: info.shanten, total: info.total, waits: info.tiles });
  });
  options.sort((a, b) => a.shanten - b.shanten || b.total - a.total || isHonor(b.tile) - isHonor(a.tile));
  return options;
}

function sortTiles(tiles){ return tiles.sort((a, b) => a - b); }

if(typeof module !== 'undefined' && module.exports){
  module.exports = { tileGlyph, tileName, isWinningHand, shanten, effectiveTiles, rankDiscards };
}

// ---------------------------------------------------------------------------
// 牌局狀態
// ---------------------------------------------------------------------------
const PLAYER = 0;
const SEAT_NAMES = ['你','周美玲','林小安','陳大文']; // 依輪序：你(東) → 下家(南) → 對家(西) → 上家(北)
const DEAL_SIZE = 16;
const DEAD_WALL = 16; // 台灣常見留牌 8 墩（16 張），摸到只剩留牌即流局
const AI_DELAY = 520;

let game;
let lessonStep = 1;
let lessonReached = 1;

function shuffle(list){
  for(let i = list.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function buildWall(){
  const wall = [];
  for(let tile = 0; tile < TILE_TYPES; tile++) for(let copy = 0; copy < 4; copy++) wall.push(tile);
  for(let flower = FLOWER_START; flower < FLOWER_END; flower++) wall.push(flower);
  return shuffle(wall); // 共 144 張
}

function liveWallCount(){ return Math.max(0, game.wall.length - DEAD_WALL); }

// 花牌立即亮出，並從牌尾補牌
function replaceFlowers(seat){
  const hand = game.hands[seat];
  let index;
  while((index = hand.findIndex(isFlower)) >= 0){
    game.flowers[seat].push(hand.splice(index, 1)[0]);
    hand.push(game.wall.pop());
  }
}

function drawTile(seat){
  if(liveWallCount() === 0) return null;
  const hand = game.hands[seat];
  hand.push(game.wall.shift());
  replaceFlowers(seat);
  return hand[hand.length - 1];
}

function newGame(){
  game = {
    id: (game ? game.id : 0) + 1,
    wall: buildWall(),
    hands: [[], [], [], []],
    flowers: [[], [], [], []],
    discards: [],
    phase: 'player',     // player | ai | ron-offer | ended
    hasDrawn: false,
    pendingDiscard: null,
    lastDrawn: null,
    log: [],
    result: null
  };
  for(let round = 0; round < DEAL_SIZE; round++) for(let seat = 0; seat < 4; seat++) game.hands[seat].push(game.wall.shift());
  for(let seat = 0; seat < 4; seat++) replaceFlowers(seat);
  // 你是東家（莊家），開門多拿一張，第一手直接出牌
  game.lastDrawn = drawTile(PLAYER);
  sortTiles(game.hands[PLAYER]);
  game.hasDrawn = true;
}

function visibleCounts(){
  const counts = Array(TILE_TYPES).fill(0);
  game.discards.forEach(item => { counts[item.tile] += 1; });
  return counts;
}

// ---------------------------------------------------------------------------
// 畫面
// ---------------------------------------------------------------------------
const $ = selector => document.querySelector(selector);
let hand, toast, drawButton, winButton, wallCount, discardRiver;

function showToast(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function canPlayerWin(){
  if(game.phase === 'player' && game.hasDrawn) return isWinningHand(game.hands[PLAYER]);
  if(game.phase === 'ron-offer') return true;
  return false;
}

function updateStatus(){
  wallCount.textContent = liveWallCount();
  const labels = { player: game.hasDrawn ? '請選牌出牌' : '摸牌', ai: '電腦出牌中…', 'ron-offer': '過（不胡）', ended: '本局結束' };
  drawButton.textContent = labels[game.phase];
  drawButton.disabled = !(game.phase === 'ron-offer' || (game.phase === 'player' && !game.hasDrawn && liveWallCount() > 0));
  winButton.disabled = !canPlayerWin();
  winButton.textContent = game.phase === 'ron-offer' ? `胡 ${tileName(game.pendingDiscard.tile)}` : '胡牌';
  $('#playerStatus').textContent = {
    player: game.hasDrawn ? '東家・莊・請出牌' : '東家・莊・輪到你',
    ai: '東家・莊・等待中',
    'ron-offer': '東家・莊・可以胡牌',
    ended: '東家・莊・本局結束'
  }[game.phase];
  for(let seat = 1; seat < 4; seat++){
    $(`#seat${seat}Tiles`).textContent = `▦ × ${game.hands[seat].length}`;
    $(`#seat${seat}Flowers`).textContent = game.flowers[seat].length ? `花 ${game.flowers[seat].map(tileGlyph).join('')}` : '';
  }
  $('#playerFlowers').textContent = game.flowers[PLAYER].map(tileGlyph).join('');
  $('#playerFlowers').title = game.flowers[PLAYER].map(tileName).join('、');
  updateCoachStats();
}

function renderHand(){
  hand.innerHTML = '';
  const playable = game.phase === 'player' && game.hasDrawn;
  game.hands[PLAYER].forEach((tile, index) => {
    const el = document.createElement('button');
    el.className = 'tile';
    if(game.hasDrawn && game.phase === 'player' && index === game.hands[PLAYER].length - 1 && game.lastDrawn !== null) el.classList.add('drawn');
    el.textContent = tileGlyph(tile);
    el.setAttribute('aria-label', tileName(tile));
    el.title = tileName(tile);
    el.disabled = !playable;
    el.addEventListener('click', () => { if(game.phase === 'player' && game.hasDrawn) discardTile(index); });
    hand.appendChild(el);
  });
}

function renderDiscards(){
  discardRiver.innerHTML = '';
  game.discards.forEach(item => {
    const el = document.createElement('span');
    el.textContent = tileGlyph(item.tile);
    el.title = `${SEAT_NAMES[item.seat]}：${tileName(item.tile)}`;
    if(item.seat === PLAYER) el.classList.add('mine');
    discardRiver.appendChild(el);
  });
}

function renderAll(){ renderHand(); renderDiscards(); updateStatus(); }

// ---------------------------------------------------------------------------
// 教練
// ---------------------------------------------------------------------------
function shantenLabel(value){ return value < 0 ? '已胡牌' : value === 0 ? '聽牌' : `${value} 向聽`; }

function updateCoachStats(){
  const tiles = game.hands[PLAYER];
  let info;
  if(tiles.length % 3 === 2){
    const best = rankDiscards(tiles, visibleCounts())[0];
    info = isWinningHand(tiles) ? { shanten: -1, total: 0 } : best;
  } else {
    info = effectiveTiles(tiles, visibleCounts());
  }
  $('#shantenValue').textContent = shantenLabel(info.shanten);
  $('#effectiveValue').textContent = info.shanten < 0 ? '—' : `${info.total} 張`;
}

function describeWaits(waits){
  return waits.map(item => `${tileName(item.tile)}(${item.left})`).join('、');
}

function showHint(){
  const tiles = game.hands[PLAYER];
  let html;
  if(game.phase === 'ron-offer'){
    html = `<div class="coach-tag">教練建議</div><h4>可以胡 ${tileName(game.pendingDiscard.tile)}！</h4><p>${SEAT_NAMES[game.pendingDiscard.seat]}打出的牌能讓你湊成五組加一對，按「胡」即可放槍胡牌。</p>`;
  } else if(game.phase !== 'player' || !game.hasDrawn){
    const info = effectiveTiles(tiles, visibleCounts());
    html = `<div class="coach-tag">教練觀察</div><h4>目前${shantenLabel(info.shanten)}</h4><p>${info.tiles.length ? `能讓手牌前進的牌：${describeWaits(info.tiles)}。` : '目前看得到的牌中，沒有能直接前進的進張。'}摸牌後再看提示，教練會比較每一種打法。</p>`;
  } else if(isWinningHand(tiles)){
    html = '<div class="coach-tag">教練建議</div><h4>已經胡牌了！</h4><p>手牌已湊成五組加一對，按「胡牌」宣告自摸。</p>';
  } else {
    const options = rankDiscards(tiles, visibleCounts());
    const best = options[0];
    const equal = options.filter(option => option.shanten === best.shanten && option.total === best.total);
    const alternatives = options.filter(option => !equal.includes(option)).slice(0, 2);
    const names = equal.map(option => tileName(option.tile)).join(' 或 ');
    const reason = best.shanten === 0
      ? `打出後就聽牌，等 ${describeWaits(best.waits)}，共 ${best.total} 張。`
      : `打出後是 ${best.shanten} 向聽，能前進的牌有 ${best.total} 張：${describeWaits(best.waits)}。`;
    const compare = alternatives.length
      ? `<p>其他選擇：${alternatives.map(option => `${tileName(option.tile)}（${shantenLabel(option.shanten)}，${option.total} 張）`).join('；')}。</p>`
      : '';
    html = `<div class="coach-tag">教練建議</div><h4>建議打出 ${names}</h4><p>${reason}這不是唯一答案，但能讓手牌最快靠近聽牌。</p>${compare}`;
  }
  html += '<div class="coach-divider"></div><div class="stat-grid"><div><span>目前向聽</span><strong id="shantenValue"></strong></div><div><span>有效進張</span><strong id="effectiveValue"></strong></div></div>';
  $('#coachBody').innerHTML = html;
  updateCoachStats();
  showToast('已顯示本回合提示');
}

function resetCoach(){
  $('#coachBody').innerHTML = '<div class="coach-tag">這一手先想想</div><h4>你想保留哪一組搭子？</h4><p>先觀察手牌中的兩面搭子。兩面搭子可以等到兩種牌，通常比孤張更有延伸空間。</p><div class="coach-divider"></div><div class="stat-grid"><div><span>目前向聽</span><strong id="shantenValue"></strong></div><div><span>有效進張</span><strong id="effectiveValue"></strong></div></div>';
}

// ---------------------------------------------------------------------------
// 流程
// ---------------------------------------------------------------------------
function drawPlayer(){
  if(game.phase === 'ron-offer'){ passRon(); return; }
  if(game.phase !== 'player' || game.hasDrawn) return;
  const flowersBefore = game.flowers[PLAYER].length;
  const tile = drawTile(PLAYER);
  if(tile === null){ endDraw(); return; }
  game.lastDrawn = tile;
  game.hasDrawn = true;
  renderAll();
  const flowerNote = game.flowers[PLAYER].length > flowersBefore ? '（補花後）' : '';
  showToast(isWinningHand(game.hands[PLAYER]) ? `摸到 ${tileName(tile)}${flowerNote}，可以自摸！` : `摸到 ${tileName(tile)}${flowerNote}，請點選要打出的牌`);
}

function discardTile(index){
  if(game.phase !== 'player' || !game.hasDrawn) return;
  const tiles = game.hands[PLAYER];
  const options = rankDiscards(tiles, visibleCounts());
  const discarded = tiles.splice(index, 1)[0];
  const chosen = options.find(option => option.tile === discarded);
  const best = options[0];
  game.log.push({
    turn: game.log.length + 1,
    tile: discarded,
    shanten: chosen.shanten,
    total: chosen.total,
    best: options.filter(option => option.shanten === best.shanten && option.total === best.total).map(option => option.tile),
    bestShanten: best.shanten,
    bestTotal: best.total
  });
  game.discards.push({ tile: discarded, seat: PLAYER });
  game.hasDrawn = false;
  game.lastDrawn = null;
  sortTiles(tiles);
  game.phase = 'ai';
  renderAll();
  showToast(`已打出 ${tileName(discarded)}，三位電腦依序出牌`);
  afterDiscard(PLAYER, discarded);
}

// 出牌後依輪序檢查其他家是否要胡（最靠近出牌者的下家優先）
function afterDiscard(seat, tile){
  for(let step = 1; step < 4; step++){
    const other = (seat + step) % 4;
    if(!isWinningHand([...game.hands[other], tile])) continue;
    if(other === PLAYER){
      game.phase = 'ron-offer';
      game.pendingDiscard = { tile, seat };
      renderAll();
      showToast(`${SEAT_NAMES[seat]}打出 ${tileName(tile)}，你可以胡牌！`);
      return;
    }
    game.hands[other].push(game.discards.pop().tile);
    endWin(other, { tile, from: seat });
    return;
  }
  continueFrom(seat);
}

function continueFrom(seat){
  const next = (seat + 1) % 4;
  if(liveWallCount() === 0){ endDraw(); return; }
  if(next === PLAYER){
    game.phase = 'player';
    renderAll();
    showToast('輪到你摸牌');
    return;
  }
  game.phase = 'ai';
  const id = game.id;
  window.setTimeout(() => { if(game.id === id) computerTurn(next); }, AI_DELAY);
}

function computerTurn(seat){
  const tile = drawTile(seat);
  if(tile === null){ endDraw(); return; }
  const tiles = game.hands[seat];
  if(isWinningHand(tiles)){ endWin(seat, null); return; }
  // 初級電腦：選向聽數最低、進張最多的打法，同分時隨機
  const options = rankDiscards(tiles, null);
  const top = options.filter(option => option.shanten === options[0].shanten && option.total === options[0].total);
  const discarded = top[Math.floor(Math.random() * top.length)].tile;
  tiles.splice(tiles.indexOf(discarded), 1);
  game.discards.push({ tile: discarded, seat });
  renderAll();
  afterDiscard(seat, discarded);
}

function passRon(){
  const { seat } = game.pendingDiscard;
  game.pendingDiscard = null;
  game.phase = 'ai';
  renderAll();
  showToast('已選擇不胡，牌局繼續');
  continueFrom(seat);
}

function declareWin(){
  if(!canPlayerWin()) return;
  if(game.phase === 'ron-offer'){
    const { tile, seat } = game.pendingDiscard;
    game.hands[PLAYER].push(game.discards.pop().tile);
    game.pendingDiscard = null;
    endWin(PLAYER, { tile, from: seat });
  } else {
    endWin(PLAYER, null);
  }
}

function endWin(seat, ron){
  game.phase = 'ended';
  game.hasDrawn = false;
  game.result = { type: 'win', seat, ron };
  renderAll();
  let message;
  if(seat === PLAYER) message = ron ? `恭喜胡牌！胡 ${SEAT_NAMES[ron.from]}打出的 ${tileName(ron.tile)}。` : '恭喜自摸！這一局完成。';
  else message = ron ? `${SEAT_NAMES[seat]}胡了${ron.from === PLAYER ? '你' : SEAT_NAMES[ron.from]}打出的 ${tileName(ron.tile)}。` : `${SEAT_NAMES[seat]}自摸了。`;
  showToast(message);
  renderReview(message);
}

function endDraw(){
  game.phase = 'ended';
  game.hasDrawn = false;
  game.result = { type: 'draw' };
  renderAll();
  showToast('牌牆只剩留牌，本局流局');
  renderReview('牌牆只剩留牌，本局流局。');
}

function renderReview(summary){
  const entries = game.log.map(entry => {
    const matched = entry.best.includes(entry.tile);
    const verdict = matched
      ? '<b class="good">與教練相同</b>'
      : `<b class="diff">教練建議：${entry.best.map(tileName).join('／')}（${shantenLabel(entry.bestShanten)}，${entry.bestTotal} 張）</b>`;
    return `<li><span class="review-turn">第 ${entry.turn} 巡</span><span class="review-tile">${tileGlyph(entry.tile)}</span><span>打出 ${tileName(entry.tile)}：${shantenLabel(entry.shanten)}，進張 ${entry.total} 張</span>${verdict}</li>`;
  }).join('');
  const matchedCount = game.log.filter(entry => entry.best.includes(entry.tile)).length;
  $('#reviewContent').innerHTML = `<div class="review-summary"><strong>${summary}</strong><small>你共出牌 ${game.log.length} 次，其中 ${matchedCount} 次與教練的首選相同。不同不代表錯誤，可以回頭比較進張差異。</small></div><ol class="review-list">${entries || '<li>這一局你還沒有出牌。</li>'}</ol>`;
}

function resetReview(){
  $('#reviewContent').innerHTML = '<div class="empty-review"><span>◌</span><strong>還沒有可覆盤的牌局</strong><small>完成目前這一局後，就能看到你的選擇與教練建議。</small></div>';
}

function resetGame(){
  newGame();
  resetCoach();
  resetReview();
  renderAll();
  setMode('table');
  showToast('牌局已重新開始，你是莊家，請先出牌');
}

// ---------------------------------------------------------------------------
// 新手學堂
// ---------------------------------------------------------------------------
const lessonContent = [
  ['先認識一張牌', '麻將牌分成萬子、筒子、條子三種數字牌，以及東南西北中發白七種字牌，另外還有 8 張花牌。先分清楚花色，之後看牌效率才不會迷路。', [0, 9, 18, 27, 38].map(tileGlyph)],
  ['胡牌就是五組加一對', '台灣麻將手上 16 張，胡牌時共 17 張：順子或刻子算一組，湊滿五組，再留一對作為眼睛。先找出手牌裡已經成形的部分。', [[0,1,2], [9,10,11], [27,27,27], [27+4,27+4]].map(group => group.map(tileGlyph).join(''))],
  ['開局不是靠猜', '抓位決定座位，擲骰決定從哪一面牌牆開門。每人拿 16 張，莊家多拿 1 張；摸到花牌要亮出並從牌尾補牌。', ['抓位', '擲骰', '開門']],
  ['一巡就是摸一張、打一張', '你摸牌時手上會暫時有 17 張；選一張打出後，才回到 16 張，輪到下家（逆時針方向）。', ['摸牌', '選牌', '出牌']],
  ['開始用教練打一局', '現在回到教練實戰。你是東家（莊家），先打出第一張牌；不確定時按「看提示」，觀察教練如何比較不同選擇。', ['開始實戰']]
];

function renderLesson(){
  const item = lessonContent[lessonStep - 1];
  const flowerGlyph = tileGlyph(38);
  $('#lessonStepNumber').textContent = lessonStep;
  $('#lessonTitle').textContent = item[0];
  $('#lessonDescription').textContent = item[1];
  $('#lessonDemo').innerHTML = item[2].map(text => {
    const classes = ['demo-tile'];
    if([...text.replace(/︎/g, '')].length > 1) classes.push('wide');
    if(text === flowerGlyph) classes.push('flower');
    return `<span class="${classes.join(' ')}">${text}</span>`;
  }).join('');
  $('#lessonProgressBar').style.width = `${lessonStep * 20}%`;
  $('#lessonBack').disabled = lessonStep === 1;
  $('#lessonNext').textContent = lessonStep === 5 ? '進入教練實戰' : '下一步';
  document.querySelectorAll('.lesson-node').forEach((node, index) => node.classList.toggle('active', index === lessonStep - 1));
  lessonReached = Math.max(lessonReached, lessonStep);
  $('#progressText').textContent = `${lessonReached} / 5`;
  $('#progressBar').style.width = `${lessonReached * 20}%`;
}

function setMode(mode){
  document.querySelectorAll('.mode-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
  $('#tableView').classList.toggle('hidden', mode !== 'table');
  $('#lessonView').classList.toggle('hidden', mode !== 'lesson');
  $('#reviewView').classList.toggle('hidden', mode !== 'review');
}

// ---------------------------------------------------------------------------
// 啟動
// ---------------------------------------------------------------------------
function init(){
  hand = $('#hand');
  toast = $('#toast');
  drawButton = $('#drawButton');
  winButton = $('#winButton');
  wallCount = $('#wallCount');
  discardRiver = $('#discardRiver');

  document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  $('#hintButton').addEventListener('click', showHint);
  $('#explainButton').addEventListener('click', () => showToast('向聽數是離聽牌還差幾步；有效進張是摸到後能讓向聽數下降的牌數。'));
  $('#sortButton').addEventListener('click', () => {
    sortTiles(game.hands[PLAYER]);
    game.lastDrawn = null;
    renderHand();
    showToast('手牌已依萬、筒、條、字整理');
  });
  drawButton.addEventListener('click', drawPlayer);
  winButton.addEventListener('click', declareWin);
  $('#resetButton').addEventListener('click', resetGame);
  $('#lessonNext').addEventListener('click', () => {
    if(lessonStep < 5){ lessonStep += 1; renderLesson(); }
    else { lessonStep = 1; renderLesson(); setMode('table'); showToast('教練實戰已準備好'); }
  });
  $('#lessonBack').addEventListener('click', () => { if(lessonStep > 1){ lessonStep -= 1; renderLesson(); } });

  newGame();
  resetCoach();
  renderAll();
  renderLesson();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

if(typeof document !== 'undefined') init();
