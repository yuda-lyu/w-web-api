# 規則帳本分冊:後端與外部同步(w-web-api)

> 本分冊自 `rulebook.md` 依類型拆出(2026-10-22, 全域 §14 過長整理); 節號與標題不變、內容只搬不刪; 索引見 `rulebook.md`.

## 後端錯誤契約(對應 ADR-015 / ADR-029 / ADR-030)

| 規則 | 站點全集 | 判準 | 盤點指令 |
|---|---|---|---|
| proc 層可預期錯誤一律 `reject('errXxx')`, key 須存在於 `server/procLang.mjs`(eng + cht) | `procProxy` / `procApis` / `WWebApi`(route + kpFunExt)/ `staLogsCore`(`errTimeLengthInvalid`) | 已套(含 `syncAndReplaceTabs` 逐列檢核 `errRowInvalid`, ADR-031); **例外**(2026-09-29, ADR-034): 雙擊防護之占位衝突 key `saveInProgress` / `deleteInProgress` / `requestInProgress` 無 err 前綴(四專案共用名), 經 `server/lockSave.mjs` 之 errKey 變數 reject, 不在左列盤點指令範圍 | `git grep -ho "reject('err[A-Za-z]*')" -- server \| sort -u` 逐一對照 `procLang.mjs`; 例外另以 `git grep -n "InProgress" -- server` 對照 |
| `syncAndReplaceTabs` 之 rows: 陣列層 `isarr && length>0`(`errRowsInvalid`), 逐列(物件 + `kpRequiredFields` + `srcKey`, 來源鍵規則見 R-SYNC-1／R-IMPORT-01; 列帶 `id` → `idNotAllowed`)檢核在寫入之前(`errRowInvalid`, srLog 記 index/field[/reason]) | `WWebApi.parsePayload` / `syncAndReplaceTabs`(陣列層); 列級檢核自 2026-10-23(ADR-043)移至 `server/syncApis.mjs`; `server/checkSyncRows.mjs` | 已套(ADR-031; 主鍵 ADR-038; 來源鍵規則 R-IMPORT-01); 守 `test/api-http.test.mjs`「逐列檢核」(原 4 case + 主鍵 5 case)、`test/unit-syncRows.test.mjs`、`test/unit-syncApis.test.mjs`、`test/api-import.test.mjs` | `git grep -n "rejectRow\|checkRowIds" -- server/syncApis.mjs` |
| proxy: headers/query 接受物件或有序鍵值對, 重複鍵不收斂(query 逐對 append; 標頭由 `Headers` 依 Fetch 合併); 轉址 `redirect:'manual'` 手動跟隨、每跳重驗 `isAllowTarget`(建構子 `opt.isAllowTarget` 接線)與內建目標位址政策(預設拒絕內網與本機, R-PROXYTARGET-01, api-run02)、上限 20 | `procProxy.toPairs` / `proxyRequest`; 前端 `mShare.kvRowsToPairs` | 已套(ADR-031); 守 `unit-procProxy` PROXY-011~016、e2e-apitest E2E-013/014 | `git grep -n "redirect: 'manual'\|isTargetAllowed\|kvRowsToPairs" -- server src` |
| 錯誤路徑須 `srLog.error({ event, err })` 記 err-key | kpFunExt 經 `wrapErrLog`; HTTP route 經 `wrapRouteErrLog`; `verifyConn` 兩處 | 已套 | `git grep -n "wrapErrLog\|wrapRouteErrLog\|srLog.error" -- server/WWebApi.mjs` |
| 憑證不落 stdout / srLog | `server/maskLog.mjs`(M 契約) 與 `server/wrapInjected.mjs`(W 契約) | 已套(2026-09-24 ADR-033); 規則、站點全集與盤點指令見下節「權杖外洩防護」(原盤點指令 `console.log.*token \| grep -v maskTok` 會命中只含字串常值之固定訊息, 不再使用) | 見下節 |
| 請求內容原文送出, proxy 不解析不代換; DEL → DELETE 於送出與 cURL | `LayoutContentTest.submitSend`、`LayoutContent.curlOf`、`mShare.methodToHttpVerb`、`procProxy`(TextEncoder 位元組) | 已套 | `git grep -n "methodToHttpVerb\|j2o(rawBody)" -- src`(後者應為空) |
| 前後端共用函數放 `src/plugins/mShare.mjs`, 元件以 `vo.$s.*` 取用 | `METHODS`、`isJsonContainer`、`dataToText`、`methodToHttpVerb`、`escapeHtml`、`jsonHighlight`(docs + 測試分頁共用)、`kvRowsToPairs` | 已套 | `ls src/utils 2>/dev/null`(應不存在); `git grep -n "jsonHighlight" -- src \| grep -v mShare`(應只剩 `$s.jsonHighlight` 呼叫) |
| 失敗／非預期例外通知走 `showCheckYes`(先 `updateLoading(false)`), 不用自動消失之 `$alert` toast; 有副作用之送出開頁面層 loading | `LayoutContentEdit`(存／刪)、`LayoutContentTest.submitSend` | 已套(ADR-031) | `git grep -n "\$alert(" -- src/components`(應為空) |
| 自訂主題區禁原生 `<select>`(全域 §10.6-3); 自製下拉之固定寬度須計算 | `LayoutContentStats` 時間範圍 `WTextSelect`(`timeGroupSelWidth`) | 已套(ADR-031; 量測表見 `spec/流程_統計資訊.md`) | `git grep -n "<select" -- src`(應為空) |

## w-serv-orm 設定、資料通道、外部同步與生命週期(對照 ADR-038; 2026-10-14, w-serv-orm 1.1.10 / w-serv-hapi 1.1.6 升版)

規則先於程式: 本節為 run02 實作之依據, 測試由各列之「判準」衍生. 盤點指令一律以 grep 錨點, 不寫死行號.

| 規則 | 站點全集 | 判準 | 盤點指令 |
|---|---|---|---|
| **R-ORM-1** 已移除之 w-serv-orm 設定(`useCheckUser` / `getUserById` / `useExcludeWhenNotAdmin`)不讀、不轉交、不包裝; `WWebApi` 於參數檢核之末、任何副作用(srLog 初始化起)之前呼叫 `checkOptRemoved(opt)`(`w-serv-orm/src/checkOptRemoved.mjs`, 訊息單一擁有者為 w-serv-orm): 未給 / null / false 照常, 其他值建構即拋 Error | `server/WWebApi.mjs`(建構子); `srv.mjs`、`g_mOrm.mjs`(`WServOrm(ds, WOrm, url, db)` 不給 opt); JSDoc、`README.md` 不出現三鍵 | 已套(2026-10-14); 守 `test/unit-wwebapi-opt.test.mjs`(三鍵 × 6 種值拋該訊息; 未給 / null / false 通過——以 `logNumKeep:-1` 使其後之 srLog 拋自己之錯而觀察「已通過檢查」) | `git grep -n -E "useCheckUser\|getUserById\|useExcludeWhenNotAdmin" -- server srv.mjs g_*.mjs README.md src`(應為空; 測試檔之測資除外); `git grep -n -E "checkOptRemoved\(opt\)\|let srLog = srLogInit" -- server/WWebApi.mjs`(前者行號須小於後者) |
| **R-ORM-2** `opt.serverPort` 未給(undefined / null)取 11005; 有給須為 1–65535 之整數(含數字字串), 否則建構即拋 `invalid opt.serverPort`, 不退回預設(w-serv-hapi 1.1.6 對 > 65535 會靜默改聽 8080) | `server/WWebApi.mjs` 參數檢核 | 已套(2026-10-14); 守 `unit-wwebapi-opt`(0、-1、70000、65536、1.5、'abc'、true 拋且先於 srLog; undefined、null、1、65535、'11005' 通過) | `git grep -n "invalid opt.serverPort" -- server/WWebApi.mjs` |
| **R-DC-1** 資料通道之選項只由 `server/getOptDataChannel.mjs` 產生: `useDbOrm:true`、`kpOrm`=woItems、`tableNamesExec`=`tableNamesSync`=ds 之全部表、**`methodsExec: ['select']`**(同步所需; 寫入只經 kpFunExt 之 saveApi / deleteApi, 收斂於驗證、funNew、lockSave、kmx, ADR-034); `authorizeExec` 只放行 userId 非空字串之 select, 其餘 `srLog.error({ event:'authorizeExec', err:'errUserNoPermission', tableName, methodName })` 後 `reject('errUserNoPermission')` | `server/getOptDataChannel.mjs`; `server/WWebApi.mjs` 以展開方式交給 WServHapiServer | 已套(2026-10-14); 守 `test/unit-dataChannel.test.mjs`(evem 建構 w-serv-webdata 伺服端: select 放行; insert / save / del 不存在; userId 空拒絕並記 log)、`test/api-dataChannel.test.mjs`(真後端: getFuncList 不含寫入、直打 `apis.save` 失敗且 DB 不變、`apis.select` 回 seed 筆數) | `git grep -n -E "methodsExec\|authorizeExec\|useDbOrm" -- server`(只在 `getOptDataChannel.mjs`) |
| **R-SYNC-1**【2026-10-23 api-run04, ADR-046 更新: 檢核對象改為 `srcKey` 值(以 `{ id: srcKey }` 形狀傳入 `checkRowIds`); 外部不得送 `id`(列帶 id → `idNotAllowed`); 下文 (a)(b)(c) 適用於 srcKey, (d)「不屬他群組」與 `pickRowIds`／`String(id)` 跨群組查詢隨「以 id 代替 srcKey」之相容移除(srcKey 之命名空間為各 group 自己, 他 group 同值不衝突); 以下舊文留作歷史】 `/syncAndReplaceTabs` 之逐列檢核全部在 `delAll` 之前: ①每列為物件 ②b64 還原後必填(name / url)非空 ③主鍵(`server/checkSyncRows.mjs` 之純函數): 有給之 id(非空字串或**有限**數字; NaN、±Infinity 視為未給, 同 w-serv-orm 1.1.11)須 (a) `clearXSS` 不改寫(同 w-serv-orm `getMapOrm.mjs` 之 `getItemsIdXSS` 判準) (b) UTF-8 ≤ 1978 位元組(取自 LMDB 鍵長上限) (c) 同批不重複 (d) 不屬他群組(資料庫中同 id 之列 group 不同; 以 `select({ id: { $in: ids } })` 查); **主鍵一律以 `String(id)` 正規化**: w-serv-orm 1.1.11 起字串型 id 欄之有限數字主鍵於 procOrm 之寫入、刪除與查詢條件一律以其字串形式處置(123 存為 '123'、回應之 id 為 '123'), 故 123 與 '123' 為同一主鍵; 跨群組查詢以 woItems 直呼(不經 procOrm 之轉型), 故 `pickRowIds` 一律回傳 `String(id)` 並以字串去重(2026-10-14 定案, 依 w-serv-orm 之 `建議w-web-api調整.md`; 原載「保守作法、主鍵語意待確認」作廢; 修改前 pickRowIds 保留數字使數字主鍵之跨群組同鍵漏判); 空 id(`''` / 未給)照常由 w-serv-orm 補; 任一違反 → `errRowInvalid`, srLog 記 index / field(`id`) / reason(`xss` / `bytes` / `dup` / `group`), 既有資料不動. 成功回應之 msg(procOrm insert 之回傳)中數字主鍵之 id 為字串(對外行為變更, README Behavior notes、ADR-038) | `server/syncApis.mjs`(2026-10-23 自 `WWebApi.syncAndReplaceTabs` 移入; 規則改適用於來源鍵 `srcKey`〔2026-10-23 run04 起不再有「無則 `id`」〕, 之後於「有效來源鍵」之差異同步); `server/checkSyncRows.mjs` | 已套(2026-10-14; 數字主鍵之字串化同日依 w-serv-orm 1.1.11 改; 回應於 2026-10-23 改為四類計數, 數字主鍵「回應之 id 為字串」不再成立——以庫內查詢驗); 守 `test/unit-syncRows.test.mjs`(純函數各分支, 含 1978 / 1979 位元組與中文 659 / 660 字邊界、NaN／±Infinity 視為未給; run04 已移除 `pickRowIds` 及其案)、`test/api-http.test.mjs` 逐列檢核(四種違反各一案: errRowInvalid 且群組列數不變; 1978 位元組之 id 與不帶 id 之列照常寫入; 數字主鍵存為其字串形式且回應之 id 為字串、跨群組同鍵(數字與其字串形式)皆拒——run04 已改寫為 srcKey 版: 標記／超長／同批重複／恰 1978 位元組、數字 srcKey 拒收、srcKey 與他群組某列 id 同值不配對、I13 缺 srcKey／只送 id／並送／混批) | `git grep -n "checkRowIds\|rejectRow(" -- server/WWebApi.mjs` |
| **R-ERR-1** procOrm / ORM 之失敗字串不外露給前端與外部呼叫端: 寫入類(save / insert / del / delAll) → `saveWriteFail`、讀取類(select) → `getDataError`; 原字串(w-serv-orm 之英文訊息, ≤ 200 字)或 Error 之 `pickErrName` / `pickErrCode` 入 srLog(`orm` 欄); 本套件自身之 key(如 lockSave 之 `saveInProgress`)不經此映射 | `server/ormErrKey.mjs`(單一實作); 使用點: `procApis`(saveApi / deleteApi / getApisList 之 procOrm)、`syncAndReplaceTabs`(查他群組之 select → getDataError; delAll / insert → saveWriteFail)、`getOptDataChannel` 之 operOrm | 已套(2026-10-14); 守 `unit-procApis`(save / del 失敗回 saveWriteFail 並記 log、占位仍釋放; getApisList 失敗回 getDataError、Error 只記名稱)、`unit-dataChannel`(select 失敗回 getDataError) | `git grep -n "ormFail(" -- server`(應涵蓋上列使用點) |
| **R-RES-1** `WWebApi` 回傳物件之 `stop()` 依序: w-serv-hapi 之 stop → `cst.clear()` → woItems 之 `closeAll()` → `srLog.clear()`; 可重複呼叫(回同一 promise); 建構於資源建立後失敗(WServOrm、WServHapiServer 等)時, catch 內釋放已建立者再原樣拋出. 目的: 呼叫 stop 或建構失敗後, 行程不被本套件之計時器、LMDB、log worker 撐住 | `server/WWebApi.mjs`(建構子尾段與 catch) | 已套(2026-10-14; 釋放步驟之錯誤以 `error` 事件發出(wsemi `evEmit`, 監聽器自身拋錯亦隔離)、不中斷後續步驟); 守 `test/unit-wwebapi-lifecycle.test.mjs`(子行程: 資料表 ORM 不可監聽 change → WServHapiServer 建構拋錯 → WWebApi 原樣拋出且子行程自行結束)、`test/api-lifecycle.test.mjs`(子行程以 8550 啟動 → HTTP 冒煙 → stop → 埠釋放且子行程自行結束; 另一案: ORM 之 close 拒絕且 error 監聽器拋錯 → stop 仍 resolve、子行程仍自行結束) | `git grep -n "closeAll\|cst.clear()\|srLog.clear" -- server/WWebApi.mjs` |
| **R-PROC-1** 本套件與參考部署(`srv.mjs`)不註冊 `process.on('unhandledRejection'\|'uncaughtException')`; 未處理之 rejection 依 Node 預設終止行程, 重啟交行程管理器(README 與 srv.mjs 註解載明; w-serv-hapi 1.1.6 起亦不代為註冊) | `server/`、`srv.mjs`、`README.md` | 文件化(設計事實) | `git grep -n "process.on(" -- server srv.mjs`(應為空) |

