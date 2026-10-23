//unit-syncApis：外部匯入（server/syncApis.mjs；原則 11、R-IMPORT-01、ADR-043）之邏輯單元測試——以記憶體替身取代 woItems／procOrm／withTabLocks／srLog，
//驗證：①整批驗證在任何資料庫呼叫與取鎖之前（全有或全無）②所有資料庫呼叫都在 apis 表鎖內且差異同步路徑不呼叫 delAll③寫入只含外部擁有欄位（本系統擁有欄位不寫）
//④新增／修改／刪除／不變之計數與配對（含一次性遷移補 srcKey，I15）⑤寫入中途失敗之補償順序與無法補償之明確回報（I12）⑥未注入表鎖 fail-closed
//⑦不提供呼叫端相容（原則 11、規格 §9、使用者 2026-10-23 裁示；ADR-046）：缺 srcKey、只送 id、srcKey 與 id 並送、混批 → 整批拒收（errRowInvalid／idNotAllowed）、零寫入、零取鎖（I13）。
//與真實 WServOrm／lmdb、真實 HTTP 入口之整合見 api-import。
import assert from 'assert'
import pmKeyMutex from 'wsemi/src/pmKeyMutex.mjs'
import createSyncApis from '../server/syncApis.mjs'
import { fieldsExternal, fieldsLocal } from '../src/schema/contracts/apis.mjs'


let G = 'ext'
let clone = (o) => JSON.parse(JSON.stringify(o))
let sorted = (a) => [...a].sort()

//mkEnv: 記憶體替身——rows 為庫內列(Map id → 列); calls 記錄所有 ORM／procOrm 呼叫; inLock 檢查所有呼叫皆在表鎖內
function mkEnv(initial = [], opt = {}) {
    let rows = new Map(initial.map((r) => [r.id, clone(r)]))
    let calls = []
    let lockCalls = []
    let violations = []
    let inLock = false
    let kmx = pmKeyMutex()
    let failOn = opt.failOn || {} //{ procInsert: n, procSave: n, procDel: n, ormDel: n, ormInsert: n, select: n, ormDelOk0: n(補償刪除以逐筆 ok:0 resolve 且不實際刪除，同真實 LMDB 之單筆失敗形狀) }
    let failMsg = opt.failMsg || 'failed to delete data' //procDel 失敗之原文(含主鍵時用以驗 log 遮蔽)
    let logs = []
    let srLog = { info: (o) => logs.push(['info', o]), warn: (o) => logs.push(['warn', o]), error: (o) => logs.push(['error', o]) }

    let rec = (name, arg) => {
        calls.push([name, arg])
        if (!inLock) {
            violations.push(name)
        }
    }
    let boom = (k) => {
        if (failOn[k] > 0) {
            failOn[k]--
            return true
        }
        return false
    }
    let withTabLocks = (tables, fn) => {
        lockCalls.push(tables)
        return kmx(tables.join(','), async () => {
            inLock = true
            try {
                return await fn()
            }
            finally {
                inLock = false
            }
        })
    }
    let woItems = {
        apis: {
            select: async (q) => {
                rec('select', q)
                if (boom('select')) {
                    return Promise.reject(new Error('orm select fail'))
                }
                let all = [...rows.values()]
                if (q.group !== undefined) {
                    return clone(all.filter((r) => r.group === q.group))
                }
                if (q.id && q.id.$in) {
                    return clone(all.filter((r) => q.id.$in.includes(r.id)))
                }
                return clone(all)
            },
            insert: async (rs) => {
                rec('orm.insert', rs.map((r) => r.id))
                if (boom('ormInsert')) {
                    return Promise.reject(new Error('orm insert fail'))
                }
                for (let r of rs) {
                    if (!rows.has(r.id)) {
                        rows.set(r.id, clone(r))
                    }
                }
            },
            del: async (rs) => {
                rec('orm.del', rs.map((r) => r.id))
                if (boom('ormDel')) {
                    return Promise.reject(new Error('orm del fail'))
                }
                if (boom('ormDelOk0')) {
                    return rs.map((r) => ({ id: r.id, n: 0, nDeleted: 0, ok: 0 })) //resolve 但逐筆失敗、列仍在
                }
                for (let r of rs) {
                    rows.delete(r.id)
                }
                return rs.map((r) => ({ id: r.id, n: 1, nDeleted: 1, ok: 1 }))
            },
            delAll: async (q) => {
                rec('orm.delAll', q)
                for (let [k, r] of rows) {
                    if (r.group === q.group) {
                        rows.delete(k)
                    }
                }
            },
        },
    }
    let seq = 0
    let procOrm = async (userId, tab, mode, input, o) => {
        rec(`proc.${mode}`, { userId, ids: input.map((r) => r.id), keys: input.map((r) => Object.keys(r)), opt: o })
        if (mode === 'insert') {
            if (boom('procInsert')) {
                return Promise.reject('failed to insert data')
            }
            for (let r of input) {
                let id = r.id === undefined ? `gen-${++seq}` : r.id
                rows.set(id, { ...clone(r), id, timeCreate: 'T0', timeUpdate: 'T0', userIdUpdate: userId })
            }
            return input.map((r) => ({ id: r.id }))
        }
        if (mode === 'save') {
            if (boom('procSave')) {
                return Promise.reject('failed to save data')
            }
            for (let r of input) {
                assert.ok(rows.has(r.id), 'mustExist: 修改只改不增')
                rows.set(r.id, { ...rows.get(r.id), ...clone(r), timeUpdate: 'T1', userIdUpdate: userId })
            }
            return input.map((r) => ({ id: r.id }))
        }
        if (mode === 'del') {
            if (boom('procDel')) {
                return Promise.reject(failMsg)
            }
            for (let r of input) {
                assert.ok(rows.has(r.id))
                rows.delete(r.id)
            }
            return input.map(() => ({ n: 1, nDeleted: 1, ok: 1 }))
        }
        return Promise.reject('unsupported')
    }
    return { rows, calls, lockCalls, violations, logs, deps: { woItems, procOrm, withTabLocks, srLog }, snapshot: () => sorted([...rows.values()].map((r) => JSON.stringify(Object.entries(r).sort()))) }
}

