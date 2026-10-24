import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import iseobj from 'wsemi/src/iseobj.mjs'

let kpLang = {

    csIng: {
        eng: 'Connecting...',
        cht: '連線中...',
    },
    csLogin: {
        eng: 'Logged in',
        cht: '已登入',
    },
    csLogout: {
        eng: 'Logged out',
        cht: '已登出',
    },
    csErrConn: {
        eng: 'Unable to connect',
        cht: '無法連線',
    },
    csErrLogin: {
        eng: 'Login denied',
        cht: '拒絕登入',
    },
    csErrNotAdmin: { //後台登入檢查回 errUserNotAdmin 時之連線狀態文字(R-ADMINONLY-01); 未登入畫面走前端 mUI kpFallback 同鍵
        eng: 'No permission to enter the API management console',
        cht: '無權進入 API 管理後台',
    },

    systemMessage: {
        eng: 'System message',
        cht: '系統確認訊息',
    },
    ok: {
        eng: 'OK',
        cht: '確認',
    },
    treeRootAll: {
        eng: 'All',
        cht: '全部',
    },
    no: {
        eng: 'No',
        cht: '取消',
    },
    yes: {
        eng: 'Yes',
        cht: '確定',
    },

    empty: {
        eng: 'Empty',
        cht: '無',
    },
    waitingData: {
        eng: 'Waiting data...',
        cht: '等待數據中...',
    },

    id: {
        eng: `Id`,
        cht: `主鍵`,
    },
    save: {
        eng: `Save`,
        cht: `儲存`,
    },
    close: {
        eng: `Close`,
        cht: `關閉`,
    },
    delete: {
        eng: `Delete`,
        cht: `刪除`,
    },
    cancel: {
        eng: `Cancel`,
        cht: `取消`,
    },

    processing: {
        eng: `Processing...`,
        cht: `處理中請稍後...`,
    },
    anUnexpectedErrorOccurred: {
        eng: `An unexpected error occurred, please contact the administrator`,
        cht: `發生非預期錯誤，請洽管理員`,
    },

    username: {
        eng: `Username`,
        cht: `使用者姓名`,
    },
    email: {
        eng: `Email`,
        cht: `電子郵件`,
    },
    name: {
        eng: `Name`,
        cht: `名稱`,
    },
    description: {
        eng: `Description`,
        cht: `說明`,
    },
    // noDescription: {
    //     eng: `No description`,
    //     cht: `無說明`,
    // },

    menuTreeShow: {
        eng: 'Show API list',
        cht: '顯示API清單',
    },
    menuTreeHide: {
        eng: 'Hide API list',
        cht: '隱藏API清單',
    },
    menuUser: { //上方標題列窄版漢堡按鈕之無障礙名稱(aria-label), 其選單內含當前登入者資訊/語系切換
        eng: 'User menu',
        cht: '使用者選單',
    },
    language: { //上方標題列窄版選單內語系切換列之標籤
        eng: 'Language',
        cht: '語系',
    },

    noSelectApi: {
        eng: 'No Select',
        cht: '尚未選擇API',
    },
    tokens: {
        eng: 'Tokens',
        cht: '授權金鑰',
    },
    apiUrl: {
        eng: 'API url',
        cht: 'API網址',
    },
    version: {
        eng: 'Version',
        cht: '版本',
    },
    levels: {
        eng: 'Levels',
        cht: '所屬階層',
    },
    keywords: {
        eng: 'Keywords',
        cht: '關鍵字',
    },
    state: {
        eng: 'State',
        cht: '狀態',
    },
    timeCreate: {
        eng: 'Create time',
        cht: '創建時間',
    },
    timeUpdate: {
        eng: 'Update time',
        cht: '更新時間',
    },
    creator: {
        eng: 'Creator',
        cht: 'API創建者',
    },
    dataSource: {
        eng: 'Source',
        cht: '資料提供者',
    },
    isActive: {
        eng: 'Active',
        cht: '有效',
    },
    mdInputParams: {
        eng: 'Input',
        cht: '輸入參數資訊或結構',
    },
    inputExample: {
        eng: 'Input example',
        cht: '輸入範例',
    },
    mdOutputParams: {
        eng: 'Output',
        cht: '回傳數據結構',
    },
    outputExample: {
        eng: 'Output example',
        cht: '回傳數據範例',
    },

    //--- API 管理（展示/編輯/測試）---

    docInput: {
        eng: 'Input',
        cht: '輸入參數',
    },
    docOutputFields: {
        eng: 'Output fields',
        cht: '回傳欄位',
    },
    docRequest: {
        eng: 'Request',
        cht: '請求',
    },

    tabDocs: {
        eng: 'Docs',
        cht: '文件',
    },
    tabEdit: {
        eng: 'Edit',
        cht: '編輯',
    },
    tabTest: {
        eng: 'Test',
        cht: '測試',
    },

    //左側垂直主選單
    mmApi: {
        eng: 'API',
        cht: 'API',
    },
    mmStaInfor: {
        eng: 'Statistics',
        cht: '統計資訊',
    },

    //統計資訊頁
    statisticsInformation: {
        eng: 'Statistics Information',
        cht: '統計資訊',
    },
    statisticsInformationDescription: {
        eng: 'Frequency of backend logged events (APIs, kpFunExt, connection verification).',
        cht: '後端各事件（API、kpFunExt、連線驗證）之發生頻率統計。',
    },
    eventStatsTable: {
        eng: 'Event Statistics',
        cht: '事件統計表',
    },
    colEvent: {
        eng: 'Event',
        cht: '事件',
    },
    colRecent1day: {
        eng: 'Last 1 day',
        cht: '最近1日',
    },
    colRecent8hr: {
        eng: 'Last 8 hr',
        cht: '最近8時',
    },
    colRecent4hr: {
        eng: 'Last 4 hr',
        cht: '最近4時',
    },
    colRecent1hr: {
        eng: 'Last 1 hr',
        cht: '最近1時',
    },
    timeRange: {
        eng: 'Time range',
        cht: '時間範圍',
    },
    selectItem1hr: {
        eng: '1 hour',
        cht: '1小時',
    },
    selectItem4hr: {
        eng: '4 hours',
        cht: '4小時',
    },
    selectItem8hr: {
        eng: '8 hours',
        cht: '8小時',
    },
    selectItem1day: {
        eng: '1 day',
        cht: '1天',
    },
    noStaData: {
        eng: 'No statistics data',
        cht: '尚無統計資料',
    },
    getDataError: {
        eng: 'Failed to get data',
        cht: '取得資料失敗',
    },

    //保留供日後擴充之 UI 標籤鍵（目前無 $t 引用，先以註解保留；需用時取消註解並於對應元件加 $t）。
    //eventFrequency/countTotal/showIndividually 為統計頁可能擴充之標籤；editApiTitle/resStatus 值為依用途重建之起始值，啟用時請確認。
    // eventFrequency: { eng: 'Event Frequency', cht: '事件發生頻率' },
    // countTotal: { eng: 'Total', cht: '總次數' },
    // showIndividually: { eng: 'Show individually', cht: '個別顯示' },
    // editApiTitle: { eng: 'Edit API', cht: '編輯API' },
    // resStatus: { eng: 'Status', cht: '狀態碼' },

    addApi: {
        eng: 'New API',
        cht: '新增API',
    },
    confirmDeleteApi: {
        eng: 'Are you sure you want to delete this API?',
        cht: '確定要刪除此API？',
    },
    saveSuccess: {
        eng: 'Saved',
        cht: '已儲存',
    },
    deleteSuccess: {
        eng: 'Deleted',
        cht: '已刪除',
    },
    searchApiPlaceholder: {
        eng: 'Search API...',
        cht: '搜尋API...',
    },

    fieldMethod: {
        eng: 'Method',
        cht: '方法',
    },
    fieldGroup: {
        eng: 'Group',
        cht: '群組',
    },
    fieldOrder: {
        eng: 'Order',
        cht: '順序',
    },
    fieldTestBaseUrl: {
        eng: 'Test base URL',
        cht: '測試基底網址',
    },
    fieldAuthType: {
        eng: 'Auth type',
        cht: '認證類型',
    },
    fieldAuthConfigJson: {
        eng: 'Auth config (JSON)',
        cht: '認證設定(JSON)',
    },
    fieldDefaultHeadersJson: {
        eng: 'Default headers (JSON)',
        cht: '預設標頭(JSON)',
    },
    fieldDefaultQueryJson: {
        eng: 'Default query (JSON)',
        cht: '預設查詢參數(JSON)',
    },
    fieldDefaultBodyJson: {
        eng: 'Default body (JSON)',
        cht: '預設請求內容(JSON)',
    },
    fieldContentType: {
        eng: 'Content type',
        cht: '內容類型',
    },

    hintTestBaseUrl: {
        eng: 'Fallback request URL, used only when API url is empty. e.g. https://api.example.com',
        cht: '送請求的後備網址：「API url」有填則優先，留空時才用此值。範例：https://api.example.com',
    },
    hintAuthType: {
        eng: 'Auth auto-applied when sending. none = none; bearer / apikey / basic are built from the Auth config below.',
        cht: '送出時自動帶入的認證方式。none＝不帶；bearer / apikey / basic 依下方「認證設定(JSON)」組出。',
    },
    hintAuthConfigJson: {
        eng: 'JSON by auth type:\nbearer → {"token":"your-token"}\napikey → {"name":"X-API-Key","value":"your-key","in":"header"}  (in: header or query)\nbasic → {"username":"user","password":"pass"}',
        cht: '依認證類型填 JSON：\nbearer → {"token":"你的token"}（留空則退用上方 tokens 欄第一個）\napikey → {"name":"X-API-Key","value":"你的key","in":"header"}（in 可為 header 或 query）\nbasic → {"username":"帳號","password":"密碼"}',
    },
    hintDefaultHeadersJson: {
        eng: 'Default request headers, a JSON object. e.g. {"Accept":"application/json"}',
        cht: '預設請求標頭，JSON 物件。範例：{"Accept":"application/json"}',
    },
    hintDefaultQueryJson: {
        eng: 'Default query params, a JSON object. e.g. {"page":"1","size":"20"}',
        cht: '預設查詢參數，JSON 物件。範例：{"page":"1","size":"20"}',
    },
    hintDefaultBodyJson: {
        eng: 'Default request body (for POST/PUT); falls back to Input example if empty. e.g. {"name":"foo"}',
        cht: '預設請求內容（POST/PUT 用），留空則退用「輸入範例」。範例：{"name":"小明"}',
    },
    hintContentType: {
        eng: 'Request content type, added as a Content-Type header. e.g. application/json',
        cht: '請求內容類型，會帶成 Content-Type 標頭。範例：application/json',
    },

    authNone: {
        eng: 'None',
        cht: '無',
    },
    authBearer: {
        eng: 'Bearer token',
        cht: 'Bearer token',
    },
    authApikey: {
        eng: 'API key',
        cht: 'API key',
    },
    authBasic: {
        eng: 'Basic',
        cht: 'Basic',
    },

    secBasic: {
        eng: 'Basic',
        cht: '基本資訊',
    },
    secDocs: {
        eng: 'Documentation',
        cht: '文件說明',
    },
    secTest: {
        eng: 'Test settings',
        cht: '測試設定',
    },

    reqSend: {
        eng: 'Send',
        cht: '送出請求',
    },
    reqUrlPlaceholder: {
        eng: 'Request URL',
        cht: '請求網址',
    },
    reqQuery: {
        eng: 'Query params',
        cht: '查詢參數',
    },
    reqHeaders: {
        eng: 'Headers',
        cht: '標頭',
    },
    reqBody: {
        eng: 'Body',
        cht: '請求內容',
    },
    reqAddRow: {
        eng: 'Add',
        cht: '新增一列',
    },
    colKey: {
        eng: 'Key',
        cht: '鍵',
    },
    colValue: {
        eng: 'Value',
        cht: '值',
    },
    colOn: {
        eng: 'On',
        cht: '啟用',
    },

    resTitle: {
        eng: 'Response',
        cht: '回應',
    },
    resTime: {
        eng: 'Time',
        cht: '耗時',
    },
    resHeaders: {
        eng: 'Response headers',
        cht: '回應標頭',
    },
    resBody: {
        eng: 'Response body',
        cht: '回應內容',
    },
    resEmpty: {
        eng: 'No response yet. Click Send to test.',
        cht: '尚無回應，點擊送出請求進行測試。',
    },

    valRequired: {
        eng: 'This field is required',
        cht: '此欄位必填',
    },
    valInvalidJson: {
        eng: 'Invalid JSON format',
        cht: 'JSON格式錯誤',
    },

    //後端錯誤 err-key（後端 reject 此 key、srLog 此 key；前端依當前 lang 反查下列文字顯示）
    errReqUrlInvalid: {
        eng: 'The request URL is invalid (must start with http:// or https://)',
        cht: '請求網址無效（須以 http:// 或 https:// 開頭）',
    },
    errReqTargetNotAllowed: {
        eng: 'The target address is not allowed',
        cht: '目標位址不被允許',
    },
    errProxyRequestFailed: {
        eng: 'The request failed to send',
        cht: '請求發送失敗',
    },
    errApiRowInvalid: {
        eng: 'Invalid API data',
        cht: 'API 資料無效',
    },
    errApiIdInvalid: {
        eng: 'Invalid API id',
        cht: 'API id 無效',
    },
    //多人同時編輯（原則 10; w-serv-orm baseline 拒收鍵 → 本套件語系鍵, 一律提示重新載入）
    //saveStale ← baselineMismatch（先動先贏: 載入後已有人新增、修改或刪除）; errApiRowNotFound ← rowNotFound（修改或刪除時該 API 已不存在）; errBaselineFormat ← baselineFormat（存檔基準格式或版本不識）
    saveStale: { //key 無 err 前綴為四專案共用名（同 saveInProgress; perm 亦用 saveStale）
        eng: 'The data has been updated by someone else, so your changes were not saved. Please reload the data and try again.',
        cht: '資料已被他人更新，您的變更未儲存，請重新載入資料後再操作',
    },
    errApiRowNotFound: {
        eng: 'This API no longer exists (it may have been deleted by someone else). Please reload the data.',
        cht: '此 API 已不存在（可能已被他人刪除），請重新載入資料',
    },
    errBaselineFormat: {
        eng: 'The save baseline is invalid or unsupported. Please reload the page and try again.',
        cht: '存檔基準格式不符或版本不支援，請重新載入頁面後再操作',
    },
    errBaselineBroken: { //前端：既有列無法自算載入基準（如舊資料含過深巢狀值）→ 不得改用不帶基準存檔（會靜默覆寫他人更新）
        eng: 'The loaded data of this API cannot be used as a save baseline, so it cannot be saved or deleted here. Please contact the administrator.',
        cht: '此 API 之載入資料無法建立存檔基準，故無法於此儲存或刪除，請洽管理者',
    },
    //草稿保護（編輯中收到他人更新之推播: 不覆寫表單、凍結載入時之基準, 提示）
    staleChanged: {
        eng: 'This API has been updated by someone else. Your edits are kept, but saving will be rejected until you reload.',
        cht: '此 API 已被他人更新。您的編輯內容已保留，但重新載入前儲存會被拒絕',
    },
    staleDeleted: {
        eng: 'This API has been deleted by someone else. Your edits are kept here, but it can no longer be saved or deleted.',
        cht: '此 API 已被他人刪除。您的編輯內容保留於此，但已無法儲存或刪除',
    },
    reloadData: {
        eng: 'Reload',
        cht: '重新載入',
    },
    //外部列受保護（原則 5「開了外部同步就以外部為主」; opt.lockExternalRows; ADR-044, R-EXT-LOCK-01）
    //後端拒收鍵: saveExternalRowChanged（改了外部列之 group／srcKey／外部擁有欄位）、deleteExternalRowDenied（刪除外部列）、saveExternalGroupDenied（在外部管理之 group 新增列或把列改入）; 皆整次拒收、零寫入
    //前端提示: externalRowLocked（鎖頭 tooltip）、externalRowNotice（外部列編輯頁上方）、externalRowDeleteTip（刪除鈕停用之說明）、externalGroupNoAdd（群組欄即時提示）、
    //  externalGroupMixedTip／externalGroupMixedNotice（外部管理 group 內無來源鍵之混雜列: 樹狀清單標記與編輯頁上方，說明下次匯入之行為）; {group} 為來源 group
    saveExternalRowChanged: {
        eng: 'Not saved: this API is imported from an external source, so its group and the fields provided by the source cannot be changed here. Only the tokens and the test settings can be changed. Nothing was changed. Please change it at the external source.',
        cht: '未儲存：此 API 由外部來源匯入，其群組與外部來源提供之欄位不可在此修改，僅可修改權杖與測試設定。資料未變更，請至外部來源端處理。',
    },
    deleteExternalRowDenied: {
        eng: 'Not deleted: this API is imported from an external source and cannot be deleted here. Nothing was changed. Please remove it at the external source.',
        cht: '未刪除：此 API 由外部來源匯入，不可在此刪除。資料未變更，請至外部來源端處理。',
    },
    saveExternalGroupDenied: {
        eng: 'Not saved: this group is managed by an external source, so APIs cannot be added to it or moved into it here (the next import would remove them). Nothing was changed. Please choose another group.',
        cht: '未儲存：此群組由外部來源管理，不可在此新增 API 或把 API 改入該群組（下次匯入時會被移除）。資料未變更，請改用其他群組。',
    },
    externalRowLocked: {
        eng: 'Imported from external source "{group}". Read-only here.',
        cht: '由外部來源「{group}」匯入，於此為唯讀。',
    },
    externalRowNotice: {
        eng: 'This API is imported from external source "{group}". Its group and the fields provided by the source are read-only and it cannot be deleted here; you can still change the tokens and the test settings.',
        cht: '此 API 由外部來源「{group}」匯入。其群組與外部來源提供之欄位於此為唯讀且不可刪除，仍可修改權杖與測試設定。',
    },
    externalRowDeleteTip: {
        eng: 'Imported from an external source, so it cannot be deleted here.',
        cht: '由外部來源匯入，不可在此刪除。',
    },
    externalGroupNoAdd: {
        eng: 'Group "{group}" is managed by an external source. APIs cannot be added to it or moved into it here.',
        cht: '群組「{group}」由外部來源管理，不可在此新增 API 或把 API 改入。',
    },
    externalGroupMixedTip: {
        eng: 'Group "{group}" is managed by an external source and this API has no source key, so the next import removes it unless the import lists it by its id.',
        cht: '群組「{group}」由外部來源管理，而此 API 無來源鍵，下次匯入若未以其 id 列入，它會被移除。',
    },
    externalGroupMixedNotice: {
        eng: 'Group "{group}" is managed by an external source and this API has no source key. The next import removes it unless the import lists it by its id. Move it to another group to keep it.',
        cht: '群組「{group}」由外部來源管理，而此 API 無來源鍵。下次匯入若未以其 id 列入，此 API 會被移除；可將它改到其他群組以保留。',
    },
    //雙擊防護（後端依使用者占位，server/lockSave.mjs，ADR-034）：同一使用者之同一操作處理中再送出。
    //key 無 err 前綴為四專案（sso／perm／api／task）共用名；saveApi 回 saveInProgress、deleteApi 回 deleteInProgress、proxyRequest 回 requestInProgress
    saveInProgress: {
        eng: 'The previous save is still in progress. Please do not submit again.',
        cht: '上一次儲存仍在處理中，請勿重複送出',
    },
    deleteInProgress: {
        eng: 'The previous deletion is still in progress. Please do not submit again.',
        cht: '上一次刪除仍在處理中，請勿重複送出',
    },
    requestInProgress: {
        eng: 'The previous request is still in progress. Please do not submit again.',
        cht: '上一個請求仍在處理中，請勿重複送出',
    },
    errUserIdMissing: {
        eng: 'Unable to get user id',
        cht: '無法取得使用者 id',
    },
    errUserEmailMissing: {
        eng: 'Unable to get user email',
        cht: '無法取得使用者 email',
    },
    errUserNameMissing: {
        eng: 'Unable to get user name',
        cht: '無法取得使用者名稱',
    },
    errUserRoleMissing: {
        eng: 'Unable to get user role',
        cht: '無法取得使用者權限',
    },
    errUserNoPermission: {
        eng: 'User does not have permission',
        cht: '使用者沒有權限',
    },
    errUserNotAdmin: { //非系統管理員(getUserByToken 所回 isAdmin 非 'y')進入後台或資料通道之固定錯誤鍵(R-ADMINONLY-01)
        eng: 'Only system administrators can use the API management console',
        cht: '僅系統管理員可使用 API 管理後台',
    },
    errUserNotFound: {
        eng: 'Unable to find user from token',
        cht: '無法依 token 找到使用者',
    },
    errPayloadInvalid: {
        eng: 'Invalid request payload',
        cht: '請求內容無效',
    },
    errGroupInvalid: {
        eng: 'Invalid group',
        cht: '群組無效',
    },
    errRowsInvalid: {
        eng: 'Invalid rows',
        cht: '資料列無效',
    },
    errRowInvalid: { //syncAndReplaceTabs 逐列檢核：某列非物件、缺必填欄位或來源鍵不合規則（＝規格之 srcKeyInvalid; 列索引、欄位名與原因入 srLog；來源鍵 srcKey 規則 R-SYNC-1／R-IMPORT-01，ADR-038、ADR-043、ADR-046）
        eng: 'Invalid row data (each row must be an object with name, url and srcKey; srcKey is required and must be a non-empty string with no HTML markup, be at most 1978 bytes and be unique in the batch)',
        cht: '列資料無效（每列須為物件且 name、url 與 srcKey 必填；srcKey 須為非空字串、不得含 HTML 標記、不得超過 1978 位元組且同批不得重複）',
    },
    idNotAllowed: { //syncAndReplaceTabs：外部批次之列帶 id → 整批拒收、零寫入（內部 id 由本系統產生，外部不得指定；規格 §9，ADR-046）
        eng: 'The id field is not allowed in imported rows (the internal id is generated by the system; identify each row with srcKey)',
        cht: '匯入之列不得帶 id（內部 id 由系統產生；請以 srcKey 識別各列）',
    },
    saveWriteFail: { //ORM 寫入失敗（save／insert／del），部分變更可能已生效；procOrm 之原文只入 srLog（R-ERR-1，ADR-038；用語同 w-web-sso）
        eng: 'Not all changes were written, and some may have taken effect. Please reload the page and check before making changes.',
        cht: '資料寫入未全部完成，部分變更可能已生效，請重新整理頁面確認後再操作',
    },
    errTokenNoPermission: {
        eng: 'Token does not have permission',
        cht: 'token 沒有權限',
    },
    errKeyTableInvalid: {
        eng: 'Invalid table',
        cht: '資料表無效',
    },
    errTimeLengthInvalid: {
        eng: 'Invalid time length',
        cht: '時間長度無效',
    },

}