## 打包後之可用性(對照 ADR-039; X1; 2026-10-14, 與 w-web-sso / w-web-perm 同一設計)

規則先於程式: 本節為 X1 實作之依據. 會被打包之範圍＝`toolg/gDistRollup.mjs`(w-package-tools `rollupFile`, format umd, fdSrc `./server`, fn `WWebApi.mjs`)所及: `server/` 與其 import 到之 `src/schema/`(含 `src/schema/tables/apis.mjs` 回引之 `server/filePathToCode.mjs`), 及未列 external 之相依.

| 規則 | 站點全集 | 判準 | 盤點指令 |
|---|---|---|---|
| **R-PKG-1** 打包範圍內之可執行碼頂層不得宣告 `__filename` / `__dirname`(rollup umd 把 `import.meta.url` 換成引用 `__filename` 之墊片且避讓名單不含該名, 本模組或同一 bundle 內任一模組之頂層同名宣告使載入即 TDZ), 亦不得改用 `import.meta.dirname` / `filename` / `resolve`(umd 換成 `undefined`); 以模組位置定位檔案者一律於**首次使用時**解析並快取(`import.meta.url` 只在函數內求值), 解析順序為 `server/staLogs/resolveShellWorker.mjs` 之 (a) 由本模組位置往上找最近之 `package.json`, name 為 `w-web-api` 且其下 `server/staLogs/staLogsCore.shellWorker.mjs` 存在者(最近者名稱不符即不再往上) → (b) `createRequire(本模組位置).resolve('w-web-api/server/staLogs/staLogsCore.shellWorker.mjs')`(被下游再打包) → (c) 同 (b) 以 `process.cwd()` 為基準 → (d) 拋可讀錯誤(含套件名、相對路徑、已試之位置); `runWorker` 解析失敗時 reject 該錯誤而不 spawn, 成功結果快取、失敗不快取; 前提: `.npmignore` 未排除 `server/`(已安裝時 worker 檔存在), 套件無 `exports`(深層路徑可解析)——兩者有變須同步改本規則 | 以模組位置定位者: `server/staLogs/staLogsCore.callWorker.mjs`(`getShellWorkerPath`、`runWorker`; 原 `:8-11` 頂層 `__filename` / `__dirname` 與載入時之 `fpWkDefault`). 刻意不套(非模組位置): `server/maskLog.mjs`、`server/procProxy.mjs` 之 `new URL(…)`(解析使用者網址); `server/WWebApi.mjs` 之 `pathStaticFiles='dist'`、`npmPathStaticFiles='./node_modules/w-web-api/dist'`、logFd、fpTableTags、uploadTemp(皆 cwd 相對, 與打包無關). bundle 內相依: w-syslog 1.0.32 `src/WSyslog.mjs` 同型——2026-10-14 已升 1.0.33(其 `import.meta.url` 只在函數內, 同一設計), dist 冒煙通過(ADR-040, `tmp/run05/dist-smoke.mjs` 之作法); 其餘(w-serv-hapi、w-converhp、w-serv-webdata、w-serv-broadcast、w-sync-webdata、w-serv-orm、w-data-collector、wsemi、lodash-es)之 src 無 `import.meta` 與頂層 `__filename` | 已套(2026-10-14); 守 `test/unit-resolveShellWorker.test.mjs`(RSW-001~007 假套件佈局於 `test/_tmp/unit-resolveShellWorker/`: (a) 名稱相符之源碼與 dist 位置、(a) 名稱不符而旁有同名檔不採用、(a) 相符但缺檔、(b) 模組解析、(c) 僅 cwd、(d) 注入之全失敗、fpSelf 無效; RSW-REAL-001 / 002 本 repo 之 src 與 dist 位置、快取、runWorker 預設定位跑真 worker; SITE-X1-001 / 002 站點不變式)、既有 `unit-staEvent-golden`(WORKER-*)、`e2e-stainfor`. 「由 src 建出 dist → 載入 → 實際觸發一次統計」之測試依賴 w-syslog 1.0.33, 待主控續接時補 | `git grep -n -E "__filename\|__dirname\|import\.meta\|fileURLToPath\|new URL\(\|new Worker\(\|createRequire\|require\.resolve\|process\.cwd\(\)" -- server src/schema`(新檔入版控前加 `--untracked`); bundle 內相依: `grep -rln "import\.meta\|^let __filename" node_modules/<相依>/src` |

## 權杖外洩防護(對照 ADR-033; w-web-sso ADR-068 之 W / M / K 契約)

