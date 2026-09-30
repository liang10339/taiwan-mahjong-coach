// 防守 2.0：對手聽牌機率（opponents.js）、放槍機率與理由（safety.js）、攻守期望值（policy.js）。
const assert = require('node:assert/strict');
const E = require('../src/core/engine.js');
const O = require('../src/core/opponents.js');
const Safety = require('../src/core/safety.js');
const P = require('../src/core/policy.js');
const CAL = require('../src/core/data/calibration.js');

/** 輪到你出牌的局面 */
function position(hand, edit = (g) => g) {
  const g = E.create(42, { reserve: 16, passWater: true });
  g.hands[0] = hand.slice();
  g.melds = [[], [], [], []];
  g.rivers = [[], [], [], []];
  g.cuts = [[], [], [], []];
  g.log = [];
  g.turn = 0;
  g.phase = 'discard';
  g.pending = null;
  edit(g);
  return g;
}
const hand = [0, 4, 8, 9, 13, 17, 18, 22, 26, 27, 28, 29, 30, 31, 1, 10, 19];
const entry = (g, t) => Safety.evaluate(g, 0).find((r) => r.tile === t);
const pons = (tiles) => tiles.map((t) => ({ type: 'pon', tiles: [t, t, t] }));
/** 打過 7 張手切的牌河：攤三組又打了好幾張，才是「很可能聽牌」 */
const RIVER = [5, 7, 12, 16, 21, 23, 25];
const discarded = (g, q, tiles = RIVER) => {
  g.rivers[q] = tiles.slice();
  g.cuts[q] = tiles.map(() => 'hand');
};

// 1. 聽牌機率：攤牌越多、打出越多越高；連續摸切也會提高
{
  const quiet = position(hand);
  const open = position(hand, (g) => {
    g.melds[1] = pons([2, 11, 20]);
    discarded(g, 1);
  });
  assert.ok(O.tenpaiProb(open, 1) > O.tenpaiProb(quiet, 1) + 0.2, '攤三組的聽牌機率要明顯較高');
  const late = position(hand, (g) => {
    g.rivers[2] = [27, 28, 29, 0, 8, 9, 17, 18, 26, 33, 32, 5];
    g.cuts[2] = Array(12).fill('hand');
  });
  assert.ok(O.tenpaiProb(late, 2) > O.tenpaiProb(quiet, 2), '打出越多張越可能聽牌');
  const r = O.read(open, 0);
  assert.equal(r[0].q, 1);
  assert.equal(r[0].level, 2);
  assert.ok(r[0].tai >= 1);
}

// 2. 電腦放過牌只在「有胡必胡」模型下推估；對手的私密過水狀態不能影響建議
{
  const g = position(hand, (g) => {
    g.melds[1] = pons([2, 11, 20]);
    discarded(g, 1);
    g.rivers[1].push(27);
    g.cuts[1].push('tsumo');
    g.log = [
      { player: 1, action: 'discard', tile: 27, cut: 'tsumo' },
      { action: 'resolution', player: 1, choice: 'pass', tile: 27 },
    ];
  });
  const east = entry(g, 27).per.find((x) => x.q === 1);
  assert.equal(east.p, 0);
  assert.equal(east.safe, false);
  assert.equal(east.assumedSafe, true);
  assert.match(east.reasons[0], /放過/);
  const water = position(hand, (g) => {
    g.melds[1] = pons([2, 11, 20]);
    g.water = [false, true, false, false];
  });
  const dry = structuredClone(water);
  dry.water[1] = false;
  assert.deepEqual(Safety.evaluate(water, 0), Safety.evaluate(dry, 0), '對手私密過水狀態不可以洩漏');
}

// 3. 壁：四張 3萬 都看得到，1萬 就沒有順子能等（只剩單吊、對碰）
{
  const threat = (g) => (g.melds[1] = pons([11, 20, 31]));
  const open = position(hand, threat);
  const wall = position(hand, (g) => {
    threat(g);
    g.rivers[2] = [2, 2, 2, 2];
  });
  const a = entry(open, 0),
    b = entry(wall, 0);
  assert.ok(b.dealIn < a.dealIn, '壁外的牌比較安全');
  assert.match(Safety.explain(b), /壁|順子等不到/);
}

