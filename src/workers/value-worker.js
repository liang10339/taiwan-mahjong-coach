// 背景執行緒：跑期望值模擬（src/core/value.js），模擬時畫面不會卡住。
// 核心檔案和主畫面相同；帶上同樣的 ?v= 版本參數，讓離線快取拿到同一版。
const version = self.location.search;
importScripts('../core/engine.js' + version, '../core/scoring.js' + version, '../core/value.js' + version);

self.onmessage = (event) => {
  const { job, game, player, options } = event.data;
  try {
    self.postMessage({ job, report: Value.evaluate(game, player, options) });
  } catch (error) {
    self.postMessage({ job, error: String(error) });
  }
};
