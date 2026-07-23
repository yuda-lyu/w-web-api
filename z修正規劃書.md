# w-web-api 修正規劃書

## ✅ 覆核(2026-07-11 主代理派獨立子代理逐項查證)

> 逐項讀碼 + 實跑複驗本書宣稱: **9/9 全數屬實, 無待修項, 未動任何檔案**。
>
> - **AA-1 / AA-2 現況描述準確**: `WWebApi.mjs:351-358` 確為 `if (true)` 包裹之恆真分支(含註解掉的 early-return);`procProxy.mjs:80-88` axios 確無 `maxRedirects`/`maxContentLength`, `isAllowTarget`(`:13`/`:35-40`)須 caller 傳入才生效 —— 維持「報告不改 / 併 ADR-006 實作附註」判定。
> - **P-3**: spec bullet(測試API E2E-004~008 / 統計 E2E-004 / 初始語系 E2E-004/005)與對應 e2e case(echo server 11077、Authorization/X-API-Key/Basic 斷言、`#timeGroupSel` 切換、csErrConn/csLogout)皆落地。
> - **P-4**: CLAUDE.md 僅餘 2 筆刻意對照之 `generateBaseline` 字樣(`:249`/`:290`, 皆為「本專案無」語句), `deleteTestUsersAndTokens` 0 筆。**P-5**: trace 計數精確吻合(統計 30 筆 / 初始語系 16 筆 `[file:line]`)。**P-6**: 「共用 E2E-001」歸零。
> - **實跑**: `node server/staLogs/test_staEvent.mjs` 三段 PASS、exit 0(含 day 檔名 × hr fmt 粒度自適應直測)。
> - **P-1 baseline**: `test/pics/display/` eng/cht mtime 皆為 07-10 12:58~13:01 同批寫出, 與「重產後容差內還原原 byte」機制一致(eng 檔 mtime 更新屬還原動作之預期副作用;byte 級溯源因無備份檔可比, 無法獨立覆核, 非失實)。
> - **後續(同日業主授權執行)**: AA-1 之 `if (true)` 死碼包裹已清理並驗證無迴歸, 詳 AA-1 節;AA-2 依原判維持併 ADR-006 實作時處理(單獨設 `maxRedirects: 0` 屬行為變更, 不先行)。

## 🔍 稽核追加(2026-07-11 三維度稽核 → 主代理逐項查核)

> 架構/風格/弱點三維度稽核(opus 半邊 + 主代理讀碼複查)。本專案稽核成熟度極高(ADR-001~026 已收錄幾乎所有常見稽核項)。**待修 bug = 0**, 僅 2 項低度供參(皆非必修)。

### AA-1 [低度 / 程式碼氣味] `getTokenUser` 之 `if (true)` 恆真死分支 — ✅ 已清理(2026-07-11)
- **位置**: `server/WWebApi.mjs:351-358` —— `if (true) { /* 註解掉的 iseobj 檢查 */ await checkUser(userSelf) }`。功能正確(checkUser 恆執行), 但 `if(true)` 包裹 + 註解掉的 early-return 為死碼氣味。
- **處置**: 原依 §5「既有死碼提報不自刪」報告不改。
- **✅ 已清理(2026-07-11, 業主授權「有什麼需要修改的由你去修」)**: 移除 `if (true)` 包裹與其內註解掉之 early-return 區塊, 保留 `//check` 標籤與 `await checkUser(userSelf)`(功能完全等價, 零行為變更)。驗證: `node --check` 通過;`npx mocha test/unit-procApis.test.mjs test/api-http.test.mjs` **10 passing / 0 failing**(含「非法 token → checkUser reject」case 直接行使本路徑)。

