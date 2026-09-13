import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import isobj from 'wsemi/src/isobj.mjs'
import isarr from 'wsemi/src/isarr.mjs'


//proxy 不轉送之標頭（小寫比對）：host / content-length 由連線層決定；其餘為 RFC 7230 §6.1 hop-by-hop，
//轉送即錯（Node fetch 對 transfer-encoding / keep-alive 直接拋錯）。其他標頭一律原樣轉送（標頭表為唯一真理源）。
let ksHeaderStrip = ['host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-connection']

//轉址：狀態碼（RFC 9110 §15.4）、跳數上限（同瀏覽器與 undici 預設）、方法改為 GET 時須移除之請求內容標頭（Fetch 標準 §4.4）
let ksRedirectStatus = [301, 302, 303, 307, 308]
let MAX_REDIRECTS = 20
let ksBodyHeader = ['content-encoding', 'content-language', 'content-location', 'content-type']


//toPairs：headers／query 之輸入 → 有序鍵值對 [[name, value], ...]。
//接受兩種形狀：①物件（向後相容其他呼叫端；值為陣列即同鍵多值）②有序鍵值對陣列（本前端請求建構器：重複鍵各自保留）。
//其餘 → []。值以 String() 轉字串（同改造前）。
function toPairs(v) {
    let pairs = []
    if (isarr(v)) {
        for (let p of v) {
            if (isarr(p) && isestr(p[0])) {
                pairs.push([p[0], String(p[1])])
            }
        }
        return pairs
    }
    if (isobj(v)) {
        for (let k of Object.keys(v)) {
            let vs = isarr(v[k]) ? v[k] : [v[k]]
            for (let x of vs) {
                pairs.push([k, String(x)])
            }
        }
    }
    return pairs
}


