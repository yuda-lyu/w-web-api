# 狀態(w-web-api)

> 只記現況, 不寫過程(過程入 `sgud/exp/experience.md`). 本檔 2026-10-22 新建(inv01 盤點輪); 2026-10-23(api-run01, 排程第 112 項)依實作結果更新; 同日 api-run02(修正輪: 外部列受保護)、api-run03(最末小修輪: 存檔成功後立即以伺服端回傳列更新基準)再更新. 完成一項功能或結束一輪工作時即更新. 接續工作先讀本檔.

## 版本與依賴

- 現版 `1.1.13`(`package.json`); 本輪(api-run01)**未改版號**(發布為使用者任務).
- 已安裝自有套件(`node_modules`, 2026-10-23 查): `w-serv-orm 1.1.17`(本輪由 1.1.15 升, `package.json` 依賴改 `^1.1.17`)、`w-serv-webdata 1.1.15`、`w-serv-hapi 1.1.7`、`w-orm-lmdb 1.0.42`(devDependency, 參考部署後端)、`w-data-collector 1.0.47`、`wsemi 1.9.21`.
- 單一資料表 `apis`(`src/schema/tables/apis.mjs`, 30 欄含主鍵: 本輪補 `userIdUpdate`、`srcKey`); 寫入契約 `src/schema/contracts/apis.mjs`(fields 24、serverOnly 5; 具名匯出 `fieldsExternal` 16 / `fieldsLocal` 8); 外部列判定與守門之共用純函數 `src/schema/contracts/externalRows.mjs`(前後端同一檔); 新檔 `server/getLockExternalRows.mjs`、`src/components/ExtMark.vue`、`g_auditExternalRows.mjs`.

## 功能現況

