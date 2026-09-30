// 牌譜（src/core/record.js）：存下種子＋桌規＋每個動作，重播要得到完全相同的一局。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const AI = require('../src/core/ai.js');
const R = require('../src/core/record.js');

/** 用電腦打完一局；0 號位偶爾做「非首選」的選擇，讓吃、碰、槓、空切、略過胡牌都出現 */
function playGame(seed) {
  const g = E.create(seed, { dealer: seed % 4, reserve: 16, passWater: true, streak: seed % 3 });
  let steps = 0,
    r = seed;
  const rand = () => (r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296;
  while (g.phase !== 'ended' && steps++ < 600) {
    const p = g.turn;
    if (p === 0 && g.phase === 'discard' && !E.winning(g.hands[0], g.melds[0].length) && rand() < 0.3) {
      const f = g.fresh,
        h = g.hands[0];
      // 空切：打出手中和剛摸進相同的另一張
      const empty = f ? h.findIndex((t, i) => t === f.tile && i !== h.length - 1) : -1;
      E.discard(g, 0, empty >= 0 ? empty : Math.floor(rand() * h.length));
    } else AI.act(g, p, 'normal');
    if (g.phase === 'claim')
      for (let q = 0; q < 4 && g.phase === 'claim'; q++)
        if (!g.pending.decisions[q]) {
          const options = E.claims(g, q);
          // 0 號位隨機選一種能做的回應（含略過胡牌），其他家照電腦
          const pick =
            q === 0 && options.length && rand() < 0.5 ? options[Math.floor(rand() * options.length)] : null;
          E.respond(g, q, pick || (q === 0 ? { type: 'pass' } : AI.chooseClaim(g, q, 'normal')));
        }
  }
  return g;
}

const state = (g) =>
  JSON.stringify({
    hands: g.hands.map((h) => h.slice().sort((a, b) => a - b)),
    melds: g.melds,
    rivers: g.rivers,
    flowers: g.flowers,
    wall: g.wall.length,
    phase: g.phase,
    result: g.result,
    log: g.log.length,
  });

// 1. 60 局：存成牌譜 → JSON → 匯入 → 重播，結果和原局完全相同
let kinds = new Set();
for (let seed = 1; seed <= 60; seed++) {
  const g = playGame(seed);
  const rec = R.fromGame(g, { coach: 1, createdAt: 0 });
  rec.commands.forEach((c) => kinds.add(c.a === 'respond' ? 'respond:' + c.choice : c.a));
  const { record, error } = R.parse(JSON.stringify(rec));
  assert.equal(error, null, '第 ' + seed + ' 局無法匯入：' + error);
  const back = R.replay(record);
  assert.equal(back.error, null);
  assert.equal(state(back.game), state(g), '第 ' + seed + ' 局重播後不一致');
}
for (const k of ['draw', 'discard', 'win', 'respond:pass', 'respond:chi', 'respond:pon', 'respond:ron'])
  assert.ok(kinds.has(k), '測試牌局要涵蓋 ' + k);

// 2. 回到某一步：播到第 n 個動作，和原局當時的紀錄一致
{
  const g = playGame(7),
    rec = R.fromGame(g);
  const half = Math.floor(rec.commands.length / 2);
  const mid = R.replay(rec, { upto: half });
  assert.equal(mid.applied, half);
  assert.equal(R.commandsOf(mid.game).length, half, '停在第 ' + half + ' 個動作');
}

// 3. 吃牌記下用了哪兩張：同一張牌有兩種吃法時也能重現
{
  const g = playGame(3);
  const chi = g.log.find((e) => e.action === 'chi');
  if (chi) assert.equal(chi.tiles.length, 2);
}

// 4. 格式檢查：不是牌譜、版本不對、別的發牌程序、單一玩家視角（日後實戰記錄用）都要明確拒絕
assert.match(R.parse('{}').error, /不是本程式的牌譜/);
assert.match(R.parse('not json').error, /JSON/);
const base = R.fromGame(playGame(2));
assert.match(R.parse(JSON.stringify({ ...base, version: 99 })).error, /版本/);
assert.match(R.parse(JSON.stringify({ ...base, dealing: 'real-wall-v2' })).error, /發牌程序/);
assert.match(R.parse(JSON.stringify({ ...base, perspective: 'seat' })).error, /單一玩家/);
// 被竄改的動作會在重播時被抓出來
const bad = JSON.parse(JSON.stringify(base));
const firstDiscard = bad.commands.findIndex((c) => c.a === 'discard');
bad.commands[firstDiscard].tile = 99;
assert.match(R.parse(JSON.stringify(bad)).error, /無法套用/);

console.log('record tests passed');
