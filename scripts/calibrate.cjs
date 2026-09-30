// 校準：讓電腦自己對打，用「知道每家真正手牌」的資料，統計教練的機率該是多少。
// 用法：npm run calibrate            （預設 1600 局，依 CPU 數平行；約十幾分鐘）
//       npm run calibrate -- 400      （指定局數，快速試跑）
// 產出：src/core/data/calibration.js（教練讀的統計表）與 docs/CALIBRATION.md（準確度報告）。
// 每 5 局保留 1 局不拿來統計，只拿來驗證（避免「用考題練習再考同一題」）。
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { fork } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const LEVELS = ['normal', 'hard', 'normal', 'hard'];

/** 空的統計表 */
function blank() {
  return {
    games: 0,
    tenpai: {}, // 聽牌特徵鍵 → [真的聽牌次數, 樣本數]
    cells: {}, // 牌的分類（種類|分組|手切附近|一色|不做的門）→ [是對方要的牌, 樣本數]（只算已聽牌的一家）
    test: {}, // 驗證局：聽牌鍵#牌的分類 → [放槍, 樣本數]（不論對方是否聽牌）
    passed: [0, 0], // 放過的牌：[其實是他要的牌, 樣本數]
    water: [0, 0],
    win: {}, // 自己的進聽數|有效牌|剩餘牌 → [最後胡牌, 樣本數]
    tai: { plain: [0, 0], all: [0, 0], tsumo: [0, 0] },
    // 邏輯迴歸的訓練資料（訓練局）與驗證資料（驗證局，抽樣 30%）
    rows: { tx: [], ty: [], wx: [], wy: [], tenpaiTest: [], pairTest: [] },
  };
}
const add = (obj, key, hit) => {
  const row = obj[key] || (obj[key] = [0, 0]);
  row[0] += hit ? 1 : 0;
  row[1] += 1;
};

