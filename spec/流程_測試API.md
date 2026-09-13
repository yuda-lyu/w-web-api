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
  - description: 承預設所選 API（取得API清單，GET）之測試分頁。使用者於 Query 表填入一列鍵值、新增一列並取消其勾選，於 Headers 表新增一列填入鍵值；再新增第三列 query 填入鍵值後點該列「×」刪除，表回到兩列且各列勾選狀態維持；將目標網址改為測試自帶 echo 後送出。預期 echo 回應內容顯示已勾選之 query 參數與新增之 header 皆生效，未勾選之列與已刪除之列皆不納入送出（對應 spec 規則「僅 `on` 且鍵非空之列納入送出」）。粒度：建構器編輯後之種子態為決定性做 baseline；echo 回應僅語意斷言、不做 baseline。
  - flow:
    - 測試資料：base seed 之預設 API（取得API清單）；測試自帶 echo 目標。
    - 操作：點「測試／測試」分頁 →（Query 表首列填鍵值、另新增一列填鍵值並取消其勾選；Headers 表新增一列填鍵值）→ 於「Request URL／請求網址」改為 echo 目標 →（截圖後：再新增第三列 query 填鍵值 → 點該列「×」刪除）→ 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：刪列後 Query 表恰兩列（鍵 xqkey、yqkey；勾選狀態 勾選／未勾選 維持）；echo 回應內容含已勾選之 query 鍵值與新增之 header 鍵值；不含被取消勾選之列值；不含已刪除之列值。
      2. 視覺：Query 與 Headers 兩表紅框標注、送出前編輯態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-007-kv-edit.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：純編輯與送請求、未持久化；起跑前還原 base seed；echo 目標於本檔結束後關閉。
    - 備註：刪列步驟置於 baseline 截圖之後、送出之前，標準圖不受影響、刪列後之表列以語意斷言；表列以穩定列 id 為 `:key`（`src/components/LayoutContentTest.vue` `mkRow`），刪列不錯位（ADR-031 第 5 項）；「×」（`.kv-del-btn`）為建構器內原先唯一未被任何案例點過之可點元素。

- **E2E-008**
  - title: 選 POST API 編輯請求內容送出，方法與內容送達目標
  - description: 使用者於左樹點選一支 `method='post'` 之 API（新增狗狗資訊），切「測試」分頁後出現請求內容輸入區（僅非 GET/HEAD 顯示）。使用者清空並輸入一段 JSON 請求內容，將目標網址改為 echo 後送出。預期 echo 回應顯示 method 為 POST、請求內容為所輸入之 JSON（請求內容**原文送出**，Content-Type 由標頭表之列決定；見規則摘要「契約」）。粒度：編輯後之建構器態為決定性做 baseline；echo 回應僅語意斷言。
  - flow:
    - 測試資料：base seed 之 POST API（新增狗狗資訊）；測試自帶 echo 目標。
    - 操作：API 工作區 →（左樹點該 POST API）→ 點「測試／測試」分頁 →（清空請求內容區、輸入 JSON 請求內容）→ 於「Request URL／請求網址」改為 echo 目標 → 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：送出後回應面板內容含 method `POST` 與所輸入 JSON 之欄位值。
      2. 視覺：方法選擇 + 請求內容區紅框標注、送出前編輯態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-008-post-body.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：純編輯與送請求、未持久化；起跑前還原 base seed；echo 目標於本檔結束後關閉。

- **E2E-009**
  - title: 目標回傳 JSON 陣列，回應內容顯示為格式化 JSON
  - description: 承預設所選 API（取得API清單）之測試分頁。使用者把目標網址改為測試自帶之固定陣列目標（回傳一個 JSON 陣列、元素為物件）後送出。預期回應內容區把陣列以縮排 2 之 JSON 文字呈現（與物件回應同一形式），而非 `[object Object],[object Object]` 或以逗號串接之純值。對應「回應 data 型別 → 顯示形式」表之陣列列；此固定陣列目標之回應 body 為決定性，故除語意斷言外亦做回應卡 pixel baseline（遮罩 durationMs 與 headers 同 E2E-001）。
  - flow:
    - 測試資料：base seed 之預設 API（取得API清單）；測試自帶固定陣列目標（`/arr`，回 `[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]`）。
    - 操作：點「測試／測試」分頁 → 於「Request URL／請求網址」改為固定陣列目標 → 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：回應面板顯示狀態碼 200；回應內容以 `[` 起頭、含 `"name": "alpha"`（鍵值間有空白＝經 `JSON.stringify(,2)` 縮排）、為多行；不含 `[object Object]`。
      2. 視覺：整頁紅框標回應卡，遮黑 durationMs（`.w-tnum` 固定寬）與 headers pre 後 `test/pics/apitest/apitest-{eng,cht}-E2E-009-array-response.png`（pixelmatch 容差比對；狀態碼與陣列 body 為決定性、保留比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：純送請求、未持久化；起跑前還原 base seed；固定陣列目標與 echo 同一 server、於本檔結束後關閉。

