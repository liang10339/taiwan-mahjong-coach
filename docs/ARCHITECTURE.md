# 程式架構與擴充指南

這份文件說明牌桌教練的程式怎麼分層、資料怎麼流動，以及日後要擴充（規則變體、多人連線、更強的 AI、改寫成 TypeScript 等）時該從哪裡下手。

## 設計原則

1. **不需要建置工具**：瀏覽器直接載入 `index.html` 列出的 `<script>`，開檔就能跑、改完重新整理就生效。
2. **規則與畫面分開**：`src/core/` 不碰 DOM，只用資料進、資料出，所以能在 Node（測試）、Web Worker、將來的伺服器上執行。
3. **牌局可以重現**：同一個洗牌種子（`game.seed`）加上同樣的動作，一定得到同一局。牌譜分享、公平驗證、逐手回放都建立在這一點上。
4. **一切從牌局紀錄推導**：出牌、吃碰槓、胡牌都寫進 `game.log`，覆盤、音效、計台、讀牌筆記都從紀錄算出來，不另外記一份。
5. **註解與介面文字用台灣中文**：這是給台灣玩家的產品，程式註解也寫給會打台麻的人看。

## 目錄

```
index.html              頁面骨架；<script> 的順序就是載入順序（測試也照這個順序載入）
sw.js                   離線快取（Service Worker）；VERSION 是整個網站的快取版本
manifest.webmanifest    PWA 設定（名稱、圖示）
src/
  core/                 純邏輯，不碰畫面
    engine.js           牌局引擎：洗牌、摸打、吃碰槓胡、補花、過水、保留八墩、進聽數
    scoring.js          台數（北部台算法）與結算
    coach.js            教練：牌效率比較、拆牌解說、吃碰槓比較（吃碰後打哪張由 advisor 決定）
    defense.js          舊的防守組合排除（高級電腦仍在用）
    ai.js               電腦對手（初級、中級、高級）與讀牌
    data/calibration.js 自戰統計表（npm run calibrate 產生，請勿手改）
    logistic.js         邏輯迴歸的預測（權重由 npm run calibrate 訓練）
    record.js           牌譜：種子＋桌規＋動作；有格式版本；重播、回到某一步、匯入驗證（docs/RECORD_FORMAT.md）
    opponents.js        對手模型：三家聽牌機率（邏輯迴歸）、胡牌台數、放過的牌、最近手切
    safety.js           防守 2.0：每張牌的放槍機率與理由（放過的牌、過水、壁、字牌見張數、手切附近、一色）
    policy.js           攻守期望值：胡牌機率 × 收入 − 放槍機率 × 對方台數，決定打哪張與局勢
    situation.js        場況判斷的文字：局勢、對手訊號、牌牆、死搭子、台數方向（只負責說明）
    advisor.js          決策核心：所有「打哪張、要不要吃碰」的唯一來源
    quiz.js             新手學堂的階段與題庫
    value.js            期望值模擬：每張候選牌的胡牌率、平均台數、期望台數（蒙地卡羅）
    notebook.js         錯題本：失誤題目與間隔重複排程
    growth.js           成長報告：一致率、失誤率、胡牌放槍率與進退步比較
    fairness.js         公平性：牌牆指紋、用種子重洗驗證、分享字串編解碼
  workers/
    value-worker.js     在背景執行緒跑 value.js，畫面不卡
  ui/                   畫面
    tiles.js            牌面 SVG（實體台麻外觀）
    sound.js            音效（Web Audio 合成）與中文報牌
    lessons.js          新手學堂第 0 階段的互動開局教學
    stages.js           新手學堂階段選單與練習題畫面
    app/                實戰畫面，依功能分檔（共用同一個全域範圍）
      dom.js            $、$$、el 等 DOM 小工具
      state.js          設定、一將（session）、目前這一局（game）與計算快取
      table.js          牌桌：手牌、牌河、四家牌架、出牌動畫、吃碰槓按鈕
      coach-panel.js    教練欄：逐手解說、吃碰槓比較、攻守、讀牌、台數卡
      situation-panel.js 教練欄最上方的場況判斷（快取、同樣的話幾手內不重複）
      value-panel.js    教練欄的期望值區塊（送工作給 Worker、顯示結果）
      review.js         牌局覆盤：決策紀錄、逐手回放、歷史牌局
      notebook-panel.js 錯題本畫面與本機存取（覆盤分頁）
      growth-panel.js   成長報告畫面與趨勢圖（覆盤分頁）
      fairness-panel.js 開局公布指紋、局後攤牌驗證、同一副牌分享與重打
      records-panel.js  自動保存與接續、歷史牌譜、逐步回放、匯出匯入
      flow.js           流程：電腦輪流、摸打按鈕、開新局、結算、音效事件、鍵盤
      opening.js        開始畫面與完整開局（抓位、擲骰、開門、配牌、補花）
      settings-panel.js 分頁切換、各種開關、⚙ 設定、報牌聲音設定
      main.js           啟動（最後載入）
  types/
    game.d.ts           牌局資料模型（Game、Meld、LogEvent…）——擴充時的「合約」
    globals.d.ts        讓型別檢查知道各全域名稱（Mahjong、Coach…）對應哪個檔案
styles/                 樣式表
tests/                  測試（*.test.cjs），helpers.cjs 提供假 DOM 與載入工具
scripts/                npm 指令用的小工具（平行測試、改版、本機伺服器、校準）
docs/                   文件（CALIBRATION.md 校準報告、RECORD_FORMAT.md 牌譜格式）
```

