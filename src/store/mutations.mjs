import each from 'lodash-es/each.js'
import set from 'lodash-es/set.js'
import * as types from './types.mjs'
import ds from '../schema/index.mjs'
import contractApis from '../schema/contracts/apis.mjs'
import { applySavedRow, applyDeletedRow, createRecentRows } from './applyRows.mjs'


//各資料表之寫入契約(存檔／刪除成功後立即更新 store 用; 無契約之表不處理)
let kpContract = {
    apis: contractApis,
}

//各資料表「我剛以回傳列寫入 store 之列」記憶(非響應式, 不入 state): 保護其不被晚到之較舊整表快照退回
let kpRecent = {
    apis: createRecentRows(contractApis),
}


//state, 全域狀態
let state = {

    hostname: `${window.location.origin}`,
    webInfor: {},
    connState: 'csIng', //'csIng', 'csLogin', 'csLogout', 'csErrConn', 'csErrLogin'
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
    userSelf: {}, //UpdateUserSelf 寫入之使用者自身資訊；Vue 2 須於初始 state 宣告才具響應性（同 sso 之 userSelf: {}）

    lang: 'eng', //'eng', 'cht'
    kpText: {}, //一定要放在vuex內, 否則無法用broadcast驅動變更語系文字

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

    // [types.UpdateViewState] (state, viewState) {
    //     state.viewState = viewState
    // },

    [types.UpdateTableData] (state, msg) {
        //推播／輪詢抵達之整表快照: 我剛以回傳列寫入之列若在快照中比我寫入的舊(快照在我寫入前讀取而晚到), 保留我寫入之列(createRecentRows)
        let recent = kpRecent[msg.tableName]
        state[msg.tableName] = recent ? recent.guard(msg.data) : msg.data
    },

    //存檔成功後以伺服端回傳之寫入後之列立即更新 store(不等推播／輪詢; 規格第8節, applyRows.mjs): msg = { tableName, row, baseline }
    [types.ApplySavedRow] (state, msg) {
        let contract = kpContract[msg.tableName]
        if (contract) {
            let prev = state[msg.tableName]
            let next = applySavedRow(prev, msg.row, msg.baseline, contract)
            if (next !== prev) {
                kpRecent[msg.tableName].mark(msg.row)
            }
            state[msg.tableName] = next
        }
    },

    //刪除成功後立即自 store 移除該列: msg = { tableName, id, baseline }
    [types.ApplyDeletedRow] (state, msg) {
        let contract = kpContract[msg.tableName]
        if (contract) {
            state[msg.tableName] = applyDeletedRow(state[msg.tableName], msg.id, msg.baseline, contract)
        }
    },

    [types.UpdateHeightApp] (state, heightApp) {
        state.heightApp = heightApp
    },

    [types.UpdateHeightAppEff] (state, heightAppEff) {
        state.heightAppEff = heightAppEff
    },

    [types.UpdateUserToken] (state, userToken) {
        state.userToken = userToken
    },

    [types.UpdateUserSelf] (state, userSelf) {
        state.userSelf = userSelf
    },

}