- **E2E-010**
  - title: 請求內容為非法 JSON 仍原文送達目標，不代換不攔截
  - description: 承 E2E-008 之 POST API（新增狗狗資訊）測試分頁。使用者於請求內容輸入一段**不是合法 JSON** 的文字（如未加引號之 `{dog:lucky,}`），目標改為 echo 後送出。預期工具不做任何解析、驗證或代換：echo 回應之 `body` 為使用者所打之原文字串（而非改造前被 `j2o` 靜默換成的 `{}`）、狀態碼 200（由目標決定，工具不擋）。對應規則摘要「契約」之「請求內容原文送出」（對標 Scalar api-client 之 `TextEncoder().encode(text)` 與 Postman raw 模式：打什麼送什麼、由目標決定回應）。粒度：送出前編輯態為決定性做 baseline；echo 回應僅語意斷言。
  - flow:
    - 測試資料：base seed 之 POST API（新增狗狗資訊）；測試自帶 echo 目標（收到非 JSON body 時回顯原字串）。
    - 操作：API 工作區 →（左樹點該 POST API）→ 點「測試／測試」分頁 →（清空請求內容區、輸入非法 JSON 文字）→ 於「Request URL／請求網址」改為 echo 目標 → 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：回應面板顯示狀態碼 200；回應內容含 `"body": "{dog:lucky,}"`（原文字串原封送達）；不含 `"body": {}`（未被代換為空物件）。
      2. 視覺：方法選擇 + 請求內容區紅框標注、送出前編輯態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-010-invalid-json-body.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：純編輯與送請求、未持久化；起跑前還原 base seed；echo 目標於本檔結束後關閉。

- **E2E-011**
  - title: 請求內容清空送出，不帶 body
  - description: 承 E2E-008 之 POST API 測試分頁。使用者把請求內容清空，目標改為 echo 後送出。預期工具不補任何內容：echo 收到之 body 為空（改造前會靜默送出 `{}`）。對應規則摘要「契約」之「空白則不帶 body」（同 Scalar：空文字 → 不帶 body）。粒度：送出前清空態為決定性做 baseline；echo 回應僅語意斷言。
  - flow:
    - 測試資料：base seed 之 POST API（新增狗狗資訊）；測試自帶 echo 目標。
    - 操作：API 工作區 →（左樹點該 POST API）→ 點「測試／測試」分頁 →（清空請求內容區）→ 於「Request URL／請求網址」改為 echo 目標 → 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：回應面板顯示狀態碼 200；回應內容含 `"body": ""`（空）；不含 `"body": {}`。
      2. 視覺：方法選擇 + 請求內容區紅框標注、送出前清空態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-011-empty-body.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：純編輯與送請求、未持久化；起跑前還原 base seed；echo 目標於本檔結束後關閉。

- **E2E-012**
  - title: 選方法為 DEL 之 API 送出，目標收到 HTTP 標準動詞 DELETE
  - description: 使用者於左樹點選一支資料層 `method='del'` 之 API（刪除狗狗資訊），切「測試」分頁後方法欄顯示 `DEL`；將目標改為 echo 後送出。預期 echo 回應之 `method` 為 `DELETE`——工具於送出時把顯示層代號 `DEL` 轉為 HTTP 標準動詞（`mShare.methodToHttpVerb`）。對應規則摘要「契約」之「方法代號 → HTTP 動詞」（ADR-030：`DEL` 非 HTTP 動詞，改造前目標於 HTTP 層直接回 400 且 handler 不執行，種子資料 3 支刪除類 API 全數無法測試）。粒度：送出前種子態（方法欄 DEL + echo 網址）為決定性做 baseline；echo 回應僅語意斷言。
  - flow:
    - 測試資料：base seed 之「刪除狗狗資訊」（`method='del'`）；測試自帶 echo 目標。
    - 操作：API 工作區 →（左樹點該 DEL API）→ 點「測試／測試」分頁 →（讀方法欄顯示 DEL）→ 於「Request URL／請求網址」改為 echo 目標 → 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：送出前方法欄顯示 `DEL`；送出後回應面板顯示狀態碼 200、回應內容含 `"method": "DELETE"`、不含 `"method": "DEL"`。
      2. 視覺：address bar 紅框標注（方法欄 DEL + echo 網址）、送出前態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-012-del-method.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：純送請求、未持久化；起跑前還原 base seed；echo 目標於本檔結束後關閉。

