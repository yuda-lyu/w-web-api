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

### Upgrading from 1.1.13 and earlier（多人同時編輯、外部匯入）

需要 `w-serv-orm` 1.1.17 以上。**單一行程部署**，同一資料表只由同一個 `WServOrm` 實例寫入（離線工具如 `g_initialTestData.mjs` 須在服務停止時執行）。

**外部匯入（`POST /syncAndReplaceTabs`）改為依來源鍵 `srcKey` 做差異同步（行為變更）**：
- 外部來源把它所管理之某一 `group` 之**完整清單**送入；每列帶外部自訂、於該 `group` 內**唯一且穩定**之字串 `srcKey`（例如外部系統之主鍵；多欄識別請自行組成一個字串）。內部 `id` 由本系統產生，外部不指定、不依賴。
- 於 `apis` 表鎖內依 `srcKey` 比對：批次有、庫無 → 新增（配新 `id`）；庫有、批次無 → 刪除；兩邊皆有而外部擁有欄位不同 → 修改（保留 `id`）；相同 → 不寫。**不再 `delAll`＋`insert`**：內容不變之重送零寫入、`id` 不變、不使後台持有之畫面失效；整批驗證全有或全無（缺／空／`null`／重複 `srcKey`、含 HTML 標記（含 `<b>` 等白名單標籤）、孤立代理字元、超過 1978 位元組、缺 `name`／`url`（以字元清理後之值為準）、外部欄位為物件／陣列／`NaN`、撞他群組之列皆整批拒收 `errRowInvalid`、零寫入；有限數字與布林會轉為字串存入，如 `method: 7` 存為 `'7'`）；空批次拒收（`errRowsInvalid`，清空某來源須另以明確操作）；寫入中途失敗以快照補償還原，不留部分寫入。
- 回應由原本之 insert 結果 `[{ id }]` 改為 `{ nAdd, nUpdate, nDel, nSame }`。`provideTabs(url, keyTable, group, rows)` 之 `rows` 請改帶 `srcKey`，成功時 resolve 該計數。
- **本系統擁有之欄位不再被匯入清空**：`tokens`、`authType`、`authConfigJson`、`testBaseUrl`、`defaultHeadersJson`、`defaultQueryJson`、`defaultBodyJson`、`contentType` 由本站編輯表單管理，匯入一律不寫（即使批次帶了也忽略；新增列初始為空字串）。原版每次同步會把既有列之這 8 欄清成空字串。`timeCreate` 只在新增時寫（原版每次同步重設）；既有列被匯入改動時 `userIdUpdate` 記為 app 權杖之使用者。
- **相容（現行 major；下一 major 起 `srcKey` 必填）**：列未給 `srcKey` 而給 `id` 者，以 `id` 值為來源鍵（新增列沿用該值為內部 `id`，行為與現行一致）並記警告 `syncAndReplaceTabs-idAsSrcKey`；批次中有列「`srcKey` 與 `id` 皆無」者，**該列每次匯入皆為新增（配新 `id`，同原版「未帶 `id` 者每次換 `id`」；前次由此新增之列因不在批次的來源鍵內而被刪）**並記警告 `syncAndReplaceTabs-noSrcKey`，同批其餘有鍵之列仍依來源鍵差異同步（其 `id`、本系統擁有欄位不受影響；**不再整批 `delAll`＋`insert`**，該作法會連同有鍵之列一併清掉本系統擁有欄位）；既有外部列無 `srcKey` 者（升級前資料）以其 `id` 為有效來源鍵，**首次差異同步命中時自動補上 `srcKey = id`**（無需遷移腳本，補值不計入 `nUpdate`）。建議外部端盡早改帶 `srcKey`（值可沿用原 `id`）。
- 後台在外部 `group` 內自建之列（`srcKey` 為空）會在下次該 `group` 匯入時被刪（`group` 為外部來源之統一管理鍵，同原版；預設 `lockExternalRows: 'y'` 時後台已不能在外部管理之 `group` 新增或改入列，此句適用於既有資料與 `'n'`，見下方「外部列受保護」）；`group` 為空字串不是來源範圍，拒收 `errGroupInvalid`。

