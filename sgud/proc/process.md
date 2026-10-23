# 重要處理要點

本檔為特有之重要處理要點,為業務端之特化要求事項與處理流程,包含事項、關聯什麼、怎麼判斷與處理方式等,由agent自行編列、擴充與維護.

體例: 每一事項一節, 固定三欄——**關聯**(牽涉哪些檔案 / 機制 / 文件)、**判斷**(何時適用、怎麼分辨)、**處理**(照做的步驟與禁止事項). 指令與測試檔清單不重抄, 指向 rulebook「測試配置」; 決策緣由指向 `spec/設計要點與取捨.md` 之 ADR 編號.

## e2e 打 build 後之後端, 不起 dev server

- **關聯**: `test/tools/e2e-setup.mjs` 之 `startServersOnce()`(先 `npm run build` 產 `dist`, 再 spawn `srv.mjs`, 後端 11005 同時 serve `dist` 與 API); `baseUrl` = `http://127.0.0.1:11005`; server 注入語系類測試(`e2e-init`)必須打 build.
- **判斷**: 任何 e2e 或手動驗收皆看 build 後的畫面. `startServersOnce()` 見 11005 已有人即**沿用不重建**——手動起的後端沒關就會測到舊碼且不重 build, 徵狀是「改了前端但截圖沒變」.
- **處理**: 跑 harness 前確認 11005 空著; 手動起後端做驗收同樣先 `npm run build`; `dist` 由發布流程自動產製, 需要時自行 build, 不列為待辦.

## 資料初始化與測試 seed

- **關聯**: 測試 seed `g_initialTestData.mjs`(以 `w-serv-orm` 之 genTestData 依 schema `funTest` 重建); 每 case `resetToBaseSeed()`(`woItems.apis.delAll()` + 固定 id seed); 本套件**不用** `g_initialData.mjs`.
- **判斷**: 此套件無正式初始化需求; 單一 mocha 進程內各檔互不影響, 靠的是每檔 `after` 再還原一次, 不是靠隔離進程.
- **處理**: `beforeEach` `resetToBaseSeed()`; 異動資料之 e2e 檔於 `after` 再還原; 換過 settings 者(`e2e-init`、`e2e-stainfor`)另 `restartBackend('./settings.json')` 還原.

## 跑測試: 統一入口與自身驗證分流

- **關聯**: `package.json` scripts 之 `test`(唯一 script, 全域 §16.5 標準字串); 各層指令見 rulebook「測試配置」; `test/tools/run-e2e-isolated.mjs`.
- **判斷**: `npm test` 是跨套件批次維護、確認套件能完整測試之統一入口, **字串固定不得改、不加 scripts 變體**(單一 mocha 進程依檔名序 api → e2e → unit; 2026-10-14 紀錄 238 passing 約 13 分鐘); agent 自身要驗證什麼一律自編指令.
- **判斷(整批失敗先查共享資源)**: 前幾案通過、之後連續逾時「app ready」, 或 `e2e-init` 報「dist/index.html 不存在」→ 先以 `ls --full-time dist dist/js` 與測試輸出檔時間、`git log` 發布提交時間比對, 看 `dist` 是否在測試期間被發布流程改寫(因果鏈見 experience「發布流程與全跑重疊」); 是則屬環境干擾, 不是產品或套件回歸.
- **判斷(測試鎖, 主控 2026-10-14 更正)**: 鎖只限制「同時開瀏覽器之 e2e」數量, 兩槽 `C:/opensrcOper/tmp/locks/web-tests` 或 `web-tests-b` 取得其一即可(寫 `owner.txt`, 一個指令一取一放, 只刪自己取得之那一槽並回驗, 不得刪他人之鎖); 不開瀏覽器之 unit、api 與參考部署驗收(T7)不必持鎖, 但須自行備份並還原 `dist` / `tableTags-web-api.json`(api 之 harness 會 build). 執行期間新開而存活之 chrome 須以父行程判斷歸屬(他路線同時段之 e2e 亦會被計入).
- **處理**: 超過 2 分鐘 `run_in_background` 等完成通知; 全跑前先備份 `dist` 至 `./tmp/dist-backup/`, 測完還原(harness 之 build 會清掉發布產物 `index.tmp`、umd 檔; `e2e-init` 為測注入語系亦會改寫 `dist/index.tmp`), 還原後 `git status --short dist` 應只剩執行期產生之 `index.html`; 發布流程進行中不跑全跑, 遇干擾則待發布結束後重跑一次. 臨時檔只落 `test/_tmp/`(setup 之 cleanup 與各檔 `after` 刪), 失敗三聯組落 `./testPending/` 不自動刪. lint 逐檔 `npx eslint <檔>`(`.vue` 加 `--ext .vue`), **不跑 `npm run lint`**(`vue-cli-service lint` 預設會自動改檔); 新增錯誤數以 `git show HEAD:<檔> | npx eslint --stdin --stdin-filename <檔>` 對照既有錯誤數判定.

