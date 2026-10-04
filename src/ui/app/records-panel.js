'use strict';
// 牌譜：自動保存打到一半的這一局（重新整理或更新後可以接著打）、保留最近打完的完整牌局、
// 匯出與匯入牌譜檔，以及逐步回放（回到任一步，看四家手牌與當時的動作）。
// 牌譜格式與重播在 src/core/record.js；這裡只負責存取與畫面。

const CURRENT_KEY = 'mahjong-coach-current';
const RECORDS_KEY = 'mahjong-coach-records';
/** 保留最近幾局完整牌譜（每局約數 KB） */
const RECORDS_LIMIT = 30;
/** 上次保存時的紀錄長度，沒變就不重存 */
let savedMark = '';
/** 回放中的牌譜與步數 */
let viewer = null;

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch (e) {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

/** 每次重畫後呼叫：牌局有新動作就保存（含覆盤紀錄，接續後覆盤不會斷掉） */
function persistGame() {
  // 還沒有任何動作（剛開頁、剛洗好牌）不存，避免蓋掉上次沒打完的牌局
  // 打完的局由 archiveGame() 放進歷史，不再當成「打到一半」
  if (typeof Record === 'undefined' || openingActive || !game.log.length || game.phase === 'ended') return;
  const mark = game.seed + ':' + game.log.length + ':' + game.phase;
  if (mark === savedMark) return;
  savedMark = mark;
  writeJSON(CURRENT_KEY, {
    record: Record.fromGame(game, { coach: typeof Advisor !== 'undefined' ? Advisor.VERSION : null }),
    turnLog,
    reviewTimeline,
    hand: session.hand,
    aiState: game._ai,
    savedAt: Date.now(),
  });
}

/** 可以接續的未完成牌局（同一將的同一手才算） */
function resumable() {
  const s = readJSON(CURRENT_KEY, null);
  if (!s || !s.record || s.record.result || s.hand !== session.hand) return null;
  return s;
}

/** 接續上一局：用牌譜重播回當時的局面 */
function resumeGame(saved) {
  const r = Record.replay(saved.record);
  if (r.error || !r.game) {
    notify('上一局無法接續：' + (r.error || '牌譜損壞') + '，改開新的一局。');
    return false;
  }
  if (typeof Sound !== 'undefined' && Sound.unlock) Sound.unlock();
  generation++;
  clearTimeout(timer);
  game = declareStyles(r.game);
  if (saved.aiState !== undefined) game._ai = saved.aiState;
  turnLog = saved.turnLog || [];
  reviewTimeline = saved.reviewTimeline || [];
  lastReview = turnLog.length ? turnLog[turnLog.length - 1] : null;
  lastDrawn = game.fresh && game.fresh.player === 0 ? game.fresh.tile : null;
  selected = null;
  suggestions = [];
  heard = { log: game.log.length, phase: game.phase }; // 不重播之前的音效
  scoreCache = { log: -1, value: [] };
  resetSituation();
  publishDealPrint(game);
  savedMark = '';
  updateSeats();
  openingClose();
  analyze();
  render();
  notify('已接續上一局（' + r.applied + ' 個動作）。');
  computers();
  return true;
}

/** 一局結束：把完整牌譜放進歷史，清掉「未完成」存檔 */
function archiveGame() {
  if (typeof Record === 'undefined') return;
  const list = readJSON(RECORDS_KEY, []);
  list.unshift({
    time: Date.now(),
    round: roundName(),
    result: game.result,
    record: Record.fromGame(game, { coach: typeof Advisor !== 'undefined' ? Advisor.VERSION : null }),
  });
  writeJSON(RECORDS_KEY, list.slice(0, RECORDS_LIMIT));
  try {
    localStorage.removeItem(CURRENT_KEY);
  } catch (e) {}
}

/** 下載牌譜檔（JSON） */
function downloadRecord(record, name) {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name + '.mahjong.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 匯入牌譜文字；成功就打開回放 */
function importRecordText(text) {
  // 實戰記錄（只記單一座位看得到的事件）交給實戰記錄區覆盤
  try {
    if (JSON.parse(text).perspective === 'seat' && typeof importManualText === 'function')
      return importManualText(text);
  } catch (e) {}
  const r = Record.parse(text);
  if (r.error) {
    notify('無法匯入牌譜：' + r.error);
    return false;
  }
  viewer = { record: r.record, step: r.record.commands.length, title: '匯入的牌譜' };
  renderRecords();
  return true;
}

/** 一個動作寫成文字 */
function commandText(c) {
  const who = c.p === 0 ? '你' : seats[c.p];
  if (c.a === 'draw') return who + '摸牌';
  if (c.a === 'discard') return who + (c.cut === 'tsumo' ? '摸切 ' : '打 ') + Coach.label(c.tile);
  if (c.a === 'win') return who + '自摸';
  if (c.a === 'selfKan') return who + (c.type === 'concealed' ? '暗槓 ' : '加槓 ') + Coach.label(c.tile);
  if (c.a === 'respond')
    return c.choice === 'pass'
      ? who + '略過'
      : who + (actionName[c.choice] || c.choice) + ' ' + Coach.label(c.tile);
  return who + c.a;
}

/** 回放畫面：四家手牌、攤牌、牌河，以及這一步的動作 */
function viewerSection(box) {
  const { record } = viewer;
  const total = record.commands.length,
    step = (viewer.step = Math.max(0, Math.min(total, viewer.step))),
    r = Record.replay(record, { upto: step }),
    g = r.game;
  const head = el('div', 'record-head');
  head.append(el('strong', null, viewer.title), el('small', null, '第 ' + step + ' / ' + total + ' 步'));
  box.append(head);
  if (r.error || !g) {
    box.append(el('p', null, '無法回放：' + r.error));
    return;
  }
  const bar = el('div', 'record-bar');
  const go = (n) => {
    viewer.step = Math.max(0, Math.min(total, n));
    renderRecords();
  };
  const button = (text, n, disabled) => {
    const b = el('button', 'secondary-button', text);
    b.type = 'button';
    b.disabled = disabled;
    b.onclick = () => go(n);
    return b;
  };
  const slider = el('input', 'record-slider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(total);
  slider.value = String(step);
  slider.oninput = () => go(+slider.value);
  bar.append(
    button('⏮', 0, step === 0),
    button('◀', step - 1, step === 0),
    slider,
    button('▶', step + 1, step === total),
  );
  box.append(bar);
  box.append(el('p', 'record-action', step ? commandText(record.commands[step - 1]) : '開局配牌完成'));
  [0, 1, 2, 3].forEach((p) => {
    const row = el('div', 'record-seat' + (g.turn === p && g.phase !== 'ended' ? ' turn' : ''));
    row.append(el('small', null, p === 0 ? '你' : seats[p]));
    const hand = el('span', 'meld-group');
    g.hands[p]
      .slice()
      .sort((a, b) => a - b)
      .forEach((t) => hand.append(Tiles.node(t, 'xs')));
    row.append(hand);
    g.melds[p].forEach((m) => {
      const mg = el('span', 'meld-group');
      m.tiles.forEach((t) => mg.append(Tiles.node(t, 'xs')));
      row.append(mg);
    });
    const river = el('div', 'record-river');
    g.rivers[p].forEach((t) => river.append(Tiles.node(t, 'xs')));
    row.append(river);
    box.append(row);
  });
  if (step === total && record.result) box.append(el('p', 'record-result', record.result));
  const actions = el('div', 'record-actions');
  const dl = el('button', 'secondary-button', '下載這份牌譜');
  dl.type = 'button';
  dl.onclick = () => downloadRecord(record, 'mahjong-' + record.seed);
  const close = el('button', 'secondary-button', '關閉回放');
  close.type = 'button';
  close.onclick = () => {
    viewer = null;
    renderRecords();
  };
  actions.append(dl, close);
  box.append(actions);
}

/** 牌局覆盤分頁的「牌譜」區：最近打完的牌局、匯入、回放 */
function renderRecords() {
  const box = $('#recordPanel');
  if (!box || typeof Record === 'undefined') return;
  box.replaceChildren();
  box.append(el('h3', null, '牌譜'));
  if (viewer) {
    viewerSection(box);
    return;
  }
  const list = readJSON(RECORDS_KEY, []);
  box.append(
    el(
      'p',
      'record-intro',
      list.length
        ? '最近 ' + list.length + ' 局的完整牌譜（存在這台裝置）。可以逐步回放、下載，或匯入別人分享的牌譜。'
        : '打完一局後，完整牌譜會存在這裡，可以逐步回放、下載分享。',
    ),
  );
  list.slice(0, 10).forEach((x, i) => {
    const row = el('div', 'record-row');
    const open = el('button', 'secondary-button', '回放');
    open.type = 'button';
    open.onclick = () => {
      viewer = { record: x.record, step: 0, title: x.round + '・' + (x.result || '') };
      renderRecords();
    };
    row.append(
      el(
        'span',
        null,
        new Date(x.time).toLocaleString('zh-TW', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      ),
      el('span', null, x.round),
      el('small', null, x.result || ''),
      open,
    );
    row.dataset.index = String(i);
    box.append(row);
  });
  const file = el('input', 'record-file');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.setAttribute('aria-label', '匯入牌譜檔');
  file.onchange = () => {
    const f = file.files && file.files[0];
    if (f) f.text().then(importRecordText);
  };
  const label = el('label', 'record-import');
  label.append(el('span', null, '匯入牌譜：'), file);
  box.append(label);
}
