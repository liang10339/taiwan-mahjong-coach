// 可重現的評估局面：「某一局的某個決策點」。用種子與編號就能重新打出同一個局面，
// 所以不必存下整份牌局；只要引擎的洗牌與發牌程序沒變，局面就一樣（變了要重新產生題庫與標準答案）。
// 局面取自：被評估的座位（0 號）只看牌效率，其他三家是 mixed 對手池，桌規是朋友桌規——
// 和教練評估矩陣的 friends × mixed 那格同一種桌子，而且不依賴教練版本（局面不會因為教練改了就變）。
'use strict';
const E = require('../../src/core/engine.js');
const Arena = require('./arena.cjs');
const { streakOf } = require('./envs.cjs');
const { rng } = require('./oracle.cjs');

const SEAT = 0;
const DEFAULTS = { env: 'friends', pool: 'mixed', perGame: 3 };

/** 打出第 seed 局，回傳這局被選中的決策點（座位 0 的出牌前局面，已經是座位 0 看得到的視角以外的真實牌局複本） */
function positionsOf(seed, { env = DEFAULTS.env, pool = DEFAULTS.pool, perGame = DEFAULTS.perGame } = {}) {
  const e = Arena.envOf(env);
  const g = E.create(seed * 104729, {
    reserve: 16,
    passWater: true,
    dealer: seed % 4,
    streak: streakOf(e, seed),
    rules: e.rules,
  });
  const seats = [SEAT, 1, 2, 3].map((q) =>
    Arena.strategy(q === SEAT ? 'normal' : Arena.POOLS[pool][q - 1], { base: e.base }),
  );
  // 先打一遍數出座位 0 有幾個決策點，再依種子挑 perGame 個（第 3 個以後，避免開局幾乎都一樣）
  let total = 0;
  Arena.playOut(structuredClone(g), seats, 500, (_g, p) => {
    if (p === SEAT) total++;
  });
  const rand = rng(seed * 7 + 1),
    wanted = new Set();
  const pool0 = Array.from({ length: Math.max(0, total - 2) }, (_, i) => i + 2);
  while (wanted.size < Math.min(perGame, pool0.length)) wanted.add(pool0[Math.floor(rand() * pool0.length)]);
  const out = [];
  let k = 0;
  Arena.playOut(g, seats, 500, (cur, p) => {
    if (p !== SEAT) return;
    if (wanted.has(k))
      out.push({ id: `${env}:${pool}:${seed}:${k}`, seed, k, env, pool, game: structuredClone(cur) });
    k++;
  });
  return out;
}

module.exports = { SEAT, DEFAULTS, positionsOf };
