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

- **E2E-006**（2026-10-23 新增，多人同時編輯 ADR-043；測試檔 `test/e2e-concurrent.test.mjs`）
  - title: 編輯時他人更新其他 API，草稿保留
  - description: 使用者在「編輯」分頁修改 Name 欄、尚未儲存時，若他人更新了另一筆 API，左樹會即時顯示該筆的新名稱，而使用者正在編輯的內容不會被覆蓋，也不出現任何提示；按「儲存」後使用者的修改照常寫入，他人對另一筆的更新不受影響，並彈出「已儲存」成功訊息。便於多人同時維護 API 時不遺失尚未儲存的編輯。
  - flow:
    - 測試資料：base seed；編輯「取得API清單」，Name 草稿為「草稿-取得API清單-<lang>」；他人（第二位使用者，經同一條資料通道呼叫 `saveApi`，不帶基準）把「取得寵物清單」改名為「取得寵物清單-他人改」。
    - 操作：點「編輯／編輯」分頁 → 於「Name／名稱」欄輸入草稿 →（他人改另一筆名稱，左樹出現新名稱）→ 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：他人更新後 Name 欄值仍為草稿、畫面無 `.bk-stale` 提示；儲存後 DB 有草稿名之 API、原名「取得API清單」不存在、他人改的名稱仍在（未被覆蓋）。
      2. 視覺（2 步驟、每步框住 Name 欄整列）：①輸入草稿後 `test/pics/conc/conc-{eng,cht}-E2E-006-1-draft.png`；②他人更新抵達後（草稿仍在）`...-E2E-006-2-kept.png`，皆以 pixelmatch 容差比對、非 byte-exact。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。
    - 備註：他人之寫入走與瀏覽器同一條資料通道（`callFun`，token=sys），後端因此推播至已開啟之頁面；步驟 1 與 2 之圖相同處為 Name 欄，差別在左樹（語意斷言守）。

- **E2E-007**（2026-10-23 新增）
  - title: 他人更新同一筆時儲存被拒
  - description: 使用者在「編輯」分頁修改 Name 欄、尚未儲存時，若他人更新了同一筆 API，編輯區上方出現「此 API 已被他人更新…」提示並附「重新載入」鈕，已輸入的內容保留；此時按「儲存」會被拒絕，儲存鈕上方顯示「資料已被他人更新，您的變更未儲存…」，不彈出成功訊息，資料庫維持他人的版本。按「重新載入」後表單改為最新內容、提示消失，之後再編輯即可儲存。便於避免用過期的畫面覆蓋他人的更新。
  - flow:
    - 測試資料：base seed；編輯「取得API清單」，Name 草稿「草稿-取得API清單-<lang>」；他人把同一筆之「說明」改為「他人改的說明-<lang>」；重新載入後 Name 改為「重載後改名-<lang>」。
    - 操作：點「編輯／編輯」分頁 → 於 Name 欄輸入草稿 →（他人改同一筆說明，出現提示）→ 點「儲存／儲存」（被拒）→ 點提示上之「Reload／重新載入」→ 於 Name 欄輸入新名稱 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：提示出現後 Name 欄仍為草稿、說明欄仍為舊值（基準凍結，推播不覆寫表單任何欄位）；點儲存後出現 `saveStale` 紅字（eng「The data has been updated by someone else, so your changes were not saved. …」／cht「資料已被他人更新，您的變更未儲存…」）、草稿保留、無成功 modal、DB 仍為原名且說明為他人所寫（零寫入）、草稿名不存在；**被拒的那次存檔實際送出之基準（擷取 `/api/main` 本體）等於以「載入時之列」所算，不等於含草稿之表單所算、也不等於推播後新列所算（基準凍結）**；點重新載入後提示消失、Name 回到「取得API清單」、說明為他人所寫；再儲存成功，DB 有新名稱且說明仍為他人所寫，**此次送出之基準等於以重新載入當下之列所算**。
      2. 視覺（4 步驟）：①輸入草稿（框住 Name 欄整列）`test/pics/conc/conc-{eng,cht}-E2E-007-1-draft.png`；②出現「已被他人更新」提示（框住提示整顆）`...-E2E-007-2-stale.png`；③儲存被拒後之紅字（框住該行紅字）`...-E2E-007-3-rejected.png`；④重新載入後說明欄顯示他人所寫內容（框住說明欄整列）`...-E2E-007-4-reloaded.png`，皆以 pixelmatch 容差比對、非 byte-exact。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。
    - 備註：被拒時 `rejected` 旗標亦使提示出現（推播尚未抵達時）；本案例推播先到，故提示由推播觸發。

- **E2E-008**（2026-10-23 新增）
  - title: 編輯時該 API 被刪除，停留並提示
  - description: 使用者在「編輯」分頁修改 Name 欄、尚未儲存時，若他人刪除了這筆 API，編輯區仍停留在原畫面而不會改成列表中的另一筆，已輸入的內容保留，上方出現「此 API 已被他人刪除…」提示，且不提供「重新載入」；此時按「儲存」會顯示「此 API 已不存在…」，已刪除的 API 不會因此復活。
  - flow:
    - 測試資料：base seed；編輯「取得API清單」，Name 草稿「草稿-取得API清單-<lang>」；他人刪除「取得API清單」。
    - 操作：點「編輯／編輯」分頁 → 於 Name 欄輸入草稿 →（他人刪除此筆，出現提示）→ 點「儲存／儲存」。
    - 驗證：
      1. 語意：提示出現後 Name 欄仍為草稿（未被換成列表第一筆之內容）、提示內無按鈕；點儲存後出現 `errApiRowNotFound` 紅字（eng「This API no longer exists …」／cht「此 API 已不存在…」）、草稿保留；DB 無原名、無草稿名（不復活）。**之後該 API 以同一 `id` 重新出現（測試以直接寫庫模擬由備份還原，再由他人修改另一列觸發推播）：提示改為「已被他人更新」並出現「重新載入」鈕（先前「已不存在」之拒收狀態一併解除，不再卡在已刪除）、草稿仍保留；點重新載入後 Name 回到「取得API清單」、提示消失（無標準圖）。**〔2026-10-23 更正（ADR-046）：原載「外部匯入把該 API 還原（以 `id` 代替來源鍵，同一 `id` 重新出現）」不成立——外部不得送 `id`，匯入不能使已刪之列以原 `id` 重現（改以 `srcKey` 新增者配新 `id`）；此規則於使用者路徑上無對應操作，列為防禦性規則（見〈已知落差〉設計事實）。〕
      2. 視覺（2 步驟）：①輸入草稿（框住 Name 欄整列）`test/pics/conc/conc-{eng,cht}-E2E-008-1-draft.png`；②出現「已被他人刪除」提示（框住提示整顆）`...-E2E-008-2-deleted.png`，皆以 pixelmatch 容差比對。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。

- **E2E-009**（2026-10-23 新增）
  - title: 編輯時搜尋，不換筆且草稿保留
  - description: 使用者在「編輯」分頁修改 Name 欄、尚未儲存時，於左樹搜尋框輸入關鍵字 cats，左樹只剩符合的 API，而編輯區仍是原來那筆、已輸入的內容保留；按「儲存」後寫回原來那筆 API，符合搜尋的其他 API 不受影響。
  - flow:
    - 測試資料：base seed；編輯「取得API清單」，Name 草稿「草稿-取得API清單-<lang>」；搜尋詞「cats」（命中 keywords 含 `pets;cats` 之 4 筆）。
    - 操作：點「編輯／編輯」分頁 → 於 Name 欄輸入草稿 → 於左樹「Search API…／搜尋API…」輸入 cats → 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：搜尋後左樹不再含「取得寵物清單」、Name 欄仍為草稿、無提示；儲存後 DB 有草稿名、原名不存在、keywords 為 `pets;cats` 之 4 筆不變。
      2. 視覺（1 步驟）：搜尋後 Name 欄仍為草稿（框住 Name 欄整列）`test/pics/conc/conc-{eng,cht}-E2E-009-1-search-kept.png`，以 pixelmatch 容差比對。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。
    - 備註：搜尋與選取脫鉤只在「編輯既有 API」時生效；文件、測試分頁維持原行為（選取隨搜尋結果轉移；展示流程 E2E-003 之畫面不變），避免改變既有畫面。

- **E2E-010**（2026-10-23 新增）
  - title: 無改動時他人更新，表單自動更新
  - description: 使用者開啟「編輯」分頁且尚未輸入任何內容時，若他人更新了同一筆 API，表單自動改為最新內容、不出現提示；之後輸入含特殊字元（如 a<b）的名稱並儲存，再次開啟「編輯」不改動直接儲存仍可成功，不會被自己上一次的儲存誤判為過期。便於確認存檔後的比對基準永遠取自伺服器保存的內容。
  - flow:
    - 測試資料：base seed；他人把「取得API清單」之說明改為「他人改的說明-<lang>」；使用者把 Name 改為「特殊字元a<b-<lang>」（伺服器寫入時 `a<b` 改寫為 `a&lt;b`）。
    - 操作：點「編輯／編輯」分頁 →（他人改說明）→ 於 Name 欄輸入含特殊字元之名稱 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」→ 再點「編輯／編輯」分頁 → 不改動直接點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：他人更新後說明欄自動為最新值、無提示；第一次儲存送出之基準（擷取 `/api/main` 本體，經實際傳輸路徑與瀏覽器 bundle）等於以庫內「儲存前」之列由 `buildBaseline` 所算；再開編輯顯示伺服器存放之名稱（`a&lt;b`）；第二次儲存成功、無提示，其基準取自伺服器存放之列（等於以庫內列所算，而非第一次送出之值）。
      2. 視覺：成功 modal 與 E2E-001 同款（見其標準圖），本案例無獨特視覺終態，不另設標準圖（§7.8 ①）。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。

