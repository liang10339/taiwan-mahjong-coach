'use strict';
// 教練欄的「攻守期望值表」：直接列出決策核心（advisor.js → policy.js）選牌時用的數字，
// 標題的建議就是這張表期望值最高（或差不多時照牌效率）的那張。以前這裡另外跑一套模擬，
// 會和標題的建議不一致；現在全部出自同一個判斷。

/** 教練欄的攻守期望值表 */
function valueSection(body) {
  if (!settings.value) return;
  const d = currentDecision();
  if (!d || !d.plan) return;
  const box = el('section', 'value-card');
  box.append(el('h5', null, '攻守期望值（教練選牌用的數字）'));
  const table = el('div', 'value-table');
  const head = el('div', 'value-row head');
  head.append(
    el('span', null, '打'),
    el('span', null, '胡牌率'),
    el('span', null, '胡了約'),
    el('span', null, '放槍'),
    el('span', null, '期望'),
  );
  table.append(head);
  const rows = d.plan.rows.slice(0, 6),
    top = Math.max(0.01, ...rows.map((r) => Math.abs(r.ev)));
  for (const r of rows) {
    const tai = d.worth.get(r.tile).tai;
    const row = el(
      'div',
      'value-row' + (r.tile === d.tile ? ' rich' : '') + (r.tile === d.efficiency.tile ? ' fast' : ''),
    );
    const bar = el('span', 'value-bar' + (r.ev < 0 ? ' negative' : '')),
      fill = el('i');
    fill.style.width = Math.round((Math.abs(r.ev) / top) * 100) + '%';
    bar.append(fill, el('b', null, (r.ev >= 0 ? '+' : '') + r.ev.toFixed(2) + ' 台'));
    row.append(
      Tiles.node(r.tile, 'xs'),
      el('span', null, Math.round(r.win * 100) + '%'),
      el('span', null, ((tai.ron + tai.tsumo) / 2).toFixed(1) + ' 台'),
      el('span', null, (r.dealIn * 100).toFixed(1) + '%'),
      bar,
    );
    table.append(row);
  }
  box.append(table);
  box.append(
    el(
      'small',
      'value-note',
      '期望＝胡牌率 × 胡了的收入（含底，自摸三家付）－ 這張的放槍代價 － 之後幾巡的放槍代價（有人可能聽牌時，繼續進攻每巡都要冒險；改守可以先打手上的安全牌）。' +
        '胡牌率依進聽數、有效牌與牌牆剩餘查自戰統計；「胡了約」是自摸與胡別人的平均，聽牌時逐張實際計台。' +
        '白底是建議打的牌，胡牌率粗體的是只看牌效率的首選；差距不到 ' +
        Policy.MARGIN +
        ' 台時照牌效率打。',
    ),
  );
  body.append(box);
}