- **E2E-013**
  - title: 重複之 Query／Header 鍵皆送達目標，不互相覆蓋
  - description: 承預設所選 API（取得API清單，GET）之測試分頁。使用者於 Query 表填入兩列相同鍵、不同值，於 Headers 表新增兩列相同鍵、不同值，將目標網址改為測試自帶 echo 後送出。預期兩個 query 值皆送達目標，回應內容把該鍵回顯為含兩個值之陣列；兩個標頭值亦皆送達，回應內容回顯為以逗號空格合併之單一值。適合確認同名參數或標頭重複給值時，工具不會只送出其中一列。
  - flow:
    - 測試資料：base seed 之預設 API（取得API清單）；測試自帶 echo 目標（重複 query 鍵回顯為陣列）。
    - 操作：點「測試／測試」分頁 →（Query 表首列填 `dupq`／`dv1`、新增一列填 `dupq`／`dv2`；Headers 表新增兩列各填 `X-Dup`／`ha`、`X-Dup`／`hb`）→ 於「Request URL／請求網址」改為 echo 目標 → 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：echo 回應內容含 `"dupq": ["dv1", "dv2"]`（縮排格式）與 `"x-dup": "ha, hb"`。
      2. 視覺：Query 與 Headers 兩表紅框標注、送出前編輯態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-013-dup-keys.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：純編輯與送請求、未持久化；起跑前還原 base seed；echo 目標於本檔結束後關閉。
    - 備註：對應規則摘要「契約」之「重複鍵不收斂」（ADR-031 第 3 項）：改造前以物件收斂，同鍵之後列靜默覆蓋前列。粒度：送出前編輯態（兩表各含兩列同鍵）為決定性做 baseline；echo 回應僅語意斷言。前端有序鍵值對見 `src/plugins/mShare.mjs` `kvRowsToPairs`；標頭合併由 proxy 之 `Headers` 依 Fetch 標準執行（`server/procProxy.mjs` `toPairs`／`proxyRequest`），unit 另守 cookie 以 `; ` 合併（PROXY-011）。

- **E2E-014**
  - title: 預設標頭已明給 Content-Type 時，測試分頁不再補一列 contentType
  - description: 使用者於左樹點選一支預設標頭已含 Content-Type 為 text/plain 的 POST API，切「測試」分頁。預期 Headers 表只有一列 Content-Type，值為預設標頭所給的 text/plain，不會再多出一列由「內容類型」欄位補上的 application/json；送出至測試自帶 echo 後，回應內容顯示目標收到的 content-type 就是 text/plain 這一個值。適合確認明給標頭與「內容類型」欄位相衝時，以使用者明給者為準。
  - flow:
    - 測試資料：本檔特化 API「API標頭測試ContentType」（`method='post'`、`levels='API'`、`url` 指向 echo、`defaultHeadersJson='{"Content-Type":"text/plain"}'`；`contentType` 為 funNew 預設 `application/json`），疊加於 base seed。
    - 操作：API 工作區 →（左樹點該 API）→ 點「測試／測試」分頁 →（讀 Headers 表）→ 點「送出請求／送出請求」。
    - 驗證：
      1. 語意：Headers 表恰一列鍵為 Content-Type（不分大小寫）、值 `text/plain`；echo 回應內容含 `"content-type": "text/plain"`、不含 `application/json`。
      2. 視覺：Headers 表紅框標注、送出前種子態 baseline `test/pics/apitest/apitest-{eng,cht}-E2E-014-content-type-single.png`（感知容差比對）。
    - 雙語：eng / cht 各一輪。
    - 清理：移除本檔特化 API、還原 base seed；echo 目標於本檔結束後關閉。
    - 備註：對應規則摘要「契約」之「重複鍵不收斂」末句（ADR-031 第 4 項）：改造前兩列並存（預設標頭之明給列＋依 contentType 補之列），送出時被收斂或合併，皆非使用者所見；對標 Postman 之「使用者明給之標頭優先於自動標頭」。粒度：送出前種子態（Headers 表）為決定性做 baseline；echo 回應僅語意斷言。帶入邏輯見 `src/components/LayoutContentTest.vue` `seedFromItem`。

