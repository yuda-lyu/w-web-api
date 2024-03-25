import each from 'lodash-es/each.js'
import set from 'lodash-es/set.js'
import * as types from './types.mjs'
import ds from '../schema/index.mjs'


//state, 全域狀態
let state = {

    hostname: `${window.location.origin}`,
    webInfor: {},
    connState: '連線中...',
    syncState: false,
    viewState: 'lists',
    loading: false,
    settings: {
        leftDrawerWidth: 200,
    },

    heightApp: 0,
    heightAppEff: 0,
    heightToolbar: 60,

    menu: {}, //初始值需為物件, 否則LayoutContent會取menu.key出錯

    userToken: '',
    user: {
        id: '', //id-for-admin
        name: '', //測試者
        email: '', //admin@example.com
        isAdmin: 'n',
    },

    lang: 'cht',
    keyLangs: {

        menuTreeShow: {
            eng: 'Show API list',
            cht: '顯示API清單',
        },
        menuTreeHide: {
            eng: 'Hide API list',
            cht: '隱藏API清單',
        },

        empty: {
            eng: 'Empty',
            cht: '無',
        },
        noSelectApi: {
            eng: 'No Select',
            cht: '尚未選擇API',
        },
        waitingData: {
            eng: 'Waiting data...',
            cht: '等待數據中...',
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

        outputMenuTree: {
            eng: 'Tree',
            cht: '樹狀組件',
        },
        outputMenuRaw: {
            eng: 'Raw',
            cht: '原始數據',
        },

    },
    kpText: {},

}

//添加各資料表
each(ds, (v, k) => {
    state[k] = null //初始化null
})

//儲存至state
export { state }

//mutations, 同步執行
export let mutations = {

    [types.UpdateWebInfor] (state, webInfor) {
        state.webInfor = webInfor
    },

    [types.UpdateLang] (state, lang) {
        state.lang = lang
    },

    [types.UpdateKpText] (state, kpText) {
        state.kpText = kpText
    },

    [types.UpdateConnState] (state, connState) {
        state.connState = connState
    },

    [types.UpdateSyncState] (state, syncState) {
        state.syncState = syncState
    },

    [types.UpdateLoading] (state, loading) {
        state.loading = loading
    },

    [types.UpdateViewState] (state, viewState) {
        state.viewState = viewState
    },

    [types.UpdateTableData] (state, msg) {
        state[msg.tableName] = msg.data
    },

    [types.UpdateData] (state, msg) {
        //msg.path內為存取路徑, 需使用set處理
        // console.log('UpdateData msg', msg)
        set(state, msg.path, msg.data)
    },

    [types.UpdateHeightApp] (state, heightApp) {
        state.heightApp = heightApp
    },

    [types.UpdateHeightAppEff] (state, heightAppEff) {
        state.heightAppEff = heightAppEff
    },

    [types.UpdateHeightToolbar] (state, heightToolbar) {
        state.heightToolbar = heightToolbar
    },

    [types.UpdateMenu] (state, menu) {
        state.menu = menu
    },

    [types.UpdateUserToken] (state, userToken) {
        state.userToken = userToken
    },

    [types.UpdateUserSelf] (state, userSelf) {
        state.userSelf = userSelf
    },

}

