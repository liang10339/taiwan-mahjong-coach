// 公平性：電腦只能用自己的手牌與公開資訊（牌河、攤牌、補花）做決定。
// 把牌牆順序與別家暗牌打亂後，同一個局面的決定必須完全相同——代表沒有偷看。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const AI = require('../src/core/ai.js');

/** 打亂 p 看不到的資訊：牌牆順序、其他三家的暗牌（保留張數，總牌數不變） */
function scrambleHidden(g, p) {
  const h = structuredClone(g);
  const pool = [...h.wall.filter((t) => t < 34)];
  const flowers = h.wall.filter((t) => t >= 34);
  for (let q = 0; q < 4; q++) if (q !== p) pool.push(...h.hands[q]);
  pool.reverse(); // 換一種順序（決定論，不用亂數）
  for (let q = 0; q < 4; q++)
    if (q !== p) {
      const n = h.hands[q].length;
      h.hands[q] = pool.splice(0, n).sort((a, b) => a - b);
    }
  h.wall = [...flowers, ...pool];
  return h;
}

let compared = 0;
for (let seed = 1; seed <= 8; seed++) {
  const g = E.create(seed);
  let steps = 0;
  while (g.phase !== 'ended' && steps++ < 400) {
    const p = g.turn;
    if (g.phase === 'discard' && p !== 0)
      for (const level of ['easy', 'normal', 'hard']) {
        const a = AI.chooseDiscard(structuredClone(g), p, level),
          b = AI.chooseDiscard(scrambleHidden(g, p), p, level);
        assert.equal(b, a, `第 ${seed} 局 ${level} 電腦的出牌不能因看不到的牌而改變`);
        compared++;
      }
    if (g.phase === 'claim')
      for (let q = 1; q < 4; q++)
        if (!g.pending.decisions[q])
          for (const level of ['normal', 'hard']) {
            const a = AI.chooseClaim(structuredClone(g), q, level),
              b = AI.chooseClaim(scrambleHidden(g, q), q, level);
            assert.deepEqual(b, a, `第 ${seed} 局 ${level} 電腦的吃碰槓決定不能因看不到的牌而改變`);
            compared++;
          }
    AI.act(g, p, 'normal');
    if (g.phase === 'claim')
      for (let q = 0; q < 4 && g.phase === 'claim'; q++)
        if (!g.pending.decisions[q])
          E.respond(g, q, q === 0 ? { type: 'pass' } : AI.chooseClaim(g, q, 'normal'));
  }
}
assert.ok(compared > 200, '比對次數太少：' + compared);
console.log('PASS: 電腦在 ' + compared + ' 個局面中，打亂牌牆與別家暗牌後決定都不變（沒有偷看）。');
