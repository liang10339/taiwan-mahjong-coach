// 胡牌、向聽、進張與計台必須認得同一套牌型；特別驗證七對加一刻。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const S = require('../src/core/scoring.js');
const standardOnly = E.ruleProfile({ liguLigu: false });
const counts = (hand) => Array.from({ length: 34 }, (_, t) => hand.filter((x) => x === t).length);

// 獨立參照：枚舉刻子的牌種，再以動態規劃配置其餘七對（每種零、一、兩對）。
function referenceLigu(hand) {
  const c = counts(hand);
  let kept = 0;
  for (let triple = 0; triple < 34; triple++) {
    let best = [0, ...Array(7).fill(-Infinity)];
    for (let t = 0; t < 34; t++) {
      if (t === triple) continue;
      const next = Array(8).fill(-Infinity);
      for (let p = 0; p <= 7; p++)
        for (let use = 0; use <= 2 && p + use <= 7; use++)
          next[p + use] = Math.max(next[p + use], best[p] + Math.min(c[t], use * 2));
      best = next;
    }
    kept = Math.max(kept, Math.min(c[triple], 3) + best[7]);
  }
  return 16 - kept;
}

// 原始回報：11 44 77萬、11 44 77筒、東、中中中，只差另一張東。
const waiting = [0, 0, 3, 3, 6, 6, 9, 9, 12, 12, 15, 15, 27, 31, 31, 31];
const complete = [...waiting, 27];
assert.equal(E.standardShanten(waiting), 3);
assert.equal(E.liguShanten(waiting), 0);
assert.equal(E.shanten(waiting), 0);
assert.equal(E.shanten(complete), -1);
assert.equal(E.winning(complete), true);
assert.equal(S.isLiguLigu(complete), true);
assert.deepEqual(S.winningTiles(waiting), [27]);
const choice = E.analyze([...waiting, 33]).find((o) => o.tile === 33);
assert.equal(choice.shanten, 0);
assert.equal(choice.remaining, 3);
assert.deepEqual(choice.improving, [27]);
assert.deepEqual(choice.outs, [{ tile: 27, remaining: 3 }]);
assert.deepEqual(E.analyze([...waiting, 33], [27, 27, 27]).find((o) => o.tile === 33).improving, []);

// 四張相同牌可作兩對；八對聽任一對成刻；不能把已宣告的暗槓當成兩對。
const doubledPair = [0, 0, 0, 0, 3, 3, 6, 6, 9, 9, 12, 12, 15, 15, 31, 31, 31];
assert.equal(E.liguShanten(doubledPair), -1);
assert.equal(E.winning(doubledPair), true);
const eightPairs = [0, 3, 6, 9, 12, 15, 18, 27].flatMap((t) => [t, t]);
assert.equal(E.liguShanten(eightPairs), 0);
assert.deepEqual(S.winningTiles(eightPairs), [0, 3, 6, 9, 12, 15, 18, 27]);
assert.equal(E.liguShanten(doubledPair.slice(4), 1), Infinity);
assert.equal(E.liguLigu(complete, 1), false);
assert.equal(E.shanten(waiting.slice(3), 1), E.standardShanten(waiting.slice(3), 1));

// 不合法張數與第五張同牌不可成胡，也不可變成負的向聽數。
assert.equal(E.shanten([...complete, 33]), Infinity);
assert.equal(E.winning([...complete, 33]), false);
assert.equal(E.shanten(Array(17).fill(0)), Infinity);
assert.equal(E.liguShanten(Array(17).fill(0)), Infinity);
assert.equal(E.winning(Array(17).fill(0)), false);
assert.deepEqual(S.decompositions(Array(17).fill(0), 5), []);
assert.equal(E.shanten([0, 0], 6), Infinity);
assert.throws(() => E.shanten([34]), /Invalid tile/);