## 標準圖重產

- **關聯**: `REGEN = argv --baseline || env E2E_REGEN=1`(mocha 模式, 與 sso / perm 之直跑模式不同); 寫檔 / 比對一律經 `runBaselineCase`(2026-09-28 起, 當時出自 w-web-sso srcPack; 2026-09-29 起出自 devDependency w-package-tools-e2e 1.0.2, 2026-09-30 起 1.0.3(產製端逐張印 `[write]`／`[keep]` 與原因), 經 `test/tools/e2eLib.mjs`; 原 `assertOrRegenBaseline` 已刪); `E2E_BASELINE_OUT_DIR` 可把寫檔導到暫存目錄做等價驗證; 貼圖覆蓋 ref `_staref-*.png`(stainfor 與 init E2E-003)只在產製模式自舉, 且**不受 `E2E_BASELINE_OUT_DIR` 導向**(缺檔時直接寫 `test/pics/<flow>/`); 全域技能 §7.6 / §7.9.
- **判斷**: 先取得使用者授權, 只重產受影響之 case(`--grep` 縮範圍). 版面幾何變動時舊 `_staref` 尺寸不合會蓋錯區域——徵狀是覆蓋區位移或殘留邊緣. 工作樹已有未提交之圖時 `git checkout --` 會退回更舊版本, 不可用它還原.
- **處理**: ①`npx mocha test/e2e-<flow>.test.mjs --baseline --grep "E2E-001|E2E-009"`; ②重產前把該 flow 之 `test/pics/<flow>/*.png` 複製到 `./tmp/pics-backup/`(agent 自身作業副本), 產後逐張 md5 比對, 只留預期變更者, 其餘自備份還原; ③幾何變動時先刪對應 `_staref` 再帶 `--baseline` 跑; ④產後人工開圖核對(先 `file` 驗 PNG magic 再 Read), 並以一次不帶 `--baseline` 之全跑確認容差內通過.

## 標準圖之審查與判定由 agent 先行(2026-09-28 起)

- **關聯**: 業主 2026-09-27 於 w-web-sso 授權「e2e 標準圖皆由你先行檢查與做出判定與審查」; 2026-09-28 經三方獨立複審定案擴及 sso / perm / api / task(紀錄: w-web-sso `spec/設計要點與取捨.md` ADR-072 決定 4⑧).
- **判斷**: 標準圖之逐張審查與「可否凍結為 baseline」之判定由 agent 負責, 審畢即可跑 mocha; 產圖本身(重產 / 新產)仍須授權(技能 §7.9). 業主裁示限於設計取捨或產品介面變更.
- **處理**: 以使用者視角判斷「照圖能否操作、畫面有無被改壞」: 與 git HEAD 版逐像素比(差異須落在預期區域)、逐張對照 spec 框住句與操作順序、紅框像素掃描(同色連續 ≥ 20px)、兩語系對稱、抽張重產逐位元比對; 審圖紀錄落檔供業主隨時查閱.

## 後端重啟時機

- **關聯**: `node srv.mjs [settings 路徑]`; `restartBackend(genTempSettings({ ...overrides }))`; `e2e-init`、`e2e-stainfor` 之 `restartBackend`.
- **判斷**: 改 `server/` 下檔案後須重啟後端; 但 **e2e 進行中不可改 `server/`**——`e2e-init` / `e2e-stainfor` 之 `restartBackend` 會重新 spawn 而載入半成品.
- **處理**: 起前 `netstat -ano | grep ":11005 " | grep LISTENING`, 殺自己起的用 `cmd //c "taskkill /F /PID <pid> /T"` 並回驗埠已釋放; 換設定重啟由 e2e 之 `restartBackend(genTempSettings(...))` 完成, 臨時設定寫 `test/_tmp/settings-e2e-<pid>-<seq>.json` 測完由 cleanup 刪; 它會殺佔用 11005 者(含手動起的同專案後端), 為 `CLAUDE.md` 明文例外.

