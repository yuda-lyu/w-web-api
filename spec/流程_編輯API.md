# API 編輯流程

## 觸發

進站預設頁為統計資訊頁，使用者點左側主選單「API」切至 API 工作區後，於右側內容區點「編輯」分頁（既有 API）或左樹上方「新增API」按鈕，`LayoutContent.vue` 切到 `LayoutContentEdit.vue` 表單；填寫後點「儲存」呼叫 `$fapi.saveApi`，或於既有 API 點「刪除」經確認對話框呼叫 `$fapi.deleteApi`。成功後左樹與 docs 由後端 syncData 推送即時反映，並彈出成功 modal。

## 重要流程

- **E2E-001**
  - title: 編輯既有 API 改名後儲存
  - description: 使用者選取既有 API（取得API清單）→ 切「編輯」分頁 → 改 Name 欄 → 儲存。預期左樹與右側文件即時顯示新名稱、DB 該筆 name 原地更新（舊名不再存在，確為 update 非 insert），並彈出「已儲存」成功 modal。儲存成功的終態與 E2E-002 共用同款 showCheckYes 成功 modal。
  - flow:
    - 測試資料：base seed 既有 API「取得API清單」；改名為「取得API清單-改-<lang>」。
    - 操作：點「編輯／編輯」分頁 → 於「Name／名稱」欄輸入新名稱 → 點「儲存／儲存」按鈕 → 成功 modal 點「OK／確認」。
    - 驗證（等待畫面出現新名稱後）：
      1. 語意：畫面（左樹＋文件）含新名稱；DB 有改名後的筆、舊名「取得API清單」不存在。
      2. 視覺（3 步驟、每步整頁紅框，呈現「編輯哪裡→從什麼變成什麼→結果」）：①Name 欄原值「取得API清單」`test/pics/edit/edit-{eng,cht}-E2E-001-1-name-old.png`；②Name 欄改為新名稱（存檔前）`...-E2E-001-2-name-new.png`；③改名後 docs 標頭（標題、網址晶片、說明之聯集）`...-E2E-001-3-renamed.png`，皆以 pixelmatch 容差比對、非 byte-exact。
         - 修改留痕（2026-09-28）：③原框標頭三元素之整欄寬（右側約 640px 空白一併框入）→ 改框三者之內容聯集（技能 §7.3-2）。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed（移除本 case 改動），確保 hermetic。

- **E2E-002**
  - title: 新增 API 填表後儲存
  - description: 使用者點「新增API」開空白表單 → 填名稱/網址/階層 → 儲存。預期左樹出現新節點與其階層、DB 新增該筆且 url 正確、method 為預設 get，並彈出「已儲存」成功 modal。新筆無 id 故後端走 insert（funNew 產生新 id），與 E2E-001（帶 id 走 update）以「id 是否存在」分流。
  - flow:
    - 測試資料：新增 name「E2E新增API-<lang>」、url「http://localhost:11005/e2eAdd」、所屬階層「E2E分類」。
    - 操作：點「新增API／新增API」按鈕 → 於「Name／名稱」「API url／API網址」「Levels／所屬階層」欄依序輸入 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證（等待左樹出現新節點後）：
      1. 語意：左樹出現新節點名稱與新階層「E2E分類」；DB 新增該筆，url 正確、method 為預設 'get'。
      2. 視覺（3 步驟、每步整頁紅框）：①空白新增表單之 Name/url/Levels 三欄 `test/pics/edit/edit-{eng,cht}-E2E-002-1-form-empty.png`；②三欄填入內容（存檔前）`...-E2E-002-2-filled.png`；③儲存成功 modal `...-E2E-002-3-saved.png`（新節點在樹 fold 以下，另由語意斷言守），皆以 pixelmatch 容差比對、非 byte-exact。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。