- **E2E-011**（2026-10-23 新增，外審補強）
  - title: 他人改了又改回，提示撤除且仍可儲存
  - description: 使用者在「編輯」分頁修改 Name 欄、尚未儲存時，若他人更新了同一筆 API 的說明，編輯區上方出現「此 API 已被他人更新…」提示；之後他人又把說明改回原來的內容，提示即自動消失，已輸入的內容保留；按「儲存」仍可成功，說明維持他人改回的內容。便於避免在他人已還原內容時仍要求使用者重新載入。
  - flow:
    - 測試資料：base seed；編輯「取得API清單」，Name 草稿「草稿-取得API清單-<lang>」；他人先把說明改為「他人改的說明-<lang>」，再改回載入時之原說明。
    - 操作：點「編輯／編輯」分頁 → 於 Name 欄輸入草稿 →（他人改說明，出現提示）→（他人改回原說明，提示消失）→ 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：第一次更新後出現 `.bk-stale` 提示（含重新載入鈕）；改回後提示消失、Name 欄仍為草稿；儲存成功，DB 有草稿名之 API 且說明為原說明；送出之基準等於以載入時之列所算（基準全程凍結）。
      2. 視覺（2 步驟）：①出現「已被他人更新」提示（框住提示整顆）`test/pics/conc/conc-{eng,cht}-E2E-011-1-stale.png`；②提示消失後 Name 欄仍為草稿（框住 Name 欄整列）`...-E2E-011-2-cleared.png`，皆以 pixelmatch 容差比對。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。

- **E2E-012**（2026-10-23 新增，外審補強）
  - title: 舊資料無法建立基準時禁止儲存
  - description: 若某筆 API 是舊版匯入留下、欄位內容含無法比對的值（例如過深的巢狀資料），使用者在「編輯」分頁修改後按「儲存」，畫面會在儲存鈕上方顯示「此 API 之載入資料無法建立存檔基準…」，不送出儲存、不彈出成功訊息，已輸入的內容保留；這是為了避免在無法比對的情況下覆蓋他人的更新。需洽系統管理者處理該筆資料。
  - flow:
    - 測試資料：base seed；先以資料庫直接寫入使「取得API清單」之 dataSource 欄含 120 層巢狀物件（現行匯入已拒收此型別；非 UI 可造成）；Name 草稿「草稿-取得API清單-<lang>」。
    - 操作：點「編輯／編輯」分頁 → 於 Name 欄輸入草稿 → 點「儲存／儲存」。
    - 驗證：
      1. 語意：出現 `errBaselineBroken` 紅字（eng「…cannot be used as a save baseline…」／cht「…無法建立存檔基準…」）；瀏覽器未送出任何 `saveApi`（擷取 `/api/main` 本體為 0）；無成功 modal；DB 仍為原名、無草稿名；草稿保留。
      2. 視覺（1 步驟）：儲存鈕上方該行紅字（框住該行紅字）`test/pics/conc/conc-{eng,cht}-E2E-012-1-broken.png`，以 pixelmatch 容差比對。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed（還原會刪掉被污染之列）。
    - 備註：不降級為「不帶基準存檔」——後端對不帶基準者不比對，會在他人更新後靜默覆寫。

- **E2E-013**（2026-10-23 新增，ADR-044，原則 5）
  - title: 外部匯入的 API 唯讀，僅權杖與測試設定可改
  - description: 外部來源匯入的 API（來源鍵非空）在左側樹狀清單的名稱旁顯示鎖頭，滑鼠停留時說明「由外部來源「ext-demo」匯入，於此為唯讀」。選取這筆 API 並點「編輯」分頁後，上方出現唯讀說明；名稱、說明、API網址、方法、版本、群組、所屬階層、關鍵字、狀態、順序與四個文件欄位皆為唯讀（欄位標籤旁有鎖頭，鍵盤輸入無效），權杖與測試設定仍可修改。底部「刪除」鈕停用，滑鼠停留時說明「由外部來源匯入，不可在此刪除」。在權杖欄輸入後點「儲存」，儲存成功，其餘欄位維持外部來源提供的內容。便於確認哪些資料由外部來源管理、哪些可由本站維護。
  - flow:
    - 測試資料：base seed；前置直接寫 DB（非 UI 可造成）使「取得API清單」成為外部列（group `ext-demo`、srcKey `ext-key-1`），同 group 另有混雜列「取得寵物清單」（srcKey 空，見 E2E-015）；權杖輸入「tok-ext-1」。
    - 操作：開 `/?token=sys`（進站選取「取得API清單」）→ 滑鼠停留於樹狀清單該列之鎖頭 → 點「編輯／編輯」分頁 → 滑鼠停留於「Name／名稱」標籤旁鎖頭 → 於 Name 欄以鍵盤輸入（無效）→ 滑鼠停留於停用之「刪除／刪除」鈕、點擊（無反應）→ 於「Tokens／授權金鑰」欄輸入 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：樹狀清單中只有該列有鎖頭（`[data-ext-mark="lock"]` 恰 1 個）、鎖頭提示含「ext-demo」與「唯讀」；編輯頁上方 `.bk-ext` 說明含「imported from external source "ext-demo"」（eng）／「由外部來源「ext-demo」匯入」（cht），無混雜警告；13 個欄位（Name、Description、API url、Version、Group、Levels、Keywords、State、Order、Input、Input example、Output、Output example）`readonly`，方法以唯讀框（`[data-ro-field="method"]`）顯示，各自標籤旁有鎖頭；Tokens、Test base URL、Content type 非唯讀且無鎖頭；以真鍵盤輸入 Name 欄後值不變；刪除鈕 `disabled`、頁面無可用之刪除鈕、停留顯示說明、點擊不開確認框、DB 仍有該列；儲存後 DB 該列 tokens 為「tok-ext-1」，name／description／url／method／version／group／levels／keywords／state／order／creator／dataSource／四個文件欄位／srcKey／id 皆與前置相同。
      2. 視覺（4 步驟）：①樹狀清單外部列旁出現鎖頭（框住該樹狀清單列）`test/pics/ext/ext-{eng,cht}-E2E-013-1-tree-lock.png`；②編輯頁上方出現唯讀說明（框住說明整顆）`...-E2E-013-2-notice.png`；③名稱欄為唯讀樣式且標籤旁有鎖頭（框住 Name 欄整列）`...-E2E-013-3-readonly.png`；④刪除鈕呈停用外觀（框住刪除鈕）`...-E2E-013-4-delete-off.png`，皆以 pixelmatch 容差比對。提示框（tooltip）不入標準圖（停留才出現），以語意斷言守。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed 並重做前置。
    - 備註：外部擁有欄位＝`provideTabs` 的 `ks_apis` 白名單去 `srcKey`／`id`（16 欄，契約 `fieldsExternal`）；本系統擁有欄位＝契約 `fieldsLocal`（含 tokens，8 欄）。伺服端同樣強制（`saveExternalRowChanged`／`deleteExternalRowDenied`，見 `api-externalRows`），前端唯讀為提示與預先擋下。

- **E2E-014**（2026-10-23 新增，ADR-044，原則 5）
  - title: 外部管理的群組不可新增或改入 API
  - description: 某個群組內已有外部匯入的 API 時，該群組由外部來源管理（下次匯入會以外部清單為準，後台自建在其中的 API 會被移除）。使用者點「新增API」，在群組欄輸入這個群組名稱，欄位下方立即顯示「群組「ext-demo」由外部來源管理，不可在此新增 API 或把 API 改入。」；此時點「儲存」，儲存鈕上方顯示「未儲存：此群組由外部來源管理…」，不送出儲存、資料不變。把群組改成其他名稱後提示消失，儲存成功。對既有 API 把群組改成這個群組同樣被擋。
  - flow:
    - 測試資料：同 E2E-013 前置；新增之 API 名稱「E2E新增-<lang>」、網址 `http://localhost:11005/e2eExt`，群組先輸入「ext-demo」再改為「ext-free」；改入對象為「取得貓咪清單」。
    - 操作：點「New API／新增API」→ 輸入名稱、網址、群組「ext-demo」→ 點「儲存／儲存」→ 群組改為「ext-free」→ 點「儲存／儲存」→ 成功 modal 點「OK／確認」→ 於左樹搜尋「取得貓咪清單」並點選 → 點「編輯／編輯」分頁 → 群組改為「ext-demo」→ 點「儲存／儲存」。
    - 驗證：
      1. 語意：群組欄列內出現 `.bk-err` 提示（eng「Group "ext-demo" is managed by an external source. APIs cannot be added to it or moved into it here.」／cht「群組「ext-demo」由外部來源管理，不可在此新增 API 或把 API 改入。」）；點儲存後出現 `saveExternalGroupDenied` 紅字（eng「Not saved: this group is managed by an external source …」／cht「未儲存：此群組由外部來源管理…」），瀏覽器未送出任何 `saveApi`（擷取 `/api/main` 本體為 0）、無成功 modal、DB 筆數不變且無該新增列；改為「ext-free」後提示消失、儲存成功，DB 該列 group 為「ext-free」、srcKey 為空；對「取得貓咪清單」改群組為「ext-demo」同樣出現提示並被擋，DB 該列群組維持原值。
      2. 視覺（2 步驟）：①群組欄下方出現即時提示（框住群組欄整列，含提示）`test/pics/ext/ext-{eng,cht}-E2E-014-1-group-hint.png`；②儲存鈕上方出現被擋訊息（框住該行紅字）`...-E2E-014-2-blocked.png`，皆以 pixelmatch 容差比對。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed 並重做前置。
    - 備註：伺服端於表鎖內新鮮讀取該群組後判定（`api-externalRows` 含匯入與新增並行之序列化案例）；前端以 store 全表判定，推播使 store 更新後提示隨之改變。