## 登入、SSO 與權限

- **關聯**: `srv.mjs` 之 `getUserByToken` 開發捷徑 `token === 'sys'`(`NODE_ENV === 'production'` 時停用); settings `ssoAppToken` / `ssoBaseUrl`; 授權責任 ADR-022.
- **判斷**: 開發與測試以 `?token=sys` 登入; `ssoAppToken` 為空時不打 SSO、直接回 `{}`; 瀏覽端與應用端皆只放行 `isAdmin` 為 `y`; token 時效與撤銷全交 SSO, 本套件不自管 session.
- **處理**: 要接 SSO 才填 app token 並確認 `ssoBaseUrl`; 正式部署設 `NODE_ENV=production` 即停用 `sys` 捷徑並改提供真實 `getUserByToken`; 認證資料不經任何同步流程進出, 各服務獨立靠自身 token 或 SSO 與 perm.
- **呼叫者身分驗證(2026-10-23 起, ADR-048、R-CONNGATE-01)**: 資料通道連線閘＝token 認證＋部署方 `verifyClientUser(user, apiType)`(`from` 為 w-converhp 入口名, 資料通道呼叫為 `'main'`), 未通過整次連線被拒; 套件不自訂誰可用之政策, 但**不得讓任何非公開入口略過部署方之鉤子**(無關閉選項). 新增任何由外部可觸及之入口(hapi 路由、kpFunExt、資料通道函數)時: 先對照 `sgud/rule/rulebook_backend.md` R-CONNGATE-01 之站點全集與盤點指令, 補測試(`api-connGate`)與該表; 公開入口只限本質上拿不到 token 者, 須經主控複審. 部署方之 `verifyClientUser` 每個資料通道請求(含輪詢)都會被呼叫, 範例與 README 不得再逐次印使用者物件.
- **執行身分與 Authorization 方案(2026-10-23 起, api-run02, ADR-050、R-EXECID-01、R-AUTHSCHEME-01)**: 資料通道之兩個 token(標頭 `Authorization`、本體 `__sysToken__`)各經**同等完整**驗證——`getUserIdByToken` ＝ `authToken(token,'main')`(token 認證＋`verifyClientUser`), 與連線閘共用同一函數, 不另寫第二套; 失敗對外一律 `errUserIdMissing`(不分原因)、srLog 記原因鍵; 因此部署方之 `verifyClientUser` 每個函數呼叫被呼叫兩次(`from` 皆 `'main'`). `Authorization` 須為 Bearer 方案(`reBearerAuth`, 方案名不分大小寫), 不符視同未帶 token. 新增任何「由 token 取得使用者」之路徑時一律經 `authToken`, 不得直接只用 `getUserByToken` 取 id; 跨套件〈使用者身分驗證原則〉第三節之標準註解須保留於 `verifyConn`、`getUserIdByToken`.

## 語系注入

- **關聯**: server 依 settings 之 `language` 注入 `index.html`; 網址 `?lang=` 優先於注入值; 右上語系選單由 `showLanguage` 控顯隱; `server/procLang.mjs`; ADR-019.
- **判斷**: 測「server 注入語系」時**不可帶 `?lang=`**(會蓋掉注入值, 變成假測試); 首次載入即應為注入之語系.
- **處理**: 以 `restartBackend(genTempSettings({ language }))` 換後端初始語系; 新增可見文字一律走 `$t('key')` 並於 `procLang.mjs` 同時加 eng 與 cht.

## 統計資訊頁之資料來源

- **關聯**: `logFd` 下之 srLog 檔(`getStaEvent(7,'hr')`); 掃描核心 ADR-028; `unit-staEvent` / `unit-staEvent-golden`; experience「統計頁只凍圖表漏表」.
- **判斷**: 資料隨執行期 log 累積而漂移, 直接截圖必 flake; 圖表區與統計表區屬同一動態 block, 只凍其一會漏另一.
- **處理**: e2e 要決定性資料: 寫合成 log 到 `test/_tmp/` 專用資料夾, `restartBackend(genTempSettings({ logFd }))` 指過去, 測完還原 `./settings.json` 並刪合成 log; 畫面之圖表區與統計表區以貼圖覆蓋一併凍結; 數值正確性由 `unit-staEvent` 守, 不靠截圖.

