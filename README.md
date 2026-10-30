# w-web-api
A web service for APIs.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-web-api.svg?style=flat)](https://npmjs.org/package/w-web-api) 
[![license](https://img.shields.io/npm/l/w-web-api.svg?style=flat)](https://npmjs.org/package/w-web-api) 
[![npm download](https://img.shields.io/npm/dt/w-web-api.svg)](https://npmjs.org/package/w-web-api) 
[![npm download](https://img.shields.io/npm/dm/w-web-api.svg)](https://npmjs.org/package/w-web-api) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-web-api.svg)](https://www.jsdelivr.com/package/npm/w-web-api)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-web-api/WWebApi.html).

## Upgrade Notes

### Breaking change since 1.1.26：console 診斷不再輸出資料值——使用者物件、請求查詢參數值、傳入參數值與外來錯誤原文改為只印鍵名、型別或錯誤類別

**對外行為變更**（不提供舊格式相容）。伺服器行程之標準輸出（console）內容改變，原因：標準輸出常由 pm2、容器或行程管理器收集成檔，使用者物件之 email、name、id 與請求之查詢參數、連線設定等資料值一旦印出即落入這些擷取檔。自本版起 console 診斷一律不印資料值，只印鍵名、型別或固定詞彙（跨套件規格〈診斷輸出與遮罩〉D2）：
- **認證與授權失敗不再印使用者物件**：部署方 `getUserByToken` 所回之使用者物件欄位不齊或 `isAdmin` 值域錯誤（`checkUser`），以及部署方 `verifyClientUser`／`verifyAppUser` 拒絕時，原 `console.log('user', user)` 印出整個物件（含 `id`、`email`、`name` 與部署方之額外欄位），現改為只印鍵名，如 `user (keys: id,name,email,isAdmin)`；`user.isAdmin is not y or n` 一行原印 `isAdmin` 之值，現只印型別，如 `(string)`。
- **請求驗證失敗不再印查詢參數值與請求值**：`token` 缺漏時整包 `req.query` 原只遮 `token` 鍵、其餘參數值照印，現只印鍵名，如 `req.query (keys: foo,keyTable)`；`keyTable` 與 `group` 無效時原印其值，現只印型別，如 `(string)`、`(object)`。請求本體仍只印鍵名與 `rows` 筆數（此項不變）。權杖仍經 `maskTok`（前後各至多 4 字加長度，此項不變）。
- **無效 `opt.serverPort` 只印型別**：建構時 `opt.serverPort` 無效，console 由 `invalid opt.serverPort <值>` 改為 `invalid opt.serverPort (string)`；其餘無效建構參數 1.1.24 起已只印型別。誤傳之字串或物件亦可能帶連線字串等憑證。
- **外來錯誤只印類別與代碼**：資料庫 ORM 建構失敗（`WServOrm init failed`）、`WServHapiServer init failed` 與 `dist` 入口檔 `index.html` 產生失敗，console 原印整個錯誤物件（含訊息、stack、絕對路徑），現只印錯誤名稱與代碼（形狀過濾後，如 `WServOrm init failed Error`；`index.html` 產生失敗時於 `can not generate index.html` 之前印一行 `Error ENOENT`，`ENOENT`、`EISDIR` 等為系統錯誤代碼）；入口檔缺失時不再印其路徑，只印 `invalid fpEntryIn`。**錯誤本身仍原樣拋出**（`throw` 之內容與 1.1.25 相同，建構失敗之 fail-fast 與資源釋放不變）。
- **參考部署與範例**：`srv.mjs` 之 `verifyAppUser` 不再印使用者物件（只印鍵名）、SSO 失敗不印回傳之 `state` 值、`'error'` 事件只印錯誤名稱與代碼；本檔與 `WWebApi` JSDoc 之範例同步改為不印使用者物件與整個錯誤物件，請依樣修改您自己的部署程式。離線工具 `g_provideApis.mjs` 只印送出之筆數，不再印整批資料列；`funTest` 產生測試資料時只印筆數。
- **不變**：HTTP 回應之錯誤鍵、srLog 之內容（認證失敗之 `err` 鍵、`orm-diag` 等）與 1.1.25 相同；`maskTok`／`maskQuery`／`maskUrl` 等 M 契約函式不動（`maskQuery` 不再被本套件之 console 呼叫，仍保留供四個 web 套件共同之契約測資）。
- **若您以 stdout 文字做告警或解析**：上列各行格式已變（無資料值）；需要使用者或請求之細節請改讀 srLog（`logFd`，記有 `userId`、入口名與錯誤鍵）。

### Breaking change since 1.1.25：srLog 內 `orm-diag` 之 `safe` 只保留白名單鍵（w-serv-orm 公開之 `SAFE_KEYS`、`errType`、`errCode`）；相依下限升為 `wsemi` ^1.9.33、`w-serv-orm` ^1.1.23

**對外行為變更**（不提供舊格式相容）。本套件把 w-serv-orm 之診斷輸出寫入 srLog 前，另依 w-serv-orm 公開之 `SAFE_KEYS`（`w-serv-orm/src/safeKeys.mjs`，凍結陣列，目前為 `n`、`ks`、`skipped`、`ok`、`type`、`reason`、`msgs`、`table`、`tables`、`keys`、`nOther`）過濾 `safe` 之頂層鍵：
- **ORM 診斷日誌只保留白名單鍵**：srLog 之 `orm-diag` 行，其 `safe` 只含 `SAFE_KEYS` 內之鍵與恆保留之 `errType`、`errCode`；白名單外之鍵連同其值、巢狀物件一律丟棄、不寫入日誌。這是第二道防線（w-serv-orm 1.1.22 起於產生端已只輸出白名單鍵），使日後產生端新增未登錄之鍵時不會流入伺服器日誌。
- **正常情況下日誌內容不變**：w-serv-orm 1.1.23 實際產出之鍵皆在白名單內，`label`、`event`、`level: 40`、`safe` 之鍵與值與 1.1.24 相同。依 `safe` 欄位做統計或告警者，只應依賴上列白名單鍵與 `errType`、`errCode`。
- **相依下限**：`wsemi` ^1.9.33（`genDiagFunLog` 之 `opt.safeKeys`）、`w-serv-orm` ^1.1.23（公開 `SAFE_KEYS`）。本套件從 w-serv-orm 取用者限公開入口：主入口、`safeKeys.mjs`、`baseline.mjs`，不 import 其診斷相關之內部檔（`getDiagBrief.mjs` 等）。
- **開發相依**：`w-package-tools-e2e` ^1.0.12 移除 `parseListenerPids`，`test/tools/e2eLib.mjs` 同步不再轉出該名；僅影響本套件之測試工具，不影響對外 API 與標準圖。

### Breaking change since 1.1.24：srLog 內 `orm-diag` 之 `safe` 由 JSON 字串改為物件；診斷輸出之序列化與遮罩改用 wsemi 共用函數；無效建構參數之 console 只印型別

**對外行為變更**（不提供舊格式相容）。w-serv-orm 之診斷輸出（寫入失敗、輸入被拒、ORM 錯誤被攔截）仍寫入 srLog（`logFd`，預設 `./logs`）：每筆一行 `warn`、`event: "orm-diag"`，只有 `label` 與安全摘要 `safe`，不含主鍵、資料值與錯誤原文，console 不輸出。自本版起：
- **`safe` 為物件**：1.1.23 以前為 JSON 字串（`"safe":"{\"n\":1,\"ks\":[0]}"`），現為物件（`"safe":{"n":1,"ks":[0]}`）。w-serv-orm 層無摘要之站點（如 `apis.save row not found`）原為空字串 `""`，現**不輸出 `safe` 欄**。`label`（表名與操作，控制字元換 `?`、至多 200 字元）、`event`、`level: 40` 不變。
- **讀這些日誌之下游**：若您以腳本、日誌收集規則或統計逐行解析 srLog，並把 `safe` 當字串再 `JSON.parse`，請改為直接取物件、並容許無 `safe` 欄。本套件之統計資訊頁（`getStaEvent`）只計 `event` 次數，不受影響。
- **`safe` 之內容形狀隨 w-serv-orm 1.1.22 改變**：只留白名單之鍵（如 `n`、`ks`、`table`、`msgs`、`errType`、`errCode`）；`errType` 只列內建錯誤類別名（驅動之類別名一律為 `Error`）；`errCode` 只列 w-serv-orm 明列之代碼。依 `errType` 值域或 `safe` 欄位做統計者請對照 w-serv-orm 之說明。
- **相依下限**：`wsemi` ^1.9.31（`genDiagFunLog`；本套件不再自寫序列化與控制字元處理，`server/ormDiagLog.mjs` 已刪除）、`w-serv-orm` ^1.1.22。診斷輸出之正規化規則與選項以 wsemi 之 `genDiagFunLog`、`getDiag` 說明（JSDoc）為準；本套件不提供 `logDetail` 開關。
- **無效建構參數之 console 輸出**：建構 `WWebApi` 時 `WOrm`、`url`、`db`、`getUserByToken`、`verifyClientUser`、`verifyAppUser` 驗證失敗，console 由印出傳入之值改為只印型別（如 `invalid url (object)`；`url` 可為含帳密之連線字串，誤傳含帳密之設定物件時不再洩漏），拋出之錯誤訊息不變。
- **含憑證之外來值**：資料庫 ORM 於建構或 `stop()` 之 close 失敗時拋出／reject 之錯誤，若訊息帶連線字串之帳密，經 `'error'` 事件、console 與拋出之錯誤對外時憑證已由 w-serv-orm 1.1.22 遮罩（`***`），本套件於 `test/api-ormDiagCred.test.mjs` 釘住此契約。

### Behavior change since 1.1.19：系統函數收緊（`sysFuncsPublic` 只公開 `[sys:getFuncList]`）；輪詢須帶 token——已發布之舊前端建置檔升版後輪詢被拒，需重新載入頁面

**行為變更**。資料通道有三個系統函數：`[sys:getFuncList]`（函數名稱清單）、`[sys:getTableTags]`（同步表時間戳）、`[sys:polling]`（輪詢，取得推播）。w-serv-webdata 之 `sysFuncsPublic` 預設三者皆公開（為相容舊前端），本版起**本套件顯式只公開 `[sys:getFuncList]`**（跨套件原則：只回公開資訊者可公開，其餘須身分）。
- **相依**：`w-serv-hapi` 升為 `^1.1.8`（連帶 w-serv-webdata 1.1.16、w-serv-broadcast 1.1.12）；前端元件隨升版，**輪詢於請求本體帶 `__sysToken__`**（本套件前端以登入後之使用者 token 提供，`src/main.js` 之 `getToken`；未取得 token 前不連線〔`useWaitToken`〕）。
- **輪詢須帶有效 token**：輪詢（本體為合法 `clientId` 者；`clientId` 不合法者在身分關卡前即被輪詢層拒絕）帶 `__sysToken__` 者一律反查（與資料通道函數同一完整驗證：token 認證＋您的 `verifyClientUser(user, 'main')`＋系統管理者），不通過被拒（`[sys:polling] permission denied`）；**不帶 `__sysToken__` 鍵者被拒**。輪詢之 `clientId` 與**本體 token 之使用者**（`userId`，非 token 字串，亦與標頭 token 無關）綁定：先到先綁，同一 `clientId` 改以他人身分輪詢被拒；被拒之輪詢不建立、不刷新綁定，也不取走佇列。綁定於該 `clientId` 最後一次成功輪詢後逾約 10 秒（框架之在線逾時）解除；整頁重新載入會產生新的 `clientId`。
- **已發布之舊前端建置檔**（本套件舊版 `dist/`、或自行以舊版 w-serv-hapi 元件建置之前端）其**輪詢**不帶 token（舊元件之函數呼叫仍帶 `__sysToken__`），**升版後輪詢被拒——使用者須重新載入頁面**（重新載入即取得新前端；已開啟之舊頁面不再收到推播，若以舊建置檔於升版後重新連線，畫面會停在「已登入」而不載入主畫面——以真瀏覽器剝除輪詢 token 模擬實測）；自行建置前端者須升 w-serv-hapi 至 `^1.1.8` 後重建，並於 `WServHapiClient` 提供 `getToken`。已載入之頁面若中途換身分、或 token 被撤銷／失效，輪詢同樣被拒而不再收到推播，請重新載入頁面（框架語意）。
- **影響範圍**：本套件之資料通道原已由連線閘（標頭 token，只限系統管理者）與執行身分（`getUserIdByToken`，對空或無效 token 拒絕）把關，故 `[sys:getFuncList]` 雖列為公開，實際仍須有效身分；`[sys:getTableTags]` 本就無法匿名呼叫。本版新增之防線只在**輪詢**（本體不帶 token 鍵者原被放行）。標頭 token 有效之系統管理者等級呼叫者，其他入口之存取規則不變。
- **為何不需如 w-web-sso 另公開 `[sys:polling]`**：sso 之登入頁於登入前（無 token）即須連線，故另公開輪詢；本套件之前端待登入取得 token 後才連線，`getUserIdByToken` 為真實反查，不需公開。
- 系統函數 × 呼叫者之實測矩陣見 `test/api-sysFuncs.test.mjs`（呼叫者 7 類 × 協定 4 種〔新：本體帶同一 token、舊：不帶 token 鍵、空字串、他人〕× 系統函數 3 個）。

### Behavior change since 1.1.18：應用系統路由（`POST /syncAndReplaceTabs`）由套件自行要求系統管理者等級；後台登入檢查成功只回欄位白名單

**行為變更**（兩處）。token 由 w-web-sso 簽發，本套件經您的 `getUserByToken(token)` 反查：**使用者 token** 代表登入者；**應用系統 token**（反查回 `isApp: 'y'`，選用欄位）分兩種用途——**使用者用途**（綁定使用者，反查回所綁使用者之實際資料，等級＝該使用者之 `isAdmin`）與**系統服務用途**（不綁使用者，反查回虛擬身分：`id` 為 `app:<金鑰主鍵>`、`isAdmin` 為 `'y'`）。本套件不簽發 token、不分辨用途，**一律以反查所回之 `isAdmin` 判等級**（與 1.1.17 之 `assertAdmin` 同一判準）；是否簽發系統服務用途或綁定系統管理者之應用系統 token、交給誰使用，由您（專案方）評估與負責。
- **應用系統路由** `POST /syncAndReplaceTabs?token=…&keyTable=apis`（外部匯入）：本版起由套件自行要求呼叫者為**系統管理者等級**，順序為 token 認證 → 您的 `verifyAppUser(user, from)` → 系統管理者等級。
  - **放行**：使用者 token 之系統管理者、應用系統 token・使用者用途且所綁使用者為系統管理者、應用系統 token・系統服務用途。
  - **拒絕**（`{ state: 'error', msg: 'errUserNotAdmin' }`，固定鍵，不回顯 token 與使用者資料；ORM 零操作、零寫入；記 srLog `api/syncAndReplaceTabs` error）：使用者 token 之一般使用者、應用系統 token・使用者用途且所綁使用者為一般使用者。
  - **欄位檢查**：反查結果須經與瀏覽端（後台登入檢查、資料通道）**相同的欄位檢查**——`id`、`email`、`name` 為非空字串，`isAdmin` 限 `'y'`／`'n'`；不通過回 `errUserIdMissing`／`errUserEmailMissing`／`errUserNameMissing`／`errUserRoleMissing`（您的 `verifyAppUser` 零呼叫）。理由：等級取自 `isAdmin`、稽核欄 `userIdUpdate` 取自 `id`，缺欄或值不合法（如 `'Y'`）是部署設定錯誤，不能被靜默當成一般使用者，也不另寫第二份欄位規則。
  - 您的 `verifyAppUser(user, from)`（`user` 為拷貝，`from` 為 `'syncAndReplaceTabs'`）**照舊先被呼叫、只能再收緊**，不能放寬；鉤子改寫傳入之物件（如把 `isAdmin` 改為 `'y'`）不影響等級判斷。
  - **影響與遷移**：原本 `isAdmin` 為 `'n'` 而 `verifyAppUser` 放行者（例如 `verifyAppUser` 一律回 `true`）過去可匯入，自此被拒；`getUserByToken` 對應用系統只回 `id`（缺 `email`、`name`、`isAdmin`）之虛擬使用者過去可匯入，自此被拒——請補齊四欄，且 `isAdmin` 為 `'y'`（w-web-sso 系統服務用途之反查已含）。系統管理者等級之行為不變；`verifyAppUser` 不必再以 `isAdmin` 判斷。`srcKey` 同步語意與 `keyTable` 白名單不變。
- **後台登入檢查** `GET /api/getUserByToken?token=`：成功時 `msg` **只含 `id`、`name`、`email`、`isAdmin` 四個欄位**（單一來源 `server/pickLoginUser.mjs` 之 `fieldsLoginUser`），不再原樣回傳您的 `getUserByToken` 所回物件（`password`、`tokenVerify`、`description`、`isApp` 等不會出現於回應）。前端只用 `name`、`email` 顯示登入者，故不含 `isApp`（等級只看 `isAdmin`）。錯誤回應不變（一般使用者仍回 `errUserNotAdmin`）。
- **部署方使用者物件含拋錯之取值器（getter）時一律固定鍵拒絕**（順帶修正，適用後台登入檢查、公開清單、外部匯入與資料通道）：額外欄位之取值器拋錯 → 視同您的 `verifyClientUser`／`verifyAppUser` 拒絕（`errUserNoPermission`）；必要欄位（`id`、`name`、`email`、`isAdmin`）之取值器拋錯 → 視同查無使用者（`errUserNotFound`）；例外原文不再出現於回應與 srLog，您的鉤子不被呼叫。
- **存取表**（驗收依據，測試 `test/api-accessMatrix.test.mjs`，19 個入口 × 6 類呼叫者；U＝使用者 token・一般使用者，A＝使用者 token・系統管理者，AU＝應用系統 token・使用者用途，AS＝應用系統 token・系統服務用途）：

| 入口 | 無 token | U | A | AU 綁一般使用者 | AU 綁系統管理者 | AS |
|---|---|---|---|---|---|---|
| 前端靜態檔 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/getApisList?token=`（公開欄位清單） | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /api/getUserByToken`（後台登入檢查） | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| `POST /syncAndReplaceTabs`（外部匯入） | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| `/api/main` 之 10 個函數（`getWebInfor`、`getApisList`〔整列〕、`saveApi`、`deleteApi`、`proxyRequest`、`getStaEvent`、表 `apis.select`、系統函數 3） | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| 其餘 5 條通訊路由（`ulctr`、`slc`、`dwgfn`、`dwgf`、`dw`；✓＝僅通過連線閘，本套件未註冊監聽，通過後亦不受理） | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |

- **註解**：`getUserByToken` 之使用者物件可另提供選用欄位 `isApp`（`'y'` 表示應用系統 token 之反查結果；本套件不據以判斷等級，僅隨使用者物件之拷貝原樣交給 `verifyClientUser`、`verifyAppUser`）；`verifyAppUser` 之呼叫為 `(user, from)`。範例（`verifyAppUser` 不必再判斷 `isAdmin`，僅示範依 `from` 再收緊）：
```alias
let verifyAppUser = (user, from) => {
    //套件已自行要求系統管理者等級(getUserByToken 所回 isAdmin 為 'y'；檢查在本函數之後)，此處只能再收緊
    return from === 'syncAndReplaceTabs'
}
```

### Behavior change since 1.1.17：API 管理後台與資料通道只限系統管理者（套件自行強制）；一般使用者以 token 取得 API 清單（`GET /api/getApisList`）

**行為變更**——本套件**無自有使用者表**，**系統管理者＝您的 `getUserByToken(token)` 所回使用者物件之 `isAdmin` 為 `'y'`**（`'n'` 為一般使用者；值域本來就限 `'y'`／`'n'`）。本版起，API 管理後台與資料通道**由套件自行**只限系統管理者，**不論您的 `verifyClientUser` 如何放行**（您的函數照常先被呼叫，仍可再收緊，但不能放寬）：
- **後台登入檢查** `GET /api/getUserByToken?token=`：一般使用者回 `{ state: 'error', msg: 'errUserNotAdmin' }`（固定錯誤鍵，不回顯 token 與使用者資料，記 srLog `api/getUserByToken` error）；前端顯示「無權進入 API 管理後台」（eng：`No permission to enter the API management console`），不進主畫面、不停在連線中、**不轉址**（已通過驗證者轉去登入頁無用，且 SSO 登入後導回本頁會形成轉址迴圈）。
- **資料通道**（`/api/main` 之全部 `kpFunExt`〔`getWebInfor`、`getApisList`、`saveApi`、`deleteApi`、`proxyRequest`、`getStaEvent`〕、表 `select`、系統函數 `[sys:*]`，以及 w-converhp 其餘五條上傳／下載路由）：連線閘與執行身分（請求本體 `__sysToken__`）**兩個 token 各自**要求 `isAdmin === 'y'`，順序為 token 認證 → 您的 `verifyClientUser(user, from)` → 系統管理者；一般使用者整次連線被拒（`permission denied`；函數不執行、ORM 零操作、零寫入、第三方憑證 `tokens`／`authConfigJson` 零外洩），srLog `verifyConn`／`getUserIdByToken` 記 `err: 'errUserNotAdmin'`。判斷取自 `getUserByToken` 所回之原值（交給 `verifyClientUser` 的是拷貝，鉤子改寫 `isAdmin` 不影響結果）。
- **影響與遷移**：原本 `isAdmin` 為 `'n'`、持有效 token 且您的 `verifyClientUser` 放行者（例如 `verifyClientUser` 一律回 `true`），過去能登入後台並讀寫全部 API（含 `tokens`、`authConfigJson`）；自此被拒。系統管理者之行為不變。`verifyClientUser` 不必再以 `isAdmin` 判斷（可刪），只需要再收緊時才寫（例如依 `from` 只放行 `'getUserByToken'`、`'getApisList'`、`'main'`，或排除特定帳號）。
- **新入口** `GET /api/getApisList?token=<token>`（一般使用者**與**系統管理者皆可用）：回 `{ state: 'success', msg: [列…] }`，列為**啟用中**（`isActive` 為 `'y'`）之 API，且每列**只含公開欄位**：`id`、`order`、`name`、`description`、`url`、`method`、`version`、`group`、`levels`、`keywords`、`state`、`creator`、`dataSource`、`mdInputParams`、`inputExample`、`mdOutputParams`、`outputExample`（單一來源 `src/schema/contracts/apis.mjs` 之 `fieldsPublic`）；**固定排除**第三方憑證 `tokens`、`authConfigJson`、測試設定 `testBaseUrl`、`authType`、`defaultHeadersJson`、`defaultQueryJson`、`defaultBodyJson`、`contentType`，與伺服器專有欄位 `timeCreate`、`timeUpdate`、`isActive`、`userIdUpdate`、`srcKey`。token 須通過完整驗證：`getUserByToken` 查得使用者（欄位齊備）＋您的 `verifyClientUser(user, 'getApisList')`（`from` 為 `'getApisList'`；您可以只放行有權取清單者）；未帶 token 回 `errTokenNoPermission`，查無使用者 `errUserNotFound`，欄位不齊 `errUser…Missing`，鉤子拒絕 `errUserNoPermission`，ORM 讀取失敗 `getDataError`（皆為 `state: 'error'`，不含清單、不含憑證）。成功記 srLog `api/getApisList`（只含 `userId`）。此路由取代原已註解而從未對外存在之 `GET /getAPIsList`（改名並加 `/api` 前綴，與 `/api/getUserByToken` 同為瀏覽端以 token 進入之入口，並與資料通道函數同名但不同內容——後者回整列、僅系統管理者），故無相容問題。
- 新語系鍵 `errUserNotAdmin`、`csErrNotAdmin`（`server/procLang.mjs` eng／cht；前端未登入畫面走內建字典）。參考部署 `srv.mjs` 增測試權杖 `{token-for-nonadmin}`（一般使用者，`NODE_ENV === 'production'` 時不生效），其 `verifyClientUser` 改為只依 `from` 收緊、不再以 `isAdmin` 判斷。
- 範例（您的 `verifyClientUser` 不必再判斷 `isAdmin`，僅示範依 `from` 再收緊，其餘入口預設拒絕）：
```alias
let verifyClientUser = (user, from) => {
    //套件已自行限制後台('getUserByToken')與資料通道('main')只限系統管理者(getUserByToken 所回 isAdmin 為 'y')，
    //此函數先被呼叫、只能再收緊；'getApisList' 為一般使用者取 API 清單之入口
    return from === 'getUserByToken' || from === 'getApisList' || from === 'main'
}
```

### Behavior change since 1.1.16：測試分頁代發請求（`proxyRequest`）預設拒絕內網與本機位址（可開關、可調整）

**行為變更**——測試分頁之代發請求（資料通道函數 `proxyRequest`，由後端代打目標 API）原本**不限制目標**（只有您自行傳入 `opt.isAllowTarget` 才檢查），任何通過連線閘之使用者可令後端連到本機服務、內網主機或雲端中繼資料位址（伺服端請求偽造，SSRF）。本版起**預設拒絕**：
- **拒絕之目標**（依**實際解析後之 IP** 判斷，凡非全域單播位址一律拒絕）：loopback（`127.0.0.0/8`、`::1`，含 `localhost` 與 `*.localhost` 名稱）、私有網段（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`fc00::/7`）、鏈路本地（`169.254.0.0/16`〔含雲端中繼資料 `169.254.169.254`〕、`fe80::/10`）、CGNAT（`100.64.0.0/10`）、未指定位址（`0.0.0.0`、`::`）、保留／文件／多播位址，以及 IPv4 映射或內嵌之 IPv6（`::ffff:127.0.0.1`；NAT64、6to4 依其內嵌之 IPv4 判斷）。IP 之縮寫與其他寫法（`127.1`、`2130706433`、`0x7f.0.0.1`）依網址正規化後之位址判斷。
- **判斷時機**：IP 字面值於連線前檢查；主機名於**連線當下**解析並檢查**全部**解析結果（任一位址不被允許即整次拒絕），連線所用之位址即檢查過之位址（不二次解析，防「檢查後才解析到別的位址」之 DNS rebinding）；**轉址每一跳皆檢查**（轉址到內網一樣被拒）。
- **被拒時**回固定錯誤鍵 `errReqTargetNotAllowed`（不回顯目標位址與憑證），並記 srLog：event `proxyRequest-target`、`reason` 為 `internalAddress`（IP 字面值）／`internalName`（`localhost` 名稱）／`resolvedInternal`（主機名解析到內網）／`isAllowTarget`（您傳入之 `isAllowTarget` 於首跳回 `false`；轉址跳之 `isAllowTarget` 拒絕沿用原事件 `proxyRequest-redirect`）、`hop` 為第幾個目標（0 為首跳）；log 不含網址與位址。
- **設定**（於 `WWebApi` 之 `opt`；參考部署由 `settings.json` 之同名鍵經 `srv.mjs` 轉入）：
  - `proxyAllowInternal`：`'n'`（預設）或 `'y'`（亦接受布林）——**整體開關**，`'y'` 關閉此內建拒絕（僅限部署於可信任網路、代發目標皆可信者）。
  - `proxyAllowList`：陣列，**調整放行範圍**。項為 IP（`'127.0.0.1'`）、CIDR（`'10.0.0.0/8'`、`'fd00::/8'`）或主機名（`'api.internal'`，不分大小寫，不含 port 與萬用字元）。IP／CIDR 涵蓋之位址不受拒絕（IPv4 映射之 IPv6 亦以其 IPv4 比對）；**主機名所列之主機，其解析結果不受拒絕（含解析到內網），故只列可信之主機名**；`localhost` 名稱須列 `localhost` 本身（列 `127.0.0.1` 不涵蓋名稱）。公開位址不受清單影響。
  - 設定不合法（`proxyAllowInternal` 非 `'y'`／`'n'`／布林；`proxyAllowList` 非陣列或項格式錯誤〔含末段為數字或十六進位之寫法，如 `0x7f000001`：URL 會把它當 IPv4，列了也永不命中〕）建構即拋 `invalid opt.proxyAllowInternal`／`invalid opt.proxyAllowList`，不退回預設；兩者未給或給 `undefined`、`null` 時採預設（拒絕、空清單），`proxyAllowInternal` 之 `null` 與 `undefined` 同義。
- **與 `opt.isAllowTarget` 並存時兩者皆須通過**：每一跳先呼叫 `isAllowTarget(url)`（您自訂之網址層檢核），再做內建位址檢查（解析後之位址層）。`isAllowTarget` 回 `true` **不能**放寬內建拒絕；`proxyAllowList` 之放行亦不繞過 `isAllowTarget`（它仍可回 `false` 拒絕）。要連內網目標請用 `proxyAllowList`（或 `proxyAllowInternal: 'y'`），不要只靠 `isAllowTarget`。`isAllowTarget` 收到之網址即**實際將送出者**（首跳為 `query` 列併入後、經 URL 正規化之網址；轉址跳為 `Location` 解析後之網址）；可為同步或非同步函數，回傳 `false`（或 Promise 解析為 `false`）拒絕，**拋錯或 reject 視同拒絕**（fail-closed；回應仍為固定鍵 `errReqTargetNotAllowed`，不外洩拋出之內容）。（1.1.15 及之前：只有同步回 `false` 才拒絕，非同步函數之 `false` 被當成放行、拋錯原樣外送，且首跳收到之網址不含 `query` 列。）
- **影響與遷移**：代發目標原為內網或本機者（如測試分頁連 `http://localhost:…`、內部 API 主機）自此被拒，請依需要加入放行清單，例如 `proxyAllowList: ['127.0.0.1', '10.20.0.0/16', 'api.internal']`。
- 代發改以 `undici`（新增相依，`^7.28.0`）之 `fetch` 與連線池發出，以便在連線當下檢查位址（Node 內建 `fetch` 無此注入點）；請求內容、標頭（預設 `User-Agent` 仍為 `node`）、轉址、回應格式不變。
```alias
let opt = {
    // proxyAllowInternal: 'n', //'y' 整體關閉內網與本機位址拒絕（僅限可信任網路）
    // proxyAllowList: ['127.0.0.1', '10.20.0.0/16', 'api.internal'], //只放行所列之 IP、CIDR、主機名
}
```

### Behavior change since 1.1.16：資料通道之執行身分（`__sysToken__`）與連線閘同等完整驗證；`Authorization` 須為 `Bearer` 方案

**行為變更**：
- **執行身分**：資料通道每個請求帶兩個 token——`Authorization` 標頭（連線閘驗，見下節）與請求本體之 `__sysToken__`（函數執行前以它反查使用者 id）。兩者可為不同值；框架（w-serv-webdata）不比對，w-serv-orm 自 1.1.10 起也不做使用者檢查，故「反查使用者」即驗證身分之步驟，屬本套件之責。本版起對本體 token 做**與連線閘同等完整之驗證**：token 認證（查得使用者且 `id`／`email`／`name`／`isAdmin` 齊備）＋ `verifyClientUser(user, 'main')`。不通過 → **函數不執行**（ORM 零操作、零寫入），回應為固定鍵 `errUserIdMissing`（不分原因、不回顯 token 與使用者資料），srLog event `getUserIdByToken` 記認證或授權之原因鍵（`errUserNotFound`／`errUser…Missing`／`errUserNoPermission`）。兩個 token 皆有效而不同者，以**本體 token 之使用者**執行（寫入之 `userIdUpdate` 為其 id）。修正前只取外部 `getUserByToken` 之 id，標頭為放行者、本體為被 `verifyClientUser` 拒絕者時函數照常執行且以被拒者之身分寫入。
- **`verifyClientUser` 之呼叫次數**：資料通道之每個函數呼叫，您的 `verifyClientUser` 被呼叫**兩次**（標頭 token 一次、本體 token 一次，`from` 皆 `'main'`；正常使用時兩者為同一使用者）；未通過認證者（查無、欄位不齊）不呼叫。請保持輕量，勿每次呼叫外部服務（可自行快取）。`getUserByToken` 之呼叫次數不變（本來即兩次）。
- `[sys:polling]`（前端輪詢）由 w-serv-broadcast 之輪詢層於資料通道執行之前同步回應：`getUserIdByToken` 對它仍會被呼叫（`verifyClientUser` 仍為兩次），但其結果不影響輪詢之回應，故輪詢之身分只由連線閘把關；此為框架層行為，非本套件函數。
- **`Authorization` 須為 `Bearer` 方案**（方案名不分大小寫，與憑證之間一個以上空白）：原連線閘不驗方案，直接刪去標頭前 7 個字元當 token，`Basic  <token>`、`Token  <token>` 等亦能通過；本版起方案不符、缺方案或缺憑證者視同未帶 token（`permission denied`，不呼叫 `verifyClientUser`）。本套件之前端一律送 `Bearer`；自行直打資料通道之外部呼叫者須改用 `Authorization: Bearer <token>`。

### Behavior change since 1.1.16：部署方之 `verifyClientUser` 自此對資料通道生效（須依 `from`（入口）區分）

**行為變更**——資料通道（`/api/main`：前端畫面載入、同步與操作所走之連線，含 `getWebInfor`、`getApisList`、`saveApi`、`deleteApi`、`proxyRequest`、`getStaEvent`、表 `select` 與系統函數 `[sys:*]`；以及 w-converhp 之上傳／下載路由）之連線閘，原本只做 token 認證（`getUserByToken` 查得使用者，且 `id`／`email`／`name`／`isAdmin` 齊備），**不呼叫**您傳入的 `verifyClientUser`；本版起連線閘＝**token 認證＋`verifyClientUser(user, from)`**。未通過者整次連線被拒（w-converhp 回 `permission denied`；函數不執行、ORM 零操作、零寫入），並記 srLog（event `verifyConn`、含 `apiType`；授權未通過記 `err: 'errUserNoPermission'`，認證失敗依原因記 `errTokenNoPermission`／`errUserNotFound`／`errUser…Missing`；不含 token 與使用者資料）。認證在前、授權在後：未通過認證者不呼叫您的函數。
- **`from` 是入口名**（w-converhp 之 `apiType`）：資料通道之函數呼叫一律 `'main'`；w-converhp 另有 `'upload-controller'`、`'upload-slice'`、`'download-get-filename'`、`'download-get-file'`、`'download'` 五條（本套件未註冊上傳／下載監聽，請求即使通過連線閘亦不受理，但連線閘仍先經 `verifyClientUser`）。登入檢查 `GET /api/getUserByToken` 之 `from` 仍為 `'getUserByToken'`；外部應用 `POST /syncAndReplaceTabs` 仍走 `verifyAppUser`（`from` 為 `'syncAndReplaceTabs'`）；前端靜態檔仍為公開。以上皆不變。
- **影響**：使用者原本只要通過登入檢查（`from` 為 `'getUserByToken'`）即可連資料通道；現在**每個**資料通道請求還要通過 `verifyClientUser(user, 'main')`。若您的 `verifyClientUser` 不看 `from`（如參考部署之 `return user.isAdmin === 'y'`），**持續被它放行之使用者的正常操作不變**（它本來就拒絕、但過去因資料通道不呼叫它而仍能直打資料通道者，例如 `isAdmin` 為 `'n'` 卻持有效 token，自此被拒——這正是本變更的目的）；若它只接受 `'getUserByToken'`、或對某些使用者在非登入入口回 `false`，這些使用者**登入成功後畫面載入與同步會被拒**，請把 `'main'` 納入。建議採預設拒絕：只放行您列舉之入口名。
- 拋錯、reject 或回傳 falsy 值皆視同拒絕（與登入檢查相同，且不外洩拋出之內容；回傳 `1` 等 truthy 非 `true` 之值兩處皆視為通過，建議回傳布林）。通過 token 認證之每個資料通道請求（含前端輪詢與同步）都會呼叫（連線閘一次；函數執行時另對本體 token 再驗一次，見上節）；未通過認證者（無 token、未知 token、使用者欄位不齊）不會呼叫。請保持輕量，勿每次呼叫外部服務（可自行快取）。
- 套件仍不自訂「誰可使用」之政策，政策仍由您的 `getUserByToken`／`verifyClientUser`／`verifyAppUser` 決定；只是不再有「token 認證通過即可使用資料通道、`verifyClientUser` 對資料通道無效」之入口。
- 範例（依 `from` 分流，其餘入口預設拒絕）：
```alias
let verifyClientUser = (user, from) => {
    if (from === 'getUserByToken' || from === 'main') { //登入檢查與資料通道
        return user.isAdmin === 'y' //僅系統管理者使用
    }
    return false //上傳／下載等其他入口預設拒絕
}
```
- 其他：同一請求以 `Authorization` 標頭（連線閘）與本體 `__sysToken__`（函數執行時取 userId）各帶不同 token 之情形，本版起兩者各經完整驗證，以本體 token 之使用者執行（見上節）。

### Breaking change since 1.1.15：外部匯入須送 `srcKey`、不得送 `id`（不提供呼叫端相容）

**破壞性變更**——外部端（`POST /syncAndReplaceTabs` 之呼叫端與 `provideTabs`）須改：
- **每列必須帶 `srcKey`**（外部自訂、於該 `group` 內唯一且穩定之非空字串）。缺 `srcKey`、`srcKey` 為 `null`／空字串／非字串（含「只送 `id`」）→ **整批拒收** `errRowInvalid`（即規格之 `srcKeyInvalid`；列索引與原因只入伺服端 srLog，不回顯值）、零寫入。**不再以 `id` 代替 `srcKey`**，也不再有「`srcKey` 與 `id` 皆無之列每次新增」與其警告事件（`syncAndReplaceTabs-idAsSrcKey`、`syncAndReplaceTabs-noSrcKey`）。
- **不得送 `id`**：任一列帶 `id`（即使同時帶 `srcKey`；`id` 為 `null`／空字串亦然）→ **整批拒收** `idNotAllowed`（`server/procLang.mjs` 有 eng／cht 文字）、零寫入。內部 `id` 由本系統產生，外部不得指定；因此外部匯入也不能再使已刪除之列以原 `id` 重現。
- **`provideTabs(url, keyTable, group, rows)`**：白名單不再含 `id`（`rows` 內有 `id` 欄位也不送出）；任一列缺 `srcKey`（缺、空字串或非字串）→ 於呼叫端即 reject（`Error`，只含列索引）、不送出。
- **一次性資料遷移（不是呼叫端相容）**：升級前已存在、無 `srcKey` 之外部列（舊版同步寫入，或 1.1.14 相容期所寫），於**首次匯入**時，批次 `srcKey` **等於其 `id`** 者視為同一列，於 `apis` 表鎖內補上 `srcKey`——`id` 不變、`tokens` 等本系統擁有欄位與 `timeCreate` 保留；外部擁有欄位內容相同只補鍵、不計入 `nUpdate`，內容不同則照一般修改更新並計入 `nUpdate`；其後只認 `srcKey`。**對不上者依差異同步處理**：批次無者刪除、批次有而庫無者新增（配新 `id`）；刪除無 `srcKey` 之列記 warn `syncAndReplaceTabs-delNoSrcKey`。故外部端欲保留既有列之 `id` 與本地欄位，**首次匯入請以其 `id` 作為 `srcKey`**，之後繼續沿用該值即可。注意：`srcKey` 與其他欄位一樣會先還原 `base64:` 前綴（字面值以 `base64:` 開頭之舊 `id` 須自行以 `base64:` 包裝後再送）；`srcKey` 不得含 HTML 標記、不得超過 1978 位元組，舊 `id` 若不符（含標記者）無法以其值作為 `srcKey`，該列視為對不上而刪舊增新。
- 部署端無須遷移腳本；後台對外部列之保護、多人同時編輯、差異同步之其餘行為不變。

### Upgrading from 1.1.13 and earlier（多人同時編輯、外部匯入）

需要 `w-serv-orm` 1.1.17 以上。**單一行程部署**，同一資料表只由同一個 `WServOrm` 實例寫入（離線工具如 `g_initialTestData.mjs` 須在服務停止時執行）。

**外部匯入（`POST /syncAndReplaceTabs`）改為依來源鍵 `srcKey` 做差異同步（行為變更）**：
- 外部來源把它所管理之某一 `group` 之**完整清單**送入；每列帶外部自訂、於該 `group` 內**唯一且穩定**之字串 `srcKey`（例如外部系統之主鍵；多欄識別請自行組成一個字串）。內部 `id` 由本系統產生，外部不指定、不依賴。
- 於 `apis` 表鎖內依 `srcKey` 比對：批次有、庫無 → 新增（配新 `id`）；庫有、批次無 → 刪除；兩邊皆有而外部擁有欄位不同 → 修改（保留 `id`）；相同 → 不寫。**不再 `delAll`＋`insert`**：內容不變之重送零寫入、`id` 不變、不使後台持有之畫面失效；整批驗證全有或全無（缺／空／`null`／重複 `srcKey`、含 HTML 標記（含 `<b>` 等白名單標籤）、孤立代理字元、超過 1978 位元組、缺 `name`／`url`（以字元清理後之值為準）、外部欄位為物件／陣列／`NaN`、撞他群組之列皆整批拒收 `errRowInvalid`、零寫入；有限數字與布林會轉為字串存入，如 `method: 7` 存為 `'7'`）；空批次拒收（`errRowsInvalid`，清空某來源須另以明確操作）；寫入中途失敗以快照補償還原，不留部分寫入。
- 回應由原本之 insert 結果 `[{ id }]` 改為 `{ nAdd, nUpdate, nDel, nSame }`。`provideTabs(url, keyTable, group, rows)` 之 `rows` 請改帶 `srcKey`，成功時 resolve 該計數。
- **本系統擁有之欄位不再被匯入清空**：`tokens`、`authType`、`authConfigJson`、`testBaseUrl`、`defaultHeadersJson`、`defaultQueryJson`、`defaultBodyJson`、`contentType` 由本站編輯表單管理，匯入一律不寫（即使批次帶了也忽略；新增列初始為空字串）。原版每次同步會把既有列之這 8 欄清成空字串。`timeCreate` 只在新增時寫（原版每次同步重設）；既有列被匯入改動時 `userIdUpdate` 記為 app 權杖之使用者。
- **`srcKey` 必填、不得送 `id`**：1.1.14 曾有之相容（列未給 `srcKey` 而給 `id` 者以 `id` 代替；「`srcKey` 與 `id` 皆無」之列每次新增）**已移除**，缺 `srcKey` 或列帶 `id` 皆整批拒收（見上方「Breaking change since 1.1.15」）。既有外部列無 `srcKey` 者（升級前資料）：首次匯入時批次 `srcKey` 等於其 `id` 者視為同一列並於鎖內補上 `srcKey`（一次性遷移，無需遷移腳本，補值不計入 `nUpdate`），其後只認 `srcKey`。
- 後台在外部 `group` 內自建之列（`srcKey` 為空）會在下次該 `group` 匯入時被刪（`group` 為外部來源之統一管理鍵，同原版；預設 `lockExternalRows: 'y'` 時後台已不能在外部管理之 `group` 新增或改入列，此句適用於既有資料與 `'n'`，見下方「外部列受保護」）；`group` 為空字串不是來源範圍，拒收 `errGroupInvalid`。

**多人同時編輯（行為變更）**：
- `saveApi`、`deleteApi`、外部匯入共用同一把 `apis` 表鎖（讀取、比對、寫入在同一鎖內）。修改只改不增：該列已被他人刪除（含從未存在之 `id`）回 `errApiRowNotFound`，不再復活；`deleteApi` 刪除不存在之列回 `errApiRowNotFound`（原版回成功）。`deleteApi` 成功之回傳形狀不變。
- 新增選填第 3 參數：`saveApi(row, { baseline })`、`deleteApi(id, { baseline })`。`baseline` 為前端開啟編輯時以 `buildBaseline([該列], 契約)`（`w-serv-orm/src/baseline.mjs`，契約 `src/schema/contracts/apis.mjs`）對**畫面所見之列**自算之 `[[id, 列摘要]]`；伺服器於表鎖內與新鮮讀取比對，不符整次拒收 `saveStale`（零寫入、保留草稿、提示重新載入），格式或版本不識 `errBaselineFormat`（不得降級為不帶基準）。**不帶基準**（外部應用、舊版已開啟之頁面）本 major 允許：仍取鎖、仍只改不增，後者蓋前者；**下一 major 後台必帶基準**，未帶即拒收。
- 伺服器專有欄位（`timeCreate`、`timeUpdate`、`isActive`、`userIdUpdate`、`srcKey`）存檔不採用客戶端值（原版 `saveApi` 採客戶端 `timeCreate`）。
- **`saveApi` 成功時回傳寫入後之列**：回傳仍是 `procOrm` save 之逐筆結果陣列（`id`、`ok` 等鍵不變），第 0 筆另帶 `row`——存檔當下於同一把表鎖內新鮮讀回之整列（新增時含伺服器配的新 `id`；寫入時 `clearXSS` 等改寫過之字串以改寫後為準）。前端存檔成功後立即以此列更新畫面與下次編輯之基準，不必等推播或輪詢（約 2 秒）；否則使用者存檔成功後立即再編輯再存，會被自己上一次之存檔誤判為「已被他人更新」而拒收。讀回失敗或未命中時回原結果（不帶 `row`，寫入已生效；前端退回等推播）。`deleteApi` 之回傳形狀不變。
- 新增欄位：`userIdUpdate`（最後修改者之使用者 id）與 `srcKey`（匯入之來源鍵）。參考部署之 `w-orm-lmdb` 為無綱要，**免遷移**（舊列於下次被存檔或匯入時補上）；改用 SQL 後端（`w-orm-postgresql`／`w-orm-mdb`／`w-orm-reladb`）者須自行為 `apis` 表加此二欄。
- 前端草稿保護：編輯既有 API 時，他人更新（無關列、同一列、或原列被刪）之推播不覆寫編輯中之內容並凍結載入時之基準——無未存修改則自動重建；有未存修改則保留並於編輯區上方提示「重新載入」；原列被刪則停留原畫面並提示；於左樹搜尋不再換筆；存檔被拒保留草稿並提示；既有列之載入資料若無法建立基準（舊資料含過深巢狀值等不可摘要之值）則禁止存檔與刪除並提示洽系統管理者（不降級為不帶基準，否則會靜默覆寫他人更新）。已開啟之舊版頁面須重新整理才有此保護。

**外部列受保護（行為變更，選項 `lockExternalRows`，預設 `'y'`）**——開了外部同步就以外部為主，後台不得覆蓋外部來源之列：
- **外部列**＝`srcKey` 為非空字串之列（外部匯入寫入，後台不可寫 `srcKey`）。外部列在後台：**不可刪除**（`deleteExternalRowDenied`）；**不可改 `group`、`srcKey` 與外部擁有欄位**（`order`、`name`、`description`、`url`、`method`、`version`、`levels`、`keywords`、`state`、`creator`、`dataSource`、`mdInputParams`、`inputExample`、`mdOutputParams`、`outputExample`，即 `provideTabs` 白名單去 `srcKey`／`id`；`saveExternalRowChanged`）；**可改本系統擁有欄位**（`tokens`、`authType`、`authConfigJson`、`testBaseUrl`、`defaultHeadersJson`、`defaultQueryJson`、`defaultBodyJson`、`contentType`）。「改」指送來之值與庫內不同，整列原樣送回不算；違規整次拒收、零寫入。前端同步顯示：樹狀清單鎖頭、編輯頁上方唯讀說明、欄位唯讀並標鎖頭、刪除鈕停用並附說明。
- **外部管理之 `group`**（該 `group` 內存在外部列）：後台**不可在其中新增列，也不可把列改入該 `group`**（`saveExternalGroupDenied`）——外部匯入之批次＝該 `group` 之完整清單，後台自建於其中之列會於下次匯入被刪，故於寫入時先擋。判定在 `apis` 表鎖內以新鮮讀取進行，與外部匯入互斥。前端在群組欄即時提示、儲存前擋下。
- **寫入之值即檢查之值**：預設開啟時，後台送來之 `group` 須為字串（缺欄或 `null` 亦可；陣列、數字、布林、物件與含孤立代理字元之字串回 `errApiRowInvalid`），外部列通過檢查後只寫入 `id` 與本系統擁有欄位（外部擁有欄位已驗證與庫內相同，不再寫入）。
- **選項**：`WWebApi(…, { lockExternalRows: 'y' })`（預設）；給 `'n'` 回到升版前行為（後台可改可刪外部列、可在外部管理之 `group` 新增與改入；下次匯入仍以外部為主）。參考部署由 `settings.json` 之 `lockExternalRows` 經 `srv.mjs` 轉入。外部匯入（`syncAndReplaceTabs`）不受此選項影響。未知值（如 `'N'`）一律維持開啟。
- **升版前請盤點**（唯讀，須先停止服務）：`node g_auditExternalRows.mjs` 列出升版後會被鎖定之外部列數、外部管理之 `group`，以及其中之「混雜列」。升版後庫中 `srcKey` 非空之列即視為外部列而唯讀。
- **混雜列（外部管理之 `group` 內 `srcKey` 為空之列，如升版前即存在之後台自建列）**：**不鎖、不自動刪除**（可編輯、可刪除、可改到其他 `group`），前端於樹狀清單與編輯頁顯示警告。**下次對該 `group` 匯入時，批次 `srcKey` 未等於其 `id` 者會被刪除**（記 warn `syncAndReplaceTabs-delNoSrcKey`）；`srcKey` 等於其 `id` 者保留並補上 `srcKey = id`（一次性遷移），之後成為外部列。想保留者請於匯入前把它改到其他 `group`。
- **無來源鍵之列不受保護**：升版前尚未被匯入命中之列（舊版同步寫入、1.1.14 相容期所寫之無鍵列、後台自建列）`srcKey` 為空，無從與後台自建者區分，視為後台列。外部匯入自此不再產生無鍵列（`srcKey` 必填）；要得到保護請外部端以其 `id` 作為 `srcKey` 匯入一次。

### Upgrading from 1.1.11 and earlier

**`POST /syncAndReplaceTabs` 之 `base64:` 自動還原遇 `length` 欄位（修正）**：`keyTable=apis` 時，列物件內以 `base64:` 為前綴之字串欄位於寫入前還原為原字串；原以陣列樣方式走訪列物件，列含數字 `length` 欄位（如 `{ name: 'base64:SGVsbG8=', url: '…', length: 0 }`）時真實欄位被略過，字面 `base64:SGVsbG8=` 原樣入庫，且 `length` 極大（如 `4294967295`）時單一請求使後端同步空轉數十秒、阻塞事件迴圈（呼叫者須已通過應用端驗證）。本版起一律依列之自有欄位走訪，`length` 與其他欄位同為一般欄位（`apis` 結構無該欄，仍不入庫）。

**測試分頁以預設 Query／Headers JSON 預填表列（修正）**：API 定義之 `defaultQueryJson`／`defaultHeadersJson` 含 `length` 鍵（如分頁參數 `{ "start": 0, "length": 10 }`）時，原預填成鍵為 `0`…`9`、值為 `undefined` 之假列並略過真實鍵；本版起照鍵值預填。

**左側 API 樹之節點路徑（修正）**：API 名稱（`name`）內含 `.` 或 `[` 時，原被當作樹之層級路徑（多出中間層，且名稱為 `a` 與 `a.b` 並存時 `a` 自樹上消失）；本版起 `levels` 仍以 `.` 分層，名稱整段為單一葉名；名稱為 `__proto__`、`constructor` 等原型鍵名者亦保留於樹上（原因繼承值被當成既有群組、或不安全鍵被拒寫而不進樹）。名稱不含 `.` 與 `[` 者行為不變（含 `levels` 為空字串者）。

**測試分頁回應標頭（修正）**：目標伺服器回應標頭名為 `__proto__` 時，原代打（`proxyRequest`）回傳之 `headers` 遺失該標頭；本版起保留為一般的自有屬性。

## Security: identity verification responsibility

**身分驗證責任**：框架（w-converhp、w-serv-hapi、w-serv-webdata、w-serv-orm）不驗證 token，一律由本套件負責。連線閘（`verifyConn`）與執行身分（`getUserIdByToken`）皆須完整驗證（token 有效、本系統使用者存在且啟用、部署方授權）；hapi `apis` 路由各自驗證；函數層級另檢查角色或成員；公開入口只限列名者。（跨套件原則，見 `C:\opensrcOper\dspec\使用者身分驗證原則.md`。）

本套件之落實：
- **角色（系統管理者）**：本套件**無自有使用者表**，系統管理者＝您的 `getUserByToken` 所回使用者之 `isAdmin` 為 `'y'`，其餘為一般使用者。判準只有一處（`assertAdmin`），後台與資料通道**一律只限系統管理者，不論您的 `verifyClientUser` 如何放行**（1.1.17 起，見 Upgrade Notes）；一般使用者唯一可用之入口為 `GET /api/getApisList?token=`（啟用中 API 之公開欄位清單，不含 `tokens`、`authConfigJson` 等憑證）。應用系統路由 `POST /syncAndReplaceTabs` 自 1.1.18 起同樣要求系統管理者等級（同一判準，且反查結果須經與瀏覽端相同之欄位檢查；您的 `verifyAppUser` 照舊先被呼叫、只能再收緊）。應用系統 token 之兩種用途（使用者用途、系統服務用途）以反查之 `isAdmin` 自然分流，本套件不另分辨；簽發何種應用系統 token 由專案方負責。
- **連線閘**（`verifyConn`，資料通道之每個請求，含前端輪詢與同步）：`Authorization` 須為 `Bearer` 方案；token 認證（`getUserByToken` 查得使用者，且 `id`／`email`／`name`／`isAdmin` 齊備）＋您傳入之 `verifyClientUser(user, from)`＋**系統管理者**；任一不通過整次連線被拒（`permission denied`）。token 之有效性、使用者之存在與啟用狀態由您的 `getUserByToken`／`verifyClientUser` 保證（套件檢查者為其回傳之使用者物件欄位齊備、與 `verifyClientUser` 之結果、`isAdmin`；套件不另持有使用者資料）。
- **執行身分**（`getUserIdByToken`，函數執行前以請求本體之 `__sysToken__` 反查使用者）：與連線閘同等完整（token 認證＋`verifyClientUser(user, 'main')`＋系統管理者），不通過則函數不執行；兩個 token 各自驗證，不因來源不同而放寬。
- **系統函數**（1.1.19 起，見 Upgrade Notes）：`sysFuncsPublic` 顯式只列 `[sys:getFuncList]`（框架預設三者皆公開）；`[sys:getTableTags]` 與輪詢 `[sys:polling]` 須有效身分，輪詢須於請求本體帶有效 `__sysToken__`（與函數同一完整驗證），不帶 token 之輪詢（已發布之舊前端建置檔）被拒，使用者須重新載入頁面。
- **資料通道只開 `select`**：表操作只放行 `apis.select`（前端同步用），所有寫入一律經 `saveApi`／`deleteApi`；`apis.insert`／`save`／`del` 直接呼叫回 `invalid func[…]`。
- **公開入口（逐一列名）**：前端靜態檔（`dist/` 建置檔，不含使用者資料）。其餘皆需 token，見下表。
- **函數層級**：因資料通道每個函數執行前都經 `getUserIdByToken`（含系統管理者檢查），全部 `kpFunExt`、表 `select`、系統函數皆只限系統管理者，不必（也不應只）靠您的 `verifyClientUser` 把關；`verifyClientUser` 仍可再收緊（依 `from`、自有名單）。
- **測試分頁代發請求**預設拒絕內網與本機位址（見上方 Upgrade Notes〈代發請求預設拒絕內網與本機位址〉）。

**入口盤點**（行號為 1.1.18 之 `server/WWebApi.mjs`；每個入口 × 呼叫者類皆有自動化測試，見 `test/api-accessMatrix.test.mjs` 與 `sgud/rule/rulebook_backend.md` R-ADMINONLY-01、R-APPLEVEL-01）：

| 入口 | 誰可用 | 於何處檢查（檔:行） |
|---|---|---|
| 前端靜態檔（`dist/`） | 公開（不含使用者資料） | `server/WWebApi.mjs:976`（`pathStaticFiles`，由 w-serv-hapi 供應；無檢查） |
| `GET /api/getUserByToken`（後台登入檢查） | 系統管理者（使用者 token 之系統管理者、應用系統 token 綁系統管理者或系統服務用途）；成功只回 `id`、`name`、`email`、`isAdmin` | `server/WWebApi.mjs:752`（`getAndVerifyClientUser`：token 認證＋`verifyClientUser(user, 'getUserByToken')`，定義 `:531`）→ `:763`（`assertAdmin`，定義 `:475`）→ `:768`（`pickLoginUser`：白名單 `server/pickLoginUser.mjs` 之 `fieldsLoginUser`） |
| `GET /api/getApisList`（以 token 取 API 清單） | 任何通過驗證之使用者（一般使用者與系統管理者）；只得公開欄位、僅啟用中 | `server/WWebApi.mjs:805`（`getAndVerifyClientUser`：token 認證＋`verifyClientUser(user, 'getApisList')`；**不要求系統管理者**）→ `server/procApis.mjs`（`getPublicApisList`）→ `server/pickPublicApis.mjs`（白名單 `src/schema/contracts/apis.mjs` 之 `fieldsPublic`） |
| `POST /syncAndReplaceTabs`（外部應用匯入） | 系統管理者等級（使用者 token 之系統管理者、應用系統 token 綁系統管理者或系統服務用途）；一般使用者與綁一般使用者之應用系統 token 被拒 | `server/WWebApi.mjs:924`（`getAndVerifyAppUser`，定義 `:563`：`getTokenUser` 欄位檢查＋`verifyAppUser(user, 'syncAndReplaceTabs')`＋`:581` `assertAdmin`）；`keyTable` 限 `apis` |
| `/api/main`：`kpFunExt`（`getWebInfor`、`getApisList`〔整列〕、`saveApi`、`deleteApi`、`proxyRequest`、`getStaEvent`） | 系統管理者 | 連線閘 `server/WWebApi.mjs:980`（`verifyConn`）→ `:516`（`p.checkToken`）→ `:490`（`authToken`）→ `:506`（`assertAdmin`）；執行身分 `:1018`（`getUserIdByToken`）→ `authToken` |
| `/api/main`：表 `apis.select` | 系統管理者 | 同上兩關，另 `server/getOptDataChannel.mjs:43`（`authorizeExec`：只放行非空 `userId` 之 `select`） |
| `/api/main`：表 `apis.insert`／`save`／`del` | 無人（未開放，回 `invalid func[…]`） | `server/getOptDataChannel.mjs:58`（`methodsExec: ['select']`） |
| `/api/main`：系統函數 `[sys:getFuncList]`、`[sys:getTableTags]`、`[sys:polling]` | 系統管理者（`sysFuncsPublic` 只列 `[sys:getFuncList]`，但連線閘與執行身分先擋，實際仍須有效身分；`[sys:getTableTags]`、輪詢須有效 `__sysToken__`，不帶 token 之輪詢被拒） | 連線閘（同上）→ 函數：執行身分 `:1018`（`getUserIdByToken`）；輪詢：w-serv-webdata 之輪詢關卡（`verifyPolling`）以同一 `getUserIdByToken` 反查本體 `__sysToken__`、不帶鍵者拒絕；設定 `server/WWebApi.mjs:1083`（`sysFuncsPublic`，1.1.19 起） |
| `/api/ulctr`、`/api/slc`、`/api/dwgfn`、`/api/dwgf`、`/api/dw`（上傳、下載；本套件未註冊監聽，不受理） | 系統管理者（連線閘先擋；通過亦不受理） | 連線閘 `server/WWebApi.mjs:980`（`from` 為各入口名） |

## Installation

### Using npm(ES6 module):
```alias
npm i w-web-api
```

#### Example for server:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-web-api/blob/master/srv.mjs)]
```alias
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WWebApi from './server/WWebApi.mjs'
import getSettings from './g_getSettings.mjs'


//st
let st = getSettings()

let url = st.dbUrl
let db = st.dbName
let opt = {

    serverPort: 11005, //integer 1–65535, otherwise construction throws 'invalid opt.serverPort'
    subfolder: '', //mapi
    urlRedirect: 'https://www.google.com/', //本機測試時得先編譯, 再瀏覽: http://localhost:11005/

    webName: {
        'eng': 'API Service',
        'cht': 'API管理系統',
    },
    webDescription: {
        'eng': 'A web service package as methods to send requests to and receive responses from an API.',
        'cht': '一套以方法形式，用於發送請求至API並接收其回應的網頁服務套件。',
    },
    webLogo: 'data:image/svg+xml;base64,...',

    //測試分頁代發請求預設拒絕內網與本機位址(見 Upgrade Notes); 需要連內網目標時放行:
    // proxyAllowInternal: 'n', //'y' 整體關閉此拒絕(僅限可信任網路)
    // proxyAllowList: ['127.0.0.1', '10.20.0.0/16', 'api.internal'], //只放行所列之 IP、CIDR、主機名

}

let getUserByToken = async (token) => {
    // return {} //測試無法登入
    if (token === '{token-for-application}') { //提供外部應用系統作為存取使用者(系統服務用途: 不綁使用者，須為系統管理者等級才可呼叫 POST /syncAndReplaceTabs)
        return {
            id: 'app:id-for-application',
            name: 'application',
            email: 'application@example.com',
            isApp: 'y', //選用: 'y' 為應用系統 token 之反查結果，本套件不據以判斷等級，僅原樣交給 verifyClientUser 與 verifyAppUser
            isAdmin: 'y',
        }
    }
    if (token === 'sys') { //開發階段w-ui-loginout自動給予browser使用者(且位於localhost)的token為sys
        return {
            id: 'id-for-admin',
            name: '測試者',
            email: 'admin@example.com',
            isAdmin: 'y',
        }
    }
    console.log('invalid token') //勿印權杖值: 權杖等同憑證, 印出即落入 stdout 與行程管理器之擷取檔
    console.log('於生產環境時得加入SSO等驗證token機制')
    return {}
}

//from: 'getUserByToken'(登入檢查)、'getApisList'(一般使用者以 token 取 API 清單)、'main'(資料通道)、'upload-controller'|'upload-slice'|'download-get-filename'|'download-get-file'|'download'(w-converhp 其餘路由)
//本套件已自行限制後台('getUserByToken')與資料通道('main' 等)只限系統管理者(getUserByToken 所回 isAdmin 為 'y'; 此函數先被呼叫, 只能再收緊),
//故不必再以 isAdmin 判斷; 此處示範依 from 收緊: 其餘入口預設拒絕
let verifyBrowserUser = (user, from) => {
    // return false //測試無法登入
    console.log('於生產環境時得加入限制瀏覽器使用者身份機制(例如排除特定帳號)')
    return from === 'getUserByToken' || from === 'getApisList' || from === 'main'
}

//from: 目前只有 'syncAndReplaceTabs'(外部匯入)
//本套件已自行要求應用系統路由之呼叫者為系統管理者等級(getUserByToken 所回 isAdmin 為 'y'; 此函數先被呼叫, 只能再收緊), 故不必再以 isAdmin 判斷
let verifyAppUser = (user, from) => {
    console.log('verifyAppUser/from', from) //勿印使用者物件: 內含 email、name 等個資, 印出即落入 stdout 與行程管理器之擷取檔
    // return false //測試無法登入
    console.log('於生產環境時得加入限制應用程式使用者身份機制(例如只放行特定應用系統之 id)')
    return from === 'syncAndReplaceTabs'
}

//WWebApi
let instWWebApi = WWebApi(WOrm, url, db, getUserByToken, verifyBrowserUser, verifyAppUser, opt)

instWWebApi.on('error', (err) => {
    console.log('error', err && err.name) //勿印整個錯誤物件: 其訊息可能含連線字串等憑證
})

//graceful shutdown: stops the server and releases the cache timer, database connections and log worker
// await instWWebApi.stop()
```

#### Behavior notes (w-serv-orm 1.1.11 / w-serv-hapi 1.1.6 / w-syslog 1.0.33)
- `opt.useCheckUser`, `opt.getUserById` and `opt.useExcludeWhenNotAdmin` have been removed: `procOrm` of w-serv-orm no longer authorizes users. Passing any of them with a value other than `undefined`, `null` or `false` throws at construction.
- The data channel exposes table reads only: `apis.select` (used by the front-end sync) is allowed for authenticated users, and every write goes through `saveApi` / `deleteApi`. Calling `apis.insert`, `apis.save` or `apis.del` directly through `/api/main` now returns `invalid func[apis.<method>]`. The sync still delivers the whole table, including `tokens` and `authConfigJson`, but since 1.1.17 only to system administrators (the user returned by your `getUserByToken` has `isAdmin: 'y'`; the package enforces this itself, in addition to your `verifyClientUser`). Everyone else who holds a valid token can only call `GET /api/getApisList?token=` (enabled APIs, public fields only: never `tokens`, `authConfigJson` or the test settings). Since 1.1.16 (see "Behavior change since 1.1.16") the connection gate of the data channel (`verifyConn`) is token authentication plus your `verifyClientUser(user, from)`, where `from` is the w-converhp `apiType` (`'main'` for every data-channel call): a rejected user (or a `verifyClientUser` that throws, rejects or returns a falsy value) gets `permission denied` and nothing is executed. The execution identity (`getUserIdByToken`, the `__sysToken__` in the request body) gets the same complete check, and the `Authorization` header must use the `Bearer` scheme. The test tab's proxy refuses internal and local targets by default (`proxyAllowInternal`, `proxyAllowList`).
- `/syncAndReplaceTabs` checks every row before it writes anything: a missing, empty or non-string `srcKey`, or a `srcKey` with HTML markup, longer than 1978 bytes in UTF-8, or repeated in the same batch rejects the whole batch with `errRowInvalid`; a row that carries an `id` (any value, even together with a valid `srcKey`) rejects the whole batch with `idNotAllowed`; existing data stays untouched. The endpoint is a `srcKey`-based differential sync (see "Breaking change since 1.1.15" and "Upgrading from 1.1.13 and earlier"); there is no compatibility for callers that still send `id` instead of `srcKey`, and no `delAll`, so locally owned fields of keyed rows are never cleared. A `srcKey` is a plain string key: values that start with `base64:` are decoded before use (as for every field), so a key that literally starts with `base64:` (for example an old `id` of that form being migrated) must itself be sent base64-encoded with the `base64:` prefix.
- `id` values are generated by the system. Since w-serv-orm 1.1.11 a numeric id is stored as its string form; this no longer matters for the import, because an `id` sent by the caller is rejected (`idNotAllowed`) and a numeric `srcKey` is rejected (`errRowInvalid`, a `srcKey` must be a string).
- Database failures are returned as language keys (`saveWriteFail` for writes, `getDataError` for reads) instead of the ORM's English text, which is written to the log.
- Diagnostic output of w-serv-orm (a failed write, a rejected input, a caught ORM error) goes to the server log (`logFd`, default `./logs`) instead of the process's standard output: one `warn` entry per diagnostic, `event: "orm-diag"`, with the `label` (table and operation, for example `apis.save fail`) and a `safe` summary object (for example `{"n":1,"ks":[0]}`: number of failed rows and their positions; or `{"errType":"Error"}`; a diagnostic without a summary has no `safe` field). The package passes `opt.funLog` to w-serv-orm for this (needs w-serv-orm 1.1.22 or later); the function is generated by wsemi's shared `genDiagFunLog` (wsemi 1.9.31 or later), whose normalization rules and options are documented in wsemi, and the keys that `safe` may carry are decided by w-serv-orm (see its README). The detail that w-serv-orm hands to `funLog` (primary keys, ORM error text, query conditions) is deliberately not logged (`genDiagFunLog` never reads it); the response to the caller and the log entry of the failed call (error key, ORM error text trimmed to 200 characters) are unchanged. The offline tools (`g_initialTestData.mjs`, `g_backupDb.mjs`) have no server log and keep w-serv-orm's default console summary, which contains no primary keys or data values.
- `stop()` returns the same promise on repeated calls. If construction fails after resources were created, they are released before the error is thrown.
- WWebApi does not register `process.on('unhandledRejection')` or `process.on('uncaughtException')`, and since w-serv-hapi 1.1.6 neither does w-serv-hapi. An unhandled rejection terminates the process (Node default), so run the service under a process manager such as PM2 or systemd.
- Since w-syslog 1.0.33, a failure to write the log no longer terminates the service: it is reported on stderr (w-syslog emits `writeError`), and the service keeps running. Watch stderr to notice a log folder that cannot be written.
- The published bundle (`main`) locates its statistics worker at first use (from the package's `server/` folder), so the package must be installed with its `server/` folder, as npm does by default.