## 執行流程

```
001  點「測試」分頁 onChangeMode({id:'test'}) → mode='test'  [src/components/LayoutContent.vue:147-151,575-582]
002  渲染 <LayoutContentTest :item="apiSelect">  [src/components/LayoutContent.vue:215-219]
003      mounted / watch.item 觸發 seedFromItem(item)（種子帶入建構器）  [src/components/LayoutContentTest.vue:271-283,409]
004          method ← item.method（大寫）  [src/components/LayoutContentTest.vue:417-418]
005          url ← item.url 優先，否則 item.testBaseUrl  [src/components/LayoutContentTest.vue:421]
006          headers ← item.defaultHeadersJson 轉列；依 authType 帶入認證；預設標頭未明給 Content-Type（不分大小寫）時才由 contentType 補一列（明給者優先，ADR-031）  [src/components/LayoutContentTest.vue:seedFromItem]
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
014          開 loading：本地 sending=true（送出鈕禁用）+ 頁面層 updateLoading(true) 全頁 overlay（三層雙擊防護之頁面層，ADR-031）  [src/components/LayoutContentTest.vue:submitSend]
015          組合 spec：method / url / headers·query 為有序鍵值對（僅 on 且鍵非空之列；重複鍵各自保留，mShare.kvRowsToPairs）/ body（原文字串；空白不帶；GET/HEAD 不帶）/ timeout 30000  [src/components/LayoutContentTest.vue:submitSend][src/plugins/mShare.mjs:kvRowsToPairs]
016          呼叫後端 proxyRequest(spec)，reject 時落下方 .catch  [src/components/LayoutContentTest.vue:submitSend]
                 後端校驗 url（空或非 http(s)/非法 URL: reject('errReqUrlInvalid')）  [server/procProxy.mjs:proxyRequest]
                 isAllowTarget（建構子 opt.isAllowTarget 接線）為否: reject('errReqTargetNotAllowed')  [server/procProxy.mjs:isTargetAllowed][server/WWebApi.mjs:isAllowTarget]
                 標頭（物件或鍵值對）→ Headers：剝除 host/content-length/hop-by-hop，重複鍵依 Fetch 標準合併（', '；cookie '; '）；query 逐對 append 併入 URL（重複鍵各自送達）；字串 body 轉位元組原封（不補 Content-Type）  [server/procProxy.mjs:toPairs,proxyRequest]
                 Node fetch 送出（4xx/5xx 不 throw；整條轉址鏈共用一個 AbortSignal.timeout；redirect:'manual' 手動跟隨：每跳重驗 isAllowTarget、301/302 之 POST 與 303 改 GET 並丟 body 與 content-* 標頭、307/308 保留、跨來源剝除 Authorization、上限 20 跳、3xx 無 Location 視為最終回應；轉址鏈之拒絕 srLog 'proxyRequest-redirect' 後 reject 對應 err-key）  [server/procProxy.mjs:proxyRequest]
                 成功: text 可 parse 者回物件否則原文；resolve { status, statusText, headers, data, durationMs }  [server/procProxy.mjs:proxyRequest]
                 fetch 例外（timeout/DNS/連線拒絕/受限標頭）: srLog.error 記錄真實訊息與 cause（不回前端）後 reject('errProxyRequestFailed')  [server/procProxy.mjs:proxyRequest]
017          .then: res=回應、okSend=true  [src/components/LayoutContentTest.vue:submitSend]
018          .catch: errSend=$transErr(err)（後端 err-key 依 lang 反查在地化文字），顯示於 err-bar  [src/components/LayoutContentTest.vue:submitSend]
019          okSend 為否則 return（短路）  [src/components/LayoutContentTest.vue:submitSend]
020      .catch: 非預期例外 → updateLoading(false) 後 showCheckYes(anUnexpectedErrorOccurred, {type:'error'}) modal（ADR-031；不用自動消失之 $alert）  [src/components/LayoutContentTest.vue:submitSend]
021      .finally: sending=false + updateLoading(false)（解除本地與頁面層 loading，統一一處）  [src/components/LayoutContentTest.vue:submitSend]
022  回應面板：res=null 顯示空狀態 resEmpty；否則顯示狀態列（statusClass 依 2xx/3xx/4xx/5xx）+ 耗時 + headers + body（物件／陣列：mShare.jsonHighlight 語法高亮，與 docs 分頁共用；其餘原文只 escape 不上色）  [src/components/LayoutContentTest.vue:bodyHighlighted][src/plugins/mShare.mjs:jsonHighlight]
```