### AA-2 [低度 / SSRF 加固, 併入 ADR-006 未來實作] `procProxy` axios 未設 `maxRedirects`
- **位置**: `server/procProxy.mjs:80-88`(axios 未設 `maxRedirects`/`maxContentLength`)。`isAllowTarget` 白名單機制已存在(:13,:35)但須 caller 傳入 opt.isAllowTarget 才生效。
- **真痛三條件**: ①合約內=是(SSRF 防護);②已被觀察=否;③後果具體=**條件式**——ADR-006 指示未來部署到可觸及內網時要接線 `isAllowTarget` 白名單拒私網/metadata, 但 axios 預設跟隨 3xx 轉址會使「URL-only 白名單」被 `302 Location: 169.254.169.254` 繞過。**現行 isAllowTarget 未被 caller 接線, 無立即觸發路徑。**
- **處置**: 非本輪必修。**建議在實作 ADR-006 之 isAllowTarget 白名單時, 同步設 `maxRedirects: 0`**(或每次 redirect 重跑白名單)。已請主代理視為 ADR-006 之實作附註。

### 正面確認(已查核, 非誤報)
- server 端 16 個 `reject('errXxx')` key 逐一存在於 procLang 且 eng/cht 齊備(ADR-015 無破口)。
- 無 NoSQL operator injection / path traversal(送 ORM 之 id/group/keyTable 皆經 isestr+白名單驗字串)。無 Vue2 async-arrow 靜默編錯(grep 0)。debug log 經 maskTok 遮罩。

---

> ## ✅ 執行狀態: **P-1 ~ P-7 全部完成**(2026-07-10, 主代理 + 子代理分工)
>
> | 項 | 處置 | 結果 |
> |---|---|---|
> | P-1 | cht baseline 手術式重產: 備份 82 張 → `E2E_REGEN=1` 全跑(61 passing)→ 逐張 pixelmatch 比對「新產 vs 備份」: 容差內 49 張**還原原 byte**(全部 eng + 未含頁首之 cht), 超容差 33 張保留新產(**全部為 cht**, diff 值 1918/1742 px 高度一致 = 頁首描述固定區域, 與根因完全吻合), 新增 20 張(P-3) | ✔ 正常模式全跑 **61 passing / 0 failing**(原 26/19);抽視覺確認 cht 頁首已為中文描述 |
> | P-2 | `test_staEvent.mjs` 追加粒度自適應直測 + day 檔名整合測 | ✔ 全 PASS exit 0 |
> | P-3 | 四組 spec 缺口全數補齊(先 spec 後 test): (a)認證帶入 E2E-004/005/006(測試自帶 echo server:11077 驗 Authorization/X-API-Key/Basic 真的送達)、(b)請求建構器 E2E-007/008(KV 增刪勾選 + POST body)、(c)統計時間範圍切換 stainfor E2E-004、(d)連線狀態 csErrConn/csLogout init E2E-004/005(沿用 CLAUDE.md 明文之懸置+connState 強制機制;兩圖為靜態 PNG 免遮蔽) | ✔ 新增 16 個 case(8+2+2+4 ×語系並含多階段)首跑全綠 |
> | P-4 | CLAUDE.md lifecycle 段改述實際 REGEN 機制(mocha `--baseline`/`E2E_REGEN=1` + root after), 移除虛構之 generateBaseline/直跑分支/deleteTestUsersAndTokens;audit 指令改為「檢查測試檔未繞過集中管理」 | ✔(殘留 2 筆 `generateBaseline` 字樣為刻意對比說明「本專案無」, 非 doc rot) |
> | P-5 | 兩份 spec trace 補行號與深度(統計 30 筆 / 初始語系 16 筆 [file:line]) | ✔ 抽驗 5/5 與程式碼一致 |
> | P-6 | e2e-display 三處「共用 E2E-001」陳舊註解改為實際產製之 baseline 檔名 | ✔ 歸零;另訂正 `e2e-setup.mjs:22`「否則 byte 比對」陳舊用詞 |
> | P-7 | 規劃書自身兩瑕疵: (a)已於本節註記(`assertBaselineMatch` 計數 1 為 `:236` 刻意對照);(b)危險舊 snippet 之訂正已寫回其源頭 `w-web-sso/z修正規劃書.md` 批 B 節(加警語+修正版) | ✔ |
>
> **最終驗收(2026-07-10)**: e2e **61 passing / 0 failing**;unit+api 10 passing;`test_staEvent` PASS。

