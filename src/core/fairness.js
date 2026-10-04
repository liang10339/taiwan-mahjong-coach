(function (root) {
  'use strict';
  // 公平性證明：電腦不能偷看、也不能中途換牌。
  // 1. 開局時公布「牌牆指紋」：由洗好的整副牌（牌牆＋四家配牌＋花牌＋骰子）算出的短雜湊。
  // 2. 一局結束後公開洗牌種子；任何人用同一個種子與桌規重新洗牌，指紋必須相同，
  //    而且剩下的牌牆必須是重洗結果中連續的一段（沒被抽換、沒被重排）。
  // 3. 種子與桌規編成一小段文字，可以做成連結分享，讓朋友打同一副牌比較。
  const E = typeof module !== 'undefined' ? require('./engine.js') : root.Mahjong;

  /** FNV-1a 32 位元雜湊，回傳 8 位十六進位字串 */
  function hash(numbers) {
    let h = 0x811c9dc5;
    for (const n of numbers) {
      h ^= n & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  /**
   * 配牌完成時的牌局指紋（開局就公布）。-1 用來分隔各段，避免不同分法得到同一串數字。
   * @param {Game} g
   */
  function fingerprint(g) {
    return hash([
      ...g.wall,
      -1,
      ...g.hands.flatMap((h) => [...h.slice().sort((a, b) => a - b), -1]),
      ...g.flowers.flatMap((f) => [...f, -1]),
      ...g.dice,
    ]);
  }

  /** 這一局的桌規（重洗時要用同一套，莊家與骰子才會相同） @param {Game} g */
  function rulesOf(g) {
    return {
      dealer: g.dealer,
      roundWind: g.roundWind,
      streak: g.streak,
      reserve: g.reserve,
      passWater: g.passWater,
      rules: E.ruleProfile(g.rules),
      dealing: g.dealing || 'engine-v1',
    };
  }

  /**
   * 驗證：用公開的種子重洗，比對開局時公布的指紋，並確認剩下的牌牆沒被動過。
   * 摸牌從牌牆尾端拿、補花補槓從開頭拿，所以剩下的牌必須是重洗結果中連續的一段。
   * @param {Game} g 結束（或進行中）的牌局
   * @param {string} [print] 開局時公布的指紋
   */
  function verify(g, print) {
    const fresh = E.create(g.seed, rulesOf(g)),
      rebuilt = fingerprint(fresh);
    const rest = g.wall;
    let wallIntact = false;
    for (let from = 0; from + rest.length <= fresh.wall.length && !wallIntact; from++)
      wallIntact = rest.every((t, i) => fresh.wall[from + i] === t);
    return {
      fingerprint: rebuilt,
      matches: print === undefined || print === rebuilt,
      wallIntact,
      ok: (print === undefined || print === rebuilt) && wallIntact,
    };
  }

  /**
   * 把種子與桌規編成分享用的短字串（例如 "lx3k9a.1.0.0.16.1"）。
   * 非預設牌型規則加上 ~profile~version~ligu；實際取墩配牌再加 !2。既有六欄連結維持原樣（舊配牌）。
   * @param {Game} g
   */
  function encodeDeal(g) {
    const r = rulesOf(g);
    const code = [
      (g.seed >>> 0).toString(36),
      r.dealer,
      r.roundWind,
      r.streak,
      r.reserve,
      r.passWater ? 1 : 0,
    ].join('.');
    const withRules = r.rules.liguLigu ? code : code + '~' + r.rules.id + '~' + r.rules.version + '~0';
    // 實際取墩的配牌加上 !2；沒有這段的舊連結照舊配牌（engine-v1）重現同一副牌
    return r.dealing === 'engine-v2' ? withRules + '!2' : withRules;
  }

  /**
   * 解析分享字串（也接受整段網址或 #deal=…）；格式不對回傳 null。
   * @param {string} text
   * @returns {{seed: number, opts: RuleOptions} | null}
   */
  function decodeDeal(text) {
    const m =
      /(?:^|deal=)([0-9a-z]{1,7})\.([0-3])\.([0-3])\.(\d{1,2})\.(0|16)\.([01])(?:~([a-z0-9-]+)~([1-9]\d*)~([01]))?(?:!(2))?(?:$|&)/.exec(
        String(text || '').replace(/^.*#/, ''),
      );
    if (!m) return null;
    const seed = parseInt(m[1], 36);
    if (!(seed >= 0 && seed <= 0xffffffff)) return null;
    /** @type {RuleOptions} */
    const opts = {
      dealer: +m[2],
      roundWind: +m[3],
      streak: +m[4],
      reserve: +m[5],
      passWater: m[6] === '1',
      dealing: m[10] === '2' ? 'engine-v2' : 'engine-v1',
    };
    if (m[7]) {
      try {
        opts.rules = E.ruleProfile({ id: m[7], version: +m[8], liguLigu: m[9] === '1' });
      } catch {
        return null; // 不支援的牌型規則不能靜默換成預設規則重打。
      }
    }
    return { seed, opts };
  }

  const api = { fingerprint, verify, rulesOf, encodeDeal, decodeDeal, hash };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Fairness = api;
})(globalThis);
