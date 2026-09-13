//前後端共用函數區
import isobj from 'wsemi/src/isobj.mjs'
import isarr from 'wsemi/src/isarr.mjs'


function isJsonContainer(v) {
    //值是否為 JSON 容器（純物件或陣列）。
    //why 不只用 isobj：wsemi 之 isobj 以 Object.prototype.toString 判 '[object Object]'，陣列為 '[object Array]' 回 false；
    //測試分頁「回應內容」與「請求 body 解析」兩站點都要把陣列與物件同等看待（見 spec/流程_測試API.md「回應 data 型別 → 顯示形式」）。
    return isobj(v) || isarr(v)
}


function dataToText(v) {
    //回應 data → 顯示用純文字。容器（物件／陣列）→ 縮排 2 之 JSON；其餘（字串／數字／布林／null／空）→ String(v)。
    //JSON.stringify 拋錯（如循環參照；經 JSON 傳輸之回應實務上不可達）時退回 String(v)。
    if (isJsonContainer(v)) {
        try {
            return JSON.stringify(v, null, 2)
        }
        catch (e) {
            return String(v)
        }
    }
    return String(v)
}


//methodToHttpVerb：把 UI／資料層的方法代號轉成 HTTP 標準動詞。
//why：本系統以 'del'（資料層）／'DEL'（顯示層）表示刪除，但 `DEL` **不是** HTTP 動詞——實測以 fetch 送出 `DEL`
//時目標伺服器無法解析、於 HTTP 層直接回 400 且 handler 完全不會執行，導致所有刪除類 API 無法測試（種子資料即有
//3 支）。故送出前與產生 cURL 前一律經此轉換。其餘動詞僅正規化為大寫；空值或非字串退回 'GET'（同 proxy 之預設）。
function methodToHttpVerb(v) {
    if (typeof v !== 'string' || v === '') {
        return 'GET'
    }
    let m = v.toUpperCase()
    return (m === 'DEL') ? 'DELETE' : m
}


//METHODS：本系統之方法代號清單（資料層小寫；顯示層以 toUpperCase 呈現；送出時經 methodToHttpVerb 轉 HTTP 動詞）。
//單一來源：編輯表單與測試分頁之方法下拉共用（改造前兩處各自手寫一份清單）。
let METHODS = ['get', 'post', 'put', 'del']


//escapeHtml：文字 → 可放入 HTML 文字節點之字串（只 escape & < > 三者；文字節點內之引號不需 escape，
//且 jsonHighlight 之 token 規則依賴保留原始 "）。
function escapeHtml(text) {
    let s = (text === null || text === undefined) ? '' : String(text)
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}


//jsonHighlight：JSON 文字 → 語法高亮 HTML（class k=鍵、s=字串值、n=數字、b=true/false/null；樣式為 src/assets/scalar-ui.css 之 .code）。
//docs 分頁（outputExample）與測試分頁（回應內容）共用同一實作，兩處行為一致。
//why 單趟 tokenizer：改造前兩處各自手寫——測試分頁以 &quot; 比對但 escape 只換 & < >，字串永遠不命中、鍵值一律不上色；
//docs 版逐規則多次 replace，字串內之數字／true 亦被誤上色。此處字串 token（含 \" 跳脫）優先吞掉整段，
//字串內容不再被後續規則比對；字串後緊接 : 者為鍵，否則為值。
function jsonHighlight(text) {
    let s = escapeHtml(text)
    return s.replace(/("(?:[^"\\]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g, function(m, str, colon, num, kw) {
        if (str !== undefined) {
            if (colon !== undefined) {
                return '<span class="k">' + str + '</span>' + colon
            }
            return '<span class="s">' + str + '</span>'
        }
        if (num !== undefined) {
            return '<span class="n">' + num + '</span>'
        }
        return '<span class="b">' + kw + '</span>'
    })
}


//kvRowsToPairs：請求建構器之 Query／Headers 表列（[{ on, key, value }]）→ 有序鍵值對 [[key, value], ...]。
//規則（spec/流程_測試API.md「規則摘要」）：僅 on 且鍵非空之列納入；重複鍵各自保留一對、不收斂成物件
//（重複之 query 鍵須各自送達目標，如 ?id=1&id=2；重複之標頭由 proxy 依 Fetch 標準合併）；值一律轉字串。
//why：改造前以 `obj[key] = value` 收斂，同鍵之後列靜默覆蓋前列，使用者看到兩列卻只送出一列。
function kvRowsToPairs(rows) {
    let pairs = []
    if (!isarr(rows)) {
        return pairs
    }
    for (let row of rows) {
        if (!isobj(row) || !row.on || typeof row.key !== 'string' || row.key === '') {
            continue
        }
        let v = (row.value === null || row.value === undefined) ? '' : String(row.value)
        pairs.push([row.key, v])
    }
    return pairs
}


export {
    METHODS,
    isJsonContainer,
    dataToText,
    methodToHttpVerb,
    escapeHtml,
    jsonHighlight,
    kvRowsToPairs
}
