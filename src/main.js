import get from 'lodash-es/get.js'
// import '@babel/polyfill' //需提供Vuetify的Symbol等API
// import 'core-js/stable' //需提供Vuetify的Symbol等API, 官網說使用transpileDependencies但不夠, 改用之前提到的@babel/polyfill會被提示已廢棄, 改使用給webpack的polyfill方式才行
// import 'regenerator-runtime/runtime'
// import 'intersection-observer' //需供Vuetify的Intersection Observer, 專案內有使用v-intersect才需引入, 而w-component-vue沒用v-intersect
import Vue from 'vue'
import './assets/scalar-ui.css'
import WServHapiClient from 'w-serv-hapi/src/WServHapiClient.mjs'
import WAlert from 'w-component-vue/src/components/WAlert.mjs'
import domMutation from 'w-component-vue/src/js/domMutation.mjs'
import domResize from 'w-component-vue/src/js/domResize.mjs'
import domDragDrop from 'w-component-vue/src/js/domDragDrop.mjs'
import App from './App.vue'
import store from './store/index.mjs'
import ui from './plugins/mUI.mjs'
import ds from './schema/index.mjs'
// console.log('globalState', globalState)
// console.log('ds', ds)


//不提示vue產品
Vue.config.productionTip = false

//$alert
Vue.prototype.$alert = function() {
    let [msg, type] = arguments
    console.log(msg, type)
    if (msg !== 'close') {
        WAlert(msg, type)
    }
}

//prototype
Vue.prototype.$ui = ui
Vue.prototype.$t = ui.getKpText
//$transErr：後端 reject 之 err-key → 依當前 lang 反查顯示文字。
//非字串或查無對應 key（getKpText 查不到會原樣回 key）則 fallback 'anUnexpectedErrorOccurred'，避免顯示生 key。
Vue.prototype.$transErr = (err) => {
    let key = (typeof err === 'string' && err) ? err : 'anUnexpectedErrorOccurred'
    let msg = ui.getKpText(key)
    return (msg && msg !== key) ? msg : ui.getKpText('anUnexpectedErrorOccurred')
}
Vue.prototype.$ds = ds
Vue.prototype.$dg = {}

//directive
Vue.directive('domresize', domResize())
Vue.directive('dommutation', domMutation())
Vue.directive('domdragdrop', domDragDrop())

//WServHapiClient
// let bFirstSync = false //不需要bFirstSync, 由getWebInfor結束代表第1次完成同步
WServHapiClient({
    showLog: false,
    url: window.location.origin + window.location.pathname,
    useWaitToken: true,
    apiName: 'api',
    tokenType: 'Bearer',
    getToken: () => {
        let token = get(Vue.prototype, `$store.state.userToken`, '')
        // console.log('getToken', token)
        return token
    },
    getServerMethods: (_fapi) => {
        // console.log('$fapi', _fapi)

        //save $fapi
        Vue.prototype.$fapi = _fapi

        //getWebInfor
        _fapi.getWebInfor() //已有fapi時優先取得web資訊
            .then((wi) => {
                // console.log('$fapi getWebInfor', wi)

                Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateWebInfor, wi)
                ui.setLang(null, 'get webInfor') //因更新webInfor可取得webName與webDescription, 得要重刷語系才能依照語言取得顯示文字

                //commit syncState
                Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateSyncState, true)

            })
            .catch((err) => {
                console.log('getWebInfor failed', err)
                //getWebInfor 失敗時導向連線錯誤態，避免 ready(需 webInfor) 永假而卡在「已登入」轉圈無回饋
                ui.updateConnState('csErrConn')
            })

    },
    recvData: (r) => {
        // console.log('sync data', r.tableName, r.data)
        Vue.prototype.$store.commit(Vue.prototype.$store.types.UpdateTableData, r)
    },
})

//new
new Vue({
    store,
    render: h => h(App)
}).$mount('#app')

