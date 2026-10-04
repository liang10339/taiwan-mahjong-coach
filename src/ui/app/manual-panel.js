'use strict';
// 實戰記錄：把你在別處（實體牌桌、其他平台）打的牌一步步輸入，打完讓教練逐手覆盤。
// 只記你看得到的事：起手牌、你摸到的牌、四家打出的牌、吃碰槓、花、胡牌；別家摸了什麼不用記。
// 記錄格式與重建在 src/core/seatrecord.js；覆盤用的是和實戰同一個教練（advisor.js）。

const MANUAL_KEY = 'mahjong-coach-manual';
const MANUAL_DRAFT_KEY = 'mahjong-coach-manual-draft';
const MANUAL_LIMIT = 30;
/** 相對座位名稱：你永遠是 0 */
const MANUAL_SEATS = ['你', '下家', '對家', '上家'];
const MANUAL_ACTIONS = {
  draw: '摸',
  discard: '打',
  chi: '吃',
  pon: '碰',
  kan: '槓',
  concealed: '暗槓',
  added: '加槓',
  flower: '補花',
  ron: '胡',
  tsumo: '自摸',
};

/** 輸入中的記錄：{record, stage: 'setup'|'play', actor, action, picked, flowerSeat}；null 表示沒在記錄 */
let manual = null;
/** 正在看覆盤的實戰記錄 */
let manualReview = null;

function saveManualDraft() {
  writeJSON(MANUAL_DRAFT_KEY, manual);
}

/** 目前記錄重建出來的局面 */
function manualState() {
  return SeatRecord.state(manual.record);
}

/** 事件寫成一句話 */
function manualEventText(e) {
  const who = MANUAL_SEATS[e.p],
    name = MANUAL_ACTIONS[e.a];
  if (e.a === 'draw') return who + '摸' + (e.tile !== undefined ? ' ' + Coach.label(e.tile) : '一張');
  if (e.a === 'chi') return who + '吃（用 ' + e.tiles.map(Coach.label).join('、') + '）';
  if (e.tile !== undefined) return who + name + ' ' + Coach.label(e.tile);
  return who + name;
}

/** 加一個事件；不合理就拒絕並說明原因 */
function manualPush(event) {
  manual.record.events.push(event);
  const r = manualState();
  if (r.error) {
    manual.record.events.pop();
    notify('這一步記不進去：' + r.error.replace(/^第 \d+ 個事件：/, ''));
    return false;
  }
  manual.action = null;
  manual.picked = [];
  // 下一步預設的動作者：輪到誰就是誰
  manual.actor = r.game.phase === 'ended' ? manual.actor : r.game.turn;
  saveManualDraft();
  renderManual();
  return true;
}

/** 一排可以點的牌（choices：可選的牌；onPick 點了之後） */
function manualPalette(choices, onPick, size = 'xs') {
  const row = el('div', 'manual-palette');
  for (const t of choices) {
    const b = el('button', 'manual-tile');
    b.type = 'button';
    b.setAttribute('aria-label', Coach.label(t));
    b.append(Tiles.node(t, size));
    b.onclick = () => onPick(t);
    row.append(b);
  }
  return row;
}

const ALL_TILES = Array.from({ length: 34 }, (_, t) => t);
const FLOWER_TILES = Array.from({ length: 8 }, (_, i) => 34 + i);