## 資料流

```
使用者點擊 ──► flow.js 的按鈕處理 ──► src/core/engine.js 改變 game
                                          │
電腦回合（計時器）──► ai.js 決定動作 ──────┘
                                          ▼
                              game.log 多了一筆紀錄
                                          ▼
                    table.js 的 render()：依 game 重畫整個畫面
                     ├─ 手牌、牌河（只補新打出的牌）、牌架、攤牌
                     ├─ coach-panel.js：教練解說（結果依牌局狀態快取）
                     ├─ review.js：覆盤（只在覆盤頁看得到時重畫）
                     └─ flow.js 的 soundEvents()：依新增的紀錄播放音效與報牌
```

重點：畫面永遠是「目前 game 的樣子」，不在畫面上另外保存狀態。

## 教練的決策流程（決策核心）

```
Advisor.decide(game, 你)
  ├─ engine.analyze          候選牌的進聽數與有效牌
  ├─ coach.leadOrder         效率並列時依口訣取捨 → 效率首選
  ├─ opponents.read          三家聽牌機率、胡了幾台、放過的牌、最近手切、過水
  ├─ safety.evaluate         每張牌的放槍機率與理由
  ├─ policy.choose           攻守期望值 → 最後要打的牌、局勢（做牌／進攻／攻守兼顧／先守）
  └─ situation.read          把以上寫成給人看的判斷與重點
Advisor.claims(game, 你)     每個吃／碰先做出吃碰後的局面，再問 decide()：
                             卡片上的「吃後打 X」一定等於吃完後的建議（tests/advisor.test.cjs 逐一驗證）
```

教練標題、場況判斷、放槍風險卡、覆盤評分、錯題本、問教練全部讀同一個結果（`state.js` 的 `currentDecision()`、`currentClaim()`），畫面不自己再算一次。**新增任何「建議」相關功能時，都要從決策核心拿結果，不要在畫面裡另外判斷**，否則又會出現前後矛盾。

機率來自 `npm run calibrate`：電腦自戰幾千局（知道每家真正手牌），依 `opponents.tenpaiKey`、`safety.tileFeatures`、`policy.winKey` 同一套分組統計，寫成 `src/core/data/calibration.js`，並在 `docs/CALIBRATION.md` 報告準確度（每 5 局留 1 局只做驗證）。改了分組或 AI 打法後要重新校準。要加新功能時，先想它在 `game`（或 `session`）裡怎麼表示，畫面只負責把它畫出來。

## 全域名稱與載入順序

`src/core` 與 `src/ui` 的每個檔案都用同一個寫法：在 Node 裡 `module.exports`，在瀏覽器裡掛到 `globalThis`（例如 `Mahjong`、`Coach`、`Tiles`）。`src/ui/app/*.js` 是一般的 `<script>`，彼此共用同一個全域範圍（在 `state.js` 宣告的 `game`，其他檔案可以直接用）。

因此：

- 新增檔案時，要在 `index.html` 加 `<script>`，也要加到 `sw.js` 的 `FILES`。漏了會被 `tests/assets.test.cjs` 抓到。
- 一個檔案「載入時就立刻執行」的程式，只能用到比它早載入的檔案；啟動流程統一放在最後的 `main.js`。

## 型別檢查

不改成 TypeScript，而是用 JSDoc 註解寫型別，由 `npm run typecheck`（`tsc -p jsconfig.json`）檢查：

- `src/types/game.d.ts` 定義牌局資料模型，`engine.create()` 標註回傳 `Game`。
- 新的函式建議加上 JSDoc，例如 `/** @param {Game} g @param {number} p @returns {number} */`。
- 將來若要全面改用 TypeScript：因為型別已經在 JSDoc 與 `.d.ts` 裡，可以一個檔案一個檔案把 `.js` 改成 `.ts`，再加上打包步驟（例如 esbuild）。

