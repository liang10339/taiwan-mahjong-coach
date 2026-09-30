'use strict';
// 成長報告畫面（「牌局覆盤」分頁，錯題本下方）：指標卡、一致率趨勢圖、各階段一致率與建議。
// 統計邏輯在 src/core/growth.js；歷史紀錄由 finishHand()（flow.js）在每局結束時寫入。

/** 本機最多保留幾局歷史 */
const HISTORY_LIMIT = 100;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('mahjong-coach-history') || '[]');
  } catch (e) {
    return [];
  }
}

const pct = (v) => (v === null ? '—' : Math.round(v * 100) + '%');

/**
 * 一張指標卡：數值＋和之前比較的變化。lowerIsBetter 表示數字變小才是進步（失誤、放槍）。
 * @param {string} name @param {number|null} now @param {number|null} before
 */
function growthStat(name, now, before, { format = pct, unit = 100, lowerIsBetter = false } = {}) {
  const card = el('div', 'growth-stat');
  card.append(el('small', null, name), el('strong', null, format(now)));
  if (now !== null && before !== null) {
    const d = Math.round((now - before) * unit);
    const better = lowerIsBetter ? d < 0 : d > 0;
    card.append(
      el(
        'span',
        'growth-change' + (d === 0 ? '' : better ? ' better' : ' worse'),
        d === 0 ? '與之前持平' : (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + (unit === 100 ? ' 個百分點' : ''),
      ),
    );
  }
  return card;
}

/** 一致率趨勢圖：每局一個點，線是最近 5 局的平均。滑過點會顯示那一局的數字。 */
function growthChart(series) {
  const W = 320,
    H = 120,
    L = 30,
    R = 8,
    T = 8,
    B = 18;
  const x = (i) => L + (series.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (series.length - 1));
  const y = (v) => T + (1 - v) * (H - T - B);
  const grid = [0, 0.5, 1]
    .map(
      (v) =>
        '<line class="grid" x1="' +
        L +
        '" x2="' +
        (W - R) +
        '" y1="' +
        y(v) +
        '" y2="' +
        y(v) +
        '"/>' +
        '<text class="axis" x="' +
        (L - 4) +
        '" y="' +
        (y(v) + 3) +
        '" text-anchor="end">' +
        v * 100 +
        '%</text>',
    )
    .join('');
  const line = series.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.avg).toFixed(1)).join(' ');
  const dots = series
    .map(
      (p, i) =>
        '<g class="hit"><circle class="hit-area" cx="' +
        x(i) +
        '" cy="' +
        y(p.rate) +
        '" r="8"/>' +
        '<circle class="dot" cx="' +
        x(i) +
        '" cy="' +
        y(p.rate) +
        '" r="4"/>' +
        '<title>第 ' +
        (i + 1) +
        ' 局：一致率 ' +
        pct(p.rate) +
        '，近 5 局平均 ' +
        pct(p.avg) +
        '，關鍵失誤 ' +
        p.mistakes +
        ' 次</title></g>',
    )
    .join('');
  const box = el('figure', 'growth-chart');
  box.innerHTML =
    '<figcaption>與教練一致率（由舊到新，共 ' +
    series.length +
    ' 局）</figcaption>' +
    '<svg viewBox="0 0 ' +
    W +
    ' ' +
    H +
    '" role="img" aria-label="每局與教練一致率的趨勢">' +
    grid +
    (series.length > 1 ? '<path class="avg" d="' + line + '"/>' : '') +
    dots +
    '<text class="axis" x="' +
    L +
    '" y="' +
    (H - 4) +
    '">較早</text>' +
    '<text class="axis" x="' +
    (W - R) +
    '" y="' +
    (H - 4) +
    '" text-anchor="end">最近</text></svg>' +
    '<div class="growth-legend"><span class="key dot-key"></span>每局' +
    '<span class="key line-key"></span>近 5 局平均</div>';
  return box;
}