## 回應狀態分流

| 狀態碼 | statusClass | 樣式語意 |
|---|---|---|
| 2xx | s2 | 成功 |
| 3xx | s3 | 轉向 |
| 4xx | s4 | 用戶端錯誤 |
| 5xx | s5 | 伺服端錯誤 |

註：fetch 對 4xx/5xx 不 throw（改造前 axios 以 `validateStatus:()=>true` 達成同效），故 4xx/5xx 也走成功 resolve、由面板顯示其狀態碼，不視為 proxy 失敗。

## 回應 data 型別 → 顯示形式（`bodyHighlighted`，經 `src/plugins/mShare.mjs` 之 `dataToText`，元件內以 `$s.dataToText` 取用）

| res.data 型別（proxy 對回應 text 嘗試 JSON.parse 後） | 顯示 | 覆蓋 |
|---|---|---|
| 純物件 | `JSON.stringify(v, null, 2)` 縮排文字 + 語法高亮 | E2E-004~008（echo 物件） |
| 陣列（元素為物件／純值／巢狀／空陣列） | 同上（與物件同一形式） | E2E-009（物件陣列）；其餘型別 unit |
| 字串（HTML／text） | 原文（只 escape、不上色；純文字中的數字／true 不是 JSON token） | E2E-001（本機 HTML） |
| 數字／布林／null／空 body | `String(v)` | unit |

判定用 `isJsonContainer(v)`（純物件或陣列）；同一述語亦用於請求 body 解析（contentType 含 json 時，解析結果為物件或陣列才以解析值送出，否則送原字串）。

## i18n 訊息粒度規則

| 觸發情境 | i18n 鍵區位（grep 提示）| 顯示位置 | 粒度規則 |
|---|---|---|---|
| 測試分頁 | `server/procLang.mjs` 找 `tabTest` | 內容區分頁列 | 一鍵 |
| 建構器 | 找 `reqSend` / `reqUrlPlaceholder` / `reqQuery` / `reqHeaders` / `reqBody` / `reqAddRow`、`colOn` / `colKey` / `colValue` | addr-bar、kv-table 表頭/欄 | 每元素一鍵；表頭欄位不換行 |
| 回應區 | 找 `resEmpty` / `resTitle` / `resTime` / `resHeaders` / `resBody` | 回應面板 | 空狀態、各區段標題各一鍵 |
| URL 空 | 找 `valRequired` | err-bar inline | 一鍵 |
| 兜底錯誤 | 找 `anUnexpectedErrorOccurred` | showCheckYes modal（type:'error'，先關 loading） | 一鍵 |

## 參數來源

| 建構器欄位 | 來源 API 種子 | 說明 |
|---|---|---|
| method | item.method（大寫）| 預設 GET |
| url | item.url 優先 → item.testBaseUrl | 兩者皆空才空 |
| headers | item.defaultHeadersJson + authType 認證 + contentType（僅預設標頭未明給 Content-Type 時補一列） | 認證帶入分支見下「認證帶入分支」表；明給之 Content-Type 優先（ADR-031） |
| query | item.defaultQueryJson（+ apikey in='query' 認證）| JSON 轉列 |
| body | item.defaultBodyJson → item.inputExample | 非 GET/HEAD 才顯示 |
| proxy 目標 url | 使用者於 req.url 輸入框最終值 | 送給 fetch 的 url（query 併入） |
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

- **驗證順序**：清空 → URL 必填檢測（在開 loading 之前）→ 開 sending + 頁面層 loading → 組 spec → proxy（catch + 旗標短路）→ res 渲染 → finally 解 sending 與 loading（對齊 §全域規範 5.1）。
- **粒度**：
  - 送出前種子穩定態做 baseline；送出後回應因含非決定性欄位只做語意斷言。
  - 4xx/5xx 由 validateStatus 全通過，視為「有回應」顯示狀態碼，非 proxy 失敗。
- **邊界**：
  - URL 空短路不打網路；非 http(s) 或 not-allowed 由後端 reject。
  - body 僅非 GET/HEAD 顯示與送出。