/** 跑 [from, to] 這些種子的牌局，回傳統計表（在子行程裡執行） */
function run(from, to) {
  const E = require('../src/core/engine.js');
  const AI = require('../src/core/ai.js');
  const O = require('../src/core/opponents.js');
  const S = require('../src/core/safety.js');
  const Scoring = require('../src/core/scoring.js');
  const P = require('../src/core/policy.js');
  const Observation = require('../src/core/observation.js');
  const stats = blank();
  let sampler = 12345;
  const sample = () => {
    sampler = (Math.imul(sampler, 1664525) + 1013904223) >>> 0;
    return sampler / 4294967296 < 0.3;
  };
  const cellKey = (f) => [f.kind, f.bucket, +f.nearCut, +f.suitHit, +f.avoid].join('|');
  for (let seed = from; seed <= to; seed++) {
    const g = E.create(seed * 7919, { reserve: 16, passWater: true, dealer: seed % 4 });
    const levels = LEVELS.map((_, i) => LEVELS[(i + seed) % 4]);
    const testGame = seed % 5 === 0;
    const moments = [[], [], [], []];
    let steps = 0;
    while (g.phase !== 'ended' && steps++ < 500) {
      const p = g.turn;
      if (g.phase === 'discard' && !E.winning(g.hands[p], g.melds[p].length)) {
        const opps = O.read(g, p),
          seen = S.visibleCounts(g, p),
          view = Observation.forPlayer(g, p),
          tiles = [...new Set(g.hands[p])];
        for (const o of opps) {
          const hand = g.hands[o.q],
            open = g.melds[o.q].length,
            tenpai = E.shanten(hand, open) === 0;
          const tKey = O.tenpaiKey(O.features(g, o.q));
          const tv = O.tenpaiVector(view, o.q);
          if (!testGame) {
            add(stats.tenpai, tKey, tenpai);
            stats.rows.tx.push(tv);
            stats.rows.ty.push(tenpai ? 1 : 0);
          } else stats.rows.tenpaiTest.push({ tv, k: tKey, y: tenpai ? 1 : 0 });
          const waits = new Set();
          if (tenpai) for (let t = 0; t < 34; t++) if (E.winning([...hand, t], open)) waits.add(t);
          for (const t of tiles) {
            const hit = waits.has(t);
            if (o.passed.has(t)) {
              if (tenpai) {
                stats.passed[0] += hit ? 1 : 0;
                stats.passed[1]++;
              }
              continue;
            }
            if (o.water) {
              if (tenpai) {
                stats.water[0] += hit ? 1 : 0;
                stats.water[1]++;
              }
              continue;
            }
            if (t >= 27 && seen[t] >= 4) continue; // 四張都看得到的字牌一定安全，不列入統計
            const cell = cellKey(S.tileFeatures(t, seen, o));
            const wv = S.waitVector(t, seen, o);
            if (testGame) {
              add(stats.test, tKey + '#' + cell, hit);
              if (sample()) stats.rows.pairTest.push({ tv, wv, k: tKey, c: cell, y: hit ? 1 : 0 });
            } else if (tenpai) {
              add(stats.cells, cell, hit);
              stats.rows.wx.push(wv);
              stats.rows.wy.push(hit ? 1 : 0);
            }
          }
        }
        // 自己這手：打出效率首選後的進聽數與有效牌，之後看有沒有胡
        const best = E.analyze(g.hands[p], E.publicTiles(g, p), g.melds[p].length)[0];
        if (best) moments[p].push(P.winKey(best.shanten, best.remaining, O.drawable(g)));
      }
      AI.act(g, p, levels[p]);
      if (g.phase === 'claim')
        for (let q = 0; q < 4 && g.phase === 'claim'; q++)
          if (!g.pending.decisions[q]) E.respond(g, q, AI.chooseClaim(g, q, levels[q]));
    }
    const w = [...g.log].reverse().find((e) => ['ron', 'tsumo'].includes(e.action));
    const winner = w ? w.player : -1;
    if (!testGame) for (let p = 0; p < 4; p++) for (const k of moments[p]) add(stats.win, k, p === winner);
    if (w) {
      const tai = Scoring.score(g, winner).total;
      stats.tai.all[0] += tai;
      stats.tai.all[1]++;
      stats.tai.tsumo[0] += w.action === 'tsumo' ? 1 : 0;
      stats.tai.tsumo[1]++;
      if (winner !== g.dealer && AI.reading(g, winner).oneSuit === null) {
        stats.tai.plain[0] += tai;
        stats.tai.plain[1]++;
      }
    }
    stats.games++;
  }
  return stats;
}

/** 合併子行程的統計表 */
function merge(parts) {
  const out = blank();
  for (const s of parts) {
    out.games += s.games;
    for (const k of ['tenpai', 'cells', 'test', 'win'])
      for (const [key, [h, n]] of Object.entries(s[k])) {
        const row = out[k][key] || (out[k][key] = [0, 0]);
        row[0] += h;
        row[1] += n;
      }
    for (const k of ['passed', 'water']) ((out[k][0] += s[k][0]), (out[k][1] += s[k][1]));
    for (const k of ['plain', 'all', 'tsumo'])
      ((out.tai[k][0] += s.tai[k][0]), (out.tai[k][1] += s.tai[k][1]));
    for (const k of Object.keys(out.rows)) for (const r of s.rows[k]) out.rows[k].push(r);
  }
  return out;
}

