// Service worker：離線快取。先向網路要最新檔案，失敗時才用快取。
// 改版時執行 `npm run bump`，會同時更新這裡的 VERSION 與 index.html 的 ?v= 參數。
const VERSION = 28;
const CACHE = 'mahjong-coach-v' + VERSION;
const v = '?v=' + VERSION;

// index.html 載入的每個本機檔案都要列在這裡（tests/assets.test.cjs 會檢查）
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './styles/styles.css' + v,
  './styles/enhancements.css' + v,
  './styles/state.css' + v,
  './styles/tiles.css' + v,
  './styles/table.css' + v,
  './styles/opening.css' + v,
  './styles/notebook.css' + v,
  './styles/growth.css' + v,
  './styles/fairness.css' + v,
  './styles/situation.css' + v,
  './styles/records.css' + v,
  './src/core/engine.js' + v,
  './src/core/observation.js' + v,
  './src/core/coach.js' + v,
  './src/core/defense.js' + v,
  './src/core/scoring.js' + v,
  './src/core/ai.js' + v,
  './src/core/data/calibration.js' + v,
  './src/core/logistic.js' + v,
  './src/core/opponents.js' + v,
  './src/core/safety.js' + v,
  './src/core/policy.js' + v,
  './src/core/situation.js' + v,
  './src/core/advisor.js' + v,
  './src/core/quiz.js' + v,
  './src/core/value.js' + v,
  './src/core/notebook.js' + v,
  './src/core/growth.js' + v,
  './src/core/fairness.js' + v,
  './src/core/record.js' + v,
  './src/workers/value-worker.js' + v,
  './src/ui/tiles.js' + v,
  './src/ui/sound.js' + v,
  './src/ui/lessons.js' + v,
  './src/ui/stages.js' + v,
  './src/ui/app/dom.js' + v,
  './src/ui/app/state.js' + v,
  './src/ui/app/table.js' + v,
  './src/ui/app/coach-panel.js' + v,
  './src/ui/app/situation-panel.js' + v,
  './src/ui/app/value-panel.js' + v,
  './src/ui/app/review.js' + v,
  './src/ui/app/notebook-panel.js' + v,
  './src/ui/app/growth-panel.js' + v,
  './src/ui/app/fairness-panel.js' + v,
  './src/ui/app/records-panel.js' + v,
  './src/ui/app/flow.js' + v,
  './src/ui/app/opening.js' + v,
  './src/ui/app/settings-panel.js' + v,
  './src/ui/app/main.js' + v,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('mahjong-coach-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(request)) || new Response('離線時尚未快取此檔案', { status: 503 });
      }),
  );
});
