# API 文件展示流程

## 觸發

使用者以帶 `?token=sys` 的網址開啟頁面；`App.vue` 完成登入與 webInfor 取得後才渲染 `Layout`。進站預設頁為統計資訊頁，使用者點左側主選單「API」切至 API 工作區後，`LayoutContent.vue` 依後端同步下來的 API 清單建出左側樹、預設選取第一筆，右側顯示其 Docs 分頁文件。使用者可於樹搜尋、點選節點切換文件、切換 Docs/Edit/Test 分頁、切換語系、收合左側抽屜。

## 重要流程

- **E2E-001**
  - title: 載入顯示 API 樹與第一筆 API 文件
  - description: 使用者以 `?token=sys` 進入頁面（開發模式自動登入為管理員；進站預設頁為統計資訊頁），點左側主選單「API」切至 API 工作區。預期左側渲染出多筆 seeded API 的樹狀清單、右側預設顯示第一筆 API（取得API清單）的 Docs 分頁。確立「API 工作區就緒」基準畫面。
  - flow:
    - 測試資料：base seed，至少含「取得API清單」（url `http://localhost:11005/getAPIsList`，預設選取）與「取得寵物清單」。
    - 操作：開啟 `<baseUrl>/?token=sys`（cht 輪改開 `<baseUrl>/?token=sys&lang=cht`，以 URL `?lang=` 指定語系、**初始畫面即中文**，不經 UI 切換）→ 點左側主選單「API」切至 API 工作區。
    - 驗證（等待樹渲染完成——同時出現「取得API清單」與「取得寵物清單」後）：
      1. 語意：左樹含上述兩筆；docs 顯示第一筆 url；三分頁顯示當前語系之「Docs／Edit／Test」（中文「文件／編輯／測試」）。
      2. 視覺：整體載入就緒基準，全頁乾淨截圖、**不畫紅框**（本案無單一聚焦區、整頁皆主體；全框＝無標註意義），與 baseline `test/pics/display/display-{eng,cht}-E2E-001-docs-list.png` 視覺一致（pixelmatch 容差）。
    - 雙語：eng / cht 各一輪。
    - 清理：純展示、不改動資料；起跑前還原 base seed。

- **E2E-002**
  - title: 左樹分類階層與方法 badge 正確
  - description: 驗證左樹的巢狀分類結構與葉節點方法標記。預期分類群組正確巢狀（寵物 ＞ 狗狗／貓咪、交通工具 ＞ 汽車），各 API 葉節點顯示其方法 badge（GET/POST/PUT/DEL）。守樹的結構與 badge 對應，產專屬紅框 baseline（`...-E2E-002-tree.png`）。
  - flow:
    - 測試資料：base seed——分類 `API`／`寵物`／`寵物.狗狗`／`寵物.貓咪`／`交通工具.汽車`；方法涵蓋 get（取得API清單）/post（新增狗狗資訊）/put（變更狗狗資訊）/del（刪除狗狗資訊）。
    - 操作：載入頁面（同 E2E-001 起點）。
    - 驗證（等待樹渲染後）：
      1. 語意：左樹含分類標題「寵物」「狗狗」「貓咪」「交通工具」「汽車」且巢狀歸屬正確；「取得API清單」節點顯示 GET、「新增狗狗資訊」顯示 POST、「變更狗狗資訊」顯示 PUT、「刪除狗狗資訊」顯示 DEL。
      2. 視覺：整頁、紅框標注左樹區（分類階層 + 方法 badge），與 baseline `test/pics/display/display-{eng,cht}-E2E-002-tree.png` 視覺一致（pixelmatch 反鋸齒感知 + maxDiffPixels 容差，非 byte-exact）。
    - 雙語：eng / cht 各一輪。
    - 清理：純展示；起跑前還原 base seed。

