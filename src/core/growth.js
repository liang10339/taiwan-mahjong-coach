(function (root) {
  'use strict';
  // 成長報告：從每局的出牌紀錄算出「與教練一致率」、關鍵失誤率、胡牌與放槍率，
  // 並比較最近幾局和之前幾局，指出進步或退步最多的地方。只用本機歷史，不需要網路。

  /** 牌牆剩幾張以上算序盤、中盤（含留的 16 張：配完牌約 79 張，剩 16 張流局，約三等分） */
  const EARLY = 58,
    MID = 37;
  const STAGES = ['序盤', '中盤', '終盤'];
  /** 最近幾局和之前幾局比較 */
  const WINDOW = 10;

  /** 依牌牆剩餘張數分成序盤／中盤／終盤 */
  function stageOf(wall) {
    return wall >= EARLY ? 0 : wall >= MID ? 1 : 2;
  }

  /**
   * 把一局的出牌紀錄整理成一筆歷史（存進本機的欄位）。
   * @param {{judge:{verdict:string}, mistake?:boolean, snapshot?:{wall:number}}[]} turns
   */
  function summarize(turns) {
    const stages = STAGES.map(() => [0, 0]); // 每個階段 [與教練相同, 出牌數]
    for (const x of turns) {
      const s = stages[stageOf(x.snapshot ? x.snapshot.wall : EARLY)];
      s[1]++;
      if (x.judge.verdict === 'best') s[0]++;
    }
    return {
      turns: turns.length,
      good: turns.filter((x) => x.judge.verdict === 'best').length,
      mistakes: turns.filter((x) => x.mistake).length,
      stages,
    };
  }

  const ratio = (a, b) => (b ? a / b : null);
  const sum = (list, f) => list.reduce((n, x) => n + (f(x) || 0), 0);

  /**
   * 一組牌局的統計；舊版紀錄沒有 won／dealIn／stages 欄位時，那一項只用有資料的局計算。
   * @param {any[]} list
   */
  function totals(list) {
    const turns = sum(list, (x) => x.turns),
      known = list.filter((x) => typeof x.won === 'boolean');
    const stages = STAGES.map((_, i) => {
      const good = sum(list, (x) => x.stages && x.stages[i][0]),
        n = sum(list, (x) => x.stages && x.stages[i][1]);
      return { name: STAGES[i], turns: n, rate: ratio(good, n) };
    });
    return {
      hands: list.length,
      turns,
      agreement: ratio(
        sum(list, (x) => x.good),
        turns,
      ),
      mistakesPer100: turns ? (sum(list, (x) => x.mistakes) / turns) * 100 : null,
      winRate: ratio(known.filter((x) => x.won).length, known.length),
      dealInRate: ratio(known.filter((x) => x.dealIn).length, known.length),
      avgDelta: list.length ? sum(list, (x) => x.delta) / list.length : null,
      stages,
    };
  }

  /**
   * 成長報告。history 是最新在前的歷史紀錄（和 localStorage 裡存的順序相同）。
   * series 反過來由舊到新：每局一致率與最近 5 局的移動平均，給趨勢圖用。
   * @param {any[]} history
   */
  function report(history) {
    const list = history.filter((x) => x && x.turns > 0);
    const recent = list.slice(0, WINDOW),
      earlier = list.slice(WINDOW, WINDOW * 2);
    const chrono = list.slice().reverse();
    const series = chrono.map((x, i) => {
      const win = chrono.slice(Math.max(0, i - 4), i + 1);
      return {
        time: x.time,
        rate: x.good / x.turns,
        avg: sum(win, (y) => y.good) / sum(win, (y) => y.turns),
        mistakes: x.mistakes,
      };
    });
    const now = totals(recent),
      before = earlier.length >= 3 ? totals(earlier) : null;
    return { all: totals(list), recent: now, before, series, tips: tips(now, before) };
  }

  /** 依統計給兩三句建議（先講最需要改進的） */
  function tips(now, before) {
    const out = [];
    if (now.agreement === null) return out;
    if (before && before.agreement !== null) {
      const d = Math.round((now.agreement - before.agreement) * 100);
      if (d >= 3) out.push('最近 ' + now.hands + ' 局的一致率比之前高 ' + d + ' 個百分點，進步中。');
      else if (d <= -3) out.push('最近一致率比之前低 ' + -d + ' 個百分點，打慢一點、多看教練的比較。');
    }
    const staged = now.stages.filter((s) => s.rate !== null && s.turns >= 5);
    if (staged.length >= 2) {
      const weak = staged.reduce((a, b) => (b.rate < a.rate ? b : a));
      const strong = staged.reduce((a, b) => (b.rate > a.rate ? b : a));
      if (strong.rate - weak.rate >= 0.1)
        out.push(
          weak.name +
            '最弱（' +
            Math.round(weak.rate * 100) +
            '%），' +
            (weak.name === '序盤'
              ? '多練孤張、字牌的打牌順序。'
              : weak.name === '中盤'
                ? '多練搭子取捨與一向聽的形狀。'
                : '終盤要兼顧聽牌與防守，可到「防守」課程練習。'),
        );
    }
    if (now.mistakesPer100 !== null && now.mistakesPer100 >= 8)
      out.push('每 100 手有 ' + Math.round(now.mistakesPer100) + ' 次關鍵失誤，記得到錯題本複習。');
    if (now.dealInRate !== null && now.hands >= 5 && now.dealInRate >= 0.2)
      out.push('放槍率 ' + Math.round(now.dealInRate * 100) + '% 偏高，別家聽牌時先看安全牌提示。');
    if (!out.length) out.push('表現穩定，繼續保持；可以打開期望值提示練習台數與速度的取捨。');
    return out;
  }

  const api = { summarize, report, totals, stageOf, STAGES, WINDOW, EARLY, MID };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Growth = api;
})(globalThis);
