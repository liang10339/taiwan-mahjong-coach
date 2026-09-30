(function (root) {
  'use strict';
  // 決策核心：教練所有「建議打哪張、要不要吃碰」都從這裡出來，畫面、覆盤、錯題本只負責顯示。
  // 以前吃碰卡片、出牌標題、場況判斷各算各的，會出現「建議吃完打 8 索，吃完卻改說打東」的矛盾；
  // 現在吃碰的「吃完打哪張」是把吃碰後的局面真的做出來，再問同一個 decide()，所以一定一致。
  //
  // 流程：候選牌（牌效率）→ 並列時依教學口訣取捨（leadOrder）→ 三家聽牌機率（opponents.js）
  //       → 每張牌放槍機率（safety.js）→ 攻守期望值選牌（policy.js）→ 場況解說（situation.js）。
  const node = typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.Mahjong,
    C = node ? require('./coach.js') : root.Coach,
    O = node ? require('./opponents.js') : root.Opponents,
    Safety = node ? require('./safety.js') : root.Safety,
    P = node ? require('./policy.js') : root.Policy,
    S = node ? require('./situation.js') : root.Situation;
  const CAL = node ? require('./data/calibration.js') : root.Calibration;

  /** 自己胡牌大約幾台：自戰的平均台數，莊家再加莊家與連莊 @param {Game} g @param {number} p */
  function myTai(g, p) {
    return ((CAL && CAL.avgTai) || 3) + (g.dealer === p ? 1 + 2 * (g.streak || 0) : 0);
  }

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
   * efficiency：只看牌效率（並列時依口訣）的首選；tile／option：攻守期望值選出的最後建議。
   * @param {Game} g @param {number} [p] @param {{base?: number}} [opts] base：底換算成幾台
   */
  function decide(g, p = 0, opts = {}) {
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
    const opps = O.read(g, p),
      safety = Safety.evaluate(g, p, opps);
    const plan = P.choose({
      options,
      efficiency,
      safety,
      left: O.drawable(g),
      myTai: myTai(g, p),
      base: opts.base,
      dealerExtra: g.dealer === p ? 1 + 2 * (g.streak || 0) : 0,
      maxTenpai: Math.max(...opps.map((o) => o.tenpai)),
    });
    const situation = S.read(g, p, { options, lead: efficiency, opps, safety, plan });
    const option = plan.option;
    return {
      ctx,
      options,
      tied,
      efficiency,
      option,
      tile: option.tile,
      situation,
      stance: plan.stance,
      folding: option.tile !== efficiency.tile, // 為了防守改打效率首選以外的牌
      plan,
      opps,
      safety,
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
   * @param {Game} g @param {number} [p] @param {{base?: number}} [opts]
   */
  function claims(g, p = 0, opts = {}) {
    return C.claimDecision(g, p, (action) => {
      const h = afterClaim(g, p, action);
      const d = h && decide(h, p, opts);
      return d
        ? {
            option: d.option,
            fold: P.holdBackClaim({
              stance: d.stance,
              efficiency: d.efficiency,
              maxTenpai: Math.max(...d.opps.map((o) => o.tenpai)),
            }),
          }
        : null;
    });
  }

  const api = { decide, claims, context, afterClaim, valueTiles, myTai };
  if (node) module.exports = api;
  else root.Advisor = api;
})(globalThis);
