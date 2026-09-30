(function (root) {
  'use strict';
  // 牌譜：把一局存成「洗牌種子＋桌規＋每位玩家依序做的動作」。
  // 引擎是決定性的（同一個種子、同樣的動作一定得到同一局），所以用動作重播就能完整還原每一步，
  // 可以續局、回放、回到某一步，也能匯出分享。牌譜有格式版本；日後改變發牌方式或規則時，
  // 舊牌譜依它記錄的版本重播，不會變成另一局。
  //
  // 預留：perspective 'full' 是本程式自己產生、看得到整副牌的牌譜；
  // 日後「實戰記錄」（你在別處打牌、自己輸入）會用 perspective 'seat'，只記你看得到的事件，
  // 那種牌譜不能用種子重播，而是直接存事件（見 docs/RECORD_FORMAT.md）。
  const E = typeof module !== 'undefined' ? require('./engine.js') : root.Mahjong;

  const FORMAT = 'taiwan-mahjong-coach.record';
  const VERSION = 1;
  /** 目前的發牌程序（每家輪流取一張、共十六輪，取到花立即補）。改動發牌方式時要換新名字 */
  const DEALING = 'engine-v1';

  /**
   * 從牌局紀錄整理出「玩家的動作」：摸、打、回應（吃碰槓胡或略過）、自摸、暗槓／加槓。
   * 其他事件（誰取得吃碰、補花、補槓、結算）都能由引擎重新推導，不必存。
   * @param {Game} g
   */
  function commandsOf(g) {
    const out = [];
    for (const e of g.log) {
      const p = e.player;
      if (e.action === 'draw') out.push({ p, a: 'draw' });
      else if (e.action === 'discard') out.push({ p, a: 'discard', tile: e.tile, cut: e.cut });
      else if (e.action === 'response')
        out.push({
          p,
          a: 'respond',
          choice: e.choice,
          tile: e.tile,
          ...(e.tiles ? { tiles: e.tiles.slice() } : {}),
        });
      else if (e.action === 'tsumo') out.push({ p, a: 'win' });
      else if (e.action === 'concealed') out.push({ p, a: 'selfKan', type: 'concealed', tile: e.tile });
      else if (e.action === 'added-attempt') out.push({ p, a: 'selfKan', type: 'added', tile: e.tile });
    }
    return out;
  }

  /** 這一局的桌規（重播時要用同一套） @param {Game} g */
  function optionsOf(g) {
    return {
      dealer: g.dealer,
      roundWind: g.roundWind,
      streak: g.streak || 0,
      reserve: g.reserve || 0,
      passWater: !!g.passWater,
      rules: g.rules ? { id: g.rules.id, version: g.rules.version, liguLigu: g.rules.liguLigu } : undefined,
    };
  }

  /**
   * 把一局存成牌譜（可以 JSON.stringify）。
   * @param {Game} g @param {{coach?: number, source?: string, note?: string, createdAt?: number}} [meta]
   */
  function fromGame(g, meta = {}) {
    return {
      format: FORMAT,
      version: VERSION,
      perspective: 'full',
      dealing: DEALING,
      seed: g.seed >>> 0,
      options: optionsOf(g),
      commands: commandsOf(g),
      result: g.phase === 'ended' ? g.result : null,
      coach: meta.coach ?? null, // 產生牌譜時的教練版本，日後覆盤知道當時用哪一版判斷
      source: meta.source || 'app',
      note: meta.note || '',
      createdAt: meta.createdAt ?? Date.now(),
    };
  }

  /** 依記錄的「打出方式」找到要打的是手上哪一張 */
  function discardIndex(g, p, tile, cut) {
    const h = g.hands[p],
      last = h.length - 1;
    if (cut === 'tsumo') return h[last] === tile ? last : -1;
    if (cut === 'empty') return h.findIndex((t, i) => t === tile && i !== last);
    return h.indexOf(tile);
  }

  /** 套用一個動作，成功回傳 true */
  function apply(g, c) {
    if (c.a === 'draw') return E.draw(g, c.p);
    if (c.a === 'discard') {
      const i = discardIndex(g, c.p, c.tile, c.cut);
      return i >= 0 && E.discard(g, c.p, i);
    }
    if (c.a === 'respond')
      return E.respond(
        g,
        c.p,
        c.choice === 'pass' ? { type: 'pass' } : { type: c.choice, tiles: c.tiles || [c.tile] },
      );
    if (c.a === 'win') return E.win(g, c.p);
    if (c.a === 'selfKan') {
      const a = E.selfKans(g, c.p).find((x) => x.type === c.type && x.tile === c.tile);
      return !!a && E.selfKan(g, c.p, a);
    }
    return false;
  }

  /**
   * 重播牌譜，回到第 upto 個動作之後的局面（預設播完）。
   * @param {any} record @param {{upto?: number}} [opts]
   * @returns {{game: Game | null, applied: number, error: string | null}}
   */
  function replay(record, { upto = Infinity } = {}) {
    const problem = check(record);
    if (problem) return { game: null, applied: 0, error: problem };
    const opts = { ...record.options };
    if (!opts.rules) delete opts.rules;
    const g = E.create(record.seed, opts);
    let applied = 0;
    for (const c of record.commands) {
      if (applied >= upto) break;
      if (!apply(g, c))
        return { game: g, applied, error: '第 ' + (applied + 1) + ' 個動作無法套用（' + c.a + '）' };
      applied++;
    }
    // 摸不到牌而流局不是玩家動作；牌譜播完而原局已結束時，補一次摸牌讓流局成立
    if (upto === Infinity && record.result && g.phase === 'draw') E.draw(g, g.turn);
    return { game: g, applied, error: null };
  }

  /** 檢查牌譜格式；沒問題回傳 null，否則回傳原因 */
  function check(record) {
    if (!record || record.format !== FORMAT) return '不是本程式的牌譜';
    if (record.version !== VERSION) return '牌譜版本 ' + record.version + ' 不支援（目前為 ' + VERSION + '）';
    if (record.perspective !== 'full') return '這份牌譜只記錄單一玩家看得到的事件，不能用種子重播';
    if (record.dealing !== DEALING) return '發牌程序 ' + record.dealing + ' 不支援';
    if (!Number.isInteger(record.seed) || !Array.isArray(record.commands)) return '牌譜內容不完整';
    return null;
  }

  /** 匯入牌譜文字：解析、檢查並試著完整重播一次，確定能用 */
  function parse(text) {
    let record;
    try {
      record = JSON.parse(text);
    } catch (e) {
      return { record: null, error: '不是有效的 JSON 牌譜' };
    }
    const r = replay(record);
    return r.error ? { record: null, error: r.error } : { record, error: null };
  }

  const api = { fromGame, replay, parse, check, commandsOf, optionsOf, FORMAT, VERSION, DEALING };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Record = api;
})(globalThis);
