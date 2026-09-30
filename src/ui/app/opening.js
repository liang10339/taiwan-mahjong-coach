'use strict';
// 開局：開頁時的開始畫面，以及「完整開局」模式的 抓位 → 擲骰 → 開門 → 配牌 → 補花。
// 「直接開始」模式略過這些步驟。這裡只負責演示；骰子點數、開門位置與配到的牌都由
// src/core/engine.js 決定，畫面顯示的就是這一局真實的結果。

/** 開局畫面顯示中（此時鍵盤快捷鍵不作用、電腦不出牌） */
let openingActive = false;
/** 開局動畫排的計時器，跳過或關閉時一次清掉 */
let openingTimers = [];
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function openingLater(fn, ms) {
  openingTimers.push(setTimeout(fn, ms));
}

/** 顯示開局視窗並換上新的標題、說明；回傳可放內容的區塊 */
function openingShow(title, text) {
  openingTimers.forEach(clearTimeout);
  openingTimers = [];
  openingActive = true;
  $('#opening').classList.remove('hidden');
  $('#openingTitle').textContent = title;
  $('#openingText').textContent = text;
  const stage = $('#openingStage'),
    actions = $('#openingActions');
  stage.replaceChildren();
  actions.replaceChildren();
  return { stage, actions };
}

function openingClose() {
  openingTimers.forEach(clearTimeout);
  openingTimers = [];
  openingActive = false;
  $('#opening').classList.add('hidden');
}

function openingButton(label, onClick, primary = true) {
  const b = el('button', primary ? 'primary-button' : 'secondary-button', label);
  b.type = 'button';
  b.onclick = onClick;
  return b;
}

/** 座位的顯示名稱，例如「南家（你）」 */
function seatLabel(p) {
  return WINDS[E.seatWind(game, p)] + '家' + (p === 0 ? '（你）' : '');
}

// ---- 開始畫面 ----

/** 開頁時顯示：選開局方式，再開始（這一下點擊也讓瀏覽器允許播放音效與報牌） */
function showStart() {
  const { stage, actions } = openingShow(
    '牌桌教練',
    '選好開局方式就開始。按下開始的同時會開啟音效與報牌（瀏覽器規定要先點一下網頁才能出聲）。',
  );
  const group = el('div', 'opening-modes');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', '開局方式');
  for (const [value, name, note] of [
    ['quick', '直接開始', '洗好牌、配好牌，馬上開打'],
    ['full', '完整開局', '抓位 → 擲骰 → 開門 → 配牌 → 補花，一步一步看'],
  ]) {
    const label = el('label', 'opening-mode' + (settings.opening === value ? ' on' : ''));
    const input = el('input');
    input.type = 'radio';
    input.name = 'opening-mode';
    input.value = value;
    input.checked = settings.opening === value;
    input.onchange = () => {
      settings.opening = value;
      saveSettings();
      syncOpeningSelect();
      showStart();
    };
    label.append(input, el('b', null, name), el('small', null, note));
    group.append(label);
  }
  stage.append(group);
  // 上次打到一半（重新整理或更新網頁）：可以用牌譜接著打
  const unfinished = typeof resumable === 'function' ? resumable() : null;
  if (unfinished) actions.append(openingButton('接續上一局（打到一半）', () => resumeGame(unfinished)));
  const continuing = session.hand > 1 || session.scores.some(Boolean);
  if (continuing) {
    actions.append(
      openingButton('繼續這一將（' + roundName() + '）', startCurrentHand),
      openingButton('開新的一將', () => newMatch(), false),
    );
  } else {
    // 第一次玩：直接開始時由你當東家莊家；完整開局則從抓位開始
    actions.append(
      openingButton('開始', () => (settings.opening === 'full' ? newMatch() : startCurrentHand())),
    );
  }
}

/** 開始目前已洗好的這一局（完整開局模式會先演示擲骰、開門、配牌、補花） */
function startCurrentHand() {
  if (typeof Sound !== 'undefined' && Sound.unlock) Sound.unlock();
  // 從分享連結打開：改發分享的那副牌（newHand 會自己處理開局演示）
  if (pendingDeal) {
    newHand();
    return;
  }
  if (settings.opening === 'full') runCeremony(beginPlay);
  else beginPlay();
}

function beginPlay() {
  openingClose();
  render();
  computers();
}

// ---- 完整開局：抓位 ----

