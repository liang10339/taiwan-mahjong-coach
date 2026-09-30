'use strict';
// 牌桌畫面：手牌、牌河、四家牌架與攤牌、出牌動畫、吃碰槓按鈕
// 依出牌順序還原桌上的牌（被吃碰槓胡拿走的牌不留在桌上）
function discardPile() {
  const pile = [];
  for (const e of game.log) {
    if (e.action === 'discard') pile.push({ tile: e.tile, player: e.player, cut: e.cut || 'hand' });
    else if (['chi', 'pon', 'kan', 'ron'].includes(e.action) && !e.robKan) pile.pop();
  }
  return pile;
}
// 散落模式：像真的牌桌一樣丟在中間一堆；位置與角度依序號固定，不會每次重畫亂跳
function scatter(i) {
  const hash = (n) => {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const angle = i * 2.39996 + hash(i) * 0.9,
    radius = Math.sqrt(i + 0.6) / Math.sqrt(96);
  return {
    x: Math.cos(angle) * Math.min(radius, 1.08) + (hash(i + 7) - 0.5) * 0.12,
    y: Math.sin(angle) * Math.min(radius, 1.08) + (hash(i + 13) - 0.5) * 0.14,
    rot: (hash(i + 29) - 0.5) * 70,
  };
}
// ---- 出牌動畫：從牌實際所在的位置飛進牌河，一眼看出摸切、手切、空切 ----
// 摸切：最右邊隔開的那張（剛摸進）直接飛出，其他牌不動。
// 手切／空切：從手牌中間抽出一張飛出，後面的牌補位，剛摸的那張滑進手牌。（空切看起來就是手切）
function rectsOf(box) {
  return box && box.children
    ? [...box.children].map((n) => (n.getBoundingClientRect ? n.getBoundingClientRect() : null))
    : [];
}
function rackBox(p) {
  return p === 0 ? $('#hand') : $('[data-seat="' + p + '"]');
}
function snapshot(p) {
  return { p, rects: rectsOf(rackBox(p)), log: game.log.length };
}
// 左右兩家的牌架有旋轉，螢幕上的位移要換成牌架自己的方向
function local(p, dx, dy) {
  return p === 3 ? [-dy, dx] : p === 1 ? [dy, -dx] : [dx, dy];
}
function slideFrom(box, oldRects, p, delay = 0) {
  if (!motionOK() || !box || !box.children) return;
  [...box.children].forEach((node, i) => {
    const o = oldRects[i];
    if (!o || !node.animate || !node.getBoundingClientRect) return;
    const r = node.getBoundingClientRect(),
      [dx, dy] = local(p, o.left - r.left, o.top - r.top);
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    node.animate(
      [
        { transform: 'translate(' + dx + 'px,' + dy + 'px)' },
        { transform: 'translate(' + dx + 'px,' + dy + 'px)', offset: delay ? 0.35 : 0 },
        { transform: 'none' },
      ],
      { duration: delay ? 620 : 300, easing: 'ease-out' },
    );
  });
}
function animateDiscard(snap) {
  if (!snap || !motionOK()) return;
  const e = game.log.slice(snap.log).find((x) => x.action === 'discard' && x.player === snap.p);
  if (!e) return;
  const old = snap.rects,
    n = old.length;
  if (!n || !old[0]) return;
  // 抽出的是第幾張：自己的就是點的那張；別家摸切是最右邊，手切／空切從中間某張抽（別人看不到是哪張）
  const from =
    snap.p === 0
      ? snap.index
      : e.cut === 'tsumo'
        ? n - 1
        : Math.max(0, Math.min(n - 2, Math.floor(n / 2) + ((e.tile * 5 + snap.log) % 5) - 2));
  const src = old[from],
    target = $('#discardRiver .latest'),
    hand = e.cut !== 'tsumo';
  if (src && target && target.animate && target.getBoundingClientRect) {
    const r = target.getBoundingClientRect(),
      dx = src.left + src.width / 2 - (r.left + r.width / 2),
      dy = src.top + src.height / 2 - (r.top + r.height / 2),
      rot = +((target.dataset && target.dataset.rot) || 0),
      sc = (src.width / r.width || 1).toFixed(2);
    const frames = hand
      ? [
          { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')', offset: 0 },
          { transform: 'translate(' + dx + 'px,' + (dy - 30) + 'px) scale(' + sc + ')', offset: 0.3 },
          { transform: 'rotate(' + rot + 'deg)' },
        ] // 手切：先從牌列中抽起，再飛出
      : [
          { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ')' },
          { transform: 'rotate(' + rot + 'deg)' },
        ]; // 摸切：直接丟出
    target.animate(frames, { duration: hand ? 680 : 380, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }
  // 剩下的牌補位：舊位置 i 對應新位置（抽走的那張之後往左移一格）
  slideFrom(
    rackBox(snap.p),
    [...Array(Math.max(0, n - 1))].map((_, i) => old[i < from ? i : i + 1]),
    snap.p,
    hand ? 1 : 0,
  );
}
// 別家的空切看起來和手切一樣，只有自己的空切另外標示
function cutShown(p, cut) {
  return cut === 'empty' && p !== 0 ? 'hand' : cut;
}
function cutName(c) {
  return c === 'tsumo' ? '摸切' : c === 'empty' ? '空切' : '手切';
}
/** 散落牌堆已經畫在桌上的牌：只補上新打出的，不整堆重畫（每次重畫約 60 張牌 SVG 很耗時） */
let pileView = { base: '', pile: [], nodes: [], caption: null };
function renderRiver() {
  const river = $('#discardRiver');
  river.classList.toggle('neat', neatRiver);
  river.classList.toggle('show-cuts', !!settings.showCuts);
  if (neatRiver) {
    pileView.base = '';
    river.replaceChildren();
    const lastDiscard = discardPile().at(-1);
    game.rivers.forEach((tiles, p) => {
      const section = el('div', 'river-group');
      section.append(el('strong', null, seats[p]));
      const box = el('div', 'river-tiles');
      tiles.forEach((t, i) => {
        const n = Tiles.node(t, 'sm'),
          c = cutShown(p, (game.cuts && game.cuts[p] && game.cuts[p][i]) || 'hand');
        n.classList.add('cut-' + c);
        if (lastDiscard && lastDiscard.player === p && i === tiles.length - 1) n.classList.add('latest');
        n.title = cutName(c) + ' ' + Coach.label(t);
        box.append(n);
      });
      section.append(box);
      river.append(section);
    });
    return;
  }
  renderPile(river, discardPile());
}
/**
 * 牌河區的大小。只在大小真的改變時量（ResizeObserver），不在每次重畫時讀 clientWidth：
 * 重畫手牌後馬上讀尺寸會逼瀏覽器立刻重算整頁版面，是每次重畫最耗時的一步。
 */
let riverSize = null;
function measureRiver(river) {
  if (!riverSize) riverSize = { w: river.clientWidth || 420, h: river.clientHeight || 240 };
  return riverSize;
}
function watchRiverSize() {
  if (typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (!width || (riverSize && riverSize.w === width && riverSize.h === height)) return;
    riverSize = { w: width, h: height };
    renderRiver(); // 牌桌大小變了（例如手機轉向），整堆重排
  }).observe($('#discardRiver'));
}
function renderPile(river, pile) {
  const size = measureRiver(river),
    w = size.w / 2 - 18,
    h = size.h / 2 - 22;
  // 換局、換座位名稱或牌桌大小改變，或有牌被吃碰拿走時，才整堆重畫
  const base = generation + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + seats.join();
  const prefix =
    pileView.base === base &&
    pileView.pile.length <= pile.length &&
    pileView.pile.every((d, i) => d.tile === pile[i].tile && d.player === pile[i].player);
  if (!prefix) {
    river.replaceChildren();
    pileView = { base, pile: [], nodes: [], caption: null };
  }
  for (let i = pileView.pile.length; i < pile.length; i++) {
    const d = pile[i],
      node = Tiles.node(d.tile, 'sm'),
      pos = scatter(i);
    node.classList.add('pile-tile', 'cut-' + cutShown(d.player, d.cut));
    node.style.left = Math.round(w + pos.x * w) + 'px';
    node.style.top = Math.round(h + pos.y * h) + 'px';
    node.style.setProperty?.('--rot', pos.rot.toFixed(1) + 'deg');
    if (node.dataset) node.dataset.rot = pos.rot.toFixed(1);
    node.title = seats[d.player] + cutName(cutShown(d.player, d.cut)) + ' ' + Coach.label(d.tile);
    river.append(node);
    pileView.pile.push(d);
    pileView.nodes.push(node);
  }
  pileView.nodes.forEach((n, i) => n.classList.toggle('latest', i === pileView.nodes.length - 1));
  // 最上方的說明「某家打出某張」
  if (pileView.caption) pileView.caption.remove?.();
  pileView.caption = null;
  if (pile.length && game.phase !== 'ended') {
    const last = pile[pile.length - 1];
    pileView.caption = el('span', 'pile-caption', seats[last.player] + '打出 ' + Coach.label(last.tile));
    river.append(pileView.caption);
  }
}
/** 手牌下方只說「你」現在該做什麼；全桌狀態顯示在牌桌右上角 */
function myStatus() {
  if (game.phase === 'ended') return game.result;
  if (game.phase === 'claim') return waiting() ? '有人出牌：決定吃碰槓胡，或略過' : '等待其他家回應';
  if (game.turn === 0) return game.phase === 'draw' ? '輪到你：請摸牌' : '輪到你：請出牌';
  return '等待' + seats[game.turn] + (game.phase === 'draw' ? '摸牌' : '出牌');
}
function render() {
  const mine = game.turn === 0,
    choosing = mine && game.phase === 'discard';
  const ws = winScore(),
    status =
      game.phase === 'ended'
        ? game.result + (ws ? '・' + ws.result.total + ' 台' : '')
        : game.phase === 'claim'
          ? game.pending.kind === 'robkan'
            ? '加槓確認：等待搶槓胡或略過'
            : '有人出牌：請選擇吃碰槓胡或略過'
          : seats[game.turn] + (game.phase === 'draw' ? '：請摸牌' : '：請出牌');
  $('#turnStatus').textContent = status;
  $('#wallCount').textContent = drawable();
  $('.player-label small').textContent = myStatus();
  const drawnAt =
    choosing && lastDrawn !== null && game.hands[0][game.hands[0].length - 1] === lastDrawn
      ? game.hands[0].length - 1
      : -1;
  $('#phaseHelp').textContent = !choosing
    ? myStatus()
    : selected !== null && drawnAt >= 0 && selected !== drawnAt && game.hands[0][selected] === lastDrawn
      ? '空切：打出手中和剛摸進相同的' + tile(lastDrawn) + '，別人看起來像手切，不會知道你摸到什麼。'
      : selected === drawnAt && drawnAt >= 0
        ? '摸切：直接打出剛摸進的牌（最右邊標「摸」），別人會看出你的手牌沒變。'
        : '點一張牌選取，再點一次（或按「確認出牌」、Enter）就打出。← → 可換選牌。';
  $('#drawButton').disabled = !(mine && game.phase === 'draw');
  $('#drawButton').textContent = '摸牌';
  $('#discardButton').disabled = !choosing || selected === null;
  $('#winButton').disabled = !choosing || !E.winning(game.hands[0], game.melds[0].length, game.rules);
  $('#sortButton').disabled = false; // 隨時都可以整理手牌
  $('#askSelected').disabled = !choosing || selected === null;
  $('#askAnswer').textContent = '';
  if (game.phase === 'ended' && !session.settled) finishHand();
  renderSeats();
  renderClaims();
  const hand = $('#hand');
  hand.replaceChildren();
  const risk = settings.danger && choosing ? dangerMap() : null;
  const own = game.hands[0],
    justDrew = choosing && lastDrawn !== null && own[own.length - 1] === lastDrawn;
  own.forEach((t, i) => {
    const b = document.createElement('button');
    b.className =
      'tile mj mj-lg' +
      (selected === i ? ' selected' : '') +
      (justDrew && i === own.length - 1 ? ' drawn' : '');
    Tiles.fill(b, t);
    b.setAttribute('aria-label', tile(t) + '，第 ' + (i + 1) + ' 張');
    b.setAttribute('aria-pressed', String(selected === i));
    b.title = Coach.label(t);
    if (risk) {
      const r = risk[t];
      b.className += ' risk-' + r.level;
      b.title += '・危險度：' + r.text;
      b.append(el('i', 'risk-dot'));
    }
    b.disabled = !choosing;
    b.onclick = () => {
      if (selected === i) {
        $('#discardButton').onclick();
        return;
      }
      selected = i;
      if (typeof Sound !== 'undefined') Sound.play('select');
      render();
    };
    hand.append(b);
  });
  renderRiver();
  $$('[data-seat]').forEach((box) => {
    const p = +box.dataset.seat,
      fresh = game.phase === 'discard' && game.turn === p && game.fresh && game.fresh.player === p;
    box.replaceChildren(
      ...game.hands[p].map((_, i, a) => {
        const b = Tiles.back('xs');
        if (fresh && i === a.length - 1) b.classList.add('drawn-slot');
        return b;
      }),
    );
    box.title = seats[p] + '手牌 ' + game.hands[p].length + ' 張';
  });
  $$('[data-meld-seat]').forEach((box) => {
    const p = +box.dataset.meldSeat,
      items = [];
    game.melds[p].forEach((m) => {
      const g = el('span', 'meld-group');
      g.title = actionName[m.type];
      m.tiles.forEach((t, i) =>
        g.append(
          m.type === 'concealed' && (p !== 0 || i === 0 || i === 3) ? Tiles.back('sm') : Tiles.node(t, 'sm'),
        ),
      );
      items.push(g);
    });
    if (game.flowers[p].length) {
      const f = el('span', 'flower-group');
      f.title = '補花';
      game.flowers[p].forEach((t) => f.append(Tiles.node(t, 'xs')));
      items.push(f);
    }
    box.replaceChildren(...items);
  });
  coach();
  if (currentMode === 'review') renderReview(); // 覆盤頁看不到時不重畫，切過去時才畫
  soundEvents();
  persistGame(); // 自動保存，重新整理或更新後可以接著打
}
function updateSeats() {
  for (let p = 0; p < 4; p++) {
    const w = WINDS[E.seatWind(game, p)],
      d = p === game.dealer;
    seats[p] = p === 0 ? '你（' + w + '家' + (d ? '・莊家' : '') + '）' : w + '家' + (d ? '（莊）' : '');
  }
}
function roundName() {
  return (
    WINDS[session.round] +
    '風' +
    WINDS[(((game.dealer - session.firstDealer) % 4) + 4) % 4] +
    '局' +
    (game.streak ? '・連' + game.streak : '')
  );
}
function renderSeats() {
  $('#roundWind').textContent = WINDS[session.round];
  $('#roundName').textContent = roundName();
  $('#wallCount').textContent = drawable();
  for (const p of [1, 2, 3]) {
    const r = AI.reading(game, p);
    $('#seatInfo' + p).textContent =
      WINDS[E.seatWind(game, p)] +
      '家・' +
      REL[p] +
      (p === game.dealer ? '・莊' : '') +
      '｜' +
      fmt(session.scores[p]) +
      '';
    void r;
  }
  $('#myInfo').textContent = '我的手牌｜' + fmt(session.scores[0]) + (game.dealer === 0 ? '・莊' : '');
}
function renderClaims() {
  const target = $('#claimActions');
  target.replaceChildren();
  if (game.phase === 'ended' && session.next) {
    const b = document.createElement('button');
    b.className = 'primary-button next-hand';
    b.textContent = '下一局 ▶';
    b.onclick = () => {
      Object.assign(session, session.next);
      session.hand++;
      newHand();
    };
    target.append(b);
    return;
  }
  if (waiting()) {
    /** @type {{type: string, tiles?: number[]}[]} 可以做的動作，最後加上「略過」 */
    const actions = [...E.claims(game, 0), { type: 'pass' }];
    for (const a of actions) {
      const button = document.createElement('button');
      button.className = 'secondary-button';
      button.textContent =
        a.type === 'pass' ? '略過（不吃碰槓胡）' : actionName[a.type] + ' ' + a.tiles.map(tile).join(' ');
      button.onclick = () => {
        const report = currentClaim(),
          record = decisionRecord(a, report.options, report.summary),
          couldWin = a.type === 'pass' && E.claims(game, 0).some((x) => x.type === 'ron');
        if (E.respond(game, 0, a)) {
          if (couldWin && game.passWater)
            notify('你放過了胡牌：過水中，自己打出一張牌之前不能胡別人打的牌。');
          reviewTimeline.push(record);
          selected = null;
          lastDrawn = null;
          analyze();
          render();
          computers();
        }
      };
      target.append(button);
    }
  } else
    for (const a of E.selfKans(game, 0)) {
      const button = document.createElement('button');
      button.className = 'secondary-button';
      button.textContent = actionName[a.type] + ' ' + tile(a.tile);
      button.onclick = () => {
        const options = currentKans(),
          chosen = options.find((o) => JSON.stringify(o.action) === JSON.stringify(a)),
          record = decisionRecord(a, options, chosen?.compact || '', 'self-kan');
        record.tile = a.tile;
        if (E.selfKan(game, 0, a)) {
          reviewTimeline.push(record);
          selected = null;
          lastDrawn = null;
          analyze();
          render();
          computers();
        }
      };
      target.append(button);
    }
}
// 量測實際牌桌外框，避免標題、字型或視窗寬度改變後錯位。
function setupCoachSize() {
  if (typeof ResizeObserver === 'undefined') return;
  const table = $('.mahjong-table'),
    column = $('.table-column'),
    card = $('.coach-card');
  const sync = () => {
    const rect = table.getBoundingClientRect(),
      parent = column.getBoundingClientRect();
    if (rect.height) {
      card.style.setProperty('--table-height', rect.height + 'px');
      card.style.setProperty('--table-offset', rect.top - parent.top + 'px');
    }
  };
  const observer = new ResizeObserver(sync);
  observer.observe(table);
  observer.observe(column);
  sync();
}
