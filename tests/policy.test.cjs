// 攻守取捨（src/core/policy.js）：之後幾巡的放槍代價（守到底）與做台數。
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/core/policy.js');

const ctx = (over) => ({
  left: 40,
  pressure: 1,
  payout: 5,
  weight: 1,
  safeTiles: new Set([27]),
  safeStock: 2,
  ...over,
});

test('繼續進攻：之後每巡都有風險，牌牆快摸完時剩下的巡數少', () => {
  const early = P.futureLoss({ tile: 5, shanten: 1 }, true, ctx()),
    late = P.futureLoss({ tile: 5, shanten: 1 }, true, ctx({ left: 8 }));
  assert.ok(early > late && late > 0);
  // 同樣的巡數，守（有安全牌）一定比攻便宜
  assert.ok(P.futureLoss({ tile: 5, shanten: 3 }, false, ctx()) < early);
});

test('改守：手上安全牌越多，之後越安全；沒人聽牌就不算', () => {
  const rich = P.futureLoss({ tile: 5, shanten: 3 }, false, ctx({ safeStock: 5 })),
    poor = P.futureLoss({ tile: 5, shanten: 3 }, false, ctx({ safeStock: 0 }));
  assert.ok(poor > rich);
  // 打掉的正是安全牌，就少一張可以留著的
  const spend = P.futureLoss({ tile: 27, shanten: 3 }, false, ctx({ safeStock: 1 })),
    keep = P.futureLoss({ tile: 5, shanten: 3 }, false, ctx({ safeStock: 1 }));
  assert.ok(spend > keep);
  assert.equal(P.futureLoss({ tile: 5, shanten: 3 }, true, ctx({ pressure: 0 })), 0);
});

test('有人很可能聽牌、自己還差很遠：之後的放槍代價讓守比較划算', () => {
  const eff = { tile: 5, shanten: 2, remaining: 20 },
    safe = { tile: 27, shanten: 3, remaining: 30 };
  const input = {
    options: [eff, safe],
    efficiency: eff,
    safety: [
      { tile: 5, dealIn: 0.1, per: [{ p: 0.1, tai: 2 }] },
      { tile: 27, dealIn: 0, per: [] },
    ],
    left: 30,
    myTai: 2,
    hand: [5, 27, 27, 27],
    pressure: 1.5,
  };
  const now = P.choose({ ...input, margin: 0.15, future: 0 }),
    later = P.choose({ ...input, margin: 0.15, future: 1 });
  // 只看這一張會硬攻；算進之後幾巡，改打安全牌守
  assert.equal(now.option.tile, 5);
  assert.equal(later.option.tile, 27);
  assert.equal(later.stance, 'fold');
  assert.ok(later.chosen.ev - now.chosen.ev <= 0, '算進之後的代價，期望值只會更低');
});

test('預設值：換牌門檻 0.3、守到底權重 0（v2.9 掃描與驗證結果，見 policy.js 註解）', () => {
  assert.equal(P.CHOOSE_MARGIN, 0.3);
  assert.equal(P.FUTURE_WEIGHT, 0);
  assert.equal(P.MARGIN, 0.15);
});