**多人同時編輯（行為變更）**：
- `saveApi`、`deleteApi`、外部匯入共用同一把 `apis` 表鎖（讀取、比對、寫入在同一鎖內）。修改只改不增：該列已被他人刪除（含從未存在之 `id`）回 `errApiRowNotFound`，不再復活；`deleteApi` 刪除不存在之列回 `errApiRowNotFound`（原版回成功）。`deleteApi` 成功之回傳形狀不變。
- 新增選填第 3 參數：`saveApi(row, { baseline })`、`deleteApi(id, { baseline })`。`baseline` 為前端開啟編輯時以 `buildBaseline([該列], 契約)`（`w-serv-orm/src/baseline.mjs`，契約 `src/schema/contracts/apis.mjs`）對**畫面所見之列**自算之 `[[id, 列摘要]]`；伺服器於表鎖內與新鮮讀取比對，不符整次拒收 `saveStale`（零寫入、保留草稿、提示重新載入），格式或版本不識 `errBaselineFormat`（不得降級為不帶基準）。**不帶基準**（外部應用、舊版已開啟之頁面）本 major 允許：仍取鎖、仍只改不增，後者蓋前者；**下一 major 後台必帶基準**，未帶即拒收。
- 伺服器專有欄位（`timeCreate`、`timeUpdate`、`isActive`、`userIdUpdate`、`srcKey`）存檔不採用客戶端值（原版 `saveApi` 採客戶端 `timeCreate`）。
- **`saveApi` 成功時回傳寫入後之列**：回傳仍是 `procOrm` save 之逐筆結果陣列（`id`、`ok` 等鍵不變），第 0 筆另帶 `row`——存檔當下於同一把表鎖內新鮮讀回之整列（新增時含伺服器配的新 `id`；寫入時 `clearXSS` 等改寫過之字串以改寫後為準）。前端存檔成功後立即以此列更新畫面與下次編輯之基準，不必等推播或輪詢（約 2 秒）；否則使用者存檔成功後立即再編輯再存，會被自己上一次之存檔誤判為「已被他人更新」而拒收。讀回失敗或未命中時回原結果（不帶 `row`，寫入已生效；前端退回等推播）。`deleteApi` 之回傳形狀不變。
- 新增欄位：`userIdUpdate`（最後修改者之使用者 id）與 `srcKey`（匯入之來源鍵）。參考部署之 `w-orm-lmdb` 為無綱要，**免遷移**（舊列於下次被存檔或匯入時補上）；改用 SQL 後端（`w-orm-postgresql`／`w-orm-mdb`／`w-orm-reladb`）者須自行為 `apis` 表加此二欄。
- 前端草稿保護：編輯既有 API 時，他人更新（無關列、同一列、或原列被刪）之推播不覆寫編輯中之內容並凍結載入時之基準——無未存修改則自動重建；有未存修改則保留並於編輯區上方提示「重新載入」；原列被刪則停留原畫面並提示；於左樹搜尋不再換筆；存檔被拒保留草稿並提示；既有列之載入資料若無法建立基準（舊資料含過深巢狀值等不可摘要之值）則禁止存檔與刪除並提示洽管理者（不降級為不帶基準，否則會靜默覆寫他人更新）。已開啟之舊版頁面須重新整理才有此保護。