/** 設定畫面：莊家、圈風、起手 16 張與開局的花 */
function manualSetup(box) {
  const rec = manual.record,
    start = rec.start;
  box.append(el('p', 'record-intro', '先輸入開局：誰是莊家、圈風，以及你補完花後的 16 張起手牌。'));
  const opts = el('div', 'manual-options');
  const select = (label, values, current, onChange) => {
    const wrap = el('label', null, label);
    const s = el('select');
    values.forEach((v, i) => {
      const o = el('option', null, v);
      o.value = String(i);
      s.append(o);
    });
    s.value = String(current);
    s.onchange = () => {
      onChange(+s.value);
      saveManualDraft();
    };
    wrap.append(s);
    return wrap;
  };
  opts.append(
    select('莊家', MANUAL_SEATS, rec.options.dealer, (v) => (rec.options.dealer = v)),
    select('圈風', ['東', '南', '西', '北'], rec.options.roundWind, (v) => (rec.options.roundWind = v)),
    select('連莊', ['0', '1', '2', '3', '4', '5'], rec.options.streak, (v) => (rec.options.streak = v)),
    select(
      '一張牌多家能胡',
      ['頭跳（只算最近一家）', '一炮多響'],
      rec.options.rules.multiRon ? 1 : 0,
      (v) => {
        rec.options.rules = { ...rec.options.rules, multiRon: v === 1 };
      },
    ),
  );
  box.append(opts);
  // 目前的起手牌（點一下移除）
  const hand = start.hand.slice().sort((a, b) => a - b);
  box.append(el('p', 'manual-count', '起手 ' + hand.length + ' / 16 張（點牌可以移除）'));
  box.append(
    manualPalette(hand, (t) => {
      start.hand.splice(start.hand.indexOf(t), 1);
      saveManualDraft();
      renderManual();
    }),
  );
  if (hand.length < 16) {
    box.append(el('small', 'record-intro', '點下面的牌加入起手：'));
    box.append(
      manualPalette(
        ALL_TILES.filter((t) => start.hand.filter((x) => x === t).length < 4),
        (t) => {
          start.hand.push(t);
          saveManualDraft();
          renderManual();
        },
      ),
    );
  }
  // 開局的花：選是哪一家的，再點花
  const seat = manual.flowerSeat || 0;
  const flowers = el('div', 'manual-flowers');
  flowers.append(
    select('開局的花屬於', MANUAL_SEATS, seat, (v) => ((manual.flowerSeat = v), renderManual())),
  );
  box.append(flowers);
  const owned = (p) => (p === 0 ? start.flowers : (start.otherFlowers[p] = start.otherFlowers[p] || []));
  const all = [0, 1, 2, 3].flatMap((p) => owned(p));
  box.append(
    manualPalette(
      FLOWER_TILES.filter((t) => !all.includes(t)),
      (t) => {
        owned(seat).push(t);
        saveManualDraft();
        renderManual();
      },
    ),
  );
  const listed = [0, 1, 2, 3].filter((p) => owned(p).length);
  if (listed.length)
    box.append(
      el(
        'small',
        'record-intro',
        '開局的花：' +
          listed.map((p) => MANUAL_SEATS[p] + ' ' + owned(p).map(Coach.label).join('')).join('、'),
      ),
    );
  const actions = el('div', 'record-actions');
  const go = el('button', 'primary-button', '開始記錄');
  go.type = 'button';
  go.disabled = start.hand.length !== 16;
  go.onclick = () => {
    manual.stage = 'play';
    manual.actor = rec.options.dealer;
    saveManualDraft();
    renderManual();
  };
  actions.append(go, manualCancelButton());
  box.append(actions);
}

function manualCancelButton() {
  const b = el('button', 'secondary-button', '放棄這份記錄');
  b.type = 'button';
  b.onclick = () => {
    manual = null;
    try {
      localStorage.removeItem(MANUAL_DRAFT_KEY);
    } catch (e) {}
    renderManual();
  };
  return b;
}

