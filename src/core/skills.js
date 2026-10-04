(function (root) {
  'use strict';
  // 技能標籤：每一手出牌、每一次吃碰判斷，標上它考的是哪一種技能，
  // 累積起來就知道「哪一種判斷最常和教練不同」，再針對那一種出練習題。
  // 標籤只看決策當下的局面（advisor.js 的決定），和打得好不好無關；好不好由覆盤評分決定。

  /** 技能名稱與說明 */
  const SKILLS = {
    isolated: { name: '孤張順序', tip: '沒有搭子的單張：字牌、么九先打，靠近中間的留著' },
    shape: { name: '搭子取捨', tip: '拆哪一組搭子：留兩面、捨邊張嵌張，數有效牌張數' },
    tenpai: { name: '聽牌選擇', tip: '聽哪一種牌：比剩下張數，也比胡了的台數' },
    value: { name: '台數取捨', tip: '速度差不多時，留住字牌對、一色、門清' },
    defense: { name: '防守判斷', tip: '有人很可能聽牌時，先看這張的放槍機率與之後還有沒有安全牌' },
    claim: { name: '吃碰判斷', tip: '吃碰要讓牌變快，也要算進少掉的門清台與防守彈性' },
  };
  /** 一種技能要累積幾手才評「熟練度」 */
  const MIN_SAMPLES = 8;
  /** 最近幾手和教練相同的比例達到多少算熟練 */
  const MASTERED = 0.85;

  /** 這張牌在手上是不是孤張：只有一張、同一門前後兩張內沒有別的牌 */
  function isolated(hand, t) {
    if (hand.filter((x) => x === t).length !== 1) return false;
    if (t >= 27) return true;
    const suit = Math.floor(t / 9);
    return !hand.some((x) => x !== t && x < 27 && Math.floor(x / 9) === suit && Math.abs(x - t) <= 2);
  }

  /**
   * 一手出牌考的技能（可能不只一種）。d 是 advisor.decide() 的結果，hand 是出牌前的手牌。
   * @param {any} d @param {number[]} [hand]
   * @returns {string[]}
   */
  function ofDecision(d, hand) {
    if (!d) return [];
    const tags = [];
    const maxTenpai = Math.max(0, ...(d.opps || []).map((o) => o.tenpai));
    // 攻守：換成比較安全的牌，或場上有人很可能聽牌
    if (d.folding || d.stance === 'fold' || maxTenpai >= 0.5) tags.push('defense');
    // 台數：為了台數換牌，或同進聽數的候選牌胡了台數差一台以上
    if (d.forValue || valueSpread(d) >= 1) tags.push('value');
    if (d.option.shanten === 0) tags.push('tenpai');
    else if (hand && isolated(hand, d.efficiency.tile)) tags.push('isolated');
    else tags.push('shape');
    return tags;
  }

  /** 和效率首選同進聽數的候選牌，胡了的台數最多差多少 */
  function valueSpread(d) {
    if (!d.worth) return 0;
    const tai = d.options
      .filter((o) => o.shanten === d.efficiency.shanten)
      .map((o) => d.worth.get(o.tile))
      .filter(Boolean)
      .map((w) => (w.tai.ron + w.tai.tsumo) / 2);
    return tai.length ? Math.max(...tai) - Math.min(...tai) : 0;
  }

  /**
   * 把出牌與吃碰紀錄整理成每種技能的 [和教練相同, 次數]。
   * turns：出牌紀錄（有 skills 與 judge.verdict）；claims：吃碰紀錄（有 agree）。
   */
  function tally(turns = [], claims = []) {
    /** @type {Record<string, [number, number]>} */
    const out = {};
    const add = (tag, good) => {
      const row = out[tag] || (out[tag] = [0, 0]);
      row[0] += good ? 1 : 0;
      row[1]++;
    };
    for (const x of turns) for (const tag of x.skills || []) add(tag, x.judge && x.judge.verdict === 'best');
    for (const c of claims) if (typeof c.agree === 'boolean') add('claim', c.agree);
    return out;
  }

  /**
   * 熟練度：合併多局的技能統計（history 最新在前，只看最近 limit 局），
   * 回傳每種技能的次數、一致率、狀態（練習中／熟練／樣本不足），最弱的排前面。
   * @param {any[]} history @param {number} [limit]
   */
  function mastery(history, limit = 20) {
    /** @type {Record<string, [number, number]>} */
    const sum = {};
    for (const h of history.slice(0, limit))
      for (const [tag, [good, n]] of Object.entries(h.skills || {})) {
        const row = sum[tag] || (sum[tag] = [0, 0]);
        row[0] += good;
        row[1] += n;
      }
    return Object.keys(SKILLS)
      .map((tag) => {
        const [good, n] = sum[tag] || [0, 0];
        const rate = n ? good / n : null;
        const status = n < MIN_SAMPLES ? 'few' : rate >= MASTERED ? 'mastered' : 'practice';
        return { tag, name: SKILLS[tag].name, tip: SKILLS[tag].tip, good, n, rate, status };
      })
      .sort(
        (a, b) =>
          (a.status === 'few' ? 1 : 0) - (b.status === 'few' ? 1 : 0) ||
          (a.rate ?? 1) - (b.rate ?? 1) ||
          b.n - a.n,
      );
  }

  /** 最需要練習的技能（樣本足夠、還沒熟練、一致率最低）；沒有就回傳 null */
  function weakest(history) {
    return mastery(history).find((m) => m.status === 'practice') || null;
  }

  const api = { SKILLS, MIN_SAMPLES, MASTERED, isolated, ofDecision, valueSpread, tally, mastery, weakest };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Skills = api;
})(globalThis);