| 功能 | 現況 | 規則帳本(分冊) | 測試檔 | 已知缺口 |
|---|---|---|---|---|
| 展示 API 文件(Docs 分頁) | 完成 | `rulebook_ui.md`、`rulebook_test.md` | e2e-display(17 案) | — |
| 編輯 API(新增/修改/刪除) | 完成; **多人同時編輯已處理(原則 10, 2026-10-23, ADR-043)**: 一表一鍵(`apis` 表鎖, 存檔/刪除/匯入共用)、逐列基準(持舊畫面整次拒收 `saveStale`、零寫入)、修改只改不增/刪除未命中回 `errApiRowNotFound`、伺服器專有欄位不採客戶端值、最後修改者 `userIdUpdate`、前端草稿保護(無關列/同一列/列被刪/搜尋/他人改回載入時內容/列重新出現/舊資料無法建立基準時禁止存檔); 後端雙擊防護(依使用者占位)+ 前端 `runSubmit`(ADR-034)仍在外層; **存檔／刪除成功後新基準與畫面立即取自伺服端回傳(api-run03, 2026-10-23, ADR-045, 規格 §8; 消除 api-verify01 N1「存檔後立即再編輯被自己誤擋」)**: `saveApi` 成功於同一表鎖內讀回寫入後之列、附於 procOrm save 結果第 0 筆 `row`(加法, 讀回失敗不使存檔失敗); 前端立即更新 store(`src/store/applyRows.mjs`: 等於基準且不比回傳列新才取代、晚到之較舊快照不退回〔`createRecentRows`〕、列不在不復活、刪除只在等於基準時移除) | `rulebook_concurrency.md` §9(R-CONC-01~07)、`rulebook_ui.md`「按鈕雙擊防護」 | unit-procApis、unit-applyRows、unit-contract、unit-lockSave、api-concurrency(含 N1)、api-doubleclick、e2e-edit(5 案×2 語系)、e2e-concurrent(E2E-006~012、019~023 ×2 語系) | 已開啟之舊版頁面不受草稿保護且不帶基準(本 major 允許; 下一 major 後台必帶基準); 新增列兩個窄競態(幽靈列／暫時消失)為設計事實不處理, 見 ADR-045 決定 5③; 後台對外部列之鎖定已於 api-run02 完成(下列「外部列受保護」列) |
| 外部列受保護(原則 5, `lockExternalRows` 預設 `'y'`) | **完成(api-run02, 2026-10-23, ADR-044)**: 外部列(`srcKey` 非空)後台不可刪除、不可改 `group`／`srcKey`／外部擁有欄位(16 欄)、可改本系統擁有欄位(8 欄含 tokens); 外部管理 group(內有外部列)不可新增列、不可改入; 伺服端表鎖內新鮮讀取判定、違規整次拒收零寫入(`saveExternalRowChanged`／`deleteExternalRowDenied`／`saveExternalGroupDenied`); 前端樹狀鎖頭／警告、編輯頁唯讀說明與欄位、刪除鈕停用附 tooltip、群組欄即時提示(不送出); 混雜列(外部 group 內 srcKey 空)不鎖不自動刪、前端警告＋匯入 warn＋`g_auditExternalRows.mjs` 盤點; 選項 `'n'` 回舊行為(`settings.json` → `srv.mjs`) | `rulebook_backend.md` R-EXT-LOCK-01 | unit-externalRows、unit-procApis-external、api-externalRows、e2e-external(E2E-013~018) | 相容期無來源鍵之列與升版前未被匯入命中之列視為後台列不鎖(設計事實); 下次匯入未以 `id` 列入之混雜列被刪(行為不變, README 載明) |
| 測試分頁(代打請求) | 完成 | `rulebook_backend.md`(權杖外洩防護) | e2e-apitest(28 案)、unit-procProxy | — |
| 統計資訊 | 完成 | `rulebook_backend.md` | e2e-stainfor、unit-staEvent*、unit-staFreq | — |
| 外部匯入 `POST /syncAndReplaceTabs` | **完成(原則 11, 2026-10-23, ADR-043)**: 依外部自訂來源鍵 `srcKey` 於 `apis` 表鎖內差異同步(新增/刪除/修改/不變), 本系統擁有欄位(tokens/authType/authConfigJson/testBaseUrl/default*Json/contentType)一律不寫, `timeCreate` 只於新增時寫, 失敗以快照補償(消除 ADR-016 非原子), 整批驗證全有或全無, 回 `{ nAdd, nUpdate, nDel, nSame }`; `provideTabs` 支援 `srcKey` | `rulebook_backend.md`「外部同步契約」、R-IMPORT-01 | api-import、unit-syncApis、api-http、api-syncIter、unit-syncRows、unit-provideTabs | 相容做法待使用者確認(現行 major: 列無 srcKey 而有 id 以 id 為來源鍵; 兩者皆無該列每次新增、其餘有鍵之列仍差異同步並記警告——**偏離主控建議之整批 delAll+insert**, 見 ADR-043 決策 5; 既有外部列首次命中補 srcKey=id); 下一 major `srcKey` 必填 |
| 資料通道(前端 store 來源) | 只開 `select`(R-DC-1) | `rulebook_backend.md` | api-dataChannel、unit-dataChannel | — |
| 初始語系 | 完成 | `rulebook_ui.md` | e2e-init | — |
| 打包後可用性(X1) | 完成 | `rulebook_backend.md` | unit-resolveShellWorker | — |

## 多人同時編輯(原則 10)與外部匯入(原則 11)

- **階段**: 第二波實作**完成**(2026-10-23, api-run01); 共用核心 w-serv-orm 1.1.17. 規則與 V1~V14 驗收對照見 `rulebook_concurrency.md` §9; 外部匯入規則與 I1~I14 對照見 `rulebook_backend.md` R-IMPORT-01; 決策紀錄 `decisions.tsv` phase `api-run01`.
- **待使用者確認**: 外部匯入相容做法(主控建議): 現行 major 以 `id` 代替 `srcKey`、兩者皆無該列每次新增(**本輪偏離主控建議之整批 `delAll`＋`insert`**: 外審實測該作法於混批時清掉有鍵之列的本系統擁有欄位, 見 ADR-043 決策 5)並記警告、既有外部列補 `srcKey=id`; 下一 major `srcKey` 必填、後台必帶基準.
- **已定案**(api-run02, 2026-10-23, 使用者裁示之原則 5): 後台對外部列(`srcKey` 非空)鎖定——不可刪除、不可改身分欄與外部擁有欄位, 可改本系統擁有欄位; 外部管理 group 不可新增與改入; 選項 `lockExternalRows`(預設 `'y'`). 見 ADR-044、R-EXT-LOCK-01. 相容做法(見上「待使用者確認」)仍待使用者確認, 本輪未動.
- **已定案**(api-run03, 2026-10-23, 規格 §8 後補, ADR-045, R-CONC-07): 存檔成功後新基準與畫面立即取自伺服端回傳之列, 不等推播／輪詢(消除 api-verify01 N1: 存檔成功後約 2 秒內立即再編輯再存被自己上一次存檔誤擋, 實測 8 次中 7 次). 後端 `saveApi` 成功時於同一表鎖內讀回寫入後之列附於 `msg[0].row`(加法; 讀回失敗不使存檔失敗, 前端退回等推播); 前端 `src/store/applyRows.mjs` 於存檔／刪除／新增成功後立即更新 store(保護: 等於基準且不比回傳列新才取代、晚到較舊快照不退回、列不在不復活; 先動先贏不被削弱). **已知取捨(設計事實)**: 新增列兩個窄競態——他人於新增回應抵達前即刪除該列(幽靈列至下次推播)、晚到舊快照缺新列(暫時消失)——不處理, 根治需共用核心提供表時間標記(ADR-045 決定 5③). N1 原不在本檔「已知缺口」(來自 api-verify01 報告), 故無條目可移除; 規則帳本 R-CONC-06 之「存檔成功後新基準取自伺服端」已由 R-CONC-07 兌現為「且立即取得」.
- **部署前提**: 單一行程; 同表只由同一 `WServOrm` 實例寫入; 離線工具(`g_initialTestData.mjs`)須在服務停止時執行(不經表鎖).