- **E2E-003**
  - title: 刪除既有 API 含確認對話框
  - description: 使用者選既有 API（取得API清單）→ 切「編輯」分頁 → 點「刪除」彈出確認對話框 → 點「是」確認。預期左樹移除該節點（其他 API 仍在）、DB 移除該筆且總數減一。本 case 先截確認對話框 baseline、再確認刪除；對話框為 WConfirm 模態，與成功 modal 同款。
  - flow:
    - 測試資料：base seed 既有 API「取得API清單」（待刪）；「取得寵物清單」（驗證其他筆仍在）。
    - 操作：點「編輯／編輯」分頁 → 點「刪除／刪除」按鈕 →（截對話框）→ 確認對話框點「Yes／確定」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 視覺（3 步驟、每步整頁紅框）：①「刪除」鈕 `test/pics/edit/edit-{eng,cht}-E2E-003-1-delete-btn.png`；②確認對話框面板 `...-E2E-003-2-confirm.png`；③成功 modal 關閉後之左樹面板（該節點已消失）`...-E2E-003-3-deleted.png`，皆以 pixelmatch 容差比對、非 byte-exact。
         - 已知落差（已修復，2026-09-28）：舊③於「已刪除」成功 modal 開啟中截圖（左樹在遮罩下），且紅框落在最左側功能選單鈕列而非左樹（選擇器第一個命中者為功能鈕列；缺陷，測試端）→ 改為先按 OK 關閉 modal（與 E2E-001 ③一致）再框左樹面板，重產。
      2. 點確認後（等該節點從樹消失）——語意：左樹不再有「取得API清單」、仍有「取得寵物清單」；DB 不再有該筆且總數減一。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed；全部跑完後再次還原。

- **E2E-004**
  - title: 名稱留空儲存顯示必填錯誤、不送出
  - description: 使用者點「新增API」開空白表單，名稱欄留空即點「儲存」。預期同步檢測攔截於開 loading 之前：名稱欄下方出現 inline 必填紅字，不呼叫後端、不出現成功 modal、DB 不新增任何筆。對應「錯誤處理分層」之同步檢測層——可預期錯誤走 inline 紅字（非 $alert）。
  - flow:
    - 測試資料：base seed（不新增任何特化資料）。
    - 操作：點「新增API／新增API」按鈕 → 名稱欄保持空白 → 點「儲存／儲存」按鈕。
    - 驗證：
      1. 語意：名稱欄下方 inline 紅字顯示必填訊息（eng「This field is required」／ cht「此欄位必填」）；畫面不出現「已儲存」成功 modal；DB apis 筆數與 base seed 相同（未新增）。
      2. 視覺（2 階段、每階整頁紅框標名稱欄）：①名稱欄空白（按儲存前、尚無紅字）`test/pics/edit/edit-{eng,cht}-E2E-004-1-name-empty.png`；②按儲存後出現 inline 必填紅字 `...-E2E-004-2-name-required.png`，皆視覺一致（pixelmatch 容差）。
    - 雙語：eng / cht 各一輪。
    - 清理：純檢測未寫入；起跑前還原 base seed。

- **E2E-005**
  - title: 刪除確認點取消，靜默不刪
  - description: 使用者選既有 API（取得API清單）→ 切「編輯」分頁 → 點「刪除」彈出確認對話框 → 點「取消」。預期對話框關閉、不刪除該筆（DB 不變、左樹仍在）、不顯示任何錯誤或成功訊息。對應「刪除取消（reject 'close'）靜默忽略」分支。確認對話框與 E2E-003 為同一個 WConfirm，本案例共用 E2E-003 之對話框 baseline，不另存對話框圖。
  - flow:
    - 測試資料：base seed 既有 API「取得API清單」（最終不被刪）。
    - 操作：點「編輯／編輯」分頁 → 點「刪除／刪除」按鈕 →（出現確認對話框）→ 點「No／取消」按鈕。
    - 驗證：
      1. 語意：對話框關閉後左樹仍含「取得API清單」；DB apis 筆數與 base seed 相同（未刪除）；畫面不出現成功 modal 與錯誤訊息。
      2. 視覺：確認對話框與 E2E-003 共用 `test/pics/edit/edit-{eng,cht}-E2E-003-2-confirm.png`（同一 WConfirm 面板），本案例不另存圖；點取消後回編輯態無獨特視覺終態，故視覺以共用對話框圖 + 上述語意守。
    - 雙語：eng / cht 各一輪。
    - 清理：純取消未變更；起跑前還原 base seed。