- **E2E-003**
  - title: 左樹搜尋過濾
  - description: 於搜尋框輸入關鍵字，左樹即時過濾為符合的 API（比對 name/keywords/url/levels/method）；清空後還原全部。守搜尋功能。
  - flow:
    - 測試資料：base seed；搜尋詞「cats」（命中 keywords 含 `pets;cats` 的 4 筆貓咪 API，不命中「取得API清單」與狗狗）。
    - 操作：於「Search API…／搜尋API…」搜尋框輸入「cats」→ 清空。
    - 驗證：
      1. 語意：輸入後左樹只含貓咪 API（取得貓咪清單等）、不含「取得API清單」；清空後恢復含「取得API清單」與「取得寵物清單」。
      2. 視覺：過濾態整頁、紅框**聚焦「搜尋框」**（本案主體為搜尋動作；框整個樹會失去標註意義），與 baseline `test/pics/display/display-{eng,cht}-E2E-003-search-filtered.png` 視覺一致（pixelmatch 容差）。
    - 雙語：eng / cht 各一輪。
    - 清理：純讀取；起跑前還原 base seed。

- **E2E-004**
  - title: 點選樹節點切換右側文件
  - description: 點左樹另一個 API 葉節點，右側 Docs 即更新為該筆。守樹↔文件連動。選一個 POST API 以同時驗證方法 badge 隨之改變。
  - flow:
    - 測試資料：base seed 之「新增狗狗資訊」（method=post，url `http://localhost:11005/addDog`，levels `寵物.狗狗`）。
    - 操作：載入後 → 於左樹點「新增狗狗資訊」節點。
    - 驗證（等待右側標頭更新後）：
      1. 語意：docs 標頭 op-title=「新增狗狗資訊」、op-path url 含 `addDog`、方法 badge=POST；不再顯示第一筆「取得API清單」之 url。
      2. 視覺：整頁、紅框標注切換後的 docs 標頭，與 baseline `test/pics/display/display-{eng,cht}-E2E-004-selected-post-doc.png` 視覺一致（pixelmatch 反鋸齒感知 + maxDiffPixels 容差，非 byte-exact）。
    - 雙語：eng / cht 各一輪。
    - 清理：純讀取；起跑前還原 base seed。

- **E2E-005**
  - title: 文件標頭與 metadata pills 正確
  - description: 驗證 docs 標頭與中繼資料 pills 由所選 API 欄位正確產生，含關鍵字分號切為多 chip。守標頭與 pills 區塊內容，各自產專屬紅框 baseline。
  - flow:
    - 測試資料：預設第一筆「取得API清單」（description=「API管理中心取得API清單資訊」、version=v1、levels=API、keywords=`API;center`、state=ok、creator=apis-system、dataSource=apis-data）。
    - 操作：載入頁面（預設選第一筆）。
    - 驗證：
      1. 語意：標頭顯示 name=「取得API清單」、url 含 `getAPIsList`、description=「API管理中心取得API清單資訊」；pills 顯示 version「v1」、levels「API」、keywords 切為兩個 chip「API」與「center」、state「ok」、creator「apis-system」、dataSource「apis-data」（各 pill 標籤依語系）。
      2. 視覺：整頁、紅框分別標注標頭與 pills，2 張 baseline `test/pics/display/display-{eng,cht}-E2E-005-header.png`、`...-E2E-005-pills.png` 視覺一致（pixelmatch 反鋸齒感知 + maxDiffPixels 容差，非 byte-exact）。
    - 雙語：eng / cht 各一輪。
    - 清理：純展示；起跑前還原 base seed。