## 測試現況

- 檔數(api-run03 後): api 9(新 `api-concurrency`、`api-import`、`api-externalRows`)、e2e 7(新 `e2e-concurrent`、`e2e-external`)、unit 24(新 `unit-contract`、`unit-syncApis`、`unit-externalRows`、`unit-procApis-external`、`unit-applyRows`); 工具 `test/tools/apiHarness.mjs`(含 `opt`、`wipe`)、`apiServerChild.mjs`、`e2eEditHelpers.mjs`; 指令與配置見 `rulebook_test.md`.
- 最近一次驗證: **api-run03(2026-10-23)**: unit 全部 281 案(24 檔)、api 全部 109 案(9 檔)、e2e 受影響 91 案(e2e-edit 10、e2e-concurrent 24〔含新 E2E-019~023〕、e2e-external 12、e2e-display 17、e2e-apitest 28)皆 0 失敗, 修訂測試後 e2e-concurrent 單獨全跑 24 案 0 失敗; 變異: 後端／純函數 16/16、前端接線 6/6 被抓; 外審 sol 8 條(屬實 7 已修或列設計事實, 待證 1 補強); 既有標準圖 0 張改變、未新增標準圖; 未跑 e2e-init、e2e-stainfor(未受影響; 全套由主控於最末輪凍結碼跑). 詳見 `agent-out/api-run03-修正報告.md`. 前一輪: api-run02(2026-10-23): unit 全部 250 案、api 全部 104 案(9 檔)、e2e 受影響 79 案(e2e-external 10〔當時〕、e2e-edit 10、e2e-concurrent 14、e2e-display 17、e2e-apitest 28)皆 0 失敗, e2e-external 補 E2E-018 後單獨重跑 12 案 0 失敗; 變異: 伺服端 32/32、前端 17/17 被抓; 未跑 e2e-init、e2e-stainfor(未受影響; 結案由主控於最末輪跑全套). 詳見 `agent-out/api-run02-實作報告.md`. 前一輪(api-run01)見 `agent-out/api-run01-實作報告.md`.
- 新標準圖 `test/pics/conc/`(E2E-006~009 共 9 張、E2E-011/012 共 3 張, ×2 語系 = 24 張)與 `test/pics/ext/`(E2E-013 4 張、E2E-014 2 張、E2E-015 2 張、E2E-016 1 張, ×2 語系 = 18 張; E2E-017／018 無標準圖); 既有標準圖 0 張改變.

## 其他已知缺口 / 待辦(摘要; 詳見 `rulebook_gaps.md`)

- e2e「每操作兩張」第 2 期(display 4 案、edit 3 案、apitest 13 案、stainfor 1 案)待辦.
- 上方標題列窄版無 e2e 覆蓋.
- `test/staLogs-golden/logs` 被 `.gitignore` 排除、未入版控(2026-10-14 紀錄, 見 `rulebook_test.md`「fixture 資產」列).
- `e2e-edit.test.mjs` 與 `test/tools/e2eEditHelpers.mjs` 有同名 helper 兩份(本輪未動既有 e2e 檔), 日後收斂.