## 執行流程

### 改名（E2E-001）

```
001  點「編輯」分頁 onChangeMode({id:'edit'}) → mode='edit'  [src/components/LayoutContent.vue:149,575-582]
002  渲染編輯表單，editItem 取既有 apiSelect；watch.item 深拷貝進 form（各欄位 v-model）  [src/components/LayoutContent.vue:205-213,378-381][src/components/LayoutContentEdit.vue:297-306]
003  改「名稱」欄後點「儲存」onClickSave → submitSave()  [src/components/LayoutContentEdit.vue:onClickSave]
003a     $ui.runSubmit('saveApi', …) 包覆整段（submitSave + .catch + .finally）：同 key 進行中（自觸發至結果訊息框關閉）再觸發即略過——滑鼠與焦點在儲存鈕時之鍵盤 Enter／空白鍵同一狀態（ADR-034）  [src/components/LayoutContentEdit.vue:onClickSave][src/plugins/mUI.mjs:runSubmit]
004      執行非同步流程 core()  [src/components/LayoutContentEdit.vue:submitSave]
005          清空 inline 錯誤 errName/errUrl/errJson/errSave  [src/components/LayoutContentEdit.vue:353-357]
006          同步檢測：名稱/網址必填、JSON 欄位格式  [src/components/LayoutContentEdit.vue:360-381]
                 不合: 設對應 inline 紅字並 return（短路，未開 loading）  [src/components/LayoutContentEdit.vue:360-380]
007          開 loading  [src/components/LayoutContentEdit.vue:384]
008          呼叫後端 saveApi(form)，reject 時落下方 .catch  [src/components/LayoutContentEdit.vue:submitSave]
                 lockSave('saveApi', userId)：同一使用者之儲存處理中再送出即 reject('saveInProgress')、不寫入（不排隊）；其內 kmx 序列化同 key（不同使用者對同一列）  [server/procApis.mjs:saveApi][server/lockSave.mjs:createLockSave]
                 funNew 過濾欄位、補時間戳；row 帶 id 則保留原 id（改名走 update）  [server/procApis.mjs:saveApi][src/schema/tables/apis.mjs:132-139]
                 寫入 LMDB（save upsert）  [server/procApis.mjs:saveApi]
009          .then: 設成功旗標 okSave  [src/components/LayoutContentEdit.vue:389]
010          .catch: 設 errSave inline 紅字  [src/components/LayoutContentEdit.vue:390]
011          okSave 為否則 return（短路）  [src/components/LayoutContentEdit.vue:391]
012          $emit('saved') → onEditSaved 回 docs、後端 syncData 推送、genTree 重建並保留原選取  [src/components/LayoutContentEdit.vue:394][src/components/LayoutContent.vue:609-613]
013          先 updateLoading(false) 再顯示成功 modal showCheckYes('已儲存') 並 await 至其關閉（流程涵蓋訊息框期間，ADR-034）  [src/components/LayoutContentEdit.vue:submitSave]
014      .catch: 非預期例外 → updateLoading(false) 後 showCheckYes(anUnexpectedErrorOccurred, {type:'error'}) 並回傳其 Promise（兜底 modal，ADR-031／ADR-034；不用自動消失之 $alert）  [src/components/LayoutContentEdit.vue:onClickSave]
015      .finally: 關 loading（統一收尾，重複關閉無副作用）；其後 runSubmit 釋放 'saveApi'  [src/components/LayoutContentEdit.vue:onClickSave]
```

### 新增（E2E-002）