## 外部同步 `syncAndReplaceTabs`

- **現行語意(2026-10-23 起, 原則 11, ADR-043; 取代下列「以 rows 取代該 group 全部列(delAll→insert)」之舊語意與「推送端投影…同步列這些欄位為空」之舊說明)**: payload `{ group, rows }`, `rows` 為該 group 之完整清單, 每列帶外部自訂之來源鍵 `srcKey`(group 內唯一且穩定); 於 `apis` 表鎖內依 `srcKey` 差異同步(新增配新 id / 刪除 / 修改保留 id / 不變不寫), 回 `{ nAdd, nUpdate, nDel, nSame }`; 本系統擁有欄位(tokens、authType、authConfigJson、testBaseUrl、default*Json、contentType)一律不寫; 整批驗證全有或全無; 失敗以快照補償(不再非原子). **不提供呼叫端相容(2026-10-23 api-run04, 使用者裁示, ADR-046; 取代 run01 之「相容」)**: `srcKey` 即刻必填, 缺(含只送 `id`)整批拒收 `errRowInvalid`、列帶 `id` 整批拒收 `idNotAllowed`、零寫入; 無 delAll; `provideTabs` 白名單不含 `id`、缺 `srcKey` 於呼叫端即 reject. 保留者僅一次性資料遷移: 既有無 `srcKey` 之外部列, 批次 `srcKey` 等於其 `id` 時視為同一列並於鎖內補 `srcKey`(id 不變、本地欄位保留), 其後只認 `srcKey`, 對不上者刪舊增新. 外審後驗證補強(ADR-043 決策 8): 外部欄位型別(物件/陣列/NaN 拒收, 數字/布林轉字串)、必填以清理後之值檢核、來源鍵字元規則(孤立代理字元/白名單標籤; 「控制字元起首」隨以 id 代替之相容於 run04 移除)、補償分階段+回讀驗證、log 遮蔽 `id[...]`. 實作在 `server/syncApis.mjs`, 規則 R-IMPORT-01. 新增寫入入口或改欄位歸屬前先改 `src/schema/contracts/apis.mjs`(`fieldsExternal`/`fieldsLocal`).

- **關聯**: 端點 `POST /syncAndReplaceTabs?token=<appToken>&keyTable=apis`, payload `{ group, rows }`; 外部推送端 `server/provideTabs.mjs`; err-key `errRowInvalid` / `errRowsInvalid`; 契約見 rulebook「外部同步契約」與 ADR-031.
- **判斷**: `keyTable` 白名單只有 `apis`; 語意為「以 rows 取代該 group 全部列」(delAll group → insert); 逐列檢核(含主鍵, 見下)在 delAll **之前**——任一列無效整批拒且既有資料不動. delAll→insert 非原子(ADR-016): insert 之非確定性失敗(I/O 等)可能部分寫入, 回 `saveWriteFail` 後外部重送即可補回.
- **處理**: 推送端只投影 API 描述資料欄位(id、order、name、description、url、method、version、group、levels、keywords、state、creator、dataSource、md*、*Example); 認證與測試設定欄位(tokens、authType、authConfigJson、testBaseUrl、default*Json、contentType)不同步, 由本站編輯表單管理, 時間欄位由 ORM 補. 每列須為物件且 name、url 非空, 否則回 `errRowInvalid`; 陣列層非空陣列不成立回 `errRowsInvalid`. 回呼叫端只給 err-key(`{ state: 'success'|'error', msg }`), 列索引與欄位名入 srLog; 外部端要顯示文字自行以 lang 查 `procLang`.
- **主鍵(2026-10-14 起, R-SYNC-1, ADR-038)**: 有給 id 之列另須——不含 HTML 標記、UTF-8 ≤ 1978 位元組(LMDB 主鍵上限)、同批不重複、不屬他群組; 違反即整批 `errRowInvalid`(srLog 之 `reason` 為 `xss` / `bytes` / `dup` / `group`), 一律在 delAll 之前. 不帶 id(或 NaN／±Infinity)之列照舊由 w-serv-orm 補. 數字 id(有限數字)自 w-serv-orm 1.1.11 起存為其字串形式(123 → '123'), 回應之 id 亦為字串; 123 與 '123' 為同一主鍵(重複與跨群組皆以 `String(id)` 判定; `pickRowIds` 一律回傳字串, 因跨群組查詢直呼 woItems 不經 procOrm 之轉型——勿改回保留數字, ADR-040). 檢核通過後 ORM 之失敗回 `saveWriteFail`(delAll / insert)或 `getDataError`(查他群組之 select), 原文入 srLog(R-ERR-1).

