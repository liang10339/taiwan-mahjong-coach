# 牌譜格式

牌譜是一個 JSON 檔（副檔名 `.mahjong.json`），由 `src/core/record.js` 產生、檢查與重播。

## 目前的格式：本程式自己的牌局（`perspective: "full"`）

引擎是決定性的：同一個洗牌種子、同一套桌規、同樣的動作順序，一定得到同一局。所以牌譜只存「種子＋桌規＋每位玩家的動作」，其他事件（誰取得吃碰、補花、補槓、結算）重播時由引擎推導。

```json
{
  "format": "taiwan-mahjong-coach.record",
  "version": 1,
  "perspective": "full",
  "dealing": "engine-v2",
  "seed": 123456789,
  "options": { "dealer": 0, "roundWind": 0, "streak": 0, "reserve": 16, "passWater": true,
               "rules": { "id": "taiwan-16-coach", "version": 1, "liguLigu": true } },
  "commands": [
    { "p": 0, "a": "draw" },
    { "p": 0, "a": "discard", "tile": 5, "cut": "tsumo" },
    { "p": 1, "a": "respond", "choice": "chi", "tile": 5, "tiles": [3, 4] },
    { "p": 2, "a": "respond", "choice": "pass", "tile": 5 },
    { "p": 1, "a": "selfKan", "type": "concealed", "tile": 30 },
    { "p": 3, "a": "win" }
  ],
  "result": "北家自摸，五組加一對成立",
  "coach": 1,
  "source": "app",
  "note": "",
  "createdAt": 1790000000000
}
```

| 欄位 | 說明 |
|---|---|
| `version` | 牌譜格式版本。格式改變時加一，舊版本仍要能讀或明確拒絕 |
| `dealing` | 配牌程序。`engine-v2`（v2.8 起）＝實際取墩：從莊家起每人每次拿兩墩（4 張）、拿四輪，配完再從莊家起依序補花。`engine-v1`（v2.7 以前）＝每家輪流取一張、共十六輪、取到花立即補。同一個種子兩種程序配出不同的牌，所以舊牌譜照 `engine-v1` 重播，不會變成另一局。分享連結裡實際取墩的牌局多一段 `!2`，沒有這段的舊連結照 `engine-v1` |
| `options.rules` | 規則集（是否允許嚦咕嚦咕）。開啟一炮多響時多一個 `"multiRon": true`；預設（關閉）不寫出，所以舊牌譜與沒開這個選項的牌譜內容相同 |
| `commands` | 玩家依序做的動作：`draw` 摸牌、`discard` 打牌（`cut`：`tsumo` 摸切／`empty` 空切／`hand` 手切）、`respond` 回應別人打的牌（`pass`／`chi`／`pon`／`kan`／`ron`，吃碰槓附 `tiles` 用了手上哪幾張）、`selfKan` 暗槓或加槓、`win` 自摸 |
| `coach` | 產生牌譜時的教練版本（`Advisor.VERSION`），覆盤時知道當時用哪一版判斷 |

牌的編號：0–8 萬子、9–17 筒子、18–26 條子、27–30 東南西北、31–33 中發白、34–41 花牌。

匯入時會完整重播一次；動作無法套用（檔案被改過）、版本或發牌程序不支援，都會明確拒絕，不會默默變成別的牌局。

## 實戰記錄（`perspective: "seat"`）

你在別的地方（實體牌桌或其他平台）打牌、在「牌局覆盤 → 實戰記錄」自己輸入時，沒有洗牌種子，也看不到別家的暗牌。這種記錄只存「你這個座位看得到的事件」，由 `src/core/seatrecord.js` 檢查與重建：

```json
{
  "format": "taiwan-mahjong-coach.record",
  "version": 1,
  "perspective": "seat",
  "seat": 0,
  "options": { "dealer": 2, "roundWind": 0, "streak": 0, "reserve": 16, "passWater": false,
               "rules": { "id": "taiwan-16-coach", "version": 1, "liguLigu": true } },
  "start": { "hand": [0, 1, 2, "…共 16 張，補完花之後"], "flowers": [34], "otherFlowers": { "2": [38] } },
  "events": [
    { "p": 2, "a": "draw" },
    { "p": 2, "a": "discard", "tile": 30 },
    { "p": 3, "a": "draw" },
    { "p": 3, "a": "flower", "tile": 36 },
    { "p": 3, "a": "draw" },
    { "p": 3, "a": "discard", "tile": 7 },
    { "p": 0, "a": "chi", "tiles": [5, 6] },
    { "p": 0, "a": "discard", "tile": 27, "cut": "hand" },
    { "p": 1, "a": "pon", "tiles": [27, 27] },
    { "p": 1, "a": "discard", "tile": 12 },
    { "p": 2, "a": "ron" }
  ],
  "result": "對家胡 4筒（下家放槍）",
  "source": "manual"
}
```

| 事件 `a` | 意思 | 欄位 |
|---|---|---|
| `draw` | 摸一張（含槓後補牌、補花後補牌） | 你自己的要記 `tile`；別家不記 |
| `discard` | 打出一張 | `tile`，你自己的可記 `cut` |
| `chi` / `pon` / `kan` | 吃、碰、明槓上一張打出的牌 | `tiles`：用了手上哪幾張（只能吃上家） |
| `concealed` / `added` | 暗槓、加槓（之後接一個 `draw`） | 你自己的暗槓與所有加槓記 `tile` |
| `flower` | 摸到花、攤出來（之後接一個 `draw` 補牌） | `tile` |
| `ron` / `tsumo` | 胡上一張打出的牌、自摸 | — |

- 座位是相對的：`seat` 是你，`(seat + 1) % 4` 是下家，以此類推；畫面上你固定是 0。
- 開局配到的花不記事件：你的在 `start.flowers`，別家的在 `start.otherFlowers`（只影響牌牆剩餘張數的推算）。
- 重建時把事件組成和引擎相同形狀的牌局，看不到的牌是 `null`，再交給 `src/core/observation.js` 投影成你的視角；教練、防守、覆盤評分直接沿用。牌牆剩餘張數由看得到的牌推算（144 張扣掉手牌張數、攤牌、牌河、花）。
- 測試（`tests/seatrecord.test.cjs`）把電腦打的牌局轉成實戰記錄，確認重建的局面與每一手教練建議都和真正的牌局相同。
- 不合理的事件（手上沒有那張、某種牌超過 4 張、吃的不是上家）會指出是第幾個事件。