## 效能

- **進聽數**（`engine.shanten`）是最熱的函式：教練、電腦、危險度都大量呼叫。它逐門拆解並快取，改動時務必跑 `tests/shanten.test.cjs`（和原始實作逐手比對）。
- **重畫**：`render()` 每次動作都會執行。耗時的計算要依牌局狀態快取（參考 `state.js` 的 `decisionCache`、`claimCache`；一次決策約 8 毫秒），不要在重畫時讀取版面尺寸（`clientWidth` 等會逼瀏覽器重算整頁版面；參考 `table.js` 的 `watchRiverSize`）。
- 需要大量模擬的功能放進 Web Worker：期望值模擬（`value.js`）由 `src/workers/value-worker.js` 在背景執行，主執行緒只送牌局、收結果；不支援 Worker 時才在主執行緒用較少的模擬次數。

## 擴充指南

### 新增桌規（例如無花玩法、一炮多響、Migi）
1. 在 `src/types/game.d.ts` 的 `RuleOptions` 與 `Game` 加上欄位並寫說明。
2. `engine.create(seed, opts)` 讀取選項並存進 `game`；引擎內依 `game.xxx` 分支。
3. `scoring.js` 依同一個欄位計台。
4. `state.js` 的 `settings` 加預設值、`ruleOpts()` 傳進引擎；`index.html` 的 ⚙ 設定加選項、`settings-panel.js` 綁定。
5. 在 `tests/` 加測試：規則本身、計台，以及至少一局完整牌局的牌數守恆。

### 新增電腦難度或更強的 AI
- `src/core/ai.js` 的 `chooseDiscard`、`chooseClaim`、`chooseKan` 依 `level` 分支；新增難度時加一個 level，並在 `index.html` 的難度選單加選項。
- AI 只能讀公開資訊與自己的手牌（`E.publicTiles(g, p)`），不能偷看牌牆與別家暗牌。`tests/ai-fairness.test.cjs` 會把看不到的牌打亂、確認決定不變；新的 AI 也必須通過（教練的吃碰槓建議由 `tests/claim-coach.test.cjs` 檢查）。

### 把運算移到 Web Worker（更強 AI）
`src/core` 不碰 DOM，可以直接在 Worker 裡 `importScripts('src/core/engine.js', ...)`。`src/workers/value-worker.js` 就是範例：主執行緒把 `game` 以 JSON 傳進 Worker（`Game` 全是一般資料），附上工作編號；Worker 回傳結果，主執行緒只採用最新一筆。更強的 AI 可以照同樣方式回傳決策（例如 `{type: 'discard', index}`），再由主執行緒呼叫 `engine` 套用。

### 多人連線
- 伺服器用 Node.js 直接 `require('./src/core/engine.js')`，由伺服器保管完整的 `game`（含牌牆與四家手牌），每位玩家只收到「自己看得到的部分」——這正是 `E.publicTiles(g, viewer)` 的概念。
- 玩家送出動作（摸、打、吃碰槓胡），伺服器用引擎驗證（引擎本來就會拒絕不合法的動作）後廣播新的紀錄。
- 前端的 `render()` 已經是「依 game 重畫」，連線版只要把 `game` 換成伺服器送來的公開狀態即可。

### 牌譜分享與公平驗證
目前已完成：`fairness.js` 在開局公布整副牌的指紋，一局結束後公開種子並重洗驗證；`#deal=種子.莊.圈.連莊.留牌.過水` 連結可以打同一副牌（`fairness-panel.js` 的 `pendingDeal`）。電腦沒有用到亂數，所以同一副牌、你做同樣的動作，整局就會完全相同。
下一步若要完整回放別人的牌局：把你的動作序列（出第幾張、吃碰槓胡或略過）也編進網址，開啟時從同一副牌依序重跑；`game.log` 已經有需要的資訊。

### 更換或加速引擎（Rust／WebAssembly）
只要新的實作提供和 `src/core/engine.js` 相同的函式與 `Game` 資料結構，其他模組都不用改。可以先只把 `shanten` 換成 WebAssembly 版本，用 `tests/shanten.test.cjs` 比對結果。

## 發布流程

1. 開分支、改程式、加測試。
2. `npm run check`（格式、型別、測試）。
3. 有改到網站檔案時執行 `npm run bump`，讓已安裝的 PWA 取得新版。
4. 開 PR；GitHub Actions 自動檢查。合併到 main 後自動部署到 GitHub Pages。
