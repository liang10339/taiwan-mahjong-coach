'use strict';
// 教練欄最上方的「場況判斷」：局勢（做牌／進攻／攻守兼顧／先守）、一句總結，以及這一手最重要的幾點。
// 判斷邏輯在 src/core/situation.js；這裡負責快取與「同樣的話不要每手重複講」。

let situationCache = { key: '', value: null };
/** 講過的重點 → 在你第幾次出牌時講的（每局重置） */
let situationSaid = new Map();
/** 重要性低於這個值的重點，最近講過就先不重複 */
const REPEAT_WEIGHT = 4;
/** 講過幾手之內不重複 */
const REPEAT_GAP = 3;

function currentSituation() {
  if (typeof Situation === 'undefined' || game.phase === 'ended') return null;
  const mine = game.turn === 0 && game.phase === 'discard';
  const key = JSON.stringify([decisionKey(), game.turn, game.log.length]);
  if (situationCache.key !== key)
    situationCache = { key, value: Situation.read(game, 0, mine && suggestions.length ? suggestions : null) };
  return situationCache.value;
}

/** 新的一局：清掉「講過了」的紀錄 */
function resetSituation() {
  situationSaid = new Map();
  situationCache = { key: '', value: null };
}

/** 挑出這次要講的重點：重要的一定講；其他的最近幾手講過就先略過 */
function freshPoints(points, max) {
  const turn = turnLog.length;
  const out = points.filter((p) => {
    const at = situationSaid.get(p.text);
    return p.weight >= REPEAT_WEIGHT || at === undefined || at === turn || turn - at > REPEAT_GAP;
  });
  out.slice(0, max).forEach((p) => situationSaid.set(p.text, turn));
  return out.slice(0, max);
}

/** 場況判斷卡片；max 是最多列幾點（輪到你出牌 3 點，其他時候 1 點） */
function situationSection(body, max) {
  const s = currentSituation();
  if (!s) return;
  const box = el('section', 'situation stance-' + s.stance);
  const head = el('div', 'situation-head');
  head.append(el('span', 'stance', s.label), el('p', null, s.headline));
  box.append(head);
  const points = freshPoints(s.points, max);
  if (points.length) {
    const list = el('ul', 'situation-points');
    points.forEach((p) => list.append(el('li', p.weight >= REPEAT_WEIGHT ? 'urgent' : null, p.text)));
    box.append(list);
  }
  body.append(box);
}
