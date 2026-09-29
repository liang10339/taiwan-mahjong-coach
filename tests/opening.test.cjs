// 開始畫面與完整開局：抓位、擲骰、開門、配牌、補花的流程與設定記憶。
const assert = require('node:assert/strict');
const { createUiContext } = require('./helpers.cjs');

// 1. 開頁先顯示開始畫面，還不開打
{
  const ui = createUiContext();
  assert.equal(ui.run('openingActive'), true, '開頁要先顯示開始畫面');
  assert.equal(ui.get('#opening').classList.contains('hidden'), false);
  assert.equal(ui.get('#openingTitle').textContent, '牌桌教練');
  // 直接開始：關閉開始畫面就能摸牌
  ui.button('#openingActions', '開始').onclick();
  assert.equal(ui.run('openingActive'), false);
  assert.equal(ui.get('#opening').classList.contains('hidden'), true);
  ui.get('#drawButton').onclick();
  assert.equal(ui.get('#hand').children.length, 17, '直接開始後可以正常摸牌');
}

// 2. 完整開局：抓位 → 擲骰 → 開門 → 配牌 → 補花 → 開始打牌
{
  const ui = createUiContext();
  ui.run("settings.opening = 'full'");
  ui.button('#openingActions', '開始').onclick();
  assert.equal(ui.get('#openingTitle').textContent, '抓位');
  const picks = ui.get('#openingStage').children[0].children;
  assert.equal(picks.length, 4, '四張蓋著的風牌');
  picks[0].onclick();
  assert.match(ui.get('#openingText').textContent, /你抽到「[東南西北]」/);
  ui.button('#openingActions', '擲骰').onclick();
  assert.equal(ui.get('#openingTitle').textContent, '擲骰');
  const dealer = ui.run('game.dealer');
  if (dealer === 0) ui.button('#openingActions', '擲骰子').onclick();
  ui.flush();
  const [a, b, c] = ui.run('game.dice'),
    sum = a + b + c,
    owner = ui.run('game.wallOwner');
  assert.equal(owner, (dealer + sum - 1) % 4, '從莊家逆時針數到點數的那家開門');
  assert.match(ui.get('#openingText').textContent, new RegExp(sum + ' 點'));
  ui.button('#openingActions', '開門').onclick();
  ui.flush();
  assert.match(
    ui.get('#openingText').textContent,
    sum >= 18 ? /數滿 18 墩/ : new RegExp('第 ' + (sum + 1) + ' 墩'),
  );
  ui.button('#openingActions', '配牌').onclick();
  assert.equal(ui.run('game.log.length'), 0, '開局演示時電腦還不能出牌');
  ui.flush();
  assert.match(ui.get('#openingText').textContent, /四家各 16 張/);
  ui.button('#openingActions', '補花').onclick();
  ui.button('#openingActions', '開始打牌').onclick();
  assert.equal(ui.run('openingActive'), false);
  assert.equal(ui.run('game.phase === "draw" || game.phase === "discard" || game.phase === "claim"'), true);
}

// 3. 開局方式存在本機；下一局在完整開局模式下也會演示（不再抓位）
{
  const ui = createUiContext({
    storage: { 'mahjong-coach-settings': JSON.stringify({ opening: 'full', seatDraw: false }) },
  });
  assert.equal(ui.run('settings.opening'), 'full', '記住上次選的開局方式');
  ui.button('#openingActions', '開始').onclick();
  assert.equal(ui.get('#openingTitle').textContent, '擲骰', '不抓位時直接從擲骰開始');
  ui.button('#openingActions', '跳過開局').onclick();
  assert.equal(ui.run('openingActive'), false, '可以跳過開局');
}

console.log('PASS: 開始畫面、直接開始、完整開局五步驟、開門位置、演示時電腦不出牌、跳過開局與設定記憶。');
