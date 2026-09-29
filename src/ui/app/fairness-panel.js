'use strict';
// 公平性：開局公布牌牆指紋，一局結束後攤開三家手牌、剩下的牌牆與洗牌種子，並現場驗證。
// 也能把「同一副牌」做成連結分享，或自己再打一次。演算法在 src/core/fairness.js。

/** 這一局開局時公布的指紋 */
let dealPrint = '';
/** 下一局要用的指定牌局（從分享連結或「再打一次」來），用過一次就清掉 */
let pendingDeal = typeof Fairness !== 'undefined' ? Fairness.decodeDeal(location.hash) : null;

/** 建立新的一局：有指定牌局就用它的種子與桌規，否則照目前設定隨機洗牌 */
function dealGame() {
  const deal = pendingDeal;
  pendingDeal = null;
  if (deal) {
    // 分享的牌局要從同一個莊家、圈風、連莊開始，結算和下一局才會接得上
    session.dealer = deal.opts.dealer;
    session.round = deal.opts.roundWind;
    session.streak = deal.opts.streak;
    if (typeof history !== 'undefined' && location.hash) history.replaceState(null, '', location.pathname);
  }
  // 洗牌只用種子的低 32 位元，所以直接存成 32 位元，公開與分享的數字才和這局一致
  const g = deal ? E.create(deal.seed, deal.opts) : E.create(Date.now() >>> 0, ruleOpts());
  publishDealPrint(g);
  return { game: g, shared: !!deal };
}

/** 開局時算出並公布牌牆指紋（顯示在牌桌中央） */
function publishDealPrint(g) {
  dealPrint = typeof Fairness !== 'undefined' ? Fairness.fingerprint(g) : '';
  const tag = $('#dealPrint');
  if (!tag) return;
  tag.textContent = dealPrint ? '牌牆指紋 ' + dealPrint.slice(0, 6) : '';
  tag.title = '開局就固定的整副牌指紋；一局結束後會公開洗牌種子，讓你驗證中途沒有換牌。';
}

/** 分享連結：打開後會打同一副牌（同樣的配牌、牌牆與骰子） */
function dealLink() {
  return location.origin + location.pathname + '#deal=' + Fairness.encodeDeal(game);
}

/** 一局結束時的公平性卡片：驗證結果、三家手牌、剩下的牌牆、種子與分享 */
function fairnessCard() {
  const box = el('details', 'fairness-card');
  if (typeof Fairness === 'undefined') return box;
  const v = Fairness.verify(game, dealPrint);
  box.append(el('summary', null, (v.ok ? '✓ 公平性驗證通過' : '✗ 公平性驗證失敗') + '：攤開所有手牌與牌牆'));
  box.append(
    el(
      'p',
      'fairness-verdict' + (v.ok ? '' : ' bad'),
      v.ok
        ? '用公開的種子重新洗牌，得到的指紋 ' +
            v.fingerprint.slice(0, 6) +
            ' 和開局時公布的相同，剩下的牌牆也沒有被抽換或重排。電腦看不到你的手牌，也沒有中途換牌。'
        : '重新洗牌的結果和這局對不上（' +
            (v.matches ? '剩下的牌牆被動過' : '指紋不同') +
            '），請回報這個種子。',
    ),
  );
  [1, 2, 3].forEach((p) => {
    const row = el('div', 'fairness-hand');
    row.append(el('small', null, seats[p]));
    const tiles = el('span', 'meld-group');
    game.hands[p]
      .slice()
      .sort((a, b) => a - b)
      .forEach((t) => tiles.append(Tiles.node(t, 'xs')));
    row.append(tiles);
    game.melds[p].forEach((m) => {
      const g = el('span', 'meld-group');
      m.tiles.forEach((t) => g.append(Tiles.node(t, 'xs')));
      row.append(g);
    });
    box.append(row);
  });
  // 接下來會摸到的牌：陣列尾端是摸牌端，所以倒過來排
  const next = game.wall.slice(-12).reverse();
  if (next.length) {
    const row = el('div', 'fairness-hand');
    row.append(el('small', null, '接下來的牌'));
    const tiles = el('span', 'meld-group');
    next.forEach((t) => tiles.append(Tiles.node(t, 'xs')));
    row.append(tiles, el('small', null, '牌牆共剩 ' + game.wall.length + ' 張'));
    box.append(row);
  }
  const code = Fairness.encodeDeal(game);
  box.append(el('p', 'fairness-seed', '洗牌種子與桌規：' + code));
  const actions = el('div', 'fairness-actions');
  const share = el('button', 'secondary-button', '複製這副牌的連結');
  share.type = 'button';
  share.onclick = () => {
    const link = dealLink();
    const done = () => notify('已複製連結：朋友打開就能打同一副牌');
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(link).then(done, () => notify(link));
    else notify(link);
  };
  const again = el('button', 'secondary-button', '同一副牌再打一次');
  again.type = 'button';
  again.onclick = () => {
    pendingDeal = Fairness.decodeDeal(code);
    newHand('同一副牌再打一次：配牌與牌牆都和剛才相同。');
  };
  actions.append(share, again);
  box.append(actions);
  return box;
}
