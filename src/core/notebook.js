(function (root) {
  'use strict';
  // 錯題本：實戰中的關鍵失誤存成「這手要打哪張？」的題目，依間隔重複（萊特納盒）安排複習。
  // 答對就放進下一盒、隔更久再出；答錯回到最前面、十分鐘後再考一次。第五盒答對就算熟練。
  // 題目只存當時看得到的資訊（自己的手牌、攤牌數、公開的牌），複習時用教練同一套算法重新評分，
  // 所以效率並列最佳的牌都算對，教練的解說也和實戰時一致。
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
   *   kind?: string, winner?: string, answers?: number[], safety?: {tile: number, dealIn: number, text: string}[]}} NoteItem
   */

  /** 從一次失誤建立題目 */
  function fromMistake({ hand, open = 0, melds = [], pub = [], played, label = '', time = Date.now() }) {
    return {
      id:
        hand
          .slice()
          .sort((a, b) => a - b)
          .join(',') +
        '|' +
        pub.length +
        '|' +
        played,
      hand: hand.slice(),
      open,
      melds: melds.map((m) => m.slice()),
      pub: pub.slice(),
      played,
      label,
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
    return {
      ...fromMistake({ hand, open, melds, pub, played, label, time }),
      id:
        'def|' +
        hand
          .slice()
          .sort((a, b) => a - b)
          .join(',') +
        '|' +
        pub.length +
        '|' +
        played,
      kind: 'defense',
      winner,
      answers: safety.filter((r) => r.dealIn <= min + 0.005).map((r) => r.tile),
      safety: safety.map((r) => ({ tile: r.tile, dealIn: r.dealIn, text: r.text })),
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
   * 評分：用教練的算法重新比較，回傳是否答對、正確答案（並列最佳都算）與解說。
   * @param {NoteItem} item
   * @param {number} tile 這次選的牌
   */
  function check(item, tile) {
    if (item.kind === 'defense') return checkDefense(item, tile);
    const options = E.analyze(item.hand, item.pub, item.open);
    const explain = C.explainTurn(item.hand, options, { publicTiles: item.pub, open: item.open });
    const best = explain.best,
      tied = explain.tied.map((o) => o.tile),
      correct = tied.includes(tile);
    return {
      correct,
      answers: tied,
      best: best.tile,
      judge: C.judge(options, tile, best).text,
      lines: explain.lines,
      options: options.slice(0, 4),
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
    const lines = [];
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