/** 四張風牌蓋著洗好，你抽一張決定座位；抽到東的人當莊。選好後呼叫 done(抽到的風) */
function runSeatDraw(done) {
  const { stage, actions } = openingShow(
    '抓位',
    '四張風牌（東南西北）蓋著洗好。點一張，抽到哪個風就坐哪個位子；抽到「東」的人當莊。',
  );
  const winds = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  const row = el('div', 'opening-row');
  winds.forEach((w, i) => {
    const b = el('button', 'opening-pick');
    b.type = 'button';
    b.setAttribute('aria-label', '第 ' + (i + 1) + ' 張蓋著的風牌');
    b.append(Tiles.back('lg'));
    b.onclick = () => {
      if (typeof Sound !== 'undefined') Sound.play('select');
      row.replaceChildren(
        ...winds.map((x, j) => {
          const cell = el('span', 'opening-reveal' + (j === i ? ' mine' : ''));
          cell.append(Tiles.node(27 + x, 'lg'), el('small', null, j === i ? '你' : ''));
          return cell;
        }),
      );
      $('#openingText').textContent =
        '你抽到「' +
        WINDS[w] +
        '」，坐' +
        WINDS[w] +
        '位。' +
        (w === 0 ? '抽到東，由你當莊。' : '抽到東的是你的' + REL[(4 - w) % 4] + '，由他當莊。');
      actions.replaceChildren(openingButton('下一步：擲骰', () => done(w)));
    };
    row.append(b);
  });
  stage.append(row);
  actions.append(openingButton('跳過開局', () => done(winds[0]), false));
}

// ---- 完整開局：擲骰 → 開門 → 配牌 → 補花 ----

