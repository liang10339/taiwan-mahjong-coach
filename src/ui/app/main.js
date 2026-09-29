'use strict';
// 啟動：所有檔案載入後才執行，順序見 index.html
setupVoice();
setupSettings();
updateSeats();
syncToggles();
render();
setupCoachSize();
watchRiverSize();
// 先顯示開始畫面：選開局方式，按下開始才開打（這一下點擊也解鎖音效與報牌）
showStart();
publishDealPrint(game);
updateNotebookBadge();
if (typeof setupLessons === 'function')
  setupLessons($, (name) => {
    if (typeof Stages !== 'undefined') Stages.complete(0);
    mode(name);
  });
if (typeof Stages !== 'undefined') Stages.setup($, mode);
if ('serviceWorker' in navigator) {
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller; // 第一次安裝時不重新整理，避免打到一半的牌局被重置
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((r) => r.update())
    .catch(() => {});
}
