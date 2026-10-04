# 牌桌教練 v2.9
台灣 16 張的單機教練練習（PWA，可離線、可安裝到手機主畫面）。仍採下列簡化桌規，並非完整比賽規則。

## 開啟
- 需要 [Node.js](https://nodejs.org/) 20 以上。第一次先執行 `npm install`（安裝格式與型別檢查工具）。
- `npm start`，開啟 http://localhost:4176 。右上角顯示「教練練習 v2.9」。
- 沒有 Node.js 時也可以：`python -m http.server 4176 --bind 127.0.0.1`。
- 發布後的網址：main 更新時會自動部署到 GitHub Pages（見下方「開發」）。

## 開發
| 指令 | 用途 |
|---|---|
| `npm start` | 本機伺服器 http://localhost:4176 |
| `npm test` | 平行執行 `tests/` 全部測試（約 15 秒） |
| `npm run e2e` | 用真的 Chromium 開頁面打幾手牌、接續、切換分頁（需要 Chromium，見 `e2e/smoke.cjs`；CI 另有獨立工作） |
| `npm run typecheck` | TypeScript 檢查 `src/` 的 JavaScript（依 JSDoc 型別） |
| `npm run format` | 用 Prettier 統一排版 |
| `npm run check` | 格式＋型別＋測試，送 PR 前跑一次 |
| `npm run bump` | 改版時更新離線快取版本（sw.js 與 index.html 的 `?v=` 一起改） |

- 程式架構、資料流與日後擴充的方式見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 每個 PR 都會由 GitHub Actions 自動跑格式、型別與測試（`.github/workflows/ci.yml`）。
- main 更新後自動發布到 GitHub Pages（`.github/workflows/pages.yml`）。第一次使用前，到 GitHub 專案 **Settings → Pages**，把 **Source** 設為 **GitHub Actions**。

## 目前功能
- **牌桌**：144 張牌、一將多局（連莊、換莊、換圈風）、吃碰明槓暗槓加槓、搶槓、過水、保留八墩、摸切／手切／空切的動作呈現；北部台算法計台與結算（天胡、地胡、人胡、嚦咕嚦咕、八仙過海、七搶一等都有）。
- **教練**：決策核心（`src/core/advisor.js`）統一給出「打哪張、要不要吃碰」，標題、場況判斷、放槍風險、覆盤、錯題本都讀同一個結果。依牌效率、胡牌台數、三家聽牌機率與放槍機率、之後幾巡的攻守取捨決定。可選牌問教練（「打白板可以嗎」「吃好嗎」），是本機規則問答，不呼叫外部 AI 服務。
- **電腦對手**：初級、中級、高級三種難度；高級可選速攻、保守、大牌、混合風格，用和教練同一套判斷，且只讀公開資訊（`tests/ai-fairness.test.cjs` 驗證）。
- **學習**：新手學堂（認牌到攻守判斷五個階段與互動開局教學）、錯題本（間隔重複）、成長報告與技能熟練度、牌局覆盤與逐手回放。
- **牌譜與公平**：自動保存與接續、完整牌譜（匯出、匯入、回放）、牌牆指紋與局後攤牌驗證、同一副牌分享與重打、實戰記錄（把別處打的牌輸入後由教練覆盤）。
- **PWA**：可離線、可安裝到手機主畫面；音效與中文報牌。

## 桌規與限制
- 實戰預設自己坐東位起莊；完整開局模式依序演示抓位、擲骰、開門、取墩配牌、補花，用的是這一局真實的骰子與牌牆，每步可跳過。
- 多人同時能胡時，預設只由出牌者下家方向最近一家胡（頭跳）；⚙ 可開啟「一炮多響」，所有能胡的家一起胡、各自算台，放槍者付所有人的總和（搶槓也一樣）。
- 尚未實作：天聽、地聽、報聽、Migi（咪機）、無花玩法的「見風有台」、最低台門檻、特殊牌型（十三么等非台灣 16 張牌型）。
- 教練的防守機率來自本程式電腦自戰的統計，對真人牌桌只是參考，不是安全保證；對手放過的牌是依「電腦有胡必胡」推估。
- 教練是否讓人「贏更多」：對不防守、會出小錯的朋友桌類電腦，評估矩陣四格全正（每局 +0.26 至 +0.61 台）；對同樣會防守的電腦看不出差別；還沒有真人的資料（v2.9 調權重後新種子 12000 局對照 +0.077 ± 0.057 台；見 [docs/CALIBRATION.md](docs/CALIBRATION.md) 與 [CHANGELOG.md](CHANGELOG.md) 的 v2.8 結果）。

## 文件
- [CHANGELOG.md](CHANGELOG.md)：各版本更新紀錄。
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：程式架構、資料流、擴充指南。
- [docs/RECORD_FORMAT.md](docs/RECORD_FORMAT.md)：牌譜與實戰記錄格式。
- [docs/CALIBRATION.md](docs/CALIBRATION.md)：自戰校準報告。
- [docs/EVALUATION.md](docs/EVALUATION.md)：教練評估矩陣——各種桌規與對手下，教練比只看效率好多少。
- [docs/TESTING.md](docs/TESTING.md)：各測試檔驗證的內容。

## 教學參考
不同桌規對起莊、開門用詞與取牌方式可能不同，本課程不宣稱唯一標準。
- [麻將規則與開局流程說明（Klook）](https://www.klook.com/zh-TW/blog/taiwan-mahjong-rules/)
- [台大盃麻將賽規則：另一套抽位與起莊方式](https://www.ptt.cc/bbs/NTU-MJ/M.1249441186.A.55B.html)
- [三面聽牌型說明](https://chejohntravel.com/麻將三面聽牌/)

## 參考資料（v2.1 比對的教學）
- 維基教科書〈臺灣麻將〉：過水、詐胡、留八墩流局、連莊與補花規則。https://zh.wikibooks.org/zh-tw/臺灣麻將
- 巴哈姆特〈打麻將這十句技巧口訣〉：先丟孤張再丟風牌、開局避免吃兩頭、一直沒人胡就打熟牌。https://home.gamer.com.tw/artwork.php?sn=5758285
- 麻將綜合資訊攻略站〈麻將必備的72個觀念〉：留場風自風、盯下家、五搭原理、147 打小 258 打中 369 打大、後期打熟張。https://mahjongtw.com/mahjong-72-concepts/
- 萌娘百科〈摸切〉：摸切、手切、空切的定義與「連續摸切多半已聽牌」。https://zh.moegirl.org.cn/zh-hk/摸切
