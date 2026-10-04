(function (root) {
  'use strict';
  // 錯題本：實戰中的關鍵失誤存成「這手要打哪張？」的題目，依間隔重複（萊特納盒）安排複習。
  // 答對就放進下一盒、隔更久再出；答錯回到最前面、十分鐘後再考一次。第五盒答對就算熟練。
  // 題目只存當時看得到的資訊與決策報告，複習沿用當時的攻守評估，合理替代選擇也算對。
  // 舊題目沒有報告，保留牌效率評分並明確標示，避免把缺少的攻守資訊當成已知。
  const E = typeof module !== 'undefined' ? require('./engine.js') : root.Mahjong;
  const C = typeof module !== 'undefined' ? require('./coach.js') : root.Coach;

  const DAY = 24 * 60 * 60 * 1000;
  /** 各盒答對後隔多久再出：第 1 盒隔 1 天、第 2 盒 3 天、第 3 盒 7 天、第 4 盒 21 天 */
  const INTERVALS = [0, DAY, 3 * DAY, 7 * DAY, 21 * DAY];
  /** 在最後一盒答對就算熟練，不再出題 */
  const MASTERED = INTERVALS.length;
  /** 答錯後多久再考一次 */
  const RETRY = 10 * 60 * 1000;
  /** 熟練的題目不再出現（用很大的數字而不是 Infinity，存成 JSON 才不會變成 null） */
  const NEVER = Number.MAX_SAFE_INTEGER;
  /** 最多保留幾題（超過時先刪熟練的，再刪最舊的） */
  const LIMIT = 200;

  /**
   * @typedef {{id: string, hand: number[], open: number, melds: number[][], pub: number[], played: number,
   *   box: number, due: number, created: number, seen: number, right: number, label?: string,
   *   kind?: string, winner?: string, answers?: number[], safety?: {tile: number, dealIn: number, text: string}[],
   *   decision?: any, rules?: any, context?: any, skills?: string[]}} NoteItem
   */

  /** JSON 存檔不保留參考；固定物件欄位順序，使相同局面不受建立順序影響。 */
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, stable(value[key])]),
      );
    return value;
  }

  /** 去重包含實際公開張數、桌規、攻守背景與報告，不把不同局勢合成同一題。 */
  function identity({
    hand,
    open,
    melds,
    pub,
    played,
    rules,
    context,
    decision,
    kind = 'decision',
    safety = [],
  }) {
    const counts = Array(42).fill(0);
    pub.forEach((tile) => counts[tile]++);
    return JSON.stringify(
      stable({
        kind,
        hand: hand.slice().sort((a, b) => a - b),
        open,
        melds: melds
          .map((m) => m.slice().sort((a, b) => a - b))
          .sort((a, b) => a.join(',').localeCompare(b.join(','))),
        pub: counts,
        played,
        rules: rules || null,
        context: context || null,
        decision: decision || null,
        safety,
      }),
    );
  }

  /** 從一次失誤建立題目 */
  function fromMistake({
    hand,
    open = 0,
    melds = [],
    pub = [],
    played,
    decision = null,
    rules = null,
    context = null,
    label = '',
    skills = [],
    time = Date.now(),
  }) {
    const savedDecision = decision ? JSON.parse(JSON.stringify(decision)) : null;
    const savedRules = rules ? JSON.parse(JSON.stringify(rules)) : null;
    const savedContext = context ? JSON.parse(JSON.stringify(context)) : null;
    return {
      id: identity({
        hand,
        open,
        melds,
        pub,
        played,
        rules: savedRules,
        context: savedContext,
        decision: savedDecision,
      }),
      hand: hand.slice(),
      open,
      melds: melds.map((m) => m.slice()),
      pub: pub.slice(),
      played,
      decision: savedDecision,
      rules: savedRules,
      context: savedContext,
      label,
      skills: skills.slice(), // 這題考的技能（skills.js），給「針對練習」篩選
      box: 0,
      due: time, // 新題目馬上可以複習
      created: time,
      seen: 0,
      right: 0,
    };
  }

  /**
   * 從一次放槍建立防守題：「這手打哪張最安全？」。
   * 放槍機率在當時就算好存起來（牌局之後不在了），answers 是當時最安全的牌（容許 0.5% 以內並列）。
   * 只練防守；實戰可能值得進攻，放槍結果本身不代表決策錯誤。
   * @param {{hand: number[], open?: number, melds?: number[][], pub?: number[], played: number,
   *   safety: {tile: number, dealIn: number, text: string}[], winner?: string, label?: string, time?: number}} x
   */
  function fromDealIn({
    hand,
    open = 0,
    melds = [],
    pub = [],
    played,
    safety,
    winner = '',
    label = '',
    time = Date.now(),
  }) {
    const min = Math.min(...safety.map((r) => r.dealIn));
    const savedSafety = safety.map((r) => ({ tile: r.tile, dealIn: r.dealIn, text: r.text }));
    return {
      ...fromMistake({ hand, open, melds, pub, played, label, time, skills: ['defense'] }),
      id: identity({
        hand,
        open,
        melds,
        pub,
        played,
        rules: null,
        context: null,
        decision: null,
        kind: 'defense',
        safety: savedSafety,
      }),
      kind: 'defense',
      winner,
      answers: safety.filter((r) => r.dealIn <= min + 0.005).map((r) => r.tile),
      safety: savedSafety,
    };
  }

  /** 加入題目；同一個局面不重複加入 @param {NoteItem[]} book */
  function add(book, item) {
    if (book.some((x) => x.id === item.id)) return book;
    const next = [item, ...book];
    if (next.length <= LIMIT) return next;
    const learning = next.filter((x) => x.box < MASTERED);
    const mastered = next.filter((x) => x.box >= MASTERED);
    return [...learning, ...mastered].slice(0, LIMIT);
  }

  /** 現在該複習的題目（最早到期的先出） @param {NoteItem[]} book */
  function due(book, now = Date.now()) {
    return book.filter((x) => x.box < MASTERED && x.due <= now).sort((a, b) => a.due - b.due);
  }

  /** 題目數、待複習數、已熟練數 @param {NoteItem[]} book */
  function stats(book, now = Date.now()) {
    return {
      total: book.length,
      due: due(book, now).length,
      mastered: book.filter((x) => x.box >= MASTERED).length,
    };
  }

  /**
   * 評分：使用實戰決策報告；舊題目才重新比較牌效率。
   * @param {NoteItem} item
   * @param {number} tile 這次選的牌
   */
  function check(item, tile) {
    if (item.kind === 'defense') return checkDefense(item, tile);
    if (item.decision && Array.isArray(item.decision.assessments)) return checkDecision(item, tile);
    const options = E.analyze(item.hand, item.pub, item.open, new Map(), item.rules || undefined);
    const explain = C.explainTurn(item.hand, options, {
      publicTiles: item.pub,
      open: item.open,
      rules: item.rules || undefined,
    });
    const best = explain.best,
      tied = explain.tied.map((o) => o.tile),
      correct = tied.includes(tile);
    return {
      correct,
      basis: 'legacy-efficiency',
      answers: tied,
      best: best.tile,
      judge: C.judge(options, tile, best).text,
      lines: ['舊題目未保存攻守報告，本題僅依牌效率評分，不代表當時的攻守最佳選擇。', ...explain.lines],
      options: options.slice(0, 4),
    };
  }

  /** 沿用已保存的判斷，讓復習與實戰一致，也避免日後改版重新定義舊局的正解。 */
  function checkDecision(item, tile) {
    const report = item.decision;
    const mine = report.assessments.find((assessment) => assessment.tile === tile);
    const answers = report.assessments
      .filter((assessment) => ['best', 'close'].includes(assessment.verdict))
      .map((assessment) => assessment.tile);
    const lines = ['依當時保存的攻守綜合評估作答；推薦與合理替代選擇都算對。'];
    if (report.rationale) lines.push(report.rationale);
    if (mine && typeof mine.reason === 'string' && mine.reason) lines.push(mine.reason);
    return {
      correct: answers.includes(tile),
      basis: 'decision',
      answers,
      best: report.recommended,
      judge: mine ? mine.text : '這張牌沒有保存當時的評估，無法判定。',
      lines,
      options: (report.options || []).slice(0, 4),
    };
  }

  /** 防守題的評分：用當時存下的放槍機率 */
  function checkDefense(item, tile) {
    const answers = item.answers || [],
      correct = answers.includes(tile),
      byTile = new Map((item.safety || []).map((r) => [r.tile, r]));
    const best = answers[0],
      mine = byTile.get(tile),
      played = byTile.get(item.played);
    const lines = ['本題只練習找安全牌；放槍不等於打錯，實戰仍需衡量自己的胡牌機會與牌值。'];
    if (played)
      lines.push(
        '當時你打' +
          C.label(item.played) +
          (item.winner ? '放槍給' + item.winner : '放槍') +
          '：' +
          played.text,
      );
    if (byTile.get(best)) lines.push('最安全：' + byTile.get(best).text);
    if (mine && !correct && tile !== item.played) lines.push('你這次選的：' + mine.text);
    return {
      correct,
      basis: 'defense',
      answers,
      best,
      judge: correct ? '答對了：這張是當時最安全的牌。' : '這張不是最安全的牌。',
      lines,
      options: [],
    };
  }

  /**
   * 記錄作答結果並安排下次複習；回傳更新後的錯題本（不改動原陣列）。
   * @param {NoteItem[]} book
   */
  function answer(book, id, correct, now = Date.now()) {
    return book.map((x) => {
      if (x.id !== id) return x;
      const box = correct ? x.box + 1 : 0;
      return {
        ...x,
        box,
        seen: x.seen + 1,
        right: x.right + (correct ? 1 : 0),
        due: !correct ? now + RETRY : box >= MASTERED ? NEVER : now + INTERVALS[box],
      };
    });
  }

  const api = {
    fromMistake,
    fromDealIn,
    add,
    due,
    stats,
    check,
    answer,
    INTERVALS,
    MASTERED,
    LIMIT,
    DAY,
    RETRY,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Notebook = api;
})(globalThis);