- **E2E-015**（2026-10-23 新增，ADR-044，原則 3）
  - title: 外部群組內無來源鍵的 API 顯示警告，仍可編輯
  - description: 外部管理的群組內，若有後台自建、沒有來源鍵的 API（升級前就存在的資料），它不會被鎖，但在左側樹狀清單的名稱旁顯示警告，滑鼠停留時說明「群組「ext-demo」由外部來源管理，而此 API 無來源鍵，下次匯入若未以其 id 列入，它會被移除」。點「編輯」分頁，上方顯示同意旨的警告；欄位皆可編輯、「刪除」鈕可用，修改說明後儲存成功，群組不變。便於系統管理者在下次匯入前決定保留（改到其他群組）或接受移除。
  - flow:
    - 測試資料：同 E2E-013 前置；對象為「取得寵物清單」（group `ext-demo`、srcKey 空）；說明改為「混雜列說明-<lang>」。
    - 操作：開 `/?token=sys` → 於左樹搜尋「取得寵物清單」並點選 → 滑鼠停留於該列警告 → 點「編輯／編輯」分頁 → 於「Description／說明」欄輸入 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：樹狀清單中恰有 1 個警告（`[data-ext-mark="warn"]`）、提示含「has no source key, so the next import removes it」（eng）／「無來源鍵，下次匯入若未以其 id 列入，它會被移除」（cht）；編輯頁上方 `.bk-ext-warn` 含「Group "ext-demo" is managed by an external source and this API has no source key」（eng）／「群組「ext-demo」由外部來源管理，而此 API 無來源鍵」（cht），無唯讀說明；頁面無 `readonly` 欄位、無方法唯讀框、無停用之刪除鈕（可用之刪除鈕恰 1 個）；儲存後 DB 說明為新值、group 仍為 `ext-demo`、srcKey 仍為空。
      2. 視覺（2 步驟）：①混雜列旁出現警告（框住該樹狀清單列）`test/pics/ext/ext-{eng,cht}-E2E-015-1-tree-warn.png`；②編輯頁上方出現警告（框住警告整顆）`...-E2E-015-2-notice.png`，皆以 pixelmatch 容差比對。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed 並重做前置。
    - 備註：下次匯入的行為（README Upgrade Notes〈Breaking change since 1.1.14〉）：該 group 的批次以 `srcKey` 配對（無 `srcKey` 之既有列以其 `id` 為有效來源鍵，一次性遷移），批次 `srcKey` 未等於其 `id` 之無鍵列被刪並記 warn `syncAndReplaceTabs-delNoSrcKey`；`srcKey` 等於其 `id` 者保留並補 `srcKey = id` 成為外部列。本系統不自動刪除任何資料。

- **E2E-016**（2026-10-23 新增，ADR-044）
  - title: 關閉外部列保護後回到原行為
  - description: 後端以 `lockExternalRows: 'n'` 啟動時，外部匯入的 API 與一般 API 無異：樹狀清單沒有鎖頭或警告，編輯頁沒有說明、欄位可編輯、「刪除」鈕可用；可修改名稱並儲存成功，也可在外部匯入的群組新增 API。此時下次外部匯入會以外部清單為準，覆蓋後台對外部欄位的修改，並移除後台在該群組新增的 API。
  - flow:
    - 測試資料：同 E2E-013 前置，後端以臨時設定檔（`lockExternalRows: 'n'`）重啟，結束後還原預設設定；名稱改為「n模式改名-<lang>」；新增 API「n模式新增-<lang>」於群組「ext-demo」。
    - 操作：開 `/?token=sys`（進站選取「取得API清單」）→ 點「編輯／編輯」分頁 → 於 Name 欄輸入新名稱 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」→ 點「New API／新增API」→ 輸入名稱、網址、群組「ext-demo」→ 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：頁面無任何 `[data-ext-mark]`、無 `.bk-ext` 說明、無 `readonly` 欄位、無停用之刪除鈕；群組欄無 `.bk-err` 提示；DB 該外部列名稱已改（srcKey 仍為 `ext-key-1`）、新增列 group 為 `ext-demo`。
      2. 視覺（1 步驟）：名稱欄呈可編輯樣式且標籤旁無鎖頭（框住 Name 欄整列）`test/pics/ext/ext-{eng,cht}-E2E-016-1-editable.png`，以 pixelmatch 容差比對。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed 並重做前置；describe 結束後以 `./settings.json` 重啟後端。
    - 備註：選項亦可由 `settings.json` 的 `lockExternalRows` 設定（`srv.mjs` 轉入 `WWebApi` 的 `opt.lockExternalRows`，預設 `'y'`）。

- **E2E-017**（2026-10-23 新增，ADR-044 外審補強）
  - title: 編輯中被匯入補上來源鍵，權杖仍可儲存
  - description: 使用者正在編輯一筆後台自建的 API（來源鍵為空）並已在權杖欄輸入內容、尚未儲存時，外部來源以該筆 API 的 id 匯入完全相同的內容，這筆 API 因此補上來源鍵、成為外部匯入的 API。此時編輯頁上方出現唯讀說明、名稱等欄位轉為唯讀，但因內容未變，不會出現「已被他人更新」提示，已輸入的權杖保留；按「儲存」仍可成功，權杖寫入、其餘欄位維持原內容。便於確認外部來源將後台資料納管時不會讓系統管理者的操作被誤擋。
  - flow:
    - 測試資料：同 E2E-013 前置，另把「取得貓咪清單」之 group 改為專用之「promo-group」（後台列，來源鍵空）；匯入列之 `srcKey` 等於該列 id（一次性遷移，不得帶 `id`），外部擁有欄位逐欄取自庫內（內容相同）；權杖輸入「tok-promo」。
    - 操作：於左樹搜尋「取得貓咪清單」並點選 → 點「編輯／編輯」分頁 → 於「Tokens／授權金鑰」欄輸入 →（外部匯入，補上來源鍵）→ 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：編輯當下無 `.bk-ext` 說明；匯入回應 `nUpdate` 為 0、庫內 `srcKey` 等於該列 id；匯入後頁面出現唯讀說明、名稱欄 `readonly`、無 `.bk-stale` 提示、權杖欄仍為「tok-promo」；儲存成功後庫內 tokens 為「tok-promo」、`srcKey` 仍為該列 id、16 個外部擁有欄位與前置相同（`group` 為 `promo-group`）。
      2. 視覺：無獨特視覺終態（成功 modal 與 E2E-001 同款、唯讀說明見 E2E-013），不另設標準圖（§7.8 ①），以語意斷言守。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed 並重做前置。
    - 備註：持舊畫面之整列回聲帶載入當時之空 `srcKey`；伺服端不把空值當作改身分欄（見〈已知落差〉設計事實），否則此流程會被誤拒（`api-concurrency` V5 暴露）。

- **E2E-018**（2026-10-23 新增，ADR-044 外審補強）
  - title: 編輯中被匯入補上來源鍵且草稿含外部欄位修改，被拒並可重新載入
  - description: 使用者正在編輯一筆後台自建的 API，在說明欄輸入了草稿（尚未儲存）時，外部來源匯入同一筆 API 的相同內容，使它成為外部匯入的 API：編輯頁轉為唯讀（說明欄保留草稿）。此時按「儲存」會被拒絕，顯示「未儲存：此 API 由外部來源匯入…」，上方出現「此 API 已被他人更新…」提示與「重新載入」鈕，資料不變；按「重新載入」後表單回到目前的內容，之後修改權杖並儲存即可成功。便於系統管理者在 API 被外部來源納管後，知道要重新載入而不是反覆嘗試。
  - flow:
    - 測試資料：同 E2E-017 前置；說明草稿「draft-before-promotion」；權杖「tok-after-reload」。
    - 操作：於左樹搜尋「取得貓咪清單」並點選 → 點「編輯／編輯」分頁 → 於「Description／說明」欄輸入草稿 →（外部匯入，補上來源鍵）→ 點「儲存／儲存」→ 點提示上之「重新載入／重新載入」→ 於「Tokens／授權金鑰」欄輸入 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：匯入後出現唯讀說明、說明欄 `readonly` 且保留草稿；儲存後出現 `.bk-err`（`saveExternalRowChanged` 原文）與 `.bk-stale` 提示含按鈕、庫內說明不變；重新載入後說明欄為庫內值、提示消失；權杖儲存成功、說明仍為庫內值。
      2. 視覺：無標準圖（被拒訊息與提示之樣式同 E2E-007，不另設；以語意斷言守）。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed 並重做前置。
    - 備註：被拒之鍵 `saveExternalRowChanged`／`deleteExternalRowDenied` 視同「已被他人更新」（`LayoutContentEdit.vue` 之 `KEYS_REJECT_CHANGED`）。

