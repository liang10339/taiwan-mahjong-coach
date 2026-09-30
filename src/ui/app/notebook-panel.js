'use strict';
// 錯題本畫面（「牌局覆盤」分頁最上方）：顯示待複習題數，按「開始複習」逐題作答。
// 題目與排程邏輯在 src/core/notebook.js；這裡只負責存取（本機瀏覽器）與畫面。

const NOTEBOOK_KEY = 'mahjong-coach-notebook';
/** 複習進行中：{queue: 題目 id, index: 第幾題, answered: 這題的作答結果, right: 答對數} */
let notebookRun = null;

function loadNotebook() {
  try {
    return JSON.parse(localStorage.getItem(NOTEBOOK_KEY) || '[]');
  } catch (e) {
    return [];
  }
}
function saveNotebook(book) {
  try {
    localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(book));
  } catch (e) {}
}

/** 實戰出牌是關鍵失誤時呼叫（必須在牌打出去之前）：把當時看得到的局面存進錯題本 */
function rememberMistake(played) {
  if (typeof Notebook === 'undefined') return;
  const item = Notebook.fromMistake({
    hand: game.hands[0],
    open: game.melds[0].length,
    melds: game.melds[0].map((m) => m.tiles),
    pub: E.publicTiles(game),
    played,
    label: roundName(),
  });
  saveNotebook(Notebook.add(loadNotebook(), item));
  updateNotebookBadge();
}

/** 你放槍時呼叫：把放槍那一手存成「這手打哪張最安全？」的防守題 */
function rememberDealIn(record, winner) {
  if (
    typeof Notebook === 'undefined' ||
    !record ||
    !record.snapshot ||
    !record.safety ||
    !record.safety.length
  )
    return;
  const item = Notebook.fromDealIn({
    hand: record.snapshot.hand,
    open: record.snapshot.melds[0].length,
    melds: record.snapshot.melds[0].map((m) => m.tiles),
    pub: record.pub || [],
    played: record.tile,
    safety: record.safety,
    winner,
    label: roundName(),
  });
  saveNotebook(Notebook.add(loadNotebook(), item));
  updateNotebookBadge();
}

/** 「牌局覆盤」分頁上的數字：今天要複習幾題 */
function updateNotebookBadge() {
  if (typeof Notebook === 'undefined') return;
  const tab = $('.mode-tab[data-mode="review"]');
  if (!tab || !tab.dataset) return;
  const n = Notebook.stats(loadNotebook()).due;
  tab.dataset.badge = n ? String(n) : '';
  tab.title = n ? '錯題本有 ' + n + ' 題待複習' : '';
}

function renderNotebook() {
  const box = $('#notebookPanel');
  if (!box || typeof Notebook === 'undefined') return;
  box.replaceChildren();
  const book = loadNotebook(),
    st = Notebook.stats(book);
  box.append(el('h3', null, '錯題本'));
  if (!notebookRun) {
    box.append(
      el(
        'p',
        null,
        st.total
          ? '共 ' + st.total + ' 題，今天要複習 ' + st.due + ' 題，已熟練 ' + st.mastered + ' 題。'
          : '實戰中的關鍵失誤（退一步，或少 4 張以上進張）和放槍的那一手會自動存到這裡，隔幾天再考一次，直到熟練。',
      ),
    );
    if (st.due) {
      const start = el('button', 'primary-button', '開始複習（' + st.due + ' 題）');
      start.type = 'button';
      start.onclick = () => {
        notebookRun = { queue: Notebook.due(book).map((x) => x.id), index: 0, answered: null, right: 0 };
        renderNotebook();
      };
      box.append(start);
    } else if (st.total) box.append(el('small', null, '目前沒有到期的題目，之後再回來複習。'));
    return;
  }
  const run = notebookRun,
    item = book.find((x) => x.id === run.queue[run.index]);
  if (!item) {
    // 全部答完
    box.append(el('p', 'notebook-done', '複習完成：答對 ' + run.right + ' / ' + run.queue.length + ' 題。'));
    const back = el('button', 'secondary-button', '回到錯題本');
    back.type = 'button';
    back.onclick = () => {
      notebookRun = null;
      renderNotebook();
    };
    box.append(back);
    updateNotebookBadge();
    return;
  }
  box.append(
    el(
      'small',
      'notebook-meta',
      '第 ' + (run.index + 1) + ' / ' + run.queue.length + ' 題　' + (item.label || ''),
    ),
    el('h4', null, item.kind === 'defense' ? '你在這手放槍了：打哪張最安全？' : '這手要打哪張？'),
  );
  if (item.melds.length) {
    const melds = el('div', 'notebook-melds');
    melds.append(el('small', null, '攤牌'));
    item.melds.forEach((m) => melds.append(tileRow(m)));
    box.append(melds);
  }
  const result = run.answered && run.answered.result;
  const hand = el('div', 'notebook-hand');
  item.hand.forEach((t) => {
    const b = el('button', 'tile mj mj-md');
    b.type = 'button';
    Tiles.fill(b, t);
    b.setAttribute('aria-label', Coach.label(t));
    if (result) {
      b.disabled = true;
      if (result.answers.includes(t)) b.classList.add('best');
      if (t === run.answered.tile && !result.correct) b.classList.add('picked');
    } else
      b.onclick = () => {
        const r = Notebook.check(item, t);
        saveNotebook(Notebook.answer(loadNotebook(), item.id, r.correct));
        run.answered = { tile: t, result: r };
        if (r.correct) run.right++;
        renderNotebook();
      };
    hand.append(b);
  });
  box.append(
    hand,
    el('small', 'notebook-meta', '當時場上已看得到 ' + item.pub.length + ' 張牌（算進有效牌的未見張數）。'),
  );
  if (!result) return;
  const feedback = el('div', 'notebook-feedback ' + (result.correct ? 'right' : 'wrong'));
  feedback.append(
    el(
      'strong',
      null,
      result.correct ? '✓ 答對了' : '✗ 教練建議打 ' + result.answers.map(Coach.label).join(' 或 '),
    ),
    el('p', null, result.judge),
  );
  const lines = el('ul', 'coach-lines');
  result.lines.forEach((line) => lines.append(el('li', null, line)));
  feedback.append(lines);
  box.append(feedback);
  const next = el('button', 'primary-button', run.index + 1 < run.queue.length ? '下一題' : '看結果');
  next.type = 'button';
  next.onclick = () => {
    run.index++;
    run.answered = null;
    renderNotebook();
  };
  box.append(next);
}
