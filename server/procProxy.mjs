import get from 'lodash-es/get.js'
import { Agent, fetch } from 'undici'
import isestr from 'wsemi/src/isestr.mjs'
import isobj from 'wsemi/src/isobj.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import { maskTok, maskUrl, pickErrName, pickErrCode } from './maskLog.mjs'
import createTargetPolicy, { createGuardedLookup, isBlockedTargetError } from './proxyTargetPolicy.mjs'


//proxy 不轉送之標頭（小寫比對）：host / content-length 由連線層決定；其餘為 RFC 7230 §6.1 hop-by-hop，
//轉送即錯（Node fetch 對 transfer-encoding / keep-alive 直接拋錯）。其他標頭一律原樣轉送（標頭表為唯一真理源）。
let ksHeaderStrip = ['host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-connection']

//標頭名合法形狀（RFC 9110 §5.6.2 token，同 undici 之檢核）：非法之名稱可能是使用者整行貼入之「Authorization: Bearer …」，記 log 前須遮罩
let reHeaderName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

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

    //srLog（後端 log；錯誤一律 log err-key，另記不含憑證之細因供排查：標頭名與固定原因、經 maskUrl 之網址、錯誤名稱與代碼；ADR-033）
    let srLog = get(opt, 'srLog', null)

    //isAllowTarget：部署方之目標位址檢核函數；首跳與轉址之每一跳皆檢核，收到之網址即實際將送出者（首跳為併入 query 後之 href，轉址跳為 Location 解析後之 href）。
    //可為同步或非同步函數（await）：回傳（或 Promise 解析為）false 即拒絕；拋錯或 reject 視同拒絕（fail-closed，鉤子拋出之內容不外洩，呼叫端只回固定 err-key）。
    //原寫法 `isAllowTarget(url) !== false` 對非同步函數之 Promise 恆為 true 而放行，且同步拋錯以原 Error 外送（外審 sol F02、F04）
    let isAllowTarget = get(opt, 'isAllowTarget', null)
    let isTargetAllowed = async (url) => {
        if (typeof isAllowTarget !== 'function') {
            return true
        }
        try {
            return (await isAllowTarget(url)) !== false
        }
        catch (err) {
            return false
        }
    }

    //targetPolicy：內建之目標位址政策（proxyTargetPolicy.mjs，P1，ADR-049）；預設拒絕內網與本機位址，WWebApi 以 opt.proxyAllowInternal／proxyAllowList 建立後注入。
    //與 isAllowTarget 並存時兩者皆須通過（AND）：每一跳先 isAllowTarget（網址層，部署方自訂）、再 targetPolicy（解析後之位址層）；isAllowTarget 回 true 不能放寬內建拒絕，
    //內建之 allowList 亦不繞過 isAllowTarget。拒絕一律回固定 err-key 'errReqTargetNotAllowed'、srLog 記 proxyRequest-target（只含原因類別與跳數，不含目標位址）
    let targetPolicy = get(opt, 'targetPolicy', null)
    if (targetPolicy === null) {
        targetPolicy = createTargetPolicy()
    }

    //dnsLookup：主機名解析函數（簽章同 dns.lookup），僅測試注入用（模擬 DNS 回應與 rebinding）；未給用 dns.lookup
    let dnsLookup = get(opt, 'dnsLookup', undefined)

    //dispatcher：連線池，其 connect.lookup 為 guarded lookup——於「連線當下」解析主機名並檢查全部結果，通過者即連線所用之位址（不二次解析），
    //故 DNS 於檢查後換答案（rebinding）無從生效；IP 字面值不經 lookup，由 targetPolicy.checkUrl 於連線前檢查（每跳）。
    //用 undici 套件之 Agent 與 fetch（Node 內建 fetch 不提供 per-request 之 lookup 注入點；兩者須同版以免 dispatcher 介面不合）
    let dispatcher = null
    let getDispatcher = () => {
        if (dispatcher === null) {
            dispatcher = new Agent({ connect: { lookup: createGuardedLookup(targetPolicy, dnsLookup) } })
        }
        return dispatcher
    }
    //close：釋放連線池（WWebApi.stop 呼叫）。用 destroy 立即終止進行中之請求與閒置連線，不等其逾時（呼叫端可給較長之 timeout，graceful close 會使 stop 拖到請求結束）；
    //之後再發請求會重建連線池
    let close = async () => {
        if (dispatcher !== null) {
            let d = dispatcher
            dispatcher = null
            await d.destroy()
        }
    }

    //denyTarget：內建位址政策拒絕（帶 err-key 與原因類別，由 send 之 catch 記 srLog 後回 err-key）
    let denyTarget = (reason, hop) => Object.assign(new Error('target not allowed'), { errKey: 'errReqTargetNotAllowed', targetReason: reason, hop })

    //lockSave：後端雙擊防護（依使用者占位，見 lockSave.mjs，ADR-034），由 WWebApi 建立並注入（與 procApis 共用同一 cacheSt）；
    //為 proxyRequestByUser 之必要依賴，未注入時其以 TypeError reject 而不送出（fail-closed）
    let lockSave = get(opt, 'lockSave', null)


    //proxyRequest：以 undici 套件之 fetch 代打目標（繞過瀏覽器 CORS；原用 Node 內建 fetch，ADR-049 改為套件版以便於連線當下檢查位址）。契約（見 spec/流程_測試API.md「規則摘要」）：
    //- 請求內容原文送出：字串 body 以 TextEncoder 轉位元組原封送達，不解析、不驗證、不補 Content-Type
    //  （fetch 對字串 body 會自動補 text/plain，位元組 body 則不補；同 Scalar api-client 作法）。
    //- 物件／陣列 body（非本前端之其他呼叫端）JSON 序列化送出，無 Content-Type 時補 application/json。
    //- headers／query 接受物件或有序鍵值對；僅剝除 ksHeaderStrip；重複之 query 鍵各自 append（?id=1&id=2），
    //  重複之標頭由 Headers 依 Fetch 標準合併（', '；cookie 為 '; '）；4xx/5xx 視為有回應（不 reject）。
    //- 轉址手動跟隨：每一跳重新檢核 isAllowTarget 與內建位址政策（fetch 之 redirect:'follow' 無逐跳 hook，合法首跳可 302 到不允許之位址繞過檢核）；
    //  方法／body 改寫依 Fetch 標準 §4.4（301/302 之 POST 與 303 之非 GET/HEAD 改 GET 並丟 body 與 content-* 標頭；307/308 保留）；
    //  跨來源（origin 不同）剝除 Authorization；上限 20 跳；3xx 無 Location 視為最終回應；整條鏈共用同一 timeout。
    //- 目標位址政策（P1）：預設拒絕內網與本機位址（見上 targetPolicy／dispatcher 說明與 proxyTargetPolicy.mjs），連線所用之位址即檢查過之位址。
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

        //headers（剝除 ksHeaderStrip，其餘原樣；Headers 對重複鍵依 Fetch 標準合併）
        //逐對 try/catch 才知道是哪個標頭非法。非法名／值（Headers 拋 TypeError，其 message 含標頭值或名稱原文，可能為第三方憑證）：
        //srLog 只記標頭名與固定原因、不記值與錯誤原文（ADR-033）；名稱本身非法時連名稱亦依 M 契約遮罩。回前端只給 err-key
        let headers = new Headers()
        for (let [k, v] of toPairs(get(inp, 'headers', {}))) {
            if (ksHeaderStrip.includes(k.toLowerCase())) {
                continue
            }
            try {
                headers.append(k, v)
            }
            catch (err) {
                if (srLog) {
                    let validName = reHeaderName.test(k)
                    srLog.error({ event: 'proxyRequest-headers', err: 'errProxyRequestFailed', header: validName ? k : maskTok(k), reason: validName ? 'invalidHeaderValue' : 'invalidHeaderName' })
                }
                return Promise.reject('errProxyRequestFailed')
            }
        }
        let hasContentType = headers.has('content-type')

        //預設 User-Agent：用 undici 套件之 fetch 後其預設為 'undici'，Node 內建 fetch 為 'node'；維持改造前目標端所見之 'node'（使用者自給者不動）
        if (!headers.has('user-agent')) {
            headers.set('user-agent', 'node')
        }

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

        //isAllowTarget check（首跳）：收到之網址即實際將送出者（query 已併入、經 URL 正規化；與轉址跳之 nextUrl.href 對稱）。
        //拒絕亦記 srLog（與內建位址政策之拒絕同一事件，reason 為 isAllowTarget，不含網址；原首跳之此拒絕不留記錄、轉址跳則記 proxyRequest-redirect，外審指出不對稱）
        if (!(await isTargetAllowed(u.href))) {
            if (srLog) {
                srLog.error({ event: 'proxyRequest-target', err: 'errReqTargetNotAllowed', reason: 'isAllowTarget', hop: 0 })
            }
            return Promise.reject('errReqTargetNotAllowed')
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
        let hops = 0
        try {
            let signal = AbortSignal.timeout(timeout) //整條轉址鏈共用同一 timeout
            let curUrl = u
            let curMethod = method
            let curBody = data
            let res
            for (;;) {

                //內建位址政策（P1）：IP 字面值與 localhost 名稱於連線前同步檢查（每跳；首跳之 isAllowTarget 已於前、轉址跳之 isAllowTarget 於下方轉址分支先檢）；
                //其餘主機名由 dispatcher 之 guarded lookup 於連線當下檢查解析結果
                let reason = targetPolicy.checkUrl(curUrl)
                if (reason !== null) {
                    throw denyTarget(reason, hops)
                }

                res = await fetch(curUrl, {
                    method: curMethod,
                    headers,
                    body: curBody,
                    signal,
                    redirect: 'manual',
                    dispatcher: getDispatcher(),
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
                //轉址鏈拒絕之訊息只入 srLog（回前端為 errKey）；網址一律經 maskUrl（捨棄 query／userinfo——第三方權杖與帳密所在；ADR-033）
                if (hops > MAX_REDIRECTS) {
                    throw Object.assign(new Error(`too many redirects (> ${MAX_REDIRECTS}), last: ${maskUrl(curUrl.href)}`), { errKey: 'errProxyRequestFailed' })
                }
                let nextUrl
                try {
                    nextUrl = new URL(loc, curUrl)
                }
                catch (err) {
                    throw Object.assign(new Error(`invalid redirect location: ${maskUrl(loc)}`), { errKey: 'errProxyRequestFailed' })
                }
                if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
                    throw Object.assign(new Error(`unsupported redirect protocol: ${maskUrl(nextUrl.href)}`), { errKey: 'errProxyRequestFailed' })
                }
                if (!(await isTargetAllowed(nextUrl.href))) {
                    throw Object.assign(new Error(`redirect target not allowed: ${maskUrl(nextUrl.href)}`), { errKey: 'errReqTargetNotAllowed' })
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
            //標頭名由目標伺服器決定(可為 __proto__ 等原型鍵名): 一律以自有資料屬性保存(一般指派 resHeaders['__proto__'] = v 會被忽略而遺失該標頭, R-KEY-01)
            let resHeaders = {}
            res.headers.forEach((v, k) => {
                Object.defineProperty(resHeaders, k, { value: v, writable: true, enumerable: true, configurable: true })
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
            //刻意拒絕（帶 errKey）：log 細節後回該 err-key。內建位址政策之拒絕（帶 targetReason）只記原因類別與跳數、不記目標位址；轉址鏈之其餘拒絕記經 maskUrl 之訊息
            let errKey = get(err, 'errKey', '')
            if (isestr(errKey)) {
                if (srLog) {
                    if (isestr(get(err, 'targetReason', ''))) {
                        srLog.error({ event: 'proxyRequest-target', err: errKey, reason: err.targetReason, hop: err.hop })
                    }
                    else {
                        srLog.error({ event: 'proxyRequest-redirect', err: errKey, msg: get(err, 'message', '') })
                    }
                }
                return Promise.reject(errKey)
            }
            //guarded lookup 之拒絕（主機名解析到不被允許之位址）：連線錯誤沿 cause 鏈帶標記；同樣只記原因類別與跳數
            if (isBlockedTargetError(err)) {
                if (srLog) {
                    srLog.error({ event: 'proxyRequest-target', err: 'errReqTargetNotAllowed', reason: 'resolvedInternal', hop: hops })
                }
                return Promise.reject('errReqTargetNotAllowed')
            }
            //fetch 例外（timeout/DNS/連線拒絕/受限標頭/網址含 userinfo）：只記 err.name 與 cause.code（名稱／代碼形狀才記），不記 message——
            //其原文可能含完整網址（`Request cannot be constructed from a URL that includes credentials: <網址>`；ADR-033）；回前端只給 err-key
            if (srLog) {
                srLog.error({ event: 'proxyRequest-fetch', err: 'errProxyRequestFailed', errName: pickErrName(err), errCode: pickErrCode(err) })
            }
            return Promise.reject('errProxyRequestFailed')
        }

        return r
    }


    //proxyRequestByUser：kpFunExt 之入口（第 1 參數為 userId）。以「proxyRequest:<userId>」占位後執行 proxyRequest：
    //同一使用者之請求處理中再送出即 reject 'requestInProgress'，不排隊（送出對目標可能有副作用，如 POST 建立資料）；
    //不同使用者互不影響；請求結束（含失敗）即釋放（ADR-034）。proxyRequest 本身為代打核心、不占位（供單元測試直打）
    let proxyRequestByUser = async (userId, inp = {}) => {
        return lockSave('proxyRequest', userId, () => {
            return proxyRequest(inp)
        }, { errKey: 'requestInProgress' })
    }


    return {
        proxyRequest,
        proxyRequestByUser,
        close,
    }
}


export default procProxy
