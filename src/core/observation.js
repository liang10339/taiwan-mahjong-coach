(function (root) {
  'use strict';
  // Analysis receives this seat's knowledge, never the engine's complete game.
  // Build an allowlist: future engine fields are private until explicitly exposed.
  const projected = new WeakSet();
  const seats = [0, 1, 2, 3];
  const publicCut = (cut, owner, viewer) => (owner !== viewer && cut === 'empty' ? 'hand' : cut);

  function eventFor(e, viewer) {
    if (
      ![
        'draw',
        'discard',
        'response',
        'resolution',
        'chi',
        'pon',
        'kan',
        'concealed',
        'added-attempt',
        'added',
        'flowers',
        'ron',
        'tsumo',
      ].includes(e.action)
    )
      return null;
    if (e.action === 'response' && e.player !== viewer) return null;
    const out = { action: e.action };
    for (const key of ['player', 'from', 'choice', 'special', 'afterKan', 'robKan'])
      if (e[key] !== undefined) out[key] = e[key];
    if (e.tile !== undefined && (e.player === viewer || !['draw', 'concealed'].includes(e.action)))
      out.tile = e.tile;
    if (e.cut !== undefined) out.cut = publicCut(e.cut, e.player, viewer);
    // 吃碰明槓用了哪幾張是攤在桌上的公開資訊；回應只給自己看
    if (e.tiles && (['chi', 'pon', 'kan'].includes(e.action) || e.player === viewer))
      out.tiles = e.tiles.slice();
    return out;
  }

  /** A read-only-by-convention engine-compatible view. Hidden arrays retain counts, not tile values. */
  function forPlayer(g, viewer = 0) {
    if (!seats.includes(viewer)) throw new RangeError('Unknown player');
    if (projected.has(g)) {
      if (g.observationFor !== viewer) throw new Error('A player view cannot reveal another seat');
      return g;
    }
    const choice = g.pending && g.pending.decisions && g.pending.decisions[viewer];
    const view = {
      observationFor: viewer,
      hands: seats.map((p) => (p === viewer ? g.hands[p].slice() : Array(g.hands[p].length).fill(null))),
      handCounts: seats.map((p) => g.hands[p].length),
      wall: Array(g.wall.length).fill(null),
      rivers: seats.map((p) => g.rivers[p].slice()),
      flowers: seats.map((p) => (g.flowers[p] || []).slice()),
      melds: seats.map((p) =>
        g.melds[p].map((m) => ({
          type: m.type,
          from: m.from,
          tiles: m.type === 'concealed' && p !== viewer ? [] : m.tiles.slice(),
        })),
      ),
      cuts: seats.map((p) => ((g.cuts && g.cuts[p]) || []).map((cut) => publicCut(cut, p, viewer))),
      water: seats.map((p) => (p === viewer ? !!(g.water && g.water[p]) : null)),
      pending: g.pending
        ? {
            from: g.pending.from,
            tile: g.pending.tile,
            kind: g.pending.kind,
            decisions: choice
              ? { [viewer]: { type: choice.type, ...(choice.tiles ? { tiles: choice.tiles.slice() } : {}) } }
              : {},
          }
        : null,
      fresh: g.fresh && g.fresh.player === viewer ? { player: viewer, tile: g.fresh.tile } : null,
      lastTake:
        g.lastTake && g.lastTake.player === viewer
          ? { player: viewer, tile: g.lastTake.tile, afterKan: !!g.lastTake.afterKan }
          : null,
      log: (g.log || []).map((e) => eventFor(e, viewer)).filter(Boolean),
      // 開局：別家配到、補進的牌看不到（只知道張數）；攤出的花是公開的
      opening: (g.opening || []).map((e) =>
        e.type === 'deal'
          ? {
              type: e.type,
              player: e.player,
              round: e.round,
              tiles: e.tiles.map((t) => (e.player === viewer ? t : null)),
            }
          : {
              type: e.type,
              player: e.player,
              flowers: e.flowers.slice(),
              replacements: e.replacements.map((t) => (e.player === viewer ? t : null)),
            },
      ),
      // These are declared behavior models, not observations of secret win/pass flags.
      // The app's default seat 0 is human; seats 1–3 always accept legal wins.
      playerPolicies: seats.map((p) => ({ alwaysWin: g.playerPolicies?.[p]?.alwaysWin ?? p !== 0 })),
    };
    for (const key of [
      'turn',
      'phase',
      'dealer',
      'roundWind',
      'streak',
      'reserve',
      'passWater',
      'wallOwner',
      'result',
      'dealing',
    ])
      if (g[key] !== undefined) view[key] = g[key];
    if (g.dice) view.dice = g.dice.slice();
    // 電腦對手公開宣告的風格（速攻、保守、大牌），和桌規一樣是公開資訊
    if (g.playerStyles) view.playerStyles = g.playerStyles.slice();
    if (g.rules) view.rules = { id: g.rules.id, version: g.rules.version, liguLigu: g.rules.liguLigu };
    projected.add(view);
    return view;
  }

  // Repeatable simulation randomness depends on observable state, never the deck seed.
  function fingerprint(g, viewer = 0) {
    const text = JSON.stringify(forPlayer(g, viewer));
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    return hash;
  }

  const api = { forPlayer, fingerprint };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Observation = api;
})(globalThis);