- **E2E-006**
  - title: 輸入/輸出參數與請求/回應程式碼區正確
  - description: 驗證 docs 主體三區——輸入參數、輸出欄位（皆 markdown 表格）、請求 cURL 與回應 JSON。守參數與程式碼區塊渲染，各區塊自產專屬紅框 baseline。
  - flow:
    - 測試資料：第一筆「取得API清單」之 mdInputParams（含 token/id/paramA/paramB 列）、mdOutputParams、outputExample（含 id/weight/color 等）。
    - 操作：載入頁面（預設第一筆）。
    - 驗證：
      1. 語意：docInput 區標題 + 參數表格出現「token」「paramA」等列；docOutputFields 區標題 + 輸出表格；請求區出現 cURL 字串（含 `-X GET` 與 getAPIsList）；回應區標題「200 OK」與 JSON 內容（含「weight」「color」）。
      2. 視覺：整頁、紅框分別標注輸入/輸出/請求/回應 4 區，4 張 baseline `...-E2E-006-{input,output,request,response}.png` 視覺一致（pixelmatch 反鋸齒感知 + maxDiffPixels 容差，非 byte-exact）（輸出/回應在 fold 以下，截圖前先捲入再框）。
    - 雙語：eng / cht 各一輪。
    - 清理：純展示；起跑前還原 base seed。

- **E2E-007**
  - title: Docs/Edit/Test 分頁預設與切換
  - description: 驗證三分頁存在、預設 Docs active，點 Test 切換、點 Docs 切回。守分頁列與切換（僅描述本流程可觀察之分頁切換，不展開 Edit/Test 視圖內部）。
  - flow:
    - 測試資料：base seed（預設第一筆）。
    - 操作：載入（Docs 預設）→ 點「Test／測試」分頁 → 點「Docs／文件」分頁。
    - 驗證：
      1. 語意：三分頁「Docs/Edit/Test」皆存在；載入時 Docs 為 active（顯示 docs 標頭 op-title）；點 Test 後 docs 標頭不再顯示（切離 docs）；點 Docs 後 docs 標頭重新顯示。
      2. 視覺：不另產 baseline（純分頁切換互動，docs 態已由 E2E-001 守）。
    - 雙語：eng / cht 各一輪。
    - 清理：純互動；起跑前還原 base seed。

- **E2E-008**
  - title: 語系切換即時重渲染
  - description: 由語系選單切換 eng↔cht，全頁 i18n 文字（分頁/pills/區段標題）即時改語言。守語系切換互動本身（各態外觀由其他 case 的雙語輪覆蓋）。
  - flow:
    - 測試資料：base seed。
    - 操作：預設 eng → 點語系選單切「中文」→ 再切「English」。
    - 驗證：
      1. 語意：eng 時分頁顯示「Docs/Edit/Test」；切 cht 後顯示「文件/編輯/測試」且 pills 標籤轉中文；切回 eng 後恢復英文。
      2. 視覺：不另產 baseline（切換互動；各語系外觀由其他 case 雙語輪覆蓋）。
    - 雙語：本 case 即雙語切換，單輪涵蓋。
    - 清理：純互動；起跑前還原 base seed。

- **E2E-009**
  - title: 左側抽屜顯隱
  - description: 點抽屜顯隱鈕收合左樹、再點展開，內容區隨之 reflow。守 WDrawer 顯隱功能。
  - flow:
    - 測試資料：base seed。
    - 操作：載入 → 點抽屜顯隱鈕（收合）→ 再點（展開）。
    - 驗證：
      1. 語意：收合後左樹搜尋框與節點不可見（抽屜滑出視窗）、內容區佔滿；再點後左樹恢復可見。
      2. 視覺：收合態整頁、紅框標注左上「展開」鈕，與 baseline `test/pics/display/display-{eng,cht}-E2E-009-drawer-collapsed.png` 視覺一致（pixelmatch 反鋸齒感知 + maxDiffPixels 容差，非 byte-exact）。
    - 雙語：eng / cht 各一輪。
    - 清理：純互動；起跑前還原 base seed。

## 執行流程

