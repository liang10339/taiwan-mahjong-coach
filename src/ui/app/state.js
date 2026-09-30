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
  /** 教練欄顯示「胡牌率與台數」模擬 */
  value: true,
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
let game = E.create(Date.now() >>> 0, ruleOpts()), // 種子存成 32 位元（洗牌只用低 32 位元），公開驗證時數字才一致
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
  lastReview = null;
let reviewTimeline = [];
let heard = { log: 0, phase: game.phase },
  neatRiver = false;
/** 目前顯示的分頁（table／lesson／review）；覆盤頁只在看得到時才重畫 */
let currentMode = 'table';
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
  if (claimCache.key !== key) claimCache = { key, value: Advisor.claims(game, 0, { base: baseTai() }) };
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
/**
 * 輪到你出牌時決策核心（src/core/advisor.js）的建議；標題、場況、覆盤評分都用它。
 * explain 是牌效率的文字解說，和 decision.efficiency 用同一套取捨，所以首選一定相同。
 */
let decisionCache = { key: '', value: null };
function currentDecision() {
  if (!(game.turn === 0 && game.phase === 'discard')) return null;
  const key = JSON.stringify([decisionKey(), game.log.length, game.fresh]);
  if (decisionCache.key !== key) {
    const d = Advisor.decide(game, 0, { base: baseTai() });
    decisionCache = {
      key,
      value: d && { ...d, explain: Coach.explainTurn(game.hands[0], d.options, d.ctx) },
    };
  }
  return decisionCache.value;
}
function currentExplain() {
  const d = suggestions.length ? currentDecision() : null;
  return d ? d.explain : null;
}
function analyze() {
  const d = currentDecision();
  suggestions = d ? d.options : [];
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
/** 底換算成幾台（例如 50 底 20 台 → 2.5），攻守期望值用 */
function baseTai() {
  const [base, perTai] = settings.stake.split('/').map(Number);
  return perTai ? base / perTai : 2.5;
}
// 危險度：每張牌的放槍機率（src/core/safety.js）。低於 1% 為低、4% 以上為高
function dangerMap() {
  const key = JSON.stringify([decisionKey(), game.log.length]);
  if (dangerCache.key === key) return dangerCache.value;
  const d = currentDecision(),
    list = d ? d.safety : Safety.evaluate(game, 0),
    map = {};
  for (const r of list) {
    const lv = r.dealIn < 0.01 ? 'safe' : r.dealIn < 0.04 ? 'mid' : 'high';
    map[r.tile] = {
      level: lv,
      text: (lv === 'safe' ? '低' : lv === 'mid' ? '中' : '高') + '：' + Safety.explain(r),
    };
  }
  dangerCache = { key, value: map };
  return map;
}
