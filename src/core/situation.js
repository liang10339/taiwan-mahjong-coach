(function (root) {
  'use strict';
  // 場況判斷：像坐在旁邊的老師一樣看整張桌子，而不是只算牌效率。
  // 看的東西：三家有沒有聽牌訊號、他們「放過」哪些牌、牌牆還剩多少、你的搭子是不是死了、
  // 這手牌值不值錢（一色、字牌對子、碰碰胡、莊家）、下家在吃什麼。
  // 每一手依局勢決定「做牌／進攻／攻守兼顧／守」，只挑最重要的幾點講，同樣的話不會每手重複。
  const node = typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.Mahjong,
    C = node ? require('./coach.js') : root.Coach,
    AI = node ? require('./ai.js') : root.AI;
  const label = C.label,
    tilesText = (ts) => ts.map(label).join('、');
  const SUITS = ['萬子', '筒子', '條子'];
  /** 相對座位的稱呼（1 下家、2 對家、3 上家） */
  const REL = ['你', '下家', '對家', '上家'];
  const STANCE = { build: '做牌', push: '進攻', balance: '攻守兼顧', fold: '先守' };
  const HAND_CHANGES = ['chi', 'pon', 'kan', 'concealed', 'added'];

  /** 還能摸的張數（扣掉保留的牌尾） @param {Game} g */
  function drawable(g) {
    return Math.max(0, g.wall.length - (g.reserve || 0));
  }

  /**
   * q 最近一次改變手牌（手切、吃碰槓）之後「放過」的牌。
   * 這段期間他的手牌組成沒變，聽的牌也沒變：他自己摸進又打掉的牌（沒自摸），
   * 和別家打出他沒胡的牌，都不是他要胡的牌——除非他故意不胡。
   * @param {Game} g @param {number} q
   */
  function passedSince(g, q) {
    let start = 0;
    for (let i = g.log.length - 1; i >= 0; i--) {
      const e = g.log[i];
      if (e.player !== q) continue;
      if ((e.action === 'discard' && e.cut === 'hand') || HAND_CHANGES.includes(e.action)) {
        start = i + 1;
        break;
      }
    }
    const passed = new Set();
    for (let i = start; i < g.log.length; i++) {
      const e = g.log[i];
      if (e.action !== 'discard') continue;
      if (e.player === q)
        passed.add(e.tile); // 摸切或空切：手牌沒變
      else {
        // 別家打的牌：要等大家回應完（緊接著的 resolution）才確定他沒胡
        const done = g.log.slice(i + 1).find((x) => x.action === 'resolution');
        if (done && done.tile === e.tile && done.choice !== 'ron') passed.add(e.tile);
      }
    }
    return passed;
  }

  /** 看出對手接近聽牌的理由（全部是公開資訊） */
  function threatReasons(g, q) {
    const r = AI.reading(g, q),
      out = [];
    if (r.melds) out.push('攤了 ' + r.melds + ' 組');
    if (r.streak >= 3) out.push('連續摸切 ' + r.streak + ' 次、手牌沒再換過');
    if (r.middleRun) out.push('最近連打中張');
    if (r.oneSuit !== null) out.push('攤牌全是' + SUITS[r.oneSuit]);
    if (!out.length && drawable(g) < 30) out.push('已經到後盤');
    return out;
  }

  /** 某張牌在你眼中還有幾張沒出現 */
  function unseenOf(t, hand, pub) {
    return Math.max(0, 4 - hand.filter((x) => x === t).length - pub.filter((x) => x === t).length);
  }

  /** 對 viewer 有台的字牌：三元牌、門風、圈風 */
  function valueHonors(g, viewer) {
    return [31, 32, 33, 27 + E.seatWind(g, viewer), 27 + (g.roundWind || 0)];
  }

  /**
   * 守的時候打哪張：先找所有「很可能聽牌」的對手都放過的牌，再比可成立的胡牌組合與威脅程度。
   * @returns {{tile: number, covered: number[], why: string}}
   */
  function guardTile(g, viewer, hot) {
    const tiles = [...new Set(g.hands[viewer])];
    const rated = tiles.map((t) => ({
      t,
      covered: hot.filter((h) => h.passed.has(t)).map((h) => h.q),
      danger: AI.danger(g, viewer, t).score,
    }));
    rated.sort((a, b) => b.covered.length - a.covered.length || a.danger - b.danger || a.t - b.t);
    const pick = rated[0];
    const why =
      pick.covered.length && pick.covered.length === hot.length
        ? pick.covered.map((q) => REL[(q - viewer + 4) % 4]).join('、') +
          '在手牌沒換過的這段時間放過' +
          label(pick.t)
        : '依場上看得到的牌，對手能用' + label(pick.t) + '胡的組合最少';
    return { tile: pick.t, covered: pick.covered, why };
  }

  /**
   * 讀整張桌子。options 是輪到你出牌時 engine.analyze 的結果（沒有就是摸牌前或別家回合）。
   * 回傳局勢、一句總結，以及依重要性排好的重點（weight 越大越重要；5 是一定要講的警告）。
   * @param {Game} g @param {number} [viewer] @param {any[] | null} [options]
   */
  function read(g, viewer = 0, options = null) {
    const hand = g.hands[viewer],
      open = g.melds[viewer].length,
      pub = E.publicTiles(g, viewer),
      left = drawable(g),
      myDraws = Math.ceil(left / 4);
    const best = options && options.length ? options[0] : null,
      sh = best ? best.shanten : E.shanten(hand, open);
    const others = [1, 2, 3].map((d) => {
      const q = (viewer + d) % 4;
      return { q, rel: REL[d], level: AI.threat(g, q), reading: AI.reading(g, q), passed: passedSince(g, q) };
    });
    const hot = others.filter((o) => o.level >= 2),
      warm = others.filter((o) => o.level === 1);
    const points = [];
    const say = (key, weight, text) => points.push({ key, weight, text });

    // ---- 局勢 ----
    let stance = 'build';
    if (sh === 0) stance = 'push';
    else if ((hot.length && sh >= 2) || (left <= 16 && sh >= 2)) stance = 'fold';
    else if (hot.length || (warm.length && sh >= 2) || left <= 16) stance = 'balance';
    else if (sh === 1) stance = 'push';
    const guard = stance === 'fold' || stance === 'balance' ? guardTile(g, viewer, hot) : null;

    // ---- 對手的威脅 ----
    for (const o of hot) {
      const safe = hand.filter((t, i) => o.passed.has(t) && hand.indexOf(t) === i);
      say(
        'hot:' + o.q,
        5,
        o.rel +
          '很可能聽牌（' +
          threatReasons(g, o.q).join('、') +
          '）。' +
          (safe.length
            ? '你手上的' +
              tilesText(safe) +
              '是他手牌沒換過的這段時間放過的牌——當時沒胡，現在也不會胡，是對他最安全的牌。'
            : '你手上沒有他放過的牌，生張的中張（3～7）最危險。'),
      );
    }
    for (const o of warm)
      say(
        'warm:' + o.q,
        2,
        o.rel + '可能接近聽牌（' + threatReasons(g, o.q).join('、') + '），打生張前先想一下。',
      );
    for (const o of others) {
      if (o.reading.oneSuit === null) continue;
      const s = o.reading.oneSuit,
        hits = best && (best.tile >= 27 || Math.floor(best.tile / 9) === s);
      say(
        'flush:' + o.q,
        hits ? 4 : 2,
        o.rel +
          '攤牌全是' +
          SUITS[s] +
          '，在做一色：' +
          SUITS[s] +
          '和字牌餵他最危險' +
          (hits ? '，而你現在要打的' + label(best.tile) + '正好是這一類。' : '。'),
      );
    }

    // ---- 時間（牌牆） ----
    if (left <= 16)
      say(
        'late',
        4,
        '牌牆只剩 ' +
          left +
          ' 張，你大約還能摸 ' +
          myDraws +
          ' 次。' +
          (sh >= 2
            ? '還差 ' + sh + ' 步才聽牌，這局幾乎胡不到了，重點改成不放槍。'
            : sh === 1
              ? '差一步聽牌還有機會，但只推安全的牌。'
              : '已經聽牌，撐到最後，海底自摸另加 1 台。'),
      );
    else if (left <= 36 && sh >= 2)
      say(
        'mid-slow',
        3,
        '進入後半（牌牆 ' +
          left +
          ' 張，你約還能摸 ' +
          myDraws +
          ' 次），你還差 ' +
          sh +
          ' 步聽牌：時間開始不夠，遇到危險的牌寧可拆搭子，不要硬推。',
      );
    else if (left > 60 && !hot.length && !warm.length && sh >= 2)
      say('early', 1, '序盤（牌牆 ' + left + ' 張）：先處理字牌和孤張，中張的搭子留著，現在放槍的風險很低。');

    // ---- 自己的手牌：聽牌品質、死搭子 ----
    if (best && sh === 0) {
      const waits = best.outs.map((o) => o.tile);
      say(
        'tenpai',
        best.remaining <= 2 ? 4 : 3,
        '打' +
          label(best.tile) +
          '後聽 ' +
          tilesText(waits) +
          '，還剩 ' +
          best.remaining +
          ' 張' +
          (best.remaining === 0
            ? '——全部都出現了，是死聽，只能等之後換聽。'
            : best.remaining <= 2
              ? '，很薄；之後摸到能改成兩面聽的牌就換。'
              : hot.length
                ? '。對手也可能聽牌，是對攻的局面：不是太危險的牌就推。'
                : '，沒人有明顯威脅，全力進攻。'),
      );
    } else if (best) {
      const rest = hand.slice();
      rest.splice(rest.indexOf(best.tile), 1);
      const blocks = C.decompose(rest, open).groups.filter((x) =>
        ['ryanmen', 'penchan', 'kanchan', 'pair'].includes(x.kind),
      );
      for (const b of blocks) {
        const live = C.groupWaits(b).reduce((n, t) => n + unseenOf(t, rest, pub), 0);
        if (live <= 1)
          say(
            'dead:' + b.tiles.join(','),
            3,
            '你的' +
              C.describeGroup(b) +
              (live ? '只剩 1 張' : '要的牌全部出現了') +
              '，是' +
              (live ? '幾乎' : '') +
              '死掉的搭子：之後需要拆牌時先拆它。',
          );
      }
      const strong = blocks
        .filter((b) => b.kind === 'ryanmen')
        .map((b) => ({ b, live: C.groupWaits(b).reduce((n, t) => n + unseenOf(t, rest, pub), 0) }))
        .sort((x, y) => y.live - x.live)[0];
      if (strong && strong.live >= 6)
        say(
          'strong:' + strong.b.tiles.join(','),
          1,
          C.describeGroup(strong.b) + '還有 ' + strong.live + ' 張活牌，是這手最有希望的搭子，一定要留。',
        );
    }

    // ---- 這手值不值錢 ----
    const meldTiles = g.melds[viewer].flatMap((m) => m.tiles),
      all = [...hand, ...meldTiles],
      honors = all.filter((t) => t >= 27).length;
    for (let s = 0; s < 3; s++) {
      const inSuit = all.filter((t) => t < 27 && Math.floor(t / 9) === s).length,
        other = all.length - inSuit - honors,
        meldsOk = meldTiles.every((t) => t >= 27 || Math.floor(t / 9) === s);
      if (!meldsOk || inSuit < 8 || other > 3) continue;
      const name = honors ? '混一色（4 台）' : '清一色（8 台）';
      let text =
        other === 0
          ? '整手只剩' +
            SUITS[s] +
            (honors ? '加字牌，混一色（4 台）已經成形。' : '，清一色（8 台）已經成形。')
          : '你有 ' +
            inSuit +
            ' 張' +
            SUITS[s] +
            (honors ? '、' + honors + ' 張字牌' : '') +
            '，其他花色只剩 ' +
            other +
            ' 張：可以往' +
            name +
            '走。';
      // 效率首選是一色的牌、而打雜色幾乎不吃虧時，建議改打雜色
      if (best && other && (best.tile >= 27 || Math.floor(best.tile / 9) === s)) {
        const alt = (options || []).find(
          (o) => o.tile < 27 && Math.floor(o.tile / 9) !== s && o.shanten === best.shanten,
        );
        if (alt)
          text +=
            '效率首選是' +
            label(best.tile) +
            '，但改打' +
            label(alt.tile) +
            '進聽數一樣、只少 ' +
            (best.remaining - alt.remaining) +
            ' 張有效牌，卻保留' +
            name +
            '的機會。';
      }
      say('flush-me:' + s, other === 0 ? 2 : 3, text);
    }
    const valuable = valueHonors(g, viewer);
    for (const t of [...new Set(hand.filter((t) => t >= 27))]) {
      const n = hand.filter((x) => x === t).length,
        seen = pub.filter((x) => x === t).length,
        isValue = valuable.includes(t);
      if (n === 2 && isValue)
        say(
          'honor-pair:' + t + ':' + seen,
          2,
          seen >= 2
            ? label(t) + '對子另外兩張都打出來了，碰不到，只能當眼。'
            : label(t) + '對子碰出來有 1 台，還有 ' + (2 - seen) + ' 張沒出現，別急著拆。',
        );
      if (n === 1 && seen >= 2)
        say('honor-dead:' + t, 2, label(t) + '已經見 ' + seen + ' 張，留著也湊不成對，早點打掉。');
    }
    const pairs = new Set(hand.filter((t) => hand.filter((x) => x === t).length >= 2)).size;
    if (!g.melds[viewer].some((m) => m.type === 'chi') && pairs >= 5 && sh >= 1)
      say('toitoi', 2, '手上有 ' + pairs + ' 組對子：可以往碰碰胡（4 台）發展，別家打出你對子的牌就碰。');
    if (g.dealer === viewer && (g.streak || 0) >= 1)
      say(
        'dealer',
        2,
        '你是莊家、連 ' +
          g.streak +
          '：胡牌多 ' +
          (1 + 2 * g.streak) +
          ' 台，但放槍也要多付這麼多——有把握時更值得攻，沒把握時更要守。',
      );

    // ---- 下家：別餵他吃 ----
    const next = others[0],
      chiSuits = new Set(
        g.melds[next.q].filter((m) => m.type === 'chi').map((m) => Math.floor(m.tiles[0] / 9)),
      );
    if (best && best.tile < 27 && chiSuits.has(Math.floor(best.tile / 9)))
      say(
        'feed',
        2,
        '下家吃過' +
          SUITS[Math.floor(best.tile / 9)] +
          '，你要打的' +
          label(best.tile) +
          '也是' +
          SUITS[Math.floor(best.tile / 9)] +
          '，可能再被他吃。',
      );

    points.sort((a, b) => b.weight - a.weight);
    return { stance, label: STANCE[stance], headline: headline(), points, guard, left, myDraws, shanten: sh };

    function headline() {
      const progress = sh === 0 ? '已聽牌' : '還差 ' + sh + ' 步聽牌';
      const who = hot.map((o) => o.rel).join('、'),
        safe = guard ? label(guard.tile) + '（' + guard.why + '）' : '最安全的牌';
      if (stance === 'fold')
        return (
          (hot.length ? who + '很可能聽牌，' : '牌牆只剩 ' + left + ' 張，') +
          '你' +
          progress +
          '、約只剩 ' +
          myDraws +
          ' 次摸牌：這手先求不放槍，打' +
          safe +
          '。'
        );
      if (stance === 'balance')
        return (
          (hot.length
            ? who + '很可能聽牌'
            : warm.length
              ? warm.map((o) => o.rel).join('、') + '可能接近聽牌'
              : '已到尾盤') +
          '，你' +
          progress +
          '：還值得推進，但遇到生張要掂量；最保險的是' +
          safe +
          '。'
        );
      if (stance === 'push')
        return sh === 0
          ? '你' + progress + (hot.length ? '，對手也在聽，是對攻。' : '，沒人有明顯威脅，放手進攻。')
          : '你只差一步聽牌、場上還安全，繼續進攻，以進張最多的打法為主。';
      return '還沒人露出聽牌訊號，你' + progress + '、約還能摸 ' + myDraws + ' 次：專心把牌做好。';
    }
  }

  const api = { read, passedSince, threatReasons, guardTile, drawable, STANCE };
  if (node) module.exports = api;
  else root.Situation = api;
})(globalThis);
