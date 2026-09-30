(function (root) {
  'use strict';
  // 防守 2.0：估計打出每張牌「放槍的機率」，並說出理由。
  // 對每一家：放槍機率 ≈ 他聽牌的機率（opponents.js）× 這張正好是他要的牌的機率。
  // 「是他要的牌」的機率依牌的種類與場上線索分組，數字來自 scripts/calibrate.cjs 的自戰統計：
  //   - 一定安全：他手牌沒換過期間放過的牌、他正在過水（打出下一張前不能胡別人的牌）
  //   - 壁：某張牌四張都看得到，需要它的順子就不存在（例如四張 3萬 都出現，1萬2萬、2萬4萬 等不到）
  //   - 字牌見張數：見 3 張只剩單吊，見 2 張不能對碰
  //   - 么九、2/8、中張：能組成的順子越多越危險
  //   - 他最近手切的牌附近、他攤牌做一色的那門與字牌 → 較危險；他一直在打的那門 → 較安全
  const node = typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.Mahjong,
    O = node ? require('./opponents.js') : root.Opponents;
  const CAL = node ? require('./data/calibration.js') : root.Calibration;
  const label = (t) => (t === 33 ? '白板' : E.names[t]);
  const SUITS = ['萬子', '筒子', '條子'];

  /** 沒有統計資料時，各類牌是對方要的牌的預設比例 */
  const DEFAULT_BASE = { h: [0.12, 0.1, 0.06, 0.03], n: [0.02, 0.06, 0.1, 0.14] };
  const DEFAULT_FACTOR = { nearCut: 1.6, suitHit: 1.8, avoid: 0.6 };

  /** viewer 看得到的張數（自己的手牌＋公開的牌） */
  function visibleCounts(g, viewer) {
    const c = Array(34).fill(0);
    for (const t of [...g.hands[viewer], ...E.publicTiles(g, viewer)]) if (t < 34) c[t]++;
    return c;
  }

  /** 數字牌 t 能被哪些順子搭子等到：[需要的兩張]（兩面、嵌張、邊張都算） */
  function sequenceWaits(t) {
    const base = Math.floor(t / 9) * 9,
      r = t - base,
      out = [];
    if (r >= 2) out.push([t - 2, t - 1]);
    if (r >= 1 && r <= 7) out.push([t - 1, t + 1]);
    if (r <= 6) out.push([t + 1, t + 2]);
    return out;
  }

  /**
   * 一張牌對某一家的分類特徵（校準與實戰共用）。
   * @param {number} t @param {number[]} seen viewer 看得到的張數 @param {any} o opponents.read() 的一家
   */
  function tileFeatures(t, seen, o) {
    const unseen = (x) => Math.max(0, 4 - seen[x]);
    if (t >= 27)
      return {
        kind: 'h',
        bucket: Math.min(3, seen[t]),
        walls: 0,
        nearCut: false,
        suitHit: o.reading.oneSuit !== null,
        avoid: false,
      };
    const ways = sequenceWaits(t),
      alive = ways.filter(([a, b]) => unseen(a) > 0 && unseen(b) > 0).length,
      walls = ways.length - alive;
    const suit = Math.floor(t / 9);
    return {
      kind: 'n',
      bucket: alive, // 還能等到這張的順子種類 0～3
      walls,
      nearCut: o.handCuts.some(
        (c) => c < 27 && Math.floor(c / 9) === suit && Math.abs(c - t) <= 2 && c !== t,
      ),
      suitHit: o.reading.oneSuit === suit,
      avoid: o.reading.avoid === suit,
    };
  }

  /** 這張是某一家要的牌的機率（假設他已聽牌） */
  function waitProb(f) {
    const base = (CAL && CAL.wait && CAL.wait.base) || DEFAULT_BASE,
      factor = (CAL && CAL.wait && CAL.wait.factor) || DEFAULT_FACTOR;
    let p = base[f.kind][f.bucket];
    if (f.nearCut) p *= factor.nearCut;
    if (f.suitHit) p *= factor.suitHit;
    if (f.avoid) p *= factor.avoid;
    return Math.min(0.9, p);
  }

  /** 一張牌對某一家的判斷與理由 */
  function versus(g, t, seen, o) {
    const who = ['', '下家', '對家', '上家'][o.rel];
    if (o.passed.has(t))
      return {
        q: o.q,
        rel: o.rel,
        p: 0,
        safe: true,
        reasons: [who + '手牌沒換過的期間放過' + label(t) + '，現在也不會胡'],
      };
    if (o.water)
      return {
        q: o.q,
        rel: o.rel,
        p: 0,
        safe: true,
        reasons: [who + '正在過水：他打出下一張牌前不能胡別人打的牌'],
      };
    if (t >= 27 && seen[t] >= 4)
      return {
        q: o.q,
        rel: o.rel,
        p: 0,
        safe: true,
        reasons: ['四張' + label(t) + '都看得到，沒有人能用它胡'],
      };
    const f = tileFeatures(t, seen, o),
      wait = waitProb(f),
      reasons = [];
    // 見張數包含你手上要打的這張
    if (f.kind === 'h') {
      if (f.bucket >= 3) reasons.push('連你這張共見 3 張' + label(t) + '，他最多只有一張，只可能單吊');
      else if (f.bucket === 2) reasons.push('連你這張共見 2 張' + label(t) + '，單吊、對碰都還有可能');
      else reasons.push(label(t) + '是生張字牌，單吊、對碰都有可能');
    } else {
      if (f.walls) reasons.push('壁：' + f.walls + ' 種順子搭子因為旁邊的牌都看得到而不成立');
      if (f.bucket === 0) reasons.push('順子等不到' + label(t) + '，只剩單吊或對碰');
      else if (f.bucket === 3) reasons.push(label(t) + '是中張，兩面、嵌張都能等到');
    }
    // 下面三種線索只有在自戰統計確實有差時才講（倍數明顯偏離 1），避免把沒根據的說法當理由
    const factor = (CAL && CAL.wait && CAL.wait.factor) || DEFAULT_FACTOR;
    if (f.nearCut && factor.nearCut >= 1.1)
      reasons.push(
        who +
          '最近手切了' +
          o.handCuts
            .filter((c) => Math.abs(c - t) <= 2)
            .map(label)
            .join('、') +
          '，附近的牌較危險',
      );
    if (f.avoid && factor.avoid <= 0.9)
      reasons.push(who + '一直在打' + SUITS[Math.floor(t / 9)] + '，多半不做這門');
    if (f.suitHit && factor.suitHit >= 1.1)
      reasons.push(who + '攤牌在做一色，' + (t >= 27 ? '字牌' : SUITS[Math.floor(t / 9)]) + '較危險');
    return { q: o.q, rel: o.rel, p: o.tenpai * wait, wait, safe: false, reasons };
  }

  /**
   * viewer 手上每張牌打出去的放槍機率（由低到高排好），附各家的判斷與理由。
   * @param {Game} g @param {number} [viewer] @param {any[]} [opps] opponents.read() 的結果（沒給就現算）
   */
  function evaluate(g, viewer = 0, opps = O.read(g, viewer)) {
    const seen = visibleCounts(g, viewer),
      tiles = [...new Set(g.hands[viewer])];
    return tiles
      .map((t) => {
        const per = opps.map((o) => ({ ...versus(g, t, seen, o), tai: o.tai, tenpai: o.tenpai }));
        const dealIn = 1 - per.reduce((keep, x) => keep * (1 - x.p), 1);
        // 放槍的預期損失（台）：各家放槍機率 × 他胡牌的台數
        const loss = per.reduce((n, x) => n + x.p * x.tai, 0);
        return { tile: t, dealIn, loss, per };
      })
      .sort((a, b) => a.dealIn - b.dealIn || a.tile - b.tile);
  }

  /** 一張牌的放槍機率寫成文字（例如「約 3%」） */
  function percent(p) {
    return p < 0.005
      ? '幾乎 0%'
      : p < 0.1
        ? '約 ' + Math.round(p * 1000) / 10 + '%'
        : '約 ' + Math.round(p * 100) + '%';
  }

  /** 一定安全的理由：同一種理由的幾家合併成一句（例如「下家、對家都放過東」） */
  function safeReasons(r) {
    const names = ['', '下家', '對家', '上家'];
    const safe = r.per.filter((x) => x.safe),
      passed = safe.filter((x) => /放過/.test(x.reasons[0])).map((x) => names[x.rel]),
      others = safe.filter((x) => !/放過/.test(x.reasons[0])).map((x) => x.reasons[0]);
    return [
      ...(passed.length ? [passed.join('、') + '在手牌沒換過的期間都放過' + label(r.tile)] : []),
      ...new Set(others),
    ];
  }

  /**
   * 給人看的一句話：這張牌最需要注意哪一家、為什麼。
   * @param {{tile:number, dealIn:number, per:any[]}} r evaluate() 的一筆
   */
  function explain(r) {
    const worst = r.per.slice().sort((a, b) => b.p - a.p)[0];
    const who = ['', '下家', '對家', '上家'][worst.rel];
    if (r.per.every((x) => x.safe))
      return label(r.tile) + '：三家都不會胡（' + safeReasons(r).join('；') + '）';
    return (
      label(r.tile) +
      '：放槍' +
      percent(r.dealIn) +
      (worst.p > 0.005
        ? '，最要小心' +
          who +
          '（聽牌機率' +
          percent(worst.tenpai) +
          (worst.reasons.length ? '；' + worst.reasons.join('；') : '') +
          '）'
        : worst.reasons.length
          ? '（' + worst.reasons.join('；') + '）'
          : '')
    );
  }

  const api = {
    evaluate,
    explain,
    safeReasons,
    percent,
    versus,
    tileFeatures,
    waitProb,
    visibleCounts,
    sequenceWaits,
    DEFAULT_BASE,
    DEFAULT_FACTOR,
  };
  if (node) module.exports = api;
  else root.Safety = api;
})(globalThis);
