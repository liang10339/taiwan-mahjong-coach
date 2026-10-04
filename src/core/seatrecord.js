(function (root) {
  'use strict';
  // 實戰記錄（牌譜 perspective: "seat"）：你在別的地方（實體牌桌、其他平台）打的牌，自己輸入。
  // 沒有洗牌種子，也看不到別家的暗牌，所以只存「你這個座位看得到的事件」：
  //   起手牌、你摸到的牌、四家打出的牌、吃碰槓的攤牌、花、胡牌。別家摸到什麼不記（只記「摸了一張」）。
  // 重建時把這些事件組成和引擎相同形狀的牌局（看不到的牌是 null），再交給 observation.js 投影成你的視角，
  // 所以教練（advisor.js）、防守、覆盤評分都能直接沿用——它們本來就只讀玩家看得到的資訊。
  // 格式說明見 docs/RECORD_FORMAT.md。
  const node = typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.Mahjong;

  const FORMAT = 'taiwan-mahjong-coach.record';
  const VERSION = 1;
  /** 事件種類：摸、打、吃、碰、明槓、暗槓、加槓、補花、胡別人、自摸 */
  const ACTIONS = ['draw', 'discard', 'chi', 'pon', 'kan', 'concealed', 'added', 'flower', 'ron', 'tsumo'];

  /**
   * 新的實戰記錄。seat 是你的座位（畫面上固定是 0）；dealer、roundWind 等和本程式的桌規欄位相同。
   * @param {{seat?: number, dealer?: number, roundWind?: number, streak?: number, reserve?: number, passWater?: boolean, multiRon?: boolean, note?: string}} [opts]
   */
  function create(opts = {}) {
    return {
      format: FORMAT,
      version: VERSION,
      perspective: 'seat',
      seat: opts.seat ?? 0,
      options: {
        dealer: opts.dealer ?? 0,
        roundWind: opts.roundWind ?? 0,
        streak: opts.streak ?? 0,
        reserve: opts.reserve ?? 16,
        passWater: !!opts.passWater,
        rules: { ...E.DEFAULT_RULES, multiRon: !!opts.multiRon },
      },
      start: { hand: [], flowers: [], otherFlowers: {} },
      events: [],
      result: null,
      source: 'manual',
      note: opts.note || '',
      createdAt: Date.now(),
    };
  }

  const isTile = (t) => Number.isInteger(t) && t >= 0 && t < 34;
  const isFlower = (t) => Number.isInteger(t) && t >= 34 && t < 42;

  /**
   * 依事件重建到第 upto 個事件之後的局面（引擎形狀，看不到的牌為 null）。
   * 事件不合理（例如手上沒有要打的牌、張數超過 4 張）就停在那裡並回傳原因。
   * @param {any} record @param {{upto?: number}} [opts]
   * @returns {{game: Game | null, applied: number, error: string | null}}
   */
  function state(record, { upto = Infinity } = {}) {
    const problem = check(record);
    if (problem) return { game: null, applied: 0, error: problem };
    const me = record.seat,
      o = record.options;
    /** @type {any} */
    const g = {
      seed: 0,
      rules: E.ruleProfile(o.rules),
      wall: [],
      hands: [0, 1, 2, 3].map((p) => (p === me ? record.start.hand.slice() : Array(16).fill(null))),
      flowers: [0, 1, 2, 3].map((p) =>
        p === me ? record.start.flowers.slice() : ((record.start.otherFlowers || {})[p] || []).slice(),
      ),
      rivers: [[], [], [], []],
      melds: [[], [], [], []],
      cuts: [[], [], [], []],
      pending: null,
      turn: o.dealer,
      phase: 'draw',
      result: '',
      log: [],
      dealer: o.dealer,
      roundWind: o.roundWind,
      streak: o.streak,
      reserve: o.reserve,
      passWater: o.passWater,
      water: [false, false, false, false],
      fresh: null,
      dealing: 'manual',
      // 別家「能胡就胡」是教練對對手的假設（和本程式電腦對手相同）；你自己的選擇就是記錄下來的動作
      playerPolicies: [0, 1, 2, 3].map((p) => ({ alwaysWin: p !== me })),
    };
    let applied = 0,
      error = null;
    for (const e of record.events) {
      if (applied >= upto) break;
      error = apply(g, e, me);
      if (error) break;
      applied++;
    }
    // 牌牆剩下幾張：一副 144 張扣掉看得到的（手牌張數、攤牌、牌河、花）
    const used =
      g.hands.reduce((n, h) => n + h.length, 0) +
      g.melds.reduce((n, ms) => n + ms.reduce((k, m) => k + m.tiles.length, 0), 0) +
      g.rivers.reduce((n, r) => n + r.length, 0) +
      g.flowers.reduce((n, f) => n + f.length, 0);
    g.wall = Array(Math.max(0, 144 - used)).fill(null);
    if (error) return { game: g, applied, error: '第 ' + (applied + 1) + ' 個事件：' + error };
    return { game: g, applied, error: tooMany(g, me) };
  }

  /** 看得到的每種牌不能超過 4 張 */
  function tooMany(g, me) {
    const c = Array(34).fill(0);
    for (const t of [
      ...g.hands[me],
      ...g.rivers.flat(),
      ...g.melds.flatMap((ms) => ms.flatMap((m) => m.tiles)),
    ])
      if (isTile(t)) c[t]++;
    const t = c.findIndex((n) => n > 4);
    return t >= 0 ? E.names[t] + '出現超過 4 張' : null;
  }

  /** 從 p 的手牌拿走一張：自己的牌要真的有，別家的只扣張數 */
  function takeFrom(g, p, me, tile) {
    const h = g.hands[p];
    if (p !== me) {
      if (!h.length) return false;
      h.pop();
      return true;
    }
    const i = h.lastIndexOf(tile);
    if (i < 0) return false;
    h.splice(i, 1);
    return true;
  }

  /** 套用一個事件；成功回傳 null，否則回傳原因 */
  function apply(g, e, me) {
    const p = e.p;
    if (![0, 1, 2, 3].includes(p) || !ACTIONS.includes(e.a)) return '格式不對';
    // 一炮多響：同一張牌已經有人胡了，別家也能接著記胡（同一張、同一個放槍者）
    if (g.phase === 'ended' && e.a === 'ron' && g.rules.multiRon) return alsoRon(g, p, me);
    if (g.phase === 'ended') return '這一局已經結束';
    const mine = p === me;
    const label = (t) => (isTile(t) || isFlower(t) ? E.names[t] : '?');
    switch (e.a) {
      case 'draw': {
        if (mine && !isTile(e.tile)) return '你摸到的牌要記是哪一張（花牌請記「補花」）';
        g.hands[p].push(mine ? e.tile : null);
        g.fresh = { player: p, tile: mine ? e.tile : null };
        g.turn = p;
        g.phase = 'discard';
        g.pending = null;
        g.log.push({ player: p, action: 'draw', ...(mine ? { tile: e.tile } : {}) });
        return null;
      }
      case 'flower': {
        if (!isFlower(e.tile)) return '補花要記是哪一張花';
        // 摸到花：直接攤出來（不進手牌），接著從牌尾再摸一張（下一個事件記 draw）。
        // 開局配到的花不用記事件：你的記在 start.flowers，別家的記在 start.otherFlowers。
        g.flowers[p].push(e.tile);
        g.turn = p;
        g.phase = 'draw';
        g.fresh = null;
        return null;
      }
      case 'discard': {
        if (!isTile(e.tile)) return '要記打出哪一張';
        const f = g.fresh;
        if (!takeFrom(g, p, me, e.tile)) return '你手上沒有' + label(e.tile);
        const cut = e.cut || (f && f.player === p && f.tile === e.tile && mine ? 'tsumo' : 'hand');
        g.rivers[p].push(e.tile);
        g.cuts[p].push(cut);
        g.log.push({ player: p, action: 'discard', tile: e.tile, cut });
        g.fresh = null;
        g.pending = { from: p, tile: e.tile, decisions: {} };
        g.turn = (p + 1) % 4;
        g.phase = 'draw';
        return null;
      }
      case 'chi':
      case 'pon':
      case 'kan': {
        const last = g.log.filter((x) => x.action === 'discard').at(-1);
        if (!last || !g.pending)
          return '前面沒有可以' + (e.a === 'chi' ? '吃' : e.a === 'pon' ? '碰' : '槓') + '的牌';
        const need = e.a === 'kan' ? 3 : 2,
          from = last.player,
          tile = last.tile;
        if (from === p) return '不能吃碰自己打的牌';
        if (e.a === 'chi' && from !== (p + 3) % 4) return '只能吃上家的牌';
        const tiles = e.a === 'chi' ? (e.tiles || []).slice() : Array(need).fill(tile);
        if (tiles.length !== need || !tiles.every(isTile)) return '要記用了哪幾張牌';
        if (e.a === 'chi') {
          const run = [...tiles, tile].sort((a, b) => a - b);
          if (
            run[0] >= 27 ||
            Math.floor(run[0] / 9) !== Math.floor(run[2] / 9) ||
            run[1] !== run[0] + 1 ||
            run[2] !== run[1] + 1
          )
            return '吃的三張要是同一門的順子';
        }
        for (const t of tiles) if (!takeFrom(g, p, me, t)) return '你手上沒有' + label(t);
        g.rivers[from].pop();
        g.cuts[from].pop();
        g.melds[p].push({ type: e.a, tiles: [...tiles, tile].sort((a, b) => a - b), from });
        g.log.push({ player: p, action: 'response', choice: e.a, tile, ...(mine ? { tiles } : {}) });
        g.log.push({ player: p, action: e.a, tile, tiles: tiles.slice(), from });
        g.pending = null;
        g.fresh = null;
        g.turn = p;
        g.phase = e.a === 'kan' ? 'draw' : 'discard'; // 明槓後從牌尾補一張（下一個事件記 draw）
        return null;
      }
      case 'concealed': {
        if (mine) {
          if (!isTile(e.tile)) return '要記暗槓哪一張';
          for (let i = 0; i < 4; i++)
            if (!takeFrom(g, p, me, e.tile)) return '你手上沒有四張' + label(e.tile);
        } else for (let i = 0; i < 4; i++) g.hands[p].pop();
        g.melds[p].push({
          type: 'concealed',
          tiles: mine ? [e.tile, e.tile, e.tile, e.tile] : [null, null, null, null],
        });
        g.log.push({ player: p, action: 'concealed', ...(mine ? { tile: e.tile } : {}) });
        g.fresh = null;
        g.turn = p;
        g.phase = 'draw';
        return null;
      }
      case 'added': {
        const meld = g.melds[p].find((m) => m.type === 'pon' && m.tiles[0] === e.tile);
        if (!meld) return '沒有碰過' + label(e.tile) + '，不能加槓';
        if (!takeFrom(g, p, me, e.tile)) return '你手上沒有' + label(e.tile);
        meld.type = 'kan';
        meld.tiles.push(e.tile);
        g.log.push({ player: p, action: 'added', tile: e.tile });
        g.fresh = null;
        g.turn = p;
        g.phase = 'draw';
        return null;
      }
      case 'ron': {
        const last = g.log.filter((x) => x.action === 'discard').at(-1);
        if (!last || !g.pending || last.player === p) return '前面沒有別家剛打出的牌可以胡';
        // 和引擎一樣：胡的那張從放槍者的牌河拿進胡牌者手裡
        g.rivers[last.player].pop();
        g.cuts[last.player].pop();
        g.hands[p].push(mine ? last.tile : null);
        g.log.push({ player: p, action: 'ron', tile: last.tile, from: last.player });
        g.phase = 'ended';
        g.result = E.who(g, p) + '胡 ' + E.names[last.tile] + '（' + E.who(g, last.player) + '放槍）';
        return null;
      }
      case 'tsumo': {
        g.log.push({
          player: p,
          action: 'tsumo',
          ...(g.fresh && g.fresh.tile !== null ? { tile: g.fresh.tile } : {}),
        });
        g.phase = 'ended';
        g.result = E.who(g, p) + '自摸';
        return null;
      }
    }
    return '格式不對';
  }

  /** 一炮多響的第二、第三家胡牌：和引擎一樣各拿一份那張牌，牌河只拿走一次 */
  function alsoRon(g, p, me) {
    const first = g.log.at(-1);
    if (!first || first.action !== 'ron') return '這一局已經結束';
    const winners = [];
    for (let i = g.log.length - 1; i >= 0 && g.log[i].action === 'ron'; i--) winners.unshift(g.log[i].player);
    if (winners.includes(p) || p === first.from) return '這一家不能再胡這張';
    g.hands[p].push(p === me ? first.tile : null);
    g.log.push({ player: p, action: 'ron', tile: first.tile, from: first.from });
    winners.push(p);
    // 依出牌者下家方向排，和引擎的結果文字一致
    winners.sort((a, b) => ((a - first.from + 4) % 4) - ((b - first.from + 4) % 4));
    g.result =
      winners.map((w) => E.who(g, w)).join('、') +
      '胡 ' +
      E.names[first.tile] +
      '（' +
      E.who(g, first.from) +
      '放槍）';
    return null;
  }

  /** 檢查格式；沒問題回傳 null，否則回傳原因 */
  function check(record) {
    if (!record || record.format !== FORMAT) return '不是本程式的牌譜';
    if (record.version !== VERSION) return '牌譜版本 ' + record.version + ' 不支援';
    if (record.perspective !== 'seat') return '這不是實戰記錄';
    if (![0, 1, 2, 3].includes(record.seat)) return '座位不對';
    const o = record.options || {};
    if (![0, 1, 2, 3].includes(o.dealer) || ![0, 1, 2, 3].includes(o.roundWind)) return '莊家或圈風不對';
    try {
      E.ruleProfile(o.rules);
    } catch (e) {
      return '牌型規則不支援';
    }
    const s = record.start || {};
    if (!Array.isArray(s.hand) || s.hand.length !== 16 || !s.hand.every(isTile))
      return '起手牌要 16 張（不含花）';
    if (!Array.isArray(s.flowers) || !s.flowers.every(isFlower)) return '起手的花不對';
    const others = Object.values(s.otherFlowers || {});
    if (!others.every((f) => Array.isArray(f) && f.every(isFlower))) return '別家開局的花不對';
    if (!Array.isArray(record.events)) return '事件不完整';
    return null;
  }

  /**
   * 你每一次出牌時，教練（advisor.js）會建議打哪張、你的選擇評為最佳／可接受／明顯損失。
   * 回傳 [{index, turn, tile, decision, verdict}]；advisor 由呼叫端傳入，避免這個模組依賴整套教練。
   * @param {any} record @param {{decide: Function, assess: Function}} advisor
   */
  function review(record, advisor) {
    const me = record.seat,
      out = [];
    record.events.forEach((e, index) => {
      if (e.p !== me || e.a !== 'discard') return;
      const before = state(record, { upto: index });
      if (before.error || !before.game || before.game.phase !== 'discard' || before.game.turn !== me) return;
      const d = advisor.decide(before.game, me);
      if (!d) return;
      out.push({
        index,
        turn: out.length + 1,
        tile: e.tile,
        decision: d,
        verdict: advisor.assess(d, e.tile),
      });
    });
    return out;
  }

  /** 匯入文字：解析並檢查到最後一個事件 */
  function parse(text) {
    let record;
    try {
      record = JSON.parse(text);
    } catch (e) {
      return { record: null, error: '不是 JSON 格式' };
    }
    const r = state(record);
    return r.error ? { record: null, error: r.error } : { record, error: null };
  }

  const api = { create, state, check, review, parse, ACTIONS, FORMAT, VERSION };
  if (node) module.exports = api;
  else root.SeatRecord = api;
})(globalThis);
