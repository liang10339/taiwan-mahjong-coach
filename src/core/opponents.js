(function (root) {
  'use strict';
  // 對手模型：只用公開資訊估計每家「現在聽牌的機率」與「胡了大約幾台」。
  // 機率不是憑感覺寫的：scripts/calibrate.cjs 讓電腦對打上千局（知道每家真正的手牌），
  // 依下面同一套特徵分組統計，結果存在 src/core/data/calibration.js。沒有統計資料時用保守的預設值。
  const node = typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.Mahjong,
    AI = node ? require('./ai.js') : root.AI;
  const CAL = node ? require('./data/calibration.js') : root.Calibration;
  const HAND_CHANGES = ['chi', 'pon', 'kan', 'concealed', 'added'];

  /** 還能摸的張數（扣掉保留的牌尾） @param {Game} g */
  function drawable(g) {
    return Math.max(0, g.wall.length - (g.reserve || 0));
  }

  /**
   * q 最近一次改變手牌（手切、吃碰槓）之後「放過」的牌：這段期間他的手牌組成沒變，
   * 他自己摸進又打掉的牌（沒自摸）和別家打出他沒胡的牌，都不是他要胡的牌——除非他故意不胡。
   * @param {Game} g @param {number} q
   */
  function passedSince(g, q) {
    let start = 0;
    for (let i = g.log.length - 1; i >= 0; i--) {
      const e = g.log[i];
      if (e.player !== q) continue;
      if ((e.action === 'discard' && e.cut === 'hand') || HAND_CHANGES.includes(e.action)) {
        start = i + 1;
        break;
      }
    }
    const passed = new Set();
    for (let i = start; i < g.log.length; i++) {
      const e = g.log[i];
      if (e.action !== 'discard') continue;
      if (e.player === q)
        passed.add(e.tile); // 摸切或空切：手牌沒變
      else {
        // 別家打的牌：要等大家回應完（緊接著的 resolution）才確定他沒胡
        const done = g.log.slice(i + 1).find((x) => x.action === 'resolution');
        if (done && done.tile === e.tile && done.choice !== 'ron') passed.add(e.tile);
      }
    }
    return passed;
  }

  /** q 最近手切的牌（最多三張）：聽牌前整理手牌時打的，附近的牌最可能是他要的 */
  function recentHandCuts(g, q) {
    const cuts = (g.cuts && g.cuts[q]) || [];
    return g.rivers[q].filter((t, i) => cuts[i] === 'hand').slice(-3);
  }

  /**
   * 聽牌機率用的特徵（校準與實戰用同一個函式，分組才會一致）。
   * @param {Game} g @param {number} q
   */
  function features(g, q) {
    const r = AI.reading(g, q);
    return {
      melds: g.melds[q].length,
      discards: g.rivers[q].length,
      streak: r.streak,
      middleRun: r.middleRun,
      oneSuit: r.oneSuit,
      left: drawable(g),
    };
  }

  /** 特徵分組的鍵：攤牌數 × 巡目 × 連續摸切 */
  function tenpaiKey(f) {
    const m = Math.min(f.melds, 3),
      turn = f.discards < 4 ? 0 : f.discards < 7 ? 1 : f.discards < 10 ? 2 : f.discards < 13 ? 3 : 4,
      streak = f.streak >= 3 ? 2 : f.streak >= 1 ? 1 : 0;
    return m + '|' + turn + '|' + streak;
  }

  /** 沒有統計資料時的保守估計（只依分組，校準報告也用同一個函式） */
  function fallbackTenpai(key) {
    const [m, turn, streak] = key.split('|').map(Number);
    const base = [0.05, 0.2, 0.45, 0.75][m] + [2, 5, 8, 11, 14][turn] * 0.025 + (streak === 2 ? 0.15 : 0);
    return Math.min(0.95, base);
  }

  /** 某一組特徵的聽牌機率：統計值往預設值收縮，避免樣本少的組合出現極端數字 */
  function probForKey(key, table = CAL && CAL.tenpai) {
    const row = table && table[key],
      prior = fallbackTenpai(key),
      p = row ? (row[0] + prior * 20) / (row[1] + 20) : prior;
    return Math.min(0.97, Math.max(0.01, p));
  }

  /**
   * q 現在聽牌的機率（0～1）。
   * @param {Game} g @param {number} q
   */
  function tenpaiProb(g, q) {
    return probForKey(tenpaiKey(features(g, q)));
  }

  /** 聽牌機率換成三段：0 看不出、1 可能接近、2 很可能聽牌 */
  function level(p) {
    return p >= 0.5 ? 2 : p >= 0.25 ? 1 : 0;
  }

  /**
   * q 如果胡牌，大約幾台（含莊家、連莊）：依統計的平均台數，再加上看得到的加台（一色、有台的字牌刻子）。
   * @param {Game} g @param {number} q
   */
  function expectedTai(g, q) {
    const r = AI.reading(g, q),
      seat = 27 + E.seatWind(g, q),
      round = 27 + (g.roundWind || 0);
    let tai = (CAL && CAL.avgTai) || 3;
    if (r.oneSuit !== null) tai += 3; // 混一色 4 台（平均已含一部分）
    for (const m of g.melds[q]) {
      const t = m.tiles[0];
      if (m.type !== 'chi' && (t >= 31 || t === seat || t === round)) tai += 1;
    }
    if (g.dealer === q) tai += 1 + 2 * (g.streak || 0);
    return Math.round(tai * 10) / 10;
  }

  /**
   * 三家的完整判讀（場況判斷、防守、攻守期望值共用）。
   * @param {Game} g @param {number} viewer
   */
  function read(g, viewer) {
    return [1, 2, 3].map((d) => {
      const q = (viewer + d) % 4,
        p = tenpaiProb(g, q);
      return {
        q,
        rel: d,
        tenpai: p,
        level: level(p),
        tai: expectedTai(g, q),
        reading: AI.reading(g, q),
        passed: passedSince(g, q),
        handCuts: recentHandCuts(g, q),
        water: !!(g.passWater && g.water && g.water[q]),
      };
    });
  }

  const api = {
    read,
    tenpaiProb,
    expectedTai,
    features,
    tenpaiKey,
    probForKey,
    passedSince,
    recentHandCuts,
    drawable,
    level,
  };
  if (node) module.exports = api;
  else root.Opponents = api;
})(globalThis);
