import Vue from 'vue'
import min from 'lodash-es/min.js'
import size from 'lodash-es/size.js'
import take from 'lodash-es/take.js'
import isEqual from 'lodash-es/isEqual.js'
import uniq from 'lodash-es/uniq.js'
import set from 'lodash-es/set.js'
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import map from 'lodash-es/map.js'
import filter from 'lodash-es/filter.js'
import last from 'lodash-es/last.js'
import split from 'lodash-es/split.js'
import join from 'lodash-es/join.js'
import drop from 'lodash-es/drop.js'
import dropRight from 'lodash-es/dropRight.js'
import groupBy from 'lodash-es/groupBy.js'
import sortBy from 'lodash-es/sortBy.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import cint from 'wsemi/src/cint.mjs'
import delay from 'wsemi/src/delay.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import isEle from 'wsemi/src/isEle.mjs'
import strleft from 'wsemi/src/strleft.mjs'
import strdelleft from 'wsemi/src/strdelleft.mjs'
import sep from 'wsemi/src/sep.mjs'
import aes2str from 'wsemi/src/aes2str.mjs'
import str2aes from 'wsemi/src/str2aes.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import genPm from 'wsemi/src/genPm.mjs'
import pmSeries from 'wsemi/src/pmSeries.mjs'
import waitFun from 'wsemi/src/waitFun.mjs'
import browserView from 'wsemi/src/browserView.mjs'
import arrHas from 'wsemi/src/arrHas.mjs'
import arrSort from 'wsemi/src/arrSort.mjs'
import arrInsert from 'wsemi/src/arrInsert.mjs'
import replace from 'wsemi/src/replace.mjs'
import timemsTZ2past from 'wsemi/src/timemsTZ2past.mjs'
import convertToTree from 'wsemi/src/convertToTree.mjs'
// import WUiDwload from 'w-ui-dwload/src/WUiDwload.mjs'


let kpFallback = {
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
}


let vo = Vue.prototype


function setVo(vObj) {
    vo = vObj
}


function updateConnState(connState) {
    vo.$store.commit(vo.$store.types.UpdateConnState, connState)
}


function updateLoading(loading) {
    vo.$store.commit(vo.$store.types.UpdateLoading, loading)
}


// function updateViewState(viewState) {
//     vo.$store.commit(vo.$store.types.UpdateViewState, viewState)
// }


function updateUserToken(userToken) {
    vo.$store.commit(vo.$store.types.UpdateUserToken, userToken)
}


function updateUserSelf(userSelf) {
    vo.$store.commit(vo.$store.types.UpdateUserSelf, userSelf)
}


function forceUpdate() {
    // console.log('forceUpdate')

    function broadcast(chs) {
        each(chs, (v) => {
            // console.log(v.$el)
            v.$forceUpdate()
            if (v.$children) {
                broadcast(v.$children)
            }
        })
    }

    //broadcast, 注意此處需使用更換ui內vo為mounted後的vo, 也就是含元素, 才能使用廣播技術
    broadcast(vo.$children)

}


function validLang(lang) {
    if (lang !== 'eng' && lang !== 'cht') {
        // console.log(`invalid lang[${lang}]`)
        lang = 'eng'
    }
    return lang
}


function getLang() {
    let lang = ''

    //from window
    if (!isestr(lang)) {
        let _lang = get(window, '___pmwperm___.language', '')
        // console.log('_lang(from window)', _lang)
        if (isestr(_lang)) {
            lang = validLang(_lang) //有可能取到未取代前模板符號
        }
    }

    //from store
    if (!isestr(lang)) {
        let _lang = get(vo, '$store.state.lang', '')
        // console.log('_lang(from store)', _lang)
        if (isestr(_lang)) {
            lang = validLang(_lang) //有可能給予非預期lang
        }
    }

    //validLang
    lang = validLang(lang) //有可能給予非預期lang

    return lang
}


function setLang(lang = null, from = '') {
    // console.log('setLang', lang, from)

    //check
    if (!isestr(lang)) {
        lang = getLang()
    }
    lang = validLang(lang)
    // console.log('get lang', lang)

    //check, 若有變更才commit
    if (true) {
        let _lang = get(vo, '$store.state.lang', '')
        if (lang !== _lang) {
            vo.$store.commit(vo.$store.types.UpdateLang, lang)
            // console.log('commit lang', lang)
        }
    }

    //kpLang
    let kpLang = get(vo, '$store.state.webInfor.kpLang', {})

    //kpText
    let kpText = get(kpLang, lang, {})
    // console.log('kpText', kpText)

    //commit
    vo.$store.commit(vo.$store.types.UpdateKpText, kpText)
    // console.log('commit kpText', kpText)

    //forceUpdate
    forceUpdate()

}


function getKpText(key) {
    // console.log('getKpText', key)

    //kpText
    let kpText = get(vo, '$store.state.kpText')
    // console.log('kpText', cloneDeep(kpText))

    //t
    let t = get(kpText, key, '')
    if (!isestr(t)) {
        // fallback: 後端語系尚未載入時使用預設值
        let lang = getLang()
        t = get(kpFallback, `${key}.${lang}`, '')
    }
    if (!isestr(t)) {
        t = key
    }

    return t
}


function gv(o, k, cv = null) {
    let r = get(o, k, '')
    if (!isestr(r)) {
        let def = getKpText('empty')
        return def
    }
    if (isfun(cv)) {
        r = cv(r)
    }
    return r
}


function syncHeight() {

    //heightToolbar
    let heightToolbar = get(vo, '$store.state.heightToolbar')

    //heightAppEff
    let heightAppEff = window.innerHeight - heightToolbar

    //commit
    // vo.$store.commit(vo.$store.types.UpdateHeightToolbar, heightToolbar)
    vo.$store.commit(vo.$store.types.UpdateHeightApp, window.innerHeight)
    vo.$store.commit(vo.$store.types.UpdateHeightAppEff, heightAppEff)

    return ''
}


async function waitData(t = 0) {

    //delay
    if (t > 0) {
        await delay(t)
    }

    //waitFun, 等待dsrl模組掛載
    await waitFun(() => {
        return iseobj(get(vo, '$dsrl'))
    })

    //等待前端第一次同步完畢數據
    await waitFun(() => {
        return get(vo, '$store.state.syncState')
    })

}


let mUI = {

    setVo,

    updateConnState,
    updateLoading,
    // updateViewState,
    updateUserToken,
    updateUserSelf,
    forceUpdate,

    setLang,
    getKpText,

    gv,
    syncHeight,

    waitData,

}


export default mUI