## 資料通道之表操作(2026-10-14 起)

- **關聯**: `server/getOptDataChannel.mjs`(R-DC-1); w-serv-webdata 1.1.7 起 `useDbOrm=true` 必給 `authorizeExec`; ADR-038、ADR-022 修正紀錄; 測試 `unit-dataChannel`、`api-dataChannel`.
- **判斷**: 前端同步只用表讀取 `apis.select`(不帶參數); 寫入只經 kpFunExt 之 `saveApi` / `deleteApi`(驗證、funNew、lockSave、kmx). 直打 `/api/main` 之 `apis.insert` / `save` / `del` 回 `invalid func[apis.<方法>]` 是設計(不是故障); userId 空或方法非 select 經 `authorizeExec` 回 `errUserNoPermission` 並記 srLog.
- **處理**: 新增寫入能力一律加 kpFunExt 函數(帶驗證與雙擊防護), 不開 `methodsExec`; 新增資料表時 `tableNamesExec` / `tableNamesSync` 由 `ds` 自動涵蓋, 該表 ORM 須可監聽 change(否則 WServHapiServer 建構拋 `kpOrm[<表>] can not listen to change events`). 同步把整表(含 tokens / authConfigJson)給已認證者, 誰可登入由部署方之 `getUserByToken` / `verify*` 決定.

## 建構設定與生命週期(2026-10-14 起)

- **關聯**: `server/WWebApi.mjs` 建構子(R-ORM-1 / R-ORM-2 / R-RES-1 / R-PROC-1); `srv.mjs` 註解; README「Behavior notes」; 測試 `unit-wwebapi-opt`、`unit-wwebapi-lifecycle`(子行程, 不開埠)、`api-lifecycle`(子行程, 8550, 須持鎖).
- **判斷**: `useCheckUser` / `getUserById` / `useExcludeWhenNotAdmin` 給非 undefined / null / false 之值 → 建構即拋(w-serv-orm 之 `checkOptRemoved` 訊息); `serverPort` 須為 1–65535 之整數(可為數字字串), 無效即拋 `invalid opt.serverPort`(w-serv-hapi 1.1.6 對無效 port 會靜默改用 8080, 故本套件先擋). 本套件與 `srv.mjs` 不註冊 process 監聽, 未處理之 rejection 會終止後端行程(重啟交行程管理器).
- **處理**: 優雅關機呼叫回傳物件之 `stop()`(停伺服器 → 清 cacheSt 計時器 → closeAll → srLog.clear; 重複呼叫回同一 promise; 釋放步驟之錯誤以 `error` 事件發出(evEmit, 監聽器拋錯不中斷其餘釋放)). 驗「行程能自行結束」一律用子行程(cwd 設於 `test/_tmp/<案名>/`, 使 dist / uploadTemp / tableTags 之相對路徑落於此), 以「未印 STILL-ALIVE 且離開碼 0」判定; **勿在 repo 根直接執行子行程腳本**——WWebApi 以 cwd 相對路徑寫 `dist/index.html` 等(曾因此產生 `dist/index.html`, 已刪).

## 打包後之可用性(2026-10-14 起, X1)

- **關聯**: `toolg/gDistRollup.mjs`(umd, 打包 `server/WWebApi.mjs` 與其 import 所及之 `server/`、`src/schema/`); `server/staLogs/resolveShellWorker.mjs`、`staLogsCore.callWorker.mjs`; 規則帳本 R-PKG-1; ADR-039; 測試 `unit-resolveShellWorker`; 打包實測腳本之作法見 experience「X1」.
- **判斷**: 打包範圍內新增或修改任何「以模組自身位置定位檔案」之碼(頂層 `__filename` / `__dirname`、`import.meta.*`、`new URL(…, import.meta.url)`、worker 路徑)即適用; cwd 相對路徑(`dist`、`./logs`、`tableTags-web-api.json`)與解析使用者網址之 `new URL` 不適用.
- **處理**: 頂層不宣告 `__filename` / `__dirname`、不用 `import.meta.dirname` / `filename` / `resolve`; 改為首次使用時解析並快取(沿用 `resolveShellWorker` 之 (a)(b)(c)(d)); 以單獨打包該模組成 umd、子行程 `require` 並實際觸發一次之方式驗證(不只看測試綠). 前提 `.npmignore` 不排除 `server/`、`package.json` 無 `exports`——改動任一者須同步改 R-PKG-1.

