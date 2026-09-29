'use strict';
// 牌局狀態：設定、一將（session）、目前這一局（game）與各種計算快取。
// 其他檔案都讀寫這裡宣告的變數；核心規則在 src/core，這裡只保存畫面需要的狀態。
const E = Mahjong;
const seats = ['你（東家・莊家）', '南家', '西家', '北家'],
  WINDS = ['東', '南', '西', '北'],
  REL = ['', '下家', '對家', '上家'];
// 設定（存在本機）：電腦難度、教練提示、危險度、抓位、底台
const settings = {
  level: 'normal',
  coach: true,
  danger: false,
  seatDraw: true,
  stake: '100/20',
  passWater: true,
  reserve: true,
  showCuts: false,
  /** 開局方式：quick 直接開始、full 完整開局（抓位、擲骰、開門、配牌、補花） */
  opening: 'quick',
};
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('mahjong-coach-settings') || '{}'));
} catch (e) {}
function saveSettings() {
  try {
    localStorage.setItem('mahjong-coach-settings', JSON.stringify(settings));
  } catch (e) {}
}
// 一將：莊家、圈風、連莊次數與四家累計分數。第一次開頁直接由你當東家莊家，按 ↻ 才抓位。
let session = {
  firstDealer: 0,
  dealer: 0,
  round: 0,
  streak: 0,
  hand: 1,
  scores: [0, 0, 0, 0],
  settled: false,
  last: null,
  next: null,
};
// 上次的一將（莊家、圈風、連莊、分數）存在本機，重新開頁接著打下一局
try {
  const saved = JSON.parse(localStorage.getItem('mahjong-coach-session') || 'null');
  if (saved && Array.isArray(saved.scores))
    Object.assign(session, saved, { settled: false, last: null, next: null });
} catch (e) {}
function saveSession() {
  try {
    localStorage.setItem(
      'mahjong-coach-session',
      JSON.stringify({
        firstDealer: session.firstDealer,
        dealer: session.dealer,
        round: session.round,
        streak: session.streak,
        hand: session.hand,
        scores: session.scores,
      }),
    );
  } catch (e) {}
}
function ruleOpts() {
  return {
    dealer: session.dealer,
    roundWind: session.round,
    streak: session.streak,
    reserve: settings.reserve ? 16 : 0,
    passWater: settings.passWater,
  };
}
let game = E.create(Date.now(), ruleOpts()),
  selected = null,
  timer = null,
  generation = 0,
  suggestions = [],
  lessonStep = 0;
let peek = false,
  replayIndex = 0,
  replayMistakes = false,
  dangerCache = { key: '', value: null };
let scoreCache = { log: -1, value: null };
let lastDrawn = null,
  turnLog = [],
  lastReview = null,
  explainCache = { key: '', value: null };
let reviewTimeline = [];
let heard = { log: 0, phase: game.phase },
  neatRiver = false,
  shownPile = 0;
let claimCache = { key: '', value: null },
  kanCache = { key: '', value: [] };
function decisionKey() {
  return JSON.stringify([
    game.phase,
    game.hands[0],
    game.melds[0],
    E.publicTiles(game),
    game.pending?.tile,
    game.pending?.from,
    game.pending?.kind,
    game.wall.length > 0,
  ]);
}
function currentClaim() {
  const key = decisionKey();
  if (claimCache.key !== key) claimCache = { key, value: Coach.claimDecision(game, 0) };
  return claimCache.value;
}
function currentKans() {
  const key = decisionKey();
  if (kanCache.key !== key) kanCache = { key, value: Coach.selfKanDecision(game, 0) };
  return kanCache.value;
}
try {
  neatRiver = localStorage.getItem('mahjong-coach-river') === 'neat';
} catch (e) {}
function tile(t) {
  return E.names[t];
}
const actionName = { chi: '吃', pon: '碰', kan: '明槓', ron: '胡', concealed: '暗槓', added: '加槓' };
function readiness(n) {
  return n === 0
    ? '已聽牌'
    : (['', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'][n] || n) + '進聽';
}
function waiting() {
  return game.phase === 'claim' && !game.pending.decisions[0];
}
// 對座位 p 有台的字牌：三元牌、自己的門風、圈風
function valueTiles(p) {
  return [31, 32, 33, 27 + E.seatWind(game, p), 27 + (game.roundWind || 0)];
}
function currentExplain() {
  if (!(game.turn === 0 && game.phase === 'discard' && suggestions.length)) return null;
  const pub = E.publicTiles(game),
    key = game.hands[0].join(',') + '|' + lastDrawn + '|' + pub.length + '|' + game.melds[0].length;
  if (explainCache.key !== key)
    explainCache = {
      key,
      value: Coach.explainTurn(game.hands[0], suggestions, {
        drawn: lastDrawn,
        publicTiles: pub,
        open: game.melds[0].length,
        value: valueTiles(0),
        nextRiver: game.rivers[1],
      }),
    };
  return explainCache.value;
}
function analyze() {
  suggestions =
    game.turn === 0 && game.phase === 'discard'
      ? E.analyze(game.hands[0], E.publicTiles(game), game.melds[0].length)
      : [];
}
// 胡牌後的台數（依牌局紀錄計算一次後快取）
function winScore() {
  if (game.phase !== 'ended' || typeof Scoring === 'undefined') return null;
  const w = [...game.log].reverse().find((e) => ['ron', 'tsumo', 'flowers'].includes(e.action));
  if (!w) return null;
  if (scoreCache.log !== game.log.length)
    scoreCache = { log: game.log.length, value: { winner: w.player, result: Scoring.score(game, w.player) } };
  return scoreCache.value;
}
function drawable() {
  return Math.max(0, game.wall.length - (game.reserve || 0));
}
function fmt(n) {
  return (n > 0 ? '+' : '') + n;
}
// 危險度：依公開資訊估計三家的威脅程度，算出每張牌可被胡的組合
function dangerMap() {
  const key = decisionKey();
  if (dangerCache.key === key) return dangerCache.value;
  const list = AI.threats(game, 0),
    map = {};
  for (const t of new Set(game.hands[0])) {
    const d = AI.danger(game, 0, t, list),
      lv = AI.dangerLevel(d);
    map[t] = {
      level: lv,
      text:
        (lv === 'safe' ? '低' : lv === 'mid' ? '中' : '高') +
        '（' +
        d.per
          .map(
            (x) =>
              WINDS[E.seatWind(game, x.player)] +
              '家 ' +
              x.ways +
              ' 種' +
              (x.level ? '・威脅' + x.level : ''),
          )
          .join('、') +
        '）',
    };
  }
  dangerCache = { key, value: map };
  return map;
}
