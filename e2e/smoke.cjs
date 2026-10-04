// 真瀏覽器的冒煙測試：用 Chromium 開實際頁面，打幾手牌、重新整理後接續、切換分頁。
// 假 DOM 的單元測試看不到的問題（載入順序、全域名稱、CSS、Service Worker）在這裡抓。
// 用法：npm run e2e（需要 Chromium：本機設 CHROMIUM_PATH，或 npx playwright-core install chromium）
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = 'http://127.0.0.1:' + PORT + '/';

/** 找 Chromium：CHROMIUM_PATH、Playwright 的瀏覽器資料夾（PLAYWRIGHT_BROWSERS_PATH 或預設位置） */
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const dirs = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    path.join(process.env.HOME || '', '.cache/ms-playwright'),
  ];
  for (const dir of dirs.filter(Boolean)) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs
      .readdirSync(dir)
      .filter((n) => /^chromium-\d+$/.test(n))
      .sort()
      .reverse()) {
      const exe = path.join(dir, name, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined; // 交給 Playwright 自己找
}

async function run() {
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.cjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  const errors = [];
  try {
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(BASE)).ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    // 載入外部資源（字型等）失敗是環境的網路問題；本機檔案載入失敗才算錯
    page.on(
      'console',
      (m) =>
        m.type() === 'error' &&
        !/Failed to load resource/.test(m.text()) &&
        errors.push('console: ' + m.text()),
    );
    page.on(
      'response',
      (r) =>
        r.url().startsWith(BASE) && r.status() >= 400 && errors.push('http ' + r.status() + ' ' + r.url()),
    );

    // 1. 載入：版本、開始畫面
    await page.goto(BASE);
    const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version.replace(
      /\.0$/,
      '',
    );
    assert.equal(await page.locator('.version').innerText(), '教練練習 v' + version);
    await page.locator('#openingActions button', { hasText: /^開始$/ }).click();

    // 2. 打幾手：摸牌、打最右邊那張、略過吃碰、等電腦
    let discards = 0;
    for (let step = 0; step < 400 && discards < 5; step++) {
      await page.waitForTimeout(250);
      if (await page.locator('#winButton').isEnabled()) break;
      const pass = page.locator('#claimActions button', { hasText: '略過' });
      if (await pass.count()) {
        await pass.first().click();
      } else if (await page.locator('#drawButton').isEnabled()) {
        await page.locator('#drawButton').click();
      } else {
        // 輪到自己出牌時，手牌按鈕才可點
        const last = page.locator('#hand button.tile').last();
        if ((await last.count()) && (await last.isEnabled())) {
          await last.click();
          if (await page.locator('#discardButton').isEnabled()) {
            await page.locator('#discardButton').click();
            discards++;
          }
        }
      }
    }
    assert.ok(discards >= 3, '應該能連續打幾手牌，實際只打了 ' + discards);
    assert.ok((await page.locator('#discardRiver .pile-tile').count()) > 0, '牌河應該有牌');
    assert.ok((await page.locator('#coachBody').innerText()).trim().length > 0, '教練欄應該有內容');

    // 3. 重新整理後能接續上一局
    await page.waitForTimeout(500);
    await page.reload();
    await page.getByRole('button', { name: /接續上一局/ }).click();
    assert.ok((await page.locator('#hand button.tile').count()) > 0, '接續後應該看得到手牌');

    // 4. 切換到學堂與覆盤
    await page.locator('.mode-tab[data-mode="lesson"]').click();
    assert.ok(await page.locator('#lessonView').isVisible(), '新手學堂應該顯示');
    await page.locator('.mode-tab[data-mode="review"]').click();
    assert.ok(await page.locator('#reviewView').isVisible(), '牌局覆盤應該顯示');
    assert.ok((await page.locator('#growthPanel').innerText()).length > 0, '成長報告應該有內容');
    assert.ok((await page.locator('#manualPanel').innerText()).length > 0, '實戰記錄應該有內容');

    // 5. Service Worker 註冊成功
    const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
    assert.ok(sw, 'Service Worker 應該已註冊');

    assert.deepEqual(errors, [], '頁面不應該有錯誤：\n' + errors.join('\n'));
    console.log('PASS: 真瀏覽器冒煙測試（打了 ' + discards + ' 手、接續、切換分頁、離線快取）。');
  } finally {
    await browser.close();
    server.kill();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
