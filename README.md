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
- 前端草稿保護：編輯既有 API 時，他人更新（無關列、同一列、或原列被刪）之推播不覆寫編輯中之內容並凍結載入時之基準——無未存修改則自動重建；有未存修改則保留並於編輯區上方提示「重新載入」；原列被刪則停留原畫面並提示；於左樹搜尋不再換筆；存檔被拒保留草稿並提示；既有列之載入資料若無法建立基準（舊資料含過深巢狀值等不可摘要之值）則禁止存檔與刪除並提示洽管理者（不降級為不帶基準，否則會靜默覆寫他人更新）。已開啟之舊版頁面須重新整理才有此保護。

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
- **連線閘**（`verifyConn`，資料通道之每個請求，含前端輪詢與同步）：`Authorization` 須為 `Bearer` 方案；token 認證（`getUserByToken` 查得使用者，且 `id`／`email`／`name`／`isAdmin` 齊備）＋您傳入之 `verifyClientUser(user, from)`；任一不通過整次連線被拒（`permission denied`）。token 之有效性、使用者之存在與啟用狀態由您的 `getUserByToken`／`verifyClientUser` 保證（套件檢查者為其回傳之使用者物件欄位齊備、與 `verifyClientUser` 之結果；套件不另持有使用者資料）。
- **執行身分**（`getUserIdByToken`，函數執行前以請求本體之 `__sysToken__` 反查使用者）：與連線閘同等完整（token 認證＋`verifyClientUser(user, 'main')`），不通過則函數不執行；兩個 token 各自驗證，不因來源不同而放寬。
- **資料通道只開 `select`**：表操作只放行 `apis.select`（前端同步用），所有寫入一律經 `saveApi`／`deleteApi`；`apis.insert`／`save`／`del` 直接呼叫回 `invalid func[…]`。
- **公開入口（逐一列名）**：前端靜態檔（`dist/` 建置檔，不含使用者資料）。其餘皆需 token：`GET /api/getUserByToken`（登入檢查，經 `verifyClientUser(user, 'getUserByToken')`）、`POST /syncAndReplaceTabs`（外部應用匯入，經 `verifyAppUser`）、資料通道（`/api/main` 與 w-converhp 其餘五條路由，經連線閘）。
- **函數層級**：本套件不自訂「誰可使用」之政策（政策屬您的 `getUserByToken`／`verifyClientUser`／`verifyAppUser`）；`saveApi`、`deleteApi`、`proxyRequest`、`getStaEvent` 等函數不另檢查角色，僅管理者可用請在 `verifyClientUser` 內判斷（依 `from`）。
- **測試分頁代發請求**預設拒絕內網與本機位址（見上方 Upgrade Notes〈代發請求預設拒絕內網與本機位址〉）。

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

//from: 'getUserByToken'(登入檢查)、'main'(資料通道)、'upload-controller'|'upload-slice'|'download-get-filename'|'download-get-file'|'download'(w-converhp 其餘路由)
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
- The data channel exposes table reads only: `apis.select` (used by the front-end sync) is allowed for authenticated users, and every write goes through `saveApi` / `deleteApi`. Calling `apis.insert`, `apis.save` or `apis.del` directly through `/api/main` now returns `invalid func[apis.<method>]`. The sync still delivers the whole table, including `tokens` and `authConfigJson`, to any user who passes `getUserByToken` and `verifyClientUser`, so decide who may use the service with those functions. Since 1.1.16 (see "Behavior change since 1.1.16") the connection gate of the data channel (`verifyConn`) is token authentication plus your `verifyClientUser(user, from)`, where `from` is the w-converhp `apiType` (`'main'` for every data-channel call): a rejected user (or a `verifyClientUser` that throws, rejects or returns a falsy value) gets `permission denied` and nothing is executed. The execution identity (`getUserIdByToken`, the `__sysToken__` in the request body) gets the same complete check, and the `Authorization` header must use the `Bearer` scheme. The test tab's proxy refuses internal and local targets by default (`proxyAllowInternal`, `proxyAllowList`).
- `/syncAndReplaceTabs` checks every row before it writes anything: a missing, empty or non-string `srcKey`, or a `srcKey` with HTML markup, longer than 1978 bytes in UTF-8, or repeated in the same batch rejects the whole batch with `errRowInvalid`; a row that carries an `id` (any value, even together with a valid `srcKey`) rejects the whole batch with `idNotAllowed`; existing data stays untouched. The endpoint is a `srcKey`-based differential sync (see "Breaking change since 1.1.15" and "Upgrading from 1.1.13 and earlier"); there is no compatibility for callers that still send `id` instead of `srcKey`, and no `delAll`, so locally owned fields of keyed rows are never cleared. A `srcKey` is a plain string key: values that start with `base64:` are decoded before use (as for every field), so a key that literally starts with `base64:` (for example an old `id` of that form being migrated) must itself be sent base64-encoded with the `base64:` prefix.
- `id` values are generated by the system. Since w-serv-orm 1.1.11 a numeric id is stored as its string form; this no longer matters for the import, because an `id` sent by the caller is rejected (`idNotAllowed`) and a numeric `srcKey` is rejected (`errRowInvalid`, a `srcKey` must be a string).
- Database failures are returned as language keys (`saveWriteFail` for writes, `getDataError` for reads) instead of the ORM's English text, which is written to the log.
- `stop()` returns the same promise on repeated calls. If construction fails after resources were created, they are released before the error is thrown.
- WWebApi does not register `process.on('unhandledRejection')` or `process.on('uncaughtException')`, and since w-serv-hapi 1.1.6 neither does w-serv-hapi. An unhandled rejection terminates the process (Node default), so run the service under a process manager such as PM2 or systemd.
- Since w-syslog 1.0.33, a failure to write the log no longer terminates the service: it is reported on stderr (w-syslog emits `writeError`), and the service keeps running. Watch stderr to notice a log folder that cannot be written.
- The published bundle (`main`) locates its statistics worker at first use (from the package's `server/` folder), so the package must be installed with its `server/` folder, as npm does by default.
