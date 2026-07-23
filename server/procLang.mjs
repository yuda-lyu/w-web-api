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


    systemMessage: {
        eng: 'System message',
        cht: '系統確認訊息',
    },
    ok: {
        eng: 'OK',
        cht: '確認',
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
    selectEvents: {
        eng: 'Select events',
        cht: '選擇事件',
    },
    selectAll: {
        eng: 'All',
        cht: '全選',
    },
    selectNone: {
        eng: 'Clear',
        cht: '清除',
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
    errTokenNoPermission: {
        eng: 'Token does not have permission',
        cht: 'token 沒有權限',
    },
    errKeyTableInvalid: {
        eng: 'Invalid table',
        cht: '資料表無效',
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