function renderGrowth() {
  const box = $('#growthPanel');
  if (!box || typeof Growth === 'undefined') return;
  box.replaceChildren();
  const r = Growth.report(loadHistory());
  box.append(el('h3', null, '成長報告'));
  if (!r.all.hands) {
    box.append(el('p', null, '打完一局後，這裡會顯示你和教練的一致率、關鍵失誤與胡牌放槍的變化。'));
    return;
  }
  // 之前的局數不夠時沒有比較基準，各項都當成沒有資料
  const now = r.recent,
    before = r.before || { agreement: null, mistakesPer100: null, winRate: null, dealInRate: null };
  box.append(
    el(
      'small',
      'growth-meta',
      '最近 ' +
        now.hands +
        ' 局' +
        (r.before ? '，和之前 ' + r.before.hands + ' 局比較' : '（再打幾局就能看到進退步）'),
    ),
  );
  const stats = el('div', 'growth-stats');
  stats.append(
    growthStat('與教練一致率', now.agreement, before.agreement),
    growthStat('每 100 手關鍵失誤', now.mistakesPer100, before.mistakesPer100, {
      format: (v) => (v === null ? '—' : v.toFixed(1)),
      unit: 1,
      lowerIsBetter: true,
    }),
    growthStat('胡牌率', now.winRate, before.winRate),
    growthStat('放槍率', now.dealInRate, before.dealInRate, { lowerIsBetter: true }),
  );
  box.append(stats);
  box.append(growthChart(r.series));
  const stages = el('div', 'growth-stages');
  stages.append(el('small', null, '各階段一致率（最近 ' + now.hands + ' 局）'));
  now.stages.forEach((s) => {
    const row = el('div', 'growth-stage'),
      bar = el('span', 'bar');
    bar.style.setProperty('--w', s.rate === null ? '0%' : Math.round(s.rate * 100) + '%');
    row.append(el('span', null, s.name), bar, el('b', null, pct(s.rate) + '　' + s.turns + ' 手'));
    stages.append(row);
  });
  box.append(stages);
  if (typeof Skills !== 'undefined') box.append(skillSection(loadHistory()));
  const tips = el('ul', 'growth-tips');
  r.tips.forEach((t) => tips.append(el('li', null, t)));
  box.append(tips);
}

/**
 * 技能熟練度：最近 20 局每種判斷和教練相同的比例，最弱的排最前面；
 * 樣本足夠又還沒熟練的，可以直接到錯題本只練這一種。
 */
function skillSection(history) {
  const box = el('div', 'growth-skills');
  const list = Skills.mastery(history);
  box.append(
    el(
      'small',
      null,
      '技能熟練度（最近 20 局，熟練＝至少 ' +
        Skills.MIN_SAMPLES +
        ' 次且 ' +
        Math.round(Skills.MASTERED * 100) +
        '% 以上和教練相同）',
    ),
  );
  for (const m of list) {
    const row = el('div', 'growth-stage skill-' + m.status),
      bar = el('span', 'bar');
    bar.style.setProperty('--w', m.rate === null ? '0%' : Math.round(m.rate * 100) + '%');
    const state = m.status === 'mastered' ? '熟練' : m.status === 'practice' ? '練習中' : '樣本不足';
    row.append(el('span', null, m.name), bar, el('b', null, pct(m.rate) + '　' + m.n + ' 次・' + state));
    box.append(row);
  }
  const weak = list.find((m) => m.status === 'practice');
  if (weak) {
    box.append(el('p', 'growth-focus', '建議先練「' + weak.name + '」：' + weak.tip + '。'));
    const n =
      typeof loadNotebook === 'function'
        ? loadNotebook().filter((x) => (x.skills || []).includes(weak.tag)).length
        : 0;
    if (n) {
      const go = el('button', 'secondary-button', '到錯題本練「' + weak.name + '」（' + n + ' 題）');
      go.type = 'button';
      go.onclick = () => startSkillPractice(weak.tag);
      box.append(go);
    }
  }
  return box;
}
