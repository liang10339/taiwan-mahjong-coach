// 訓練邏輯迴歸：牛頓法（每一步解 Hessian 線性方程），加一點 L2 正則化避免權重暴衝。
// 資料量是幾十萬筆 × 二十幾個特徵，牛頓法十幾步就收斂，幾秒鐘。
'use strict';

/**
 * @param {number[][]} X 每筆一列特徵（第一個通常是常數 1）
 * @param {number[]} y 0 或 1
 * @param {{l2?: number, iterations?: number}} [opts]
 * @returns {number[]} 權重
 */
function fit(X, y, { l2 = 1, iterations = 25 } = {}) {
  const n = X.length,
    d = X[0].length;
  let w = Array(d).fill(0);
  for (let it = 0; it < iterations; it++) {
    const grad = Array(d).fill(0),
      H = Array.from({ length: d }, () => Array(d).fill(0));
    for (let i = 0; i < n; i++) {
      const x = X[i];
      let z = 0;
      for (let j = 0; j < d; j++) z += w[j] * x[j];
      const p = 1 / (1 + Math.exp(-z)),
        r = p - y[i],
        s = p * (1 - p);
      for (let j = 0; j < d; j++) {
        if (!x[j]) continue;
        grad[j] += r * x[j];
        const sx = s * x[j];
        for (let k = j; k < d; k++) if (x[k]) H[j][k] += sx * x[k];
      }
    }
    for (let j = 0; j < d; j++) {
      for (let k = 0; k < j; k++) H[j][k] = H[k][j];
      // 常數項不正則化
      if (j > 0) {
        grad[j] += l2 * w[j];
        H[j][j] += l2;
      }
      H[j][j] += 1e-9;
    }
    const step = solve(H, grad);
    let change = 0;
    w = w.map((v, j) => {
      change = Math.max(change, Math.abs(step[j]));
      return v - step[j];
    });
    if (change < 1e-6) break;
  }
  return w.map((v) => Math.round(v * 10000) / 10000);
}

/** 高斯消去法解 A x = b（A 對稱正定，維度小） */
function solve(A, b) {
  const n = b.length,
    M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const pivot = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / pivot;
      if (!f) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** 平均 log-loss 與 Brier 分數（越小越準） */
function score(probs, y) {
  let ll = 0,
    br = 0;
  for (let i = 0; i < y.length; i++) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, probs[i]));
    ll -= y[i] ? Math.log(p) : Math.log(1 - p);
    br += (p - y[i]) ** 2;
  }
  return { logLoss: ll / y.length, brier: br / y.length };
}

module.exports = { fit, solve, score };
