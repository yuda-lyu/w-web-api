# 規則帳本分冊:多人同時編輯之寫入契約(w-web-api)

> **2026-10-23 更新(api-run01, 排程第 112 項, ADR-043): 第二波已實作.** 本冊 §1~§8 為 inv01 之盤點與規劃(保留為紀錄; §5 方案 A 與「同步維持 delAll＋insert」已由主控取代, 見 §5 頂端與 R-IMPORT-01); **現況與規則以本冊末尾 §9「實作結果與規則」為準**, 狀態見 `../state/state.md`.

> 本分冊為 inv01 盤點輪(2026-10-22, 排程第 112 項第一步)新建; 索引見 `rulebook.md`. 本輪**只盤點與規劃, 未改 `src/`、`server/`、`test/`**; 第二波實作待 w-serv-orm 共用核心(第 110 項)發布後進行.

## 多人同時編輯(原則 10)

- **規格(單一來源)**: `C:\opensrcOper\dspec\多人同時編輯之寫入契約.md`(規格 1, 雜湊版本 `h1`; 第 3、4、9、10、11 節約束本冊盤點內容, 第 13 節 V1~V14 為驗收). 上位原則: `C:\opensrcOper\sgud\proc\process_principle.md` 第 10 條. 定稿方案與三審採納表: `C:\opensrcOper\dnow\20261022221854\方案v2.md`(歸檔後在 `dhist\`; 本套件方向見第 3.3 節, 現存缺陷見第六節 E5~E8).
- **摘要**: ①新增: 各存各的, 不去重. ②修改: 後者蓋前者, 但僅限「看著最新資料改」或「不帶基準之寫入」(外部同步、外部應用); 持舊畫面存檔者整次拒收(零寫入、保留草稿、提示重新載入). ③刪除: 先刪先贏, 後刪者回 `rowNotFound`(含不帶基準者). ④不上鎖、不部分變更. ⑤基準 = 有序 `[[id, 列摘要]]`(`h1`), 前端以畫面所見之同一快照自算, 後端於表鎖內新鮮讀取重算; 不設快取. ⑥所有寫入入口(存檔、刪除、外部同步、系統直寫)取**同一表鎖**; 修改只改不增(已刪之列不得復活). ⑦外部同步沿用穩定 id, 內容不變則摘要不變. ⑧資料列記錄最後修改者(`userIdUpdate`).
- **本冊狀態(現況)**: 盤點完成(2026-10-22); **第二波已於 2026-10-23 實作**(契約入碼 `src/schema/contracts/apis.mjs`; 規則與驗收對照見 §9); E5/E6/E7/E8 與其餘缺陷之「修前紅」探測見 §6, 修後全綠.
- **環境事實(部署前提, 規格 §12 / 方案 2.8)**:
  - 單一行程. ORM = `WServOrm(ds, WOrm, url, db)`(`server/WWebApi.mjs:274`), 參考部署後端 `w-orm-lmdb`(`srv.mjs:1`); 每個 `WWebApi` 實例一個 ORM 實例(`woItems`、`procOrm`, `WWebApi.mjs:283`).
  - **`useCache`**: w-serv-orm 以 `new WOrm({ url, db, cl })` 建各表 ORM(`node_modules/w-serv-orm/src/getWoItems.mjs:39-42`, 不給 `useCache`), w-orm-lmdb 預設 `false`(`node_modules/w-orm-lmdb/src/WOrmLmdb.mjs:54,82-85`)→ 比對用之讀取不經快取, 滿足規格 §12.
  - **同表之其他 ORM 實例**(不在服務行程內): `g_mOrm.mjs:15`(離線工具 `g_initialTestData.mjs`、`g_backupDb.mjs`)與 `test/tools/e2e-setup.mjs:24`(測試 `resetToBaseSeed`/種子插入). 前者**須在服務停止時才可執行**(寫入不經服務之表鎖); 後者僅測試用, 與服務行程循序而非並行.
  - 前端資料通道(w-serv-webdata)以表時間戳(`tableTags-web-api.json`)觸發整表 `select` 重取, 故任何寫入(含同步之 `delAll` 與 `insert` 各一次)皆使所有已開頁面的 store 整表被替換(`src/main.js:91-94` → `src/store/mutations.mjs:79-81`).

## 1. 欄位三分類(`apis` 表; schema 全集 = `src/schema/tables/apis.mjs` 一張表, 28 欄)

分類定義見規格 §4. `fields` = 入基準 = 存檔採用客戶端值; `serverOnly` = 不入基準、存檔保留庫內值. 「同步列」= 該欄在 `provideTabs` 白名單 `ks_apis`(`server/provideTabs.mjs:9-27`)內, 即外部同步會推送者; 其餘欄經同步寫成 `''`(`ltdtmapping`, `WWebApi.mjs:640`; ADR-031 設計事實).

| # | 欄 | 型別 | 分類 | 入基準 | 判定依據(檔:行) |
|---|---|---|---|---|---|
| 1 | `id` | STRING pk | 主鍵(非欄位) | 作為基準之 id | `apis.mjs:16-20`; 存檔沿用 `procApis.mjs:47-48`; 新增由 funNew `apis.mjs:133`; 同步未給者由 w-serv-orm 補隨機 id `node_modules/w-serv-orm/src/getMapOrm.mjs:785-794` |
| 2 | `order` | INTEGER | **客戶端欄位(一般欄位, 不設 `orderKey`)** | 是 | 編輯表單可直接改 `LayoutContentEdit.vue:88-93`(`v-model.number`); `saveApi` 不重編 `procApis.mjs:43-52`; 同步推送 `provideTabs.mjs:11`, 且同步不覆寫 order `WWebApi.mjs:603`; 新增空白列為 `''` `LayoutContent.vue:567-579` |
| 3 | `name` | STRING | 客戶端 | 是 | schema `:25-28`; 表單 `LayoutContentEdit.vue:14`; 同步列 `provideTabs.mjs:12`; 必填 `WWebApi.mjs:553-555`、`LayoutContentEdit.vue:374-377` |
| 4 | `description` | TEXT | 客戶端 | 是 | `:29-32`; 表單 `:22`; 同步列 `provideTabs.mjs:13` |
| 5 | `url` | STRING | 客戶端 | 是 | `:33-36`; 表單 `:29`; 同步列 `:14`; 必填同 name |
| 6 | `method` | STRING | 客戶端 | 是 | `:37-40`; 表單 `:36-49`(WTextSelect); 同步列 `:15` |
| 7 | `version` | STRING | 客戶端 | 是 | `:41-44`; 表單 `:56`; 同步列 `:16` |
| 8 | `group` | STRING | 客戶端(兼同步範圍鍵) | 是 | `:45-48`; 表單 `:63`; 同步一律以請求之 group 覆寫列值 `WWebApi.mjs:601-606`, 並以 group 為 delAll 範圍 `:662` |
| 9 | `levels` | STRING | 客戶端 | 是 | `:49-52`; 表單 `:70`; 同步列 `:18` |
| 10 | `keywords` | STRING | 客戶端 | 是 | `:53-56`; 表單 `:77`; 同步列 `:19` |
| 11 | `state` | STRING | 客戶端 | 是 | `:57-60`; 表單 `:84`; 同步列 `:20` |
| 12 | `creator` | STRING | 客戶端(外部主導, UI 不編輯但整列來回) | 是 | `:61-64`; 表單無此欄(`git grep form.creator` 為空), 但 `form = cloneDeep(item)` 整列送回 `LayoutContentEdit.vue:297,305,407`; 同步列 `provideTabs.mjs:21` |
| 13 | `dataSource` | STRING | 客戶端(同 creator) | 是 | `:65-68`; 同上; 同步列 `:22` |
| 14 | `tokens` | TEXT | 客戶端(UI 本地欄) | 是 | `:69-72`; 表單 `:98`; 不在 `ks_apis` → 同步寫 `''`(ADR-031) |
| 15 | `mdInputParams` | STRING | 客戶端 | 是 | `:73-76`; 表單 `:114`; 同步列 `:23` |
| 16 | `inputExample` | STRING | 客戶端 | 是 | `:77-80`; 表單 `:124`; 同步列 `:24` |
| 17 | `mdOutputParams` | STRING | 客戶端 | 是 | `:81-84`; 表單 `:131`; 同步列 `:25` |
| 18 | `outputExample` | STRING | 客戶端 | 是 | `:85-88`; 表單 `:141`; 同步列 `:26` |
| 19 | `testBaseUrl` | STRING | 客戶端(UI 本地欄) | 是 | `:89-92`; 表單 `:158`; 非同步列 |
| 20 | `authType` | STRING | 客戶端(UI 本地欄) | 是 | `:93-96`; 表單 `:169`; funNew 空值補 `'none'` `apis.mjs:137`(對客戶端值之正規化, 非獨立系統寫入); 非同步列 |
| 21 | `authConfigJson` | TEXT | 客戶端(UI 本地欄) | 是 | `:97-100`; 表單 `:186`; JSON 檢核 `LayoutContentEdit.vue:382-399`; 非同步列 |
| 22 | `defaultHeadersJson` | TEXT | 客戶端(UI 本地欄) | 是 | `:101-104`; 表單 `:195` |
| 23 | `defaultQueryJson` | TEXT | 客戶端(UI 本地欄) | 是 | `:105-108`; 表單 `:204` |
| 24 | `defaultBodyJson` | TEXT | 客戶端(UI 本地欄) | 是 | `:109-112`; 表單 `:213` |
| 25 | `contentType` | STRING | 客戶端(UI 本地欄) | 是 | `:113-116`; 表單 `:222`; funNew 空值補 `'application/json'` `apis.mjs:138`; 同步寫 `''`(測試分頁視為「不補 Content-Type」, ADR-031) |
| 26 | `timeCreate` | STRING | **伺服器專有** | 否 | `:117-120`; funNew `apis.mjs:134`; procOrm 於 insert 時寫 `getMapOrm.mjs:729-734`; 現況 `saveApi` 卻採客戶端值 `procApis.mjs:49-51`(缺陷 A7: 可偽造, 第二波改取庫內值) |
| 27 | `timeUpdate` | STRING | **伺服器專有** | 否 | `:121-124`; 每次 insert/save 由 procOrm 覆寫 `getMapOrm.mjs:743-766`; 不在表單 |
| 28 | `isActive` | STRING | **伺服器專有** | 否 | `:125-128`; funNew 強制 `'y'` `apis.mjs:136`; 同步寫 `''`(探測 C4); 全專案無讀取者(`git grep -c isActive -- server src test srv.mjs "g_*.mjs"` 僅 `apis.mjs` 2、`procLang.mjs` 1、`WWebApi.mjs` 1〔註解掉之舊碼 `:787`〕); 入基準會使「UI 存檔 `y` ↔ 同步 `''`」誤判為內容變動, 故列專有 |
| 29(補欄) | `userIdUpdate` | STRING | **伺服器專有**(新增) | 否 | 現無(缺陷 A4); w-serv-orm 於欄位存在時自動寫操作者 `getMapOrm.mjs:736-759`; 規格 §11 |

**統計**: 現有 28 欄 = 主鍵 1 + 客戶端欄位 24 + 雙方欄位 0 + 伺服器專有 3; 補 `userIdUpdate` 後 29 欄 = 1 + 24 + 0 + 4. 客戶端欄位 24 = 同步列 16(`ks_apis` 去 id)+ UI 本地欄 8(`tokens`、`testBaseUrl`、`authType`、`authConfigJson`、`defaultHeadersJson`、`defaultQueryJson`、`defaultBodyJson`、`contentType`); 同步列 16 中 UI 可編輯 14, 不可編輯 2(`creator`、`dataSource`).

**無雙方欄位的理由**: 雙方欄位定義為「後台可改, **系統**亦會寫」(規格 §4). 本表伺服器自行寫入者只有 `timeCreate/timeUpdate/isActive/userIdUpdate`, 皆後台不可編輯 → 伺服器專有. 外部同步屬「外部經存檔寫入」 → 客戶端欄位. 故規格 V4(系統直寫雙方欄位)對本套件**不適用**.

**已知後果(設計事實, 非待辦)**: ①同步會把 UI 本地欄 8 欄寫成 `''`(ADR-031), 故「UI 曾存過本地欄之列」遇相同內容重送, 摘要**會變**(本地欄被清, 屬真實內容變動); V2 以同步產生之列(本地欄原為空)驗證. ②UI 在外部同步群組內新增之列, 會在下次該群組同步被 `delAll` 清除(`group` 為外部來源之統一管理鍵, schema 註解 `apis.mjs:45`).

## 2. 寫入者全集(`apis` 表)

**盤點指令(可重跑, 於 repo 根)**:

```bash
# CMD1: 正式碼寫入/讀取站點(server、啟動檔、離線工具); 去註解行
git grep -nE "woItems(\.[A-Za-z]+|\[[A-Za-z]+\])\.(insert|save|del|delAll)\(|procOrm\(" -- server srv.mjs "g_*.mjs" | grep -vE "^\S+:[0-9]+:\s*(//|\*)"
# CMD2: 測試端寫入
git grep -nE "woItems(\.[A-Za-z]+|\[[A-Za-z]+\])\.(insert|save|del|delAll)\(" -- test | grep -v "//"
# CMD3: 離線工具(經套件函數間接寫入者不被 CMD1 命中)
git grep -nE "genTestData|getDb\.(backup|recover)" -- "g_*.mjs" server test toolg
# CMD4: 其他直寫語法(應為空)
git grep -nE "\.(mix|updateMany|updateOne|replaceOne)\(" -- server srv.mjs "g_*.mjs"
```

**結果(2026-10-22)**: CMD1 命中 6 行(`WWebApi.mjs:662,667`、`getOptDataChannel.mjs:38`、`procApis.mjs:23,55,74`), 含寫入 4 行(`WWebApi.mjs:662,667`、`procApis.mjs:55,74`)、讀取 2 行(`procApis.mjs:23`、`getOptDataChannel.mjs:38` 受 `authorizeExec` 限 select); 另有 2 行被註解掉之舊碼(`WWebApi.mjs:546,666`)不計. CMD2 命中 6 行(`e2e-apitest.test.mjs:368,397,424,693`、`e2e-setup.mjs:185,186`). CMD3 命中 `g_initialTestData.mjs`(→ `genTestData` → `woItems.apis.save`)、`g_backupDb.mjs`(`getDb.backup` 讀取; `recover` 已註解). CMD4 為空.
**站點數**: 正式寫入入口 **3 個**(`saveApi`、`deleteApi`、`syncAndReplaceTabs`), 寫庫呼叫 4 處; 離線工具寫入 1 個(`g_initialTestData`); 測試端寫入 2 個檔案(6 行); 資料通道寫入 0(已封); 外部推送端(客戶端程式, 非寫庫者)2 個. **未歸類 0**.

| # | 站點 | 入口(檔:行) | 取鎖 | 寫哪些欄位 | 經 procOrm | 刪除如何回報 |
|---|---|---|---|---|---|---|
| W1 | 後台/外部存檔 `saveApi`(kpFunExt) | `WWebApi.mjs:1010-1012` → `procApis.mjs:28-61`(procOrm save `:55`) | ①`lockSave('saveApi', userId)` 依使用者占位, 同人重送回 `saveInProgress` `:40`; ②局部 `kmx` 鍵 `saveApi:<id>` 或 `saveApi:new:<name>` `:36,41`(`pmKeyMutex()` 為 `procApis()` 內局部實例 `:17`). **無表鎖**, 與 W2/W3 不互斥 | 全 28 欄經 funNew(`apis.mjs:131-140`): 客戶端值為主; `id` 沿用; `timeCreate` 採客戶端值(A7); `isActive` 強制 `'y'`; `authType/contentType` 空值補預設; `timeUpdate` 由 ORM 覆寫; 無 `userIdUpdate` | 是(`save`, 預設 `autoInsert:true` + merge) | 不適用(回 `[{id}]`) |
| W2 | 後台刪除 `deleteApi`(kpFunExt) | `WWebApi.mjs:1013-1015` → `procApis.mjs:64-79`(procOrm del `:74`) | ①`lockSave('deleteApi', userId)` `:72`(占位衝突回 `deleteInProgress`); ②局部 `kmx` 鍵 `deleteApi:<id>` `:73`(與 `saveApi:<id>` **不同鍵**, 不互斥, 探測 C2). 無表鎖 | 不寫欄位, 刪整列 | 是(`del`) | **直接回 ORM 結果** `[{n,nDeleted,ok}]` `:74-77`; 列不存在亦 `n:0, ok:1` 視為成功(E6) |
| W3 | 外部同步 `syncAndReplaceTabs` | 路由 `WWebApi.mjs:853-931`(app 權杖, `verifyAppUser`)→ `:559-672` | **無任何鎖**(不經 `lockSave`、`kmx`; 全函數內無鎖呼叫); 其 `select`(`:649`)、`delAll`(`:662`)、`insert`(`:667`)三步各自獨立 | `delAll({group})` 後整批 insert 全 28 欄: `group` 覆寫為請求值 `:601-606`; `base64:` 前綴還原 `:608-628`; 必填檢核 `:630-637`; `ltdtmapping` 補 `''` `:640`; 主鍵檢核 `:643-658`; 未給 id 者由 ORM 補隨機 id(`getMapOrm.mjs:785-794`); insert 時 ORM 寫 `timeCreate/timeUpdate`(皆重設為現在) | `delAll` **否**(直呼 `woItems`, `:662`); `insert` 是(`:667`) | `delAll` 結果不回報(整群組清除); 回呼叫端 `[{id}]`(insert 結果) |
| W4 | 資料通道表操作 | `getOptDataChannel.mjs:37-51`; `methodsExec:['select']` `:58` | — | **無寫入**: 僅放行 `select`, 其餘 `errUserNoPermission` | `operOrm` → procOrm | 不適用(測試 `api-dataChannel`、`unit-dataChannel`) |
| W5 | 離線: `g_initialTestData.mjs` | `g_initialTestData.mjs:9` → `genTestData`(`node_modules/w-serv-orm/src/genTestData.mjs:49`) | 無(獨立 ORM 實例 `g_mOrm.mjs:15`); **須服務停止時執行** | 全欄(`ds.apis.funTest()` 種子) | 否(直呼 `woItems.apis.save`; 不補 userId) | 不適用 |
| W6 | 測試端: `resetToBaseSeed` / 種子插入 | `test/tools/e2e-setup.mjs:185-186`; `test/e2e-apitest.test.mjs:368,397,424,693` | 無(第二個 ORM 實例, 測試行程) | 全欄 | 否 | `delAll()` 全表 |
| W7 | 推送端(客戶端, 非寫庫者) | `server/provideTabs.mjs:33-94`(投影 `ks_apis` 後 POST W3); `g_provideApis.mjs`(範例) | — | 只送 `ks_apis` 17 欄(含 id) | — | — |

| R# | 讀取站點(非寫入, 供比對設計參照) | 位置 |
|---|---|---|
| R1 | `getApisList`(procOrm select, 不快取) | `procApis.mjs:20-25`, kpFunExt `WWebApi.mjs:1007-1009` |
| R2 | 同步前置查詢既有主鍵之群組 | `WWebApi.mjs:646-654`(`woItems.select({ id: { $in } })`) |
| R3 | 資料通道 `select` → 前端 store | `getOptDataChannel.mjs:37-40`; 前端 `src/main.js:91-94` |
| R4 | `[sys:*]` 與表時間戳 | w-serv-webdata(不經本套件程式) |

**鎖現況小結**: 三個寫入入口各用不同機制, **沒有任何一把鎖同時涵蓋存檔、刪除與同步**: 存檔/刪除只有「依使用者」與「依列」兩層互不相通之互斥, 同步零保護. 探測 C1(同步空窗內存檔)、C2(存檔與刪除並行)為紅.

## 3. 前端資料流與草稿被覆蓋之路徑

**資料流(現況)**:
1. `src/main.js:91-94` `recvData` → `UpdateTableData` → `state.apis = 整表`(`src/store/mutations.mjs:79-81`); 任一列變動皆整表重取(§「環境事實」).
2. `LayoutContent.vue:361-363` `apis` computed ← store; `:6` 模板綁 `:changeApis="changeApis"`, `:365-373` 該 computed 讀 `apis` 與 `search` 後呼叫 `genTree()`(**以 computed 副作用重建**).
3. `genTree`(`:405-476`): 記 `prevId = apiSelect.id` → `cloneDeep(vo.apis)` → 依 `search` 過濾 → 建樹 → `apiSelect = find(apis, {id: prevId}) || null`, 找不到取 `apis[0]`(`:461-469`)→ **每次重建 `apiSelect` 皆為全新物件**.
4. `editItem`(`:375-378`)= `newMode ? blankApi : apiSelect` → 傳入 `<LayoutContentEdit :item="editItem">`(`:205-213`).
5. `LayoutContentEdit.vue:295-308`: `mounted` 與 `watch item { deep:true, immediate:true }` 皆 `form = cloneDeep(val)` → **item 引用一變即覆寫整份表單**. 存檔 `submitSave` 送整份 `cloneDeep(vo.form)`(`:407`), 刪除送 `form.id`(`:462`), **無基準**.

**草稿被覆蓋之觸發路徑(逐一, 含無關列)**:

| 路徑 | 觸發 | 現況 | 程式路徑 | 實證 |
|---|---|---|---|---|
| P1 | 他人更新**無關列**(推播) | 草稿被覆寫為伺服器版, 無提示 | 步驟 1→2→3(新 `apiSelect` 物件)→5 | p3 `E7-A` 紅 |
| P2 | 他人更新**同一列** | 同 P1, 草稿靜默丟失 | 同上 | p3 `E7-B` 紅 |
| P3 | 他人**刪除**編輯中之列 | 編輯器**換成列表第一筆**, 草稿丟失且使用者可能誤以為仍在編輯原列 | `:461-469` 找不到取 `apis[0]` | p3 `C` 紅(Name 欄變 `Alpha API`) |
| P4 | 在左樹**搜尋框輸入**(非推播, 本機重建) | `changeApis` 依賴 `search` → 重建; 若目前列被濾掉亦**換筆**; 草稿丟失 | `:365-373`、`:427-433`、`:461-469` | p3 `D` 紅 |
| P5 | 同步 `delAll`→`insert` 空窗(兩次推播) | 空窗時列暫時消失 → 同 P3(換筆), 之後列回來也不復原 | W3 + P3 | 由 P3 + 非原子同步推得(未另測) |
| P6 | 點樹節點(含點同一列) | `ckItem` 設新 `apiSelect`(`:538-546`)→ 表單重置, 無提示 | 使用者主動 | 程式碼 |
| P7 | 切 Docs/Edit/Test 分頁 | `v-else-if` 銷毀編輯元件(`:205-219`), 回編輯分頁表單重置 | 使用者主動 | p3 `INFO F`(Name 回 `Beta API`) |
| P8 | 點「+ 新增 API」 | `onClickAddApi` 設新 `blankApi`(`:562-582`) | 使用者主動 | 程式碼 |
| 對照 | 新增模式(`+ New API`)下被推播 | **草稿保留**: `editItem` 為 `blankApi`, 不隨 `apiSelect` 重建 | `:375-378` | p3 `E(對照組)` 綠 |

P1~P5 為「推播/本機重建」路徑, 屬規格 §8 草稿保護範圍; P6~P8 為使用者主動離開路徑, 規格未要求(列為觀察, 見 §8 決定 D11).

## 4. 寫入契約草案(`apis`)

```js
//src/schema/contracts/apis.mjs(前後端同 import 一份; 位置為提案: 不在 src/schema/tables/, 避免 gi.mjs 之 genIndex 掃入)
export default {
    table: 'apis',
    pk: 'id',
    fields: [
        'order', 'name', 'description', 'url', 'method', 'version', 'group', 'levels', 'keywords', 'state',
        'creator', 'dataSource',
        'tokens', 'mdInputParams', 'inputExample', 'mdOutputParams', 'outputExample',
        'testBaseUrl', 'authType', 'authConfigJson', 'defaultHeadersJson', 'defaultQueryJson', 'defaultBodyJson', 'contentType',
    ], //24 欄
    serverOnly: ['timeCreate', 'timeUpdate', 'isActive', 'userIdUpdate'], //4 欄(userIdUpdate 補欄後)
    //orderKey: 不設——order 可由表單直接編輯且存檔不重編, 屬一般欄位(規格 §3)
    scope: null, //整表; 逐列存檔之基準只含該列
}
```

**理由**:
- `fields` 明列 24 欄(§1), 順序即宣告序; `serverOnly` 4 欄存檔一律保留庫內值(含 `timeCreate`: 現況採客戶端值為缺陷 A7).
- 無 `orderKey`: `order` 為一般欄位(三審 B-F06; `LayoutContentEdit.vue:88-93`), 入基準的是 `order` 的**值**.
- 無 `scope`: 本表無「部分列由系統管、部分列由人管」之切分(對照 sso tokens 的 `isApp`); 外部同步之範圍是 group, 但同步是不帶基準之寫入, 不需要基準範圍.
- `creator`/`dataSource` 入基準: 外部主導欄位, 外部改動應使持舊畫面者被拒(V3).
- **完整性測試(第二波必做)**: `Object.keys(ds.apis.settings)` 去 `id` 後必須等於 `fields ∪ serverOnly`(欄位增減時強迫重新分類).
- **逐列基準**: `saveApi`/`deleteApi` 之基準 = `[[id, digestRow(列)]]` 單元素陣列(規格 §5); 新增列不帶基準.
- **V10 注意**: 摘要為「數字與字串不互轉」; 本表 `order` 在 UI 存檔為 number、空白為 `''`、同步為外部給定或 `''`; 兩端讀同一庫內值, 不影響同構, 但外部送 `"5"` 與 UI 存 `5` 摘要不同(屬真實表示差異).

## 5. 外部同步之穩定來源識別

> **主控 2026-10-22 定案(取代本節之方案 A 與「同步維持 `delAll`＋`insert`」)**:依使用者裁示原則 11,識別由**外部自訂之來源鍵 `srcKey`** 提供,本套件不以 `[levels, method, url, version]` 等欄位推斷;同步改為於表鎖內依 `srcKey` 差異同步(新增/刪除/修改/不變),本站表單管理之欄位匯入不寫.規則見 `rulebook_backend.md` R-IMPORT-01,規格 `C:\opensrcOper\dspec\外部匯入之定義與機制.md`.以下保留 inv01 之分析作為紀錄(種子資料之唯一性實測仍可作為外部端訂 `srcKey` 之參考).

**現況**: 未帶 id 之列, 每次同步由 w-serv-orm 補**新隨機 id**(`getMapOrm.mjs:785-794`), 且 `delAll({group})` 先清舊列 → 同內容重送 id 全換(E8 紅; 對照組帶 id 者穩定). `README.md:115` 載明「未帶 id 之列照舊由系統補 id」, 故本改動屬對外可見之行為變更(須入 README Upgrade Notes).

**無 schema 保證之唯一鍵**(僅 `id` 為主鍵). 候選鍵 × 種子資料 14 列之唯一性(`p4-identity-candidates.mjs`):

| 候選識別(皆限同 `group` 內) | 種子唯一性 | 判定 |
|---|---|---|
| `name`(僅顯示名) | 14/14 | **不採**: 規格 §10 禁止只按顯示名稱; 業主定案「不以名稱為唯一鍵」(`spec/流程_編輯API.md:188`) |
| `method + url` | 11/14, 重複 3 組(`post addDog`、`put updateDog`、`del deleteDog` 在「狗狗」與「汽車」兩個 levels 各一) | **不足** |
| `levels + method + url` | 14/14 | 可用 |
| `levels + method + url + version` | 14/14 | **建議**(`version` 區分同端點並存的多版本文件) |

**建議方案(A)**: 識別鍵 = 同 `group` 內 `[levels, method, url, version]`. 演算法(在表鎖內, `delAll` 前):
1. `existing = select({ group })`(新鮮讀取); 對每列取識別鍵 `k`. **比對前雙方皆先經與 ORM 寫入相同之 `clearXSS` 正規化**(`getMapOrm.mjs:771-778` 寫入時對每值套 `clearXSS`; 探測 p5 實證 `a<b` 會被改寫為 `a&lt;b`, 不正規化會使含特殊字元之列 id 每次仍換).
2. 對批次內每個**未帶 id**之列: 若批次內該 `k` 恰 1 列且 `existing` 內該 `k` 恰 1 列, 且該既有 id 未被批次內「已帶 id 之列」占用 → 沿用該 id.
3. 其餘(識別鍵在批次內或既有內不唯一、或無對應)→ 維持現行: 由 ORM 補新 id, 並 `srLog.warn({ event:'syncIdentityAmbiguous', ... })`(只記列索引與原因, 不記列內容, 守 ADR-033).
4. 有帶 id 之列照舊(`checkRowIds` 檢核不變); 不跨群組比對.

**選項**:(A)如上(建議; 向下相容: 模糊者退回現行行為)、(B)以識別鍵雜湊直接當 id(免查詢, 但既有隨機 id 之列首次同步會換 id 一次, 且模糊者變成 `dup` 整批拒收)、(C)要求外部一律帶 id(未帶整批拒收; 破壞性). 見 §8 待裁示 T1.

## 6. 現存缺陷實證(修前紅)

探測腳本與原始輸出: 倉內 `./tmp/inv01/`(本輪結束清理); 備份於 `C:\opensrcOper\dnow\20261022221854\agent-out\api-inv01-probes\`. 重現: 將該資料夾放回 repo 的 `./tmp/inv01/`, 於 repo 根執行 `node ./tmp/inv01/<腳本>`(隔離 lmdb 於 `./tmp/inv01/work/db`, 埠 8552, 不碰 `./db` 與 11005; WOrm 以 `SlowOrm` 包裝注入延遲與操作窗記錄, 不改 src).

| 編號 | 缺陷 | 腳本 | 修前輸出摘要 | 規格期望 |
|---|---|---|---|---|
| E5 | 修改已被刪除之列使其復活 | `p1` E5 | A 建列→A 刪→B 以舊畫面 `saveApi` 回 success, `getApisList` 該列重現且名稱為 B 改的 | V6: `rowNotFound`、列不復活 |
| E5b | 以從未存在之 id 呼叫 `saveApi` 即新建該列 | `p1` E5b | `saveApi({id:'ghost-id-never-existed'})` 成功, 列被建立 | 修改不存在 → `rowNotFound` |
| E6 | 刪除不存在之列仍回成功 | `p1` E6/E6b | `deleteApi('no-such-id-e6')` → `{ok:true, msg:[{n:0,nDeleted:0,ok:1}]}`; 後刪者回同樣成功 | V7: `rowNotFound` |
| E7 | 推播時靜默丟棄編輯中草稿 | `p3`(真 Chromium + 隔離後端 + 複製之 dist) | P1~P4 四路徑皆紅(§3 表); 新增模式對照組綠 | V11: 草稿與基準不變並提示 |
| E8 | 同步相同內容重送(未帶 id)時 id 全換 | `p1` E8/E8c | 兩列 id 重送前後完全不同; 內容(去 id/時間)相同; 帶 id 對照組穩定 | V2: 摘要/id 不變 |
| A1 | **同步不取鎖**: 同步 `delAll` 與 `insert` 空窗內 `saveApi` 可插入, 同步回 success 但外部新內容被靜默丟棄 | `p2` C1/C1b | 同步窗 [96,816]ms、saveApi 在 [361,375] 完成成功; 最終 `name=ui-edit-during-sync`(外部 `ext-new` 因 insert 遇主鍵已存在而略過) | V14: 同鎖互斥 |
| A2 | **存檔/刪除異鍵不互斥**: 同列 `saveApi`(延遲寫入)與 `deleteApi` 並行, 刪除成功後被復活 | `p2` C2 | `del` 在 957-959ms、`save` 在 829-1437ms 重疊; 最終列存在且名稱為 `A-edit` | 同一表鎖 |
| A3 | **舊畫面存檔靜默回寫外部同步新值**(整表基準機制要解決之核心) | `p2` C3 | A 載入→外部同步改 `description`→A 只改 keywords 存檔, `description` 回到舊值 `v1-desc` | V1/V3: 整次拒收 |
| A4 | 無最後修改者 | `p2` C4a | 列僅 28 鍵, 無 `userIdUpdate` | 規格 §11 |
| A5 | 同步每次重設 `timeCreate`; `isActive` 在 UI 存檔(`y`)與同步(`''`)間飄移; `order` 同步後為 `''` | `p2` C4(INFO) | 同步後 `timeCreate` 重設為新時間; `isActive` `''`→(UI 存)`y`→(同步)`''` | 屬專有欄, 不入基準即不影響 V2 |
| A6 | 左樹搜尋框輸入即重建編輯器(P4) | `p3` D | Name 欄變 `Alpha API` | 併入 E7 |
| A7 | `saveApi` 採客戶端 `timeCreate`(伺服器專有欄被採信; 新舊列皆可偽造創建時間) | `p6` A7/A7c | 送 `1999-01-01…` 存後仍為該值 | 專有欄存檔保留庫內值 |
| (記錄) | UI 本地欄被同步清空(ADR-031 設計事實) | `p2` C4b(INFO) | 同步重送後 `tokens`、`authType` 回 `''` | 設計事實, 不改 |

## 7. 第二波實作規劃(待 w-serv-orm 共用核心發布; 以下相依其 API 形狀, 發布後須對照核實)

### 7.1 改動站點清單

| # | 檔:行 | 改動 |
|---|---|---|
| S1 | `server/procApis.mjs:3,13,17` | 移除 `pmKeyMutex` 與局部 `kmx`; `deps` 新增 `withTabLocks`、`guardWrite`、`contract`(未注入 → fail-closed 同 `lockSave` 慣例) |
| S2 | `procApis.mjs:28-61` `saveApi(userId, row, opt)` | 新增(無 id)→ 表鎖內 insert(不比對); 修改(有 id)→ `guardWrite`: 鎖內新鮮讀 `select({id})`, 無列 → `rowNotFound`; 有 `opt.baseline` → 比對(不符 `baselineMismatch`, 不識 `baselineFormat`); 寫入走 procOrm save **不插入**; `timeCreate/isActive` 取庫內值(修 A7)、`userIdUpdate/timeUpdate` 由 procOrm 寫; 回傳形狀不變 `[{id}]` |
| S3 | `procApis.mjs:64-79` `deleteApi(userId, id, opt)` | 表鎖內先查存在, 無 → `rowNotFound`; 有 baseline → 比對; 實際刪除筆數 0 → `rowNotFound`; 不再回原始 ORM 結果(改回固定形狀, 例 `{ id }`; **對外回傳形狀變更, 須入 README**) |
| S4 | `server/WWebApi.mjs:283,331,1010-1015` | 自 `wp` 取 `withTabLocks`/`guardWrite`; 注入 procApis; kpFunExt `saveApi`/`deleteApi` lambda 轉傳第三參 `opt`(現只轉前兩參) |
| S5 | `WWebApi.mjs:559-672` `syncAndReplaceTabs` | `:643-671`(主鍵群組 select、識別補 id、`delAll`、`insert`)整段包入 `withTabLocks(['apis'], …)`; `delAll` 前插入穩定 id 補值(§5); 前置純檢核(`:562-641`)維持鎖外 |
| S6 | 新 `server/syncIdentity.mjs` | 純函數: 識別鍵計算(含 `clearXSS` 正規化)、唯一性判定、補 id; 可單測 |
| S7 | `server/procLang.mjs` | 新增語系鍵(eng+cht): 存檔過期(沿用 perm 之 `saveStale` 命名)、列不存在、基準格式不識、編輯中提示「資料已被他人更新」「此 API 已被刪除」、重新載入鈕; 鍵名實作時依既有慣例(`errApi*`)定 |
| S8 | `src/schema/tables/apis.mjs:121-124` | 於 `timeUpdate` 後新增 `userIdUpdate`(STRING); `funNew` 不改 |
| S9 | 新 `src/schema/contracts/apis.mjs` | §4 契約 |
| S10 | `src/components/LayoutContent.vue:365-373,405-476,538-546,584-601`、模板 `:205-213` | 見 7.3 |
| S11 | `src/components/LayoutContentEdit.vue:263-308,343-489`、模板頂部 | 見 7.3 |
| S12 | 文件 | `spec/流程_編輯API.md`(執行流程、錯誤處理分層、新增 E2E 案例)、`spec/設計要點與取捨.md`(新 ADR: 表粒度基準、鎖、識別鍵)、`README.md` Upgrade Notes(行為變更: 同步 id 穩定、修改不存在列拒收、刪除未命中拒收、`deleteApi` 回傳形狀、舊頁面仍丟草稿之升級前限制) |

### 7.2 表鎖設計

- 一表一鍵 `apis`, 由共用核心 `withTabLocks(['apis'], fn)`(每 ORM 實例一個鎖管理器; 不可重入). `procApis` 與 `syncAndReplaceTabs` 必須取自**同一個 `WServOrm` 回傳物件**(`WWebApi.mjs:274` 單一實例, 已成立).
- 層次: `lockSave`(依使用者占位, 雙擊防護)在**外**, 表鎖在**內**: `lockSave → withTabLocks/guardWrite → ORM`. `lockSave` 不排隊, 僅拒絕同人重送, 與表鎖不衝突. 不得在 `guardWrite` 的 `write` 回呼內再取 `apis` 鎖.
- `saveApi` 修改與 `deleteApi` 用 `guardWrite`(鎖內讀、比、寫); 新增與無基準刪除用 `withTabLocks` 自行檢查存在; `syncAndReplaceTabs` 用 `withTabLocks`(同步不帶基準, 規格 §10).
- 同步持鎖時間 = 整批 `select + delAll + insert`; 期間存檔/刪除排隊(不逾時). 千列級可接受; 若日後批量極大再評估.
- 移除局部 `kmx`; `deleteApi:<id>` 與 `saveApi:<id>` 兩鍵消失(修 A2).
- 離線工具(W5)與測試端第二 ORM 實例(W6)不在鎖範圍: 帳本載明「離線工具須在服務停止時執行」.

### 7.3 前端: 自算基準與草稿保護接點

| 接點 | 設計 |
|---|---|
| 基準凍結 | `LayoutContentEdit` 於「**編輯目標變更**」時(`item.id` 改變、進出新增模式)一次性 `formInit = cloneDeep(row)`、`baseline = buildBaseline([row], contract)`(取自**畫面所見之 store 列**, 非表單), 存為 data(非 computed), 之後推播**不更新** |
| 取代深度 watch | 刪除 `watch item { deep, immediate }`(`:299-308`); 改為: ①`watch item.id`/`isNew` → 重建 `form` 與基準; ②新增 prop `latestRow`(store 中同 id 之最新列, 由 `LayoutContent` 提供, 找不到為 `null`); ③`watch latestRow`: 計 `remote = digest(latestRow) === baseline[0][1] ? 'same' : (latestRow ? 'changed' : 'deleted')` |
| dirty | `dirty = !isEqual(pick(form, contract.fields), pick(formInit, contract.fields))`(只比契約欄位, 專有欄變動不算) |
| 推播處置 | `remote==='changed'` 且 `!dirty` → 照舊重建並重凍結基準; 且 `dirty` → **保留草稿與基準**, 顯示橫幅「資料已被他人更新」+「重新載入」鈕(放棄草稿、取最新列、重凍結); `remote==='deleted'` → **不論 dirty 皆停留**, 橫幅「此 API 已被刪除」; 若列**重新出現**(同步空窗後回來)且摘要等於基準 → 自動撤橫幅 |
| 存檔/刪除 | `$fapi.saveApi(row, { baseline })`、`$fapi.deleteApi(id, { baseline })`; 被拒(`saveStale` 等)→ 保留草稿、`showCheckYes`(`type` 非 success)提示重新載入, 不清空 `form`; 新增模式不帶基準 |
| 原列被刪不換筆 | `LayoutContent.genTree` 找不到 `prevId` 時: 編輯模式(`mode==='edit'` 或 `newMode`)→ **保留原 `apiSelect`**(不取 `apis[0]`), 並令 `latestRow=null`; 文件/測試模式維持現行(取第一筆). 選取判定與搜尋過濾**脫鉤**: 以未過濾之 `vo.apis` 找 `prevId`, 過濾只影響樹(修 P4) |
| `genTree` 副作用 | 把「重建 `apiSelect` 物件」限縮: 內容摘要未變時沿用原物件參考(避免無關推播觸發子元件 watch); 或編輯模式下完全不重設 `apiSelect`, 只更新樹與 `latestRow` |
| 規範 | 依全域技能 role-coder-for-ui §5(草稿保護)與 role-coder-for-vue-ui(非同步提交、雙擊防護); 橫幅只在需要時 `v-if`, 避免動到既有 baseline 標準圖 |

### 7.4 `userIdUpdate` 補欄與既有資料

- `apis.mjs` 新增欄位後, w-serv-orm 於 save/insert 自動寫操作者(`getMapOrm.mjs:737-759`), **含同步 insert**(操作者 = app 權杖之使用者 id). 無需改 `saveApi`/同步程式.
- 既有資料: 參考部署 lmdb 為無綱要 JSON, **免遷移**(舊列讀出缺鍵 = `undefined`, 摘要不含此欄); 舊列於下次被存檔或同步時補上. 若他處以 SQL 後端(`w-orm-postgresql`/`w-orm-mdb`/`w-orm-reladb`)部署, 須自行加欄(此為升級須知, 入 README); 本倉僅有 lmdb 之參考部署與測試.
- 不補 `userId`(創建者): 規格 §11 只要求最後修改者; `creator` 為外部資料欄位, 語意不同.
- 客戶端送來之 `userIdUpdate` 一律被 ORM 覆寫(探測 p6 INFO: 目前因 schema 無此欄而被 `dtmapping` 濾除).

### 7.5 V1~V14 逐條測試計畫(`apis`)

| # | 適用 | 測試(層級 / 檔) | 要點 |
|---|---|---|---|
| V1 | 是 | api: 新 `api-concurrency`(經 `/api/main` `callFun`); e2e: 新案(兩個 browser context) | A、B 載入同列; A 存; B 帶舊基準存 → 整次拒收、DB 零寫入(select 比對)、B 畫面草稿保留且出現提示 |
| V2 | 是 | api: 走實際入口 `POST /syncAndReplaceTabs`(`api-http` 增案或新檔) | 未帶 id、含 `base64:` 欄、缺欄補 `''`、轉型; 重送後 id 全同; 以同步前之基準存檔成功; 另測識別鍵模糊(重複)→ 退回新 id + log; 帶 id 者不受影響 |
| V3 | 是 | api | 同步改變某列內容 → 以舊基準存檔被拒 |
| V4 | **不適用** | — | 無雙方欄位(§1): 本表無「系統直寫之客戶端可見欄位」 |
| V5 | 是(轉義為專有欄) | api(測試端經第二 ORM 實例直改 `timeUpdate`/`userIdUpdate`) | 專有欄變動後以舊基準存檔可成功, 且偽造之 `timeCreate/isActive/userIdUpdate` 不被採用(修 A7) |
| V6 | 是 | api + unit | 刪除後以舊基準/無基準修改 → `rowNotFound`, `getApisList` 無該列(修 E5/E5b) |
| V7 | 是 | api + unit | `deleteApi` 不存在之 id(帶/不帶基準)→ `rowNotFound`; 先刪先贏後刪者拒(修 E6) |
| V8 | **不適用(整表存檔)** | — | 本套件無整表存檔(逐列 API); 對應風險為「同步 `delAll` 之範圍」, 改以 api 測: 同步 group A 不影響 group B 之列(已有 `api-http` 同類案, 保留) |
| V9 | **不適用(名次)** | — | 不設 `orderKey`; 改以一般欄位測: 他人改 `order` → 舊基準被拒 |
| V10 | 是(對 lmdb) | api + e2e | e2e 以 `page.on('request')` 擷取實際 `/api/main` 本體, Node 端 `u8arr2obj` 解出 `baseline`, 與 Node 端以 `select({id})` 結果經同一純函數算出之摘要比對相等(經實際傳輸路徑與瀏覽器 bundle); 其他後端之型別差異本套件不測, 帳本註明 |
| V11 | 是 | e2e(兩 context) | 有草稿時 B 收到 A 對**無關列/同列/刪該列**之推播: 草稿與基準不變、出現橫幅; 搜尋框輸入不換筆(對應 §3 P1~P4, 即本輪 `p3` 轉綠) |
| V12 | **不適用** | — | 本套件無清單頁多列提交 |
| V13 | 是 | api + unit | 基準為非陣列、`h9:` 前綴、列形狀錯、id 與 `row.id` 不符 → `baselineFormat`, **不得當未帶基準而放行** |
| V14 | 是 | api(`SlowOrm` 式注入延遲, 已於本輪探測驗證可行) | 比對與寫入間人為延遲, 同時送 `syncAndReplaceTabs`/`deleteApi`/他人 `saveApi`: ORM 操作窗(起訖)不得重疊; 同步空窗內 `saveApi` 須等待(`p2` C1/C2 轉綠) |
| 另加 | 是 | unit | 契約完整性(欄位全集 = `fields ∪ serverOnly ∪ {pk}`); `syncIdentity` 純函數(模糊、`clearXSS` 正規化、跨群組不比對); `procApis` 注入 `withTabLocks`/`guardWrite` 之呼叫形狀 |

### 7.6 預估影響之既有測試

- `test/unit-procApis.test.mjs`(15 案): 全檔 `deps` 形狀變(需注入鎖/契約); 斷言變動者約 7 案: `:66-81`(procOrm 呼叫形狀多一參/多一次 select)、`:83-89`、`:111-118`(del 呼叫形狀 `['u1','apis','del',{id}]`)、`:123-153`(「不同 key 不互相阻塞」→ 改為全表序列化; `kmx` 同名序列化 → 表鎖)、`:202-241`(不同使用者並行 deleteApi 同列 → 第二者將得 `rowNotFound`, 不再「皆成功」)、`:243-264`、`:281-`(fail-closed 依賴增加).
- `test/api-doubleclick.test.mjs`(DC-01~05): 行為預期不變(同人占位仍在), 須重跑; DC-03 後刪者語意受 E6 修正影響需複核.
- `test/api-http.test.mjs` 同步段(約 12 案): `rows 全部合法…` 等不斷言 id 變動, 預期綠; 須新增 V2/V3 與識別鍵案.
- `test/unit-syncRows.test.mjs`(純函數 `checkRowIds`): 預期不變.
- `test/e2e-edit.test.mjs`(5 案 × 2 語系 = 10)、`test/e2e-display.test.mjs`(17)、`test/e2e-apitest.test.mjs`(28): 走存檔/刪除/選取/搜尋; `genTree` 與編輯元件改動可能影響選取與標準圖(橫幅平時不顯示, 應無像素差異); 須實跑. 新增 e2e 案(V1/V11/V10)需新標準圖與 `spec/流程_編輯API.md` 之 `E2E-NNN`(新圖須授權產製).
- `test/api-lifecycle`、`unit-wwebapi-*`、`unit-dataChannel`、`api-dataChannel`: `WWebApi` 建構取用 `wp.withTabLocks/guardWrite`, 預期不變但須跑(建構/生命週期).

### 7.7 改動範圍 → 測試檔對照(本批用; 補 rulebook_test 所缺)

| 改動範圍 | 須跑(非瀏覽器全跑; 瀏覽器只跑相關) |
|---|---|
| `server/procApis.mjs`、`syncIdentity.mjs`、契約、`lockSave` | unit-procApis、unit-lockSave、unit-syncRows、新 unit-syncIdentity/unit-contract、api-http、api-doubleclick、api-syncIter、api-dataChannel、api-lifecycle、新 api-concurrency |
| `server/WWebApi.mjs`(含 kpFunExt/同步/建構) | 上列 + api-tokenLeak、unit-wwebapi-lifecycle、unit-wwebapi-opt、unit-dataChannel |
| `server/WWebApi.mjs` 之資料通道連線閘(`verifyConn`／`p.checkToken`, R-CONNGATE-01, api-run01) | 全部 api(含 `api-connGate`)＋全部 unit; 連線閘為瀏覽器全部流量之共同入口(參考部署下 `sys` 使用者照常通過, 預期零差異), e2e 擴大為全部 7 檔(display、edit、apitest、stainfor、init、concurrent、external)以涵蓋每個 kpFunExt／同步／輪詢經閘之路徑 |
| `server/WWebApi.mjs` 之執行身分(`getUserIdByToken`／`authToken`)、`Authorization` 方案(`reBearerAuth`)、`server/procProxy.mjs`／`server/proxyTargetPolicy.mjs`(代發請求之內建目標位址政策, R-EXECID-01／R-AUTHSCHEME-01／R-PROXYTARGET-01, api-run02) | 全部 api(含 `api-connGate`、`api-execIdentity`、`api-proxyTarget`、`api-doubleclick`)＋全部 unit(含 `unit-proxyTargetPolicy`、`unit-procProxyTarget`、`unit-procProxy`、`unit-wwebapi-opt`); 執行身分與方案為瀏覽器全部流量之共同入口、代發為 e2e-apitest 之傳輸 → e2e 擴大為全部 7 檔(同連線閘列) |
| `src/schema/tables/apis.mjs` | 上列 api/unit + e2e-edit(存檔欄位) |
| `LayoutContent.vue`(genTree/選取/搜尋) | e2e-display、e2e-edit、e2e-apitest(選取) + 新 e2e 併發案 |
| `LayoutContentEdit.vue`(基準/草稿/橫幅) | e2e-edit + 新 e2e 併發案 |
| `src/store/applyRows.mjs`、`mutations.mjs`、`types.mjs`(存檔／刪除成功後立即更新 store; api-run03) | unit-applyRows + e2e-edit、e2e-concurrent、e2e-external(編輯路徑) + `LayoutContent.vue` 列之 e2e-display、e2e-apitest |
| `procApis.mjs` 之 `attachRow`(存檔回傳 row; api-run03) | 上列 `procApis.mjs` 列 + api-concurrency「N1」 |
| 共用基礎(`test/tools`、樣式、procLang 版面) | 擴大為全部 e2e |
| 全套 | 僅最末輪由主控於凍結碼跑一次 |

### 7.8 相依與風險

- **相依**: w-serv-orm(第 110 項)之 `digestRow/buildBaseline/compareBaseline`、`withTabLocks`、`guardWrite`、procOrm「只改不增」與「刪除未命中」; 發布後須核實 API 形狀(特別: `guardWrite` 是否容許無基準、`autoInsert:false` 之傳遞方式、單列基準之 `rowNotFound` 語意).
- **風險**: ①同步持鎖期間存檔排隊(§7.2); ②`genTree` 重構會動到選取行為, 須以 e2e-display/apitest 守住; ③`deleteApi` 回傳形狀變更對外可見; ④修改不存在列改拒收, 外部直呼 `saveApi` 帶自選新 id 者受影響(UI 不受); ⑤已開啟之舊版頁面仍會丟草稿(升級前限制, 入發布說明); ⑥SQL 後端須自行加欄.

## 8. 決定與待裁示

**依原則自行決定**(已記入 `decisions.tsv`, phase `api-inv01`): D1 `order` 為一般欄位入 fields、不設 `orderKey`; D2 `isActive` 列伺服器專有; D3 `timeCreate` 列伺服器專有且存檔改取庫內值; D4 `creator/dataSource` 列客戶端欄位入基準; D5 本表無雙方欄位(V4 不適用); D6 只補 `userIdUpdate`、既有資料免遷移; D7 同步識別鍵採方案 A(含 `clearXSS` 正規化, 模糊退回現行並 warn); D8 契約檔放 `src/schema/contracts/apis.mjs` 並加完整性測試; D9 本 major 基準可選(未帶 = 後者蓋前者), 已帶但格式不識 → `baselineFormat`; D10 一表一鍵、移除局部 `kmx`、`lockSave` 留外層; D11 草稿保護只涵蓋推播與本機重建路徑, 使用者主動離開路徑(P6~P8)不在本批; D12 同步維持 `delAll + insert` 整段並包入表鎖(ADR-016 非原子之取捨不變; ADR-031「同步清空 UI 本地欄」不變); D13 探測以 `SlowOrm` 注入接縫在隔離環境進行.

**待裁示**:
- **T1(同步識別鍵之業務確認)**: 方案 A 以 `[levels, method, url, version]` 為「同一支 API」之識別. 種子資料顯示僅 `method+url` 不足(3 組重複). 請業主確認此識別是否符合實際外部來源之語意(例: 外部是否可能「同端點同版本同層級」並存兩筆; 或 `version` 變動是否應視為同一筆). 未確認前第二波依方案 A 實作, 模糊者退回現行隨機 id(不會比現況更差).
  - **(2026-10-22 主控已取代)**: T1 隨使用者裁示原則 11 作廢——識別由外部自訂 `srcKey`, 本套件不推斷.

## 9. 實作結果與規則(2026-10-23, api-run01, 排程第 112 項, ADR-043)

> 本節為第二波實作之現況與規則, 取代 §4 契約草案(已入 `src/schema/contracts/apis.mjs`)、§5(已由 R-IMPORT-01 取代)、§7(改動站點已完成, 以下為實際落點). 外部匯入規則見 `rulebook_backend.md` R-IMPORT-01.

### 9.1 規則(以規則為單位; 每條附盤點指令與判準)

| 規則 | 站點全集與判準 | 盤點指令(於 repo 根) | 狀態 |
|---|---|---|---|
| **R-CONC-01** 所有寫入 `apis` 之正式入口取同一把 `apis` 表鎖(`WServOrm` 之 `withTabLocks`/`guardWrite`, 同一實例); 鎖內不得再取 `apis` 鎖(不可重入) | 入口 4 個: saveApi 新增(`withTabLocks`)、saveApi 修改(`guardWrite`)、deleteApi(`guardWrite`)、匯入(`withTabLocks`; 其內之 `woItems` 直寫只在補償 `restoreAll`, 在鎖內); 不經鎖者: 離線工具 `g_initialTestData.mjs`(服務須停止)、測試端第二 ORM 實例(`test/tools/e2e-setup.mjs`) | `git grep -nE "withTabLocks\|guardWrite" -- server`(僅 `procApis.mjs`、`syncApis.mjs`、`WWebApi.mjs` 接線); `git grep -nE "woItems(\.[A-Za-z]+\|\[[A-Za-z]+\])\.(insert\|save\|del\|delAll)\(" -- server`(應只在 `syncApis.mjs`, 且該檔所有呼叫皆在 `withTabLocks` 回呼內: `unit-syncApis` U02 守) | 已套 |
| **R-CONC-02** 修改/刪除只改不增: `procOrm save/del` 一律帶伺服端自組之 `{ mustExist: true }`; 客戶端第 3 參數只讀 `baseline` 一鍵, 不轉給 procOrm; 未命中回 `errApiRowNotFound` | `procApis.mjs` saveApi 修改、deleteApi、`syncApis.mjs` 修改/刪除步驟 | `git grep -n "mustExist" -- server`(應 4 處: procApis 2、syncApis 2); `git grep -nE "procOrm\(.*\.\.\.opt" -- server`(應空) | 已套(守 api-concurrency E5/E5b/E6、M01/M02/M10 變異) |
| **R-CONC-03** 存檔寫入列只含契約白名單(pk 與 fields); 伺服器專有欄位取庫內值; 新增列亦濾除客戶端之 srcKey/timeCreate/isActive/userIdUpdate | `procApis.mjs` 兩處 `pickWriteRow` | `git grep -n "pickWriteRow" -- server` | 已套(守 A7、V5、M07/M21 變異) |
| **R-CONC-04** 契約完整性: schema 全欄位(去 pk) = fields ∪ serverOnly 且不重疊; 外部擁有 ∪ 本系統擁有 = fields; 推送端白名單不含本系統擁有欄位 | `src/schema/contracts/apis.mjs`、`server/provideTabs.mjs` | `node node_modules/mocha/bin/mocha.js test/unit-contract.test.mjs` | 已套 |
| **R-CONC-05** 拒收鍵轉語系鍵一律經 `getRejectKey`: baselineMismatch→saveStale、rowNotFound→errApiRowNotFound、baselineFormat→errBaselineFormat; rowsInvalid→getDataError+srLog; 鎖內讀取階段失敗(`readRow` 帶 `readKey`)→getDataError(非 saveWriteFail); 基準格式不識(含非純物件之 opt)不降級為不帶基準 | `procApis.mjs` `rejectWrite`/`pickBaseline`; 語系鍵 `procLang.mjs` | `git grep -n "getRejectKey" -- server`; `git grep -nE "saveStale\|errApiRowNotFound\|errBaselineFormat" -- server src` | 已套(守 V13、M11/M19/M25 變異) |
| **R-CONC-06** 前端: 基準取自 store 列(非表單)並凍結; 推播同 id 列比對摘要(相同不動/不同且無未存修改重建/不同且有則保留並提示); 原列被刪停留並提示; 存檔被拒保留草稿; 曾被回「已不存在」之列重新出現時解除該拒收狀態; 既有列無法自算基準(`baselineBroken`)時禁止存檔/刪除、不降級為不帶基準; 搜尋與選取脫鉤僅編輯既有列; 存檔成功後新基準取自伺服端(不以送出值承接) | `LayoutContentEdit.vue`(initFromItem/onItemChange/markRejected)、`LayoutContent.vue`(genTree、selectGone) | `git grep -n "buildBaseline\|digestRow" -- src`(僅 LayoutContentEdit.vue); `git grep -n "editingExisting\|selectGone" -- src` | 已套(守 e2e-concurrent; 前端變異見 9.3) |
| **R-CONC-07**(api-run03, ADR-045, 規格 §8「存檔成功後之新基準取自伺服端，且須立即取得」) 後端 `saveApi` 成功時，於**寫入所在之同一把表鎖內**以 `woItems.apis.select({id:{$in:[id]}})` 讀回該列，附於 procOrm save 逐筆結果陣列第 0 筆之 `row` 鍵（`id`、`ok` 等原鍵不變；新增含新 id；讀回拒絕／未命中／結果非物件陣列 → 原樣回傳、不使存檔失敗、讀回失敗入 srLog `…-readBack-orm`）；被拒（saveStale 等）不讀回。前端存檔／刪除成功後**立即**以回傳列更新 store（`applySavedRow`／`applyDeletedRow`），不等推播或輪詢；**新基準只取自回傳列，不取自送出之 form**（clearXSS 改寫）；保護: 修改既有列只在 store 列仍等於開啟編輯時之基準摘要才取代，store 列已等於回傳列不動、已是別的內容（他人其後之更新，推播先到）不回退、列已不在不復活；新增列 store 無才加入；刪除只在 store 列仍等於基準才移除 | 後端 1 處定義＋2 處呼叫（`procApis.mjs` `attachRow`：修改路徑 `guardWrite` 之 `write` 內、新增路徑 `withTabLocks` 內）；前端: `LayoutContentEdit.vue`（`submitSave` 取 `res[0].row`、`$emit('saved'|'deleted', payload)`）、`LayoutContent.vue`（`onEditSaved`／`onEditDeleted` commit）、`store/mutations.mjs`（`ApplySavedRow`／`ApplyDeletedRow`）、`store/applyRows.mjs`（純函數）。`deleteApi` 回傳形狀不變 | `git grep -n "attachRow" -- server`（應 3 處: 定義＋2 呼叫）; `git grep -nE "ApplySavedRow\|ApplyDeletedRow" -- src`（types 2、mutations 2、LayoutContent 2）; `git grep -n "applySavedRow\|applyDeletedRow" -- src`（僅 `store/`） | 已套（守 `unit-applyRows`、`unit-procApis` 後 5 案、`api-concurrency`「N1」等 5 案、`e2e-concurrent` E2E-019～022; 變異見 9.3） |

### 9.2 規格驗收 → 測試(V1~V14 多人同時編輯; I1~I15 見 R-IMPORT-01)

| # | 適用 | 測試 |
|---|---|---|
| V1 | 是 | `api-concurrency`「V1」「V1 後半」; e2e E2E-007(含被拒存檔實際送出之基準＝載入快照、重新載入後重凍結) |
| V2 | 是 | `api-import`「I1／V2／E8」(匯入前基準仍可存) |
| V3 | 是 | `api-concurrency`「V3／A3」; `api-import` I4/I5/I11 |
| V4 | **不適用**: 本表無雙方欄位(後台不可改且系統會寫之欄位), §1 | — |
| V5 | 是 | `api-concurrency`「A7／V5」「V5: 系統只改伺服器專有欄位…」(2026-10-23 run04: 其中「外部匯入補 srcKey」改以 `srcKey` 等於該列既有 `id` 重送同內容〔一次性遷移, I15〕造成，不再以 `id` 代替來源鍵) |
| V6 | 是 | `api-concurrency` E5/E5b、`unit-procApis` |
| V7 | 是 | `api-concurrency` E6、`unit-procApis` |
| V8 | **不適用**: 本套件無整表存檔(逐列 API); 對應風險「匯入不得動範圍外之列」見 `api-import` I9/I10 | — |
| V9 | 改測: 不設 `orderKey`, 以一般欄位 `order` 測「他人改 order → 舊基準被拒」 | `api-concurrency`「V9」 |
| V10 | 是 | `api-concurrency`「V10」(經 /api/main 傳輸後之列, 含 clearXSS 改寫); e2e E2E-010(瀏覽器 bundle 經實際傳輸路徑送出之基準 = 伺服端所算) |
| V11 | 是 | e2e E2E-006(無關列)、E2E-007(同一列)、E2E-008(列被刪, 含列重新出現)、E2E-009(搜尋)、E2E-011(他人改回載入時內容 → 提示撤除)、E2E-012(舊資料無法建立基準 → 禁止存檔) |
| V12 | **不適用**: 本套件無清單頁多列提交 | — |
| V13 | 是 | `api-concurrency`「V13」、`unit-procApis` |
| N1（api-verify01 實測 8 次中 7 次；規格 §8 後補） | 是 | 存檔成功回傳 `row`＋前端立即更新 store: `unit-applyRows`、`unit-procApis`（回傳 row、鎖內讀回、讀回失敗不使存檔失敗）、`api-concurrency`「N1」（回傳 row ＝庫內列、以之算基準可立即再存、先動先贏不被削弱、鎖內新鮮讀取、新增含新 id）；e2e E2E-019（存檔→推播未到→立即再編輯再存; 其後同內容推播不誤報）、E2E-020（他人在我存檔之後改同一列 → 我再存仍被拒）、E2E-021（刪除後立即自左樹移除）、E2E-022（新增後立即出現並可立即編輯再存） |
| V14 | 是 | `api-concurrency`「V14／A2」(三請求操作窗不交錯)、「A2」、「A1／I11」(匯入進行中 saveApi 與 deleteApi 皆不得落入匯入操作窗)、「V14: 同一基準並行存同一列 → 恰一成功一 saveStale」(SlowOrm 人為延遲); `api-import` I11 |

### 9.3 修前紅、變異與外審(結案數字見 `agent-out/api-run01-實作報告.md`)

- **修前紅**: 將本輪新增之 5 個測試檔(`unit-procApis`、`unit-syncApis`、`unit-contract`、`api-concurrency`、`api-import`)複製至 `tmp/api-run01/orig/test/` 對 HEAD 之 `server/`、`src/schema/tables/` 跑(契約檔 `src/schema/contracts/apis.mjs` 為新檔, 自工作樹補入); 結果見報告第六節. e2e 修前紅(E7)沿用 inv01 `p3` 真瀏覽器探測(`agent-out/api-inv01-probes/p3-e7-browser.mjs`)之 P1~P4 紅, 修後 `e2e-concurrent` E2E-006~012 為綠.
- **變異**(複本施加, 不動真檔): 伺服端腳本 `mutate.mjs`(M01~M46, 涵蓋拿掉表鎖〔修改/刪除/匯入/新增/deleteApi 單獨〕、拿掉 mustExist、匯入回到全刪全插語意、本系統擁有欄位被匯入覆寫、拿掉 pickWriteRow、客戶端 opt 轉傳、基準降級、補償拿掉/不分階段/不驗證, 及外審後補強各規則之拿掉)結果 **45 被抓、1 存活**(M46「無來源鍵列視為同鍵配對」為等價變異: 無鍵列 `v.key` 恆為 `''`, 庫內無有效來源鍵為 `''` 之列); 前端腳本 `mutate-fe.mjs`(FM1~FM12: 草稿保護拿掉、基準取自表單、搜尋不脫鉤、不帶基準、重新載入不重凍結、dirty 恆否、被刪不提示、被拒不提示、無法建基準仍降級、列重現不解除拒收、有草稿時重凍結基準、改回不撤提示)結果 **11 被抓、1 存活**(FM8「存檔被拒不標 rejected」: 該路徑為漏收推播時之保底, 後端推播必達之 e2e 環境無法造出, 屬已知未覆蓋). 腳本與結果歸檔於 `C:\opensrcOper\dnow\20261022221854\agent-out\api-run01-probes\`.
- **api-run03(N1, R-CONC-07)修前紅／變異／外審**: ①修前紅＝前端不 commit（等同修前行為，`LayoutContent.onEditSaved` 去掉 `ApplySavedRow`）時 E2E-019／020／022／023 共 8 案全紅（失敗點皆在「推播被攔下，左樹應已顯示存檔後名稱」）; 新 unit／api 測試對「不回傳 row」之變異（B1）皆紅. ②變異（複本施加於 `tmp/`，不動真檔）: 後端／純函數 16 個（B1 不附 row、B2 讀回移到表鎖外、B3 以送出值當回傳列、B4 丟掉 id／ok 原鍵、B5 讀回失敗使存檔失敗、B6 新增用錯 id、B7 結果形狀只驗第 0 筆、B8 未命中不記 log、F1 拿掉 store==基準判斷、F2 新增不加入、F3 列不在即復活、F5 刪除不移除、F6 刪除不比基準、F7 拿掉 timeUpdate 較新判斷、F8 拿掉晚到舊快照保護、F9 刪除不帶基準仍移除）**16/16 被抓**，對照組（未變異複本）全綠; 前端接線 6 個（暫時施加於真檔並以 `cmp` 驗證還原與備份逐位元相同）: W1 `onEditSaved` 不 commit（8/8 案紅）、W2 以送出之 form 當回傳列（E2E-019 紅：左樹顯示 `a<b` 而非 `a&lt;b`）、W3 `onEditDeleted` 不 commit（E2E-021 紅）、W4 不傳基準（E2E-019／020 紅）、W5 `UpdateTableData` 不經 guard（E2E-023 紅）、W6 不記住我寫入之列（E2E-023 紅）**6/6 被抓**. 過程中 W6 首次只抓到 1／2 語系（放行舊快照後真實推播陸續抵達而把 store 蓋回，事後才讀會假通過）→ `installPushHold.release` 改回傳放行當下 store 之原子快照，斷言改用之，重跑 2／2 紅. ③外審（sol 1，read-only）8 條：#1 晚到之較舊快照退回（高）、#3 摘要同但較新、#4 刪除缺基準仍移除、#5 結果形狀只驗第 0 筆、#6 未命中不記 srLog、#7 測試只放行最新快照 → 皆屬實已修（`createRecentRows`、`timeUpdate` 比較、刪除須基準、`rs.every`、`-readBack-miss`、E2E-023）; #2 新增列被他人刪除之幽靈列 → 屬實，列設計事實（ADR-045 決定 5③）; #8 讀回移出鎖未必被等長延遲測試抓到（待證）→ 補操作窗斷言，B2 變異 unit＋api 皆抓. 評分表見 `agent-out/api-run03-修正報告.md`.
- **已知限制/不做**: 後台對外部列(srcKey 非空)之鎖定(規格外部匯入 §7)未做(待裁示); 已開啟之舊版頁面不受草稿保護(升級前限制); 匯入持鎖期間存檔排隊; 離線工具須在服務停止時執行(不經表鎖).