function procProxy(opt = {}) {

    //srLog（後端 log；錯誤一律 log err-key，fetch 例外另 log 真實訊息供排查）
    let srLog = get(opt, 'srLog', null)

    //isAllowTarget：目標位址檢核函數（回 false 即拒絕）；首跳與轉址之每一跳皆檢核
    let isAllowTarget = get(opt, 'isAllowTarget', null)
    let isTargetAllowed = (url) => {
        if (typeof isAllowTarget !== 'function') {
            return true
        }
        return isAllowTarget(url) !== false
    }


    //proxyRequest：以 Node 內建 fetch 代打目標（繞過瀏覽器 CORS）。契約（見 spec/流程_測試API.md「規則摘要」）：
    //- 請求內容原文送出：字串 body 以 TextEncoder 轉位元組原封送達，不解析、不驗證、不補 Content-Type
    //  （fetch 對字串 body 會自動補 text/plain，位元組 body 則不補；同 Scalar api-client 作法）。
    //- 物件／陣列 body（非本前端之其他呼叫端）JSON 序列化送出，無 Content-Type 時補 application/json。
    //- headers／query 接受物件或有序鍵值對；僅剝除 ksHeaderStrip；重複之 query 鍵各自 append（?id=1&id=2），
    //  重複之標頭由 Headers 依 Fetch 標準合併（', '；cookie 為 '; '）；4xx/5xx 視為有回應（不 reject）。
    //- 轉址手動跟隨：每一跳重新檢核 isAllowTarget（fetch 之 redirect:'follow' 無逐跳 hook，合法首跳可 302 到不允許之位址繞過檢核）；
    //  方法／body 改寫依 Fetch 標準 §4.4（301/302 之 POST 與 303 之非 GET/HEAD 改 GET 並丟 body 與 content-* 標頭；307/308 保留）；
    //  跨來源（origin 不同）剝除 Authorization；上限 20 跳；3xx 無 Location 視為最終回應；整條鏈共用同一 timeout。
    let proxyRequest = async (inp = {}) => {

        //method
        let method = get(inp, 'method', 'GET')
        if (!isestr(method)) {
            method = 'GET'
        }
        method = method.toUpperCase()

        //url
        let url = get(inp, 'url', '')
        if (!isestr(url)) {
            return Promise.reject('errReqUrlInvalid')
        }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return Promise.reject('errReqUrlInvalid')
        }

        //isAllowTarget check（首跳）
        if (!isTargetAllowed(url)) {
            return Promise.reject('errReqTargetNotAllowed')
        }

        //headers（剝除 ksHeaderStrip，其餘原樣；Headers 對重複鍵依 Fetch 標準合併）
        let headers = new Headers()
        try {
            for (let [k, v] of toPairs(get(inp, 'headers', {}))) {
                if (ksHeaderStrip.includes(k.toLowerCase())) {
                    continue
                }
                headers.append(k, v)
            }
        }
        catch (err) {
            //非法標頭名／值（Headers 拋 TypeError）：log 真實訊息，回前端只給 err-key
            if (srLog) {
                srLog.error({ event: 'proxyRequest-headers', msg: get(err, 'message', String(err)) })
            }
            return Promise.reject('errProxyRequestFailed')
        }
        let hasContentType = headers.has('content-type')

        //query：併入 URL（保留 url 既有 query；重複鍵各自 append）
        let u
        try {
            u = new URL(url)
        }
        catch (err) {
            return Promise.reject('errReqUrlInvalid')
        }
        for (let [k, v] of toPairs(get(inp, 'query', null))) {
            u.searchParams.append(k, v)
        }

        //body（GET/HEAD 不帶；fetch 對 GET/HEAD 帶 body 會拋錯）
        let body = get(inp, 'body', undefined)
        let data
        if (method !== 'GET' && method !== 'HEAD') {
            if (isestr(body)) {
                data = new TextEncoder().encode(body) //原文位元組，不補 Content-Type
            }
            else if (isobj(body) || isarr(body)) {
                data = new TextEncoder().encode(JSON.stringify(body))
                if (!hasContentType) {
                    headers.set('Content-Type', 'application/json')
                }
            }
        }

        //timeout
        let timeout = get(inp, 'timeout', 30000)
        if (typeof timeout !== 'number' || timeout <= 0) {
            timeout = 30000
        }

        //send（手動跟隨轉址，規則見上方契約）
        let r
        let t0 = Date.now()
        try {
            let signal = AbortSignal.timeout(timeout) //整條轉址鏈共用同一 timeout
            let curUrl = u
            let curMethod = method
            let curBody = data
            let hops = 0
            let res
            for (;;) {
                res = await fetch(curUrl, {
                    method: curMethod,
                    headers,
                    body: curBody,
                    signal,
                    redirect: 'manual',
                })
                if (!ksRedirectStatus.includes(res.status)) {
                    break
                }
                let loc = res.headers.get('location')
                if (loc === null) {
                    break //3xx 無 Location：視為最終回應（同 fetch 行為）
                }
                if (res.body) {
                    await res.body.cancel() //釋放此跳之連線
                }
                hops += 1
                if (hops > MAX_REDIRECTS) {
                    throw Object.assign(new Error(`too many redirects (> ${MAX_REDIRECTS}), last: ${curUrl.href}`), { errKey: 'errProxyRequestFailed' })
                }
                let nextUrl
                try {
                    nextUrl = new URL(loc, curUrl)
                }
                catch (err) {
                    throw Object.assign(new Error(`invalid redirect location: ${loc}`), { errKey: 'errProxyRequestFailed' })
                }
                if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
                    throw Object.assign(new Error(`unsupported redirect protocol: ${nextUrl.href}`), { errKey: 'errProxyRequestFailed' })
                }
                if (!isTargetAllowed(nextUrl.href)) {
                    throw Object.assign(new Error(`redirect target not allowed: ${nextUrl.href}`), { errKey: 'errReqTargetNotAllowed' })
                }
                //方法／body 改寫（Fetch 標準 §4.4）
                let toGet = (res.status === 303 && curMethod !== 'GET' && curMethod !== 'HEAD') || ((res.status === 301 || res.status === 302) && curMethod === 'POST')
                if (toGet) {
                    curMethod = 'GET'
                    curBody = undefined
                    for (let h of ksBodyHeader) {
                        headers.delete(h)
                    }
                }
                //跨來源轉址剝除 Authorization（Fetch 標準：CORS non-wildcard request-header name）
                if (nextUrl.origin !== curUrl.origin) {
                    headers.delete('authorization')
                }
                curUrl = nextUrl
            }

            //text → 可解析為 JSON 者回物件，否則原文（對齊改造前 axios 之 silent JSON parsing）
            let text = await res.text()
            let resData = text
            if (isestr(text)) {
                try {
                    resData = JSON.parse(text)
                }
                catch (err) {
                    resData = text
                }
            }

            //headers → 物件；set-cookie 多值以陣列呈現
            let resHeaders = {}
            res.headers.forEach((v, k) => {
                resHeaders[k] = v
            })
            let cookies = res.headers.getSetCookie()
            if (cookies.length > 0) {
                resHeaders['set-cookie'] = cookies
            }

            let durationMs = Date.now() - t0

            //r
            r = {
                status: res.status,
                statusText: res.statusText,
                headers: resHeaders,
                data: resData,
                durationMs,
            }

        }
        catch (err) {
            //轉址鏈之刻意拒絕（帶 errKey）：log 細節後回該 err-key
            let errKey = get(err, 'errKey', '')
            if (isestr(errKey)) {
                if (srLog) {
                    srLog.error({ event: 'proxyRequest-redirect', err: errKey, msg: get(err, 'message', '') })
                }
                return Promise.reject(errKey)
            }
            //fetch 例外（timeout/DNS/連線拒絕/受限標頭）：log 真實訊息與 cause 供排查，但回前端只給 err-key（前端依 lang 顯示）
            if (srLog) {
                srLog.error({ event: 'proxyRequest-fetch', msg: get(err, 'message', String(err)), cause: get(err, 'cause.message', '') })
            }
            return Promise.reject('errProxyRequestFailed')
        }

        return r
    }


    return {
        proxyRequest,
    }
}


export default procProxy