// 4. 字牌見張數：已見 3 張只剩單吊，比生張安全
{
  const threat = (g) => (g.melds[1] = pons([2, 11, 20]));
  const fresh = position(hand, threat);
  const seen = position(hand, (g) => {
    threat(g);
    g.rivers[3] = [28, 28];
  });
  assert.ok(entry(seen, 28).dealIn < entry(fresh, 28).dealIn);
  assert.match(Safety.explain(entry(seen, 28)), /只可能單吊/);
}

// 5. 手切附近、做一色、不做的那門：特徵要抓得到；理由與加權只照自戰統計（倍數偏離 1 才講）
{
  const factor = (CAL && CAL.wait.factor) || Safety.DEFAULT_FACTOR;
  const base = (g) => {
    g.melds[1] = pons([27, 11]);
    discarded(g, 1, [0, 1, 2, 3, 5, 7, 8]); // 一直打萬子，最後手切 7萬
  };
  const g = position(hand, base);
  const o = O.read(g, 0)[0];
  const seen = Safety.visibleCounts(g, 0);
  const f = Safety.tileFeatures(4, seen, o);
  assert.equal(f.nearCut, true, '手切 7萬 附近的 5萬 要標記');
  assert.equal(f.avoid, true, '他一直打萬子');
  const text = Safety.explain(entry(g, 4));
  assert.equal(/手切/.test(text), factor.nearCut >= 1.1, '手切附近的理由只在統計支持時出現');
  assert.equal(/不做這門/.test(text), factor.avoid <= 0.9);
  // 不做的那門比同類的其他門安全（倍數 < 1 時）
  if (factor.avoid < 1) assert.ok(entry(g, 4).per[0].wait < entry(g, 13).per[0].wait);
  const flush = position(hand, (g) => {
    g.melds[1] = pons([9, 12, 15]);
    discarded(g, 1);
  });
  assert.equal(Safety.tileFeatures(13, Safety.visibleCounts(flush, 0), O.read(flush, 0)[0]).suitHit, true);
}

// 6. 攻守期望值：沒人聽牌時照效率；有人很可能聽牌而你還很遠時改打安全牌；你已聽牌時敢推
{
  const opt = (tile, shanten, remaining) => ({ tile, shanten, remaining, outs: [] });
  const risk = (tile, dealIn, tai = 4) => ({ tile, dealIn, per: [{ p: dealIn, tai }] });
  const calm = P.choose({
    options: [opt(5, 2, 30), opt(27, 2, 26)],
    efficiency: opt(5, 2, 30),
    safety: [risk(5, 0.005), risk(27, 0.002)],
    left: 50,
    myTai: 3,
  });
  assert.equal(calm.option.tile, 5);
  assert.equal(calm.stance, 'build');
  const fold = P.choose({
    options: [opt(5, 3, 30), opt(27, 4, 10)],
    efficiency: opt(5, 3, 30),
    safety: [risk(5, 0.3, 6), risk(27, 0)],
    left: 20,
    myTai: 3,
    maxTenpai: 0.9,
  });
  assert.equal(fold.option.tile, 27);
  assert.equal(fold.stance, 'fold');
  const push = P.choose({
    options: [opt(5, 0, 8), opt(27, 1, 20)],
    efficiency: opt(5, 0, 8),
    safety: [risk(5, 0.06), risk(27, 0)],
    left: 40,
    myTai: 3,
    maxTenpai: 0.7,
  });
  assert.equal(push.option.tile, 5, '已聽牌、放槍不高時照樣進攻');
  assert.equal(push.stance, 'push');
  assert.ok(P.winProb(0, 12, 50) > P.winProb(2, 12, 50), '越接近聽牌越容易胡');
  assert.ok(P.winProb(1, 20, 55) > P.winProb(1, 20, 10), '時間越多越容易胡');
}

// 7. 校準資料（npm run calibrate 產生）合理
if (CAL) {
  assert.ok(CAL.games >= 400, '校準局數太少');
  assert.ok(CAL.wait.base.h[0] > CAL.wait.base.h[3], '生張字牌要比已見 3 張危險');
  assert.ok(CAL.wait.base.n[3] > CAL.wait.base.n[0], '中張要比沒有順子能等的牌危險');
  assert.ok(CAL.wait.factor.avoid < 1, '他一直在打的那門比較安全');
  assert.ok(O.probForKey('3|3|0') > O.probForKey('0|0|0'));
}

console.log('defense 2.0 tests passed');
