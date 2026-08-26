# API 測試流程

## 觸發

進站預設頁為統計資訊頁，使用者點左側主選單「API」切至 API 工作區後，於右側內容區點「測試」分頁，`LayoutContent.vue` 切到 `LayoutContentTest.vue`，請求建構器由所選 API 種子帶入（網址/方法/標頭等）；使用者改 Request URL 後點「送出請求」，呼叫 `$fapi.proxyRequest` 經後端 proxy 繞過 CORS 打目標，回應面板顯示狀態碼與內容。

## 重要流程

- **E2E-001**
  - title: 測試 API 送出請求顯示回應
  - description: 使用者切「測試」分頁，建構器 URL 由所選 API（取得API清單）種子帶入、回應區為「尚無回應」空狀態；改 URL 為本機 server 根後點送出，經後端 proxy round-trip 回 200，回應面板顯示狀態碼 200。送出前的種子穩定態做 pixel baseline；送出後回應含 durationMs/date/etag 等非決定性欄位，故只做語意斷言不做 baseline。
  - flow:
    - 測試資料：所選 API「取得API清單」（其 url `http://localhost:11005/getAPIsList` 帶入建構器）；送出目標改為本機 `http://127.0.0.1:11005/`（回 200 HTML）。
    - 操作：點「測試／測試」分頁 →（讀建構器 URL 種子值與「尚無回應」空狀態）→ 於「Request URL／請求網址」輸入本機 server 根 → 點「送出請求／送出請求」。
    - 驗證：
      1. 送出前——語意：建構器 URL 由 API 種子帶入（含 `http://localhost:11005/getAPIsList`）、回應區顯示「No response yet／尚無回應」；視覺（每步整頁紅框標 address bar）：①種子帶入態 `test/pics/apitest/apitest-{eng,cht}-E2E-001-1-seeded.png`；②URL 改為本機 server 根（送出前）`...-E2E-001-2-url-changed.png`，皆以 pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對（非 byte-exact）。
      2. 送出後——語意：回應面板顯示狀態碼 200、不再顯示「尚無回應」（proxy round-trip 成功）；視覺：整頁紅框標回應卡，遮黑 durationMs 與 headers（含 date/etag）兩個非決定性區域後 `...-E2E-001-3-response.png` 以 pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對（非 byte-exact；狀態碼、body 為決定性、保留比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：純讀取/送請求，不持久化資料；起跑前還原 base seed。

- **E2E-002**
  - title: 請求網址留空送出顯示必填錯誤、不打網路
  - description: 使用者切「測試」分頁，清空建構器的 Request URL 後點送出。預期同步檢測攔截於開 loading 之前：err-bar 顯示 inline 必填紅字，不經後端 proxy 送出、回應區維持「尚無回應」空狀態。對應 spec 規則摘要「URL 空短路不打網路」之邊界。
  - flow:
    - 測試資料：所選 API「取得API清單」（種子帶入建構器 URL）。
    - 操作：點「測試／測試」分頁 → 清空「Request URL／請求網址」欄 → 點「送出請求／送出請求」按鈕。
    - 驗證：
      1. 語意：err-bar 顯示必填訊息（eng「This field is required」／ cht「此欄位必填」）；回應區仍顯示「No response yet／尚無回應」（未送出、無狀態碼）。
      2. 視覺（2 階段、每階整頁紅框）：①URL 已清空、送出前（err-bar 未現，框 address bar）`test/pics/apitest/apitest-{eng,cht}-E2E-002-1-url-empty.png`；②送出後 err-bar 必填紅字（框 address bar 與其下 err-bar）`...-E2E-002-2-url-required.png`，皆視覺一致（pixelmatch 容差）。
    - 雙語：eng / cht 各一輪。
    - 清理：純檢測未送出；起跑前還原 base seed。