| 規則 | 站點全集 | 判準 | 盤點指令 |
|---|---|---|---|
| 注入函數(`getUserByToken` / `verifyClientUser` / `verifyAppUser`)只經 `wrapInjected`: srLog 初始化後以包裝版重新指派, 其後才有呼叫(2026-10-14 起刪去第四個注入函數 `opt.getUserById`: w-serv-orm 1.1.9 已移除該設定, 本套件改以 R-ORM-1 於建構時拒絕; 「srLog 須先於 WServOrm」之理由隨之作廢, ADR-033 #5、ADR-038) | 包裝: `server/WWebApi.mjs` 三行 `= wrapInjectedLog(`; 呼叫點 4: `findTokenUser`、`getAndVerifyClientUser`、`getAndVerifyAppUser`、`getUserIdByToken`(行號以盤點指令取, 不寫死) | 已套(呼叫點行號皆大於包裝行; 包裝行只引用不呼叫; 建構子前段只 `isfun()` 不呼叫) | `git grep -n -E "\b(getUserByToken\|verifyClientUser\|verifyAppUser)\(" -- server/WWebApi.mjs` 之每筆行號須大於 `git grep -n "= wrapInjectedLog(" -- server/WWebApi.mjs` 之最末一筆 |
| 上游同步拋錯 / reject 視同否定結果(getUserByToken → `null` 等同查無; verify 系 → `false` 等同無權限); 失敗記 `srLog.warn({ event:'inject-<名>-fail', ...describeUpstream })`, 只含白名單 key 或 `upstreamType` / `upstreamName`, 絕不記原文 | `server/wrapInjected.mjs` | 已套; 守 `test/unit-wrapInjected.test.mjs` WRAP-001~008、`test/api-tokenLeak.test.mjs` | — |
| **白名單同步點**: `ksUpstreamKey` 須與 w-web-sso K 契約之 14 key 完全一致(sso 增刪 helper 之 reject key 時同步改此處與測試複本) | `server/wrapInjected.mjs` 之 `ksUpstreamKey` ↔ w-web-sso `spec/設計要點與取捨.md` ADR-068 對照表 / `server/procLang.mjs`; 測試複本 `test/unit-wrapInjected.test.mjs` 之 `KS` | 已套(2026-09-24 逐一核對 14 個) | `git grep -n -A6 "let ksUpstreamKey" -- server/wrapInjected.mjs` |
| 查無使用者單一規則: token 非字串或回傳非非空物件 → `errUserNotFound`(瀏覽端 / 連線閘 / 應用端共用 `findTokenUser`, `p.checkToken` 呼叫 `getTokenUser`); 資料通道 `getUserIdByToken` 查無 → `srLog.error` 後 reject `errUserIdMissing`(fail-closed, 不執行函數) | `WWebApi.mjs` `findTokenUser`(:384)、`getTokenUser`(:405)、`p.checkToken`(:419)、`getAndVerifyAppUser`(:450)、`getUserIdByToken`(:978)(行號 2026-10-14 隨 ADR-038 更新) | 已套; 守 `api-http`「非法 token」兩案、`api-tokenLeak` E1 / E4 / E5 / E6 | `git grep -n "errUserNotFound\|errUserIdMissing" -- server/WWebApi.mjs`(`errUserNotFound` 只在 `findTokenUser`; `errUserIdMissing` 只在 `checkUser`(欄位缺 id)與 `getUserIdByToken`) |
| 印權杖只經 `server/maskLog.mjs`(M 契約; `maskTok` / `maskQuery` / `maskUrl` 須與 w-web-sso `server/srLog.mjs` 之 `maskToken`、`src/maskUrl.mjs` 逐字同輸出, 改動四 repo 同步); 錯誤只記 `pickErrName` / `pickErrCode`, 不記 message | console 16 處: 經遮罩 11(`WWebApi.mjs:395,723,724,734,864,865,875,893,903,955,988`)、字詞只在字串常值內 5(`:396,725,866,956,989`); 註解內已停用站點 8(`:767,768,778,814,815,825,946,950`, 行號 2026-10-14 重盤; 刻意不套: 既有死碼, 恢復時須改經 maskTok); `srv.mjs` SSO 例外印 `pickErrName` / `pickErrCode`; `srv.mjs` error 事件 console(修正後只收到 key) | 已套 | `git grep -n -E "console\.(log\|error\|warn\|info)\(.*,\s*[^,]*\b(token\|authorization\|query\|headers\|referer\|referrer)\b" -- server srv.mjs \| grep -v -E ":[0-9]+:\s*(//\|\*)" \| grep -v -E "maskTok\(\|maskQuery\(\|maskUrl\("`(應為空); 全站點: 同指令去掉最後一段 |
| srLog 之欄位不含權杖與上游原文 | srLog 19 處(2026-10-14 重盤, +2): `inject-*`(`WWebApi.mjs:262`, describeUpstream)、`wrapErrLog` / `wrapRouteErrLog`(:293 info / :297 error / :312, err 只收 key: 注入函數已包裝, ORM 失敗已改回語系鍵, 其餘 reject 皆字面 key)、verifyClientUser / verifyAppUser / api 成功(:444 / :466 / :739 / :915, userId)、逐列檢核(:589, keyTable / group / index / field / reason)、verifyConn(:957 / :971 / :975)、getUserIdByToken(:990)、**authorizeExec**(`getOptDataChannel.mjs:48`, tableName / methodName)、**ORM 失敗**(`ormErrKey.mjs:36`, err 為 key; `orm` 欄: 字串截 200 字——w-serv-orm 之失敗字串只列失敗筆之主鍵(`node_modules/w-serv-orm/src/getMapOrm.mjs:getMsgFail`), 不含欄位值; 非字串只記型別 / 名稱 / 代碼, 不記 message; R-ERR-1)、procProxy(:111 標頭名＋原因、:252 轉址訊息之網址已經 maskUrl、:259 名稱＋代碼)、staLogsCore(:382 檔案錯誤) | 已套 | `git grep -n -E "srLog\.(error\|warn\|info\|fatal\|debug)\(" -- server \| grep -v -E ":[0-9]+:\s*(//\|\*)"`(逐處對照本欄; 新檔入版控前須加 `--untracked`, 否則漏掃 `getOptDataChannel.mjs` / `ormErrKey.mjs`) |
| message 之使用點不含權杖來源 | `WWebApi.mjs:746,922`(路由回應之 Error→message: 注入函數已包裝、ORM 失敗已改回語系鍵(R-ERR-1), 能到此者只剩非預期例外; 行號 2026-10-14 更新)、`procProxy.mjs:252`(轉址訊息於 :176-189 以 maskUrl 組成)、staLogs 3 處(檔案 / worker 錯誤) | 已套 | `git grep -n -E "\.message\b\|'message'" -- server srv.mjs \| grep -v -E ":[0-9]+:\s*(//\|\*)"` |
| 代打(procProxy)之第三方憑證不入 srLog: 標頭逐對 try/catch 只記名稱(名稱本身非法時 maskTok)與固定原因; 轉址網址經 maskUrl; fetch 例外只記 `err` / `errName` / `errCode`; 回前端 err-key 不變 | `server/procProxy.mjs` | 已套; 守 `unit-procProxy` PROXY-006 / 007 / 017a~c / 018~023 | `git grep -n "srLog.error" -- server/procProxy.mjs` |
| 推送(provideTabs)之 fetch 例外 reject 只含名稱與代碼之新 Error(不帶原 message、不掛 cause); 非 2xx 維持原訊息 | `server/provideTabs.mjs` | 已套; 守 `unit-provideTabs` PROVIDE-001~004 | — |
| 前端 Referer 只送 origin | `public/index.html` `<meta name="referrer" content="strict-origin">` | 已套(使用者視角驗收: `/api/*` 之 Referer 皆為 origin) | `git grep -n 'name="referrer"' -- public/index.html` |
| 範例與參考部署不印權杖值 | JSDoc `WWebApi.mjs:113`、`README.md` 同段、`srv.mjs` | 已套 | `git grep -n "console.log('invalid token'" -- server README.md`(不得帶第二參數) |
| 測試權杖只在非 production | `srv.mjs` 之 `'{token-for-reject}'` / `'{token-for-verify-throw}'`(與 `'sys'` 同守門) | 已套 | `git grep -n "token-for-reject\|id-for-verify-throw" -- srv.mjs`(條件行須含 `NODE_ENV !== 'production'`) |

測試對照: `test/unit-maskLog.test.mjs`(M 契約測資全表, 含 w-web-sso 同一組測資)、`test/unit-wrapInjected.test.mjs`、`test/unit-procProxy.test.mjs`(PROXY-006 / 007 / 017a~c / 018~023)、`test/unit-provideTabs.test.mjs`、`test/api-tokenLeak.test.mjs`(C1 回應＋本次 srLog 檔; 後端以 `genTempSettings({ logFd })` 指向 `test/_tmp/_logs-api-tokenLeak` 並於 after 還原與刪除)、`test/api-http.test.mjs`(查無 key)。指令: `npx mocha --no-parallel test/<檔> --timeout 180000`。stdout(C3 / C4)不在 mocha 內(harness 以 `stdio:'ignore'` 起後端), 由使用者視角驗收腳本以真後端擷取 stdout 驗證。

## 外部同步契約(對照 ADR-031)

| 規則 | 站點全集 | 判準 | 盤點指令 |
|---|---|---|---|
| 外部同步(`provideTabs` → `/syncAndReplaceTabs`)只推送 API 描述資料欄位(`ks_apis` 白名單); 認證不同步——各服務獨立, 認證靠自身 token 或 SSO 與 perm, `tokens`／`authType`／`authConfigJson` 與測試設定欄位(`testBaseUrl`／`default*Json`／`contentType`)由本站編輯表單管理, 時間欄位由 ORM 補 | `server/provideTabs.mjs` `ks_apis`; `WWebApi.syncAndReplaceTabs`(`ltdtmapping` 補 `''`) | 推送端已套;接收端於 2026-10-23(ADR-043)已套:匯入不寫「本系統擁有」欄位(`fieldsLocal`),既有列維持庫內值(修 inv01 探測 C4b;原每次同步以 `ltdtmapping` 補 `''` 後 `delAll`＋`insert` 清空);新增列初始為 `''` | `git grep -n "ks_apis" -- server/provideTabs.mjs`(不得含 tokens／auth*／default*Json／testBaseUrl／contentType) |

### R-IMPORT-01 外部匯入(原則 11):本系統只提供匯入管道,依外部自訂之來源鍵差異同步(主控 2026-10-22 依使用者裁示寫入)

- **規格(真理源)**:`C:\opensrcOper\dspec\外部匯入之定義與機制.md`;上位原則 `C:\opensrcOper\sgud\proc\process_principle.md` 第 11 條.本條取代 inv01 之「方案 A」(由本套件以 `[levels, method, url, version]` 推斷身分)與「同步維持 `delAll`＋`insert`」——識別由外部定義,本套件不推斷.
- **規則**:
  - 入口 `POST /syncAndReplaceTabs?keyTable=apis&token=`(app 權杖,須具 `syncAndReplaceTabs` 權限).
  - 本文 `{ group, rows }`,`rows`＝該 group 之完整清單;每列帶外部自訂之來源鍵 `srcKey`(group 內唯一且穩定);內部 `id` 由本系統產生.
  - 於 `apis` 表鎖(與 `saveApi`/`deleteApi` 同一把)內,以 `srcKey` 比對庫內該 group:
    - 新增:配新 `id`.
    - 刪除.
    - 修改:保留 `id`.
    - 不變:不寫.
    - 不再 `delAll`＋`insert`.
  - **欄位歸屬**:
    - 外部擁有:`ks_apis` 白名單之描述欄位.
    - 本系統擁有:`tokens`、`authType`、`authConfigJson`、`testBaseUrl`、`default*Json`、`contentType`.匯入一律不寫,修 C4b.
    - 系統欄位:`timeCreate` 只於新增時由伺服器寫,修 A5.
  - 必填 `name`、`url`;`base64:` 還原保留;R-SYNC-1 之主鍵字元/長度/同批不重複規則改適用於 `srcKey`.
  - 整批驗證、全有或全無:缺/空/`null`/重複 `srcKey`、觸及他 group、空批次、外部欄位型別不合(物件/陣列/`NaN`)、必填 `name`/`url` 於字元清理後為空 → 拒收、零寫入.
  - 回 `{ nAdd, nUpdate, nDel, nSame }`;錯誤回固定鍵.
  - **不提供呼叫端相容(2026-10-23 使用者裁示, api-run04, ADR-046;規格 §9、驗收 I13／I15;取代 run01 之「相容」條款)**:
    - `srcKey` 即刻必填:任一列缺 `srcKey`、為 `null`／空字串／非字串(含只送 `id`)→ 整批拒收 `errRowInvalid`(＝規格之 `srcKeyInvalid`,本套件沿用既有鍵),零寫入、零 ORM 呼叫、不取鎖;不以 `id` 代替.
    - 外部送 `id`(任一列有自有屬性 `id` 且值不為 `undefined`,含 `null`／空字串,即使同時有合法 `srcKey`)→ 整批拒收 `idNotAllowed`(新鍵,eng+cht),零寫入.檢查優先序:任一列之欄位／來源鍵缺陷(外部欄位型別、必填、`srcKey` 缺／空／非字串／含標記／孤立代理字元、超過 1978 位元組、同批重複)恆先於 `idNotAllowed`(整批通過全部檢核後才報第一個帶 `id` 之列).
    - 無「兩者皆無之列每次新增」、無警告事件 `syncAndReplaceTabs-idAsSrcKey`／`-noSrcKey`、無 `delAll`＋`insert`.
    - **一次性資料遷移(不是呼叫端相容)**:見下「資料遷移」.
- **刪除防護**:本條為預期功能;未完成之匯入程式與外部端輔助 `provideTabs` 不是死碼,不得以「無引用」刪除(opensrcOper 帳本 G8).
- **狀態:已實作(2026-10-23, api-run01, 排程第 112 項, ADR-043)**:`server/syncApis.mjs`(`createSyncApis`; `WWebApi.syncAndReplaceTabs` 只留陣列層檢核後呼叫)——`srcKey` 差異同步、`apis` 表鎖(與 `saveApi`/`deleteApi` 同一把)、本系統擁有欄位不寫(契約 `src/schema/contracts/apis.mjs` 之 `fieldsLocal`)、`timeCreate` 只於新增時由 ORM 寫、失敗以快照補償(消除 ADR-016 非原子)、整批驗證全有或全無、回 `{ nAdd, nUpdate, nDel, nSame }`.
- **狀態:run04(2026-10-23, ADR-046)已移除 run01 之相容路徑**(原:列無 `srcKey` 而有 `id` 以 `id` 代替〔新增列沿用該 id〕並記警告;兩者皆無之列每次新增〔run01 外審後偏離主控建議之「整批 delAll＋insert」:外審 sol#5 實測該作法於混批時清掉有鍵之列的本系統擁有欄位並換 id〕;已不存在):`server/syncApis.mjs` 無 `source` 分支、無 `selectByIds`／`pickRowIds`(連同 `checkSyncRows.pickRowIds` 移除)、無 `idConflict`／`ctrl` 原因;新增列之內部 `id` 一律 `genIDSeq()`.
- **資料遷移(一次性,不是呼叫端相容;run01 既有行為於 run04 確認並保留,規格 §9、I15)**:
  - 庫內同 group 之列無 `srcKey`(缺欄或空字串;舊同步寫入或 1.1.14 相容期所寫)者以其 `id` 為有效來源鍵.
  - 批次 `srcKey` 等於其 `id` → 視為同一列,於 `apis` 表鎖內補 `srcKey`:`id` 不變、本系統擁有欄位與 `timeCreate` 不動;內容相同只寫 `{ id, srcKey }`、不計 `nUpdate`(計 `nSame`);內容不同為修改(計 `nUpdate`)並同時補鍵.
  - 其後只認 `srcKey`:已有 `srcKey` 之列不再以 `id` 配對(批次 `srcKey` 恰等於某列 `id` 但該列已有 `srcKey` → 不配對,另增新列).
  - 對不上者依差異同步:批次無者刪除(刪除無 `srcKey` 之列記 warn `syncAndReplaceTabs-delNoSrcKey`)、批次有而庫無者新增.
  - 有效來源鍵重複(例 `srcKey='x'` 與 `id='x'` 之無鍵列並存)無法唯一配對 → `errRowInvalid`(reason `dbDuplicate`),不靜默刪改(規格 §5 第 4 步).
  - README Upgrade Notes〈Breaking change since 1.1.14〉載明;無遷移腳本.
- **本站自行決定(依原則, 已入 decisions.tsv phase `api-run01`)**:
  - `srcKey` 空字串/非字串 → 拒收(I7); `group` 含會被 ORM 字元清理改寫之標記 → `errGroupInvalid`(否則寫入後無法以同一 group 再選出而破壞冪等).
  - 新增列之本系統擁有欄位初始為空字串(同改造前 `ltdtmapping` 補 `''`, ADR-031 測試分頁語意不變), `isActive` 為 `'y'`(同 `funNew`; 改造前同步寫 `''`).
  - 同 group 內後台自建之列(`srcKey` 空)以其 `id` 為有效來源鍵, 批次未含者於匯入時被刪(同改造前 `delAll({ group })`; `group` 為外部來源統一管理鍵).
  - 錯誤鍵沿用既有 `errRowInvalid`/`errRowsInvalid`/`errGroupInvalid`/`saveWriteFail`/`getDataError`, 另增 `idNotAllowed`(run04); 原因(`reason`: `xss`/`bytes`/`dup`/`dbDuplicate`/`srcKey`/`type`/`unicode`)只入 srLog, 不回顯值(run04 起無 `group`/`idConflict`/`ctrl`: 隨以 id 代替之相容移除).
  - **外審後補強(2026-10-23, sol 16 項屬實者, ADR-043 決策 8)**: 來源鍵不得為孤立代理字元、`srcKey` 不得含任何 HTML 標記(含白名單標籤 `<b>`)(「以 `id` 代替者不得以控制字元起首」隨相容移除); 外部欄位:有限數字/布林轉字串存入、孤立代理字元正規化為 U+FFFD; `$in` 補償分批 1000(既有主鍵衝突之 `$in` 查詢隨相容移除); 補償依階段限定範圍、逐筆檢查 `ok:0`、回讀驗證; ORM 失敗原文入 log 前遮蔽 `id[...]`(遷移前既有列之 id 可能即外部來源鍵); `saveApi`/`deleteApi` 鎖內讀取失敗回 `getDataError`.
- **刪除防護(維持)**:`provideTabs`(外部端輔助, 白名單 `ks_apis` 含 `srcKey`、**不含 `id`**;缺 `srcKey` 之列於呼叫端即 reject、不送出,run04)與匯入程式不得以「無引用」刪除.
- **驗收**(規格第 10 節 I1–I15 → 測試;run04 增 I13 改為拒收、新增 I15):
  - I1 `api-import`「I1／V2／E8」、`unit-syncApis` U05; I2 `api-import` I2、U04; I3 `api-import` I3; I4/I5 `api-import` I4／I5 + A5; I6 `api-import`「I6／C4b」、「I6 補」、U03; I7 `api-import` I7、`unit-syncApis` U01; I8 `api-import` I8、U01; I9/I10 `api-import` I9／I10、U04; I11 `api-import` I11、`api-concurrency` A1／I11; I12 `api-import` I12(含補償失敗)、`unit-syncApis` U09/U10; I13(缺 `srcKey`／只送 `id`／並送／混批 → 拒收)`api-import` I13、`api-http` I13、`unit-syncApis` U01／U11、`unit-provideTabs` PROVIDE-005～008、`unit-contract` C08; I15(一次性遷移)`api-import` I15／I15 補、`unit-syncApis` U06／U07、`api-concurrency` V5、`api-externalRows`「混雜資料」、`e2e-external` E2E-017／018(真實 user path); I14 `api-import` I14 + `api-http`(缺 token/非法 token/未列 keyTable).
  - 另: 轉型 `base64:`/clearXSS 冪等/`order` 型別(`api-import`「轉型與入口」)、身分欄 group 由請求決定、任意欄位名(`length`/`constructor`/含 `__proto__` 之本體在 hapi 層即 400).
- 盤點:`git grep -nE "delAll\(" -- server`(應 0 筆: 外部匯入全程不 delAll); `git grep -n "srcKey" -- server src`(應含契約、schema、syncApis、provideTabs、procApis 之 serverOnly 說明); **run04 不提供相容之站點全集**(三條盤點皆應 0 筆非註解命中): `git grep -nE "idAsSrcKey|noSrcKey|pickRowIds|selectByIds|itemsIdNew|source ===" -- server`; `git grep -nE "'id'," -- server/provideTabs.mjs`(白名單不含 `id`); `git grep -n "hasId" -- server/syncApis.mjs`. 判準:已套＝0 筆(僅註解提及);相容分支復活即未套(變異驗證見 api-run04 報告).
- **2026-10-23 api-run04 追加**: 見上〈不提供呼叫端相容〉與〈資料遷移〉;`tests`: `unit-syncApis`／`unit-provideTabs`／`unit-contract` C08／`unit-syncRows`／`api-import`／`api-http`／`api-syncIter`／`api-externalRows`／`api-concurrency` V5／`e2e-external` E2E-017·018／`e2e-concurrent` E2E-008 末段.
- **2026-10-23 api-run02 追加**: ①匯入刪除 `srcKey` 為空之列(混雜列、升版前舊同步或相容期所寫之無鍵列)時記 warn `syncAndReplaceTabs-delNoSrcKey`(原則 3 不得靜默; 行為本身不變, run01 D6); ②後台對外部列之守門見 R-EXT-LOCK-01(原「待裁示」已由使用者裁示之原則 5 定案並實作); ③匯入不受 `lockExternalRows` 影響.

### R-ORMFAIL-01 ORM 寫入之逐筆 `ok:0`(resolve、不 reject)視為失敗:整批失敗、補償還原、回 `saveWriteFail`(R18; 規格 外部匯入 §5 第 6 步、驗收 I12; 2026-10-23, api-run05, ADR-047)

- **規則**:
  - 任何對 ORM 之寫入,單筆失敗(該筆 `ok:0`)不得被當成成功:本套件寫入一律經 `procOrm`,其 `save`／`del` 逐筆檢查並 reject(w-serv-orm `getMapOrm.mjs`),本套件以 `rejectWrite`／`failOrm` 轉 `saveWriteFail`(R-ERR-1),匯入並補償還原至匯入前;**不得**在本套件另寫「檢查 procOrm 回傳 `ok:0`」之碼(insert／save 回傳只有 `[{id}]`、del 之失敗已先 reject,該檢查不可達).
  - 本套件**直呼 ORM**(不經 procOrm)之寫入,回傳須逐筆檢查:唯一站點為補償 `restoreAll` 之 `woItems[tab].del`(`hasFailItem`),且補償完成後回讀驗證新增列已不在、原列皆在.補償 `insert` 原列之回傳不逐筆檢查(w-orm 契約:insert 恆 `ok:1` 或整批 reject),由回讀驗證兜底.
  - 已知上游缺口:`procOrm` 的 `insert`(及 `mix` 之 add 步)不檢查 ORM 聚合結果之 `ok:0`;w-orm-lmdb 之 insert 不會回 `ok:0`,現行參考後端不可觸發;建議書 `agent-out/建議w-serv-orm修正-R18.md`;不繞道,見 `rulebook_gaps.md`.
- **站點全集**(`server/` 內 ORM 寫入呼叫,2026-10-23 盤點共 8 處):

| 站點 | 呼叫 | 逐筆 `ok:0` 之處置 | 判準 |
|---|---|---|---|
| `procApis.mjs:232` saveApi 修改 | `procOrm save` mustExist | procOrm 逐筆檢查 → reject → `saveWriteFail` | 已套(`api-itemFail` saveApi 修改) |
| `procApis.mjs:270` saveApi 新增 | `procOrm save` | 同上 | 已套(`api-itemFail` saveApi 新增) |
| `procApis.mjs:307` deleteApi | `procOrm del` mustExist | 同上 | 已套(`api-itemFail` deleteApi) |
| `syncApis.mjs:370` 匯入新增 | `procOrm insert` | **procOrm 不檢查聚合 `ok:0`** | 上游缺口,刻意不繞道(`api-itemFail` insert 兩案:已知簽章 pending) |
| `syncApis.mjs:374` 匯入修改 | `procOrm save` mustExist | procOrm 逐筆檢查 → reject → 補償 | 已套(`api-itemFail` save 兩案) |
| `syncApis.mjs:378` 匯入刪除 | `procOrm del` mustExist | 同上 | 已套(`api-itemFail` del 兩案) |
| `syncApis.mjs:269` 補償刪除 | `woItems[tab].del`(直呼) | 本套件 `hasFailItem` → 補償失敗 → 記 `syncAndReplaceTabs-restoreFail` | 已套(`api-itemFail` 補償 ok:0 案) |
| `syncApis.mjs:275` 補償重插 | `woItems[tab].insert`(直呼) | 不逐筆檢查;回讀驗證兜底 | 刻意不套(契約:insert 無逐筆 `ok:0`) |

- **盤點指令**:`git grep -nE "procOrm\([^)]*'(insert|save|del|delAll|mix)'|woItems(\[[^]]+\]|\.[A-Za-z]+)\.(insert|save|del|delAll)\(" -- server`(應只有上表 8 處+1 行註解);新增寫入站點必須先入上表並補 `api-itemFail` 案.
- **驗證**:`test/api-itemFail.test.mjs`(埠 8553;`apiServerChild` 之 `failItems` 注入:指定操作之第 k 筆不寫入、其餘筆寫入、該筆 `ok:0` 但 resolve);變異:拿掉 w-serv-orm save／del 之逐筆檢查、補償 `hasFailItem`、`failOrm` 吞錯,皆須被抓到(報告 api-run05).

### R-EXT-LOCK-01 外部列受保護(原則 5「開了外部同步就以外部為主」, 原則 3 收嚴＋提示; 規格 外部匯入之定義與機制.md 第 4、7 節; 2026-10-23, api-run02, ADR-044)

- **定義**:
  - 外部列＝`srcKey` 為非空字串之列(匯入寫入, 後台不可寫); 外部管理之 group＝該 group 內存在外部列者; 混雜列＝外部管理 group 內 `srcKey` 為空之列.
  - 升版前尚未被匯入命中之列(舊同步寫入、1.1.14 相容期所寫之無鍵列)`srcKey` 為空, 無從與後台自建者區分, 視為後台列(不鎖); 2026-10-23(run04, ADR-046)起外部匯入不再產生無鍵列(`srcKey` 必填).
- **規則**(伺服端強制, 表鎖內以新鮮讀取之庫內原列判定; 違規整次拒收、零寫入、`procOrm` 未被呼叫; 判定共用 `src/schema/contracts/externalRows.mjs`):
  1. 外部列不可由後台刪除 → `deleteExternalRowDenied`.
  2. 外部列不可改 `group`、`srcKey` 與外部擁有欄位(`fieldsExternal` 16 欄＝`provideTabs` `ks_apis` 去 `srcKey`／`id`) → `saveExternalRowChanged`; 可改本系統擁有欄位(`fieldsLocal` 8 欄, 含 `tokens`). 「改」＝客戶端帶來之值與庫內不同(缺欄不比; 缺欄／null／空字串同一; 數字與其字串形式同一); 整列原樣送回不算改. 外部列帶來「非空且與庫內不同」之 `srcKey` 亦算改(空值不算——持舊畫面之整列回聲, 列於載入後才被匯入補 `srcKey` 時為空字串, 算改會誤拒「只改 tokens」; 後台列帶來之 `srcKey` 仍不採用也不拒, run01 A7 不變).
  3. 外部管理之 group 不可新增列、不可把列改入 → `saveExternalGroupDenied`(混雜列 group 未改者不攔).
  4. 選項 `opt.lockExternalRows`(預設 `'y'`; 僅 `'n'`／`false` 關閉回 run01 行為; 未知值維持開啟); `getWebInfor` 回 `lockExternalRows` 供前端; 參考部署 `settings.json` → `srv.mjs`. 匯入不受影響.
  5. 與基準比對之先後: 持舊基準者先得 `saveStale`, 持最新基準或不帶基準者得上列拒收鍵.
  6. **檢查之值即寫入之值**(外審 sol 後補強): `group` 須為合法形狀(缺欄/null/合法 Unicode 字串, `isValidGroupValue`; 陣列、數字、布林、物件、孤立代理字元 → `errApiRowInvalid`; 僅選項開啟時檢查); 外部列通過守門後只寫 `id` 與本系統擁有欄位(`pickLocalFields`); 主鍵只讀一次(`let id = row.id` 快照); group 比對用寫入後之值(`normGroup`: clearXSS＋toWellFormed). 判準: 守門讀到之值必須即實際寫入之值, 不得讓等價比較放行後仍原值寫入.
  7. 稽核(`g_auditExternalRows.mjs`)另列「group 非字串之歷史列」(不自動刪除).
- **前端**(`LayoutContent.vue`／`LayoutContentEdit.vue`／`ExtMark.vue`): 樹狀清單外部列鎖頭、混雜列警告(tooltip); 編輯頁外部列上方唯讀說明、13 欄 `readonly`＋方法唯讀框＋標籤鎖頭、刪除鈕 `disabled` 並附 tooltip; 混雜列上方警告但不鎖; 群組欄即時提示並於儲存前擋下(不送出). 平時不渲染(`v-if`), 既有畫面與標準圖不變.
- **混雜資料處置(原則 3)**: 不鎖、不自動刪除; 前端警告、匯入刪除時記 warn、`g_auditExternalRows.mjs` 升版前盤點; 下次匯入行為不變(批次未以 `id` 列入者被刪, 以 `id` 列入者保留並補 `srcKey = id`), README Upgrade Notes 一致.
- **站點全集**(後台寫入入口): `saveApi`(新增、修改)、`deleteApi`; 資料通道只開 `select`(R-DC-1), 無其他寫入入口; 匯入(`syncApis`)為外部入口, 不在守門範圍.
- **盤點指令**: `git grep -n "lockExternalRows" -- server src srv.mjs README.md`; `git grep -nE "isExternalRow|getExternalChanged|isBlockedByExternalGroup" -- server src`(應只在 procApis、externalRows、兩個 .vue); 稽核資料 `node g_auditExternalRows.mjs`.
- **驗收**(測試對應):

| 條件 | 測試 |
|---|---|
| 後台刪外部列被拒 | `api-externalRows`「刪除外部列」、`unit-procApis-external`(deleteApi) |
| 改外部擁有欄位被拒(逐欄窮盡 16 欄＋srcKey) | `api-externalRows`「修改外部列」、`unit-procApis-external`、`unit-externalRows`(getExternalChanged 窮盡) |
| 改本系統擁有欄位可存(8 欄) | 同上; 匯入後保留 |
| 外部管理 group 新增／改入被拒 | `api-externalRows`「外部管理之 group」、`unit-procApis-external` |
| 匯入與新增並行序列化 | `api-externalRows`「表鎖」兩案(兩種先後) |
| 混雜列不鎖、下次匯入行為與提示 | `api-externalRows`「混雜資料」、`e2e-external` E2E-015 |
| 選項 `'n'` 回舊行為 | `api-externalRows`「選項 n」、`unit-procApis-external`(lockExternalRows=false)、`e2e-external` E2E-016 |
| 前端唯讀與提示 | `e2e-external` E2E-013、E2E-014 |

## 呼叫者身分驗證:資料通道連線閘(R-CONNGATE-01; 跨套件規格 `C:\opensrcOper\dspec\w-web呼叫者身分驗證.md` 規則 1~6; 使用者 2026-10-23 裁示〈凡能使用內部函數者一律以 token 驗證呼叫者, 無例外〉; ADR-048, api-run01)

### R-CONNGATE-01 凡可由外部觸及之入口, 除公開入口外一律驗 token; 資料通道之連線閘＝token 認證＋部署方注入之 `verifyClientUser(user, apiType)`

- **規則**:
  - 資料通道(w-converhp 六條路由: `main`、`upload-controller`、`upload-slice`、`download-get-filename`、`download-get-file`、`download`; kpFunExt、表 `select`、系統函數 `[sys:*]` 皆在 `main` 之後)的連線閘 `verifyConn` → `p.checkToken(token, apiType)` → `authToken(token, apiType)`＝①`getTokenUser`(認證) ②部署方之 `verifyClientUser(user, apiType)`(授權; 經 `wrapInjected`, 拋錯／reject 視同 false) ③falsy → reject `'errUserNoPermission'`. 認證在前、授權在後(未通過認證者不呼叫鉤子). `authToken` 為連線閘與執行身分(R-EXECID-01)共用之單一擁有者(api-run02 起).
  - 套件不自訂「誰可用」之細部政策, 但**不得略過部署方之鉤子**; 不提供關閉鉤子之選項. (2026-10-24 api-run01 補: 後台與資料通道另由套件自行限系統管理員〔`isAdmin === 'y'`〕, 鉤子仍先被呼叫、只能再收緊, 見 R-ADMINONLY-01; 此行原「套件不強加管理員政策」之正向案 `tokNonAdmin` 已翻轉為被拒.)
  - 拒絕: w-converhp 回 `permission denied`, 函數不執行、ORM 零操作; 記 `srLog.error({ event:'verifyConn', err, apiType })`(`verifyConn` 之 catch; 授權不通過 `err` 為 `errUserNoPermission`, 認證失敗依原因為 `errTokenNoPermission`／`errUserNotFound`／`errUser…Missing`); 回應與 srLog 不含 token、使用者資料與鉤子拋出之內容; 連線閘之授權步驟不印使用者物件、成功不另記 `verifyClientUser` info(認證步驟 `checkUser` 對欄位不齊之使用者仍 `console.log` 該物件, 屬 ADR-033 既有行為, 未改).
  - 公開入口只限本質上拿不到 token 者: **前端靜態檔**(`GET /{file*}`, w-serv-hapi inert, 內容為建置檔; `index.html` 只注入語系、轉址、子目錄). 本套件無登入、註冊、驗證碼、驗證信等公開端點. 新增公開入口須經主控複審.
  - `GET /api/getUserByToken` 為登入檢查(需 token), `from='getUserByToken'`; `POST /syncAndReplaceTabs` 為外部應用入口(需 token, `verifyAppUser`, `keyTable` 白名單); 兩者不經 `verifyConn`.
- **站點全集**(2026-10-23 盤點; 對應 ADR-048 入口盤點表):

| 站點 | 認證(token) | 授權鉤子 | 判準 |
|---|---|---|---|
| `GET /{file*}` 靜態檔 | 無(公開) | 無 | 刻意不套(公開入口) |
| `GET /api/getUserByToken` | `getAndVerifyClientUser` → `getTokenUser` | `verifyClientUser(user,'getUserByToken')` | 已套(`api-tokenLeak` E1、`api-connGate`「其他入口之行為不變」) |
| `POST /syncAndReplaceTabs` | `getAndVerifyAppUser` → `findTokenUser` | `verifyAppUser(user,'syncAndReplaceTabs')` | 已套(`api-tokenLeak` E4、`api-http`) |
| `POST /api/main` × kpFunExt 6 + `apis.select` + `[sys:*]` 3 | `verifyConn` → `p.checkToken` → `getTokenUser` | `verifyClientUser(user,'main')` | 已套(`api-connGate` 逐函數 13 案＋連呼＋對照組) |
| 其餘五條 w-converhp 路由(`ulctr`、`slc`、`dwgfn`、`dwgf`、`dw`) | 同上 | `verifyClientUser(user, <apiType>)` | 已套(`api-connGate` 六路由 × 3 案); 本套件未註冊上傳／下載監聽, 通過閘亦不受理 |
| `apis.insert`／`save`／`del` | — | — | 未開放(`methodsExec:['select']`, R-DC-1, `api-dataChannel`) |

- **api-run01 當時「本輪不修」之項, 已於 api-run02(2026-10-23)處理**: ①雙來源 token(跨套件規格 C3) → 見下 **R-EXECID-01**(ADR-050) ②`proxyRequest` 未給 `isAllowTarget` 時不限目標(P1) → 見下 **R-PROXYTARGET-01**(ADR-049) ③`Authorization` 方案前綴不驗(F4) → 見下 **R-AUTHSCHEME-01**(ADR-050). 仍維持: 認證階段 `checkUser` 與 `getAndVerifyClientUser` 失敗時 `console.log` 使用者物件(ADR-033 決定不處理).
- **鉤子呼叫次數(api-run02 起)**: 連線閘呼叫一次(標頭 token)＋執行身分(`getUserIdByToken`, R-EXECID-01)呼叫一次(本體 `__sysToken__`), 故資料通道之每個函數呼叫共兩次; 下方〈驗證〉所述「鉤子恰呼叫一次」為 api-run01 當時之現況.
- **盤點指令**:
  - 鉤子呼叫站點: `git grep -nE "verifyClientUser\(" -- server/WWebApi.mjs`(應為 `getAndVerifyClientUser` 與 `p.checkToken` 各 1 行＋註解行; `verifyClientUser = wrapInjectedLog(` 1 行為包裝).
  - `verifyConn` 傳遞入口名: `git grep -n "p.checkToken(token, apiType)" -- server/WWebApi.mjs`(應 1 行).
  - hapi 路由全集: `git grep -n "path: '/" -- server/WWebApi.mjs`(未註解者應恰三條: `/api/getUserByToken`、`/api/getApisList`〔2026-10-24, R-PUBLICAPIS-01 起〕、`/syncAndReplaceTabs`).
  - kpFunExt 全集: `git grep -nE "^ +(getWebInfor|proxyRequest|getApisList|saveApi|deleteApi|getStaEvent): " -- server/WWebApi.mjs`(6 行; 新增 kpFunExt 不需另加驗證——均在連線閘之後, 但須補 `api-connGate` 之 `mkFuncs` 與本表).
  - w-converhp 入口名: Grep `apiType:` 於 `node_modules/w-converhp/src/routeSpec.mjs`(6 個; 升版後若增減須同步 `api-connGate` 之 `ROUTES` 與 README).
  - 執行期函數全集: `[sys:getFuncList]`(`api-dataChannel`).
- **驗證**: `test/api-connGate.test.mjs`(埠 8554／8557／8558; 隔離子行程, 部署方鉤子情境與呼叫記錄由 `test/tools/apiServerChild.mjs` 提供): 被拒者 13 個函數(kpFunExt 6、`apis.select`、未開放之表寫入 3、`[sys:*]` 3)皆傳輸層 `permission denied`＋ORM 零操作＋鉤子恰呼叫一次且 `from='main'`; 連呼後庫內不變、代發目標零命中; Authorization 被拒而 `__sysToken__` 放行者仍被拒; 放行者對照組; 拋錯／reject／回 undefined 視同拒絕且不含鉤子內容; 六路由 × (只在 main 放行者／放行者／被拒者) 之 `from` 為入口名與狀態碼; 認證先於授權(未知 token／無 Authorization 不呼叫鉤子); `/api/getUserByToken` 之 `from` 不變; srLog 拒絕記錄 9 筆(含 apiType)且不含 token、使用者欄位、鉤子內容. 認證先於授權含使用者欄位不齊(`tokNoEmail`)、套件不強加政策(`tokNonAdmin`)、truthy 非 true(`tokVTruthy`)、srLog 拒絕記錄白名單欄位. 修前紅: HEAD 版 `server/WWebApi.mjs` 對 43 案 40 紅. 變異(`tmp` 腳本, 報告 api-run01)12 個皆被抓: 連線閘不呼叫鉤子、`from` 傳空字串、忽略結果、拋錯視同通過(`failValue true`)、`verifyConn` 未傳 `apiType`、只對 `main` 套鉤子、拒絕時回 false 不 reject、認證失敗仍放行、強加管理員政策、改嚴格 `=== true`、拒絕記錄含使用者欄位、授權不通過仍呼叫鉤子兩次.

### R-EXECID-01 資料通道之執行身分(`getUserIdByToken`, 請求本體 `__sysToken__`)須與連線閘同等完整驗證(跨套件規格 規則 4、C3; 跨套件〈使用者身分驗證原則〉第二節第 2 條; 2026-10-23, api-run02, ADR-050)

- **規則**:
  - 資料通道一個請求帶兩個 token: 標頭 `Authorization`(連線閘驗)與本體 `__sysToken__`(w-serv-webdata 之 `execFun` 於執行函數前傳給 `getUserIdByToken`). 兩者來源不同、可不同值, 框架不比對; w-serv-orm 1.1.10 起不做使用者檢查 → 「反查使用者」即驗證身分之步驟, 屬本套件.
  - `getUserIdByToken(token)` ＝ `authToken(token, 'main')` 取 `id`(token 認證＋`verifyClientUser(user,'main')`, 與連線閘同一函數、同一否定語意); `from` 固定 `'main'`(`execFun` 只由 w-converhp `/api/main` 之 `execute` 事件觸發, `routeSpec.main.event === 'execute'`).
  - 不通過 → reject 固定鍵 `errUserIdMissing`(不分原因、不回顯 token 與使用者資料; 函數不執行、ORM 零操作); srLog `{ event:'getUserIdByToken', err }` 之 `err` 為認證／授權之既有鍵(`errUserNotFound`／`errUser…Missing`／`errUserNoPermission`), 欄位白名單(level、time、pid、hostname、event、err).
  - 兩 token 皆有效而不同 → 以本體 token 之使用者執行(`userIdUpdate` 為其 id); 鉤子回 truthy 非 true 照常. (2026-10-24 api-run01 修正: 原「`isAdmin 'n'` 照常」作廢——本體 token 之使用者亦須 `isAdmin === 'y'`, 見 R-ADMINONLY-01.)
  - `authToken` 交給 `verifyClientUser` 者為使用者物件之淺拷貝, 取 id 用驗證前之原物件(部署方鉤子改寫傳入物件不影響執行身分; `tokMutate` 案).
  - 標準註解(跨套件〈使用者身分驗證原則〉第三節「使用方套件」)寫在 `verifyConn`、`getUserIdByToken` 實作處; README `## Security: identity verification responsibility`.
- **站點全集**(2026-10-23):

| 站點 | 取 userId 之方式 | 判準 |
|---|---|---|
| kpFunExt 6、表 `select`、`[sys:getFuncList]`、`[sys:getTableTags]`、不存在之函數名 | w-serv-webdata `execFun` → `getUserIdByToken(__sysToken__)` | 已套(`api-execIdentity` 函數全集 × 本體 `tokDenied`) |
| `[sys:polling]` | w-serv-broadcast 之 `onExecute` 於 `execFun` 之前同步 `pm.resolve`／`pm.reject`; `execFun` 其後仍呼叫 `getUserIdByToken`(鉤子兩次)但結果無法改變已定案之回應 | 框架層, 輪詢之身分只由連線閘把關; 不在本套件範圍(`api-execIdentity` 以獨立案記錄其行為與呼叫記錄) |
| `GET /api/getUserByToken`、`POST /syncAndReplaceTabs` | 單一 token(query), 不經本函數 | 不適用(R-CONNGATE-01) |

- **盤點指令**:
  - `authToken` 之呼叫站點應恰 2 處(連線閘、執行身分): `git grep -nE "authToken\(" -- server/WWebApi.mjs`(`let authToken =` 定義 1 行＋`await authToken(token, from)`＋`user = await authToken(token, 'main')`).
  - `getUserIdByToken` 不得再直接呼叫 `getUserByToken`: `git grep -n "getUserByToken(" -- server/WWebApi.mjs`(應只在 `findTokenUser` 與包裝行).
  - w-serv-webdata 之 `getUserIdByToken` 呼叫處: Grep `getUserIdByToken` 於 `node_modules/w-serv-webdata/src/WServWebdataServerExec.mjs`(升版後確認仍於函數前呼叫、拒絕即不執行).
- **驗證**: `test/api-execIdentity.test.mjs`(埠 8559／8564／8565; 隔離子行程): 標頭放行者＋本體被拒情境(授權階段: `tokDenied`、`tokVThrow`、`tokVReject`、`tokVFalsy`、`tokVNull`、`tokVZero`、`tokVEmptyStr`、`tokVAsyncFalse`; 認證階段: `tokNoEmail`、`tokNoName`、`tokNoId`、`tokBadRole`、查無、空字串、`Bearer tokA` 字串, 共 15 種)→ 不執行／ORM 零操作／固定鍵／不含鉤子內容與使用者資料; 各情境回應相同; 函數全集(10 項: `[sys:getFuncList]`、`[sys:getTableTags]`、`getWebInfor`、`getApisList`、`saveApi`、`deleteApi`、`proxyRequest`、`getStaEvent`、`apis.select`、不存在之函數名)× 本體 `tokDenied` → 皆不執行、代發目標零命中; 無副作用函數(`getWebInfor`)之「未執行」以 srLog `kpfun-getWebInfor` 筆數(只有放行對照那一次)直接觀察; 兩 token 皆有效而不同 → 以本體使用者執行(`tokA/tokB`、`tokB/tokA`); `tokVTruthy`／`tokOnlyMain` 作本體照常(`tokNonAdmin` 原亦照常, 2026-10-24 R-ADMINONLY-01 起翻轉為被拒); 鉤子改寫傳入物件(`tokMutate`)不影響執行身分; 鉤子呼叫記錄(連線閘＋執行身分兩次、`from` 皆 `main`、認證階段失敗者不呼叫); srLog 白名單與原因鍵. 另 `api-connGate`(計數改兩次)、`api-tokenLeak` E6(srLog 鍵 `errUserNotFound`).

### R-AUTHSCHEME-01 `Authorization` 須為 Bearer 方案(方案名不分大小寫, RFC 9110 §11.1), 不符視同未帶 token(2026-10-23, api-run02, ADR-050; 關閉 api-run01 之 F4)

- **規則**: `verifyConn` 以 `reBearerAuth = /^Bearer +(\S.*)$/i` 取憑證; 方案不符(`Basic`、`Token`、缺方案、方案與憑證間無空白、分隔非空白〔如 Tab〕、缺憑證)→ token 視為未帶 → `errTokenNoPermission` → `permission denied`、不呼叫鉤子、ORM 零操作. 憑證取方案與空白之後整段(不限字元集). `dwgf` 之 query token 由 w-converhp 合成 `Bearer <token>`, 不受影響.
- **站點**: 只 `verifyConn` 一處(`git grep -n "reBearerAuth" -- server/WWebApi.mjs` 應為定義 1 行＋註解＋`exec` 1 行); 本體 `__sysToken__` 不含方案前綴(`api-execIdentity`「`Bearer tokA` 字串」案驗不剝除).
- **驗證**: `api-connGate`「Authorization 方案」: 6 種正確寫法通過(大小寫任意、多空白)、17 種不符被拒、五條標頭型路由之 `Basic  tokA`／`Token  tokA` 被拒與 `Bearer`／`bearer` 通過.

### R-ADMINONLY-01 API 管理後台與資料通道只限系統管理員, 由套件自行強制(不論部署方之 `verifyClientUser` 如何放行); 系統管理員＝`getUserByToken` 所回 `isAdmin === 'y'`(跨套件〈使用者身分驗證原則〉二.4; 使用者 2026-10-24 裁示〈不管部署方會怎麼安排, 套件這邊得自己有一套做法〉; 2026-10-24, api-run01〔任務 20261024105624〕, ADR-051)

- **規則**:
  - 本套件無自有使用者表: 系統管理員 ＝ token 經部署方 `getUserByToken` 所回使用者之 `isAdmin` 為 `'y'`(`checkUser` 已限值域 `'y'`／`'n'`); 其餘為一般使用者. 判準只有一處: `assertAdmin(user, from)`(`server/WWebApi.mjs`), 不通過 reject 固定鍵 `'errUserNotAdmin'`(不分原因、不回顯 token 與使用者資料).
  - **順序**: token 認證(`getTokenUser`) → 部署方 `verifyClientUser(user 之拷貝, from)` → `assertAdmin`. 部署方鉤子對一般使用者仍被呼叫(可觀察之稽核行為不變), 只能再收緊、不能放寬; 角色取自 `getUserByToken` 所回之原物件, 鉤子改寫拷貝之 `isAdmin` 不影響(`authToken` 與 `getAndVerifyClientUser` 皆傳淺拷貝).
  - **資料通道**: `authToken`(連線閘 `p.checkToken` 與執行身分 `getUserIdByToken` 共用)含 `assertAdmin`. 故 w-converhp 六條路由(`main` 與五條上傳／下載)、`main` 之 kpFunExt 6、表 `select`、系統函數 `[sys:*]` 3、本體 `__sysToken__` 皆只限系統管理員: 一般使用者 → `permission denied`(連線閘)或 `errUserIdMissing`(本體 token), 函數不執行、ORM 零操作、零寫入、零憑證外洩; srLog `verifyConn`／`getUserIdByToken` 記 `err: 'errUserNotAdmin'`(白名單欄位).
  - **後台登入檢查** `GET /api/getUserByToken`: `getAndVerifyClientUser` 後 `assertAdmin`; 一般使用者回 `{ state:'error', msg:'errUserNotAdmin' }`. 前端 `loginError` 對該鍵顯示 `csErrNotAdmin`(eng `No permission to enter the API management console`、cht `無權進入 API 管理後台`; 走 `mUI` `kpFallback`, 因資料通道不可達), **停在該畫面、不轉址**(轉去登入頁無用, 且 SSO 導回形成轉址迴圈); 其餘登入錯誤維持原轉址.
  - **前端靜態檔公開; 一般使用者唯一入口為 `GET /api/getApisList`**(R-PUBLICAPIS-01). 〔2026-10-24 更正: 本條原載「`POST /syncAndReplaceTabs` 仍走 `verifyAppUser`、不加角色檢查」已作廢——應用系統路由自 1.1.18 起亦要求管理員等級, 見 R-APPLEVEL-01、ADR-052; `api-adminOnly`「應用入口照舊」兩案已翻轉.〕
  - 不在各 kpFunExt 內另判角色: 資料通道每個函數執行前必經 `getUserIdByToken`(含 `assertAdmin`), 函數只收驗證後之 `userId`(見 ADR-051 決定 2).
- **站點全集**(2026-10-24; 入口 ｜ 誰可用 ｜ 檢查處; 同 README `## Security` 之入口盤點):

| 入口 | 誰可用 | 檢查處 | 判準 |
|---|---|---|---|
| `GET /api/getUserByToken` | 系統管理員 | `getAndVerifyClientUser` ＋ `assertAdmin(user,'getUserByToken')` | 已套(`api-adminOnly`「後台登入檢查」) |
| `/api/main` kpFunExt 6、表 `select`、系統函數 3 | 系統管理員 | `verifyConn` → `p.checkToken` → `authToken` ＋ `assertAdmin`; 執行身分 `getUserIdByToken` → `authToken` | 已套(`api-adminOnly` 函數全集 14 項 × 兩種一般使用者; 本體／標頭交叉) |
| 上傳下載五條路由 | 系統管理員(無監聽, 不受理) | `verifyConn`(`from` 為入口名) | 已套(`api-adminOnly` 六路由) |
| `POST /syncAndReplaceTabs` | 系統管理員等級(A、AU 綁管理員、AS) | `getAndVerifyAppUser` ＝ `getTokenUser` ＋ `verifyAppUser` ＋ `assertAdmin` | 已套(R-APPLEVEL-01; 2026-10-24 api-run01〔任務 20261024182736〕起, 原「刻意不加角色檢查」作廢) |
| `GET /api/getApisList` | 任何通過驗證之使用者 | `getAndVerifyClientUser(token,'getApisList')` | 刻意不要求管理員(R-PUBLICAPIS-01) |
| 前端靜態檔 | 公開 | 無 | 刻意公開(不含使用者資料) |

- **盤點指令**:
  - `assertAdmin` 之呼叫站點應恰 3 處(資料通道 `authToken`、登入檢查路由、應用系統路由 `getAndVerifyAppUser`; 2026-10-24 由 2 處增為 3 處): `git grep -n "await assertAdmin" -- server/WWebApi.mjs`(應 3 行; 定義 `let assertAdmin =` 1 行).
  - hapi `apis` 路由應恰 3 條(新增路由須同步更新本表與 README 入口盤點): `git grep -nE "^            path: '" -- server/WWebApi.mjs`.
  - kpFunExt 應恰 6 個: `git grep -nE "^            [a-zA-Z]+: wrapErrLog" -- server/WWebApi.mjs`(新增函數不需另判角色, 但須列入 `api-adminOnly` 之 `mkFuncs` 與本表).
  - `verifyClientUser` 之傳入不得是使用者物件本體: `git grep -n "verifyClientUser(" -- server/WWebApi.mjs`(`authToken`、`getAndVerifyClientUser` 皆為 `{ ...user }`).
- **驗證**: `test/api-adminOnly.test.mjs`(埠 8566／8567〔srLog 案〕／8568〔echo〕; 隔離子行程; 一般使用者情境 `tokNonAdmin`〔isAdmin 'n'、鉤子放行〕、`tokMutateAdmin`〔isAdmin 'n'、鉤子把拷貝改寫為 'y' 再放行〕、`tokNonAdminDenied`〔鉤子拒絕〕): 後台登入檢查(一般使用者固定鍵且回應無 token／使用者資料、鉤子先被呼叫一次、管理員照常、鉤子拒絕者仍 `errUserNoPermission`、認證先於授權先於角色); 資料通道 14 個函數 × 2 種一般使用者皆 `permission denied`＋ORM 零操作＋鉤子恰一次且 `from='main'`＋代發零命中＋回應無憑證＋庫內不變; 管理員對照組; 六路由 × 2 種一般使用者之 `from`; 執行身分(標頭管理員＋本體一般使用者 → 全函數不執行 `errUserIdMissing`、ORM 零操作; 標頭一般使用者＋本體管理員 → 連線閘即拒; 兩位管理員照常); srLog 白名單與 `errUserNotAdmin`. 另 `api-connGate`／`api-execIdentity` 翻轉原「`tokNonAdmin` 通過」案; `e2e-init` E2E-006(前端畫面與不轉址; 標準圖 2 張). **修前紅**: HEAD 版後端(`git archive HEAD` 於 `./tmp/`)對新增與翻轉之 4 檔 206 案 80 紅(`api-adminOnly` 50／75、`api-publicApisList` 28／29、`api-connGate` 1、`api-execIdentity` 1). **變異**(拷貝上 21 個後端／純函數變異 20 個被抓、1 個等價; 前端 5 個皆被抓): 等價者為 `findTokenUser` 之 `isestr(token)` 放寬——資料通道之本體 token 由 w-serv-webdata 以 `cstr` 正規化為字串(非字串 → 空字串)、hapi 路由先 `isestr`、連線閘取自 Bearer 字串, 該處為縱深防禦, 現行入口不可達; 端到端行為(本體 token 為陣列／物件／數字／null／布林 → `errUserIdMissing`)仍由 `api-adminOnly` 釘住.

### R-APPLEVEL-01 應用系統路由(`POST /syncAndReplaceTabs`)由套件自行要求系統管理員等級; 後台登入檢查成功只回欄位白名單(使用者 2026-10-24 定案之 token 權責, 專案 `CLAUDE.md`、dspec〈使用者身分驗證原則〉二之一; 缺口 A-1〔C5〕、A-2; 2026-10-24, api-run01〔任務 20261024182736, 排程第 133 項〕, ADR-052)

- **token 種類與等級**(本套件不簽發 token, 經部署方 `getUserByToken` 反查; 一律以反查之 `isAdmin` 判等級, 與 R-ADMINONLY-01 的 `assertAdmin` 同一判準, 不另分辨用途): U＝使用者 token・一般使用者(`isAdmin 'n'`); A＝使用者 token・系統管理員(`'y'`); AU＝應用系統 token・使用者用途(反查回**所綁使用者**之實際資料, `isApp 'y'`, 等級同所綁使用者); AS＝應用系統 token・系統服務用途(不綁使用者, 反查回 `id 'app:<金鑰主鍵>'`、`isApp 'y'`、`isAdmin 'y'`). 是否簽發系統服務用途或綁管理員之應用系統 token 由專案方負責(高權限功能由專案方評估).
- **規則**:
  - **A-1** `getAndVerifyAppUser(token, 'syncAndReplaceTabs')` 順序: `getTokenUser`(token 認證＋`checkUser` 欄位檢查) → 部署方 `verifyAppUser({ ...user }, from)`(拷貝; 拋錯／reject／falsy 視同拒絕 → `errUserNoPermission`) → `assertAdmin`(→ `errUserNotAdmin`). U、AU 綁一般使用者被拒; A、AU 綁管理員、AS 放行. 被拒時 ORM 零操作、零寫入、回應固定鍵不含 token 與使用者資料, 由路由邊界 `wrapRouteErrLog` 記 srLog `api/syncAndReplaceTabs` error(白名單欄位 `level/time/pid/hostname/event/err`).
  - **欄位檢查之理由**(單一規則一處): 等級取自 `isAdmin`、稽核欄 `userIdUpdate` 取自 `id`; 缺欄或值不合法(`'Y'`、`'maybe'`、缺 `isAdmin`)屬部署設定錯誤, 不得靜默當成一般使用者(日後誤改判準時甚至當成管理員), 也不另寫第二份規則——故沿用瀏覽端 `checkUser`, 回既有 `errUserIdMissing`／`errUserEmailMissing`／`errUserNameMissing`／`errUserRoleMissing`, 且**部署方鉤子零呼叫**. 破壞性之處: 原「只回 `id` 之虛擬應用使用者」(`findTokenUser` 不經 `checkUser`)自此被拒.
  - **部署方鉤子照舊**: `verifyAppUser(user, from)`(`from` 為 `'syncAndReplaceTabs'`, `user` 為淺拷貝, 含反查之 `isApp`)先於等級檢查被呼叫、只能再收緊; 鉤子改寫拷貝之 `isAdmin` 不影響結果(等級取自原物件).
  - **A-2** `GET /api/getUserByToken` 成功時回 `pickLoginUser(user)`: 單一來源 `server/pickLoginUser.mjs` 之 `fieldsLoginUser`(凍結常數) ＝ `['id','name','email','isAdmin']`; 只輸出來源**自身**屬性(不讀原型鏈、缺欄不虛構、`__proto__` 自身鍵不污染), 其餘(`password`、`tokenVerify`、`description`、`account`、`timeExpired`、`isActive`、`isApp`…)一律不輸出. **不含 `isApp` 之理由**: 前端(`Layout.vue`)只用 `userSelf.name`、`userSelf.email`, w-ui-loginout 只要求回傳為非空物件; 等級只看 `isAdmin`, 不需讓瀏覽端知道此 token 是否為應用系統 token. 錯誤回應不變.
  - **fail-closed(外審 sol #7)**: 部署方使用者物件含拋錯之取值器(getter)或代理陷阱時, 例外原文不得外洩——①交給鉤子之拷貝一律經 `copyUserForHook`(`try { ...user } catch → null`), `null` 視同鉤子拒絕 → `errUserNoPermission`(`authToken`、`getAndVerifyClientUser`、`getAndVerifyAppUser` 三處共用); ②`getTokenUser` 把 `checkUser` 拋出之**非固定鍵**例外(必要欄位之取值器拋錯)一律轉 `errUserNotFound`; 兩者鉤子皆零呼叫, 回應與 srLog 不含例外原文(`api-accessMatrix`「fail-closed」2 案、變異 M12~M15 守之). 原行為: 展開 `{ ...user }` 在 `wrapInjected` 之外求值, 例外經路由邊界 `wrapRouteErrLog` 記入 srLog 並以 `r.msg.message` 回到回應.
  - **不變**: 1.1.17 之後台與資料通道只限管理員、`GET /api/getApisList` 公開欄位清單; 1.1.16 之連線閘與代發請求政策; `srcKey` 匯入之同步語意(`keyTable` 白名單、`srcKey` 必填、不得送 `id`、整批驗證); 錯誤鍵與回應形狀.
- **存取表**(驗收依據: dspec〈w-web存取管控表〉§3.2; 測試 `api-accessMatrix`, 字面值 `EXPECT` 逐格): 19 入口 × 6 呼叫者類(無、U、A、AU 綁一般、AU 綁管理員、AS)＝114 格; 靜態檔全 ✓; `GET /api/getApisList` 「無」✗其餘 ✓; 其餘 17 入口「無」✗、U ✗、A ✓、AU 同所綁使用者、AS ✓. 「無」類子變體: 缺、空字串、重複 token(陣列)、查無、逾期(上游 reject)、非 Bearer 方案、Bearer 後無憑證.
- **站點全集與盤點指令**:
  - `getAndVerifyAppUser` 唯一呼叫者為 `POST /syncAndReplaceTabs`: `git grep -n "getAndVerifyAppUser" -- server/WWebApi.mjs`(定義 1＋呼叫 1＋註解); 其內須含 `getTokenUser`、`verifyAppUser({ ...user }`、`assertAdmin` 三者且依此順序.
  - `assertAdmin` 呼叫站點 3 處: `git grep -n "await assertAdmin" -- server/WWebApi.mjs`.
  - 後台登入檢查之回傳只經白名單: `git grep -n "pickLoginUser" -- server`(定義 1＋import 1＋呼叫 1); `fieldsLoginUser` 之字面值由 `unit-pickLoginUser` L01 釘住.
  - `verifyAppUser(`／`verifyClientUser(` 傳入不得是使用者物件本體, 且拷貝一律經 `copyUserForHook`: `git grep -n "copyUserForHook\|verifyAppUser(\|verifyClientUser(" -- server/WWebApi.mjs`(定義 1＋呼叫 3; 鉤子呼叫處皆傳 `uc`).
  - 新增 hapi 路由或資料通道函數須同步更新 `api-accessMatrix` 之 `ENTRIES`／`EXPECT`(`MX01` 以管理員之 `[sys:getFuncList]` 對照函數全集, 漏列即紅)、README 入口盤點與本節.
- **驗證**: `test/api-accessMatrix.test.mjs`(埠 8571〔主〕／8572〔echo〕／8573〔srLog 案〕; 隔離子行程; 呼叫者 `tokMxU`／`tokMxA`／`tokMxAuU`／`tokMxAuA`／`tokMxAs`／`tokMxExpired` 等由 `apiServerChild` 提供, 部署方鉤子對其一律放行, 故被拒只能出自套件自己的檢查; 靜態檔以 harness 新選項 `files` 於子行程 cwd 建 `dist/`): 155 案＝自檢 2＋矩陣 114＋兩 token 交叉 21〔標頭×本體: 管理員等級 3×3、標頭管理員×本體等級不足或無效 2×5、標頭等級不足×本體管理員 2〕＋取值器拋錯 fail-closed 2＋A-1 欄位檢查 7＋鉤子照舊 5＋不變 2＋srLog 1＋收尾 1; 放行格之鉤子呼叫須恰 2 次(連線閘＋執行身分); 被拒格另斷言 ORM 零操作／庫內不變／代發零命中／回應無敏感值／鉤子呼叫次數與 `from`; 放行格斷言成功結果(登入檢查回應鍵恰為白名單且無 `SECRET-MX-*`、公開清單每列恰 17 欄、匯入列稽核欄＝呼叫者 id、資料通道各函數成功). `test/unit-pickLoginUser.test.mjs`(8 案 L01~L08). `api-adminOnly` 翻轉 2 案(`tokAppNonAdmin` 匯入成功 → `errUserNotAdmin`; `tokAppMinimal` 匯入成功 → `errUserEmailMissing`). **修前紅**: HEAD 版後端副本(`git archive HEAD server src` 於 `./tmp/`, 以 `API_SERVER_MODULE` 指向)對 4 檔(accessMatrix、adminOnly、connGate、execIdentity)的紅燈數見報告〈完成條件〉1; 新 unit 檔因模組不存在整檔載入失敗. **變異**(`API_SERVER_MODULE` 指向 `./tmp/` 副本, 不動 repo): 15 個, 結果見報告〈完成條件〉2(M1 拿掉等級檢查、M2 白名單多 `description`、M3 原樣回傳使用者物件、M4 不經欄位檢查、M5 傳原物件非拷貝、M6 順序顛倒、M7 `isApp` 免等級檢查、M8 白名單多 `isApp`、M9 略過部署方鉤子、M10 白名單少 `email`、M11 AS 被誤拒、M12~M15 取值器拋錯之 fail-closed 四種).

### R-PUBLICAPIS-01 一般使用者以 token 取得 API 清單: `GET /api/getApisList?token=`, 只含啟用中、只含公開欄位白名單, 固定排除憑證(使用者 2026-10-24 裁示〈經由指定 token 應該是取得 api 清單〉; 2026-10-24, api-run01, ADR-051)

- **規則**:
  - token 須通過完整驗證: `getTokenUser`(有效使用者、欄位齊備) ＋ 部署方 `verifyClientUser(user, 'getApisList')`; **不要求系統管理員**(一般使用者與管理員皆可). 失敗回 `state:'error'` 與固定鍵(`errTokenNoPermission`、`errUserNotFound`、`errUser…Missing`、`errUserNoPermission`、讀取失敗 `getDataError`), 不含清單與憑證.
  - 只回**啟用中**(列自身有 `isActive` 且嚴格為 `'y'`; 缺欄、原型鏈上之值、空字串、`'Y'`、`'n'` 皆排除)之 API; `procApis.getPublicApisList` 以查詢條件 `{ isActive:'y' }` 先篩, `pickPublicRows` 再嚴格比對一次.
  - 每列**只含公開欄位白名單**(單一來源 `src/schema/contracts/apis.mjs` 之 `fieldsPublic`, 17 欄): `id`、`order`、`name`、`description`、`url`、`method`、`version`、`group`、`levels`、`keywords`、`state`、`creator`、`dataSource`、`mdInputParams`、`inputExample`、`mdOutputParams`、`outputExample`; 缺欄補空字串; 只讀列自身屬性. **固定排除**: 第三方憑證 `tokens`、`authConfigJson`; 測試設定 `testBaseUrl`、`authType`、`defaultHeadersJson`、`defaultQueryJson`、`defaultBodyJson`、`contentType`; 伺服器專有 `timeCreate`、`timeUpdate`、`isActive`、`userIdUpdate`、`srcKey`.
  - 白名單為**字面值**(不由 `fieldsExternal` 衍生): schema 新增欄位預設不公開; `unit-contract` C09／C10 強迫每欄分類為公開／本系統擁有／伺服器專有三者之一.
  - 成功記 srLog `api/getApisList`(只含 `userId`); 失敗記 error key; 查詢字串之 token 經 `maskQuery` 才印.
- **站點全集**: 公開欄位之唯一投影點 `server/pickPublicApis.mjs`(`pickPublicRow`/`pickPublicRows`); 唯一呼叫者 `procApis.getPublicApisList` ← `GET /api/getApisList`. 整列(含憑證)只由資料通道 `getApisList`／`apis.select` 回傳, 僅系統管理員(R-ADMINONLY-01).
- **盤點指令**: `git grep -n "pickPublicRows\|fieldsPublic" -- server src`(公開欄位只應在這些處被引用; 其他處新增 apis 列輸出給一般使用者者違規); `git grep -n "getPublicApisList" -- server`(定義 1＋路由 1).
- **驗證**: `test/api-publicApisList.test.mjs`(埠 8569): 4 種 token(一般使用者 2、管理員 2)取得相同公開視圖(只含啟用中 pa-1／pa-2, 停用 `n`／缺欄／空字串／`Y` 皆不含; 每列鍵恰為字面值白名單依序; 回應全文無 `SECRET-`)、逐欄值、唯讀(只 `apis.select`)、鉤子 `from='getApisList'` 恰一次、saveApi 新增後即時出現且憑證不出現、空表回 `[]`、一般使用者經資料通道取同名函數被拒; 11 種無效 token 情境(未帶／空／查無／欄位不齊／欄位不合／鉤子 false／鉤子僅 main／拋錯／reject／undefined／`tokNonAdminDenied`)皆固定鍵、不含清單與鉤子內容、認證未過不呼叫鉤子; 只接受 GET; srLog. `test/unit-publicApis.test.mjs`(P01~P10): 白名單字面值、分類完整、逐欄哨兵、`isActive` 嚴格、非陣列、`procApis.getPublicApisList` 呼叫形狀與失敗. 修前紅與變異見報告.

### R-PROXYTARGET-01 測試分頁代發請求預設拒絕內網與本機位址; 依解析後之 IP、連線位址即檢查位址、轉址逐跳檢查; 可開關可調整(跨套件規格 P1; 使用者 2026-10-23 裁示; 2026-10-23, api-run02, ADR-049)

- **規則**:
  - 內建政策(`server/proxyTargetPolicy.mjs`)預設拒絕凡「非全域單播」之位址: IPv4 之 `0/8`、`10/8`、`100.64/10`、`127/8`、`169.254/16`、`172.16/12`、`192.0.0/24`、`192.0.2/24`、`192.168/16`、`198.18/15`、`198.51.100/24`、`203.0.113/24`、`224/4`、`240/4`; IPv6 之 `2000::/3` 以外全部、並排除 `2001::/23`、`2001:db8::/32`、`3fff::/20`; IPv4 映射／NAT64／6to4 改查內嵌之 IPv4, `64:ff9b:1::/48` 拒絕; `localhost`／`*.localhost` 名稱不待解析直接拒絕. 無法解析為 IP 者視為非公開.
  - IP 字面值於連線前由 `checkUrl` 檢查(每跳); 主機名由 undici `Agent` 之 `connect.lookup`(`createGuardedLookup`)於連線當下解析、檢查**全部**結果(任一不被允許即整次拒絕), 通過者原組交回連線, **不二次解析**; 轉址每一跳先 `isAllowTarget`、後內建檢查.
  - 設定: `opt.proxyAllowInternal`(`'n'` 預設／`'y'`, 亦布林; 其他值建構拋 `invalid opt.proxyAllowInternal`); `opt.proxyAllowList`(陣列; 項為 IP／CIDR／主機名; 不合法建構拋 `invalid opt.proxyAllowList`); 兩者皆先於 srLog 與任何副作用檢核. IP／CIDR 涵蓋之位址不受拒絕(IPv4 映射之 IPv6 亦以 IPv4 比對); 主機名所列之主機其解析結果不受拒絕; `localhost` 名稱須列 `localhost` 本身; 公開位址不受清單影響.
  - 與 `isAllowTarget` 並存: 皆須通過(AND), 先 `isAllowTarget`; 放行清單不繞過 `isAllowTarget`, `isAllowTarget` 回 true 不放寬內建拒絕. 鉤子收到之網址即實際送出者(首跳為 query 併入後之 `u.href`, 轉址跳為 `nextUrl.href`); 可同步或非同步(`await`), 解析為 `false` 拒絕, 拋錯或 reject 視同拒絕(fail-closed, 固定鍵、不外洩); 首跳拒絕記 srLog reason `isAllowTarget`.
  - `proxyAllowList` 項之末段為數字或十六進位(`0x7f000001`、`example.123`)者不合法(URL 把它當 IPv4, 列了永不命中); `hostOf` 去除全部尾端點(`localhost..`、`127.0.0.1..`).
  - 被拒: 回固定鍵 `errReqTargetNotAllowed`(不回顯位址與憑證); srLog `{ event:'proxyRequest-target', err, reason, hop }`(`reason`: `internalAddress`／`internalName`／`resolvedInternal`／`isAllowTarget`〔部署方鉤子於首跳拒絕; 轉址跳之鉤子拒絕仍記 `proxyRequest-redirect`〕; 不含網址、主機名與位址).
  - 傳輸為 `undici` 套件之 `fetch`＋`Agent`(`package.json` 相依 `undici ^7.28.0`); 預設補 `user-agent: node` 以維持目標端所見之請求; `stop()` 釋放連線池(`closeProxy`, 以 `destroy` 立即終止進行中請求, 不等逾時).
  - guarded lookup 之 `options` 形式: 物件(原樣保留 `family`／`hints` 並加 `all:true`)、數字(舊式 family, 正規化為 `{ family }`)、省略; `isBlockedTargetError` 沿 `cause` 與 `AggregateError.errors` 遍歷(有已訪問集合與總量上限, 循環不卡住).
  - 連線池重用既有連線時不再解析(該連線建立時之位址已檢查); 關閉連線池後重連須重新解析與檢查(`unit-procProxyTarget` 之連線池案).
  - 參考部署 `settings.json` 預設拒絕(`proxyAllowInternal:'n'`, `proxyAllowList:[]`); 測試以 `restartBackend(genTempSettings({ proxyAllowList: ['127.0.0.1'] }))` 或子行程 `opt` 放行 `127.0.0.1`.
- **站點全集**(2026-10-23):

| 站點 | 目標位址之檢查 | 判準 |
|---|---|---|
| `proxyRequest` 首跳 | `isAllowTarget`(網址層)→ `targetPolicy.checkUrl`(字面值／localhost 名稱)→ guarded lookup(主機名) | 已套(`unit-procProxyTarget`、`api-proxyTarget`) |
| 轉址每一跳(301/302/303/307/308) | 同上, 先 `isAllowTarget` | 已套(`unit-procProxyTarget`「轉址每一跳皆檢查」、`api-proxyTarget` 放行清單區) |
| 其他代發出站請求 | 本套件僅 `proxyRequest` 與 `srv.mjs` 之 `getUserByToken` 呼叫 SSO(部署方設定之位址, 非使用者可控) | 不適用(`git grep -nE "fetch\(" -- server srv.mjs`) |

- **盤點指令**:
  - 出站 `fetch` 之全集: `git grep -nE "\bfetch\(" -- server/*.mjs`(應只有 `procProxy.mjs` 之 undici `fetch`; 新增出站請求須經同一政策).
  - `procProxy` 之傳輸: `git grep -nE "from 'undici'" -- server/`(應只有 `procProxy.mjs`).
  - 政策之範圍表: `ksNetV4`／`ksNetV6Special` 與 `unit-proxyTargetPolicy` 之 IPv4／IPv6 表逐項對照(新增或移除網段須兩處同步).
- **驗證**: `test/unit-proxyTargetPolicy.test.mjs`(IPv4 表 58 筆含各網段首尾與緊鄰外側、IPv6 表 41 筆、allowList 解析與邊界、guarded lookup)、`test/unit-procProxyTarget.test.mjs`(埠 11087; 預設拒絕 25 種目標、allowInternal／allowList、主機名解析與 rebinding〔解析 1 次且連線位址即檢查位址〕、轉址逐跳、與 `isAllowTarget` 並存之先後)、`test/api-proxyTarget.test.mjs`(埠 8560／8561／8562／8563; 真資料通道)、`test/unit-wwebapi-opt.test.mjs`(設定檢核先於 srLog). 既有 `unit-procProxy` 29 案(以注入之政策放行 127.0.0.1)證明傳輸改用 undici 套件後契約不變.

## 迭代使用端傳入之物件與使用端字串鍵(R-OBJ-ITER-01 / R-KEY-01; 2026-10-20, 主控第 90 項; 對應 wsemi 同名規則、w-web-perm 與 w-web-sso 同日修正)

軸: 輸入來源(外部同步本體之列物件 / API 定義內之 JSON 字串 / API 名稱與 levels / log 之事件名) × 走訪或取值方式(lodash `each / map / size / …`、`get / set` 路徑、自有鍵) × 物件內容(含數字 `length` 鍵: 0、1、2、2^32-1; 名稱含 `.` 或 `[`) × 後果(真實鍵被略過 / 迭代 `length` 次〔CPU 空轉〕/ 節點被換掉).

- **R-OBJ-ITER-01 迭代使用端傳入之物件, 只依自有可列舉字串鍵; 數字 `length` 鍵不得使走訪改成陣列樣**: lodash `each / map / filter / size / sortBy / …` 對具非負整數 `length` 屬性(0 ≤ 整數 ≤ 2^53-1)之任何物件改走索引 `0..length-1`、不走自有鍵, 迭代次數即 `length` 之值. 迭代外部應用送入之列物件、API 定義內之 JSON 解析結果等一律 `Object.keys`; 真陣列以索引走訪.
- **R-KEY-01 以使用端給定之字串組 lodash 路徑者, 改以陣列路徑或自有鍵**: lodash `get / set` 把含 `.`、`[` 之字串解析為路徑. `levels` 以 `.` 分層屬設計(seed 如 `寵物.狗狗`), `name` 為使用端給定之任意字串, 只可作為單一層級(`apiTreePath`).
- 實測(2026-10-20, HEAD `71ce10b`, 經真後端 `POST /syncAndReplaceTabs?keyTable=apis`, token=sys): 列 `{ name: 'base64:SGVsbG8=', url: 'base64:…', length: 0 / 1 / 3 }` → 庫內 `name` 為字面 `base64:SGVsbG8=`(還原靜默失效; 無 `length` 之對照列為 `Hello`); 同批第一列含 `length: 2`、第二列無 → 第一列未還原; `length: 4294967295` → 8 秒內無回應(後端同步空轉, 事件迴圈阻塞). 前置: `getAndVerifyAppUser`(參考部署要求 `isAdmin==='y'`; 非 production 之 `sys` 捷徑即管理員), 屬已授權呼叫者之資料正確性 / 服務中斷問題, 非匿名可觸發.
- **站點全集(2026-10-20; 行號為修正前 HEAD `71ce10b`; 範圍 `server/`、`srv.mjs`、`g_*.mjs`、`toolg/`、`src/`〔含 `.vue`〕)**:

| # | 站點 | 迭代對象與來源 | 判定 |
|---|---|---|---|
| 1 | `server/syncApis.mjs`(2026-10-23 自 `WWebApi.mjs` 移入) 之 base64 還原: 原 `each(row, (v, k) => …)`(2026-10-20 改 `for … of Object.keys(row)`), 現不走訪列物件之鍵, 只以自有屬性(`own(raw, f)`)逐一讀取契約列舉之欄位(`fieldsExternal`)與 `srcKey`/`id`, 其餘欄位名(含 `length`)不被走訪亦不複製進庫 | 外部應用送入之列物件 | **已套**(更嚴: 不走訪; `unit-iterSites` SITE-API-001 改守 `syncApis.mjs`; `api-import`「任意欄位名」) |
| 2 | `server/WWebApi.mjs:602 map(rows)`、`:610 each(rows, (row, krow) => …)` | `:578` `isarr` + 非空守門、`:595-599` 逐列 `iseobj` 後之真陣列(JSON 不能偽造 `[object Array]`) | 刻意不套 |
| 3 | `server/WWebApi.mjs:648` `each(rsExist, …)`、`:637` `ltdtmapping` | 資料庫 `select` 陣列; 固定欄位清單 | 刻意不套 |
| 4b | `server/procProxy.mjs:226-228` 回應標頭 `resHeaders[k] = v`(外審 sol 指出, 初版漏列) | 標頭名由目標伺服器決定: 合法標頭名 `__proto__` 之一般指派被忽略, 測試分頁顯示之回應標頭缺一項 | **已套**(`Object.defineProperty` 自有資料屬性; `unit-procProxy` PROXY-R-001) |
| 4 | `server/procProxy.mjs:24-43`、`server/checkSyncRows.mjs:36 / 70`、`src/schema/tables/apis.mjs:132`(`dtmapping`) | `isarr` + `Object.keys`; `ltdtmapping` 之後之真陣列索引迴圈; 固定取欄(建議書排除項, 已核對) | 刻意不套 |
| 5 | `server/getOptDataChannel.mjs:1`(lodash `keys`)、`server/procLang.mjs` 之 `each` | 部署設定與語系字典(信任邊界為部署方) | 刻意不套 |
| 6 | `server/staLogs/staLogsCore.mjs` `b.kp[e]`(事件名為鍵) | log 之 `event`: 皆為程式碼常數(字面值不含 `.`、`[`, 由 `SITE-API-004` 守), 非使用端字串 | 刻意不套 |
| 7 | `src/components/LayoutContentTest.vue:363` `jsonToRows` 之 `each(obj, …)` | `defaultQueryJson` / `defaultHeadersJson` 解析後之物件: API 定義者或外部同步給定, 鍵含 `length`(如分頁參數 `{ "start": 0, "length": 10 }`)時預填成鍵 `0…9`、值 `undefined` 之假列並略過真實鍵 | **已套**(`mShare.jsonToKvPairs`) |
| 8 | `src/components/LayoutContent.vue:440-451` `genTree` 之 `get / set(tr, \`${v.levels}.${v.name}\`)` | `name` 為任意字串, 含 `.` 或 `[` 時被拆層 / 當索引; 名稱 `a` 與 `a.b` 並存時 `a` 之葉(id 字串)被 `set` 換成物件而自樹消失 | **已套**(`mShare.apiTreePath`: `levels` 仍以 `.` 分層、`name` 為單一葉名; `mShare.apiTreeSet`: 各層以自有鍵判斷與寫入——外審 sol 指出 `get(tr, [.., '__proto__'])` 取得繼承之 `Object.prototype` 被當成既有群組、lodash `set` 又拒寫 `__proto__` / `constructor`, 名稱為此類字串之 API 自樹上消失; `kpTree` 〔API id 為鍵, 外部同步可給任意字串主鍵〕改無原型; 外審 minimax / sol 指出 `levels` 為空字串時路徑須與修改前相同, 現以 `toPath('${levels}.')` 取代末段, 逐一等價) |
| 9 | `src/components/LayoutContent.vue` 其餘 `each(apis)`、`filter`、`size`、`find` | `cloneDeep(vo.apis)` 之陣列(`recvData` 同步層產出) | 刻意不套 |
| 10 | `src/components/LayoutContentStats.vue:248 / 255 / 277 / 284 / 305-361` | `freq` 以 `isearr` 保證為陣列; `keys(d)` 對一般物件走自有鍵; `sumBy` 以函數; `get(item, \`data.${k}\`)` 之 `k` 為事件名(程式碼常數, 見站點 6) | **已套**(2026-10-20 第 93 項, ADR-042: 三處取值〔重採樣加總、圖表系列、事件統計表〕改經 `mShare.getFreqVal` 自有屬性取值, 事件名含 `.` / `[` 亦正確; `SITE-API-004` 改為只守保留字 `count` 與原型鍵名〔統計頁 `acc` / `merged.data` 與 `staLogsCore` 以事件名為物件鍵〕, 新增 `SITE-API-005` 守取值經 `getFreqVal`) |
| 11 | `src/plugins/mUI.mjs`、`submitGuard.mjs`、`src/store/mutations.mjs`、`LayoutContentEdit.vue`、`Layout*.vue`、`g_provideApis.mjs`、`srv.mjs` | `$children`、schema 建表物件、`runSubmit` 字面鍵 map、常數、種子 | 刻意不套 |

- **盤點指令**: `git grep -n -E "lodash-es/(each|forEach|map|filter|reject|reduce|some|every|find|findLast|flatMap|groupBy|countBy|keyBy|partition|sortBy|orderBy|includes|size|toArray|sample|shuffle|merge|mergeWith|mapKeys|mapValues|sumBy|maxBy|minBy|uniqBy)\.js" -- server src srv.mjs g_*.mjs toolg` 得持有者, 逐檔 Grep 呼叫點判迭代對象來源; 路徑: Grep `(^|[^.\w$])(get|has|set|unset|update|at|result|pick|omit)\(` 且第二參數非字面字串者. 可執行版: `unit-iterSites` SITE-API-001～004.
- **測試**: `api-syncIter`(AI-001～005, 經真後端 / 真 HTTP; 修前 AI-002 / 003 / 005 失敗; length 另測 -1 / 1.5 / '3' / null 為不構成陣列樣之對照)、`unit-jsonToKvPairs`(KV-001～005; KV-005 以子行程驗 length 2^32-1 立即返回)、`unit-apiTreePath`(TP-001～006: 路徑、與修改前逐一等價、a 與 a.b 並存、levels 為空、原型鍵名經 `convertToTree` 後皆在樹上)、`unit-staFreq`(SF-001～004, 第 93 項: 事件名含 `.` / `[` / `/` 取自有值並以改造前取值式為缺陷對照、缺鍵與非物件回預設、原型鍵名不取繼承值、一般事件名與改造前輸出逐一相同〔固定種子 200 組〕)、`unit-iterSites`(SITE-API-001～005; 004 涵蓋 `event:` 字面值與樣板字串、`wrapRouteErrLog`、`wrapErrLog`〔事件名 `kpfun-` + 名稱〕, 並擋 `count` 與原型鍵名)、`unit-procProxy`(PROXY-R-001).
- **變異驗證(2026-10-20, 8 項全數轉紅, 每項植入後還原並比對 sha1 相同)**: A1 base64 還原改回 lodash `each` → `api-syncIter` 3 案(AI-002 / 003 / 005); A2 / A8 `jsonToKvPairs` 改回 `each` → KV-001 / KV-005(子行程逾時); A3 / A6 `apiTreePath` 改回字串路徑 → TP-002 / 004 與 TP-003b / 005; A4 `apiTreeSet` 末層含繼承值判斷 → TP-006; A5 `procProxy` 改回一般指派 → PROXY-R-001; A7 建樹改回 lodash `set` → SITE-API-003.
- **變異驗證(2026-10-20 第 93 項, 6 項全數轉紅, 每項植入後還原並以 sha1 核對相同; 腳本 `mutate.mjs` 見 w-web-sso `tmp/ledger/`, 暫存區可能已清)**: A1 重採樣加總改回 lodash 字串路徑 → SITE-API-005; A2 事件統計表 `sumLastN` 改回字串路徑 → SITE-API-005; A3 `getFreqVal` 內改用字串路徑取值 → SF-001(+ SITE-API-005); A4 移除自有屬性判斷 → SF-003; A5 整個改為 lodash 陣列路徑 `get(item, ['data', key], def)`〔含點事件名可取、但取繼承值〕→ SF-003(第一版 A5 只改末段而保留自有屬性判斷, 為等價變異, 已改為整體替換); A6 圖表系列站點傳錯鍵(`valueKey` 改為 `count`)→ SITE-API-005(精確呼叫文字比對; 外審 sol 指出舊版只數呼叫次數之變異可存活).
- **前端回歸（含真實頁面對照, 2026-10-20 第 93 項）**: 複製 repo 至 `tmp/e2e-fixed/`（現行版）與 `tmp/e2e-head/`（另以 HEAD 版覆蓋 `LayoutContentStats.vue` 與 `mShare.mjs`）各自 `vue-cli-service build`、副本內 `node srv.mjs`; 合成 log 含事件名 `it.dotted.event`（7 筆）、`kpfun-x[0]`（3 筆）: HEAD 版統計表「最近 1 日」兩者皆 0, 現行版為 7 與 3; 副本內 `e2e-stainfor` 6 / 6、`e2e-display` 17 / 17（標準圖零重產）; 副本事後刪除. 原「前端回歸(2026-10-20)」見下條.
- **前端回歸(2026-10-20)**: 驗前端改動不動 tracked `dist/`——複製 repo 至 `<repo>/tmp/e2e-copy/`(含 db 副本、不含 node_modules; bare import 由副本往上走到 repo 之 node_modules)、副本內 `vue-cli-service build`、副本內 `node srv.mjs`、再以 `mocha` 跑 `e2e-display` 17 + `e2e-apitest` 28 = 45 / 45(標準圖零重產). **注意**: 在 11005 無人時直接跑 `api-*.test.mjs` 會觸發 harness 之 `npm run build` 改寫 tracked `dist/`(2026-10-20 一次失誤, 已以 `git show HEAD:` 寫回); 跑 api 層前先起後端.

## 〔跨套件規格〕(主控 2026-10-16 依使用者交辦寫入)

- 資料通道只開 select 屬 w-web-perm、w-web-api、w-web-task 共用之裁決(主控 2026-10-14),規格與審查判準見 `C:\opensrcOper\dspec\w-web資料通道最小權限.md`;本帳本之 R-DC-1 為其落地.要在資料通道重開寫入者,不得自行調整,須經主控或使用者裁示.
- 呼叫者身分驗證(token 管控, 資料通道連線閘須含部署方之 `verifyClientUser`)屬 w-web-sso、perm、api、task 共用之裁決(使用者 2026-10-23),規格見 `C:\opensrcOper\dspec\w-web呼叫者身分驗證.md`;本帳本之 R-CONNGATE-01 為其落地. 不得為方便而重新讓連線閘只做認證.