//dbRow: 庫內既有外部列
let dbRow = (id, k, extra = {}) => ({
    id,
    srcKey: k,
    group: G,
    order: '',
    name: `name-${k}`,
    description: `desc-${k}`,
    url: `http://x/${k}`,
    method: 'get',
    version: 'v1',
    levels: 'L',
    keywords: 'kw',
    state: 'ok',
    creator: 'c',
    dataSource: 'd',
    mdInputParams: '',
    inputExample: '',
    mdOutputParams: '',
    outputExample: '',
    tokens: 'MY',
    testBaseUrl: '',
    authType: 'bearer',
    authConfigJson: '',
    defaultHeadersJson: '',
    defaultQueryJson: '',
    defaultBodyJson: '',
    contentType: 'text/plain',
    timeCreate: 'T-create',
    timeUpdate: 'T-update',
    userIdUpdate: 'someone',
    isActive: 'y',
    ...extra,
})
//batchRow: 與 dbRow 同內容之批次列
let batchRow = (k, extra = {}) => ({ srcKey: k, name: `name-${k}`, description: `desc-${k}`, url: `http://x/${k}`, method: 'get', version: 'v1', levels: 'L', keywords: 'kw', state: 'ok', creator: 'c', dataSource: 'd', ...extra })

let reject = async (p) => {
    let r = null
    await p.then((v) => {
        throw new Error(`應 reject（實得 ${JSON.stringify(v)}）`)
    }, (e) => {
        r = e
    })
    return r
}