**外部列受保護（行為變更，選項 `lockExternalRows`，預設 `'y'`）**——開了外部同步就以外部為主，後台不得覆蓋外部來源之列：
- **外部列**＝`srcKey` 為非空字串之列（外部匯入寫入，後台不可寫 `srcKey`）。外部列在後台：**不可刪除**（`deleteExternalRowDenied`）；**不可改 `group`、`srcKey` 與外部擁有欄位**（`order`、`name`、`description`、`url`、`method`、`version`、`levels`、`keywords`、`state`、`creator`、`dataSource`、`mdInputParams`、`inputExample`、`mdOutputParams`、`outputExample`，即 `provideTabs` 白名單去 `srcKey`／`id`；`saveExternalRowChanged`）；**可改本系統擁有欄位**（`tokens`、`authType`、`authConfigJson`、`testBaseUrl`、`defaultHeadersJson`、`defaultQueryJson`、`defaultBodyJson`、`contentType`）。「改」指送來之值與庫內不同，整列原樣送回不算；違規整次拒收、零寫入。前端同步顯示：樹狀清單鎖頭、編輯頁上方唯讀說明、欄位唯讀並標鎖頭、刪除鈕停用並附說明。
- **外部管理之 `group`**（該 `group` 內存在外部列）：後台**不可在其中新增列，也不可把列改入該 `group`**（`saveExternalGroupDenied`）——外部匯入之批次＝該 `group` 之完整清單，後台自建於其中之列會於下次匯入被刪，故於寫入時先擋。判定在 `apis` 表鎖內以新鮮讀取進行，與外部匯入互斥。前端在群組欄即時提示、儲存前擋下。
- **寫入之值即檢查之值**：預設開啟時，後台送來之 `group` 須為字串（缺欄或 `null` 亦可；陣列、數字、布林、物件與含孤立代理字元之字串回 `errApiRowInvalid`），外部列通過檢查後只寫入 `id` 與本系統擁有欄位（外部擁有欄位已驗證與庫內相同，不再寫入）。
- **選項**：`WWebApi(…, { lockExternalRows: 'y' })`（預設）；給 `'n'` 回到升版前行為（後台可改可刪外部列、可在外部管理之 `group` 新增與改入；下次匯入仍以外部為主）。參考部署由 `settings.json` 之 `lockExternalRows` 經 `srv.mjs` 轉入。外部匯入（`syncAndReplaceTabs`）不受此選項影響。未知值（如 `'N'`）一律維持開啟。
- **升版前請盤點**（唯讀，須先停止服務）：`node g_auditExternalRows.mjs` 列出升版後會被鎖定之外部列數、外部管理之 `group`，以及其中之「混雜列」。升版後庫中 `srcKey` 非空之列即視為外部列而唯讀。
- **混雜列（外部管理之 `group` 內 `srcKey` 為空之列，如升版前即存在之後台自建列）**：**不鎖、不自動刪除**（可編輯、可刪除、可改到其他 `group`），前端於樹狀清單與編輯頁顯示警告。**下次對該 `group` 匯入時，批次未以其 `id` 列入者會被刪除**（記 warn `syncAndReplaceTabs-delNoSrcKey`）；以 `id` 列入者保留並補上 `srcKey = id`，之後成為外部列。想保留者請於匯入前把它改到其他 `group`。
- **相容期無來源鍵之列不受保護**：批次中 `srcKey` 與 `id` 皆無之列（每次匯入新增、`srcKey` 為空），以及升版前尚未被匯入命中之列，無從與後台自建者區分，視為後台列。要得到保護請外部端改帶 `srcKey`（值可沿用原 `id`）。

### Upgrading from 1.1.11 and earlier

**`POST /syncAndReplaceTabs` 之 `base64:` 自動還原遇 `length` 欄位（修正）**：`keyTable=apis` 時，列物件內以 `base64:` 為前綴之字串欄位於寫入前還原為原字串；原以陣列樣方式走訪列物件，列含數字 `length` 欄位（如 `{ name: 'base64:SGVsbG8=', url: '…', length: 0 }`）時真實欄位被略過，字面 `base64:SGVsbG8=` 原樣入庫，且 `length` 極大（如 `4294967295`）時單一請求使後端同步空轉數十秒、阻塞事件迴圈（呼叫者須已通過應用端驗證）。本版起一律依列之自有欄位走訪，`length` 與其他欄位同為一般欄位（`apis` 結構無該欄，仍不入庫）。

**測試分頁以預設 Query／Headers JSON 預填表列（修正）**：API 定義之 `defaultQueryJson`／`defaultHeadersJson` 含 `length` 鍵（如分頁參數 `{ "start": 0, "length": 10 }`）時，原預填成鍵為 `0`…`9`、值為 `undefined` 之假列並略過真實鍵；本版起照鍵值預填。