/** 從分類統計算出基本比例與加權倍數 */
function fitWait(cells) {
  const base = { h: [0, 0, 0, 0], n: [0, 0, 0, 0] },
    plain = {
      h: [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      n: [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    };
  // 基本比例：只用沒有任何加權線索的樣本
  for (const [key, [h, n]] of Object.entries(cells)) {
    const [kind, bucket, a, b, c] = key.split('|');
    if (a === '0' && b === '0' && c === '0') {
      plain[kind][bucket][0] += h;
      plain[kind][bucket][1] += n;
    }
  }
  for (const kind of ['h', 'n'])
    for (let i = 0; i < 4; i++) {
      const [h, n] = plain[kind][i];
      base[kind][i] = n >= 30 ? Math.round((h / n) * 10000) / 10000 : null;
    }
  // 倍數：有這個線索的樣本，實際命中數 ÷ 用基本比例預期的命中數
  const factor = {};
  ['nearCut', 'suitHit', 'avoid'].forEach((name, idx) => {
    let hit = 0,
      expected = 0;
    for (const [key, [h, n]] of Object.entries(cells)) {
      const parts = key.split('|');
      if (parts[2 + idx] !== '1') continue;
      const b = base[parts[0]][+parts[1]];
      if (b === null) continue;
      hit += h;
      expected += n * b;
    }
    factor[name] = expected >= 10 ? Math.round((hit / expected) * 100) / 100 : null;
  });
  return { base, factor };
}

/** 寫出教練讀的統計表與報告 */
function write(stats) {
  const S = require('../src/core/safety.js');
  const wait = fitWait(stats.cells);
  // 樣本不足的格子用預設值補上
  for (const kind of ['h', 'n'])
    wait.base[kind] = wait.base[kind].map((v, i) => (v === null ? S.DEFAULT_BASE[kind][i] : v));
  for (const k of Object.keys(wait.factor)) if (wait.factor[k] === null) wait.factor[k] = S.DEFAULT_FACTOR[k];
  const round = (x) => Math.round(x * 100) / 100;
  // 邏輯迴歸：聽牌機率、「這張是他要的牌」機率
  const { fit } = require('./logistic-fit.cjs');
  const O = require('../src/core/opponents.js');
  console.log('訓練聽牌模型：' + stats.rows.tx.length + ' 筆；等牌模型：' + stats.rows.wx.length + ' 筆');
  const tenpaiModel = { names: O.TENPAI_FEATURES, w: fit(stats.rows.tx, stats.rows.ty) };
  const waitModel = { names: S.WAIT_FEATURES, w: fit(stats.rows.wx, stats.rows.wy) };
  const data = {
    games: stats.games,
    tenpai: stats.tenpai,
    tenpaiModel,
    waitModel,
    wait,
    win: stats.win,
    avgTai: stats.tai.plain[1] ? round(stats.tai.plain[0] / stats.tai.plain[1]) : 3,
    avgTaiAll: stats.tai.all[1] ? round(stats.tai.all[0] / stats.tai.all[1]) : 3,
    tsumoShare: stats.tai.tsumo[1] ? round(stats.tai.tsumo[0] / stats.tai.tsumo[1]) : 0.4,
  };
  const js =
    '// 由 scripts/calibrate.cjs 產生（' +
    stats.games +
    ' 局電腦自戰），請勿手動修改；重新產生：npm run calibrate\n' +
    "(function (root) {\n  'use strict';\n  const data = " +
    JSON.stringify(data) +
    ";\n  if (typeof module !== 'undefined') module.exports = data;\n  else root.Calibration = data;\n})(globalThis);\n";
  fs.writeFileSync(path.join(ROOT, 'src/core/data/calibration.js'), js);
  // 「實戰驗證」一節由 scripts/evaluate-coach.cjs 的結果手動整理，重新校準時保留
  const doc = path.join(ROOT, 'docs/CALIBRATION.md'),
    old = fs.existsSync(doc) ? fs.readFileSync(doc, 'utf8') : '',
    keep = old.includes('## 實戰驗證') ? '\n' + old.slice(old.indexOf('## 實戰驗證')) : '';
  fs.writeFileSync(doc, report(stats, data) + keep);
  console.log('已寫入 src/core/data/calibration.js 與 docs/CALIBRATION.md（' + stats.games + ' 局）');
}

/**
 * 驗證局上比較「分組查表」（舊）與「邏輯迴歸」（新）：聽牌機率、放槍機率各一組分數。
 * @returns {string[]} 報告的段落
 */
function modelComparison(stats, data, prior, waitOf) {
  const L = require('../src/core/logistic.js');
  const { score } = require('./logistic-fit.cjs');
  const t = stats.rows.tenpaiTest,
    pairs = stats.rows.pairTest;
  if (!t.length || !pairs.length) return [];
  const oldT = score(
      t.map((r) => prior(r.k)),
      t.map((r) => r.y),
    ),
    newT = score(
      t.map((r) => L.predict(data.tenpaiModel, r.tv)),
      t.map((r) => r.y),
    );
  const y = pairs.map((r) => r.y);
  const oldP = score(
      pairs.map((r) => prior(r.k) * waitOf(r.c)),
      y,
    ),
    newP = score(
      pairs.map((r) => L.predict(data.tenpaiModel, r.tv) * Math.min(0.9, L.predict(data.waitModel, r.wv))),
      y,
    );
  const f = (x) => x.toFixed(5);
  const better = (a, b) => ((1 - b / a) * 100).toFixed(1) + '%';
  const weights = (m) =>
    m.names.map((n, i) => '| ' + n + ' | ' + (m.w[i] >= 0 ? '+' : '') + m.w[i].toFixed(2) + ' |');
  return [
    '## 分組查表 vs 邏輯迴歸（驗證局）',
    '',
    '參考台灣麻將聽牌預測與防守研究的做法，把「聽牌機率」和「這張是他要的牌」改用邏輯迴歸，',
    '特徵加入巡目、吃碰數、摸切節奏、最近打出的牌，以及「非需求度」（他自己打過這張或旁邊的牌、他打這一門的比例、攤牌花色）。',
    '',
    '| 預測 | 舊：分組查表 | 新：邏輯迴歸 | 改善 |',
    '|---|---|---|---|',
    '| 聽牌機率 log-loss | ' +
      f(oldT.logLoss) +
      ' | ' +
      f(newT.logLoss) +
      ' | ' +
      better(oldT.logLoss, newT.logLoss) +
      ' |',
    '| 聽牌機率 Brier | ' +
      f(oldT.brier) +
      ' | ' +
      f(newT.brier) +
      ' | ' +
      better(oldT.brier, newT.brier) +
      ' |',
    '| 放槍機率 log-loss | ' +
      f(oldP.logLoss) +
      ' | ' +
      f(newP.logLoss) +
      ' | ' +
      better(oldP.logLoss, newP.logLoss) +
      ' |',
    '| 放槍機率 Brier | ' +
      f(oldP.brier) +
      ' | ' +
      f(newP.brier) +
      ' | ' +
      better(oldP.brier, newP.brier) +
      ' |',
    '',
    '驗證樣本：聽牌 ' + t.length + ' 筆、打牌給某一家 ' + pairs.length + ' 筆（抽樣 30%）。',
    '',
    '<details><summary>模型權重（正數＝提高機率，負數＝降低）</summary>',
    '',
    '| 聽牌模型特徵 | 權重 |',
    '|---|---|',
    ...weights(data.tenpaiModel),
    '',
    '| 等牌模型特徵 | 權重 |',
    '|---|---|',
    ...weights(data.waitModel),
    '',
    '</details>',
    '',
  ];
}

/** 準確度報告：在沒拿來統計的驗證局上，比較新模型與簡單基準 */
function report(stats, data) {
  // 在子行程外重新載入，讓模組讀到剛寫好的統計表
  delete require.cache[require.resolve('../src/core/data/calibration.js')];
  const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1) + '%';
  const O = require('../src/core/opponents.js');
  const prior = (key) => O.probForKey(key, data.tenpai);
  const waitOf = (cell) => {
    const [kind, bucket, a, b, c] = cell.split('|');
    let p = data.wait.base[kind][+bucket];
    if (a === '1') p *= data.wait.factor.nearCut;
    if (b === '1') p *= data.wait.factor.suitHit;
    if (c === '1') p *= data.wait.factor.avoid;
    return Math.min(0.9, p);
  };
  let hits = 0,
    n = 0,
    brierModel = 0,
    brierBase = 0,
    brierTenpaiOnly = 0;
  const rows = Object.entries(stats.test);
  for (const [, [h, m]] of rows) ((hits += h), (n += m));
  const avg = n ? hits / n : 0;
  let avgWait = 0,
    waitN = 0;
  for (const [, [h, m]] of Object.entries(stats.cells)) ((avgWait += h), (waitN += m));
  avgWait = waitN ? avgWait / waitN : 0;
  const deciles = Array.from({ length: 6 }, () => [0, 0, 0]);
  const edges = [0.002, 0.005, 0.01, 0.02, 0.04, Infinity];
  for (const [key, [h, m]] of rows) {
    const [tKey, cell] = key.split('#');
    const p = prior(tKey) * waitOf(cell),
      pT = prior(tKey) * avgWait;
    // Brier：(預測 − 實際)² 的平均，越小越準
    brierModel += h * (1 - p) ** 2 + (m - h) * p ** 2;
    brierBase += h * (1 - avg) ** 2 + (m - h) * avg ** 2;
    brierTenpaiOnly += h * (1 - pT) ** 2 + (m - h) * pT ** 2;
    const d = edges.findIndex((e) => p < e);
    deciles[d][0] += m;
    deciles[d][1] += h;
    deciles[d][2] += p * m;
  }
  const cellRate = (kind, bucket) => {
    let h = 0,
      m = 0;
    for (const [key, [a, b]] of Object.entries(stats.cells)) {
      const [k, bk] = key.split('|');
      if (k === kind && +bk === bucket) ((h += a), (m += b));
    }
    return m ? pct(h / m) + '（' + m + ' 筆）' : '—';
  };
  const tenpaiRows = Object.entries(data.tenpai)
    .filter(([, [, m]]) => m >= 200)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, [h, m]]) => {
      const [melds, turn, streak] = k.split('|');
      return (
        '| ' +
        melds +
        (melds === '3' ? '+' : '') +
        ' | ' +
        ['1–3', '4–6', '7–9', '10–12', '13+'][+turn] +
        ' | ' +
        ['0', '1–2', '3+'][+streak] +
        ' | ' +
        pct(h / m) +
        ' | ' +
        m +
        ' |'
      );
    });
  const lines = [
    '# 教練機率的校準報告',
    '',
    '由 `npm run calibrate` 產生：電腦自戰 ' +
      stats.games +
      ' 局（每 5 局留 1 局只做驗證）。電腦知道每家真正的手牌，所以能直接數出「聽牌的比例」與「每種牌是對方要的牌的比例」。',
    '',
    '> 對手是本程式的電腦（中級與高級各半），設定為有胡必胡，所以「放過的牌」在這些電腦身上實測 0 次放槍；這是模型前提，不是真人牌桌的安全保證——真人可能為了自摸或台數放過胡牌。教練不讀對手私密的過水狀態。',
    '',
    '## 規則類判斷的驗證',
    '',
    '| 判斷 | 樣本 | 其實是對方要的牌 |',
    '|---|---|---|',
    '| 對方手牌沒換過期間放過的牌（電腦有胡必胡的前提） | ' +
      stats.passed[1] +
      ' | ' +
      stats.passed[0] +
      ' 次 |',
    '',
    '## 對方已聽牌時，各類牌是他要的牌的比例',
    '',
    '| 牌的種類 | 比例 |',
    '|---|---|',
    '| 字牌，生張（只有你手上這張） | ' + cellRate('h', 1) + ' |',
    '| 字牌，連你這張共見 2 張 | ' + cellRate('h', 2) + ' |',
    '| 字牌，連你這張共見 3 張（只剩單吊） | ' + cellRate('h', 3) + ' |',
    '| 數字牌，順子等不到（壁或邊界） | ' + cellRate('n', 0) + ' |',
    '| 數字牌，只有 1 種順子能等 | ' + cellRate('n', 1) + ' |',
    '| 數字牌，2 種順子能等 | ' + cellRate('n', 2) + ' |',
    '| 數字牌，3 種順子都能等（中張） | ' + cellRate('n', 3) + ' |',
    '',
    '見張數包含你手上要打的這張；四張都看得到的字牌一定安全，不列入統計。',
    '',
    '加權倍數（相對於同類牌）：他最近手切的牌附近 ×' +
      data.wait.factor.nearCut +
      '；他攤牌做一色的那門／字牌 ×' +
      data.wait.factor.suitHit +
      '；他一直在打的那門 ×' +
      data.wait.factor.avoid +
      '。倍數在 0.9～1.1 之間代表對本程式的電腦看不出差別，教練就不會把它當成理由（真人可能不同）。',
    '',
    '## 聽牌機率（依攤牌數、打出張數、連續摸切）',
    '',
    '| 攤牌 | 已打出張數 | 連續摸切 | 實際聽牌比例 | 樣本 |',
    '|---|---|---|---|---|',
    ...tenpaiRows,
    '',
    ...modelComparison(stats, data, prior, waitOf),
    '## 放槍機率準不準（驗證局）',
    '',
    '驗證局共 ' + n + ' 筆「打這張牌給某一家」，實際放槍 ' + hits + ' 筆（' + pct(avg) + '）。',
    '',
    '| 模型 | Brier 分數（越小越準） |',
    '|---|---|',
    '| 全部用平均放槍率 | ' + (brierBase / n).toFixed(5) + ' |',
    '| 只看對方聽牌機率 | ' + (brierTenpaiOnly / n).toFixed(5) + ' |',
    '| 聽牌機率 × 牌的分類（目前教練使用） | ' + (brierModel / n).toFixed(5) + ' |',
    '',
    '| 預測放槍率 | 樣本 | 預測平均 | 實際 |',
    '|---|---|---|---|',
    ...deciles
      .filter((d) => d[0])
      .map(
        (d, i) =>
          '| ' +
          ['< 0.2%', '0.2–0.5%', '0.5–1%', '1–2%', '2–4%', '≥ 4%'][i] +
          ' | ' +
          d[0] +
          ' | ' +
          pct(d[2] / d[0]) +
          ' | ' +
          pct(d[1] / d[0]) +
          ' |',
      ),
    '',
    '## 胡牌與台數',
    '',
    '- 一般胡牌（非莊家、沒做一色）平均 ' +
      data.avgTai +
      ' 台；全部胡牌平均 ' +
      data.avgTaiAll +
      ' 台；自摸占 ' +
      pct(data.tsumoShare) +
      '。',
    '- 自己「進聽數 × 有效牌 × 牌牆剩餘」對應的最後胡牌比例共 ' +
      Object.keys(data.win).length +
      ' 組，供攻守期望值使用。',
    '',
  ];
  return lines.join('\n');
}

if (process.argv[2] === '--child') {
  const [from, to] = process.argv.slice(3).map(Number);
  process.send(run(from, to));
} else if (require.main === module) {
  const total = Number(process.argv[2]) || 1600,
    workers = Math.max(1, Math.min(os.cpus().length, 8)),
    size = Math.ceil(total / workers),
    parts = [],
    started = Date.now();
  let done = 0;
  for (let w = 0; w < workers; w++) {
    const from = w * size + 1,
      to = Math.min(total, (w + 1) * size);
    if (from > to) continue;
    const child = fork(__filename, ['--child', String(from), String(to)]);
    child.on('message', (s) => {
      parts.push(s);
      console.log('完成 ' + from + '–' + to + '（' + Math.round((Date.now() - started) / 1000) + ' 秒）');
    });
    child.on('exit', () => {
      if (++done === Math.min(workers, Math.ceil(total / size))) write(merge(parts));
    });
  }
}

module.exports = { run, merge, fitWait, blank };