describe('unit-syncApis (外部匯入 srcKey 差異同步之邏輯)', function() {

    it('U01 整批驗證在任何資料庫呼叫與取鎖之前：缺／空／非字串／含標記／過長／重複 srcKey、列帶 id、缺必填欄位、非物件列、空批次、無效 group → reject 固定鍵（errRowInvalid＝規格之 srcKeyInvalid／idNotAllowed／…），ORM 呼叫 0 次、取鎖 0 次（I7、I8、I13）', async function() {
        let ok = batchRow('good')
        let cases = [
            ['srcKey 空字串', [ok, batchRow('x', { srcKey: '' })], 'errRowInvalid'],
            ['srcKey null（提供空值不得降級為無鍵列；sol#1）', [ok, batchRow('x', { srcKey: null })], 'errRowInvalid'],
            ['srcKey null 且帶 id（不得退回以 id 代替）', [ok, batchRow('x', { srcKey: null, id: 'some-id' })], 'errRowInvalid'],
            ['srcKey 數字', [ok, batchRow('x', { srcKey: 7 })], 'errRowInvalid'],
            ['srcKey 布林', [ok, batchRow('x', { srcKey: true })], 'errRowInvalid'],
            ['srcKey 物件', [ok, batchRow('x', { srcKey: {} })], 'errRowInvalid'],
            ['srcKey 含標記', [ok, batchRow('<img src=x onerror=1>')], 'errRowInvalid'],
            ['srcKey 含白名單標籤（clearXSS 不改寫但仍為標記；sol#10）', [ok, batchRow('<b>key</b>')], 'errRowInvalid'],
            ['srcKey 為孤立代理字元（儲存編碼往返會改寫；sol#3）', [ok, batchRow('\ud800')], 'errRowInvalid'],
            ['srcKey 為 base64: 空值（還原後為空字串）', [ok, batchRow('x', { srcKey: 'base64:' })], 'errRowInvalid'],
            ['缺 srcKey（無該欄；不提供相容，I13）', [ok, { name: 'n', url: 'u' }], 'errRowInvalid'],
            ['缺 srcKey 而只送 id（不得以 id 代替，I13）', [ok, { id: 'some-id', name: 'n', url: 'u' }], 'errRowInvalid'],
            ['混批：前列合法、後列缺 srcKey（整批拒收，不得部分寫入，I13）', [ok, batchRow('good2'), { name: 'n', url: 'u' }], 'errRowInvalid'],
            ['混批：前列缺 srcKey、後列合法', [{ name: 'n', url: 'u' }, ok, batchRow('good2')], 'errRowInvalid'],
            ['srcKey 與 id 並送（外部不得指定內部 id，I13）', [ok, batchRow('x', { id: 'forged' })], 'idNotAllowed'],
            ['id 為數字', [ok, batchRow('x', { id: 5 })], 'idNotAllowed'],
            ['id 為空字串（仍屬「帶 id」）', [ok, batchRow('x', { id: '' })], 'idNotAllowed'],
            ['id 為 null（仍屬「帶 id」）', [ok, batchRow('x', { id: null })], 'idNotAllowed'],
            ['混批：只有後列帶 id', [ok, batchRow('y'), batchRow('x', { id: 'forged' })], 'idNotAllowed'],
            ['id 為物件', [ok, batchRow('x', { id: {} })], 'idNotAllowed'],
            ['id 為陣列', [ok, batchRow('x', { id: [] })], 'idNotAllowed'],
            ['id 為 false', [ok, batchRow('x', { id: false })], 'idNotAllowed'],
            ['優先序：srcKey 含標記且帶 id → errRowInvalid（欄位／來源鍵缺陷先於 idNotAllowed）', [ok, batchRow('<b>k</b>', { id: null })], 'errRowInvalid'],
            ['優先序：srcKey 超長且帶 id → errRowInvalid', [ok, batchRow('k'.repeat(1979), { id: 'forged' })], 'errRowInvalid'],
            ['優先序：同批 srcKey 重複且其中一列帶 id → errRowInvalid', [batchRow('d', { id: 'forged' }), batchRow('d')], 'errRowInvalid'],
            ['優先序：前列帶 id、後列缺 name → errRowInvalid', [batchRow('a', { id: 'forged' }), { srcKey: 'b', url: 'u' }], 'errRowInvalid'],
            ['name 經字元清理後為空（必填檢核對最終寫入值；sol#2）', [ok, batchRow('x', { name: '<!--x-->' })], 'errRowInvalid'],
            ['url 經字元清理後為空', [ok, batchRow('x', { url: '<!--u-->' })], 'errRowInvalid'],
            ['外部欄位為物件（容器值會被 ORM 深層合併而使重送恆有改變；sol#4）', [ok, batchRow('x', { description: { a: 1 } })], 'errRowInvalid'],
            ['外部欄位為陣列', [ok, batchRow('x', { keywords: ['a'] })], 'errRowInvalid'],
            ['order 為物件', [ok, batchRow('x', { order: {} })], 'errRowInvalid'],
            ['欄位為 NaN', [ok, batchRow('x', { version: NaN })], 'errRowInvalid'],
            ['srcKey 超長', [ok, batchRow('k'.repeat(1979))], 'errRowInvalid'],
            ['srcKey 重複', [batchRow('d'), batchRow('d')], 'errRowInvalid'],
            ['缺 name', [ok, { srcKey: 'k', url: 'u' }], 'errRowInvalid'],
            ['缺 url', [ok, { srcKey: 'k', name: 'n' }], 'errRowInvalid'],
            ['非物件列', [ok, 1], 'errRowInvalid'],
            ['空批次', [], 'errRowsInvalid'],
            ['rows 非陣列', 'x', 'errRowsInvalid'],
        ]
        for (let [label, rows, key] of cases) {
            let env = mkEnv([dbRow('i1', 'a')])
            let sync = createSyncApis(env.deps)
            let e = await reject(sync('u', { group: G, rows }))
            assert.strictEqual(e, key, `${label}: ${e}`)
            assert.strictEqual(env.calls.length, 0, `${label}: 不得有任何 ORM 呼叫（零寫入）`)
            assert.strictEqual(env.lockCalls.length, 0, `${label}: 驗證失敗不取鎖`)
            assert.ok(!JSON.stringify(env.logs).includes('forged') && !JSON.stringify(env.logs).includes('some-id'), `${label}: srLog 不回顯 id 值`)
        }
        for (let g of ['', null, undefined, 5, 'a<b', '\ud800']) {
            let env = mkEnv()
            let e = await reject(createSyncApis(env.deps)('u', { group: g, rows: [ok] }))
            assert.strictEqual(e, 'errGroupInvalid', `group=${JSON.stringify(g)}`)
            assert.strictEqual(env.calls.length, 0)
        }
    })

    it('U02 所有 ORM／procOrm 呼叫都在 withTabLocks([apis]) 內（取鎖恰 1 次）；差異同步路徑不呼叫 delAll、不直寫 woItems（寫入一律經 procOrm）（A1、ADR-016）', async function() {
        let env = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b'), dbRow('i3', 'c')])
        let r = await createSyncApis(env.deps)('app', { group: G, rows: [batchRow('a', { name: 'changed' }), batchRow('c'), batchRow('n')] })
        assert.deepStrictEqual(r, { nAdd: 1, nUpdate: 1, nDel: 1, nSame: 1 })
        assert.deepStrictEqual(env.lockCalls, [['apis']])
        assert.deepStrictEqual(env.violations, [], '無任何鎖外之呼叫')
        let names = env.calls.map((c) => c[0])
        assert.ok(!names.includes('orm.delAll'), '不再 delAll')
        assert.ok(!names.includes('orm.insert') && !names.includes('orm.del'), '不直寫 ORM（補償以外）')
        assert.deepStrictEqual(names.filter((n) => n.startsWith('proc.')), ['proc.insert', 'proc.save', 'proc.del'])
        for (let c of env.calls.filter((x) => x[0].startsWith('proc.'))) {
            assert.strictEqual(c[1].userId, 'app', '操作者為 app 使用者')
        }
    })

    it('U03 寫入只含外部擁有欄位與身分鍵：修改列鍵 ⊆ {id, srcKey} ∪ 外部擁有欄位；新增列另含本系統擁有欄位之初始空字串與 isActive；絕不含 timeCreate／timeUpdate／userIdUpdate（C4b、A5）', async function() {
        let env = mkEnv([dbRow('i1', 'a')])
        await createSyncApis(env.deps)('app', {
            group: G,
            rows: [
                batchRow('a', { name: 'changed', tokens: 'EVIL', authType: 'none', contentType: 'x', timeCreate: '1999', isActive: 'n', userIdUpdate: 'forged' }),
                batchRow('n', { tokens: 'EVIL', authType: 'none', contentType: 'x', timeCreate: '1999', isActive: 'n', userIdUpdate: 'forged' }),
            ]
        })
        let save = env.calls.find((c) => c[0] === 'proc.save')[1]
        assert.deepStrictEqual(save.ids, ['i1'])
        assert.deepStrictEqual(sorted(save.keys[0]), sorted(['id', 'srcKey', ...fieldsExternal]), '修改列只含外部擁有欄位')
        assert.deepStrictEqual(save.opt, { mustExist: true }, '修改只改不增')
        let ins = env.calls.find((c) => c[0] === 'proc.insert')[1]
        assert.deepStrictEqual(sorted(ins.keys[0]), sorted(['id', 'srcKey', 'isActive', ...fieldsExternal, ...fieldsLocal]))
        let a = env.rows.get('i1')
        for (let f of fieldsLocal) {
            assert.strictEqual(a[f], dbRow('i1', 'a')[f], `本系統擁有欄位 ${f} 維持庫內值`)
        }
        assert.strictEqual(a.timeCreate, 'T-create')
        assert.strictEqual(a.isActive, 'y')
        let n = [...env.rows.values()].find((r) => r.srcKey === 'n')
        assert.ok(typeof n.id === 'string' && n.id !== '' && n.id !== 'n', '新增列之內部 id 由本系統產生，不等於來源鍵（外部不得指定 id，帶 id 之列整批拒收見 U01）')
        for (let f of fieldsLocal) {
            assert.strictEqual(n[f], '', `新增列 ${f} 初始為空字串`)
        }
        assert.strictEqual(n.isActive, 'y')
    })

    it('U04 配對與計數：srcKey 同則同一列（id 不變）；批次無者刪除；後台自建（srcKey 空）之同群組列以 id 為有效來源鍵，批次無者亦刪除；他群組之列不選出、不動（I2～I5、I9、I10）', async function() {
        let env = mkEnv([
            dbRow('i1', 'a'), dbRow('i2', 'b'), dbRow('i3', 'c'),
            dbRow('ui-1', '', { srcKey: '' }), //後台自建列（同 group、無 srcKey）
            dbRow('o1', 'a', { group: 'other' }), //他群組同 srcKey
        ])
        let r = await createSyncApis(env.deps)('app', { group: G, rows: [batchRow('a'), batchRow('b', { description: 'x' }), batchRow('z')] })
        assert.deepStrictEqual(r, { nAdd: 1, nUpdate: 1, nDel: 2, nSame: 1 }, 'c 與 ui-1 被刪')
        assert.ok(env.rows.has('i1') && env.rows.has('i2'), 'a、b 保留 id')
        assert.ok(!env.rows.has('i3') && !env.rows.has('ui-1'))
        assert.deepStrictEqual(env.rows.get('o1'), dbRow('o1', 'a', { group: 'other' }), '他群組不動')
    })

    it('U05 內容相同重送 → 零寫入（procOrm／ORM 寫入呼叫 0 次）、回 nSame 全數；clearXSS 改寫後之值（庫內為 a&lt;b）與批次原值（a<b）視為相同（I1）', async function() {
        let env = mkEnv([dbRow('i1', 'a', { name: 'a&lt;b' }), dbRow('i2', 'b')])
        let r = await createSyncApis(env.deps)('app', { group: G, rows: [batchRow('a', { name: 'a<b' }), batchRow('b')] })
        assert.deepStrictEqual(r, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 2 })
        assert.deepStrictEqual(env.calls.filter((c) => c[0] !== 'select'), [], '零寫入')
    })

    //legacy: 升版前既有之外部列——無 srcKey 欄（舊同步寫入）
    let legacyRow = (id, extra = {}) => {
        let row = dbRow(id, id, extra)
        delete row.srcKey
        return row
    }

    it('U06 一次性遷移補 srcKey（I15）：既有列無 srcKey，批次 srcKey 等於其 id → 視為同一列、於鎖內補 srcKey；id 不變、本系統擁有欄位與 timeCreate 保留；內容相同只補 srcKey（寫入 { id, srcKey }）、計入 nSame 不計 nUpdate；內容不同為修改（計 nUpdate）', async function() {
        //內容相同：只補 srcKey
        let env = mkEnv([legacyRow('legacy-2')])
        let r = await createSyncApis(env.deps)('app', { group: G, rows: [batchRow('legacy-2')] })
        assert.deepStrictEqual(r, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
        let save = env.calls.find((c) => c[0] === 'proc.save')[1]
        assert.deepStrictEqual(save.keys, [['id', 'srcKey']], '只補 srcKey，不改外部擁有欄位')
        assert.deepStrictEqual(save.opt, { mustExist: true })
        assert.deepStrictEqual(env.lockCalls, [['apis']], '補值在 apis 表鎖內')
        assert.deepStrictEqual(env.violations, [])
        let row = env.rows.get('legacy-2')
        assert.strictEqual(row.srcKey, 'legacy-2')
        assert.strictEqual(row.id, 'legacy-2', 'id 不變')
        for (let f of fieldsLocal) {
            assert.strictEqual(row[f], legacyRow('legacy-2')[f], `本系統擁有欄位 ${f} 保留`)
        }
        assert.strictEqual(row.timeCreate, 'T-create')
        assert.strictEqual(env.rows.size, 1)
        //內容不同：修改並同時補 srcKey
        let env2 = mkEnv([legacyRow('legacy-1')])
        let r2 = await createSyncApis(env2.deps)('app', { group: G, rows: [batchRow('legacy-1', { name: 'renamed' })] })
        assert.deepStrictEqual(r2, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 })
        assert.strictEqual(env2.rows.get('legacy-1').srcKey, 'legacy-1')
        assert.strictEqual(env2.rows.get('legacy-1').name, 'renamed')
        assert.strictEqual(env2.rows.get('legacy-1').tokens, 'MY', '本系統擁有欄位保留')
        //相容期所寫之無鍵列（srcKey 為空字串）亦同
        let env3 = mkEnv([dbRow('legacy-3', '', { srcKey: '', name: 'name-legacy-3', url: 'http://x/legacy-3', description: 'desc-legacy-3' })])
        let r3 = await createSyncApis(env3.deps)('app', { group: G, rows: [batchRow('legacy-3')] })
        assert.deepStrictEqual(r3, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
        assert.strictEqual(env3.rows.get('legacy-3').srcKey, 'legacy-3')
        //補值後再送同一批：零寫入（遷移只發生一次）
        let r4 = await createSyncApis(env.deps)('app', { group: G, rows: [batchRow('legacy-2')] })
        assert.deepStrictEqual(r4, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
        assert.strictEqual(env.calls.filter((c) => c[0].startsWith('proc.')).length, 1, '第二次無寫入')
    })

    it('U07 遷移之其餘（I15）：對不上者依差異同步（批次無者刪舊、批次有而庫無者增新）；已有 srcKey 之列其後只認 srcKey（批次 srcKey 等於其 id 不配對）；他群組之列（含 id 等於批次 srcKey 者）不受影響', async function() {
        //無鍵列 u1、u2 與有鍵列 i1(srcKey=a)；他群組列 o9
        let env = mkEnv([legacyRow('u1'), legacyRow('u2'), dbRow('i1', 'a'), dbRow('o9', 'q', { group: 'other' })])
        let r = await createSyncApis(env.deps)('app', { group: G, rows: [batchRow('u1'), batchRow('i1'), batchRow('o9')] })
        //u1 命中補鍵（同內容）；u2 批次無 → 刪；a 批次無 → 刪（批次 srcKey 'i1' 不等於 a，亦因其已有 srcKey 而不以 id 配對）；i1、o9 皆為新增（srcKey 與他列之 id 同值不構成配對）
        assert.deepStrictEqual(r, { nAdd: 2, nUpdate: 0, nDel: 2, nSame: 1 })
        assert.strictEqual(env.rows.get('u1').srcKey, 'u1')
        assert.ok(!env.rows.has('u2'), '對不上之無鍵列刪除')
        assert.ok(!env.rows.has('i1'), '已有 srcKey 之列不再以 id 配對：srcKey=a 之列因批次無 a 而刪除')
        assert.deepStrictEqual(env.rows.get('o9'), dbRow('o9', 'q', { group: 'other' }), '他群組之列不動')
        let added = [...env.rows.values()].filter((v) => v.group === G && (v.srcKey === 'i1' || v.srcKey === 'o9'))
        assert.strictEqual(added.length, 2)
        for (let v of added) {
            assert.notStrictEqual(v.id, v.srcKey, '新增列之 id 由本系統產生')
            assert.ok(v.id !== 'i1' && v.id !== 'o9')
        }
        let mixed = (env.logs.filter((l) => l[0] === 'warn' && l[1].event === 'syncAndReplaceTabs-delNoSrcKey'))
        assert.strictEqual(mixed.length, 1, '刪除無 srcKey 之列須記 warn（不靜默）')
        assert.strictEqual(mixed[0][1].n, 1)
    })

    it('U20 遷移補 srcKey 之後下一步（刪除）失敗 → 補償還原：被補鍵之舊列回到「無 srcKey」原狀（連同本地欄位與時間）、被刪列仍在、庫內完全回到匯入前', async function() {
        let env = mkEnv([legacyRow('L'), dbRow('d1', 'd')], { failOn: { procDel: 1 } })
        let before = env.snapshot()
        let e = await reject(createSyncApis(env.deps)('app', { group: G, rows: [batchRow('L')] })) //L 補鍵（stage 2）、d1 刪除失敗（stage 3）
        assert.strictEqual(e, 'saveWriteFail')
        assert.deepStrictEqual(env.snapshot(), before, '補鍵已寫入後之失敗亦完整還原')
        assert.ok(!('srcKey' in env.rows.get('L')), 'L 回到無 srcKey 欄之原狀')
        assert.deepStrictEqual(env.violations, [], '補償在鎖內')
    })

    it('U21 srcKey 為 base64: 前綴者先還原再配對（與所有欄位同）：舊 id 字面值為 base64:YQ== 者，批次須送 base64: 包裝後之 srcKey 才配得上；直接送字面值 → 還原為 a，不配對（刪舊增新）', async function() {
        let id = 'base64:YQ=='
        let wrapped = 'base64:' + Buffer.from(id, 'utf8').toString('base64')
        let env = mkEnv([legacyRow(id)])
        let r = await createSyncApis(env.deps)('app', { group: G, rows: [batchRow(wrapped, { name: `name-${id}`, url: `http://x/${id}`, description: `desc-${id}` })] })
        assert.deepStrictEqual(r, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 }, '包裝後之 srcKey 還原為舊 id，視為同一列')
        assert.strictEqual(env.rows.get(id).srcKey, id, '補上之 srcKey 為還原後之字面值')
        let env2 = mkEnv([legacyRow(id)])
        let r2 = await createSyncApis(env2.deps)('app', { group: G, rows: [batchRow(id)] })
        assert.deepStrictEqual(r2, { nAdd: 1, nUpdate: 0, nDel: 1, nSame: 0 }, '字面值被還原為 a，對不上舊 id')
        assert.ok([...env2.rows.values()].some((v) => v.srcKey === 'a'))
    })

    it('U08 庫內同群組有效來源鍵重複（無法唯一配對）→ errRowInvalid、零寫入，不靜默刪改', async function() {
        let env = mkEnv([dbRow('i1', 'a'), dbRow('x', '', { srcKey: undefined })])
        env.rows.get('x').id = 'x'
        delete env.rows.get('x').srcKey
        env.rows.get('i1').srcKey = 'x' //有效來源鍵 x 同時屬於 i1（srcKey）與 x（以 id）
        let e = await reject(createSyncApis(env.deps)('app', { group: G, rows: [batchRow('x')] }))
        assert.strictEqual(e, 'errRowInvalid')
        assert.deepStrictEqual(env.calls.filter((c) => c[0].startsWith('proc.') || c[0].startsWith('orm.')), [])
    })

    it('U09 中途失敗補償（I12）：insert／save／del 任一步失敗 → reject saveWriteFail，庫內回到匯入前（含被改列之原值、被刪列、新增列移除）', async function() {
        for (let k of ['procInsert', 'procSave', 'procDel']) {
            let env = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b'), dbRow('i3', 'c')], { failOn: { [k]: 1 } })
            let before = env.snapshot()
            let e = await reject(createSyncApis(env.deps)('app', { group: G, rows: [batchRow('a', { name: 'changed' }), batchRow('c'), batchRow('n')] })) //改 a、刪 b、增 n
            assert.strictEqual(e, 'saveWriteFail', `${k}: ${e}`)
            assert.deepStrictEqual(env.snapshot(), before, `${k} 失敗後庫內完全回到匯入前`)
            assert.deepStrictEqual(env.violations, [], '補償亦在鎖內')
        }
    })

    it('U10 補償亦失敗 → 仍 reject saveWriteFail（不回成功）並記 restoreFail（供人工處置，不含列內容值）', async function() {
        let env = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b')], { failOn: { procDel: 1, ormDel: 1 } })
        let e = await reject(createSyncApis(env.deps)('app', { group: G, rows: [batchRow('a')] }))
        assert.strictEqual(e, 'saveWriteFail')
        let ev = env.logs.filter((l) => l[0] === 'error' && l[1].event === 'syncAndReplaceTabs-restoreFail')
        assert.strictEqual(ev.length, 1)
        assert.ok(!JSON.stringify(env.logs).includes('name-a') && !JSON.stringify(env.logs).includes('desc-'), 'log 不含值')
    })

    it('U11 不提供相容（I13）：混批中任一列缺 srcKey（無該欄／只送 id）或帶 id → 整批拒收、庫內完全不變（含有鍵且命中之列及其本系統擁有欄位）、不 delAll、不取鎖、不留舊相容分支之警告事件', async function() {
        let rowsBad = {
            '缺 srcKey（無 srcKey 亦無 id）': [batchRow('a'), { name: 'k1', url: 'http://k/1' }, batchRow('with-key')],
            '只送 id': [batchRow('a'), { id: 'legacy-x', name: 'k2', url: 'http://k/2' }],
            'srcKey 與 id 並送': [batchRow('a'), batchRow('b', { id: 'i2' })],
        }
        let want = { '缺 srcKey（無 srcKey 亦無 id）': 'errRowInvalid', '只送 id': 'errRowInvalid', 'srcKey 與 id 並送': 'idNotAllowed' }
        for (let [label, rows] of Object.entries(rowsBad)) {
            let env = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b'), dbRow('o1', 'z', { group: 'other' })])
            let before = env.snapshot()
            let e = await reject(createSyncApis(env.deps)('app', { group: G, rows }))
            assert.strictEqual(e, want[label], label)
            assert.deepStrictEqual(env.snapshot(), before, `${label}: 庫內完全不變`)
            assert.strictEqual(env.calls.length, 0, `${label}: 零 ORM 呼叫（含 delAll）`)
            assert.strictEqual(env.lockCalls.length, 0, `${label}: 不取鎖`)
            assert.ok(!env.logs.some((l) => l[1].event === 'syncAndReplaceTabs-noSrcKey' || l[1].event === 'syncAndReplaceTabs-idAsSrcKey'), `${label}: 相容分支之警告事件已不存在`)
            assert.ok(env.logs.some((l) => l[0] === 'error' && l[1].event === 'syncAndReplaceTabs' && l[1].err === want[label]), `${label}: 拒收事件入 srLog`)
        }
        //srLog 之 idNotAllowed 事件帶列索引與欄位名，不帶值
        let env = mkEnv([dbRow('i1', 'a')])
        await reject(createSyncApis(env.deps)('app', { group: G, rows: [batchRow('a'), batchRow('b', { id: 'SECRET-ID' })] }))
        let ev = env.logs.find((l) => l[1].err === 'idNotAllowed')[1]
        assert.deepStrictEqual({ index: ev.index, field: ev.field }, { index: 1, field: 'id' })
        assert.ok(!JSON.stringify(env.logs).includes('SECRET-ID'))
        //全部帶 srcKey 之正常批次不受影響（同一批之有鍵列照常差異同步、不 delAll）
        let env2 = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b')])
        let r = await createSyncApis(env2.deps)('app', { group: G, rows: [batchRow('a'), batchRow('k1')] })
        assert.deepStrictEqual(r, { nAdd: 1, nUpdate: 0, nDel: 1, nSame: 1 })
        assert.ok(!env2.calls.some((c) => c[0] === 'orm.delAll'))
        assert.deepStrictEqual(env2.rows.get('i1'), dbRow('i1', 'a'), '有鍵且命中之列完全不動')
        //再送同一批 → 全部不變（來源鍵穩定時冪等，無「每次新增」之列）
        let r2 = await createSyncApis(env2.deps)('app', { group: G, rows: [batchRow('a'), batchRow('k1')] })
        assert.deepStrictEqual(r2, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 2 })
        //失敗補償（正常批次）
        let env3 = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b')], { failOn: { procInsert: 1 } })
        let before3 = env3.snapshot()
        let e3 = await reject(createSyncApis(env3.deps)('app', { group: G, rows: [batchRow('a'), batchRow('k1')] }))
        assert.strictEqual(e3, 'saveWriteFail')
        assert.deepStrictEqual(env3.snapshot(), before3)
    })

    it('U13 欄位型別與正規化：有限數字／布林轉字串存入（前端以字串處理）；含孤立代理字元之外部欄位正規化為 U+FFFD 且重送不誤判有改變；含標記之值以清理後之值比對（sol#3、#4）', async function() {
        let env = mkEnv()
        let rows = [batchRow('t1', { method: 7, version: true, order: 3, description: 'x\ud800y', name: 'a<b' })]
        let r = await createSyncApis(env.deps)('app', { group: G, rows })
        assert.deepStrictEqual(r, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 })
        let t1 = [...env.rows.values()][0]
        assert.strictEqual(t1.method, '7')
        assert.strictEqual(t1.version, 'true')
        assert.strictEqual(t1.order, 3, 'order 為數字時維持數字')
        assert.strictEqual(t1.description, 'x�y', '孤立代理字元正規化為 U+FFFD（儲存編碼往返後的值）')
        //匯入前先套與 ORM 相同之字元清理（a<b → a&lt;b），寫入值與 ORM 儲存值一致，重送同一批 → 全部不變
        assert.strictEqual(t1.name, 'a&lt;b')
        let r2 = await createSyncApis(env.deps)('app', { group: G, rows })
        assert.deepStrictEqual(r2, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 }, '重送不誤判有改變')
        assert.deepStrictEqual(env.calls.filter((c) => c[0].startsWith('proc.')).length, 1, '第二次無寫入（只有第一次之 insert）')
    })

    it('U14 大批次 2500 列：一次寫入、不再有「既有主鍵衝突」之 $in 查詢（srcKey 不指定內部 id，無此檢查）；補償之 del／回讀分批（每批 ≤ 1000；sol#9）', async function() {
        let env = mkEnv()
        let rows = []
        for (let k = 0; k < 2500; k++) {
            rows.push({ srcKey: `n${k}`, name: `n${k}`, url: 'http://x' })
        }
        let r = await createSyncApis(env.deps)('app', { group: G, rows })
        assert.deepStrictEqual(r, { nAdd: 2500, nUpdate: 0, nDel: 0, nSame: 0 })
        let sizes = env.calls.filter((c) => c[0] === 'select' && c[1].id && c[1].id.$in).map((c) => c[1].id.$in.length)
        assert.deepStrictEqual(sizes, [], '成功路徑無 $in 查詢')
        //補償：insert 失敗後之 del／回讀亦不超過 1000 一批
        let env2 = mkEnv([], { failOn: { procInsert: 1 } })
        let e = await reject(createSyncApis(env2.deps)('app', { group: G, rows: [{ srcKey: 'k', name: 'k', url: 'u' }, ...rows.slice(0, 2400)] }))
        assert.strictEqual(e, 'saveWriteFail')
        for (let c of env2.calls) {
            if (c[0] === 'orm.del') {
                assert.ok(c[1].length <= 1000)
            }
            if (c[0] === 'select' && c[1].id) {
                assert.ok(c[1].id.$in.length <= 1000)
            }
        }
    })

    it('U15 補償只處理已開始之步驟所涉之列：新增失敗 → 不碰預定修改與預定刪除之舊列；修改失敗 → 還原被改列但不碰預定刪除之列；刪除失敗 → 全還原（sol#7）', async function() {
        let rowsBatch = [batchRow('a', { name: 'changed' }), batchRow('c'), batchRow('n')] //改 a、刪 b、增 n
        let mk = (k) => mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b'), dbRow('i3', 'c')], { failOn: { [k]: 1 } })
        let idsOf = (env, name) => env.calls.filter((c) => c[0] === name).flatMap((c) => c[1])

        let e1 = mk('procInsert')
        let x1 = await reject(createSyncApis(e1.deps)('app', { group: G, rows: rowsBatch }))
        assert.strictEqual(x1, 'saveWriteFail')
        assert.ok(!idsOf(e1, 'orm.del').includes('i1') && !idsOf(e1, 'orm.del').includes('i2'), '新增失敗：不刪舊列')
        assert.deepStrictEqual(idsOf(e1, 'orm.insert'), [], '新增失敗：不重插舊列')

        let e2 = mk('procSave')
        await reject(createSyncApis(e2.deps)('app', { group: G, rows: rowsBatch }))
        assert.ok(idsOf(e2, 'orm.del').includes('i1'), '修改失敗：被改列先刪後重插')
        assert.ok(!idsOf(e2, 'orm.del').includes('i2'), '修改失敗：預定刪除之 b 尚未動，不碰')
        assert.deepStrictEqual(idsOf(e2, 'orm.insert'), ['i1'])

        let e3 = mk('procDel')
        await reject(createSyncApis(e3.deps)('app', { group: G, rows: rowsBatch }))
        assert.deepStrictEqual(sorted(idsOf(e3, 'orm.insert')), ['i1', 'i2'], '刪除失敗：被改列與被刪列皆重插')

        //新增失敗且補償也失敗：未動過之舊列不得因補償而遺失
        let e4 = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b'), dbRow('i3', 'c')], { failOn: { procInsert: 1, ormDel: 1 } })
        let before = e4.snapshot()
        await reject(createSyncApis(e4.deps)('app', { group: G, rows: rowsBatch }))
        assert.deepStrictEqual(e4.snapshot(), before, '舊列完整保留（零寫入之失敗不因補償失敗而丟資料）')
    })

    it('U16 補償對 ORM 逐筆 ok:0（resolve 而非 reject，真實 LMDB 之單筆失敗形狀）亦判為失敗並記 restoreFail（sol#6）', async function() {
        let env = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b')], { failOn: { procDel: 1, ormDelOk0: 1 } })
        let e = await reject(createSyncApis(env.deps)('app', { group: G, rows: [batchRow('n')] })) //增 n、刪 a、b；刪除失敗後補償：刪 n 時回 ok:0
        assert.strictEqual(e, 'saveWriteFail')
        let ev = env.logs.filter((l) => l[0] === 'error' && l[1].event === 'syncAndReplaceTabs-restoreFail')
        assert.strictEqual(ev.length, 1, '補償未完成 → 記 restoreFail，不靜默')
        assert.strictEqual(ev[0][1].stage, 3)
        //補償成功但回讀仍見到新增列（刪除回報成功而實際未刪）也要判為失敗：以 ok:0 且實際未刪模擬已涵蓋; 此處驗正常補償不誤報
        let env2 = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b')], { failOn: { procDel: 1 } })
        await reject(createSyncApis(env2.deps)('app', { group: G, rows: [batchRow('n')] }))
        assert.strictEqual(env2.logs.filter((l) => l[1].event === 'syncAndReplaceTabs-restoreFail').length, 0, '補償成功不誤報')
    })

    it('U17 log 不洩來源鍵：ORM 失敗原文含 id[...]（遷移前既有列之 id 可能即外部來源鍵）→ srLog 之 orm 欄遮蔽為 id[*]（sol#14）', async function() {
        let env = mkEnv([dbRow('SECRET-SOURCE', 'a')], { failOn: { procDel: 1 }, failMsg: 'failed to delete data: id[SECRET-SOURCE]' })
        let e = await reject(createSyncApis(env.deps)('app', { group: G, rows: [batchRow('n')] }))
        assert.strictEqual(e, 'saveWriteFail')
        let txt = JSON.stringify(env.logs)
        assert.ok(txt.includes('syncAndReplaceTabs-orm'), '仍記錄失敗事件')
        assert.ok(txt.includes('id[*]'))
        assert.ok(!txt.includes('SECRET-SOURCE'), 'log 不含來源鍵原文')
    })

    it('U18 讀取失敗（鎖內 select reject）→ getDataError、零寫入（R-ERR-1：讀取類回 getDataError）', async function() {
        let env = mkEnv([dbRow('i1', 'a')], { failOn: { select: 1 } })
        let e = await reject(createSyncApis(env.deps)('app', { group: G, rows: [batchRow('n')] }))
        assert.strictEqual(e, 'getDataError')
        assert.deepStrictEqual(env.calls.filter((c) => c[0].startsWith('proc.') || c[0] === 'orm.del' || c[0] === 'orm.insert'), [])
    })

    it('U12 fail-closed：未注入 withTabLocks → reject 且不呼叫 ORM；srLog 事件只含事件、範圍與計數（不含來源鍵、欄位值）', async function() {
        let env = mkEnv([dbRow('i1', 'a')])
        let e = await reject(createSyncApis({ ...env.deps, withTabLocks: undefined })('app', { group: G, rows: [batchRow('a')] }))
        assert.ok(e instanceof TypeError || typeof e === 'string' || e instanceof Error)
        assert.strictEqual(env.calls.length, 0)
        let env2 = mkEnv([dbRow('i1', 'a')])
        await createSyncApis(env2.deps)('app', { group: G, rows: [batchRow('a', { name: 'SECRET-NAME' }), batchRow('SECRET-KEY')] })
        let txt = JSON.stringify(env2.logs)
        assert.ok(txt.includes('syncAndReplaceTabs-diff'))
        assert.ok(!txt.includes('SECRET-NAME') && !txt.includes('SECRET-KEY'), 'log 不含列內容與來源鍵')
    })

})