```
001  點「新增API」onClickAddApi：設空白表單 blankApi（method 預設 'get'、version 'v1'、state 'ok'、authType 'none'、contentType 'application/json'）  [src/components/LayoutContent.vue:589-604]
002      newMode=true、mode='edit'  [src/components/LayoutContent.vue:605-606]
003  渲染編輯表單（isNew=true → 不顯示刪除鈕），form 為空白  [src/components/LayoutContent.vue:205-213][src/components/LayoutContentEdit.vue:238,297-306]
004  填「名稱／網址／所屬階層」後點「儲存」onClickSave → submitSave()（runSubmit('saveApi') 包覆，同改名 003a）  [src/components/LayoutContentEdit.vue:onClickSave]
005      執行非同步流程 core()  [src/components/LayoutContentEdit.vue:submitSave]
006          同步檢測 + 開 loading（同改名）  [src/components/LayoutContentEdit.vue:submitSave]
007          呼叫後端 saveApi(form)，form 無 id  [src/components/LayoutContentEdit.vue:submitSave]
                 lockSave('saveApi', userId)（同改名 008）：新列每次 funNew 產新 id，同一使用者並行之第 2 次若照常執行會多插入一列，故拒絕而不排隊  [server/procApis.mjs:saveApi]
                 funNew 產生新 id（genIDSeq）、時間戳、isActive='y'；無 id 故走 insert  [server/procApis.mjs:saveApi][src/schema/tables/apis.mjs:132-139]
                 寫入 LMDB（新筆）  [server/procApis.mjs:saveApi]
008          .catch 設 errSave；okSave 為否則 return  [src/components/LayoutContentEdit.vue:submitSave]
009          $emit('saved') → 回 docs（newMode=false）、syncData 重建樹，新節點出現（無舊 id 故預設選第一筆）  [src/components/LayoutContentEdit.vue:submitSave][src/components/LayoutContent.vue:609-613,464-470]
010          先 updateLoading(false) 再成功 modal showCheckYes('已儲存')，await 至其關閉  [src/components/LayoutContentEdit.vue:submitSave]
011      .finally: 關 loading；其後 runSubmit 釋放 'saveApi'  [src/components/LayoutContentEdit.vue:onClickSave]
```

### 刪除（E2E-003）

```
001  既有 API 切「編輯」分頁，點「刪除」onClickDelete  [src/components/LayoutContentEdit.vue:238-240][src/components/LayoutContentEdit.vue:onClickDelete]
001a     $ui.runSubmit('deleteApi', …) 包覆自開確認框起整段（確認框 → doDelete → 結果訊息框）：進行中再觸發即略過——確認框（WDialog）不搶焦點，焦點仍在刪除鈕時之鍵盤 Enter 不會再開一次確認框（ADR-034）  [src/components/LayoutContentEdit.vue:onClickDelete]
002      彈出確認對話框 showCheckYesNo('確定要刪除此API？')  [src/components/LayoutContentEdit.vue:onClickDelete]
003          點「取消／No」: pm.reject('close')，.catch 收到 'close' 靜默 return，流程結束、釋放 'deleteApi'  [src/components/Common/CheckYesNo.vue:clickBtn][src/components/LayoutContentEdit.vue:onClickDelete]
004          點「確定／Yes」: pm.resolve()，.then 執行並回傳 doDelete() 之 Promise  [src/components/Common/CheckYesNo.vue:clickBtn][src/components/LayoutContentEdit.vue:onClickDelete]
005  doDelete() 執行非同步流程 core()  [src/components/LayoutContentEdit.vue:doDelete]
006          清空 errSave、開 loading  [src/components/LayoutContentEdit.vue:doDelete]
007          呼叫後端 deleteApi(form.id)，reject 時落下方 .catch  [src/components/LayoutContentEdit.vue:doDelete]
                 檢查 id 非空，否則 reject('errApiIdInvalid')（err-key，前端依 lang 反查顯示）  [server/procApis.mjs:deleteApi]
                 lockSave('deleteApi', userId, …, { errKey: 'deleteInProgress' })：同一使用者之刪除處理中再送出即 reject('deleteInProgress')（不排隊）；其內 kmx 序列化同一列  [server/procApis.mjs:deleteApi]
                 LMDB 刪除單筆  [server/procApis.mjs:deleteApi]
008          .then 設 okDel；.catch 設 errSave  [src/components/LayoutContentEdit.vue:doDelete]
009          okDel 為否則 return（短路）  [src/components/LayoutContentEdit.vue:doDelete]
010          $emit('deleted') → 清 apiSelect、回 docs、syncData 重建樹（被刪節點消失，改選第一筆）  [src/components/LayoutContentEdit.vue:doDelete][src/components/LayoutContent.vue:615-620,464-470]
011          先 updateLoading(false) 再成功 modal showCheckYes('已刪除')，await 至其關閉  [src/components/LayoutContentEdit.vue:doDelete]
012      .catch: 非預期例外 → updateLoading(false) 後 showCheckYes(anUnexpectedErrorOccurred, {type:'error'}) 並回傳其 Promise（ADR-031／ADR-034）；.finally: 關 loading；其後 runSubmit 釋放 'deleteApi'  [src/components/LayoutContentEdit.vue:doDelete]
```