- **E2E-019**（2026-10-23 新增，ADR-045，api-run03；規格 §8 存檔成功後之新基準須立即取得）
  - title: 儲存成功後立即再編輯再儲存，不被自己上一次的儲存誤擋
  - description: 使用者在「編輯」分頁修改名稱並儲存成功後，畫面（左側清單與右側文件）立即顯示伺服器保存的名稱，不需等待資料更新的通知；此時立刻再次點「編輯」，名稱欄為伺服器保存的內容，再改名稱並儲存仍可成功，不會出現「資料已被他人更新，您的變更未儲存」。之後資料更新的通知抵達時，編輯頁上不出現「已被他人更新」提示，也不會重建表單而丟失正在輸入的內容。便於確認存檔後的比對基準取自伺服器回傳的內容（連伺服器改寫過的字元也一致），不會被自己的儲存擋住。
  - flow:
    - 測試資料：base seed；以頁內接縫攔下伺服端推送至畫面的整表更新（模擬網路延遲，攔下期間畫面只會因「儲存成功之回傳」而改變）；第一次名稱「存檔後a<b-<lang>」（伺服器寫入時改寫為 `a&lt;b`）、第二次「再存-<lang>」、第三次草稿「草稿-三-<lang>」。
    - 操作：點「編輯／編輯」分頁 → 於 Name 欄輸入第一次名稱 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」→（推播被攔下）→ 再點「編輯／編輯」分頁 → 於 Name 欄輸入第二次名稱 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」→（被攔下的最新推播產生）→ 再點「編輯／編輯」分頁 → 輸入草稿 →（放行推播）→ 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：第一次儲存後（推播被攔下）左側清單已出現伺服器存放之名稱 `a&lt;b`；再開編輯名稱欄為該值；第二次儲存成功（出現成功 modal、無 `.bk-err`），DB 為第二次名稱且原名稱不存在；兩次儲存送出之基準（擷取 `/api/main` 本體）中，第二次等於以第一次儲存後庫內之列所算，且不等於以第一次送出之值（`a<b`）所算；放行推播後無 `.bk-stale` 提示、名稱欄仍為草稿；最後儲存草稿成功。
      2. 視覺：無獨特視覺終態（成功 modal 與 E2E-001 同款），不另設標準圖（§7.8 ①），以語意斷言守。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。
    - 備註：推播攔截點為 `store.commit('UpdateTableData')` 中 apis 表之整表覆寫（`test/tools/e2eEditHelpers.mjs` 之 `installPushHold`，同 `installRpcCapture` 屬觀察／時序接縫，非使用者動作之替代）；放行時只放最新一筆（逐筆重播舊快照會製造「舊推播晚於新回應」之假象）。

- **E2E-020**（2026-10-23 新增，ADR-045，api-run03）
  - title: 他人在我儲存之後改了同一筆，我再儲存仍被拒
  - description: 使用者儲存成功後立刻再次進入「編輯」，此時另一位使用者修改了同一筆 API（畫面尚未收到更新通知）；使用者改名稱並按「儲存」，仍會被拒絕，顯示「資料已被他人更新，您的變更未儲存」，已輸入的內容保留，資料庫維持另一位使用者所寫的內容。便於確認「先改的人優先」的保護在「儲存後立即再編輯」的情況下依然有效。
  - flow:
    - 測試資料：base seed；推播攔截同 E2E-019；第一次名稱「我先存-<lang>」；他人把同一筆說明改為「他人在我之後改的說明-<lang>」（不帶基準，看著最新資料改）；第二次名稱草稿「我的第二次-<lang>」。
    - 操作：點「編輯／編輯」分頁 → 於 Name 欄輸入第一次名稱 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」→ 再點「編輯／編輯」分頁 →（他人改說明）→ 於 Name 欄輸入第二次名稱 → 點「儲存／儲存」。
    - 驗證：
      1. 語意：儲存鈕上方出現 saveStale 紅字（eng「…updated by someone else, so your changes were not saved」／cht「資料已被他人更新，您的變更未儲存」）；無成功 modal；名稱欄仍為草稿；DB 說明為他人所寫、原名稱仍在、第二次名稱未寫入；第二次送出之基準等於以第一次儲存後庫內之列所算（他人其後之更新不在其中，故被拒）。
      2. 視覺：無標準圖（被拒訊息與 E2E-007-3 同款，不另設；以語意斷言守）。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。

- **E2E-021**（2026-10-23 新增，ADR-045，api-run03）
  - title: 刪除成功後該筆立即從清單消失
  - description: 使用者在「編輯」分頁刪除一筆 API 並確認後，左側清單立即不再顯示該筆，不需等待資料更新的通知，也不會在稍後收到通知時出現「已被他人更新／刪除」提示。便於避免剛刪除的 API 在清單中殘留數秒、被誤點進去編輯。
  - flow:
    - 測試資料：base seed；推播攔截同 E2E-019；刪除對象為預設選取之「取得API清單」。
    - 操作：點「編輯／編輯」分頁 → 點「刪除／刪除」→ 確認對話框點「是／確定」→ 成功 modal 點「OK／確認」→（被攔下的推播產生並放行）→ 再點「編輯／編輯」分頁。
    - 驗證：
      1. 語意：刪除後（推播被攔下）左側清單不含「取得API清單」且仍有其他 API；DB 已無該筆；被攔下的推播（已無該筆之整表）放行後再開編輯，無 `.bk-stale` 提示。
      2. 視覺：無標準圖（畫面終態同 E2E-003-3，以語意斷言守）。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。

- **E2E-022**（2026-10-23 新增，ADR-045，api-run03）
  - title: 新增成功後新的一筆立即出現，可立即編輯再儲存
  - description: 使用者新增一筆 API 並儲存成功後，左側清單立即出現該筆（含伺服器配給的編號），不需等待資料更新的通知；此時於搜尋框輸入其名稱選取該筆、點「編輯」改名並儲存，可直接成功，且仍是同一筆（不會多出一筆）。便於確認新增後立即修改不被自己的儲存擋住。
  - flow:
    - 測試資料：base seed；推播攔截同 E2E-019；新增名稱「新增後立即編-<lang>」、網址 `http://localhost:11005/e2eNew`、階層「E2E新增分類」；改名為「<原名>-改」。
    - 操作：點「新增API」→ 填名稱／網址／階層 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」→（推播被攔下）→ 於左樹搜尋框輸入新名稱 → 點「編輯／編輯」分頁 → 於 Name 欄輸入新名稱 → 點「儲存／儲存」→ 成功 modal 點「OK／確認」。
    - 驗證：
      1. 語意：新增後（推播被攔下）左側清單已含新名稱；再開編輯名稱欄為新名稱；改名儲存成功、DB 新名稱列 id 等於新增時該列 id（原地更新，非再新增）；第一次儲存不帶基準（`saveApi` 引數 1 個），第二次送出之基準等於以新增後庫內之列所算（含伺服器配的新 id）。
      2. 視覺：無標準圖（畫面終態同 E2E-002-3，以語意斷言守）。
    - 雙語：eng / cht 各一輪。
    - 清理：各 case 起跑前還原 base seed。

## 執行流程

### 改名（E2E-001）