/** 記錄中：選誰、做什麼、哪張牌 */
function manualPlay(box) {
  const r = manualState(),
    g = r.game;
  if (!g) {
    box.append(el('p', null, r.error || '記錄損壞'));
    box.append(manualCancelButton());
    return;
  }
  const mine = g.hands[0].slice().sort((a, b) => a - b);
  box.append(
    el(
      'p',
      'manual-status',
      '牌牆約剩 ' +
        g.wall.length +
        ' 張｜' +
        (g.phase === 'ended'
          ? '這一局結束了'
          : '輪到' + MANUAL_SEATS[g.turn] + (g.phase === 'draw' ? '摸牌' : '出牌')),
    ),
  );
  const handRow = el('div', 'manual-hand');
  mine.forEach((t) => handRow.append(Tiles.node(t, 'xs')));
  g.melds[0].forEach((m) => {
    const mg = el('span', 'meld-group');
    m.tiles.forEach((t) => mg.append(t === null ? Tiles.back('xs') : Tiles.node(t, 'xs')));
    handRow.append(mg);
  });
  box.append(handRow);
  const recent = manual.record.events.slice(-6);
  if (recent.length) box.append(el('p', 'manual-recent', recent.map(manualEventText).join(' → ')));

  if (g.phase !== 'ended') {
    // 誰
    const who = el('div', 'manual-row');
    MANUAL_SEATS.forEach((name, p) => {
      const b = el('button', 'secondary-button' + (manual.actor === p ? ' active' : ''), name);
      b.type = 'button';
      b.onclick = () => {
        manual.actor = p;
        manual.action = null;
        manual.picked = [];
        renderManual();
      };
      who.append(b);
    });
    box.append(who);
    // 做什麼
    const actor = manual.actor ?? g.turn,
      me = actor === 0;
    const what = el('div', 'manual-row');
    for (const [a, name] of Object.entries(MANUAL_ACTIONS)) {
      const b = el('button', 'secondary-button' + (manual.action === a ? ' active' : ''), name);
      b.type = 'button';
      b.onclick = () => {
        // 不需要選牌的動作直接記下
        if (a === 'draw' && !me) return manualPush({ p: actor, a });
        if (a === 'concealed' && !me) return manualPush({ p: actor, a });
        if (a === 'pon' || a === 'kan') {
          const last = g.log.filter((x) => x.action === 'discard').at(-1);
          const need = a === 'kan' ? 3 : 2;
          return manualPush({ p: actor, a, tiles: last ? Array(need).fill(last.tile) : [] });
        }
        if (a === 'ron' || a === 'tsumo') return manualPush({ p: actor, a });
        manual.action = a;
        manual.picked = [];
        renderManual();
      };
      what.append(b);
    }
    box.append(what);
    // 哪張牌
    const a = manual.action;
    if (a) {
      const hint = {
        draw: '你摸到哪一張？（摸到花請按「補花」）',
        discard: me ? '你打哪一張？' : MANUAL_SEATS[actor] + '打哪一張？',
        chi: '用哪兩張吃？（選兩張）',
        concealed: '暗槓哪一張？',
        added: '加槓哪一張？',
        flower: '是哪一張花？',
      }[a];
      box.append(el('small', 'record-intro', hint));
      const pick = (t) => {
        if (a === 'chi') {
          manual.picked.push(t);
          if (manual.picked.length < 2) return renderManual();
          return manualPush({ p: actor, a, tiles: manual.picked.slice() });
        }
        manualPush({ p: actor, a, tile: t });
      };
      const choices =
        a === 'flower'
          ? FLOWER_TILES
          : me && (a === 'discard' || a === 'concealed' || a === 'added' || a === 'chi')
            ? [...new Set(mine)]
            : ALL_TILES;
      box.append(manualPalette(choices, pick));
      if (manual.picked.length)
        box.append(el('small', null, '已選：' + manual.picked.map(Coach.label).join('、')));
    }
  } else {
    if (g.result) box.append(el('p', 'record-result', g.result));
    // 一炮多響：別家也胡同一張時，接著記
    const last = g.log.at(-1);
    if (g.rules.multiRon && last && last.action === 'ron') {
      const row = el('div', 'manual-row');
      row.append(el('small', null, '一炮多響，還有誰也胡？'));
      MANUAL_SEATS.forEach((name, p) => {
        if (p === last.from || g.log.some((x) => x.action === 'ron' && x.player === p)) return;
        const b = el('button', 'secondary-button', name + '也胡');
        b.type = 'button';
        b.onclick = () => manualPush({ p, a: 'ron' });
        row.append(b);
      });
      box.append(row);
    }
  }

  const actions = el('div', 'record-actions');
  const undo = el('button', 'secondary-button', '撤銷上一步');
  undo.type = 'button';
  undo.disabled = !manual.record.events.length;
  undo.onclick = () => {
    manual.record.events.pop();
    const back = manualState();
    manual.actor = back.game ? back.game.turn : 0;
    manual.action = null;
    manual.picked = [];
    saveManualDraft();
    renderManual();
  };
  const done = el(
    'button',
    'primary-button',
    g.phase === 'ended' ? '完成並覆盤' : '記到這裡（流局或不記了）並覆盤',
  );
  done.type = 'button';
  done.onclick = () => finishManual(g);
  actions.append(undo, done, manualCancelButton());
  box.append(actions);
}

