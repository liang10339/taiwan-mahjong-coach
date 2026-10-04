// 牌局資料模型：src/core/engine.js 產生、各模組讀取的共用結構。
// 這份型別是日後擴充（多人連線伺服器、Web Worker、牌譜分享、更換引擎）時的「合約」：
// 只要遵守這個結構，畫面、教練、計台、AI 都能沿用。

/**
 * 牌型編號：0–8 萬、9–17 筒、18–26 索、27–30 東南西北、31–33 中發白、34–41 春夏秋冬梅蘭竹菊（花）。
 */
type Tile = number;

/** 固定於開局、分析與計台共用的規則版本；桌規介面之後可擴充。 */
interface MahjongRuleProfile {
  id: string;
  version: number;
  liguLigu: boolean;
}

/** 座位：0 是你，1 下家、2 對家、3 上家（逆時針）。 */
type Seat = 0 | 1 | 2 | 3 | number;

/** 一組攤牌（吃、碰、明槓、暗槓、加槓）。from 是被吃碰的那一家；暗槓是自己。 */
interface Meld {
  type: 'chi' | 'pon' | 'kan' | 'concealed' | 'added' | string;
  tiles: Tile[];
  from: Seat;
}

/** 有人出牌後，等待其他三家決定吃碰槓胡或略過的狀態。kind 為 'robkan' 時是加槓等待搶槓胡。 */
interface Pending {
  from: Seat;
  tile: Tile;
  kind?: 'robkan';
  kan?: any;
  decisions: Record<number, { type: string; tiles?: Tile[] }>;
}

/**
 * 牌局紀錄的一筆動作。覆盤、音效、計台與讀牌都從這裡推導，所以新增動作時只要加新的 action。
 * draw 摸牌、discard 出牌（cut：tsumo 摸切／hand 手切／empty 空切）、chi/pon/kan 吃碰明槓、
 * concealed/added 暗槓加槓、added-attempt 加槓等待搶槓、response 某家的回應、resolution 回應結果、
 * ron 放槍胡（from 放槍者，robKan 搶槓）、tsumo 自摸（afterKan 槓上開花）、flowers 八仙過海／七搶一。
 */
interface LogEvent {
  player: Seat;
  action: string;
  tile?: Tile;
  cut?: 'tsumo' | 'hand' | 'empty';
  choice?: string;
  from?: Seat;
  robKan?: boolean;
  afterKan?: boolean;
  special?: 'eightFlowers' | 'sevenRobOne';
  /** 吃、碰、明槓用了手上哪幾張（回應與攤牌事件） */
  tiles?: Tile[];
}

/** 一局麻將的完整狀態。 */
interface Game {
  rules?: MahjongRuleProfile;
  /** 初級電腦的亂數狀態（存檔接續時保留，讓同一局的電腦行為不變） */
  _ai?: number;
  /** 電腦對手公開宣告的風格（fast／safe／big，null＝一般），教練讀牌時選用對應的聽牌模型 */
  playerStyles?: (string | null)[];
  /** 宣告的對手策略假設，不代表觀測到對手能否胡牌。 */
  playerPolicies?: { alwaysWin: boolean }[];
  observationFor?: number;
  handCounts?: number[];
  /** 洗牌種子：同一個種子與同樣的動作可以重現同一局（牌譜分享、公平驗證的基礎） */
  seed: number;
  /** 配牌程序（見 engine.js 的 DEALINGS） */
  dealing?: string;
  /** 開局事件：配牌（每次兩墩）與補花，開局動畫依此播放 */
  opening?: OpeningEvent[];
  /** 牌牆：陣列尾端是下一張要摸的牌，開頭是牌尾（補花、槓後補牌從這裡拿） */
  wall: Tile[];
  hands: Tile[][];
  flowers: Tile[][];
  rivers: Tile[][];
  melds: Meld[][];
  /** 每張出牌是摸切、手切或空切，和 rivers 一一對應 */
  cuts: string[][];
  pending: Pending | null;
  /** 目前輪到誰 */
  turn: Seat;
  /** draw 等待摸牌、discard 等待出牌、claim 等待吃碰槓胡回應、ended 本局結束 */
  phase: 'draw' | 'discard' | 'claim' | 'ended' | string;
  /** 結束時的文字結果，例如「南家胡 3萬（北家放槍）」 */
  result: string;
  log: LogEvent[];
  dealer: Seat;
  /** 圈風：0 東、1 南、2 西、3 北 */
  roundWind: number;
  /** 連莊次數 */
  streak: number;
  dice: number[];
  /** 開門的牌牆屬於哪一家 */
  wallOwner: Seat;
  /** 保留牌數（保留八墩 = 16），剩這麼多張就流局 */
  reserve: number;
  /** 是否採用過水規則 */
  passWater: boolean;
  /** 各家目前是否處於過水中 */
  water: boolean[];
  /** 剛摸進還沒打出的那張（用來判斷摸切） */
  fresh: { player: Seat; tile: Tile } | null;
  lastTake?: { player: Seat; tile: Tile; afterKan: boolean } | null;
  flowerWin?: { player: Seat; special: string; from?: Seat } | null;
}

/** 開新局時可調整的桌規（日後的規則設定頁會擴充這裡）。 */
interface RuleOptions {
  rules?: Partial<MahjongRuleProfile>;
  /** 配牌程序：engine-v1（舊牌譜）或 engine-v2（實際取墩，預設） */
  dealing?: string;
  dealer?: Seat;
  roundWind?: number;
  streak?: number;
  reserve?: number;
  passWater?: boolean;
}

/** 開局事件：deal 某家拿了哪 4 張；flowers 某家攤出的花與從牌尾補進的牌。看不到的牌在觀測中以 null 表示 */
interface OpeningEvent {
  type: 'deal' | 'flowers';
  player: Seat;
  round?: number;
  tiles?: (Tile | null)[];
  flowers?: Tile[];
  replacements?: (Tile | null)[];
}
