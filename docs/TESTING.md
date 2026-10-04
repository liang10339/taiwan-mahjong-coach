# 測試說明

`npm test` 會平行執行 `tests/` 裡的全部測試；`npm test -- scoring` 只跑檔名含 scoring 的測試。
- `engine.test.cjs`：40局牌數守恆、回合限制、胡牌與教練。
- `shanten.test.cjs`：進聽數與原始實作逐手比對（6,660 手完全相同），並確認速度。
- `claims.test.cjs`：吃牌限制、回應優先權、各種槓、補牌、副露胡與20局含吃碰牌數守恆。
- `rules.test.cjs`：摸切／手切／空切、被鳴牌時同步移除、過水與解除、保留八墩流局與海底、連續摸切與同花色讀牌。
- `scoring.test.cjs`：各種台數項目、天地人胡、花牌胡、嚦咕嚦咕，以及 60 局實戰胡牌都能計台。
- `coach.test.cjs`：截圖白板並列、提問、非推薦牌差異，以及三花色九種三面聽驗算。
- `explain.test.cjs`：手牌拆解與進聽數一致、搭子等牌、並列建議順序、聽牌解說與出牌評語。
- `ai-levels.test.cjs`：三種難度完整牌局、高級電腦和教練建議相同並在威脅下改打安全牌、初級貪吃碰。
- `styles.test.cjs`：速攻／保守／大牌三種風格完整牌局、參數、風格公開且讀牌用該風格的模型、畫面的風格分配。
- `ai-fairness.test.cjs`：打亂牌牆與別家暗牌後電腦的決定不變（證明沒有偷看）。
- `quiz.test.cjs`：聽牌題、算台題、何切題、防守題、攻守題與學習進度。
- `ui.test.cjs`、`ui-v2.test.cjs`、`ui-v21.test.cjs`：實際的按鈕處理、摸打鎖定、連莊下莊結算、覆盤、提示開關、危險度。
- `opening.test.cjs`：開始畫面、直接開始、完整開局五步驟、開門位置、跳過、設定記憶、手牌下方狀態。
- `lessons.test.cjs`：抓位、擲骰、選墩、配牌、答錯與通關。
- `sound.test.cjs`：報牌、聲線設定、靜音、語音晚載入時排隊補唸、第一次點擊解鎖。
- `record.test.cjs`：60 局（含吃碰胡、略過胡牌、空切）存成牌譜後重播完全一致、回到某一步、格式與版本檢查、竄改偵測。
- `records-ui.test.cjs`：自動保存、重新整理後接續、打完放進歷史、逐步回放、匯入錯誤與成功。
- `advisor.test.cjs`：實戰局面逐一驗證吃碰前後建議一致、同一局面決定固定、要守時不建議吃碰、畫面與覆盤讀同一個決定。
- `defense2.test.cjs`：聽牌機率、放過的牌與過水、壁、字牌見張數、手切附近與一色、攻守期望值的進攻／做牌／先守、校準資料合理。
- `situation.test.cjs`：放過的牌、先守與安全牌、聽牌進攻、尾盤轉守、一色方向、死搭子與字牌對子、下家做一色與吃牌、畫面上的場況判斷與不重複。
- `notebook.test.cjs`：錯題建立與去重、並列最佳都算對、間隔重複排程、上限、畫面作答流程、放槍存成防守題。
- `growth.test.cjs`：各階段一致率、最近與之前比較、舊版紀錄相容、建議、趨勢圖與局後紀錄欄位。
- `fairness.test.cjs`：指紋重現、整局打完的牌牆驗證、竄改偵測、分享連結編解碼、再打一次與從連結開局。
- `assets.test.cjs`：index.html、離線快取清單、版本號與圖示一致。
- `multiron.test.cjs`：一炮多響的開關、三家同胡、部分略過、搶槓、結算守恆、牌譜寫出與重播、400 局電腦自戰。
- `multiron-ui.test.cjs`：多位贏家的台數卡與結算、連莊與下莊、牌河只拿走一次、預設只有一家。
- `oracle.test.cjs`：離線標準答案——猜牌牌數守恆、不偷看別家手牌與牌牆（洗亂後猜出來的牌相同）、對手暗槓會拒絕、評估可重現、局面可用種子重現。
- `load-order.test.cjs`：核心檔案 `require` 的依賴都排在 index.html 前面；sw.js 的 FILES 與 index.html 產生的一致。
- `tiles.test.cjs`：八條的排列與每張牌面都畫得出來。
- `eval-gate.test.cjs`：CI 守門——固定 24 副牌、四座位輪換的公平對照，教練放槍不多於只看效率、得失沒有大幅退步。
- `handvalue.test.cjs`：聽牌時逐張計台、還沒聽牌看門清字牌一色、收入計算、教練的候選牌都有台數估計。
- `policy.test.cjs`：之後幾巡的放槍代價（攻的路線每巡冒險、守的路線看安全牌存量）讓該守時守。
- `dealing.test.cjs`：實際取墩（每次兩墩、四輪、配完依序補花）、舊程序與 v2.7 完全相同、新舊牌譜各自重播、開局事件只看得到自己的牌。
- `seatrecord.test.cjs`：電腦牌局轉成實戰記錄，重建的局面與每一手教練建議都和真實牌局相同；不合理事件會指出位置。
- `manual-ui.test.cjs`：實戰記錄的輸入、拒絕不合理的一步、撤銷、草稿保存與覆盤。
- `skills.test.cjs`：孤張判斷、技能標籤、熟練度排序、成長報告的技能區與只練最弱技能。
- `shanten.test.cjs` 之外，進聽數改寫另以 30 萬手隨機牌和舊實作逐手比對（結果完全相同）。


## 真瀏覽器測試（`npm run e2e`）

`e2e/smoke.cjs`：用 playwright-core 啟動 Chromium，載入實際頁面、打 5 手牌、重新整理後接續、切到學堂與覆盤、確認 Service Worker 註冊，並要求沒有頁面錯誤或本機檔案載入失敗。假 DOM 的單元測試看不到載入順序、全域名稱、CSS 與 Service Worker 的問題，大幅重構（例如改成 ES modules）前後都應該跑這個。不放進 `npm test`，因為需要瀏覽器、約 25 秒。Chromium 位置：環境變數 `CHROMIUM_PATH`，或 `PLAYWRIGHT_BROWSERS_PATH`／`/opt/pw-browsers`／`~/.cache/ms-playwright` 底下的 `chromium-*`；沒有的話執行 `npx playwright-core install chromium`。
