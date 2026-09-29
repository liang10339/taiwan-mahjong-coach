(function (root) {
  'use strict';
  // 決策核心：教練所有「建議打哪張、要不要吃碰」都從這裡出來，畫面、覆盤、錯題本只負責顯示。
  // 以前吃碰卡片、出牌標題、場況判斷各算各的，會出現「建議吃完打 8 索，吃完卻改說打東」的矛盾；
  // 現在吃碰的「吃完打哪張」是把吃碰後的局面真的做出來，再問同一個 decide()，所以一定一致。
  //
  // 流程：候選牌（牌效率）→ 並列時依教學口訣取捨（leadOrder）→ 讀場況 → 決定最後打哪張。
  const node = typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.Mahjong,
    C = node ? require('./coach.js') : root.Coach,
    S = node ? require('./situation.js') : root.Situation;

  /** 對 p 有台的字牌：三元牌、門風、圈風 @param {Game} g @param {number} p */
  function valueTiles(g, p) {
    return [31, 32, 33, 27 + E.seatWind(g, p), 27 + (g.roundWind || 0)];
  }

  /**
   * 解說與取捨需要的背景：全部由牌局狀態算出，所以同一個局面永遠得到同一個答案。
   * @param {Game} g @param {number} p
   */
  function context(g, p) {
    const f = g.fresh;
    return {
      drawn: f && f.player === p ? f.tile : null,
      publicTiles: E.publicTiles(g, p),
      open: g.melds[p].length,
      value: valueTiles(g, p),
      nextRiver: g.rivers[(p + 1) % 4],
    };
  }

  /**
   * 輪到 p 出牌時的完整建議。
   * efficiency：只看牌效率（並列時依口訣）的首選；tile／option：最後建議打的牌（可能因為要守而不同）。
   * @param {Game} g @param {number} [p]
   */
  function decide(g, p = 0) {
    const ctx = context(g, p),
      hand = g.hands[p],
      options = E.analyze(hand, ctx.publicTiles, ctx.open);
    if (!options.length) return null;
    const tied = C.leadOrder(
      hand,
      options.filter((o) => C.same(o, options[0])),
      ctx.drawn,
      ctx,
    );
    const efficiency = tied[0];
    const situation = S.read(g, p, options, efficiency);
    const guard = situation.stance === 'fold' && situation.guard ? situation.guard.tile : null;
    const option = guard === null ? efficiency : options.find((o) => o.tile === guard) || efficiency;
    return {
      ctx,
      options,
      tied,
      efficiency,
      option,
      tile: option.tile,
      situation,
      stance: situation.stance,
      folding: option !== efficiency,
    };
  }

  /**
   * 假設 p 做了這個吃／碰，其他人都略過：回傳吃碰後、輪到 p 出牌的局面（做不到就回傳 null）。
   * @param {Game} g @param {number} p @param {any} action
   */
  function afterClaim(g, p, action) {
    const h = structuredClone(g);
    if (!E.respond(h, p, action)) return null;
    for (let q = 0; q < 4 && h.phase === 'claim'; q++)
      if (h.pending && !h.pending.decisions[q]) E.respond(h, q, { type: 'pass' });
    return h.phase === 'discard' && h.turn === p ? h : null;
  }

  /**
   * 吃碰槓胡的建議：吃碰後要打的牌，由吃碰後的局面呼叫 decide() 決定。
   * 吃碰後的局勢是「先守」時不建議吃碰：攤牌會暴露手牌、少了安全牌，也破壞門清。
   * @param {Game} g @param {number} [p]
   */
  function claims(g, p = 0) {
    return C.claimDecision(g, p, (action) => {
      const h = afterClaim(g, p, action);
      const d = h && decide(h, p);
      return d ? { option: d.option, fold: d.stance === 'fold' } : null;
    });
  }

  const api = { decide, claims, context, afterClaim, valueTiles };
  if (node) module.exports = api;
  else root.Advisor = api;
})(globalThis);