```
001  瀏覽器載入 index.html，注入 window.___pmwapi___（含 urlRedirect）  [public/index.html:17-19]
002  main.js 掛載 App，啟動 WServHapiClient 長連線（useWaitToken）  [src/main.js:60-106]
003  App.vue beforeMount 初始化語系、呼叫 w-ui-loginout 登入  [src/App.vue:47-98]
         開發模式於 localhost 自動以 query token 'sys' 送出 GET /api/getUserByToken?token=sys  [src/App.vue:92]
004      後端取 token user：token==='sys' 直接回傳管理員 user  [srv.mjs:60-62]
             驗證 user 欄位 id/email/name/isAdmin  [server/WWebApi.mjs:311-338]
                 欄位不合: reject('errUserIdMissing'/'errUserEmailMissing'/'errUserNameMissing'/'errUserRoleMissing')  [server/WWebApi.mjs:316,322,328,335]
             驗證權限 isAdmin==='y'  [srv.mjs:90]
                 非管理員: reject('errUserNoPermission')  [server/WWebApi.mjs:397]
005      登入成功: 更新連線態 / token / user  [src/App.vue:60-65]
006      登入失敗: 導向 ___pmwapi___.urlRedirect  [src/App.vue:67-83]
007  長連線建立後取 webInfor（webLogo/showLanguage/language/kpLang）  [src/main.js:71]
             kpLang 由 procLang 產生（各分頁/欄位 i18n）  [server/WWebApi.mjs:241]
008      取得成功: 寫入 webInfor、重刷語系、標記同步完成  [src/main.js:82-86]
009  ready（連線態 csLogin 且 webInfor 就緒）成立後才渲染 <Layout>  [src/App.vue:104-116]
010  後端將 apis 資料表推送前端，寫入 store.state.apis  [src/main.js:96-99][src/store/mutations.mjs:78-80]
             資料源 woItems.apis.select 經 LMDB  [server/procApis.mjs:11-12]
011  LayoutContent 之 changeApis 監看 apis（與 search）變動，呼叫 genTree  [src/components/LayoutContent.vue:368-375]
012      依 levels.name 建巢狀物件、convertToTree 轉樹結構  [src/components/LayoutContent.vue:440-460]
013      決定預設選取：保留上次 id，否則取第一筆 apis[0]  [src/components/LayoutContent.vue:464-470]
014      寫入 apiSelect / apisTree  [src/components/LayoutContent.vue:474-476]
015  WTree 渲染左樹（分類標題 + 葉節點 method badge + 名稱）  [src/components/LayoutContent.vue:65-108]
016  右側 mode 預設 'docs'，顯示 apiSelect 的 Docs 面板  [src/components/LayoutContent.vue:144-152,349]
017      標頭：method badge / op-title 名稱 / op-path url / 描述  [src/components/LayoutContent.vue:161-164]
018      metadata pills：version / levels / keywords（分號切 chip）/ state / creator / dataSource  [src/components/LayoutContent.vue:167-173,383-391]
019      左欄：docInput + docOutputFields（MdPanel 渲染 md）  [src/components/LayoutContent.vue:179-186]
020      右 code rail：docRequest（cURL）+ resTitle（200 OK，JSON 高亮）  [src/components/LayoutContent.vue:190-199]
```

### 互動處理入口（各互動 case 的 handler）

```
搜尋過濾（E2E-003）：搜尋框 v-model="search"（placeholder $t('searchApiPlaceholder')）  [src/components/LayoutContent.vue:51-53]
                      → search 變更觸發 changeApis → genTree 依 name/keywords/url/levels/method 過濾  [src/components/LayoutContent.vue:372-374,430-436]
節點點擊（E2E-004）：樹葉節點 @click="ckItem(...)" → 設 apiSelect/apiActive、newMode=false  [src/components/LayoutContent.vue:91,565-573]
分頁切換（E2E-007）：@click="onChangeMode({id})" → vo.mode = id  [src/components/LayoutContent.vue:148-150,575-582]
語系切換（E2E-008）：語系選單 @input="toggleLang"  [src/components/Layout.vue:40]
                      → setLang 廣播 forceUpdate 重渲染  [src/components/Layout.vue:199-200]
抽屜顯隱（E2E-009）：收合鈕 @click="drawer=false" [src/components/LayoutContent.vue:133] / 展開鈕 @click="drawer=true" [src/components/LayoutContent.vue:246]
                      → 控制 WDrawer v-model="drawer"  [src/components/LayoutContent.vue:33]
```

