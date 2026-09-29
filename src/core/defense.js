(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' ? require('./engine') : root.Mahjong;
  const label = (t) => (t === 33 ? '白板' : E.names[t]);
  const limit = '這是可見牌的組合排除，不是放槍機率；不能因對手打過或同屬147就認定安全。未判斷對手是否聽牌。';
  function inspect(g, viewer, t) {
    const known = Array(34).fill(0);
    for (const x of [...g.hands[viewer], ...E.publicTiles(g, viewer)]) if (x < 34) known[x]++;
    const unseen = known.map((n) => Math.max(0, 4 - n)),
      opponents = [];
    for (let p = 0; p < 4; p++)
      if (p !== viewer) {
        const groups = g.melds[p].length,
          ways = [];
        if (unseen[t] >= 1) ways.push({ kind: '單吊', needs: [t] });
        if (groups < 5) {
          if (unseen[t] >= 2) ways.push({ kind: '對碰', needs: [t, t] });
          if (t < 27)
            for (
              let start = Math.max(Math.floor(t / 9) * 9, t - 2);
              start <= Math.min(Math.floor(t / 9) * 9 + 6, t);
              start++
            ) {
              const needs = [start, start + 1, start + 2];
              needs.splice(needs.indexOf(t), 1);
              if (needs.every((x) => unseen[x] > 0)) ways.push({ kind: '順子', needs });
            }
        }
        opponents.push({ player: p, groups, ways, discarded: g.rivers[p].includes(t) });
      }
    const possible = opponents.reduce((n, o) => n + o.ways.length, 0);
    return { tile: t, known: known[t], unseen: unseen[t], opponents, possible, excluded: possible === 0 };
  }
  function describe(r) {
    if (r.excluded)
      return label(r.tile) + '：依目前可見牌，三家都無法用它完成一般胡牌組合（限本程式五組加一對）。';
    const kinds = [...new Set(r.opponents.flatMap((o) => o.ways.map((w) => w.kind)))];
    return (
      label(r.tile) +
      '：已知 ' +
      r.known +
      ' 張，仍不能排除' +
      kinds.join('、') +
      '。' +
      (r.opponents.some((o) => o.discarded) ? '有人打過這張，也不代表現在不能胡。' : '')
    );
  }
  function compare(g, options, viewer = 0) {
    if (!options.length) return null;
    const ranked = options
      .map((option) => ({ option, risk: inspect(g, viewer, option.tile) }))
      .sort(
        (a, b) =>
          a.risk.possible - b.risk.possible ||
          a.option.shanten - b.option.shanten ||
          b.option.remaining - a.option.remaining ||
          a.option.tile - b.option.tile,
      );
    const attack = ranked.find((x) => x.option.tile === options[0].tile),
      guard = ranked[0];
    const cost = guard.option.shanten - attack.option.shanten;
    const tradeoff =
      guard.option.tile === attack.option.tile
        ? '與牌效率首選相同。'
        : cost > 0
          ? '代價：比牌效率首選多 ' + cost + ' 步才聽牌。'
          : '進聽數相同，有效牌少 ' + (attack.option.remaining - guard.option.remaining) + ' 張。';
    return { attack, guard, ranked, tradeoff, limit };
  }
  function summary(g, options, viewer = 0) {
    const r = compare(g, options, viewer);
    return r
      ? '牌效率：打' +
          label(r.attack.option.tile) +
          '。\n防守參考：打' +
          label(r.guard.option.tile) +
          '（' +
          (r.guard.risk.excluded ? '可排除一般胡牌' : '可成立的胡牌組合種類較少，不代表機率較低') +
          '）。\n' +
          r.tradeoff +
          '\n' +
          describe(r.guard.risk) +
          '\n' +
          limit
      : '輪到你出牌時，才能比較攻守取捨。';
  }
  const api = { inspect, compare, describe, summary, limit };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Defense = api;
})(globalThis);