- **E2E-003**
  - title: 非 http(s) 網址送出，後端拒絕並顯示錯誤
  - description: 使用者於 Request URL 輸入非 http(s) 開頭的字串（前端僅檢非空、放行）後點送出，經後端 proxy 校驗 url 失敗回 reject。後端回傳 **err-key**（`errReqUrlInvalid`），前端依當前 lang 反查 procLang 顯示**在地化錯誤文字**（eng/cht 各異）；回應區無 200。對應 spec 規則摘要「非 http(s) 由後端 reject」之邊界（`isAllowTarget` 未設定，故僅此分支可達，'target not allowed' 不在此流程涵蓋）。
  - flow:
    - 測試資料：所選 API「取得API清單」。
    - 操作：點「測試／測試」分頁 → 於「Request URL／請求網址」輸入非 http(s) 字串（如 `notaurl`）→ 點「送出請求／送出請求」按鈕。
    - 驗證：
      1. 語意：err-bar 顯示在地化錯誤文字（eng「The request URL is invalid…」／ cht「請求網址無效…」，由前端依 lang 反查 err-key）；回應區不顯示狀態碼 200（送出失敗）。
      2. 視覺（2 階段、每階整頁紅框）：①已輸入 `notaurl`、送出前（err-bar 未現，框 address bar）`test/pics/apitest/apitest-{eng,cht}-E2E-003-1-url-typed.png`；②送出後 err-bar 在地化錯誤（框 address bar 與其下 err-bar）`...-E2E-003-2-invalid-url.png`，皆視覺一致（pixelmatch 容差）。
    - 雙語：eng / cht 各一輪（錯誤文字依語系不同）。
    - 清理：純送出失敗未持久化；起跑前還原 base seed。