/** 存進實戰記錄清單並打開覆盤 */
function finishManual(g) {
  const rec = manual.record;
  rec.result = g.phase === 'ended' ? g.result : '流局／未記完';
  const list = readJSON(MANUAL_KEY, []);
  list.unshift({ time: Date.now(), result: rec.result, record: rec });
  writeJSON(MANUAL_KEY, list.slice(0, MANUAL_LIMIT));
  manual = null;
  try {
    localStorage.removeItem(MANUAL_DRAFT_KEY);
  } catch (e) {}
  manualReview = { record: rec };
  renderManual();
}

/** 覆盤：你每一次出牌，教練會怎麼打、你的選擇評價 */
function manualReviewSection(box) {
  const rec = manualReview.record;
  const rows = SeatRecord.review(rec, Advisor);
  const best = rows.filter((x) => x.verdict.verdict === 'best').length,
    worse = rows.filter((x) => x.verdict.verdict === 'worse');
  box.append(
    el(
      'p',
      'manual-summary',
      rows.length
        ? '共 ' +
            rows.length +
            ' 手出牌：和教練相同 ' +
            best +
            ' 手（' +
            Math.round((best / rows.length) * 100) +
            '%），明顯吃虧 ' +
            worse.length +
            ' 手。'
        : '這份記錄裡沒有你的出牌可以覆盤。',
    ),
  );
  for (const x of rows) {
    const row = el('div', 'manual-review-row ' + x.verdict.verdict);
    row.append(el('small', null, '第 ' + x.turn + ' 手'));
    row.append(Tiles.node(x.tile, 'xs'));
    if (x.decision.tile !== x.tile) {
      row.append(el('small', null, '教練：'));
      row.append(Tiles.node(x.decision.tile, 'xs'));
    }
    row.append(
      el(
        'small',
        null,
        x.verdict.verdict === 'best' ? '✓' : x.verdict.verdict === 'close' ? '可接受' : '明顯吃虧',
      ),
    );
    box.append(row);
    if (x.verdict.verdict !== 'best')
      box.append(el('p', 'manual-reason', x.verdict.reason || x.verdict.text));
  }
  const actions = el('div', 'record-actions');
  const dl = el('button', 'secondary-button', '下載這份記錄');
  dl.type = 'button';
  dl.onclick = () => downloadRecord(rec, 'mahjong-manual-' + (rec.createdAt || Date.now()));
  const close = el('button', 'secondary-button', '關閉覆盤');
  close.type = 'button';
  close.onclick = () => {
    manualReview = null;
    renderManual();
  };
  actions.append(dl, close);
  box.append(actions);
}

/** 匯入實戰記錄（record-panel 的匯入遇到 perspective: seat 時轉到這裡） */
function importManualText(text) {
  const r = SeatRecord.parse(text);
  if (r.error) {
    notify('無法匯入實戰記錄：' + r.error);
    return false;
  }
  manualReview = { record: r.record };
  renderManual();
  return true;
}

/** 牌局覆盤分頁的「實戰記錄」區 */
function renderManual() {
  const box = $('#manualPanel');
  if (!box || typeof SeatRecord === 'undefined') return;
  box.replaceChildren();
  box.append(el('h3', null, '實戰記錄'));
  if (manual === null) manual = readJSON(MANUAL_DRAFT_KEY, null);
  if (manualReview) return manualReviewSection(box);
  if (manual) return manual.stage === 'setup' ? manualSetup(box) : manualPlay(box);
  box.append(
    el(
      'p',
      'record-intro',
      '在實體牌桌或其他地方打的牌，可以一步步記下來（只記你看得到的：你的牌、四家打出的牌、吃碰槓、花、胡牌），打完讓教練逐手覆盤。',
    ),
  );
  const start = el('button', 'primary-button', '新增實戰記錄');
  start.type = 'button';
  start.onclick = () => {
    manual = {
      record: SeatRecord.create(),
      stage: 'setup',
      actor: 0,
      action: null,
      picked: [],
      flowerSeat: 0,
    };
    saveManualDraft();
    renderManual();
  };
  box.append(start);
  const list = readJSON(MANUAL_KEY, []);
  list.slice(0, 10).forEach((x) => {
    const row = el('div', 'record-row');
    const open = el('button', 'secondary-button', '覆盤');
    open.type = 'button';
    open.onclick = () => {
      manualReview = { record: x.record };
      renderManual();
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
      el('span', null, '實戰'),
      el('small', null, x.result || ''),
      open,
    );
    box.append(row);
  });
}
