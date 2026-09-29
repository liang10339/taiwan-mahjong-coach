'use strict';
// 教練欄的「胡牌率與台數」：用 src/core/value.js 模擬每種打法，在背景執行緒（Web Worker）計算，
// 算好後更新教練欄。沒有 Worker 的環境（直接開檔、測試）改成稍後在主執行緒用較少次數計算。

/** 這個檔案載入時的 ?v= 版本參數，讓 Worker 載入同一版的核心檔案 */
const valueVersion = (() => {
  try {
    const src = /** @type {HTMLScriptElement} */ (document.currentScript).src;
    return src.includes('?') ? src.slice(src.indexOf('?')) : '';
  } catch (e) {
    return '';
  }
})();
/** Worker：null 尚未建立、false 無法使用（改用主執行緒） */
let valueWorker = null;
let valueJob = 0;
/** 目前這個局面的模擬結果；key 相同時直接沿用 */
let valueState = { key: '', report: null };

function valueKey() {
  return game.seed + '|' + game.log.length + '|' + game.hands[0].join(',');
}

function getValueWorker() {
  if (valueWorker !== null) return valueWorker || null;
  try {
    valueWorker =
      typeof Worker === 'undefined' ? false : new Worker('src/workers/value-worker.js' + valueVersion);
  } catch (e) {
    valueWorker = false;
  }
  return valueWorker || null;
}

/** 在主執行緒模擬（次數較少，避免卡住畫面） */
function valueFallback(job, snapshot) {
  setTimeout(() => {
    if (job === valueJob) valueDone(job, Value.evaluate(snapshot, 0, { trials: 80 }));
  }, 0);
}

function valueDone(job, report) {
  if (job !== valueJob) return; // 已經換了局面，舊的結果不用
  valueState.report = report;
  if (currentMode === 'table' && game.turn === 0 && game.phase === 'discard') coach();
}

/** 開始模擬目前局面（同一局面只算一次） */
function requestValue() {
  const key = valueKey();
  if (valueState.key === key) return valueState;
  valueState = { key, report: null };
  const job = ++valueJob;
  const snapshot = JSON.parse(JSON.stringify(game)); // 只傳資料，模擬不會改到真正的牌局
  const worker = getValueWorker();
  if (!worker) {
    valueFallback(job, snapshot);
    return valueState;
  }
  worker.onmessage = (event) => {
    if (event.data.job !== job) return;
    if (event.data.error) valueFallback(job, snapshot);
    else valueDone(job, event.data.report);
  };
  worker.onerror = () => {
    valueWorker = false; // 例如直接開檔時瀏覽器不允許 Worker：改用主執行緒
    valueFallback(job, snapshot);
  };
  worker.postMessage({ job, game: snapshot, player: 0, options: { trials: 400 } });
  return valueState;
}

/** 教練欄的「胡牌率與台數」區塊 */
function valueSection(body) {
  if (!settings.value || typeof Value === 'undefined') return;
  const { report } = requestValue();
  const box = el('section', 'value-card');
  box.append(el('h5', null, '胡牌率與台數（模擬）'));
  if (!report) {
    box.append(el('p', 'value-wait', '正在模擬接下來的巡目…'));
    body.append(box);
    return;
  }
  const advice = Value.advice(report, Coach.label);
  if (advice.differs) box.classList.add('differs');
  box.append(el('p', 'value-advice', advice.text));
  const table = el('div', 'value-table');
  const head = el('div', 'value-row head');
  head.append(
    el('span', null, '打'),
    el('span', null, '胡牌率'),
    el('span', null, '胡了平均'),
    el('span', null, '期望'),
  );
  table.append(head);
  const maxEv = Math.max(0.01, ...report.options.map((o) => o.expectedTai));
  report.options
    .slice()
    .sort((a, b) => b.expectedTai - a.expectedTai)
    .forEach((o) => {
      const row = el(
        'div',
        'value-row' +
          (o.tile === advice.richest.tile ? ' rich' : '') +
          (o.tile === advice.fastest.tile ? ' fast' : ''),
      );
      const bar = el('span', 'value-bar'),
        fill = el('i');
      fill.style.width = Math.round((o.expectedTai / maxEv) * 100) + '%';
      bar.append(fill, el('b', null, o.expectedTai.toFixed(2) + ' 台'));
      row.append(
        Tiles.node(o.tile, 'xs'),
        el('span', null, Math.round(o.winRate * 100) + '%'),
        el('span', null, o.winRate ? o.avgTai.toFixed(1) + ' 台' : '—'),
        bar,
      );
      table.append(row);
    });
  box.append(table);
  box.append(
    el(
      'small',
      'value-note',
      '每種打法模擬 ' +
        report.trials +
        ' 次接下來約 ' +
        report.horizon +
        ' 巡：看不到的牌隨機排列、別家依平均機率先胡、能加快聽牌時才吃碰。胡牌率偏保守，用來比較打法的好壞，不是實際機率。期望＝胡牌率×胡了平均台數。',
    ),
  );
  body.append(box);
}