- **E2E-004**
  - title: 選 bearer 認證 API，認證標頭自動帶入並隨請求送達目標
  - description: 使用者於左樹點選一支 `authType='bearer'`（`authConfigJson` 內含 token）之 API 後切「測試」分頁；請求建構器 Headers 依 seedFromItem 自動帶入一列 `Authorization: Bearer <token>`。將此 API 之目標設為測試自帶之 echo 目標，點送出經後端 proxy 送達後，回應面板內容回顯該 `Bearer <token>` 值，證明認證確實隨請求送出。粒度：三種 authType（bearer / apikey / basic）為三支各自獨立之認證 API、各自一個 case（E2E-004~006），建構器帶入認證後之種子態為決定性做 baseline；echo 回應含非決定性欄位故僅語意斷言、不做 baseline。
  - flow:
    - 測試資料：一支 `authType='bearer'`、`authConfigJson` 含 token、目標網址指向測試自帶 echo 目標之認證 API（本檔特化，疊加於 base seed 之上）；base seed API 樹。
    - 操作：API 工作區 →（左樹點該 bearer 認證 API）→ 點「測試／測試」分頁 →（讀建構器 Headers 帶入之認證列）→ 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：建構器 Headers 含一列鍵為 `Authorization`、值為 `Bearer <token>`；送出後回應面板內容含該 `Bearer <token>` 值。
      2. 視覺：建構器 Headers 區紅框標注、送出前種子態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-004-bearer-header.png`（pixelmatch 反鋸齒感知 + maxDiffPixels 容差，非 byte-exact）。
    - 雙語：eng / cht 各一輪。
    - 清理：移除本檔特化認證 API、還原 base seed；echo 目標於本檔結束後關閉。

- **E2E-005**
  - title: 選 apikey 認證 API，API 金鑰標頭自動帶入並隨請求送達目標
  - description: 使用者於左樹點選一支 `authType='apikey'`（`authConfigJson` 為 `{name,value,in:'header'}`）之 API 後切「測試」分頁；請求建構器 Headers 依 seedFromItem 自動帶入一列 `<name>: <value>`（預設鍵名 `X-API-Key`，`in='header'` 入 Headers）。目標設為 echo，送出後回應內容回顯該金鑰值。粒度同 E2E-004（獨立認證 API、種子態 baseline、echo 語意斷言）；`in='query'` 為認證設定變體（帶入 Query 而非 Headers，見「認證帶入分支」表），本 case 以 `in='header'` 覆蓋 header 帶入分支。
  - flow:
    - 測試資料：一支 `authType='apikey'`、`authConfigJson={name,value,in:'header'}`、目標指向 echo 之認證 API（本檔特化）；base seed API 樹。
    - 操作：API 工作區 →（左樹點該 apikey 認證 API）→ 點「測試／測試」分頁 →（讀建構器 Headers 帶入之金鑰列）→ 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：建構器 Headers 含一列鍵為金鑰名、值為金鑰值；送出後回應面板內容含該金鑰值。
      2. 視覺：建構器 Headers 區紅框標注、送出前種子態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-005-apikey-header.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：移除本檔特化認證 API、還原 base seed；echo 目標於本檔結束後關閉。

- **E2E-006**
  - title: 選 basic 認證 API，Basic 認證標頭自動帶入並隨請求送達目標
  - description: 使用者於左樹點選一支 `authType='basic'`（`authConfigJson` 為 `{username,password}`）之 API 後切「測試」分頁；請求建構器 Headers 依 seedFromItem 自動帶入一列 `Authorization: Basic <base64(username:password)>`。目標設為 echo，送出後回應內容回顯該 Basic 認證字串。粒度同 E2E-004。
  - flow:
    - 測試資料：一支 `authType='basic'`、`authConfigJson={username,password}`、目標指向 echo 之認證 API（本檔特化）；base seed API 樹。
    - 操作：API 工作區 →（左樹點該 basic 認證 API）→ 點「測試／測試」分頁 →（讀建構器 Headers 帶入之認證列）→ 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：建構器 Headers 含一列鍵為 `Authorization`、值為 `Basic <base64(username:password)>`；送出後回應面板內容含該 Basic 認證字串。
      2. 視覺：建構器 Headers 區紅框標注、送出前種子態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-006-basic-header.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：移除本檔特化認證 API、還原 base seed；echo 目標於本檔結束後關閉。

- **E2E-007**
  - title: 於請求建構器新增 Query／Header 列並勾選，送出後參數生效於目標
  - description: 承預設所選 API（取得API清單，GET）之測試分頁。使用者於 Query 表填入一列鍵值、新增一列並取消其勾選，於 Headers 表新增一列填入鍵值；將目標網址改為測試自帶 echo 後送出。預期 echo 回應內容顯示已勾選之 query 參數與新增之 header 皆生效，未勾選之列不納入送出（對應 spec 規則「僅 `on` 且鍵非空之列納入送出」）。粒度：建構器編輯後之種子態為決定性做 baseline；echo 回應僅語意斷言、不做 baseline。
  - flow:
    - 測試資料：base seed 之預設 API（取得API清單）；測試自帶 echo 目標。
    - 操作：點「測試／測試」分頁 →（Query 表首列填鍵值、另新增一列填鍵值並取消其勾選；Headers 表新增一列填鍵值）→ 於「Request URL／請求網址」改為 echo 目標 → 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：echo 回應內容含已勾選之 query 鍵值與新增之 header 鍵值；不含被取消勾選之列值。
      2. 視覺：Query 與 Headers 兩表紅框標注、送出前編輯態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-007-kv-edit.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：純編輯與送請求、未持久化；起跑前還原 base seed；echo 目標於本檔結束後關閉。

- **E2E-008**
  - title: 選 POST API 編輯請求內容送出，方法與內容送達目標
  - description: 使用者於左樹點選一支 `method='post'` 之 API（新增狗狗資訊），切「測試」分頁後出現請求內容輸入區（僅非 GET/HEAD 顯示）。使用者清空並輸入一段 JSON 請求內容，將目標網址改為 echo 後送出。預期 echo 回應顯示 method 為 POST、請求內容為所輸入之 JSON（`contentType` 含 json 時前端解析為物件送出）。粒度：編輯後之建構器態為決定性做 baseline；echo 回應僅語意斷言。
  - flow:
    - 測試資料：base seed 之 POST API（新增狗狗資訊）；測試自帶 echo 目標。
    - 操作：API 工作區 →（左樹點該 POST API）→ 點「測試／測試」分頁 →（清空請求內容區、輸入 JSON 請求內容）→ 於「Request URL／請求網址」改為 echo 目標 → 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：送出後回應面板內容含 method `POST` 與所輸入 JSON 之欄位值。
      2. 視覺：方法選擇 + 請求內容區紅框標注、送出前編輯態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-008-post-body.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：純編輯與送請求、未持久化；起跑前還原 base seed；echo 目標於本檔結束後關閉。

## 執行流程

```
001  點「測試」分頁 onChangeMode({id:'test'}) → mode='test'  [src/components/LayoutContent.vue:147-151,575-582]
002  渲染 <LayoutContentTest :item="apiSelect">  [src/components/LayoutContent.vue:215-219]
003      mounted / watch.item 觸發 seedFromItem(item)（種子帶入建構器）  [src/components/LayoutContentTest.vue:271-283,409]
004          method ← item.method（大寫）  [src/components/LayoutContentTest.vue:417-418]
005          url ← item.url 優先，否則 item.testBaseUrl  [src/components/LayoutContentTest.vue:421]
006          headers ← item.defaultHeadersJson 轉列；依 authType 帶入認證；contentType 加 Content-Type  [src/components/LayoutContentTest.vue:424-465]
006a             authType='bearer': 加 header `Authorization: Bearer <token>`（token 取 authConfigJson.token，留空退用 item.tokens 第一個）  [src/components/LayoutContentTest.vue:433-439]
006b             authType='apikey': 依 authConfigJson.in 決定入 header 或 query（name 預設 `X-API-Key`）  [src/components/LayoutContentTest.vue:440-452]
006c             authType='basic': 加 header `Authorization: Basic base64(username:password)`  [src/components/LayoutContentTest.vue:453-460]
007          query ← item.defaultQueryJson 轉列（apikey 且 in='query' 時亦於此併入認證列）  [src/components/LayoutContentTest.vue:425,440-452]
008          body ← item.defaultBodyJson 優先，否則 item.inputExample  [src/components/LayoutContentTest.vue:478-485]
009          重置回應：res=null、errSend=''  [src/components/LayoutContentTest.vue:488-489]
010  改 Request URL（v-model req.url）後點「送出請求」onClickSend → submitSend()  [src/components/LayoutContentTest.vue:22-30,524-527]
011      執行非同步流程 core()  [src/components/LayoutContentTest.vue:529-612]
012          清空 errSend、res  [src/components/LayoutContentTest.vue:534-536]
013          同步檢測：URL 必填  [src/components/LayoutContentTest.vue:539-542]
                 空: errSend=valRequired 並 return（短路，不打網路）  [src/components/LayoutContentTest.vue:540-542]