## i18n 訊息粒度規則

| 觸發情境 | i18n 鍵區位（grep 提示）| 顯示位置 | 粒度規則 |
|---|---|---|---|
| 表單欄位標籤 | `server/procLang.mjs` 找 `name` / `apiUrl` / `levels` | 編輯表單各列 label | 每欄位一鍵 |
| 動作按鈕 | 找 `save` / `delete` / `cancel`、`addApi`、`tabEdit` | 表單底部按鈕、左樹新增鈕、分頁 | 每按鈕一鍵 |
| 確認/成功 modal | 找 `confirmDeleteApi` / `saveSuccess` / `deleteSuccess`、`yes` / `no` / `ok`、`systemMessage` | WConfirm 模態 | 確認問句、成功訊息各一鍵 |
| inline 驗證紅字 | 找 `valRequired` / `valInvalidJson` | 對應欄位下方 .bk-err | 必填、JSON 格式各一鍵 |
| 兜底錯誤 | 找 `anUnexpectedErrorOccurred` | showCheckYes modal（type:'error'，先關 loading） | 非預期例外統一一鍵 |
| 同一使用者之存／刪處理中再送出 | 找 `saveInProgress` / `deleteInProgress` | errSave inline 紅字；UI 不可達——前端 `runSubmit('saveApi' / 'deleteApi')` 先擋，僅 API 直打之並行會收到 | 存、刪各一鍵（ADR-034） |

## 錯誤處理分層

| 層級 | 觸發 | 呈現 |
|---|---|---|
| 同步檢測 | 名稱/網址空、JSON 格式錯 | 對應欄位 inline 紅字，return 不打 API |
| 後端 reject | saveApi/deleteApi 失敗 | errSave inline 紅字，短路不關閉表單 |
| 刪除取消 | 確認對話框點「取消」 | reject('close')，靜默忽略不報錯 |
| 連按／重入 | 存／刪流程進行中（含確認框與結果訊息框開啟期間）再觸發 | 前端 runSubmit 略過（無畫面反應）；API 直打之同一使用者並行由後端回 `saveInProgress` / `deleteInProgress`（ADR-034） |
| 非預期例外 | core() 未捕捉之例外 | showCheckYes modal 兜底（type:'error'，先 updateLoading(false)）+ console.log |

## 參數來源

| 概念 | 來源（優先序）| 流程影響 |
|---|---|---|
| 編輯表單初值 | 選取的 apiSelect → editItem → watch.item 深拷貝進 form | 改名/刪除針對既有筆，帶原 id |
| 新增表單初值 | onClickAddApi 之 blankApi（無 id；method='get' 等預設）| 新筆走 insert，預設值兜底 |
| 後端兜底欄位 | funNew：無 id 產生新 id、時間戳、isActive='y'、authType/contentType 預設 | 確保新筆欄位完整 |
| 樹/docs 更新 | 後端 syncData 推送 → store.state.apis → genTree 重建 | 不需前端手動刷新，存/刪後即時反映 |

