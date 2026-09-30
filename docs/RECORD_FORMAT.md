# 牌譜格式

牌譜是一個 JSON 檔（副檔名 `.mahjong.json`），由 `src/core/record.js` 產生、檢查與重播。

## 目前的格式：本程式自己的牌局（`perspective: "full"`）

引擎是決定性的：同一個洗牌種子、同一套桌規、同樣的動作順序，一定得到同一局。所以牌譜只存「種子＋桌規＋每位玩家的動作」，其他事件（誰取得吃碰、補花、補槓、結算）重播時由引擎推導。

```json
{
  "format": "taiwan-mahjong-coach.record",
  "version": 1,
  "perspective": "full",
  "dealing": "engine-v1",
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
| `dealing` | 發牌程序。`engine-v1`＝每家輪流取一張、共十六輪、取到花立即補。日後改成實際取墩（每次兩墩）時用新名字，舊牌譜照舊程序重播，不會變成另一局 |
| `options.rules` | 牌型規則設定（例如是否允許嚦咕嚦咕） |
| `commands` | 玩家依序做的動作：`draw` 摸牌、`discard` 打牌（`cut`：`tsumo` 摸切／`empty` 空切／`hand` 手切）、`respond` 回應別人打的牌（`pass`／`chi`／`pon`／`kan`／`ron`，吃碰槓附 `tiles` 用了手上哪幾張）、`selfKan` 暗槓或加槓、`win` 自摸 |
| `coach` | 產生牌譜時的教練版本（`Advisor.VERSION`），覆盤時知道當時用哪一版判斷 |

牌的編號：0–8 萬子、9–17 筒子、18–26 條子、27–30 東南西北、31–33 中發白、34–41 花牌。

匯入時會完整重播一次；動作無法套用（檔案被改過）、版本或發牌程序不支援，都會明確拒絕，不會默默變成別的牌局。

## 預留：實戰記錄（`perspective: "seat"`，尚未實作）

日後你在別的地方（實體牌桌或其他平台）打牌、自己輸入時，沒有洗牌種子，也看不到別家的暗牌。這種牌譜改存「你這個座位看得到的事件」：

```json
{
  "format": "taiwan-mahjong-coach.record",
  "version": 1,
  "perspective": "seat",
  "seat": 0,
  "options": { "dealer": 2, "roundWind": 0, "streak": 0, "reserve": 16, "passWater": true, "rules": { } },
  "start": { "hand": [0, 1, 2, "…16 張"], "flowers": [34] },
  "events": [
    { "p": 0, "a": "draw", "tile": 12 },
    { "p": 0, "a": "discard", "tile": 30, "cut": "hand" },
    { "p": 1, "a": "discard", "tile": 7 },
    { "p": 2, "a": "pon", "tile": 7, "from": 1 },
    { "p": 3, "a": "draw" }
  ],
  "result": { "winner": 3, "tai": 5, "from": null },
  "source": "manual"
}
```

- 別家的摸牌不記是哪張（看不到），只記「摸了一張」；別家的打牌、吃碰槓的攤牌都是公開資訊。
- 分析時直接把這些事件組成「你這個座位的視角」（`src/core/observation.js` 的格式），教練、防守、覆盤、錯題本都能沿用，因為它們本來就只讀玩家看得到的資訊。
- 目前 `record.js` 遇到 `perspective: "seat"` 會明確回報「不能用種子重播」；實作實戰記錄時再加上對應的讀取與輸入畫面。