014          開本地 loading（sending=true）  [src/components/LayoutContentTest.vue:545]
015          組合 spec：method / url / 過濾後 headers·query / body（依 contentType 決定 JSON）/ timeout 30000  [src/components/LayoutContentTest.vue:548-584]
016          呼叫後端 proxyRequest(spec)，reject 時落下方 .catch  [src/components/LayoutContentTest.vue:587]
                 後端校驗 url（空或非 http(s): reject('errReqUrlInvalid')）  [server/procProxy.mjs:26-32]
                 isAllowTarget 為否: reject('errReqTargetNotAllowed')  [server/procProxy.mjs:34-40]
                 axios 送出（validateStatus 全通過，4xx/5xx 不 throw）  [server/procProxy.mjs:79-88]
                 成功: resolve { status, statusText, headers, data, durationMs }  [server/procProxy.mjs:93-99]
                 axios 例外（timeout/DNS）: srLog.error 記錄 axios 真實訊息（不回前端）後 reject('errProxyRequestFailed')  [server/procProxy.mjs:102-108]
017          .then: res=回應、okSend=true  [src/components/LayoutContentTest.vue:588-591]
018          .catch: errSend=$transErr(err)（後端 err-key 依 lang 反查在地化文字），顯示於 err-bar  [src/components/LayoutContentTest.vue:592-595]
019          okSend 為否則 return（短路）  [src/components/LayoutContentTest.vue:596-598]
020      .catch: 非預期例外 → $alert  [src/components/LayoutContentTest.vue:605-609]
021      .finally: sending=false（解除 loading）  [src/components/LayoutContentTest.vue:610-612]
022  回應面板：res=null 顯示空狀態 resEmpty；否則顯示狀態列（statusClass 依 2xx/3xx/4xx/5xx）+ 耗時 + headers + body 高亮  [src/components/LayoutContentTest.vue:193-216,305-365]
```

## 回應狀態分流

| 狀態碼 | statusClass | 樣式語意 |
|---|---|---|
| 2xx | s2 | 成功 |
| 3xx | s3 | 轉向 |
| 4xx | s4 | 用戶端錯誤 |
| 5xx | s5 | 伺服端錯誤 |

註：axios `validateStatus:()=>true`，故 4xx/5xx 也走成功 resolve、由面板顯示其狀態碼，不視為 proxy 失敗。

## i18n 訊息粒度規則

| 觸發情境 | i18n 鍵區位（grep 提示）| 顯示位置 | 粒度規則 |
|---|---|---|---|
| 測試分頁 | `server/procLang.mjs` 找 `tabTest` | 內容區分頁列 | 一鍵 |
| 建構器 | 找 `reqSend` / `reqUrlPlaceholder` / `reqQuery` / `reqHeaders` / `reqBody` / `reqAddRow`、`colOn` / `colKey` / `colValue` | addr-bar、kv-table 表頭/欄 | 每元素一鍵；表頭欄位不換行 |
| 回應區 | 找 `resEmpty` / `resTitle` / `resTime` / `resHeaders` / `resBody` | 回應面板 | 空狀態、各區段標題各一鍵 |
| URL 空 | 找 `valRequired` | err-bar inline | 一鍵 |
| 兜底錯誤 | 找 `anUnexpectedErrorOccurred` | $alert | 一鍵 |

## 參數來源

| 建構器欄位 | 來源 API 種子 | 說明 |
|---|---|---|
| method | item.method（大寫）| 預設 GET |
| url | item.url 優先 → item.testBaseUrl | 兩者皆空才空 |
| headers | item.defaultHeadersJson + authType 認證 + contentType | 認證帶入分支見下「認證帶入分支」表 |
| query | item.defaultQueryJson（+ apikey in='query' 認證）| JSON 轉列 |
| body | item.defaultBodyJson → item.inputExample | 非 GET/HEAD 才顯示 |
| proxy 目標 url | 使用者於 req.url 輸入框最終值 | 送給 axios 的 url |
| timeout | 硬編碼 30000 ms | — |

## 認證帶入分支（seedFromItem 依 item.authType 解析 item.authConfigJson）

| authType | 帶入位置 | 帶入內容 | code |
|---|---|---|---|
| none | — | 不帶入認證 | — |
| bearer | header | `Authorization: Bearer <token>`；token 取 authConfigJson.token，留空退用 item.tokens 以 `;` 切第一個 | [src/components/LayoutContentTest.vue:433-439] |
| apikey | header 或 query | name（預設 `X-API-Key`）→ value；`authConfigJson.in==='query'` 入 query，否則入 header | [src/components/LayoutContentTest.vue:440-452] |
| basic | header | `Authorization: Basic <base64(username:password)>`（btoa 編碼）| [src/components/LayoutContentTest.vue:453-460] |

## 非決定性欄位（baseline 以遮罩處理）

| 欄位 | 成因 |
|---|---|
| res.durationMs | 每次請求耗時不同 |
| res.headers.date | 目標 server 回傳當下時間 |
| res.headers.etag | 目標 server 每次可能不同 |
| 回應 headers 整體 | JSON.stringify 全部 headers，含上列時間相關欄位 |

故回應 baseline 截圖時以黑色遮罩遮去 durationMs（`.w-tnum`）與 headers pre（含上列時間相關欄位）兩區域，再以 pixelmatch 反鋸齒感知 + maxDiffPixels 容差比對（非 byte-exact）；狀態碼 200 與 body（HTML）為決定性、保留比對（對齊 §全域規範 6.2「真有極少數區域怎麼等都不穩 → 遮罩該區域」）。

## spec 規則摘要（粒度 / 邊界 / 順序 / 契約）

- **驗證順序**：清空 → URL 必填檢測（在開 loading 之前）→ 開 sending → 組 spec → proxy（catch + 旗標短路）→ res 渲染 → finally 解 sending（對齊 §全域規範 5.1）。
- **粒度**：
  - 送出前種子穩定態做 baseline；送出後回應因含非決定性欄位只做語意斷言。
  - 4xx/5xx 由 validateStatus 全通過，視為「有回應」顯示狀態碼，非 proxy 失敗。
- **邊界**：
  - URL 空短路不打網路；非 http(s) 或 not-allowed 由後端 reject。
  - body 僅非 GET/HEAD 顯示與送出。
- **契約**：
  - 高頻/跨域請求一律經後端 proxy（繞過 CORS）；前端不直接打目標。
  - proxy timeout 30s。