## spec 規則摘要（粒度 / 邊界 / 順序 / 契約）

- **驗證順序**：清空舊錯誤 → 同步檢測（全部 early-return 在開 loading 之前）→ 開 loading → 打 API（各自 catch + 旗標短路）→ 成功 emit + modal → finally 關 loading（順序屬 spec，對齊 §全域規範 5.1 core() 五段）。
- **粒度**：
  - 改名為 update（帶原 id，name 原地更新、舊名消失）；新增為 insert（無 id，funNew 產生新 id）——以「id 是否存在」分流。
  - 可預期錯誤走 inline 紅字（不打斷表單）；非預期走 showCheckYes modal（type:'error'，ADR-031；原載「非預期才 $alert」已不成立，2026-09-29 更正）。
- **送出入口與連按**（ADR-034）：入口為「儲存」「刪除」兩顆原生 `<button>`（輸入框不在 `<form>` 內，無 Enter 送出）。全頁 loading、確認框與結果訊息框（WDialog）只擋滑鼠、不搶焦點，焦點留在按鈕時之鍵盤 Enter／空白鍵仍觸發 click；重入一律由 `runSubmit` 判斷：儲存自觸發至結果訊息框關閉、刪除自開確認框至結果訊息框關閉，期間再觸發即略過。後端以「操作:使用者 id」占位：同一使用者並行儲存之第 2 次回 `saveInProgress`、並行刪除回 `deleteInProgress`，皆不寫入；依序送出、不同使用者皆不受影響（不同使用者對同一列仍由 kmx 序列化）。
- **邊界**：
  - 新筆 method 預設 'get'；blankApi 不帶 id 是走 insert 的關鍵。
  - 刪除取消（'close'）靜默不報錯。
- **契約**：
  - 成功訊息由 toast 改為 showCheckYes 模態（停留、需點 OK）——modal「顯示著被截」byte 穩定，與刪除確認 WConfirm 同款。
  - 存/刪後不由前端手動改樹，一律由後端 syncData 推送驅動重建。

## 已知落差

每條帶分類標籤（缺陷（待修）／設計事實（記錄備查）／待裁示（業主決定）／已修復（附修復紀錄））；修復後不刪、改標已修復。

- **已修復（附修復紀錄）**（2026-09-29，ADR-034）：存／刪之重送防護不完整。①前端重入只靠元件 `submitting` 旗標，刪除之檢查在確認後之 `doDelete` 第一行，確認框開啟期間焦點仍在刪除鈕上，鍵盤 Enter 會再開一次確認框並覆寫單例 `CheckYesNo` 之 Promise（第 1 次永不落定）；②後端 `saveApi` 以 kmx 序列化「非拒絕」，同一使用者並行新增 2 次時第 2 次於第 1 次完成後仍執行，而新列每次 `funNew` 產新 id → 插入第 2 列（修改前以備份模組重現）。修復：前端以 `runSubmit('saveApi' / 'deleteApi')` 判斷重入（刪除自開確認框起整段、存刪皆至結果訊息框關閉）並移除 `submitting`；單例訊息框 `show()` 先結束前一個等待者；後端 `lockSave` 依使用者占位（第 2 次回 `saveInProgress` / `deleteInProgress`，不寫入）。驗證：unit-procApis 雙擊防護 6 案（修改前為紅）、`api-doubleclick`（真後端直打）、e2e-edit 全部案例。
- **設計事實（記錄備查）**（2026-09-29，ADR-034）：同一使用者**依序**重送同一包新增資料（API 直打，第 2 次於第 1 次完成後才到）仍插入第 2 列——新列 id 由後端產生、無可比對之識別；本系統不以名稱為唯一鍵（業主定案）。UI 無此路徑：新增儲存成功後即離開新增模式（`onEditSaved` 設 `newMode=false`、`mode='docs'`，`src/components/LayoutContent.vue:588-592`）。
