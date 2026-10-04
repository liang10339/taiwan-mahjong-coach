// 評估用的「像真人朋友」的對手（只用在評估，不會出現在 App 裡）：
//   noisy：照牌效率打，但有 15% 的手會打出次佳或第三佳的牌（真人常見的小失誤，不是亂打）
//   caller：照牌效率打，但看到能吃能碰就拿（常破壞門清），暗槓也一律槓
// 兩種都不做任何防守（和真人朋友桌上最常見的狀況一樣），而且只讀自己看得到的資訊。
// 亂數由「種子、紀錄長度、座位」決定，同一副牌重打結果相同。
'use strict';
const E = require('../../src/core/engine.js');
const AI = require('../../src/core/ai.js');
const Observation = require('../../src/core/observation.js');

function rand(g, p, salt) {
  let x =
    (Math.imul(g.seed >>> 0, 2654435761) ^
      Math.imul(g.log.length + 1, 40503) ^
      Math.imul(p + 7, 9973) ^
      salt) >>>
    0;
  x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 3266489917) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const NOISE = 0.15;

function noisyDiscard(g, p) {
  const view = Observation.forPlayer(g, p);
  const options = E.analyze(
    view.hands[p],
    E.publicTiles(view, p),
    view.melds[p].length,
    new Map(),
    view.rules,
  );
  if (options.length > 1 && rand(g, p, 1) < NOISE) {
    const pick = 1 + Math.floor(rand(g, p, 2) * Math.min(2, options.length - 1));
    return options[pick].tile;
  }
  return options[0].tile;
}

function callerClaim(g, p) {
  const options = E.claims(g, p);
  return (
    options.find((a) => a.type === 'ron') ||
    options.find((a) => a.type === 'kan') ||
    options.find((a) => a.type === 'pon') ||
    options.find((a) => a.type === 'chi') || { type: 'pass' }
  );
}

/** @returns {{kan: Function, discard: Function, claim: Function} | null} */
function strategy(name) {
  if (name === 'noisy')
    return {
      kan: (g, p) => AI.chooseKan(g, p, 'normal'),
      discard: noisyDiscard,
      claim: (g, p) => AI.chooseClaim(g, p, 'normal'),
    };
  if (name === 'caller')
    return {
      kan: (g, p) => E.selfKans(g, p)[0] || null,
      discard: (g, p) => AI.chooseDiscard(g, p, 'normal'),
      claim: callerClaim,
    };
  return null;
}

module.exports = { strategy, NAMES: ['noisy', 'caller'] };