```
001  點「編輯」分頁 onChangeMode({id:'edit'}) → mode='edit'  [src/components/LayoutContent.vue:149,575-582]
002  渲染編輯表單，editItem 取既有 apiSelect；mounted 呼叫 initFromItem：form／formInit 深拷貝自 store 列，並以 buildBaseline 對該 store 列（非表單）自算基準 [[id, 列摘要]] 存於 data（2026-10-23 改，原為 watch.item 深度監看並整份覆寫表單，ADR-043）  [src/components/LayoutContent.vue:editItem][src/components/LayoutContentEdit.vue:mounted,initFromItem]
003  改「名稱」欄後點「儲存」onClickSave → submitSave()  [src/components/LayoutContentEdit.vue:onClickSave]
003a     $ui.runSubmit('saveApi', …) 包覆整段（submitSave + .catch + .finally）：同 key 進行中（自觸發至結果訊息框關閉）再觸發即略過——滑鼠與焦點在儲存鈕時之鍵盤 Enter／空白鍵同一狀態（ADR-034）  [src/components/LayoutContentEdit.vue:onClickSave][src/plugins/mUI.mjs:runSubmit]
004      執行非同步流程 core()  [src/components/LayoutContentEdit.vue:submitSave]
005          清空 inline 錯誤 errName/errUrl/errJson/errSave  [src/components/LayoutContentEdit.vue:353-357]
006          同步檢測：名稱/網址必填、JSON 欄位格式  [src/components/LayoutContentEdit.vue:360-381]
                 不合: 設對應 inline 紅字並 return（短路，未開 loading）  [src/components/LayoutContentEdit.vue:360-380]
007          開 loading  [src/components/LayoutContentEdit.vue:384]
008          呼叫後端 saveApi(form, { baseline })（既有列帶 initFromItem 自算之基準；新增列不帶），reject 時落下方 .catch  [src/components/LayoutContentEdit.vue:submitSave]
                 lockSave('saveApi', userId)：同一使用者之儲存處理中再送出即 reject('saveInProgress')、不寫入（不排隊）  [server/procApis.mjs:saveApi][server/lockSave.mjs:createLockSave]
                 其內 guardWrite（apis 表鎖，與刪除、外部匯入同一把；2026-10-23 取代局部 kmx，ADR-043）：鎖內新鮮讀取該列（read 只讀該列）→ 有 opt.baseline 則 compareBaseline，不符 reject('saveStale')（零寫入）；格式或版本不識 reject('errBaselineFormat')，不降級為不帶基準；該列已不存在 reject('errApiRowNotFound')  [server/procApis.mjs:saveApi][node_modules/w-serv-orm/src/WServOrm.mjs:guardWrite]
                 只寫契約白名單欄位 pickWriteRow（伺服器專有欄位 timeCreate／isActive／userIdUpdate／srcKey 取庫內值，不採客戶端值）；authType／contentType 空值補預設（只在列帶該欄時）；客戶端之 opt 只讀 baseline，不轉給 procOrm  [server/procApis.mjs:saveApi][src/schema/contracts/apis.mjs]
                 以 procOrm save + { mustExist: true } 寫入（只改不增: 已被刪之列不復活）；procOrm 補 userIdUpdate／timeUpdate；ORM 失敗 reject('saveWriteFail')，原文入 srLog（R-ERR-1，ADR-038）  [server/procApis.mjs:saveApi][server/ormErrKey.mjs:ormFail]
                 新增列（無 id）: 於 withTabLocks(['apis']) 內 funNew 配 id／時間／預設後以 save 寫入（不比對、不去重）  [server/procApis.mjs:saveApi]
008a         存檔成功時 procOrm 寫入後，仍在同一把表鎖內以 woItems.apis.select 新鮮讀回該列（attachRow），附於 procOrm save 逐筆結果第 0 筆之 row 鍵回傳（id、ok 等原鍵不變）；讀回拒絕或未命中時回 procOrm 原結果（寫入已生效，不使存檔失敗，入 srLog），前端退回等推播（2026-10-23 api-run03，ADR-045，規格 §8）  [server/procApis.mjs:attachRow,saveApi]
009          .then: 設成功旗標 okSave，並取回傳之 res[0].row 為 rowSaved（寫入後之伺服端列，非送出之 form）  [src/components/LayoutContentEdit.vue:submitSave]
010          .catch: 設 errSave inline 紅字；若錯誤鍵為 saveStale／errBaselineFormat／errApiRowNotFound 另設 rejected → 編輯區上方出現提示（保留草稿，不動 form）  [src/components/LayoutContentEdit.vue:markRejected]
011          okSave 為否則 return（短路）  [src/components/LayoutContentEdit.vue:391]
012          $emit('saved', { row, baseline }) → onEditSaved：有 row 則 commit ApplySavedRow 立即更新 store 列（applySavedRow：store 列仍等於開啟編輯時之基準才以 row 取代；已等於 row 不動；已是別的內容〔他人其後之更新，其推播先到〕不回退；列已不在不復活；新增則加入），genTree 隨之重建（左樹與文件立即反映，下次開編輯之基準取自此列）；再回 docs；其後抵達之同內容推播該列摘要與基準相同，編輯器不視為他人更新（2026-10-23 api-run03，ADR-045）  [src/components/LayoutContentEdit.vue:submitSave][src/components/LayoutContent.vue:onEditSaved][src/store/applyRows.mjs:applySavedRow][src/store/mutations.mjs:ApplySavedRow]
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
                 客戶端之 id（非字串）、timeCreate、srcKey、isActive 等伺服器專有欄位先經 pickWriteRow 濾除；於 withTabLocks(['apis']) 內（與改名、刪除、外部匯入同一把表鎖）funNew 產生新 id（genIDSeq）、時間戳、isActive='y'  [server/procApis.mjs:saveApi][src/schema/tables/apis.mjs:funNew]
                 以 save 寫入 LMDB（主鍵不存在即新增一筆；不帶 mustExist、不比對基準、不去重；ORM 失敗同 reject('saveWriteFail')）  [server/procApis.mjs:saveApi]
008          .catch 設 errSave；okSave 為否則 return  [src/components/LayoutContentEdit.vue:submitSave]
009          $emit('saved', { row, baseline: undefined }) → 回 docs（newMode=false）；有 row（含伺服端配的新 id）則 commit ApplySavedRow 立即把新列加入 store（新節點立即出現，不等推播；無舊 id 故預設選第一筆）（2026-10-23 api-run03，ADR-045）  [src/components/LayoutContentEdit.vue:submitSave][src/components/LayoutContent.vue:onEditSaved,genTree][src/store/applyRows.mjs:applySavedRow]
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
                 lockSave('deleteApi', userId, …, { errKey: 'deleteInProgress' })：同一使用者之刪除處理中再送出即 reject('deleteInProgress')（不排隊）  [server/procApis.mjs:deleteApi]
                 其內 guardWrite（同一把 apis 表鎖）：有 opt.baseline 時鎖內比對（列已被他人改過 → 'saveStale'、零刪除）；procOrm del + { mustExist: true }，該列已不存在 → 'errApiRowNotFound'（先刪先贏，含不帶基準者；2026-10-23 修 E6，原回成功）；回傳形狀不變  [server/procApis.mjs:deleteApi]
                 LMDB 刪除單筆；ORM 失敗 reject('saveWriteFail')，原文入 srLog（R-ERR-1）  [server/procApis.mjs:deleteApi]
008          .then 設 okDel；.catch 設 errSave  [src/components/LayoutContentEdit.vue:doDelete]
009          okDel 為否則 return（短路）  [src/components/LayoutContentEdit.vue:doDelete]
010          $emit('deleted', { id, baseline }) → onEditDeleted：commit ApplyDeletedRow 立即自 store 移除該列（applyDeletedRow：store 列仍等於基準才移除；已不在不動；已是別的內容不移除），清 apiSelect、回 docs，genTree 重建樹（被刪節點立即消失，改選第一筆，不等推播；2026-10-23 api-run03，ADR-045）  [src/components/LayoutContentEdit.vue:doDelete][src/components/LayoutContent.vue:onEditDeleted,genTree][src/store/applyRows.mjs:applyDeletedRow]
011          先 updateLoading(false) 再成功 modal showCheckYes('已刪除')，await 至其關閉  [src/components/LayoutContentEdit.vue:doDelete]
012      .catch: 非預期例外 → updateLoading(false) 後 showCheckYes(anUnexpectedErrorOccurred, {type:'error'}) 並回傳其 Promise（ADR-031／ADR-034）；.finally: 關 loading；其後 runSubmit 釋放 'deleteApi'  [src/components/LayoutContentEdit.vue:doDelete]
```

### 草稿保護與逐列基準（E2E-006～E2E-012；2026-10-23，ADR-043，原則 10）

```
001  開啟編輯（mounted）或換筆／再點「新增」: initFromItem(item)——form、formInit（載入時快照）深拷貝自 store 列；baseline = buildBaseline([store 列], 契約) 凍結於 data（新增模式不帶）  [src/components/LayoutContentEdit.vue:initFromItem][node_modules/w-serv-orm/src/baseline.mjs:buildBaseline]
002  後端表時間戳變動 → 資料通道整表 select 重取 → store.state.apis 整份替換 → LayoutContent.changeApis 重建（genTree）  [src/main.js:recvData][src/store/mutations.mjs][src/components/LayoutContent.vue:genTree]
003      genTree 於「編輯既有列」（mode=edit 且非新增）時：以未過濾之清單找原列（搜尋只影響左樹，不換筆）；找到則 apiSelect 換成其最新複本，找不到（被他人刪除）則 apiSelect 維持原物件並設 selectGone=true（不取第一筆）  [src/components/LayoutContent.vue:genTree]
004      其餘模式（文件、測試分頁）維持原行為：選取隨搜尋結果轉移、找不到取第一筆（不改變既有畫面與標準圖）  [src/components/LayoutContent.vue:genTree]
005  LayoutContentEdit.watch.item（同 id 之新物件，無關推播亦會換物件）: onItemChange  [src/components/LayoutContentEdit.vue:onItemChange]
006      同 id → 比對該列最新摘要與凍結基準之摘要:
                 相同（無關推播、自己的存檔結果、他人改回載入時之內容）→ 不動表單與基準，已有之 remote 提示撤除  [src/components/LayoutContentEdit.vue:onItemChange]
                 不同、無未存修改（digestRow(form) = digestRow(formInit)）→ 照舊重建並重新凍結基準  [src/components/LayoutContentEdit.vue:onItemChange,isDirty]
                 不同、有未存修改 → 表單與基準不動，remote='changed' → 編輯區上方出現 .bk-stale 提示與「重新載入」鈕  [src/components/LayoutContentEdit.vue:onItemChange]
007      id 不同（使用者點選另一筆或再點「新增」）→ initFromItem（使用者主動切換，未在本批保護範圍）  [src/components/LayoutContentEdit.vue:onItemChange]
008  prop gone（selectGone）為真 → isGone：提示「此 API 已被他人刪除」、隱藏「重新載入」鈕；form 與 baseline 不動  [src/components/LayoutContentEdit.vue:isGone,staleMsg]
009  點「重新載入」→ initFromItem(最新 store 列)，提示消失  [src/components/LayoutContentEdit.vue:onClickReload]
010  儲存／刪除被拒（saveStale、errBaselineFormat、errApiRowNotFound）→ errSave 紅字 + rejected 旗標 → 同提示；form 不動（草稿保留）；其後同 id 之列重新出現（store 推播含該列）→ 解除 errApiRowNotFound 拒收狀態並重新判定  [src/components/LayoutContentEdit.vue:markRejected,onItemChange]
010a 既有列之載入資料無法自算基準（buildBaseline 拋錯: 過深巢狀、函式、非有限數字）→ baselineBroken：存檔／刪除一律不送出、errSave 顯示 errBaselineBroken（不降級為不帶基準）  [src/components/LayoutContentEdit.vue:initFromItem,submitSave,doDelete]
011  儲存成功 → emit('saved') → 回 docs；新基準不由「自己送出之值」承接，下次開啟編輯時重取自 store 列（伺服器保存之內容；含 clearXSS 改寫，如 a<b → a&lt;b）  [src/components/LayoutContentEdit.vue:submitSave]
```

### 外部列受保護（E2E-013～E2E-018；2026-10-23，ADR-044，原則 5「開了外部同步就以外部為主」）

