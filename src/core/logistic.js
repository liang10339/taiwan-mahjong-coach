(function (root) {
  'use strict';
  // 邏輯迴歸（logistic regression）的預測：機率 = 1 / (1 + e^(−Σ 權重 × 特徵))。
  // 權重由 scripts/calibrate.cjs 用電腦自戰資料訓練（scripts/logistic-fit.cjs），存在 data/calibration.js。
  // 這裡只負責「用權重算機率」，不做訓練，瀏覽器裡很輕。

  /** @param {number} z */
  function sigmoid(z) {
    return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
  }

  /**
   * 用模型算機率。model.names 與特徵的順序必須一致（訓練與預測共用同一個特徵函式）。
   * @param {{names: string[], w: number[]}} model @param {number[]} x
   */
  function predict(model, x) {
    let z = 0;
    for (let i = 0; i < model.w.length; i++) z += model.w[i] * x[i];
    return sigmoid(z);
  }

  /** 某個特徵的權重（找不到回傳 0），給「理由要不要講」判斷用 */
  function weight(model, name) {
    const i = model ? model.names.indexOf(name) : -1;
    return i >= 0 ? model.w[i] : 0;
  }

  const api = { sigmoid, predict, weight };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Logistic = api;
})(globalThis);
