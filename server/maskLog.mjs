import get from 'lodash-es/get.js'
import isarr from 'wsemi/src/isarr.mjs'
import isobj from 'wsemi/src/isobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'


//權杖／憑證寫入 console 與 srLog 前之唯一遮罩出口（M 契約；w-web-sso tmp/sso-token-leak-全盤.md〈六〉「共用契約 M」、
//w-web-sso ADR-068；sso／perm／api／task 四 repo 各一份實作、同一組測資，見 test/unit-maskLog.test.mjs）。ADR-033。
//maskTok 對應 w-web-sso server/srLog.mjs 之 maskToken、maskUrl 對應 w-web-sso src/maskUrl.mjs，輸出須逐字相同（改動須四 repo 同步）。
//why 集中一處：原為 WWebApi 閉包內私有之 maskTok（前 4 碼＋***），與 sso 之 maskToken（前 4 後 4）語意不一，
//且無法區分同前綴之 app token、對短權杖露出比例過高；集中後 console 與 srLog 共用同一規則與測資。


//maskCtrl：露出字元中之控制字元 \u0000-\u001f、\u007f 一律換成 ?（防 log 注入：換行可偽造一筆 log）
let maskCtrl = (s) => {
    let r = ''
    for (let c of s) {
        let code = c.charCodeAt(0)
        r += (code <= 0x1f || code === 0x7f) ? '?' : c
    }
    return r
}


//maskTok：
//- undefined／null／'' → ''
//- 陣列 → 逐元素遮罩：Hapi 對重複之 query 參數（?token=a&token=b）給陣列，若只認字串則原樣印出完整憑證
//  （ADR-030 複審實測 `req.query { token: [ 'ARRAYSECRET', 'x' ] }` 明文落 stdout），故陣列一律逐元素處理
//- 字串（長度 n）：k＝min(4, floor(n/8))；k＝0 → (len=n)；否則 前k...後k(len=n)（36 字元之 session token 與 sso 現行格式相同）
//- 其他型別 → (typeof)，絕不輸出原值
let maskTok = (t) => {
    if (isarr(t)) {
        return t.map(maskTok)
    }
    if (t === undefined || t === null || t === '') {
        return ''
    }
    if (!isestr(t)) {
        return `(${typeof t})`
    }
    let n = t.length
    let k = Math.min(4, Math.floor(n / 8))
    if (k === 0) {
        return `(len=${n})`
    }
    return `${maskCtrl(t.slice(0, k))}...${maskCtrl(t.slice(n - k))}(len=${n})`
}


//maskQuery：印 req.query 整包時，把其中之憑證欄位遮罩後才輸出。
//why：query 內含 token，直接 console.log(query) 會讓完整憑證落入 stdout，等同繞過 maskTok（ADR-030 第 3 項：原本三處
//「先印整包 query、下一行才印遮罩後 token」即為此情形）。回傳淺拷貝，不動原物件；非物件輸入依 M 契約遮罩，絕不原樣輸出。
let maskQuery = (q) => {
    if (!isobj(q)) {
        return maskTok(q)
    }
    let r = { ...q }
    for (let k of Object.keys(r)) {
        if (k.toLowerCase() === 'token') {
            r[k] = maskTok(r[k])
        }
    }
    return r
}


//資料值（使用者物件、請求本體、查詢參數、傳入值）之形狀摘要與外來錯誤之類別摘要，供 console 診斷改印「形狀」而非「值」（跨套件規格〈診斷輸出與遮罩〉D1 單一實作、D2「預設不輸出資料值」、
//〈輸入參數之檢測機制〉V20；ADR-057，取代 ADR-033／048 之「console 印使用者物件，記錄不修」）：2026-11-24（排程第 603 項，ADR-063）起一律為 wsemi 之共用函數 getDiagShape／getDiagBriefErr，
//本檔不再定義 shapeOf／errBrief（原本地實作已刪；其輸出契約由 test/unit-maskLog.test.mjs 之 DIAG-001～006 釘住，站點與接線由 test/unit-consoleSites.test.mjs 之 SITE-004、SITE-006、SITE-007 守護）。
//why 不用 maskTok 同款遮罩：使用者物件之 email、name、id 與請求本體之欄位值皆非權杖，遮前後各 4 字仍會洩漏其片段；規則為「不印值」而非「遮值」。


//maskUrl：http(s) 網址只記 origin + pathname（捨棄 query、fragment、userinfo——權杖與帳密所在）；非 http(s)（ftp:、data:、javascript: 等）
//只記 protocol（data:／javascript: 之 pathname 即內容本體）；無法解析 → (invalid-url)；陣列逐元素；空值 → ''；其他非字串只給型別
let maskUrl = (u) => {
    if (isarr(u)) {
        return u.map(maskUrl)
    }
    if (u === undefined || u === null || u === '') {
        return ''
    }
    if (!isestr(u)) {
        return `(${typeof u})`
    }
    let x
    try {
        x = new URL(u)
    }
    catch (err) {
        return '(invalid-url)'
    }
    if (x.protocol !== 'http:' && x.protocol !== 'https:') {
        return x.protocol
    }
    return x.origin + x.pathname
}


//pickErrName／pickErrCode：錯誤只記名稱與代碼（形狀同 w-web-sso src/fetchSsoMsg.mjs：名稱 /^[A-Za-z]{1,40}$/、代碼 /^[A-Z][A-Z0-9_]{1,40}$/），
//不合形狀回 ''；絕不取 message——fetch 例外之 message 可能含完整網址（實測 `Request cannot be constructed from a URL that
//includes credentials: <網址>`、`Failed to parse URL from <網址>`），Headers 之 TypeError 含標頭值。
//代碼先取 cause.code（undici 放系統錯誤碼處），無則取 err.code（同 sso）。
let reErrName = /^[A-Za-z]{1,40}$/
let reErrCode = /^[A-Z][A-Z0-9_]{1,40}$/

let pick = (v, re) => {
    return (isestr(v) && re.test(v)) ? v : ''
}

let pickErrName = (err) => {
    return pick(get(err, 'name'), reErrName)
}

let pickErrCode = (err) => {
    return pick(get(err, 'cause.code'), reErrCode) || pick(get(err, 'code'), reErrCode)
}


//console 之錯誤摘要不在此（2026-11-24 起一律 wsemi getDiagBriefErr，本檔已無 errBrief）；pickErrName／pickErrCode 只供非 console 之結構化用途——
//srLog 之 errName／errCode 欄位（procProxy、syncApis、ormErrKey）、上游失敗描述（wrapInjected）與 provideTabs 之拒絕訊息（K／W 契約，與 w-web-sso 為同步點），其輸出字串由各自之測試釘住。


export {
    maskTok,
    maskQuery,
    maskUrl,
    pickErrName,
    pickErrCode
}