```
001  外部匯入（POST /syncAndReplaceTabs）寫入之列必帶 srcKey（缺 srcKey 或列帶 id 整批拒收；遷移前之舊列於首次匯入命中〔批次 srcKey 等於其 id〕時補 srcKey=id）；後台不可寫 srcKey（伺服器專有欄位）→ 「外部列」＝ srcKey 為非空字串者；「外部管理之 group」＝ 該 group 內存在至少一列外部列；「混雜列」＝ 外部管理 group 內 srcKey 為空之列  [server/syncApis.mjs:newRow][src/schema/contracts/externalRows.mjs:isExternalRow,getExternalGroups,isMixedRow]
002  WWebApi 讀 opt.lockExternalRows（預設 'y'；僅 'n' 或 false 關閉，未知值維持開啟），傳入 procApis，並於 getWebInfor 回 lockExternalRows 'y'|'n' 供前端；參考部署由 settings.json 經 srv.mjs 轉入  [server/WWebApi.mjs][srv.mjs]
003  前端（lockOn＝webInfor.lockExternalRows 非 'n'）: 樹狀清單列依 store 全表算外部管理 group → 外部列旁鎖頭（ExtMark kind=lock）、混雜列旁警告（kind=warn），停留顯示 tooltip  [src/components/LayoutContent.vue:rowMark,rowMarkTip][src/components/ExtMark.vue]
004  編輯既有列且 item 為外部列（isExt）: 上方 .bk-ext 唯讀說明；fieldsExternal 之欄位（13 個輸入框＋方法唯讀框）readonly 並於標籤旁顯示鎖頭；tokens／測試設定可編；刪除鈕 disabled（pointer-events:none，使停留落在外層 WTooltip 觸發區）並以 tooltip 說明；onClickDelete 保險 return  [src/components/LayoutContentEdit.vue:isExt,onClickDelete]
005  編輯既有列且 item 為混雜列（isMixed）: 上方 .bk-ext-warn 警告，不鎖  [src/components/LayoutContentEdit.vue:isMixed]
006  新增或改群組時 errGroupLive（isBlockedByExternalGroup）: 群組欄下方 .bk-err 即時提示；submitSave 同步檢測在開 loading 之前 return（errSave＝saveExternalGroupDenied），不送出  [src/components/LayoutContentEdit.vue:errGroupLive,submitSave]
007  saveApi 修改 → lockSave → guardWrite（表鎖內新鮮讀取該列）→ write(rows): 原列為外部列 → getExternalChanged（fieldsExternal 與客戶端帶來之 srcKey 與庫內不同）非空 → reject saveExternalRowChanged；原列為後台列且 group 改成另一 group → 表鎖內 select({ group }) 新鮮讀取 → 該 group 有外部列 → reject saveExternalGroupDenied  [server/procApis.mjs:saveApi][src/schema/contracts/externalRows.mjs:getExternalChanged,isBlockedByExternalGroup]
008  saveApi 新增 → lockSave → withTabLocks(['apis']) 內 select({ group }) 新鮮讀取 → 該 group 有外部列 → reject saveExternalGroupDenied  [server/procApis.mjs:saveApi]
009  deleteApi → guardWrite write(rows): 原列為外部列 → reject deleteExternalRowDenied  [server/procApis.mjs:deleteApi]
010  拒收一律零寫入（procOrm 未被呼叫）、srLog 記 kpfun-<op>-external（事件、鍵、欄位名／原因，不記值）；rejectWrite 以 kpRejectKey 原樣轉出語系鍵  [server/procApis.mjs:rejectWrite,logExternal]
011  外部匯入不受此選項影響（照常新增／修改／刪除外部列）；刪除 srcKey 為空之列（混雜列或升版前舊同步／相容期所寫之無鍵列）時記 warn syncAndReplaceTabs-delNoSrcKey  [server/syncApis.mjs:syncApis]
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
| 多人同時編輯: 持舊畫面存檔／刪除被拒 | 找 `saveStale`（ORM 拒收鍵 baselineMismatch）| errSave inline 紅字（eng「The data has been updated by someone else, so your changes were not saved. Please reload the data and try again.」／cht「資料已被他人更新，您的變更未儲存，請重新載入資料後再操作」）+ 編輯區上方提示（E2E-007） | 存、刪共用一鍵（ADR-043） |
| 多人同時編輯: 修改／刪除時該 API 已不存在 | 找 `errApiRowNotFound`（rowNotFound）| errSave inline 紅字（eng「This API no longer exists (it may have been deleted by someone else). Please reload the data.」／cht「此 API 已不存在（可能已被他人刪除），請重新載入資料」）+ 提示（E2E-008） | 存、刪共用一鍵 |
| 存檔基準格式或版本不識 | 找 `errBaselineFormat`（baselineFormat）| errSave inline 紅字；UI 不可達——前端基準由同一契約自算（以 `api-concurrency` V13 覆蓋） | 存、刪共用一鍵 |
| 編輯中收到他人更新／刪除之推播 | 找 `staleChanged` / `staleDeleted` / `reloadData` | 編輯區上方 `.bk-stale` 提示（平時不渲染）| 更新、刪除各一鍵；重新載入鈕一鍵 |
| 既有列之載入資料無法建立存檔基準 | 找 `errBaselineBroken` | errSave inline 紅字（eng「The loaded data of this API cannot be used as a save baseline, so it cannot be saved or deleted here. Please contact the administrator.」／cht「此 API 之載入資料無法建立存檔基準，故無法於此儲存或刪除，請洽系統管理者」）（E2E-012） | 存、刪共用一鍵；前端檢測，不送後端 |
| 外部列受保護: 後台改外部列之 group／srcKey／外部擁有欄位 | 找 `saveExternalRowChanged` | errSave inline 紅字（eng「Not saved: this API is imported from an external source, so its group and the fields provided by the source cannot be changed here. Only the tokens and the test settings can be changed. …」／cht「未儲存：此 API 由外部來源匯入，其群組與外部來源提供之欄位不可在此修改，僅可修改權杖與測試設定。…」）；UI 不可達——欄位唯讀（以 `api-externalRows` 直打覆蓋） | 改欄位一鍵（ADR-044） |
| 外部列受保護: 後台刪除外部列 | 找 `deleteExternalRowDenied` | errSave inline 紅字；UI 不可達——刪除鈕停用（以 `api-externalRows` 直打覆蓋） | 刪除一鍵 |
| 外部列受保護: 在外部管理 group 新增列或把列改入 | 找 `saveExternalGroupDenied` | errSave inline 紅字（eng「Not saved: this group is managed by an external source, so APIs cannot be added to it or moved into it here …」／cht「未儲存：此群組由外部來源管理，不可在此新增 API 或把 API 改入該群組…」）；前端同步檢測先擋（E2E-014），API 直打之並行由後端回（`api-externalRows`） | 新增、改入共用一鍵 |
| 外部列受保護: 前端提示 | 找 `externalRowLocked` / `externalRowNotice` / `externalRowDeleteTip` / `externalGroupNoAdd` / `externalGroupMixedTip` / `externalGroupMixedNotice` | 樹狀清單鎖頭／警告 tooltip、編輯頁上方 `.bk-ext` 說明、刪除鈕 tooltip、群組欄 `.bk-err`（E2E-013～E2E-015；平時不渲染） | 每處一鍵；`{group}` 為來源 group |
| 鎖內讀取失敗（saveApi／deleteApi 讀該列時 ORM 失敗）| 回 `getDataError` 並記 srLog（event `kpfun-saveApi-read-orm`／`kpfun-deleteApi-read-orm`）| errSave inline 紅字；UI 不可達（單元測試以替身覆蓋） | 讀取類，非 saveWriteFail |
| 庫內讀出之主鍵缺漏或重複（rowsInvalid）| 回 `getDataError` 並記 srLog | errSave inline 紅字；UI 不可達（庫內資料異常，單元測試以替身覆蓋） | 伺服端錯誤，非重新載入能解 |
| 資料庫寫入失敗 | 找 `saveWriteFail` | errSave inline 紅字（eng「Not all changes were written, and some may have taken effect. Please reload the page and check before making changes.」／cht「資料寫入未全部完成，部分變更可能已生效，請重新整理頁面確認後再操作」）；UI 不可達——僅資料庫寫入失敗時（單元測試以模擬之 ORM 失敗覆蓋） | 存、刪共用一鍵（ADR-038） |

## 錯誤處理分層

| 層級 | 觸發 | 呈現 |
|---|---|---|
| 同步檢測 | 名稱/網址空、JSON 格式錯 | 對應欄位 inline 紅字，return 不打 API |
| 後端 reject | saveApi/deleteApi 失敗 | errSave inline 紅字，短路不關閉表單 |
| 多人同時編輯 | 持舊基準存／刪（saveStale）、該 API 已不存在（errApiRowNotFound）、基準格式不識（errBaselineFormat）| errSave inline 紅字 + 編輯區提示；保留草稿（不動 form）、提示重新載入；後端零寫入／零刪除（ADR-043）|
| 外部列受保護 | 改外部列之 group／srcKey／外部擁有欄位（saveExternalRowChanged）、刪除外部列（deleteExternalRowDenied）、在外部管理 group 新增或改入（saveExternalGroupDenied） | 前端以唯讀欄位、停用之刪除鈕、群組欄即時提示先擋（不送出）；後端同樣整次拒收、零寫入、errSave inline 紅字（ADR-044） |
| 刪除取消 | 確認對話框點「取消」 | reject('close')，靜默忽略不報錯 |
| 連按／重入 | 存／刪流程進行中（含確認框與結果訊息框開啟期間）再觸發 | 前端 runSubmit 略過（無畫面反應）；API 直打之同一使用者並行由後端回 `saveInProgress` / `deleteInProgress`（ADR-034） |
| 非預期例外 | core() 未捕捉之例外 | showCheckYes modal 兜底（type:'error'，先 updateLoading(false)）+ console.log |

## 參數來源

| 概念 | 來源（優先序）| 流程影響 |
|---|---|---|
| 編輯表單初值 | 選取的 apiSelect → editItem → initFromItem 深拷貝進 form／formInit，並對該 store 列自算 baseline（2026-10-23；原為 watch.item 深度監看覆寫） | 改名/刪除針對既有筆，帶原 id 與 baseline |
| 新增表單初值 | onClickAddApi 之 blankApi（無 id；method='get' 等預設）| 新筆走 insert，預設值兜底 |
| 後端兜底欄位 | funNew：無 id 產生新 id、時間戳、isActive='y'、authType/contentType 預設 | 確保新筆欄位完整 |
| 樹/docs 更新 | 後端 syncData 推送 → store.state.apis → genTree 重建 | 不需前端手動刷新，存/刪後即時反映 |

## spec 規則摘要（粒度 / 邊界 / 順序 / 契約）

- **驗證順序**：清空舊錯誤 → 同步檢測（全部 early-return 在開 loading 之前）→ 開 loading → 打 API（各自 catch + 旗標短路）→ 成功 emit + modal → finally 關 loading（順序屬 spec，對齊 §全域規範 5.1 core() 五段）。
- **粒度**：
  - 改名為 update（帶原 id，name 原地更新、舊名消失）；新增為 insert（無 id，funNew 產生新 id）——以「id 是否存在」分流。後端兩者皆以 procOrm 之 save 寫入；update／insert 指寫入結果，不是兩種呼叫（2026-10-14 補）。（2026-10-23 更正，ADR-043：修改加 `{ mustExist: true }`——只改不增，主鍵不存在即 `errApiRowNotFound`、零寫入；原載「主鍵不存在即新增」僅對無 id 之新增列成立，帶 id 而庫內無此列者不再被新建。）
  - 可預期錯誤走 inline 紅字（不打斷表單）；非預期走 showCheckYes modal（type:'error'，ADR-031；原載「非預期才 $alert」已不成立，2026-09-29 更正）。
- **送出入口與連按**（ADR-034）：入口為「儲存」「刪除」兩顆原生 `<button>`（輸入框不在 `<form>` 內，無 Enter 送出）。全頁 loading、確認框與結果訊息框（WDialog）只擋滑鼠、不搶焦點，焦點留在按鈕時之鍵盤 Enter／空白鍵仍觸發 click；重入一律由 `runSubmit` 判斷：儲存自觸發至結果訊息框關閉、刪除自開確認框至結果訊息框關閉，期間再觸發即略過。後端以「操作:使用者 id」占位：同一使用者並行儲存之第 2 次回 `saveInProgress`、並行刪除回 `deleteInProgress`，皆不寫入；依序送出、不同使用者皆不受影響（不同使用者之寫入由 `apis` 表鎖序列化，2026-10-23 取代局部 kmx，ADR-043）。
- **多人同時編輯**（原則 10，ADR-043；契約 `src/schema/contracts/apis.mjs`，前後端 import 同一檔）：
  - 新增：各存各的，不比對、不去重；修改：後者蓋前者，但僅限「看著最新資料改」（持新基準）或「不帶基準之寫入」（外部應用、舊版頁面，本 major 允許）；持舊畫面（基準與鎖內新鮮讀取之列摘要不同）整次拒收 `saveStale`、零寫入；刪除：先刪先贏，後刪者與修改已刪之列一律 `errApiRowNotFound`（含不帶基準者）。
  - 一表一鍵：存檔、刪除、外部匯入共用同一把 `apis` 表鎖（`WServOrm` 的 `withTabLocks`／`guardWrite`），讀取、比對、寫入在同一鎖內；`lockSave`（依使用者占位、同人重送先被拒）在外層、表鎖在內層。
  - 基準 = 該列 `[[id, 列摘要]]`（`h1`），前端以畫面所見之 store 列自算（不用表單、不向後端取雜湊）；摘要只取契約 `fields` 24 欄（數字與字串不互轉），`serverOnly` 5 欄（timeCreate／timeUpdate／isActive／userIdUpdate／srcKey）不入基準、存檔不採客戶端值；`order` 為一般欄位（可直接編輯、不重編，不設 `orderKey`）。
  - 草稿保護（前端）：編輯既有列時推播不覆寫表單、凍結載入時之基準；有未存修改時提示、存檔被拒時保留草稿並提示重新載入；原列被刪停留原畫面；搜尋與選取脫鉤（僅編輯既有列時）；存檔成功後之新基準取自伺服端（下次開啟編輯時重取 store 列），不以自己送出之值承接（clearXSS 會改寫部分字串）。
  - `procOrm` 之 `opt`（`mustExist`）只由伺服端自組，客戶端第 3 參數只讀 `baseline`；基準格式或版本不識一律 `errBaselineFormat`，不得降級為不帶基準；庫內讀出之主鍵缺漏或重複（`rowsInvalid`）屬伺服端資料錯誤，回 `getDataError` 並記 srLog。
  - 最後修改者：schema 補 `userIdUpdate`，由 `procOrm` 於 save／insert 寫入操作者（外部匯入者為 app 權杖之使用者）。
- **外部列受保護**（原則 5「開了外部同步就以外部為主」，ADR-044，選項 `lockExternalRows` 預設 `'y'`；判定 `src/schema/contracts/externalRows.mjs`，前後端 import 同一檔）：
  - 外部列＝`srcKey` 為非空字串之列（匯入寫入、後台不可寫）；外部管理之 group＝該 group 內存在外部列者；混雜列＝該 group 內 `srcKey` 為空之列。升版前尚未被匯入命中之列（舊同步寫入、1.1.14 相容期所寫之無鍵列）`srcKey` 為空，無從與後台自建者區分，一律視為後台列（不鎖）；自 2026-10-23（ADR-046）起外部匯入不再產生無鍵列。
  - 外部列：後台不可刪除（`deleteExternalRowDenied`）；不可改 `group`、`srcKey` 與外部擁有欄位（契約 `fieldsExternal` 16 欄＝`provideTabs` 的 `ks_apis` 白名單去 `srcKey`／`id`；`saveExternalRowChanged`）；可改本系統擁有欄位（契約 `fieldsLocal` 8 欄，含 `tokens`）。「改」指客戶端帶來之值與庫內不同；整列原樣送回（如編輯表單只改 tokens）不算改，缺欄不比，數字與其字串形式視為同一。外部列帶來「非空且與庫內不同」的 `srcKey` 亦算改（空值不算：持舊畫面之整列回聲，見〈已知落差〉設計事實）；後台列帶來的 `srcKey` 仍不採用也不拒（run01 A7 行為不變）。
  - 外部管理之 group：後台不可新增列、不可把列改入（`saveExternalGroupDenied`）；判定於表鎖內新鮮讀取該 group，與外部匯入同鎖（匯入先取鎖則新增於匯入完成後被拒；新增先取鎖則該列於隨後之匯入被刪，結果同樣是 group 內只有外部列）。混雜列之 group 未改者不攔（原就在其內，其他欄位照常可改、可刪）；改到另一個外部管理 group 則攔。
  - **檢查之值即寫入之值**（外審補強）：`group` 須為合法形狀（缺欄、null 或合法 Unicode 字串；陣列、數字、布林、物件、含孤立代理字元者 → `errApiRowInvalid`，僅選項開啟時檢查）；外部列通過守門後只寫 `id` 與本系統擁有欄位（外部擁有欄位已驗證與庫內相同，不再寫入，免得數字回聲與庫內舊值被 ORM 改寫）；主鍵只讀一次；group 比對用寫入後之值（字元清理）。
  - 違規整次拒收、零寫入（`procOrm` 未被呼叫）；與基準比對之先後：持舊基準者先得 `saveStale`（先動先贏），持最新基準或不帶基準者得上列拒收鍵。
  - 選項 `'n'`：回到升版前行為（後台可改可刪外部列、可在外部管理 group 新增與改入），匯入照常以外部為主；外部匯入本身不受此選項影響。
  - 混雜列「提示但不自動刪除」（原則 3）：前端於樹狀清單與編輯頁顯示警告；匯入時被刪的無來源鍵之列記 warn `syncAndReplaceTabs-delNoSrcKey`；升版前以 `node g_auditExternalRows.mjs` 盤點。下次匯入的行為不變（run01 D6）：批次 `srcKey` 未等於其 `id` 者被刪，等於其 `id` 者保留並補 `srcKey = id`（2026-10-23 ADR-046 由「以 `id` 列入」更正為「`srcKey` 等於其 `id`」）。
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
- **本 spec 原載「無 id 故走 insert」不成立（設計事實（記錄備查）；發現於 2026-10-14）**：新增流程 007 原載「funNew 產生新 id…；無 id 故走 insert」，實為 `saveApi` 對新列與既有列皆以 `procOrm(userId, 'apis', 'save', [o])` 寫入，新列因 `funNew` 產生新 id 而成為新增（`server/procApis.mjs:saveApi`）。使用者可觀察之後果：無（畫面與流程不變）。層級：產品程式碼（本專案）。處置：新增流程 007 改寫；規則摘要補「update／insert 指寫入結果」。
- **資料庫寫入失敗時回 ORM 之英文原文（已修復（附修復紀錄）；發現於 2026-10-14，2026-10-14 修復）**：w-serv-orm 1.1.x 之 `procOrm` 失敗以英文字串拒絕（如 `failed to save data`、`failed to delete data`），`saveApi`／`deleteApi` 原樣回前端，`$transErr` 查無此鍵。使用者可觀察之後果：儲存或刪除遇資料庫寫入失敗時，紅字不是語系文字。層級：產品程式碼（本專案）。修復紀錄：①本專案 2026-10-14（ADR-038 第 4 項，主控複審裁決 F8）；②`server/ormErrKey.mjs:ormFail`，套用於 `server/procApis.mjs:saveApi`／`deleteApi`／`getApisList`——寫入失敗回 `saveWriteFail`、讀取失敗回 `getDataError`，原文入 srLog；③後端程式不經前端產物，`saveWriteFail` 之文字由 `server/procLang.mjs` 經 kpLang 下發；④UI 不可達（正常操作造不出資料庫寫入失敗），以 `test/unit-procApis.test.mjs` 之「雙擊防護: procOrm 失敗時回 saveWriteFail」與「getApisList 之 procOrm 失敗 → 回 getDataError」驗證（修正前之模組為紅）；⑤無案例與標準圖受影響；⑥無轉交。
- **已修復（附修復紀錄）：多人同時編輯之缺陷（發現於 2026-10-22 inv01 探測，2026-10-23 修復，ADR-043）**：①E5 修改已被刪除之列使其復活（含從未存在之 id，E5b）；②E6 刪除不存在之列仍回成功；③E7 編輯中收到推播（無關列、同一列、列被刪）或於搜尋框輸入即重建表單，草稿靜默丟棄，原列被刪時編輯器換成列表第一筆（A6、P1～P4）；④A3 舊畫面存檔靜默回寫外部同步之新值；⑤A1／A2 外部同步不取鎖、存檔與刪除異鍵不互斥（刪除成功後被延遲中之存檔復活）；⑥A4 無最後修改者；⑦A7 `saveApi` 採客戶端 `timeCreate`（可偽造）。使用者可觀察之後果：他人刪除後的舊畫面存檔使列復活；編輯到一半的內容因他人更新或自己搜尋而消失；用舊畫面存檔蓋掉他人／外部的更新。層級：產品程式碼（本專案）。修復紀錄：①本專案 2026-10-23（排程第 112 項）；②後端 `server/procApis.mjs`（`guardWrite`、`withTabLocks`、`mustExist`、`pickWriteRow`）、契約 `src/schema/contracts/apis.mjs`、schema 補 `userIdUpdate`、前端 `LayoutContent.vue`（genTree）／`LayoutContentEdit.vue`（initFromItem、onItemChange、提示）；③後端程式不經前端產物，前端變更需重建 dist（已建置）；④證據：`test/api-concurrency.test.mjs`（E5～E6、A1～A4、A7、V1、V3、V5～V7、V9、V10、V13、V14）、`test/unit-procApis.test.mjs`、`test/unit-contract.test.mjs`、`test/e2e-concurrent.test.mjs`（E7、A6、V10、V11）；修前紅：同一批測試對 HEAD 之 `server/`、`src/` 全紅（見 `sgud/rule/rulebook_concurrency.md` §6）；⑤新增案例 E2E-006～E2E-010 與新標準圖 `test/pics/conc/`，既有案例與標準圖 0 張改變；⑥無轉交。
- **已修復（附修復紀錄）：外部匯入之缺陷（發現於 2026-10-22，2026-10-23 修復，ADR-043，原則 11）**：①E8 同步相同內容重送，未帶 id 之列內部 id 全換；②C4b 同步把本站編輯表單管理之 8 欄（tokens／authType／authConfigJson／testBaseUrl／default*Json／contentType）清成空字串；③A5 同步重設 `timeCreate`；④ADR-016 `delAll`＋`insert` 非原子。使用者可觀察之後果：每次同步使後台編輯過的金鑰、認證與測試設定消失；內部 id 每次改變。層級：產品程式碼（本專案）。修復紀錄：①本專案 2026-10-23；②`server/syncApis.mjs`（`srcKey` 差異同步、欄位歸屬、補償）；③`provideTabs` 白名單加 `srcKey`；④證據：`test/api-import.test.mjs`（I1～I14）、`test/unit-syncApis.test.mjs`；⑤無 e2e 案例受影響；⑥無轉交。
- **設計事實（記錄備查）：外部匯入之不提供相容、一次性遷移與同群組後台列（2026-10-23，ADR-043；①於同日 run04 更正〔ADR-046〕）**：①**不提供呼叫端相容（使用者 2026-10-23 裁示）**：`srcKey` 即刻必填，缺 `srcKey`（含只送 `id`）整批拒收 `errRowInvalid`、列帶 `id` 整批拒收 `idNotAllowed`、零寫入；〔原載「現行 major：列未給 `srcKey` 而給 `id` 者以 `id` 為來源鍵並記警告 `syncAndReplaceTabs-idAsSrcKey`；兩者皆無則該列每次新增並記警告 `syncAndReplaceTabs-noSrcKey`；下一 major 起 `srcKey` 必填（相容做法為主控建議，使用者尚未確認）」不成立：已移除，見 ADR-046〕；保留者僅一次性資料遷移：既有外部列無 `srcKey` 者，批次 `srcKey` 等於其 `id` 時視為同一列、於鎖內補上 `srcKey = id`（`id` 不變，不計入 `nUpdate`）。②`group` 為外部來源之統一管理鍵（schema 註解）：後台在外部 group 內自建之列（`srcKey` 空），其有效來源鍵為其 `id`，批次 `srcKey` 未等於其 `id` 者於下次該 group 匯入時被刪（與改造前 `delAll({ group })` 同）。③匯入回應為 `{ nAdd, nUpdate, nDel, nSame }`（原回 insert 結果 `[{ id }]`）。
- **設計事實（記錄備查）：列以同一 id 重新出現之前端規則無使用者路徑可觸發（2026-10-23，ADR-046）**：E2E-008 末段所驗「曾被回已不存在之列以同一 `id` 重新出現 → 解除拒收狀態」（sol#13，R-CONC-06）原由外部匯入以 `id` 代替來源鍵造成；外部不得送 `id` 後，匯入不能使已刪之列以原 `id` 重現。該規則留為防禦性規則（同步空窗後回來等），測試以直接寫庫模擬由備份還原。使用者可觀察之後果：外部匯入同內容之列會是新列（新 `id`），不會使已刪之舊列復活。
- **設計事實（記錄備查）：升級前限制（2026-10-23，ADR-043）**：已開啟之舊版頁面與外部應用不帶基準，本 major 允許（仍取表鎖、只改不增、本系統擁有欄位不被匯入寫）；舊版頁面不受草稿保護（升級前限制，重新整理後即生效）。下一 major 後台必帶基準（未帶即拒收）。
- **設計事實（記錄備查）：搜尋與選取脫鉤僅在編輯既有列時生效（2026-10-23，ADR-043）**：文件、測試分頁維持「搜尋結果不含目前選取者即改選第一筆」，以免改變展示流程 E2E-003 之畫面與既有標準圖。
- **已修復（附修復紀錄）：後台可改可刪外部列（原標待裁示；2026-10-23 發現，同日由使用者裁示之原則 5 定案並修復，ADR-044）**：外部匯入規格第 7 節要求「外部列（`srcKey` 非空）後台不可刪除、不可改身分欄與外部擁有欄位」，run01 範圍未含，現況後台可改可刪外部列，下次匯入以外部為主覆蓋；後台在外部 group 內自建之列則於下次匯入被刪（run01 D6）。使用者可觀察之後果：系統管理者改了外部列的名稱或說明、或在外部 group 新增 API，下次匯入就被還原或移除，而畫面沒有任何預先提示。層級：產品程式碼（本專案）。修復紀錄：①本專案 2026-10-23（排程第 112 項 run02）；②後端 `server/procApis.mjs`（表鎖內以新鮮讀取之庫內原列判定）、共用判定 `src/schema/contracts/externalRows.mjs`、選項 `opt.lockExternalRows`（`server/WWebApi.mjs`、`srv.mjs`）、語系鍵 `server/procLang.mjs`、前端 `LayoutContentEdit.vue`／`LayoutContent.vue`／`ExtMark.vue`；③前端變更需重建 dist（e2e 啟動時建置）；④證據：`test/unit-externalRows.test.mjs`、`test/unit-procApis-external.test.mjs`、`test/api-externalRows.test.mjs`、`test/e2e-external.test.mjs`（E2E-013～E2E-018）；修前紅：同一批測試對修前之 `server/` 複本全紅（見 `sgud/rule/rulebook_backend.md` R-EXT-LOCK-01）；⑤新增案例 E2E-013～E2E-018 與新標準圖 `test/pics/ext/`，既有案例與標準圖 0 張改變；⑥無轉交。
- **設計事實（記錄備查）：外部列判定與混雜資料（2026-10-23，ADR-044）**：外部列以 `srcKey` 非空判定。升版前尚未被匯入命中之列（舊同步寫入、相容期所寫之無鍵列）`srcKey` 為空，無從與後台自建者區分，視為後台列（不鎖）——要得到保護請外部端以其 `id` 作為 `srcKey` 匯入一次（README Upgrade Notes；2026-10-23 ADR-046 起外部匯入不再產生無鍵列）。外部管理 group 內既有之後台列（混雜列）不鎖、不自動刪除，但下次匯入批次 `srcKey` 未等於其 `id` 者被刪；前端警告、匯入記 warn、升版前以 `g_auditExternalRows.mjs` 盤點。使用者可觀察之後果：混雜列可編輯、可刪除，但可能於下次匯入消失。
- **設計事實（記錄備查）：`srcKey` 之處置（2026-10-23，ADR-044）**：`srcKey` 為伺服器專有欄位，客戶端值一律不採用。外部列帶來「非空且與庫內不同」之 `srcKey` 整次拒收（企圖改身分欄）；後台列帶來之 `srcKey` 不採用也不拒（run01 A7，`api-concurrency` A7 不變）；**空值（缺欄／null／空字串）一律不算**——持舊畫面之整列回聲帶載入當時之 `srcKey`，列於載入後才被匯入補上 `srcKey`（空 → id）時回聲為空字串，算改則「只改了權杖」之存檔被誤拒（`api-concurrency` V5 暴露，原實作將空字串算改，已修）。使用者可觀察之後果：該情形下編輯頁因 store 更新而轉為唯讀顯示，已輸入之權杖仍可儲存。
