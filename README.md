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
- `/syncAndReplaceTabs` checks every given row `id` before it clears the group: an id with HTML markup, longer than 1978 bytes in UTF-8, repeated in the same batch, or already belonging to another group rejects the whole batch with `errRowInvalid`, and existing data stays untouched. Rows without `id` (or with `NaN` / `Infinity`) work as before and get a generated id.
- Since w-serv-orm 1.1.11, a numeric row id sent to `/syncAndReplaceTabs` is stored as its string form (123 is stored as '123'), and the response lists it as a string. Before, the number was replaced by a generated id while the response still showed the number. A number and its string form are the same id, so syncing id 123 into a group while '123' belongs to another group is rejected with `errRowInvalid`.
- Database failures are returned as language keys (`saveWriteFail` for writes, `getDataError` for reads) instead of the ORM's English text, which is written to the log.
- `stop()` returns the same promise on repeated calls. If construction fails after resources were created, they are released before the error is thrown.
- WWebApi does not register `process.on('unhandledRejection')` or `process.on('uncaughtException')`, and since w-serv-hapi 1.1.6 neither does w-serv-hapi. An unhandled rejection terminates the process (Node default), so run the service under a process manager such as PM2 or systemd.
- Since w-syslog 1.0.33, a failure to write the log no longer terminates the service: it is reported on stderr (w-syslog emits `writeError`), and the service keeps running. Watch stderr to notice a log folder that cannot be written.
- The published bundle (`main`) locates its statistics worker at first use (from the package's `server/` folder), so the package must be installed with its `server/` folder, as npm does by default.