// 同一個 memo 交替使用桌規也不得混入特殊牌型的結果。
const memo = new Map();
assert.equal(E.shanten(waiting, 0, standardOnly), 3);
assert.equal(E.winning(complete, 0, standardOnly), false);
assert.equal(S.isLiguLigu(complete, 0, standardOnly), false);
assert.deepEqual(S.winningTiles(waiting, 0, standardOnly), []);
assert.equal(E.analyze([...waiting, 33], [], 0, memo).find((o) => o.tile === 33).shanten, 0);
assert.equal(E.analyze([...waiting, 33], [], 0, memo, standardOnly).find((o) => o.tile === 33).shanten, 3);
assert.equal(E.analyze([...waiting, 33], [], 0, memo).find((o) => o.tile === 33).shanten, 0);
assert.ok(Object.isFrozen(E.DEFAULT_RULES));
assert.throws(() => E.create(1, { rules: { version: 2 } }), /Unsupported rule version/);

function wonGame(rules) {
  const g = E.create(17, { rules });
  g.hands[0] = complete.slice();
  g.melds[0] = [];
  g.flowers[0] = [];
  g.phase = 'discard';
  g.turn = 0;
  g.lastTake = { player: 0, tile: 27, afterKan: false };
  return g;
}
const won = wonGame(E.DEFAULT_RULES);
assert.equal(E.win(won, 0), true);
assert.ok(S.score(won, 0).items.some((item) => item.name === '嚦咕嚦咕'));
const disabled = wonGame(standardOnly);
assert.equal(E.win(disabled, 0), false);
assert.throws(() => S.score(disabled, 0), /non-winning hand/);
for (const [rules, legal] of [
  [E.DEFAULT_RULES, true],
  [standardOnly, false],
]) {
  const g = wonGame(rules);
  g.hands[0] = waiting.slice();
  g.phase = 'claim';
  g.pending = { from: 3, tile: 27, decisions: {} };
  assert.equal(
    E.claims(g, 0).some((a) => a.type === 'ron'),
    legal,
  );
}

// 以與最佳化公式不同的動態規劃，交叉檢查一般、對子多與刻子多的合法手牌。
let seed = 78123;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
for (let i = 0; i < 240; i++) {
  const hand = [],
    c = Array(34).fill(0),
    target = 15 + (i % 3);
  while (hand.length < target) {
    const tile = Math.floor(random() * (i % 2 ? 34 : 9));
    const copies = Math.min((i % 3) + 1, target - hand.length, 4 - c[tile]);
    hand.push(...Array(copies).fill(tile));
    c[tile] += copies;
  }
  assert.equal(E.liguShanten(hand), referenceLigu(hand), JSON.stringify(hand));
  assert.equal(E.shanten(hand), Math.min(E.standardShanten(hand), referenceLigu(hand)));
}

// 從多種合法完成牌移除一張：零向聽的進張，必須正是規則引擎與計台共同認定的胡牌張。
for (let i = 0; i < 80; i++) {
  const kinds = Array.from({ length: 34 }, (_, t) => t);
  for (let k = kinds.length - 1; k > 0; k--) {
    const j = Math.floor(random() * (k + 1));
    [kinds[k], kinds[j]] = [kinds[j], kinds[k]];
  }
  const hand = kinds.slice(0, 7).flatMap((t) => [t, t]);
  hand.push(kinds[7], kinds[7], kinds[7]);
  if (i % 2) hand.splice(2, 2, kinds[0], kinds[0]); // 同牌四張作兩對
  hand.splice(Math.floor(random() * 17), 1);
  const spare = kinds[8];
  const option = E.analyze([...hand, spare]).find((o) => o.tile === spare);
  const waits = S.winningTiles(hand);
  assert.equal(E.shanten(hand), 0);
  assert.equal(option.shanten, 0);
  assert.deepEqual(option.improving, waits);
  assert.ok(waits.length > 0);
  for (const t of waits) assert.equal(E.winning([...hand, t]), true);
}

console.log(
  'PASS: shared versioned hand rules, exact ligu shanten, legal counts, waits/outs, scoring and rule isolation.',
);
