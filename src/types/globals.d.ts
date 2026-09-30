// 各檔案在瀏覽器裡把 API 掛到 globalThis（例如 root.Coach = api）。
// 這裡告訴 TypeScript 每個全域名稱對應哪個檔案，型別直接從原始碼推導，不用另外維護。
declare var Mahjong: typeof import('../core/engine.js');
declare var Observation: typeof import('../core/observation.js');
declare var Coach: typeof import('../core/coach.js');
declare var Scoring: typeof import('../core/scoring.js');
declare var AI: typeof import('../core/ai.js');
declare var Logistic: typeof import('../core/logistic.js');
declare var HandValue: typeof import('../core/handvalue.js');
declare var Calibration: typeof import('../core/data/calibration.js');
declare var Opponents: typeof import('../core/opponents.js');
declare var Safety: typeof import('../core/safety.js');
declare var Policy: typeof import('../core/policy.js');
declare var Situation: typeof import('../core/situation.js');
declare var Advisor: typeof import('../core/advisor.js');
declare var Quiz: typeof import('../core/quiz.js');
declare var Notebook: typeof import('../core/notebook.js');
declare var Growth: typeof import('../core/growth.js');
declare var Record: typeof import('../core/record.js');
declare var SeatRecord: typeof import('../core/seatrecord.js');
declare var Fairness: typeof import('../core/fairness.js');
declare var Tiles: typeof import('../ui/tiles.js');
declare var Sound: typeof import('../ui/sound.js');
declare var Stages: any;
declare function setupLessons($: (selector: string) => any, mode: (name: string) => void): void;