> **本版更新**: 2026-07-09　|　**更新者**: 主代理（獨立查證，未採信前版自陳之「✔」）
> **本版動作**: ①覆核前版規劃書是否合理屬實 ②盤查 `./spec` 流程覆蓋度 ③盤查 `./test` 之 unit/api/e2e 完整度與風格。
> **結構**: 待修正項在前（§一~§三），已修正項在後（§四），設計取捨已移出至 [`spec/設計要點與取捨.md`](spec/設計要點與取捨.md) 之 ADR-023~026。
> **行號基準**: 2026-07-09 工作區狀態。**動手前務必先 grep 確認行號**，勿盲信本文行號。

---

## 零、執行紀律（動工前必讀）

1. **只做本規劃書明列之項目**；凍結區（§五）一律不碰。
2. **每批完成即驗收**，不要一次全改再驗。
3. 暫存檔一律落 `C:\opensrc\w-web-api\tmp\`；探索用 Glob/Grep/Read，禁止 dump-to-disk。
4. 不主動 commit（業主自行決定）。
5. **不得改動** `test/e2e-setup.mjs` 之比對實作與參數預設值（`maxDiffPixels=100` / `threshold=0.1` / `includeAA:false`）；**不得重產 baseline**（除非取得 §一 P-1 之明示授權）。

---

# 待修正項

## 一、P0｜阻斷性：cht baseline 全面失效（須業主授權）

### P-1 | `npx mocha test/e2e-*.test.mjs` = 26 passing / **19 failing**，失敗全為 `[cht]`

**根因（主代理以靜態控制流獨立確證，無需跑 e2e）**：

| 環節 | 證據 |
|---|---|
| `webDescription.cht` 由英文改為中文 | `git show HEAD:srv.mjs` 之 cht 值 = 英文（與 eng 同字）；工作區 `srv.mjs:49` 已為中文。`srv.mjs` mtime = **2026-07-06 15:21** |
| 該值渲染於**頁首** | `srv.mjs:49` → `server/WWebApi.mjs:207` → `:241 procLang({webDescription})` → kpLang → `src/components/Layout.vue:24` `{{$t('webDescription')}}` |
| cht baseline 早於改動 | `test/pics/display/display-cht-*.png` mtime = **2026-06-22 11:42** |
| eng 不受影響 | eng 值未變 |

→ 所有 cht 全頁 baseline 之頁首描述文字與現況不符。**與批 A（文件/註解）、批 B（統計過濾）無關**，屬 2026-07-06 該次改動只跑 `npm run build`、未跑 e2e 所致。

**處置**：
- 本次**不重產任何 baseline**（依全域技能「重產須先經業主授權」）。
- 建議：業主授權後，針對受影響之 **cht** baseline 執行手術式重產（**僅 cht，eng 不動**），再全跑 e2e 驗綠。

---

## 二、P1｜測試與規格之實質缺口

### P-2 | `filterVpfsByWindow` 之「粒度自適應」防線**無任何回歸測試**

- **現況**：`server/staLogs/filterVpfsByWindow.mjs:22` 之 `bn >= keyStart.slice(0, bn.length)` 是本模組的招牌防線。`test/` 內 0 引用；`server/staLogs/test_staEvent.mjs` 僅間接觸及兩條路徑：**fail-open**（`:65` 寫入非 ISO 檔名 `old.log`）與 **hr 檔名 × hr fmt**（`:63-64` 之 `${keyNow}.log` / `${keyPrev}.log`）。
- **未被覆蓋之分支**：**day 粒度檔名（10 字元）× hr 粒度 fmt（13 字元）**。模組註解（`:11-14`）自陳：若不做 `slice`，`'2026-07-08' < '2026-07-08T21'` → **含 tStart 之當天檔被誤判窗外 → 漏讀整天資料**。
- **可觸發性**：`srLog` 之 `logInterval`（決定檔名粒度）與 `staEvent` 之 `timeInterval`（決定 fmt）是**兩個獨立設定**（`settings.json` vs 前端傳入），實務上可不同。
- **後果具體**：該防線若被誤改，唯一守門是 staEvent 整合測，而現有整合測**打不到此分支** → regression 靜默漏網，統計頁漏一整天資料且無錯誤可循。
- **建議修法**：於 `server/staLogs/test_staEvent.mjs` 增（或另建 `test/unit-filterVpfsByWindow.test.mjs`）：
  1. 建 **day 粒度檔名**（如 `2026-07-08.log`）+ 以 `fmt='YYYY-MM-DDTHH'` 呼叫 → 斷言當天檔**被保留**（守住 slice 防線）。
  2. 建明確窗外之 **hr 檔名** → 斷言**被剔除**。
- **風險**：極低（純函式、無副作用）。

### P-3 | spec 缺三組重要流程之 `E2E-NNN` bullet

> 註：rubric #1「Case 對齊」實測**通過**（spec bullet 數 ≡ `it()` 數：展示 9/9、編輯 5/5、測試 3/3、統計 3/3、初始語系 3/3）。本項缺的是**spec 未為既有功能定義 bullet**，非 test 漏做 spec 已定義之 case。

| # | 缺口 | 證據 | 為何重要 |
|---|---|---|---|
| a | **測試分頁「認證帶入」無測試翻譯** | `LayoutContentTest.vue:409-465` 之 bearer/apikey/basic 三分支；`spec/流程_測試API.md` 之 trace 006a/b/c 與「認證帶入分支」表**已詳述**，但 `test/e2e-apitest.test.mjs`（3 個 it()）**無任何 `Authorization` 注入斷言** | 違 §14.2「測試是規格的翻譯」：spec 已寫成規格卻無 predicate。authConfigJson 解析若壞，使用者的認證標頭靜默消失 |
| b | **測試分頁請求建構器編輯能力** | Query/Headers KV 列增/刪/勾選/改鍵值（`LayoutContentTest.vue:71,89,99,130,148,158`）、Body 編輯 + 非 GET 送出（`:178,289,546`）全無 E2E | 「測試任意 API」是本套件三大核心價值之一，目前僅覆蓋「改 URL → GET 送出」 |
| c | **統計頁時間範圍切換** | `LayoutContentStats.vue:16` `v-model=timeGroup`（1時/4時/8時/1日 重採樣）；`spec/流程_統計資訊.md` description 有提，**無 E2E case**；`test/e2e-stainfor.test.mjs` 完全未觸發 | `resampledData` 為統計頁核心展示邏輯 |
| d | **連線狀態畫面 `csErrConn` / `csLogout`** | `src/components/LayoutState.vue:30,42` 有完整 i18n 文字與圖示；spec 全域 grep **0 命中**。`csErrConn` 於 `src/main.js` 之 getWebInfor catch 修好後**已可觸發** | **專案 `CLAUDE.md` 自身明文指導**要涵蓋「其他連線狀態畫面（連線錯誤/拒絕登入/已登入過場）」，並給了「連線懸置 + 前端狀態 API 強制切換」的作法，卻無 spec 亦無 e2e |

- **建議修法**：擇一——①於對應 spec 增 `E2E-NNN` bullet 並補 e2e；②若判定為刻意不測，寫入 `spec/設計要點與取捨.md` 明示取捨（**不可默默不做**）。
- 次要（可併入或明示取捨）：編輯表單之 `valInvalidJson` 格式驗證（`LayoutContentEdit.vue:377`，僅列於「錯誤處理分層」表無 case）、取消鈕（`:242 onClickCancel`）。

---

## 三、P2｜文件與現實脫節（doc rot）

### P-4 | `CLAUDE.md` 之「e2e lifecycle 實作映射」整段描述不存在的機制 —— **且其 audit 指令恆為空，構成假安全感**

- **現況**（皆已 grep 證實不存在於本專案）：
  - `CLAUDE.md:248`「非框架直跑分支 flag: `process.argv.includes('--baseline')`（每個 test 檔內 `generateBaseline()` 函式末尾須顯式 `cleanup()`）」→ **`test/e2e-*.test.mjs` 無任何檔使用 `process.argv`**；**`generateBaseline` 全 `test/` 0 命中**。
  - `CLAUDE.md:249`「非框架直跑入口: `node test/e2e-<flow>.test.mjs --baseline`」→ 無此入口。
  - `CLAUDE.md:282-285` 之 audit 指令 `grep -lE "process\.argv\.includes\('--baseline'\)" test/e2e-*.test.mjs | ...` → **回傳恆為空**，永遠「通過」。
  - `CLAUDE.md` 之「標準 baseline 主函式範本」內含 `deleteTestUsersAndTokens()` —— **此為 `w-web-sso` 之函式**，本專案不存在。
- **實際機制**：regen 由 `test/e2e-setup.mjs:23` `let REGEN = process.argv.includes('--baseline') || process.env.E2E_REGEN === '1'` 判定，走 **mocha 參數或 `E2E_REGEN=1` 環境變數**；cleanup 由 mocha root `after` hook（`:194-199`）統一觸發，**無直跑分支需顯式 cleanup**。
- **後果具體**：後續 agent 依 CLAUDE.md 撰寫 e2e 時會產出不存在的 `generateBaseline()` 結構；audit 指令給出虛假的「全部通過」。
- **建議修法**：更新 `CLAUDE.md` 之 lifecycle 映射表與 audit 指令，改述為實際的 `REGEN`（`--baseline` 旗標或 `E2E_REGEN=1`）+ mocha root `after` 機制；移除 `generateBaseline()` 範本與 `deleteTestUsersAndTokens()` 殘留。
- **風險**：0（doc-only）。

### P-5 | `spec/流程_統計資訊.md` 與 `spec/流程_初始語系.md` 之 trace 段**全數缺行號**、深度不足

- **現況**：兩份**有**「## 執行流程」trace 段，但引用一律寫成 `[src/components/LayoutContentStats.vue]`、`[server/WWebApi.mjs]` 等**不帶 `:行號`**（`[file:line]` ref 數 = **0**；對照展示 37 / 編輯 54 / 測試 34 筆）。
- **違反**：全域 §15.2「檔名行號放該行最末尾 `[檔名:行號]`」；且未追到底、未標 `await`/條件分支/`catch` 攔截範圍。統計資訊之 trace 僅 001-003（`resampledData`/`eventRows`/時間切換全未進 trace）；初始語系之 `getLang` 優先序、注入取代、攔截懸置等關鍵步皆未標行號。
- **建議修法**：補齊 `[檔名:行號]`、追到底、標出 await 與分支（措辭與縮排規則對齊 `spec/流程_展示API文件.md` 之既有 trace，不自創）。
- **風險**：0（doc-only）。

### P-6 | `test/e2e-display.test.mjs` 三處註解與程式碼矛盾

- **現況**：`:184`、`:303`、`:342` 之註解均寫「視覺共用 E2E-001 baseline，不另產」，但程式碼**正確地**各自產製 baseline：`:214` `E2E-002-tree.png`、`:335` `E2E-005-header.png`（另有 `E2E-005-pills`、`E2E-006-{input,output,request,response}`），且與 `spec` 及 `test/pics/display/` 實檔相符。
- **判定**：**程式對、註解舊**（doc rot）。
- **建議修法**：僅修註解使其對齊 spec 與實檔。**不得依註解去刪除 baseline 產製**。
- **風險**：0（僅註解）。

### P-7 | 前版規劃書自身之兩處瑕疵（供本次一併更正）

| # | 位置 | 問題 |
|---|---|---|
| a | 前版 §五驗收總表 A-3 | 寫「`grep -c "assertBaselineMatch" CLAUDE.md` 應為 **0**」，但 A-2 新增之防誤判警語（`CLAUDE.md:236`）**刻意**保留 `sso/perm/task 為 assertBaselineMatch` 作為對照 → 實際計數為 **1**。驗收條件與自身設計矛盾，應改為「僅 `:236` 對照用途允許出現」 |
| b | 前版 §三 B-1 之程式碼範例 | 給的簽章 `filterVpfsByWindow(vpfs, tStart, timeInterval='hr')` 於內部推導 fmt，**有真 bug**：當 `logInterval='day'`（檔名 10 字元）而 `timeInterval='hr'`（keyStart 13 字元）時，`'2026-07-08' >= '2026-07-08T21'` 為 false → **含 tStart 之當天檔被誤判窗外、漏讀整天資料**。實作者已改為 `(vpfs, tStart, fmt)` + `keyStart.slice(0, bn.length)` 修正之。**規劃書範例應更正，以免日後照抄回退** |

---

# 已修正項

## 四、前版批 A / 批 B —— 主代理獨立查證結果

> 查證方式：逐項 grep / Read 實際檔案，不採信前版自陳之「✔」。

| 項 | 內容 | 查證結果 |
|---|---|---|
| A-1 | `CLAUDE.md:115` 改寫為契約語意、不點名 API | ✔ 已改 |
| A-2 | 新增「e2e baseline 比對落地映射」節 | ✔ `CLAUDE.md:231-236` 存在，內容正確（含防誤判警語） |
| A-3 | `CLAUDE.md:105`/`:124` 函式名訂正（**誤報主因**） | ✔ 兩處均已改為 `assertOrRegenBaseline`。（驗收條件本身有誤，見 P-7a） |
| A-4 | `test/e2e-setup.mjs:287` 陳舊註解 | ✔ `byte-equal` 計數 = 0；**`:282` / `:344` 之精確相等（settle 偵測）完好未被誤改** |
| A-5 | 兩份流程文件補容差描述（6 處） | ✔ `流程_統計資訊.md` / `流程_初始語系.md` 各 3 處 |
| A-6 | README 不改 | ✔ 維持（防誤報之正面陳述已由 A-2 覆蓋） |
| B-1 | `staEvent` 開檔前時間窗過濾（抽 `filterVpfsByWindow.mjs`） | ✔ 已落地，**且實作優於前版規劃書**（見 P-7b）。惟粒度自適應分支缺測（見 P-2） |

**誤報事件之根絕**：先前「`assertBaselineMatch` 是 byte-exact 的 `buf.equals()`，專案內完全沒有 pixelmatch」為**誤報**。本專案比對函式實名 `assertOrRegenBaseline`（`test/e2e-setup.mjs:394`），確用 pixelmatch 容差（`:438-439`）。誤報鏈（全域技能 + `CLAUDE.md` 寫死他專案函式名）已由 A-2/A-3 與全域技能修正切斷。

## 五、e2e 五維度 rubric 盤查結果 —— **全數通過**

> 依全域技能 `role-code-for-test-e2e` 完整度 rubric 逐維度列（硬規則：不得因 case 數對齊就報全覆蓋）。

| # | 維度 | 結果 | 佐證 |
|---|---|---|---|
| 1 | Case 對齊 | **通過** | spec bullet ≡ `it()`：展示 9/9、編輯 5/5、測試 3/3、統計 3/3、初始語系 3/3 |
| 2 | Act 真實 | **通過** | 文字輸入走 `typeIntoInput`（Pattern D：click → 驗 `activeElement` → `keyboard.insertText`，`e2e-setup.mjs:306-328`）；點擊走 `getByText().click()` / `locator.click()`。全 `test/` grep `.fill(` / `el.value=` / `dispatchEvent` / `vm.` **0 命中** |
| 3 | Assert 完整 | **通過** | 每 case 皆有語意斷言 + stable 態 pixel baseline；無 baseline 者（display E2E-007/008、init E2E-003）皆 spec 明訂。edit 另補 DB 副作用斷言 |
| 4 | 多語覆蓋 | **通過** | 各檔 `LANGS=['eng','cht']` 外圈迴圈；display E2E-008 單輪符合 spec（該 case 本身即雙語切換） |
| 5 | Cleanup 完整 | **通過** | 各檔 `beforeEach resetToBaseSeed()` + `after resetToBaseSeed()`；init/stainfor 另 `restartBackend('./settings.json')` + `fs.rmSync(SYNTH_FD)`。無直跑分支需顯式 cleanup（見 P-4） |

**附加項亦通過**：per-case fresh browser（`beforeEach chromium.launch` + `afterEach browser.close`）、端點一律 `127.0.0.1`（`e2e-setup.mjs:26`）、所有 baseline 走 `captureStable*`（無裸 `page.screenshot`）、紅框 `#f26` / 5px（`e2e-setup.mjs:504`）、baseline 命名與 `test/pics/` 實檔一致。

**unit / api 測試**：`test/unit-procApis.test.mjs`、`test/api-http.test.mjs`、`server/staLogs/test_staEvent.mjs` 之斷言均為 spec 契約之翻譯，**無 false-green、無「現狀指紋」式 `buf.equals` 斷言**。

## 六、已判定為設計取捨（不列待修，已寫入 ADR）

以下項經三條件檢驗屬**刻意取捨**，已寫入 [`spec/設計要點與取捨.md`](spec/設計要點與取捨.md)：

| ADR | 內容 |
|---|---|
| ADR-023 | `test_staEvent.mjs` 置 `server/staLogs/`、`test_` 前綴、node assert（避開 mocha 預設 glob；與被測模組同置） |
| ADR-024 | mocha 預設 glob 載入 `test/e2e-setup.mjs`（0 test、benign，且正是 root teardown 註冊點） |
| ADR-025 | `procProxy` / `procLang` 不另建 unit，由 e2e 整合覆蓋主路徑；`errProxyRequestFailed`、`errReqTargetNotAllowed`（不可達）刻意不測 |
| ADR-026 | `provideTabs` / `filePathToCode` 不建測試（範例 scaffolding 與 trivial helper） |

---

## 七、凍結區（**本次不執行**）

| 項目 | 狀態 |
|---|---|
| `test/e2e-setup.mjs` 之比對實作、參數預設值、`includeAA:false` | 不動（現況正確） |
| `test/e2e-setup.mjs:282` / `:344` 之精確相等（settle 偵測） | 不動（刻意如此，勿改為容差） |
| ADR-009（`spec/設計要點與取捨.md`） | 不動（內容完整且函式名正確） |
| 已一致之四份流程文件（展示API文件 / 測試API / 編輯API + `CLAUDE.md:115`） | 不動 |
| baseline 圖檔 / 標準圖重產 | 不動（除非取得 P-1 授權） |
| 前端重複樣板重構 | **業主已指示重構凍結** |

---

## 八、建議處理順序

| 序 | 項目 | 需授權? | 風險 |
|---|---|---|---|
| 1 | **P-1** cht baseline 手術式重產 | ✅ **須業主授權** | 中（凍結規格） |
| 2 | **P-2** `filterVpfsByWindow` 粒度自適應補 unit | 否 | 極低 |
| 3 | **P-4** `CLAUDE.md` lifecycle 段更正（消除假安全感） | 否 | 0（doc） |
| 4 | **P-6** `e2e-display` 三處註解 doc rot | 否 | 0（註解） |
| 5 | **P-5** 兩份 spec trace 補行號與深度 | 否 | 0（doc） |
| 6 | **P-7** 更正本規劃書自身之驗收條件與 B-1 程式碼範例 | 否 | 0（doc） |
| 7 | **P-3** spec 補重要流程 bullet（或明示取捨） | 建議先確認方向 | 低~中 |

---

## 九、驗收方式

```bash
cd C:\opensrc\w-web-api

# P-2 之後
node server/staLogs/test_staEvent.mjs      # 或新 unit 檔
node --check server/staLogs/filterVpfsByWindow.mjs

# P-4 / P-5 / P-6 / P-7 為 doc-only，目視 + grep 驗證即可
grep -rn "generateBaseline\|deleteTestUsersAndTokens" CLAUDE.md   # 應為 0
grep -c "共用 E2E-001 baseline" test/e2e-display.test.mjs          # 應為 0

# P-1 授權後
E2E_REGEN=1 npx mocha test/e2e-<flow>.test.mjs --reporter list     # 僅重產 cht
npx mocha test/e2e-*.test.mjs --reporter list                      # 應全綠
```

> **基準線**: 目前 `unit + api` 層 10 passing / 0 failing；`e2e` 層 26 passing / **19 failing**（全為 cht，根因見 P-1）。
