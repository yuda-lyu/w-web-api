//unit-publicApis：一般使用者取得之 API 清單的公開欄位白名單與投影（R-PUBLICAPIS-01，ADR-051）。
//白名單單一來源為 src/schema/contracts/apis.mjs 之 fieldsPublic；投影純函數為 server/pickPublicApis.mjs；procApis.getPublicApisList 於其上加查詢與失敗處理。
//本檔以字面值獨立列出「應公開」與「永不公開」之欄位（不由實作之常數衍生），實作若把憑證欄位加入白名單、或投影漏排除即紅。
//schema 欄位增減時強迫重新分類見 unit-contract C09／C10；與真實後端之整合見 api-publicApisList。
import assert from 'assert'
import procApis from '../server/procApis.mjs'
import { pickPublicRow, pickPublicRows } from '../server/pickPublicApis.mjs'
import ds from '../src/schema/index.mjs'
import { fieldsPublic } from '../src/schema/contracts/apis.mjs'


//應公開（API 識別與文件欄位）／永不公開（第三方憑證、測試設定、本系統擁有之其餘欄位、伺服器專有欄位）——字面值，與 schema 全欄位合計須涵蓋且不重疊
let PUBLIC = ['id', 'order', 'name', 'description', 'url', 'method', 'version', 'group', 'levels', 'keywords', 'state', 'creator', 'dataSource', 'mdInputParams', 'inputExample', 'mdOutputParams', 'outputExample']
let NEVER = ['tokens', 'authConfigJson', 'testBaseUrl', 'authType', 'defaultHeadersJson', 'defaultQueryJson', 'defaultBodyJson', 'contentType', 'timeCreate', 'timeUpdate', 'isActive', 'userIdUpdate', 'srcKey']
let sorted = (a) => [...a].sort()

//滿欄位列：每個欄位值為 `v-<欄位名>`；禁止欄位之值前綴 SECRET-（便於全文掃描）
let mkFullRow = (over = {}) => {
    let row = {}
    for (let k of ds.apis.keys) {
        row[k] = NEVER.includes(k) ? `SECRET-${k}` : `v-${k}`
    }
    row.isActive = 'y'
    return { ...row, ...over }
}


