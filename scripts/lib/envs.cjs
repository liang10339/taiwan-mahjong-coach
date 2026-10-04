// 評估用的桌規與對手池。教練的好壞要放在「真正會遇到的桌子」上量：桌規不同（底台、一炮多響、連莊），
// 對手不同（會防守的、只看牌效率的、亂吃碰的朋友），正確的打法與數字都會跟著變。
'use strict';

/**
 * 桌規。stake：底／每台（和 App 的 ⚙ 底／台選項一致）；streaks：每副牌的連莊數輪流取用，
 * 讓評估涵蓋「連莊中」的局面（莊家的台數與賠付都比較多）。
 */
const ENVS = {
  default: {
    label: '預設桌規（頭跳、50 底 20 台、不連莊；App 的預設是 100 底 20 台）',
    rules: {},
    stake: { base: 50, perTai: 20 },
    streaks: [0],
  },
  friends: {
    label: '朋友桌規（一炮多響、100 底 20 台、有連莊、有花）',
    rules: { multiRon: true },
    stake: { base: 100, perTai: 20 },
    streaks: [0, 0, 1, 2],
  },
};

/**
 * 對手池：被評估者以外的三家（依下家、對家、上家）。
 * bots 是原本的預設，也是校準用的那一批電腦（兩邊同源，會比較樂觀）；
 * 其他是校準時沒見過的對手，用來檢查教練的優勢是不是只對「自己人」有效。
 */
const POOLS = {
  bots: ['normal', 'hard', 'normal'],
  casual: ['noisy', 'caller', 'easy'],
  mixed: ['noisy', 'normal', 'caller'],
  strong: ['hard', 'hard', 'hard'],
  styles: ['fast', 'safe', 'big'],
};

/** 每副牌的連莊數（由牌的種子決定，結果可重現） */
const streakOf = (env, seed) => env.streaks[seed % env.streaks.length];

module.exports = { ENVS, POOLS, streakOf };
