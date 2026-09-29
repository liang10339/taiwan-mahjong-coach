// 各檔案在瀏覽器裡把 API 掛到 globalThis（例如 root.Coach = api）。
// 這裡告訴 TypeScript 每個全域名稱對應哪個檔案，型別直接從原始碼推導，不用另外維護。
declare var Mahjong: typeof import('../core/engine.js');
declare var Coach: typeof import('../core/coach.js');
declare var Defense: typeof import('../core/defense.js');
declare var Scoring: typeof import('../core/scoring.js');
declare var AI: typeof import('../core/ai.js');
declare var Quiz: typeof import('../core/quiz.js');
declare var Value: typeof import('../core/value.js');
declare var Tiles: typeof import('../ui/tiles.js');
declare var Sound: typeof import('../ui/sound.js');
declare var Stages: any;
declare function setupLessons($: (selector: string) => any, mode: (name: string) => void): void;