function runCeremony(done) {
  const skip = openingButton('跳過開局', done, false);
  stepDice();

  function stepDice() {
    const dealerName = game.dealer === 0 ? '你是莊家' : seatLabel(game.dealer) + '是莊家';
    const { stage, actions } = openingShow(
      '擲骰',
      dealerName + '，由莊家擲三顆骰子，決定從哪一家的牌牆開門。',
    );
    const dice = el('div', 'opening-dice');
    const faces = game.dice.map(() => el('span', 'die', DICE_FACES[0]));
    dice.append(...faces);
    stage.append(dice);
    const roll = () => {
      actions.replaceChildren(skip);
      if (typeof Sound !== 'undefined') Sound.play('dice');
      for (let i = 0; i < 8; i++)
        openingLater(
          () => faces.forEach((f) => (f.textContent = DICE_FACES[(Math.random() * 6) | 0])),
          i * 70,
        );
      openingLater(showCount, 600);
    };
    const showCount = () => {
      game.dice.forEach((n, i) => (faces[i].textContent = DICE_FACES[n - 1]));
      const sum = game.dice[0] + game.dice[1] + game.dice[2];
      // 從莊家算 1，逆時針（莊家 → 下家 → 對家 → 上家）數到點數
      const order = [0, 1, 2, 3].map((k) => (game.dealer + k) % 4);
      const ring = el('div', 'opening-ring');
      order.forEach((p, k) => {
        const numbers = [];
        for (let n = k + 1; n <= 18; n += 4) numbers.push(n);
        const cell = el('span', 'ring-seat' + (p === game.wallOwner ? ' target' : ''));
        cell.append(el('b', null, seatLabel(p)), el('small', null, numbers.join('、')));
        ring.append(cell);
      });
      stage.append(ring);
      $('#openingText').textContent =
        game.dice.join(' ＋ ') +
        ' ＝ ' +
        sum +
        ' 點。從莊家算 1，逆時針往下數，數到 ' +
        sum +
        ' 的是' +
        seatLabel(game.wallOwner) +
        '：從這家的牌牆開門。';
      actions.replaceChildren(skip, openingButton('下一步：開門', stepCut));
    };
    if (game.dealer === 0) actions.append(skip, openingButton('擲骰子', roll));
    else {
      actions.append(skip);
      openingLater(roll, 700);
    }
  }

  function stepCut() {
    const sum = game.dice[0] + game.dice[1] + game.dice[2];
    const { stage, actions } = openingShow(
      '開門',
      '每家面前的牌牆有 18 墩、每墩上下兩張。站在' +
        seatLabel(game.wallOwner) +
        '的位置，從牌牆右邊數過 ' +
        sum +
        ' 墩，從下一墩開始拿牌。',
    );
    const wall = el('div', 'opening-wall');
    const stacks = [];
    // 畫面左到右是第 18 墩到第 1 墩（牌牆主人的右手邊是第 1 墩）
    for (let n = 18; n >= 1; n--) {
      const s = el('span', 'stack');
      s.append(Tiles.back('xs'), Tiles.back('xs'), el('small', null, String(n)));
      stacks[n] = s;
      wall.append(s);
    }
    stage.append(wall);
    const counted = Math.min(sum, 18);
    for (let n = 1; n <= counted; n++) openingLater(() => stacks[n].classList.add('counted'), n * 90);
    openingLater(
      () => {
        if (sum < 18) stacks[sum + 1].classList.add('cut');
        $('#openingText').textContent =
          sum >= 18
            ? '數滿 18 墩，接著從下一家牌牆的第 1 墩開始拿牌。'
            : '數過 ' + sum + ' 墩（亮起來的部分留著不動），從第 ' + (sum + 1) + ' 墩開始拿牌。';
        actions.replaceChildren(skip, openingButton('下一步：配牌', stepDeal));
      },
      counted * 90 + 250,
    );
    actions.append(skip);
  }

  function stepDeal() {
    const { stage, actions } = openingShow(
      '配牌',
      '從莊家開始逆時針輪流，每次拿兩墩（4 張），拿四輪，每人 16 張。',
    );
    const table = el('div', 'opening-deal');
    const boxes = [],
      counts = [0, 0, 0, 0];
    // 依畫面方位排：對家在上、上家在左、下家在右、你在下
    for (const [p, pos] of [
      [2, 'top'],
      [3, 'left'],
      [1, 'right'],
      [0, 'bottom'],
    ]) {
      const box = el('div', 'deal-seat ' + pos + (p === game.dealer ? ' dealer' : ''));
      const tiles = el('span', 'deal-tiles'),
        count = el('small', null, '0 張');
      box.append(el('b', null, seatLabel(p) + (p === game.dealer ? '・莊' : '')), tiles, count);
      boxes[p] = { box, tiles, count };
      table.append(box);
    }
    stage.append(table);
    // 照引擎實際的配牌事件播放（你的牌翻開、別家只看得到牌背）；舊程序的牌局沒有事件，就照規則示意
    const view = Observation.forPlayer(game, 0);
    const deals = view.opening.length
      ? view.opening.filter((e) => e.type === 'deal')
      : Array.from({ length: 16 }, (_, i) => ({
          player: (game.dealer + (i % 4)) % 4,
          round: Math.floor(i / 4),
          tiles: [null, null, null, null],
        }));
    let step = 0;
    for (const e of deals) {
      const p = e.player;
      openingLater(() => {
        boxes.forEach((b) => b.box.classList.remove('taking'));
        boxes[p].box.classList.add('taking');
        counts[p] += e.tiles.length;
        if (e.tiles.every((t) => t !== null))
          e.tiles.forEach((t) => boxes[p].tiles.append(Tiles.node(t, 'xxs')));
        else boxes[p].tiles.append(Tiles.back('xxs'), Tiles.back('xxs')); // 每次拿兩墩
        boxes[p].count.textContent = counts[p] + ' 張';
        if (typeof Sound !== 'undefined') Sound.play('draw');
        $('#openingText').textContent = '第 ' + (e.round + 1) + ' 輪：' + seatLabel(p) + '拿兩墩（4 張）。';
      }, ++step * 220);
    }
    openingLater(
      () => {
        boxes.forEach((b) => b.box.classList.remove('taking'));
        $('#openingText').textContent =
          '四家各 16 張。' +
          (game.dealer === 0 ? '你是莊家，' : '莊家是' + seatLabel(game.dealer) + '，') +
          '第一手先摸一張門牌，再打出第一張牌。';
        actions.replaceChildren(skip, openingButton('下一步：補花', stepFlowers));
      },
      ++step * 220 + 200,
    );
    actions.append(skip);
  }

  function stepFlowers() {
    // 依引擎的補花事件：從莊家起依序，攤出花、從牌尾補；補到花再補（同一家會出現第二行）
    const view = Observation.forPlayer(game, 0);
    const events = view.opening.length
      ? view.opening.filter((e) => e.type === 'flowers')
      : [0, 1, 2, 3]
          .map((k) => (game.dealer + k) % 4)
          .filter((p) => game.flowers[p].length)
          .map((p) => ({
            player: p,
            flowers: game.flowers[p],
            replacements: game.flowers[p].map(() => null),
          }));
    const { stage, actions } = openingShow(
      '補花',
      events.length
        ? '從莊家開始依序補花：配到的花牌攤在面前，再從牌尾補同樣張數；補到花就再補，直到補到一般牌。'
        : '這一局配牌時沒有人拿到花牌，不用補花。',
    );
    const seen = new Set();
    for (const e of events) {
      const line = el('p', 'opening-flowers');
      line.append(el('b', null, seatLabel(e.player) + (seen.has(e.player) ? '（又補到花）' : '')));
      seen.add(e.player);
      e.flowers.forEach((t) => line.append(Tiles.node(t, 'sm')));
      line.append(el('small', null, '從牌尾補 ' + e.flowers.length + ' 張'));
      if (e.replacements.every((t) => t !== null)) {
        line.append(el('small', null, '：'));
        e.replacements.forEach((t) => line.append(Tiles.node(t, 'xs')));
      }
      stage.append(line);
    }
    actions.append(openingButton('開始打牌', done));
  }
}

/** ⚙ 設定裡的「開局方式」下拉選單與開始畫面同步 */
function syncOpeningSelect() {
  const select = $('#openingSelect');
  if (select) select.value = settings.opening;
}
