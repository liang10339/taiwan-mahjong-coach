'use strict';
// 牌局覆盤：決策紀錄、逐手回放與歷史牌局
function decisionRecord(choice, options, summary, kind = 'claim') {
  return {
    kind,
    choice,
    at: game.log.length,
    tile: game.pending?.tile ?? choice.tile,
    summary,
    details: options.map((o) => o.compact).join('\n\n'),
  };
}
function resolutionText(x) {
  if (x.kind === 'skip-kan') return '未槓，已出牌。';
  const events = game.log.slice(x.at);
  if (x.kind === 'self-kan') {
    const result = events.find(
      (e) =>
        (e.action === 'ron' && e.robKan) ||
        (e.player === 0 && e.action === x.choice.type && e.tile === x.choice.tile),
    );
    if (result?.robKan) return '加槓遭搶胡，未補牌。';
    return result ? '已完成槓牌與補牌流程（無牌可補時流局）。' : '等待搶槓回應。';
  }
  const result = events.find((e) => e.action === 'resolution');
  if (!result) return '等待其他家回應。';
  if (x.choice.type === 'pass')
    return result.choice === 'pass'
      ? '全員略過，依序繼續。'
      : seats[result.player] + '取得' + (actionName[result.choice] || result.choice) + '。';
  return result.player === 0 && result.choice === x.choice.type
    ? '已取得' + actionName[x.choice.type] + '。'
    : '未取得：其他家的優先權較高。';
}
function renderReview() {
  const review = $('#reviewView .empty-review');
  review.replaceChildren();
  historyPanel(review);
  const ws = winScore();
  if (ws) review.append(scoreCard(ws));
  if (!reviewTimeline.length) {
    review.append(
      el('strong', null, '還沒有可覆盤的決策'),
      el('small', null, '出牌、吃碰槓與略過都會記錄當時的比較。'),
    );
    return;
  }
  const good = turnLog.filter((x) => x.judge.verdict === 'best').length,
    miss = turnLog.filter((x) => x.mistake).length;
  review.append(
    el(
      'p',
      'review-summary',
      '你出牌 ' +
        turnLog.length +
        ' 次，其中 ' +
        good +
        ' 次與教練首選相同；標記為關鍵失誤 ' +
        miss +
        ' 次（依當時速度與防守的綜合評估）。合理替代選擇不算錯誤；局後輸贏不改寫當時評分。',
    ),
  );
  replayPanel(review);
  reviewTimeline.forEach((x, i) => {
    if (x.kind) {
      const item = el('div', 'review-item claim-detail');
      const chosenTiles = ['chi', 'pon', 'kan'].includes(x.choice.type)
        ? [...x.choice.tiles, x.tile]
            .sort((a, b) => a - b)
            .map(Coach.label)
            .join('、')
        : x.tile == null
          ? ''
          : Coach.label(x.tile);
      item.append(
        el(
          'strong',
          null,
          i + 1 + '. ' + (x.choice.type === 'pass' ? '略過' : actionName[x.choice.type]) + ' ' + chosenTiles,
        ),
        el('p', null, x.summary),
        el('p', null, resolutionText(x)),
      );
      const details = el('details');
      details.append(el('summary', null, '當時行動／略過比較'), el('p', null, x.details));
      item.append(details);
      review.append(item);
      return;
    }
    const item = el('div', 'review-item ' + x.judge.verdict + (x.mistake ? ' mistake' : '')),
      head = el('div', 'review-head');
    head.append(
      el('span', 'review-turn', (x.mistake ? '⚠ ' : '') + '第 ' + (i + 1) + ' 手'),
      el('span', null, '摸'),
      x.drawn == null ? el('span', null, '—') : Tiles.node(x.drawn, 'xs'),
      el('span', null, '打'),
      Tiles.node(x.tile, 'xs'),
      el('span', 'verdict', x.judge.verdict === 'best' ? '✓ 與教練相同' : '教練建議'),
      ...(x.judge.verdict === 'best' ? [] : [Tiles.node(x.best, 'xs')]),
    );
    item.append(head, el('p', null, x.judge.text + (x.reason ? ' ' + x.reason : '')));
    if (x.defense) item.append(el('p', 'defense-note', '這張的放槍風險：' + x.defense));
    review.append(item);
  });
  const log = el('details', 'review-log');
  log.append(el('summary', null, '完整動作紀錄'));
  game.log
    .filter((e) => e.action !== 'draw')
    .forEach((e, i) =>
      log.append(
        el(
          'div',
          null,
          i +
            1 +
            '. ' +
            seats[e.player] +
            ' ' +
            (e.action === 'response'
              ? '選擇' + (actionName[e.choice] || '略過')
              : e.action === 'resolution'
                ? '回應結果：' + (actionName[e.choice] || '全員略過')
                : e.action === 'added-attempt'
                  ? '嘗試加槓'
                  : e.robKan
                    ? '搶槓胡'
                    : actionName[e.action] || '打') +
            ' ' +
            tile(e.tile),
        ),
      ),
    );
  review.append(log);
}
// 歷史牌局：最近 30 局的摘要（本機）
function historyPanel(root) {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem('mahjong-coach-history') || '[]');
  } catch (e) {}
  if (!list.length) return;
  const box = el('details', 'history-card');
  box.append(el('summary', null, '歷史牌局（最近 ' + list.length + ' 局）'));
  const total = list.reduce((n, x) => n + x.delta, 0),
    miss = list.reduce((n, x) => n + x.mistakes, 0),
    turns = list.reduce((n, x) => n + x.turns, 0),
    good = list.reduce((n, x) => n + x.good, 0);
  box.append(
    el(
      'p',
      'history-sum',
      '累計 ' +
        fmt(total) +
        '；出牌與教練首選相同 ' +
        (turns ? Math.round((good / turns) * 100) : 0) +
        '%；關鍵失誤 ' +
        miss +
        ' 次',
    ),
  );
  list.slice(0, 12).forEach((x) => {
    const row = el('div', 'history-row' + (x.delta > 0 ? ' up' : x.delta < 0 ? ' down' : ''));
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
      el('span', null, x.result + (x.tai ? '・' + x.tai + ' 台' : '')),
      el('b', null, fmt(x.delta)),
      el('small', null, '失誤 ' + x.mistakes),
    );
    box.append(row);
  });
  root.append(box);
}
// 逐手回放：每一手的手牌快照、實際打出與教練首選；可只看關鍵失誤
function replayPanel(root) {
  const list = turnLog.filter((x) => x.snapshot && (!replayMistakes || x.mistake));
  const box = el('section', 'replay');
  root.append(box);
  const bar = el('div', 'replay-bar');
  box.append(bar);
  bar.append(el('strong', null, '逐手回放'));
  const only = el(
    'button',
    'secondary-button' + (replayMistakes ? ' on' : ''),
    replayMistakes ? '顯示全部' : '只看關鍵失誤',
  );
  only.onclick = () => {
    replayMistakes = !replayMistakes;
    replayIndex = 0;
    renderReview();
  };
  if (!list.length) {
    bar.append(only);
    box.append(el('p', null, replayMistakes ? '這局沒有關鍵失誤。' : '出牌後就能逐手回放。'));
    return;
  }
  replayIndex = Math.min(replayIndex, list.length - 1);
  const x = list[replayIndex],
    prev = el('button', 'secondary-button', '◀ 上一手'),
    next = el('button', 'secondary-button', '下一手 ▶');
  prev.disabled = replayIndex === 0;
  next.disabled = replayIndex === list.length - 1;
  prev.onclick = () => {
    replayIndex--;
    renderReview();
  };
  next.onclick = () => {
    replayIndex++;
    renderReview();
  };
  bar.append(prev, el('span', 'replay-count', replayIndex + 1 + ' / ' + list.length), next, only);
  const n = turnLog.indexOf(x) + 1,
    snap = x.snapshot;
  box.append(
    el(
      'p',
      'replay-head',
      (x.mistake ? '⚠ 關鍵失誤・' : '') +
        '你的第 ' +
        n +
        ' 次出牌（牌牆剩 ' +
        snap.wall +
        ' 張）' +
        (x.drawn == null ? '' : '，摸進 ' + Coach.label(x.drawn)),
    ),
  );
  const hand = el('div', 'replay-hand'),
    pickAt = snap.hand.indexOf(x.tile),
    bestAt = x.best === x.tile ? -1 : snap.hand.indexOf(x.best);
  snap.hand.forEach((t, i) => {
    const n = Tiles.node(t, 'sm');
    if (i === pickAt) n.classList.add('picked');
    if (i === bestAt) n.classList.add('best');
    hand.append(n);
  });
  box.append(el('small', 'replay-legend', '紅框：你打出的牌　綠框：教練首選'));
  box.append(hand);
  box.append(
    el(
      'p',
      null,
      '你' +
        (x.cut ? cutName(x.cut) : '打') +
        ' ' +
        Coach.label(x.tile) +
        (x.best === x.tile ? '，與教練首選相同。' : '；教練首選 ' + Coach.label(x.best) + '。') +
        ' ' +
        x.judge.text,
    ),
  );
  if (x.warning) box.append(el('p', 'defense-note', x.warning));
  const opts = el('div', 'compare-table');
  snap.options.forEach((o) => {
    const row = el(
      'div',
      'compare-row' + (o.tile === x.best ? ' top' : '') + (o.tile === x.tile ? ' picked' : ''),
    );
    row.append(
      Tiles.node(o.tile, 'xs'),
      el('span', 'rank', readiness(o.shanten)),
      el('span', 'count', o.remaining + ' 張'),
    );
    opts.append(row);
  });
  box.append(opts);
  const rivers = el('details', 'replay-rivers');
  rivers.append(el('summary', null, '當時的牌河'));
  snap.rivers.forEach((r, p) => {
    const row = el('div', 'river-line');
    row.append(el('small', null, p === 0 ? '你' : seats[p]));
    r.forEach((t) => row.append(Tiles.node(t, 'xs')));
    rivers.append(row);
  });
  box.append(rivers);
}
