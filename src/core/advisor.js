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
    S = node ? require('./situation.js') : root.Situation,
    HV = node ? require('./handvalue.js') : root.HandValue;
  const CAL = node ? require('./data/calibration.js') : root.Calibration;
  const Observation = node ? require('./observation.js') : root.Observation;
  const VERSION = 1;

  const BASE = 2.5; // 預設 50 底 20 台
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
      rules: g.rules,
    };
  }

  /**
   * 每張候選牌打出後，剩下的手牌胡了大約幾台、收入多少（含底，自摸與胡別人加權）。
   * @returns {Map<number, {tai: {ron: number, tsumo: number, items: any[], exact: boolean}, income: number}>}
   */
  function incomeByTile(g, p, hand, options, publicTiles, base) {
    const out = new Map(),
      share = (CAL && CAL.tsumoShare) || 0.4;
    for (const o of options) {
      if (out.has(o.tile)) continue;
      const rest = hand.slice();
      rest.splice(rest.indexOf(o.tile), 1);
      const tai = HV.estimate(g, p, rest, { shanten: o.shanten, publicTiles });
      out.set(o.tile, { tai, income: HV.income(g, p, tai, base, share) });
    }
    return out;
  }

  /**
   * 不吃碰、保留現在的手牌：之後胡牌的期望收入（台）。和吃碰後出牌的期望收入比，
   * 吃碰會少掉門清（胡別人少 1 台、自摸少 2 台），進張要多到補得回來才值得。
   */
  function passValue(g, p, base) {
    const hand = g.hands[p],
      open = g.melds[p].length,
      pub = E.publicTiles(g, p),
      known = Array(34).fill(0);
    for (const t of [...hand, ...pub]) if (t < 34) known[t]++;
    const v = C.waitValue(hand, open, known, g.rules),
      tai = HV.estimate(g, p, hand, { shanten: v.shanten, publicTiles: pub });
    return (
      P.winProb(v.shanten, v.remaining, O.drawable(g)) *
      HV.income(g, p, tai, base, (CAL && CAL.tsumoShare) || 0.4)
    );
  }

  /**
   * 輪到 p 出牌時的完整建議。
   * efficiency：只看牌效率（並列時依口訣）的首選；tile／option：攻守期望值選出的最後建議。
   * @param {Game} g @param {number} [p] @param {{base?: number, margin?: number, future?: number}} [opts] base：底換算成幾台；margin：改打非效率首選需要多出的期望值（台）
   */
  function decide(g, p = 0, opts = {}) {
    g = Observation.forPlayer(g, p);
    const ctx = context(g, p),
      hand = g.hands[p],
      options = E.analyze(hand, ctx.publicTiles, ctx.open, new Map(), g.rules);
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
    const worth = incomeByTile(g, p, hand, options, ctx.publicTiles, opts.base ?? BASE);
    const plan = P.choose({
      options,
      efficiency,
      safety,
      left: O.drawable(g),
      myTai: myTai(g, p),
      base: opts.base,
      dealerExtra: g.dealer === p ? 1 + 2 * (g.streak || 0) : 0,
      maxTenpai: Math.max(...opps.map((o) => o.tenpai)),
      margin: opts.margin,
      incomeOf: (o) => worth.get(o.tile).income,
      hand,
      pressure: opps.reduce((n, o) => n + o.tenpai, 0),
      future: opts.future,
    });
    const situation = S.read(g, p, { options, lead: efficiency, opps, safety, plan });
    const option = plan.option;
    return {
      version: VERSION,
      rules: g.rules,
      ctx,
      options,
      tied,
      efficiency,
      option,
      tile: option.tile,
      situation,
      stance: plan.stance,
      folding: plan.reason === 'defense', // 為了防守改打效率首選以外的牌
      forValue: plan.reason === 'value', // 為了台數改打效率首選以外的牌
      worth, // 每張候選牌打出後「胡了大約幾台」
      plan,
      opps,
      safety,
      explain: C.explainTurn(hand, options, ctx),
    };
  }

  /**
   * 假設 p 做了這個吃／碰，其他人都略過：回傳吃碰後、輪到 p 出牌的局面（做不到就回傳 null）。
   * @param {Game} g @param {number} p @param {any} action
   */
  function afterClaim(g, p, action) {
    const h = structuredClone(Observation.forPlayer(g, p));
    if (!['chi', 'pon'].includes(action.type) || !h.pending || h.pending.decisions[p]) return null;
    const legal = E.claims(h, p).find((a) => JSON.stringify(a) === JSON.stringify(action));
    if (!legal) return null;
    // 只推演「成功取得吃碰」的公開結果，不詢問其他家的暗牌或尚未公開的回應。
    const { from, tile } = h.pending;
    for (const t of legal.tiles) h.hands[p].splice(h.hands[p].indexOf(t), 1);
    h.rivers[from].pop();
    h.cuts[from].pop();
    h.melds[p].push({ type: legal.type, tiles: [...legal.tiles, tile].sort((a, b) => a - b), from });
    h.log.push(
      { player: p, action: 'response', choice: legal.type, tile },
      { player: p, action: 'resolution', choice: legal.type, tile },
      { player: p, action: legal.type, tile },
    );
    h.pending = null;
    h.fresh = null;
    h.turn = p;
    h.phase = 'discard';
    return h;
  }

  /**
   * 吃碰槓胡的建議：吃碰後要打的牌，由吃碰後的局面呼叫 decide() 決定。
   * 吃碰後的局勢是「先守」時不建議吃碰：攤牌會暴露手牌、少了安全牌，也破壞門清。
   * @param {Game} g @param {number} [p] @param {{base?: number, margin?: number, future?: number}} [opts]
   */
  function claims(g, p = 0, opts = {}) {
    g = Observation.forPlayer(g, p);
    let stay = null;
    const report = C.claimDecision(g, p, (action) => {
      const h = afterClaim(g, p, action);
      const d = h && decide(h, p, opts);
      if (!d) return null;
      // 吃碰後的期望收入（胡牌機率 × 胡了的台數）要不少於略過：吃碰會破壞門清，進張要補得回來
      if (stay === null) stay = passValue(g, p, opts.base ?? BASE);
      return {
        option: d.option,
        fold: P.holdBackClaim({
          stance: d.stance,
          efficiency: d.efficiency,
          maxTenpai: Math.max(...d.opps.map((o) => o.tenpai)),
        }),
        worth: d.plan.chosen.gain >= stay,
        gain: d.plan.chosen.gain,
        stay,
      };
    });
    report.limit =
      '吃碰後出牌與實戰共用攻守建議；取得吃碰以其他家未優先胡牌為前提。槓牌只枚舉補牌效率，尚未估計搶槓機率與完整台數收益。';
    for (const o of report.options) {
      if (!o.after) continue;
      const h = afterClaim(g, p, o.action);
      if (h) o.risk = Safety.evaluate(h, p).find((r) => r.tile === o.after.tile);
    }
    return report;
  }

  /** 為了台數換牌時的說明：兩種打法胡了各約幾台 */
  function valueReason(d) {
    const mine = d.worth.get(d.tile).tai,
      eff = d.worth.get(d.efficiency.tile).tai;
    const avg = (t) => (t.ron * 0.7 + t.tsumo * 0.3).toFixed(1);
    return (
      '這樣打胡了約 ' +
      avg(mine) +
      ' 台，打' +
      C.label(d.efficiency.tile) +
      '約 ' +
      avg(eff) +
      ' 台，胡牌機會差不多時選台數高的'
    );
  }

  /** 當時的綜合建議與理由；所有選牌評語共用這一份，不以實際輸贏倒推決策。 */
  function rationale(d) {
    const o = d.option,
      risk = d.safety.find((r) => r.tile === d.tile);
    return (
      '綜合建議打' +
      C.label(d.tile) +
      '：' +
      (o.shanten === 0 ? '打後聽牌' : '打後' + o.shanten + '進聽') +
      '，有效牌未見 ' +
      o.remaining +
      ' 張。' +
      (d.folding ? '只看牌效率會打' + C.label(d.efficiency.tile) + '；這次為攻守取捨調整。' : '') +
      (d.forValue ? '只看牌效率會打' + C.label(d.efficiency.tile) + '；' + valueReason(d) + '。' : '') +
      (risk ? Safety.explain(risk) + '。' : '')
    );
  }

  /** 同一局面中推薦、合理替代與明顯損失的評分。 */
  function assess(d, tile) {
    const option = d && d.options.find((o) => o.tile === tile);
    if (!option)
      return {
        verdict: 'unknown',
        text: '目前手牌沒有這張可比較的牌。',
        mistake: false,
        warning: '',
        reason: '',
      };
    const row = d.plan.rows.find((r) => r.tile === tile),
      chosen = d.plan.chosen;
    const gap = chosen.ev - row.ev;
    const equivalent = C.same(option, d.option) && Math.abs(gap) < 0.000001;
    const best = tile === d.tile || equivalent;
    const lost = Math.max(0, d.option.remaining - option.remaining);
    const mistake =
      !best &&
      gap > P.MARGIN &&
      (option.shanten > d.option.shanten || lost >= 4 || row.dealIn - chosen.dealIn >= 0.02);
    const verdict = best ? 'best' : mistake ? 'worse' : 'close';
    const reason = rationale(d);
    const comparison =
      '你選的' +
      C.label(tile) +
      '：' +
      (option.shanten === 0 ? '打後聽牌' : '打後' + option.shanten + '進聽') +
      '，有效牌未見 ' +
      option.remaining +
      ' 張，放槍' +
      Safety.percent(row.dealIn) +
      '。';
    const text =
      (best ? '推薦選擇。' : mistake ? '目前評估有明顯損失。' : '合理替代；與首選不同不代表打錯。') +
      comparison +
      reason;
    const lossText =
      option.shanten > d.option.shanten
        ? '向聽退了一步以上，距離聽牌多 ' + (option.shanten - d.option.shanten) + ' 步。'
        : lost >= 4
          ? '損失了 ' + lost + ' 張有效進張。'
          : '承擔較高放槍風險，綜合收益不足以補償。';
    return {
      verdict,
      text,
      mistake,
      warning: mistake ? lossText + '建議打' + C.label(d.tile) + '。' + comparison : '',
      reason,
    };
  }

  /** 保存當時評分，避免模型改版後把舊題答案悄悄換掉；不含任何隱藏牌。 */
  function snapshot(d) {
    if (!d) return null;
    return {
      version: VERSION,
      rules: d.rules,
      recommended: d.tile,
      efficiency: d.efficiency.tile,
      stance: d.stance,
      rationale: rationale(d),
      assessments: d.options.map((o) => ({ tile: o.tile, ...assess(d, o.tile) })),
      options: d.options.map(({ tile, shanten, remaining }) => ({ tile, shanten, remaining })),
    };
  }

  function kans(g, p = 0, opts = {}) {
    g = Observation.forPlayer(g, p);
    if (!E.selfKans(g, p).length || E.winning(g.hands[p], g.melds[p].length, g.rules)) return [];
    const d = decide(g, p, opts);
    if (!d) return [];
    return C.selfKanDecision(g, p, d.option).map((o) => {
      if (d.stance === 'fold') {
        o.recommend = false;
        o.compact = '建議先守，暫不槓。\n' + rationale(d);
        o.text = o.compact + '\n以下僅為補牌效率情境：\n' + o.text;
      }
      return o;
    });
  }

  /** 畫面可傳入已算好的報告，問答與點選預覽、覆盤不再各算一套。 */
  function answer(question, g, selected = null, reports = {}) {
    g = Observation.forPlayer(g, 0);
    if (g.phase !== 'discard' || g.turn !== 0)
      return C.contextualAnswer(
        question,
        g,
        selected,
        reports.claim || (g.phase === 'claim' ? claims(g) : null),
      );
    if (E.winning(g.hands[0], g.melds[0].length, g.rules)) return '合法胡牌結構已成立，建議先自摸。';
    const d = reports.decision || decide(g);
    if (/槓/.test(question))
      return (reports.kans || kans(g)).map((o) => o.compact).join('\n\n') || '目前沒有可暗槓或加槓的牌。';
    if (/147|258|369|口訣|公式|三面聽|吃|碰/.test(question)) return C.contextualAnswer(question, g, selected);
    let tile = /白板|白/.test(question) ? 33 : /紅中/.test(question) ? 31 : null;
    if (tile === null)
      for (let t = 0; t < 34; t++)
        if (question.includes(E.names[t])) {
          tile = t;
          break;
        }
    if (tile === null && selected !== null && /這張|這個|為什麼|可以|比較/.test(question)) tile = selected;
    if (tile !== null) return assess(d, tile).text;
    if (/防守|安全|危險|放槍/.test(question))
      return (
        rationale(d) +
        '\n最安全：' +
        Safety.explain(d.safety[0]) +
        '\n最危險：' +
        Safety.explain(d.safety[d.safety.length - 1])
      );
    if (/推薦|建議/.test(question)) return rationale(d);
    return C.contextualAnswer(question, g, selected);
  }

  const api = {
    VERSION,
    decide,
    claims,
    kans,
    answer,
    assess,
    snapshot,
    rationale,
    observe: Observation.forPlayer,
    context,
    afterClaim,
    valueTiles,
    myTai,
  };
  if (node) module.exports = api;
  else root.Advisor = api;
})(globalThis);
