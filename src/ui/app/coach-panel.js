'use strict';
// 教練欄：每一手的解說、吃碰槓比較、攻守取捨、讀牌筆記、胡牌台數與結算卡
function decisionCard(o) {
  const card = el('div', 'coach-option claim-detail');
  card.append(el('p', null, o.compact));
  if (o.after)
    card.append(
      el(
        'p',
        'defense-note',
        '吃碰後的出牌風險：' + Defense.describe(Defense.inspect(game, 0, o.after.tile)),
      ),
    );
  const more = el('details');
  more.append(el('summary', null, '看詳細計算與取捨'), el('p', null, o.text));
  card.append(more);
  return card;
}
function defenseCard(body) {
  const lead = currentExplain()?.best,
    options = lead ? [lead, ...suggestions.filter((o) => o !== lead)] : suggestions;
  const report = Defense.compare(game, options);
  if (!report) return;
  // 平常收起來；場況判斷認為要守或攻守兼顧時才展開
  const card = el('details', 'defense-card'),
    sit = currentSituation();
  card.open = !!sit && (sit.stance === 'fold' || sit.stance === 'balance');
  card.append(el('summary', null, '攻守取捨（組合排除）'), el('p', null, Defense.summary(game, options)));
  const t = selected === null ? report.guard.option.tile : game.hands[0][selected],
    risk = Defense.inspect(game, 0, t),
    details = el('details');
  details.append(el('summary', null, '看' + Coach.label(t) + '對三家的判斷'));
  for (const opponent of risk.opponents)
    details.append(
      el(
        'p',
        null,
        seats[opponent.player] +
          '：已固定 ' +
          opponent.groups +
          ' 組；' +
          (opponent.ways.length
            ? '尚可能以' +
              opponent.ways
                .map((w) => w.kind + '（持有' + w.needs.map(Coach.label).join('、') + '）')
                .join('、') +
              '胡這張。'
            : '已排除一般胡牌組合。'),
      ),
    );
  card.append(details);
  body.append(card);
}
function reviewCard(body) {
  if (!lastReview) return;
  const card = el('div', 'coach-last ' + lastReview.judge.verdict);
  const head = el('div', 'coach-last-head');
  head.append(
    el('span', 'coach-tag', lastReview.judge.verdict === 'best' ? '上一手 ✓' : '上一手回顧'),
    el('span', null, '你打出'),
    Tiles.node(lastReview.tile, 'xs'),
  );
  card.append(head, el('p', null, lastReview.judge.text));
  body.append(card);
}
function coach() {
  const body = $('#coachBody');
  body.replaceChildren();
  const title = el('h4'),
    copy = el('p');
  body.append(title, copy);
  if (game.phase === 'ended') {
    title.textContent = game.result;
    const ws = winScore();
    if (ws) body.append(scoreCard(ws));
    if (session.last) body.append(settleCard());
    body.append(fairnessCard());
    const good = turnLog.filter((x) => x.judge.verdict === 'best').length;
    body.append(copy);
    copy.textContent = turnLog.length
      ? '這局你出牌 ' +
        turnLog.length +
        ' 次，其中 ' +
        good +
        ' 次和教練首選相同。到「牌局覆盤」可以逐手回看差在哪裡。'
      : '可到牌局覆盤查看本局操作，或重新開始。';
    return;
  }
  if (!settings.coach && !peek) {
    title.textContent =
      game.phase === 'claim' && waiting()
        ? '有人出牌：自己決定吃碰槓胡或略過'
        : game.turn === 0
          ? '教練提示已關閉'
          : '等待' + seats[game.turn];
    copy.textContent =
      '專心打這一局；打完可到「牌局覆盤」逐手回放，看每一手和教練首選差在哪裡。需要時按「看提示」臨時看一次。';
    return;
  }
  if (game.phase === 'claim') {
    title.replaceChildren(
      el(
        'span',
        null,
        seats[game.pending.from] + (game.pending.kind === 'robkan' ? '加槓，是否搶胡？' : '打出 '),
      ),
      Tiles.node(game.pending.tile, 'sm'),
    );
    if (!waiting()) {
      copy.textContent = '你已完成回應，等待其他玩家決定。';
      return;
    }
    const decision = currentClaim();
    copy.textContent = decision.summary;
    if (
      game.passWater &&
      game.water &&
      game.water[0] &&
      E.winning([...game.hands[0], game.pending.tile], game.melds[0].length)
    )
      body.append(
        el(
          'p',
          'coach-option water-note',
          '過水中：你剛放過胡牌，自己打出一張牌之前不能胡別人打的牌（自摸不受影響）。',
        ),
      );
    decision.options.forEach((o) => body.append(decisionCard(o)));
    const b = decision.best;
    if (b && b.action.type === 'chi' && !game.melds[0].length && drawable() > 70)
      body.append(
        el(
          'p',
          'coach-option guide-note',
          '口訣提醒：開局幾圈先別急著吃兩面搭子——吃了就失去門清（1 台）與門清自摸（3 台）的機會，也讓上家知道你要什麼。這裡的首選只比牌效率。',
        ),
      );
    body.append(el('p', 'claim-limit', decision.limit));
    reviewCard(body);
    return;
  }
  if (game.turn !== 0) {
    title.textContent = '等待' + seats[game.turn];
    copy.hidden = true; // 這裡不需要說明段落
    situationSection(body, 1);
    reviewCard(body);
    readingCard(body);
    return;
  }
  if (game.phase === 'draw') {
    title.textContent = '輪到你摸牌';
    copy.hidden = true; // 這裡不需要說明段落
    situationSection(body, 1);
    reviewCard(body);
    readingCard(body);
    return;
  }
  if (E.winning(game.hands[0], game.melds[0].length)) {
    title.textContent = '可以自摸！';
    copy.textContent = '五組加一對已成立，按「胡牌」結束本局。';
    return;
  }
  for (const o of currentKans()) body.append(decisionCard(o));
  const ex = currentExplain();
  if (!ex) {
    title.textContent = '請選牌出牌';
    copy.hidden = true; // 這裡不需要說明段落
    return;
  }
  // 標題就是決策核心的最後建議；要守而和牌效率首選不同時，旁邊標出效率首選
  const best = ex.best,
    decision = currentDecision(),
    folding = !!decision && decision.folding;
  title.replaceChildren(
    el('span', null, folding ? '建議先守：打 ' : '建議打出 '),
    Tiles.node(decision ? decision.tile : best.tile, 'md'),
  );
  copy.className = 'coach-chips';
  copy.replaceChildren(
    ...(folding ? [el('span', 'chip', '只看效率會打 ' + Coach.label(best.tile))] : []),
    el('span', 'chip', best.shanten === 0 ? '打後聽牌' : '打後' + readiness(best.shanten)),
    el('span', 'chip', (best.shanten === 0 ? '可胡 ' : '有效牌 ') + best.remaining + ' 張'),
  );
  situationSection(body, 3);
  defenseCard(body);
  readingCard(body);
  const recommendedKan = currentKans().find((o) => o.recommend);
  if (recommendedKan) {
    title.replaceChildren(
      el('span', null, '建議先' + actionName[recommendedKan.action.type] + ' '),
      Tiles.node(recommendedKan.action.tile, 'md'),
    );
    copy.textContent = '先看上方槓／不槓比較；以下是選擇不槓時的出牌方案。';
  }
  // 牌效率的解說：前兩句（摸進的牌、為什麼是這張）直接看，其餘收進「牌效率細節」
  body.append(el('h5', null, recommendedKan ? '若不槓，這一手怎麼打' : '牌效率：為什麼是這張'));
  const list = el('ul', 'coach-lines');
  ex.lines.slice(0, 2).forEach((line) => list.append(el('li', null, line)));
  body.append(list);
  if (ex.lines.length > 2) {
    const more = el('details', 'coach-more'),
      rest = el('ul', 'coach-lines');
    ex.lines.slice(2).forEach((line) => rest.append(el('li', null, line)));
    more.append(el('summary', null, '牌效率細節（進張、結構、次佳打法）'), rest);
    body.append(more);
  }
  valueSection(body); // 胡牌率與台數（模擬，算好後自動更新）
  body.append(el('h5', null, best.shanten === 0 ? '聽的牌（未見張數）' : '打掉後的有效牌（未見張數）'));
  const outs = el('div', 'out-grid');
  best.outs.forEach((o) => {
    const cell = el('span', 'out');
    cell.append(Tiles.node(o.tile, 'xs'), el('b', null, String(o.remaining)));
    outs.append(cell);
  });
  body.append(outs);
  if (best.shanten === 0) {
    const rest = game.hands[0].slice();
    rest.splice(rest.indexOf(best.tile), 1);
    const est = tenpaiEstimate(
      rest,
      best.outs.map((o) => o.tile),
    );
    if (est) {
      body.append(el('h5', null, '聽牌台數預估（胡別人／自摸）'));
      body.append(est);
    }
  }
  body.append(el('h5', null, '打法比較'));
  const table = el('div', 'compare-table'),
    max = Math.max(1, ...suggestions.map((o) => o.remaining));
  const rows = [...ex.tied.slice(0, 2), ...suggestions.filter((o) => !ex.tied.includes(o)).slice(0, 3)];
  const pick = selected === null ? null : suggestions.find((o) => o.tile === game.hands[0][selected]);
  if (pick && !rows.includes(pick)) rows.push(pick);
  rows.forEach((o) => {
    const row = el(
      'div',
      'compare-row' +
        (Coach.same(o, best) ? ' top' : o.shanten > best.shanten ? ' behind' : '') +
        (pick === o ? ' picked' : ''),
    );
    const bar = el('span', 'bar'),
      fill = el('i');
    fill.style.width = Math.round((o.remaining / max) * 100) + '%';
    bar.append(fill);
    const seen = E.publicTiles(game).filter((x) => x === o.tile).length;
    row.append(
      Tiles.node(o.tile, 'xs'),
      el('span', 'rank', readiness(o.shanten)),
      bar,
      el('span', 'count', o.remaining + ' 張'),
      el('span', 'seen-tag' + (seen ? '' : ' fresh'), seen ? '熟 ' + seen : '生張'),
    );
    row.title = seen ? '場上已見 ' + seen + ' 張（熟張）' : '場上還沒出現過（生張），後期打要小心';
    table.append(row);
  });
  if (ex.tied.length > 2)
    table.append(
      el(
        'p',
        'compare-note',
        '並列最佳還有：' +
          ex.tied
            .slice(2)
            .map((o) => Coach.label(o.tile))
            .join('、'),
      ),
    );
  body.append(table);
  body.append(el('h5', null, '打掉後的手牌結構'));
  const groups = el('div', 'group-list');
  ex.structure.groups
    .slice()
    .sort((a, b) => groupOrder(a) - groupOrder(b))
    .forEach((g) => {
      const item = el('span', 'group ' + g.kind);
      item.append(tileRow(g.tiles), el('small', null, Coach.KIND[g.kind]));
      groups.append(item);
    });
  game.melds[0].forEach((m) => {
    const item = el('span', 'group meld');
    item.append(tileRow(m.tiles), el('small', null, '攤牌'));
    groups.append(item);
  });
  body.append(groups);
  if (pick) {
    const j = folding ? foldJudge(pick.tile, decision) : Coach.judge(suggestions, pick.tile, best);
    const card = el('div', 'coach-last ' + j.verdict),
      head = el('div', 'coach-last-head');
    head.append(el('span', 'coach-tag', '你選的牌'), Tiles.node(pick.tile, 'xs'));
    card.append(
      head,
      el(
        'p',
        null,
        j.text +
          (j.verdict === 'best'
            ? ''
            : ' ' + Coach.tileRole(game.hands[0], pick.tile, E.publicTiles(game), game.melds[0].length)),
      ),
    );
    body.append(card);
  }
  for (const text of Coach.patternHints(game.hands[0])) body.append(el('p', 'coach-option', text));
}
function groupOrder(g) {
  return ['seq', 'tri', 'head', 'ryanmen', 'kanchan', 'penchan', 'pair', 'single'].indexOf(g.kind);
}
function scoreCard(ws) {
  const card = el('div', 'score-card'),
    head = el('div', 'score-head');
  head.append(
    el('strong', null, (ws.winner === 0 ? '你' : seats[ws.winner]) + ' 胡牌'),
    el('span', 'score-total', ws.result.total + ' 台'),
  );
  card.append(head);
  const hand = el('div', 'score-hand');
  game.melds[ws.winner].forEach((m) => {
    const g = el('span', 'meld-group');
    m.tiles.forEach((t) => g.append(Tiles.node(t, 'xs')));
    hand.append(g);
  });
  const closed = el('span', 'meld-group');
  game.hands[ws.winner].forEach((t) => closed.append(Tiles.node(t, 'xs')));
  hand.append(closed);
  if (game.flowers[ws.winner].length) {
    const f = el('span', 'flower-group');
    game.flowers[ws.winner].forEach((t) => f.append(Tiles.node(t, 'xs')));
    hand.append(f);
  }
  card.append(hand);
  const list = el('ul', 'score-items');
  if (!ws.result.items.length) list.append(el('li', null, '沒有台數（屁胡），只算底。'));
  ws.result.items.forEach((x) => {
    const li = el('li');
    li.append(el('span', 'score-name', x.name), el('span', 'score-tai', x.tai + ' 台'));
    if (x.note) li.append(el('small', null, x.note));
    list.append(li);
  });
  card.append(list);
  if (ws.result.payer) card.append(el('p', 'score-payer', '付款：' + ws.result.payer));
  return card;
}
// 聽牌時預估每張胡牌的台數（放槍／自摸）
function tenpaiEstimate(rest, waits) {
  if (typeof Scoring === 'undefined') return null;
  const box = el('div', 'tai-estimate');
  waits.forEach((t) => {
    const g = { ...game, hands: game.hands.map((h, i) => (i === 0 ? [...rest, t] : h)), log: [...game.log] };
    const later = {
      anyDiscard: true,
      ownDiscards: 1,
      special: null,
      robKan: false,
      afterKan: false,
      lastTile: false,
    }; // 預估的是打出這張之後才胡，天地人胡不適用
    const ron = Scoring.score(g, 0, { ...later, tsumo: false, tile: t, from: null });
    const tsumo = Scoring.score(g, 0, { ...later, tsumo: true, tile: t, from: null });
    const row = el('span', 'estimate');
    row.title = Scoring.summary(ron);
    row.append(
      Tiles.node(t, 'xs'),
      el('b', null, '胡 ' + ron.total + ' 台'),
      el('small', null, '自摸 ' + tsumo.total + ' 台'),
    );
    box.append(row);
  });
  return box;
}
function settleCard() {
  const x = session.last,
    card = el('div', 'settle-card');
  card.append(el('h5', null, '本局結算（' + x.base + ' 底 ' + x.perTai + ' 台）'));
  if (x.payments.length)
    x.payments.forEach((y) =>
      card.append(
        el('p', null, (y.payer === 0 ? '你' : seats[y.payer]) + ' 付 ' + y.amount + '（' + y.tai + ' 台）'),
      ),
    );
  else card.append(el('p', null, '流局，沒有人付錢。'));
  const board = el('div', 'score-board');
  [0, 1, 2, 3].forEach((p) => {
    const cell = el('span', x.deltas[p] > 0 ? 'up' : x.deltas[p] < 0 ? 'down' : '');
    cell.append(
      el('b', null, p === 0 ? '你' : seats[p]),
      el('small', null, fmt(x.deltas[p]) + ' → ' + fmt(session.scores[p])),
    );
    board.append(cell);
  });
  card.append(board);
  const n = session.next;
  card.append(
    el(
      'p',
      'settle-next',
      x.dealerStays
        ? '莊家' + (x.winner === null ? '流局' : '胡牌') + '，連莊（下一局連 ' + n.streak + '）。'
        : '下莊，下一局由' +
            (n.dealer === 0 ? '你' : '你的' + REL[n.dealer]) +
            '當莊' +
            (n.round !== session.round ? '，進入' + WINDS[n.round] + '風圈' : '') +
            '。',
    ),
  );
  const go = document.createElement('button');
  go.className = 'primary-button next-hand';
  go.textContent = '下一局 ▶';
  go.onclick = () => {
    Object.assign(session, session.next);
    session.hand++;
    newHand();
  };
  card.append(go);
  return card;
}
// 讀牌筆記：依攤牌、牌河、摸切／手切整理三家的訊號（全部是公開資訊）
function readingCard(body) {
  if (game.phase === 'ended') return;
  const notes = [1, 2, 3].map((p) => ({ p, r: AI.reading(game, p), lv: AI.threat(game, p) }));
  // 重點已經寫在「場況判斷」裡，這裡是三家的完整筆記，預設收起來
  const box = el('details', 'reading-card');
  box.append(
    el(
      'summary',
      null,
      '讀牌筆記' +
        (notes.some((n) => n.lv >= 2) ? '：有人很可能聽牌' : notes.some((n) => n.lv) ? '：有人接近聽牌' : ''),
    ),
  );
  for (const { p, r, lv } of notes) {
    const facts = [];
    if (r.melds) facts.push('攤牌 ' + r.melds + ' 組');
    if (r.streak >= 2) facts.push('連續摸切 ' + r.streak + ' 次（手牌沒變，可能已聽牌）');
    if (r.recentHand.length) facts.push('最近手切 ' + r.recentHand.map(Coach.label).join('、'));
    if (r.oneSuit !== null)
      facts.push(
        '攤牌全是' + AI.SUITS[r.oneSuit] + '子：小心清一色／混一色，' + AI.SUITS[r.oneSuit] + '子與字牌危險',
      );
    else if (r.avoid !== null) facts.push('一直打' + AI.SUITS[r.avoid] + '子：多半不做這門');
    if (r.middleRun) facts.push('最近連打中張');
    const line = el('p', 'reading-line' + (lv >= 2 ? ' hot' : lv ? ' warm' : ''));
    line.append(
      el('b', null, seats[p] + (lv >= 2 ? '（很可能聽牌）' : lv ? '（可能接近聽牌）' : '')),
      el('span', null, facts.length ? facts.join('；') : '還看不出明顯訊號'),
    );
    box.append(line);
  }
  box.append(
    el(
      'small',
      null,
      '訊號只是推測：連續摸切也可能是牌不好、不想換；台灣麻將沒有「現物」保證，對手打過的牌仍然可能胡。',
    ),
  );
  body.append(box);
}