describe('unit-publicApis (公開欄位白名單與投影)', function() {

    it('P01 白名單 fieldsPublic ＝ 字面值 PUBLIC（17 欄，含主鍵 id，依 schema 宣告序）；不含任何 NEVER 欄位', function() {
        assert.deepStrictEqual(fieldsPublic, PUBLIC)
        assert.strictEqual(fieldsPublic.length, 17)
        for (let k of NEVER) {
            assert.ok(!fieldsPublic.includes(k), `${k} 不得公開`)
        }
        assert.strictEqual(new Set(fieldsPublic).size, fieldsPublic.length, '無重複')
    })

    it('P02 schema 全欄位（含主鍵）＝ PUBLIC ∪ NEVER 且不重疊（schema 新增欄位而未分類即紅；新欄位預設不公開，須在此與 unit-contract C09 明確分類後才可進白名單）', function() {
        assert.deepStrictEqual(sorted([...PUBLIC, ...NEVER]), sorted(ds.apis.keys))
        assert.deepStrictEqual(PUBLIC.filter((k) => NEVER.includes(k)), [])
    })

    it('P03 pickPublicRow：滿欄位列 → 恰為公開欄位（鍵序同白名單、值取自原列）；凡 NEVER 欄位之鍵與值皆不出現（逐欄掃描）', function() {
        let o = pickPublicRow(mkFullRow())
        assert.deepStrictEqual(Object.keys(o), PUBLIC)
        for (let k of PUBLIC) {
            assert.strictEqual(o[k], `v-${k}`, k)
        }
        let text = JSON.stringify(o)
        assert.ok(!text.includes('SECRET-'), `輸出不得含禁止欄位之值（實得 ${text}）`)
        for (let k of NEVER) {
            assert.ok(!(k in o), `不得含鍵 ${k}`)
        }
    })

    it('P04 pickPublicRow：逐一把「單一禁止欄位」設為哨兵值，輸出皆不含（防日後白名單漏排除任一個）', function() {
        for (let k of NEVER) {
            let row = mkFullRow()
            let o = pickPublicRow({ ...row, [k]: 'SECRET-ONLY-ONE' })
            assert.ok(!JSON.stringify(o).includes('SECRET-'), k)
        }
    })

    it('P05 pickPublicRow：缺欄之公開欄位補空字串（輸出形狀固定）；只讀列自身屬性，不讀原型鏈；多餘欄位不輸出', function() {
        let o = pickPublicRow({ id: 'x', name: 'n', extraField: 'e', tokens: 'SECRET-t' })
        assert.deepStrictEqual(Object.keys(o), PUBLIC)
        assert.strictEqual(o.id, 'x')
        assert.strictEqual(o.name, 'n')
        assert.strictEqual(o.url, '')
        let proto = { url: 'inherited-url', tokens: 'SECRET-inherited' }
        let child = Object.create(proto)
        child.id = 'c'
        let o2 = pickPublicRow(child)
        assert.strictEqual(o2.url, '', '原型鏈上的值不讀')
        assert.ok(!JSON.stringify(o2).includes('SECRET-'))
    })

    it('P06 pickPublicRows：只留 isActive 嚴格等於 \'y\'（\'n\'、空字串、缺欄、\'Y\'、true、1、null 皆排除，預設拒絕）；保持原順序；非物件／空物件項略過', function() {
        let noActive = mkFullRow({ id: 'd' })
        delete noActive.isActive
        let rows = [
            mkFullRow({ id: 'a', isActive: 'y' }),
            mkFullRow({ id: 'b', isActive: 'n' }),
            mkFullRow({ id: 'c', isActive: '' }),
            noActive,
            mkFullRow({ id: 'e', isActive: 'Y' }),
            mkFullRow({ id: 'f', isActive: true }),
            mkFullRow({ id: 'g', isActive: 1 }),
            mkFullRow({ id: 'h', isActive: null }),
            mkFullRow({ id: 'i', isActive: 'y' }),
            null,
            undefined,
            'str',
            42,
            {},
            [],
        ]
        let out = pickPublicRows(rows)
        assert.deepStrictEqual(out.map((x) => x.id), ['a', 'i'])
        assert.ok(!JSON.stringify(out).includes('SECRET-'))
    })

    it('P06b pickPublicRows：啟用值只讀列自身屬性——isActive \'y\' 只存在於原型鏈上之列排除（缺欄視為停用，與「只讀自身屬性」一致）', function() {
        let inherited = Object.assign(Object.create({ isActive: 'y' }), { id: 'p', name: 'x', tokens: 'SECRET-t' })
        assert.strictEqual(inherited.isActive, 'y', '前置：繼承值確為 y')
        let own = mkFullRow({ id: 'q', isActive: 'y' })
        let out = pickPublicRows([inherited, own])
        assert.deepStrictEqual(out.map((x) => x.id), ['q'])
        assert.ok(!JSON.stringify(out).includes('SECRET-'))
    })

    it('P07 pickPublicRows：非陣列（undefined、null、物件、字串）→ 空陣列；空陣列 → 空陣列', function() {
        for (let v of [undefined, null, {}, 'x', 5, true]) {
            assert.deepStrictEqual(pickPublicRows(v), [], String(v))
        }
        assert.deepStrictEqual(pickPublicRows([]), [])
    })

    describe('procApis.getPublicApisList（經 procOrm select，投影在其後）', function() {

        let mk = (procOrm, srLog = null) => procApis({ woItems: {}, procOrm, ds, lockSave: null, srLog, withTabLocks: null, guardWrite: null })

        it('P08 以 apis／select／{ isActive: \'y\' } 呼叫 procOrm，帶呼叫者 userId；回傳投影後之列（procOrm 縱使回了停用列與憑證，輸出亦不含）', async function() {
            let calls = []
            let procOrm = async (...args) => {
                calls.push(args)
                return [mkFullRow({ id: 'a' }), mkFullRow({ id: 'b', isActive: 'n' })]
            }
            let { getPublicApisList } = mk(procOrm)
            let out = await getPublicApisList('u-1')
            assert.deepStrictEqual(calls, [['u-1', 'apis', 'select', { isActive: 'y' }]])
            assert.deepStrictEqual(out.map((x) => x.id), ['a'])
            assert.deepStrictEqual(Object.keys(out[0]), PUBLIC)
            assert.ok(!JSON.stringify(out).includes('SECRET-'))
        })

        it('P09 procOrm 失敗（reject 字串／Error）→ reject 語系鍵 getDataError（不外洩原文），原文入 srLog（event api-getApisList-orm）', async function() {
            for (let err of ['failed to read data: SYNTH-ORM-SECRET', new Error('SYNTH-ORM-SECRET')]) {
                let logs = []
                let srLog = { error: (o) => logs.push(o) }
                let { getPublicApisList } = mk(async () => Promise.reject(err), srLog)
                let rejected = false
                try {
                    await getPublicApisList('u-1')
                }
                catch (e) {
                    rejected = true
                    assert.strictEqual(e, 'getDataError')
                }
                assert.ok(rejected)
                assert.strictEqual(logs.length, 1)
                assert.strictEqual(logs[0].event, 'api-getApisList-orm')
                assert.strictEqual(logs[0].err, 'getDataError')
            }
        })

        it('P10 procOrm 回非陣列 → 空陣列（不拋）', async function() {
            let { getPublicApisList } = mk(async () => undefined)
            assert.deepStrictEqual(await getPublicApisList('u-1'), [])
        })

    })

})