- **契約**：
  - 高頻/跨域請求一律經後端 proxy（繞過 CORS）；前端不直接打目標；proxy 以 Node 內建 fetch 實作（ADR-029）。
  - **請求內容原文送出**：字串 body 以位元組原封送達，不解析、不驗證、不代換、不補 Content-Type；空白則不帶 body；GET/HEAD 不帶（對標 Scalar api-client / Postman raw 模式；ADR-029）。
  - **標頭表為唯一真理源**：勾選之列原樣轉送；proxy 僅剝除 host / content-length 與 hop-by-hop（connection / keep-alive / transfer-encoding / te / trailer / upgrade）；不自動補任何標頭。
  - **重複鍵不收斂**：Query／Headers 表以有序鍵值對送出（僅 on 且鍵非空之列，`mShare.kvRowsToPairs`）；重複之 query 鍵各自送達目標（`?id=1&id=2`）、重複之標頭由 proxy 依 Fetch 標準合併（`, `；cookie 為 `; `）；預設標頭已明給 Content-Type 者不再補 contentType 列（明給優先，對標 Postman）。why：改造前以物件收斂，同鍵之後列靜默覆蓋前列（ADR-031）。
  - **轉址逐跳檢核**：proxy 以 `redirect:'manual'` 手動跟隨轉址（上限 20 跳），每一跳重新檢核 `isAllowTarget`（建構子 `opt.isAllowTarget` 接線）；301/302 之 POST 與 303 改 GET 並丟 body 與 content-* 標頭、307/308 保留、跨來源剝除 Authorization（Fetch 標準 §4.4）；3xx 無 Location 視為最終回應。why：`redirect:'follow'` 無逐跳 hook，合法首跳可 302 到不允許之位址繞過檢核（ADR-031）。

## 已知落差

每條帶分類標籤（缺陷（待修）／設計事實（記錄備查）／待裁示（業主決定）／已修復（附修復紀錄））；修復後不刪、改標已修復。

- **已修復（附修復紀錄）**（2026-09-13，ADR-031 第 3 項）：Query／Headers 同鍵多列送出時以物件收斂，同鍵之後列靜默覆蓋前列（原 `src/components/LayoutContentTest.vue` `submitSend` 之 `query[row.key] = row.value`），使用者看到兩列卻只送出一列。修復：有序鍵值對送出（`mShare.kvRowsToPairs`）、proxy 逐對 append／標頭依 Fetch 標準合併；案例 E2E-013、unit PROXY-011。
- **已修復（附修復紀錄）**（2026-09-13，ADR-031 第 4 項）：預設標頭已明給 Content-Type 時仍依「內容類型」欄再補一列，Headers 表出現兩列 Content-Type（原 `seedFromItem`）。修復：明給者優先、不補列；案例 E2E-014。
- **已修復（附修復紀錄）**（2026-09-13，ADR-031 第 6 項）：回應內容之語法高亮對鍵與字串值不上色（規則以 `&quot;` 比對但 escape 未換引號），且對 HTML／純文字回應亦把數字上色（原 `bodyHighlighted` 自寫規則）。修復：與 docs 分頁共用 `mShare.jsonHighlight`，非 JSON 容器只 escape；E2E-001 步驟 3 與 E2E-009 標準圖重產。
- **已修復（附修復紀錄）**（2026-09-13，ADR-031 第 8 項）：送出期間僅送出鈕禁用、無頁面層 loading（三層雙擊防護之頁面層缺）。修復：`submitSend` 開 `updateLoading(true)`、`finally` 關；實機以延遲 1.5 秒之 echo 觀察到「Processing...／處理中請稍後...」對話框出現並於回應後消失。
- **已修復（附修復紀錄）**（2026-09-13，ADR-031 第 2 項）：proxy 以 `redirect:'follow'` 跟隨轉址，合法首跳可 302 到不允許之位址繞過 `isAllowTarget`，且建構子未接線該 hook。修復：手動逐跳檢核＋`opt.isAllowTarget` 接線；unit PROXY-012～016。
  - proxy timeout 30s。
  - **方法代號 → HTTP 動詞**：資料層 `del`／顯示層 `DEL` 於送出前一律轉為 `DELETE`（`src/plugins/mShare.mjs` 之 `methodToHttpVerb`，與 docs 分頁之 cURL 產生共用同一函式）；其餘動詞正規化為大寫、空值退回 `GET`。why：`DEL` 非 HTTP 動詞，實測目標於 HTTP 層直接回 400 且 handler 不執行（ADR-030）。資料層與顯示層之 `del`／`DEL` 本身不改。