## i18n 訊息粒度規則

| 觸發情境 | i18n 鍵區位（grep 提示）| 顯示位置 | 粒度規則 |
|---|---|---|---|
| mode 三分頁 | `server/procLang.mjs` 找 `tabDocs` / `tabEdit` / `tabTest` | 右側內容區頂部分頁列 | 每分頁一鍵，隨語系切換 |
| Docs metadata 標籤 | 找 `levels` / `keywords` / `creator` / `dataSource` | docs 標頭下方 pills | 每欄位標籤一鍵；pill 之值為資料不翻譯 |
| Docs 區段標題 | 找 `docInput` / `docOutputFields` / `docRequest` / `resTitle` | docs 左欄與右 code rail 標題 | 每區段標題一鍵 |
| 樹搜尋框 | 找 `searchApiPlaceholder` | 左樹上方搜尋框 placeholder | 與 e2e 之 SEARCH_PH 須逐字同步 |
| 語系選單 | 找 Layout.vue `English` / `中文` 選項 | 右上語系選單 | 兩語系選項 |

## 參數來源

| 概念 | 來源（優先序）| 流程影響 |
|---|---|---|
| 登入 token | URL `?token=sys`（w-ui-loginout 於 localhost 自動帶入）| 'sys' 在 srv.mjs 直接回管理員 user，免帳密 |
| API 清單 | 後端 `woItems.apis.select` → LMDB，經長連線推送寫入 `store.state.apis` | 樹與 docs 全部資料源 |
| 預設選取項 | 保留上次選取 id；否則第一筆 `apis[0]` | 決定載入後右側顯示哪一筆 |
| 樹過濾 | `search` 字串（搜尋框 v-model）| 比對 name/keywords/url/levels/method（toLowerCase），空字串顯示全部 |
| 抽屜顯隱 | `drawer` 布林（顯隱鈕 toggle）| 控制 WDrawer 收合/展開 |
| 語系 | URL `?lang=`（最高優先，供初始畫面指定語系）> `window.___pmwperm___.language`（server 注入初值）> store；右上語系選單亦可執行期切換 | 決定 i18n 文字與 cht baseline |

## spec 規則摘要（粒度 / 邊界 / 順序 / 契約）

- **驗證順序**：登入（token → 權限）→ webInfor 就緒 → apis 同步 → 建樹 → 預設選第一筆 → 渲染 docs（順序屬 spec；ready 未成立前不渲染 Layout）。
- **粒度**：
  - 樹就緒判準＝同時出現「取得API清單」與「取得寵物清單」（只看第一筆會過早滿足）。
  - keywords 以分號 `;` 切為多個 chip；空字串過濾。
  - 樹過濾比對 name/keywords/url/levels/method 五欄（toLowerCase）。
  - docs 子區塊（標頭/pills/參數/程式碼）各產一張紅框整頁 baseline（紅框標注該區塊），不再共用 E2E-001。
- **邊界**：
  - apis 為空時清空樹與選取，不顯示 docs。
  - 預設選取優先保留上次 id，資料重建後維持選取連續性。
  - 搜尋無命中時樹為空。
- **契約**：
  - token='sys' 僅開發模式捷徑；正式須真實 token 且 isAdmin==='y'。
  - 前端不主動輪詢，資料由後端 syncData 推送驅動重渲染。
  - 語系切換經 setLang 廣播 forceUpdate，全頁即時重渲染。