let init = (opt = {}) => {

    //kpLangExt
    let kpLangExt = get(opt, 'kpLangExt')
    if (!iseobj(kpLangExt)) {
        kpLangExt = {}
    }

    //webName
    let webName = get(opt, 'webName')
    if (!iseobj(webName)) {
        webName = {}
    }

    //webDescription
    let webDescription = get(opt, 'webDescription')
    if (!iseobj(webDescription)) {
        webDescription = {}
    }

    //kp
    let kp = {}

    //kpLang
    kp = {
        ...kp,
        ...kpLang,
    }

    //ext kpLangExt
    if (iseobj(kpLangExt)) {
        // console.log('kpLangExt', kpLangExt)
        kp = {
            ...kp,
            ...kpLangExt,
        }
    }

    //webName
    if (iseobj(webName)) {
        // console.log('webName', webName)
        kp = {
            ...kp,
            webName: {
                ...webName,
            },
        }
    }

    //webDescription
    if (iseobj(webDescription)) {
        // console.log('webDescription', webDescription)
        kp = {
            ...kp,
            webDescription: {
                ...webDescription,
            },
        }
    }

    let langs = [
        'eng',
        'cht',
    ]

    let r = {}
    each(langs, (lang) => {

        //kpText
        let kpText = {}
        each(kp, (v, k) => {
            kpText[k] = v[lang]
        })
        // console.log('kpText', kpText)

        //save
        r[lang] = kpText

    })
    // console.log('r', r)

    return r
}

export default init
