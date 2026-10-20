//unit：src/plugins/mShare.mjs 之 getFreqVal（統計頁依事件名取時間桶 data 內之值；R-KEY-01，ADR-042）
//規則：事件名（log 之 event）當作 data 內的鍵，取值一律以自有屬性，不把事件名組成 lodash 路徑字串。
//改造前（LayoutContentStats.vue）以 get(item, `data.${事件名}`, 0)／sumBy 取值：事件名含 `.` 或 `[` 時被解析為路徑，圖表、加總與事件統計表恆為 0；
//原型鍵名（constructor 等）則取得繼承值。事件名皆為程式碼常數（不含 `.`、`[` 由 unit-iterSites 曾守），本規則消除該前提。
import assert from 'assert'
import get from 'lodash-es/get.js'
import sumBy from 'lodash-es/sumBy.js'
import { getFreqVal } from '../src/plugins/mShare.mjs'


//refGet：改造前之取值式（逐行取自修改前 LayoutContentStats.vue），作缺陷事實與一般資料等價之對照
let refGet = (item, k) => get(item, `data.${k}`, 0)


describe('unit-staFreq (統計頁事件名取值, R-KEY-01)', function() {

    it('SF-001 事件名含 . 或 [ 或 /：取得該鍵之值（改造前的路徑式解析為 0）', function() {
        let item = { time: 't', data: { 'count': 9, 'api/get.user': 3, 'kpfun-a.b.c': 2, 'x[0]': 4, 'x': 1, 'kpfun-save/api': 5 } }
        for (let [k, v] of [['api/get.user', 3], ['kpfun-a.b.c', 2], ['x[0]', 4], ['x', 1], ['kpfun-save/api', 5]]) {
            assert.strictEqual(getFreqVal(item, k), v, k)
        }
        //缺陷事實（原式）：含 . 或 [ 之事件名被當路徑，恆得預設值 0
        assert.strictEqual(refGet(item, 'api/get.user'), 0)
        assert.strictEqual(refGet(item, 'kpfun-a.b.c'), 0)
        assert.strictEqual(refGet(item, 'x[0]'), 0)
        //缺陷事實（更糟）：data 內另有同名巢狀路徑時，原式取到錯誤的非 0 值（'a.b' 被解析為 data.a.b → 9），新式必得該鍵本身之值 2
        let nested = { data: { 'a.b': 2, 'a': { b: 9 } } }
        assert.strictEqual(refGet(nested, 'a.b'), 9)
        assert.strictEqual(getFreqVal(nested, 'a.b'), 2)
        //跨桶加總（統計頁 resampledData／sumLastN 之形式）
        let items = [{ data: { 'a.b': 2 } }, { data: { 'a.b': 3 } }, { data: { other: 7 } }]
        assert.strictEqual(sumBy(items, (it) => getFreqVal(it, 'a.b')), 5)
        assert.strictEqual(sumBy(items, (it) => refGet(it, 'a.b')), 0)
    })

    it('SF-002 缺鍵、無 data、item 非物件：回預設值（預設 0，可指定）', function() {
        assert.strictEqual(getFreqVal({ data: { a: 1 } }, 'b'), 0)
        assert.strictEqual(getFreqVal({ data: { a: 1 } }, 'b', -1), -1)
        for (let item of [undefined, null, 5, 'str', true, {}, { data: null }, { data: 'x' }, { data: 5 }, { data: undefined }]) {
            assert.strictEqual(getFreqVal(item, 'a'), 0, JSON.stringify(item))
        }
        //值為 0 回 0（非預設值）；值為 undefined 視同缺鍵
        assert.strictEqual(getFreqVal({ data: { a: 0 } }, 'a', 9), 0)
        assert.strictEqual(getFreqVal({ data: { a: undefined } }, 'a', 9), 9)
    })

    it('SF-003 原型鍵名：data 無自有此鍵時回預設值（不取繼承值）；有自有此鍵時回其值', function() {
        let names = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'length']
        for (let k of names) {
            assert.strictEqual(getFreqVal({ data: { a: 1 } }, k), 0, k)
        }
        //改造前：get(item, 'data.constructor', 0) 取得繼承之 Object 函數
        assert.strictEqual(typeof refGet({ data: { a: 1 } }, 'constructor'), 'function')
        //自有鍵（JSON 解析結果的 __proto__ 為自有資料屬性）
        let item = { data: JSON.parse('{"constructor":2,"__proto__":3,"toString":4,"length":5}') }
        assert.strictEqual(getFreqVal(item, 'constructor'), 2)
        assert.strictEqual(getFreqVal(item, '__proto__'), 3)
        assert.strictEqual(getFreqVal(item, 'toString'), 4)
        assert.strictEqual(getFreqVal(item, 'length'), 5)
    })

    it('SF-004 一般事件名（無 . 與 [ 且非原型鍵名）下與改造前取值式輸出相同（固定種子 200 組隨機資料）', function() {
        let seed = 20261020
        let rnd = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff
            return seed / 0x7fffffff
        }
        //含空白、中文、emoji、連字號者於原式同為單一鍵（無 . 與 [），應等價
        let names = ['kpfun-getApi', 'kpfun-saveApi', 'api-main', 'syncAndReplaceTabs', 'x', 'event_1', 'event-2', 'a/b/c', 'count', 'with space', '事件 一', 'e😀m', ' lead', 'trail ']
        for (let n = 0; n < 200; n++) {
            let data = {}
            for (let nm of names) {
                if (rnd() < 0.6) {
                    data[nm] = Math.floor(rnd() * 100)
                }
            }
            let item = rnd() < 0.1 ? { time: 't' } : { time: 't', data }
            for (let nm of [...names, 'absent']) {
                assert.strictEqual(getFreqVal(item, nm), refGet(item, nm), `${n} ${nm}`)
            }
        }
    })

})