**左側 API 樹之節點路徑（修正）**：API 名稱（`name`）內含 `.` 或 `[` 時，原被當作樹之層級路徑（多出中間層，且名稱為 `a` 與 `a.b` 並存時 `a` 自樹上消失）；本版起 `levels` 仍以 `.` 分層，名稱整段為單一葉名；名稱為 `__proto__`、`constructor` 等原型鍵名者亦保留於樹上（原因繼承值被當成既有群組、或不安全鍵被拒寫而不進樹）。名稱不含 `.` 與 `[` 者行為不變（含 `levels` 為空字串者）。

**測試分頁回應標頭（修正）**：目標伺服器回應標頭名為 `__proto__` 時，原代打（`proxyRequest`）回傳之 `headers` 遺失該標頭；本版起保留為一般的自有屬性。

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

}

let getUserByToken = async (token) => {
    // return {} //測試無法登入
    if (token === '{token-for-application}') { //提供外部應用系統作為存取使用者
        return {
            id: 'id-for-application',
            name: 'application',
            email: 'application@example.com',
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

let verifyBrowserUser = (user, from) => {
    console.log('verifyBrowserUser/user', user)
    // return false //測試無法登入
    console.log('於生產環境時得加入限制瀏覽器使用者身份機制')
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

let verifyAppUser = (user, from) => {
    console.log('verifyAppUser/user', user)
    // return false //測試無法登入
    console.log('於生產環境時得加入限制應用程式使用者身份機制')
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

//WWebApi
let instWWebApi = WWebApi(WOrm, url, db, getUserByToken, verifyBrowserUser, verifyAppUser, opt)

instWWebApi.on('error', (err) => {
    console.log(err)
})

//graceful shutdown: stops the server and releases the cache timer, database connections and log worker
// await instWWebApi.stop()
```

#### Behavior notes (w-serv-orm 1.1.11 / w-serv-hapi 1.1.6 / w-syslog 1.0.33)
- `opt.useCheckUser`, `opt.getUserById` and `opt.useExcludeWhenNotAdmin` have been removed: `procOrm` of w-serv-orm no longer authorizes users. Passing any of them with a value other than `undefined`, `null` or `false` throws at construction.
- The data channel exposes table reads only: `apis.select` (used by the front-end sync) is allowed for authenticated users, and every write goes through `saveApi` / `deleteApi`. Calling `apis.insert`, `apis.save` or `apis.del` directly through `/api/main` now returns `invalid func[apis.<method>]`. The sync still delivers the whole table, including `tokens` and `authConfigJson`, to any authenticated user, so decide who may log in with `getUserByToken` and the verify functions.
- `/syncAndReplaceTabs` checks every given row key before it writes anything: a `srcKey` (or, when `srcKey` is not given, an `id`) with HTML markup, longer than 1978 bytes in UTF-8, repeated in the same batch, or (for an `id`) already belonging to another group rejects the whole batch with `errRowInvalid`, and existing data stays untouched. Since this version the endpoint is a `srcKey`-based differential sync (see "Upgrading from 1.1.13 and earlier"); a row with neither `srcKey` nor `id` is added as a new row (with a generated id) on every import, while the other rows of the same batch are still synchronized by key (no `delAll` any more, so locally owned fields of keyed rows are never cleared).
- Since w-serv-orm 1.1.11, a numeric row id sent as `id` to `/syncAndReplaceTabs` is stored as its string form (123 is stored as '123'). A number and its string form are the same id, so syncing id 123 into a group while '123' belongs to another group is rejected with `errRowInvalid`.
- Database failures are returned as language keys (`saveWriteFail` for writes, `getDataError` for reads) instead of the ORM's English text, which is written to the log.
- `stop()` returns the same promise on repeated calls. If construction fails after resources were created, they are released before the error is thrown.
- WWebApi does not register `process.on('unhandledRejection')` or `process.on('uncaughtException')`, and since w-serv-hapi 1.1.6 neither does w-serv-hapi. An unhandled rejection terminates the process (Node default), so run the service under a process manager such as PM2 or systemd.
- Since w-syslog 1.0.33, a failure to write the log no longer terminates the service: it is reported on stderr (w-syslog emits `writeError`), and the service keeps running. Watch stderr to notice a log folder that cannot be written.
- The published bundle (`main`) locates its statistics worker at first use (from the package's `server/` folder), so the package must be installed with its `server/` folder, as npm does by default.
