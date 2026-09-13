//unit：src/plugins/mShare.mjs 之 isJsonContainer / dataToText（測試分頁「回應 data 型別 → 顯示形式」與「請求 body 解析」共用述語）
//每條斷言對應 spec/流程_測試API.md「回應 data 型別 → 顯示形式」表之一列；缺陷來源：建議w-web-api調整.md 第 1 項。
import assert from 'assert'
import { METHODS, isJsonContainer, dataToText, methodToHttpVerb, escapeHtml, jsonHighlight, kvRowsToPairs } from '../src/plugins/mShare.mjs'


describe('unit-mShare-dataToText', function() {

    //spec 表：判定用 isJsonContainer（純物件或陣列）
    it('MSHARE-001 isJsonContainer：純物件與陣列為真，其餘為假', function() {
        assert.strictEqual(isJsonContainer({}), true)
        assert.strictEqual(isJsonContainer({ a: 1 }), true)
        assert.strictEqual(isJsonContainer([]), true)
        assert.strictEqual(isJsonContainer([{ a: 1 }]), true)
        assert.strictEqual(isJsonContainer([1, 2]), true)
        assert.strictEqual(isJsonContainer('str'), false)
        assert.strictEqual(isJsonContainer(''), false)
        assert.strictEqual(isJsonContainer(123), false)
        assert.strictEqual(isJsonContainer(true), false)
        assert.strictEqual(isJsonContainer(null), false)
        assert.strictEqual(isJsonContainer(undefined), false)
    })

    //spec 表列 1：純物件 → JSON.stringify(v, null, 2)
    it('MSHARE-002 dataToText：純物件為縮排 2 之 JSON', function() {
        assert.strictEqual(dataToText({ a: 1, b: 'x' }), '{\n  "a": 1,\n  "b": "x"\n}')
    })

    //spec 表列 2：陣列（元素為物件／純值／巢狀／空陣列）與物件同一形式；不得為 String(array) 之逗號串接
    it('MSHARE-003 dataToText：陣列為縮排 2 之 JSON（物件元素／純值／巢狀／空）', function() {
        let arrObj = [{ id: 1, name: 'alpha' }, { id: 2, name: 'beta' }]
        let t = dataToText(arrObj)
        assert.strictEqual(t, JSON.stringify(arrObj, null, 2))
        assert.ok(!t.includes('[object Object]'), '不得為 [object Object]')
        assert.ok(t.startsWith('[') && t.includes('"name": "alpha"'), '應為縮排 JSON')
        assert.strictEqual(dataToText([1, 2, 3]), '[\n  1,\n  2,\n  3\n]') //非 '1,2,3'
        assert.strictEqual(dataToText([[1], [2]]), '[\n  [\n    1\n  ],\n  [\n    2\n  ]\n]')
        assert.strictEqual(dataToText([]), '[]') //非 ''
    })

    //spec 表列 3、4：字串原文；數字／布林／null／空 body → String(v)
    it('MSHARE-004 dataToText：字串／數字／布林／null／空 body 維持 String(v)', function() {
        assert.strictEqual(dataToText('<html>x</html>'), '<html>x</html>')
        assert.strictEqual(dataToText(''), '')
        assert.strictEqual(dataToText(123), '123')
        assert.strictEqual(dataToText(true), 'true')
        assert.strictEqual(dataToText(null), 'null')
    })

    //JSON.stringify 拋錯（循環參照）→ 退回 String(v)，不 throw（防禦；經 JSON 傳輸之回應實務上不可達）
    it('MSHARE-005 dataToText：循環參照不 throw、退回 String(v)', function() {
        let o = { a: 1 }
        o.self = o
        assert.strictEqual(dataToText(o), '[object Object]')
    })

    //ADR-030：DEL 為顯示/資料層代號，非 HTTP 動詞；送出與 cURL 皆須轉為 DELETE（實測送 DEL 目標回 400 且 handler 不執行）
    it('MSHARE-006 methodToHttpVerb：DEL/del 轉 DELETE，其餘正規化為大寫', function() {
        assert.strictEqual(methodToHttpVerb('DEL'), 'DELETE')
        assert.strictEqual(methodToHttpVerb('del'), 'DELETE')
        assert.strictEqual(methodToHttpVerb('DELETE'), 'DELETE')
        assert.strictEqual(methodToHttpVerb('get'), 'GET')
        assert.strictEqual(methodToHttpVerb('GET'), 'GET')
        assert.strictEqual(methodToHttpVerb('post'), 'POST')
        assert.strictEqual(methodToHttpVerb('put'), 'PUT')
        assert.strictEqual(methodToHttpVerb('head'), 'HEAD')
        //空值/非字串 → 'GET'（同 procProxy 之預設）
        assert.strictEqual(methodToHttpVerb(''), 'GET')
        assert.strictEqual(methodToHttpVerb(null), 'GET')
        assert.strictEqual(methodToHttpVerb(undefined), 'GET')
        assert.strictEqual(methodToHttpVerb(123), 'GET')
    })

    //ADR-031：Query／Headers 表列 → 有序鍵值對；僅 on 且鍵非空之列；重複鍵各自保留（不收斂）；值轉字串
    it('MSHARE-007 kvRowsToPairs：僅 on 且鍵非空之列、重複鍵各自保留、值轉字串', function() {
        let rows = [
            { on: true, key: 'a', value: '1' },
            { on: false, key: 'b', value: '2' }, //未勾選
            { on: true, key: '', value: '3' }, //鍵空
            { on: true, key: 'a', value: '4' }, //重複鍵：保留、不覆蓋
            { on: true, key: 'n', value: 5 }, //數值 → 字串
            { on: true, key: 'u', value: undefined }, //無值 → ''
            null, 'x', //非物件列略過
        ]
        assert.deepStrictEqual(kvRowsToPairs(rows), [['a', '1'], ['a', '4'], ['n', '5'], ['u', '']])
        assert.deepStrictEqual(kvRowsToPairs([]), [])
        assert.deepStrictEqual(kvRowsToPairs(null), [])
    })

    //ADR-031：兩處 JSON 高亮共用同一實作——鍵 .k、字串值 .s、數字 .n、true/false/null .b；先 escape & < >；字串內之數字／關鍵字不上色
    it('MSHARE-008 jsonHighlight / escapeHtml：escape 後逐 token 上色、字串內容不再比對', function() {
        let h = jsonHighlight('{\n  "a": 1,\n  "b": "x 2 true",\n  "c": [true, null, -1.5e3],\n  "d": "<i>&"\n}')
        assert.ok(h.includes('<span class="k">"a"</span>:'), '鍵上色 .k')
        assert.ok(h.includes('<span class="n">1</span>'), '數字上色 .n')
        assert.ok(h.includes('<span class="s">"x 2 true"</span>'), '字串值整段 .s，內含之 2／true 不另上色')
        assert.ok(h.includes('<span class="b">true</span>') && h.includes('<span class="b">null</span>'), 'true/null 上色 .b')
        assert.ok(h.includes('<span class="n">-1.5e3</span>'), '負數／科學記號')
        assert.ok(h.includes('<span class="s">"&lt;i&gt;&amp;"</span>'), '先 escape & < >（v-html sink 之 XSS 防護）')
        assert.ok(!h.includes('<i>'), '不得殘留未 escape 之標籤')
        assert.ok(jsonHighlight('["p", "q"]').includes('<span class="s">"p"</span>'), '陣列之字串元素（無冒號）為值 .s')
        assert.strictEqual(jsonHighlight(null), '')
        assert.strictEqual(escapeHtml('<b>&"x"'), '&lt;b&gt;&amp;"x"')
        assert.strictEqual(escapeHtml(undefined), '')
    })

    //ADR-031：方法代號清單單一來源（編輯表單 / 測試分頁共用）
    it('MSHARE-009 METHODS：資料層小寫代號清單', function() {
        assert.deepStrictEqual(METHODS, ['get', 'post', 'put', 'del'])
    })

})
