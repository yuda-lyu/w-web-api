import Vue from 'vue'
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import delay from 'wsemi/src/delay.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import waitFun from 'wsemi/src/waitFun.mjs'


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

    //from URL ?lang=（最高優先；供「以指定語系載入初始畫面」用，如分享連結 /?lang=cht，對齊 w-web-sso getLang）
    if (!isestr(lang)) {
        let _lang = ''
        try {
            _lang = new URLSearchParams(get(window, 'location.search', '')).get('lang') || ''
        }
        catch (err) {
            _lang = ''
        }
        if (isestr(_lang)) {
            lang = validLang(_lang) //URL 帶非預期 lang 時 validLang 退回 eng
        }
    }

    //from window ___pmwperm___.language（server 注入之初始語系；對齊 w-web-sso window 注入來源）。
    //須在 store 之前：store.state.lang 預設為非空 'eng'（mutations.mjs），若 store 在前會永遠 shadow 掉 window 注入值。
    //dev 未注入時為模板符號 {language} → validLang 退回 eng。
    if (!isestr(lang)) {
        let _lang = get(window, '___pmwperm___.language', '')
        if (isestr(_lang)) {
            lang = validLang(_lang)
        }
    }

    //from store（使用者執行期切換之語系；切換以 setLang(明確值) 直接寫入、其後無 setLang(null) 故能持久）
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
