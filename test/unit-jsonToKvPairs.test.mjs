//unit：src/plugins/mShare.mjs 之 jsonToKvPairs（測試分頁以 API 定義之預設 Query／Headers JSON 預填表列；R-OBJ-ITER-01）
//規則：JSON 之鍵為使用端（API 定義者或外部同步）給定之任意字串，含 `length`（如分頁參數 { "start": 0, "length": 10 }）——
//一律依自有可列舉鍵走訪；改造前（LayoutContentTest.vue jsonToRows 以 lodash each 走訪）具非負整數 length 之物件改走索引 0..length-1：
//真實鍵被略過並產生 key 為 0..length-1、值為 'undefined' 之假列，length: 0 則整表為空。
import assert from 'assert'
import { spawnSync } from 'child_process'
import each from 'lodash-es/each.js'
import isestr from 'wsemi/src/isestr.mjs'
import isobj from 'wsemi/src/isobj.mjs'
import j2o from 'wsemi/src/j2o.mjs'
import { jsonToKvPairs } from '../src/plugins/mShare.mjs'


//refPairs：改造前之走訪（逐行取自修改前 jsonToRows，僅回傳鍵值對而非表列），作缺陷事實與一般資料等價之對照
function refPairs(jsonStr) {
    let rows = []
    if (!isestr(jsonStr)) {
        return rows
    }
    let obj = j2o(jsonStr)
    if (!isobj(obj)) {
        return rows
    }
    each(obj, function(v, k) {
        rows.push([k, String(v)])
    })
    return rows
}


describe('unit-jsonToKvPairs', function() {

    it('KV-001 含 length 鍵（分頁參數）：真實鍵與 length 皆為一般鍵，依原鍵序輸出（無 0..length-1 假列）', function() {
        assert.deepStrictEqual(jsonToKvPairs('{"start":0,"length":10}'), [['start', '0'], ['length', '10']])
        assert.deepStrictEqual(jsonToKvPairs('{"length":3,"a":"x"}'), [['length', '3'], ['a', 'x']])
        //length: 0 不得使整表為空；length 極大不得依其值迭代（立即返回）
        assert.deepStrictEqual(jsonToKvPairs('{"length":0,"a":"x"}'), [['length', '0'], ['a', 'x']])
        assert.deepStrictEqual(jsonToKvPairs('{"length":4294967295,"a":"x"}'), [['length', '4294967295'], ['a', 'x']])
        //length 之值非「非負整數」時（負數、小數、字串、null、布林、陣列、物件）本就不構成陣列樣，仍須與一般鍵同樣輸出
        for (let v of ['-1', '1.5', '"3"', 'null', 'true', '[]', '{}']) {
            let pairs = jsonToKvPairs(`{"length":${v},"a":"x"}`)
            assert.deepStrictEqual(pairs.map((p) => p[0]), ['length', 'a'], v)
            assert.strictEqual(pairs[1][1], 'x', v)
        }
        //缺陷事實（修改前）：走索引、真實鍵略過
        assert.deepStrictEqual(refPairs('{"start":0,"length":2}'), [[0, 'undefined'], [1, 'undefined']])
        assert.deepStrictEqual(refPairs('{"length":0,"a":"x"}'), [])
    })

    it('KV-005 length 極大(2^32-1)於子行程立即返回: 不依 length 之值空轉(修改前 each 空轉數十秒; 子行程逾時即失敗)', function() {
        let code = `import { jsonToKvPairs } from './src/plugins/mShare.mjs'; let t0 = Date.now(); let r = jsonToKvPairs(JSON.stringify({ length: 4294967295, a: 'x' })); console.log(JSON.stringify({ r, ms: Date.now() - t0 }))`
        let p = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: process.cwd(), timeout: 15000, killSignal: 'SIGKILL', encoding: 'utf8' })
        assert.strictEqual(p.error, undefined, `子行程應在 15 秒內結束: ${p.error && p.error.message}`)
        let o = JSON.parse(p.stdout.trim().split(/\r?\n/).pop())
        assert.deepStrictEqual(o.r, [['length', '4294967295'], ['a', 'x']])
        assert.ok(o.ms < 1000, `耗時 ${o.ms} ms`)
    })

    it('KV-002 一般資料：與改造前輸出相同（鍵序、值轉字串、巢狀值 String 化）', function() {
        let cases = [
            '{"a":1,"b":"x","c":true,"d":null,"e":{"f":1},"g":[1,2]}',
            '{"Authorization":"Bearer t","X-Id":"7"}',
            '{}',
        ]
        for (let s of cases) {
            assert.deepStrictEqual(jsonToKvPairs(s), refPairs(s), s)
        }
    })

    it('KV-003 非字串、空字串、解析失敗、非一般物件（陣列、純值）：回空陣列', function() {
        for (let v of [undefined, null, '', 5, {}, [], '[1,2]', '"abc"', '5', 'not json', '[{"a":1}]']) {
            assert.deepStrictEqual(jsonToKvPairs(v), [], String(v))
        }
    })

    it('KV-004 原型鍵名（__proto__、constructor）為一般鍵', function() {
        assert.deepStrictEqual(jsonToKvPairs('{"__proto__":1,"constructor":2}'), [['__proto__', '1'], ['constructor', '2']])
    })

})