## 測試分頁之代打請求

- **關聯**: 後端 proxy(繞 CORS); 建構子 opt `isAllowTarget(url)`、`proxyAllowInternal`、`proxyAllowList`; ADR-029、ADR-049(內建目標位址政策, R-PROXYTARGET-01).
- **判斷**: 前端一律經後端 proxy 打目標; 請求內容原文送出、標頭表為唯一真理源; Query / Headers 以有序鍵值對送出, 重複鍵不收斂. **自 1.1.16 起預設拒絕內網與本機位址**(依解析後之 IP、連線位址即檢查位址、轉址逐跳檢查); `isAllowTarget` 為部署方自訂之網址層檢核, 與內建政策並存時兩者皆須通過(先 `isAllowTarget`).
- **處理**: 要連內網或本機目標時於建構子 opt 給 `proxyAllowList`(IP／CIDR／主機名)或 `proxyAllowInternal: 'y'`(參考部署由 `settings.json` 同名鍵轉入); 要再限制可打之目標時另給 `isAllowTarget(url)`, 首跳與轉址每一跳皆會檢核. 測試之代發目標為本機 echo 時, 用 `restartBackend(genTempSettings({ proxyAllowList: ['127.0.0.1'] }))` 或子行程 `opt` 放行 127.0.0.1, 不得改 `settings.json` 預設; 傳輸為 `undici` 套件之 `fetch`＋`Agent`(不得改回 Node 內建 `fetch`, 其無連線位址之注入點). 新增任何出站請求須經同一政策.

## 多人同時編輯(原則 10)之處理(2026-10-22 起)

- **現行(2026-10-23 起, ADR-043; 取代下列「三者目前不共用任何鎖」「第二波依 §7 實作」)**: 第二波已實作. 寫入入口 4 個(saveApi 新增、saveApi 修改、deleteApi、匯入)共用 `apis` 表鎖(`WServOrm` 之 `withTabLocks`/`guardWrite`); 逐列基準(前端 `buildBaseline` 對 store 列自算, 後端鎖內比對); 修改/刪除 `mustExist`; 契約 `src/schema/contracts/apis.mjs`(欄位增減由 `unit-contract` 守門). 規則與驗收對照見 `rulebook_concurrency.md` §9. 跑整合測試用 `test/tools/apiHarness.mjs`(隔離子行程, 埠 8551/8552, 須在測試鎖下: `node C:/opensrcOper/tools/quiet-run.mjs --lock -- <指令>`), 不碰 `./db` 與 11005.

- **關聯**: 規格 `C:\opensrcOper\dspec\多人同時編輯之寫入契約.md`; 本套件帳本 `sgud/rule/rulebook_concurrency.md`(欄位三分類、寫入者全集、契約草案、同步識別、缺陷實證、第二波規劃); 狀態 `sgud/state/state.md`.
- **判斷**: 本套件寫入入口只有 `saveApi`、`deleteApi`、`syncAndReplaceTabs` 三個(資料通道只開 select); 三者目前不共用任何鎖(帳本 §2). 新增任何寫入入口前先查帳本 §2 與 §4, 並同步更新三分類與契約; 欄位增減須同改契約(完整性測試守門, 第二波建立).
- **處理**: 第二波依帳本 §7 實作, 相依 w-serv-orm 共用核心(第 110 項)發布; 探測並行/鎖/草稿問題一律用 `experience.md`「多人同時編輯盤點」記載之隔離環境(獨立 lmdb、埠 8552、`SlowOrm` 注入延遲), 不碰 `./db` 與 11005; 離線工具(`g_initialTestData.mjs` 等)只在服務停止時執行(不經服務表鎖).

## 執行期產物

- **關聯**: `./db`(LMDB)、`./logs`、`tableTags-web-api.json`(w-serv-hapi 依 `fpTableTags` 寫出; 舊名 `tableTags.json` 已廢)、`./testPending`、`test/_tmp`、`dist`.
- **判斷**: 皆為執行期產生, 不當成待辦, 不入版控.
- **處理**: `tableTags-web-api.json` 勿手動編輯; `dist` 需要時自行 `npm run build`.
