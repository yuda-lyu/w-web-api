//前後端共用函數區
import toPath from 'lodash-es/toPath.js'
import isobj from 'wsemi/src/isobj.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import j2o from 'wsemi/src/j2o.mjs'


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


//jsonToKvPairs：API 定義之預設 Query／Headers JSON 字串（defaultQueryJson、defaultHeadersJson）→ 有序鍵值對 [[key, valueString], ...]。
//規則（R-OBJ-ITER-01）：鍵為使用端（API 定義者或外部同步）給定之任意字串，含 `length`（如分頁參數 { "start": 0, "length": 10 }）——
//一律依自有可列舉鍵走訪（Object.keys）；改造前以 lodash each 走訪，具非負整數 length 之物件改走索引 0..length-1，
//真實鍵被略過並產生 key 為 0..length-1、值為 'undefined' 之假列（length: 0 則整表為空）。
//非字串、空字串、解析後非一般物件（陣列、純值）→ []；值一律轉字串。
function jsonToKvPairs(jsonStr) {
    let pairs = []
    if (!isestr(jsonStr)) {
        return pairs
    }
    let obj = j2o(jsonStr)
    if (!isobj(obj)) {
        return pairs
    }
    for (let k of Object.keys(obj)) {
        pairs.push([k, String(obj[k])])
    }
    return pairs
}


//apiTreePath：API 於左側樹中之節點路徑（陣列）。levels 以 `.` 分層（設計，seed 如 '寵物.狗狗'），name 為葉名，整段視為單一層級。
//why（R-KEY-01）：name 為使用端（API 定義者或外部同步）給定之任意字串；改造前以 `${levels}.${name}` 字串交給 lodash get／set，
//name 內之 `.` 或 `[` 被解析為路徑——多出中間層，且葉（值為 id 字串）遇後來之 `a.b` 時被 set 換成物件，先前之 API 自樹上消失。
//dot 與 `[` 皆不出現於 name 時，路徑與改造前相同（含 levels 為空字串：改造前 '.name' 解析為 ['', name]，此處以 `${levels}.` 解析、末段換成 name，結果相同）。
function apiTreePath(levels, name) {
    let path = toPath(`${levels}.`) //末段恆為空字串（levels 之後的 `.` 之右側）
    path[path.length - 1] = `${name}`
    return path
}


//apiTreeSet：依節點路徑（apiTreePath）把 API id 寫入樹物件 tr（葉為 id 字串、群組為物件）。
//語意同改造前之 `if (!isobj(get(tr, path))) set(tr, path, id)`：該路徑已是群組（物件）則不覆寫；否則建立中間群組並寫入葉（途中遇葉〔id 字串〕時換成群組）。
//差異（R-KEY-01）：各層一律以自有鍵判斷與寫入——lodash get 對 `__proto__`、`constructor` 等取得繼承值（Object.prototype、Object 函數）而誤判為既有群組，
//致名稱為此類字串之 API 自樹上消失；自有資料屬性以 defineProperty 寫入（含 __proto__，一般指派會被忽略）。
function apiTreeSet(tr, path, id) {
    let own = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
    let def = (o, k, v) => Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true })
    let cur = tr
    for (let i = 0; i < path.length - 1; i++) {
        let k = path[i]
        let nx = own(cur, k) ? cur[k] : undefined
        if (!isobj(nx)) {
            nx = {}
            def(cur, k, nx)
        }
        cur = nx
    }
    let last = path[path.length - 1]
    if (!(own(cur, last) && isobj(cur[last]))) {
        def(cur, last, id)
    }
    return tr
}


export {
    METHODS,
    isJsonContainer,
    dataToText,
    methodToHttpVerb,
    escapeHtml,
    jsonHighlight,
    kvRowsToPairs,
    jsonToKvPairs,
    apiTreePath,
    apiTreeSet
}
