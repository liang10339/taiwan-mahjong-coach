'use strict';
// 牌局流程：電腦輪流、摸打按鈕、開新局與結算、音效事件、問教練、鍵盤操作
// 依牌局紀錄播放音效與喊牌
function soundEvents() {
  if (typeof Sound === 'undefined') return;
  const fresh = game.log.slice(heard.log);
  heard.log = game.log.length;
  const calls = { chi: '吃', pon: '碰', kan: '槓', concealed: '槓', added: '槓', ron: '胡' };
  for (const e of fresh) {
    if (e.action === 'draw' && e.player === 0) Sound.play('draw');
    else if (e.action === 'discard') {
      Sound.play('discard');
      Sound.say(Sound.tileName(e.tile));
    } else if (calls[e.action]) {
      Sound.play(e.action === 'ron' ? 'win' : 'claim');
      Sound.say(calls[e.action]);
    }
  }
  if (game.phase === 'ended' && heard.phase !== 'ended') {
    if (/自摸/.test(game.result)) {
      Sound.play(game.turn === 0 ? 'win' : 'lose');
      Sound.say('自摸');
    } else if (/流局/.test(game.result)) Sound.play('lose');
    else if (!fresh.some((e) => e.action === 'ron')) Sound.play(game.turn === 0 ? 'win' : 'lose');
  }
  heard.phase = game.phase;
}
function computers() {
  if (game.phase === 'claim') {
    for (let p = 1; p < 4 && game.phase === 'claim'; p++)
      if (!game.pending.decisions[p]) {
        const choice = AI.chooseClaim(game, p, settings.level);
        E.respond(game, p, choice);
      }
    analyze();
    render();
    if (game.phase === 'claim') return;
  }
  if (game.phase === 'ended' || game.turn === 0) return;
  const epoch = generation;
  timer = setTimeout(() => {
    if (epoch !== generation) return;
    const snap = game.phase === 'discard' ? snapshot(game.turn) : null;
    AI.act(game, game.turn, settings.level);
    render();
    animateDiscard(snap);
    computers();
  }, 700);
}
$('#drawButton').onclick = () => {
  if (E.draw(game, 0)) {
    selected = null;
    lastDrawn = game.log[game.log.length - 1].tile;
    analyze();
  }
  render();
};
$('#discardButton').onclick = () => {
  if (selected === null || game.phase !== 'discard' || game.turn !== 0) return;
  const t = game.hands[0][selected],
    ex = currentExplain(),
    best = ex ? ex.best : suggestions[0];
  const kans = currentKans(),
    skipped = kans.length
      ? decisionRecord({ type: 'pass' }, kans, '未槓，選擇打' + tile(t), 'skip-kan')
      : null;
  const record = best
    ? {
        tile: t,
        drawn: lastDrawn,
        best: best.tile,
        judge: Coach.judge(suggestions, t, best),
        reason: Coach.tileRole(game.hands[0], best.tile, E.publicTiles(game), game.melds[0].length),
      }
    : null;
  if (record) {
    record.defense = Defense.describe(Defense.inspect(game, 0, t));
    const pick = suggestions.find((o) => o.tile === t),
      lost = pick ? best.remaining - pick.remaining : 0;
    record.mistake = !!pick && (pick.shanten > best.shanten || lost >= 4);
    record.warning = !record.mistake
      ? ''
      : pick.shanten > best.shanten
        ? '這張打掉退了一步：' +
          readiness(best.shanten) +
          ' 變成 ' +
          readiness(pick.shanten) +
          '（建議打' +
          tile(best.tile) +
          '）'
        : '這張打掉損失了 ' + lost + ' 張進張（建議打' + tile(best.tile) + '）';
    record.snapshot = {
      hand: game.hands[0].slice(),
      melds: game.melds.map((ms) => ms.map((m) => ({ ...m, tiles: m.tiles.slice() }))),
      rivers: game.rivers.map((r) => r.slice()),
      wall: game.wall.length,
      options: suggestions
        .slice(0, 4)
        .map((o) => ({ tile: o.tile, shanten: o.shanten, remaining: o.remaining })),
    };
    if (record.mistake) rememberMistake(t); // 存進錯題本（牌還在手上時存，才是當時的局面）
  }
  const snap = snapshot(0);
  snap.index = selected;
  if (E.discard(game, 0, selected)) {
    if (skipped) reviewTimeline.push(skipped);
    const cut = (
      game.log.findLast
        ? game.log.findLast((e) => e.action === 'discard' && e.player === 0)
        : [...game.log].reverse().find((e) => e.action === 'discard' && e.player === 0)
    )?.cut;
    if (record) {
      record.cut = cut;
      turnLog.push(record);
      reviewTimeline.push(record);
      lastReview = record;
      if (record.warning && settings.coach)
        notify('⚠ ' + record.warning + (cut === 'empty' ? '　・你這手是空切，別家看起來是手切' : ''));
      else if (cut === 'empty') notify('空切：你打出手中的' + tile(record.tile) + '，別家看起來是手切。');
    }
    selected = null;
    lastDrawn = null;
    suggestions = [];
    peek = false;
    render();
    animateDiscard(snap);
    computers();
  }
};
$('#winButton').onclick = () => {
  if (E.win(game, 0)) {
    clearTimeout(timer);
    render();
  }
};
// 整理手牌：隨時可按；剛摸進、還沒打的那張留在最右邊，其餘排序（有動畫）
$('#sortButton').onclick = () => {
  const h = game.hands[0],
    keep = game.phase === 'discard' && game.turn === 0 && lastDrawn !== null && h[h.length - 1] === lastDrawn;
  const before = rectsOf($('#hand')),
    order = h.map((t, i) => ({ t, i }));
  const rest = keep ? order.slice(0, -1) : order.slice();
  rest.sort((a, b) => a.t - b.t || a.i - b.i);
  const next = keep ? [...rest, order[order.length - 1]] : rest;
  game.hands[0] = next.map((x) => x.t);
  selected = null;
  render();
  slideFrom(
    $('#hand'),
    next.map((x) => before[x.i]),
    0,
  );
};
$('#resetButton').onclick = () => newMatch();
$('#hintButton').onclick = () => {
  peek = true;
  analyze();
  coach();
};
// 新的一將：抓位（四張風牌蓋著洗，你抽一張）決定座位，抽到東的人當莊
function newMatch() {
  // 完整開局：先讓你親手抽風牌決定座位
  if (settings.opening === 'full' && settings.seatDraw) {
    runSeatDraw((w) => startMatch(w));
    return;
  }
  startMatch(settings.seatDraw ? Math.floor(Math.random() * 4) : null);
}
/** 以抽到的風（0 東…3 北；null 表示不抓位、你坐東）開始新的一將 */
function startMatch(w) {
  let dealer = 0,
    msg = '';
  if (w !== null) {
    dealer = (4 - w) % 4;
    msg =
      '抓位：你抽到「' +
      WINDS[w] +
      '」，坐' +
      WINDS[w] +
      '位' +
      (w ? '；東位的' + REL[dealer] + '當莊。' : '，由你當莊。');
  }
  session = {
    firstDealer: dealer,
    dealer,
    round: 0,
    streak: 0,
    hand: 1,
    scores: [0, 0, 0, 0],
    settled: false,
    last: null,
    next: null,
  };
  newHand(msg);
}
function newHand(msg = '') {
  generation++;
  clearTimeout(timer);
  const dealt = dealGame(); // 一般是隨機洗牌；從分享連結來的就用同一副牌
  game = dealt.game;
  if (dealt.shared && !msg) msg = '這是分享的牌局：配牌與牌牆都和分享者相同。';
  saveSession();
  session.settled = false;
  session.last = null;
  session.next = null;
  scoreCache = { log: -1, value: null };
  selected = null;
  suggestions = [];
  lastDrawn = null;
  turnLog = [];
  reviewTimeline = [];
  lastReview = null;
  peek = false;
  replayIndex = 0;
  resetSituation();
  heard = { log: 0, phase: game.phase };
  if (typeof Sound !== 'undefined') {
    Sound.stop();
    Sound.play('shuffle');
  }
  updateSeats();
  render();
  // 完整開局：演示擲骰、開門、配牌、補花之後才開始打；直接開始則用一行提示帶過
  if (settings.opening === 'full') {
    runCeremony(beginPlay);
    return;
  }
  openingClose();
  const d = game.dice;
  notify(
    (msg ? msg + ' ' : '') +
      (game.dealer === 0 ? '你' : seats[game.dealer]) +
      '擲骰 ' +
      d.join('＋') +
      '＝' +
      (d[0] + d[1] + d[2]) +
      '，從' +
      (game.wallOwner === 0 ? '你' : seats[game.wallOwner]) +
      '的牌牆開門。',
  );
  computers();
}
// 一局結束：計台、算點數、決定連莊或下莊，並記錄學習進度
function finishHand() {
  session.settled = true;
  const ws = winScore(),
    [base, perTai] = settings.stake.split('/').map(Number);
  let deltas = [0, 0, 0, 0],
    payments = [];
  if (ws && typeof Scoring !== 'undefined' && Scoring.settle) {
    ({ deltas, payments } = Scoring.settle(game, ws.result, { base, perTai }));
  }
  session.scores = session.scores.map((v, i) => v + deltas[i]);
  const dealerStays = !ws || ws.winner === game.dealer,
    nextDealer = dealerStays ? game.dealer : (game.dealer + 1) % 4;
  const nextRound =
    !dealerStays && nextDealer === session.firstDealer ? (session.round + 1) % 4 : session.round;
  session.next = { dealer: nextDealer, streak: dealerStays ? game.streak + 1 : 0, round: nextRound };
  session.last = { winner: ws ? ws.winner : null, deltas, payments, dealerStays, base, perTai };
  saveSession();
  try {
    const list = JSON.parse(localStorage.getItem('mahjong-coach-history') || '[]');
    list.unshift({
      time: Date.now(),
      round: roundName(),
      result: game.result,
      tai: ws ? ws.result.total : 0,
      delta: deltas[0],
      ...Growth.summarize(turnLog), // turns、good、mistakes 與各階段一致率
      won: !!ws && ws.winner === 0,
      dealIn: !!ws && !ws.result.tsumo && ws.result.ctx.from === 0,
      tsumoCuts: ((game.cuts && game.cuts[0]) || []).filter((c) => c === 'tsumo').length,
    });
    localStorage.setItem('mahjong-coach-history', JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  } catch (e) {}
  if (typeof Quiz !== 'undefined') {
    const p = Quiz.load();
    Quiz.recordGame(p, {
      won: !!ws && ws.winner === 0,
      tsumo: !!ws && ws.winner === 0 && ws.result.tsumo,
      dealIn: !!ws && !ws.result.tsumo && ws.result.ctx.from === 0,
      draw: !ws,
      mistakes: turnLog.filter((x) => x.mistake).length,
      delta: deltas[0],
    });
    Quiz.save(p);
  }
}
$('#explainButton').onclick = () => {
  const open = !$('#coachGlossary').classList.toggle('hidden');
  $('#explainButton').setAttribute('aria-expanded', String(open));
};
function askCoach(question) {
  if (/防守|安全|危險|放槍/.test(question)) {
    if (game.turn === 0 && game.phase === 'discard') {
      analyze();
      $('#askAnswer').textContent =
        Defense.summary(game, suggestions) +
        (selected === null
          ? ''
          : '\n你選的牌：' + Defense.describe(Defense.inspect(game, 0, game.hands[0][selected])));
    } else $('#askAnswer').textContent = '輪到你出牌時可比較防守；吃碰回應卡會提示後續出牌風險。';
    return;
  }
  $('#askAnswer').textContent = Coach.contextualAnswer(
    question,
    game,
    selected === null ? null : game.hands[0][selected],
  );
}
$('#askSelected').onclick = () => askCoach('這張可以嗎');
$('#askForm').onsubmit = (e) => {
  e.preventDefault();
  askCoach($('#askInput').value);
};
// 鍵盤：空白鍵摸牌、Enter 確認出牌、← → 選牌
document.addEventListener?.('keydown', (e) => {
  const target = /** @type {HTMLElement | null} */ (e.target);
  if (openingActive) return; // 開局畫面顯示中不處理快捷鍵
  if (target && /INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY/.test(target.tagName)) return;
  const choosing = game.turn === 0 && game.phase === 'discard';
  if (e.key === ' ' && !$('#drawButton').disabled) {
    e.preventDefault();
    $('#drawButton').onclick();
  } else if (e.key === 'Enter' && choosing && selected !== null) {
    e.preventDefault();
    $('#discardButton').onclick();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && choosing) {
    e.preventDefault();
    const n = game.hands[0].length;
    selected =
      selected === null
        ? e.key === 'ArrowLeft'
          ? n - 1
          : 0
        : (selected + (e.key === 'ArrowLeft' ? n - 1 : 1)) % n;
    render();
  }
});
