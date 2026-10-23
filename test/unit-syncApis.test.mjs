//unit-syncApis：外部匯入（server/syncApis.mjs；原則 11、R-IMPORT-01、ADR-043）之邏輯單元測試——以記憶體替身取代 woItems／procOrm／withTabLocks／srLog，
//驗證：①整批驗證在任何資料庫呼叫與取鎖之前（全有或全無）②所有資料庫呼叫都在 apis 表鎖內且差異同步路徑不呼叫 delAll③寫入只含外部擁有欄位（本系統擁有欄位不寫）
//④新增／修改／刪除／不變之計數與配對（含補 srcKey、以 id 代替 srcKey 之相容）⑤寫入中途失敗之補償順序與無法補償之明確回報（I12）⑥未注入表鎖 fail-closed。
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

    it('U01 整批驗證在任何資料庫呼叫與取鎖之前：缺／空／非字串／含標記／過長／重複 srcKey、缺必填欄位、非物件列、空批次、無效 group → reject 固定鍵，ORM 呼叫 0 次、取鎖 0 次（I7、I8）', async function() {
        let ok = batchRow('good')
        let cases = [
            ['srcKey 空字串', [ok, batchRow('x', { srcKey: '' })], 'errRowInvalid'],
            ['srcKey null（提供空值不得降級為無鍵列；sol#1）', [ok, batchRow('x', { srcKey: null })], 'errRowInvalid'],
            ['srcKey null 且帶 id（不得退回以 id 代替）', [ok, batchRow('x', { srcKey: null, id: 'some-id' })], 'errRowInvalid'],
            ['srcKey 數字', [ok, batchRow('x', { srcKey: 7 })], 'errRowInvalid'],
            ['srcKey 物件', [ok, batchRow('x', { srcKey: {} })], 'errRowInvalid'],
            ['srcKey 含標記', [ok, batchRow('<img src=x onerror=1>')], 'errRowInvalid'],
            ['srcKey 含白名單標籤（clearXSS 不改寫但仍為標記；sol#10）', [ok, batchRow('<b>key</b>')], 'errRowInvalid'],
            ['srcKey 為孤立代理字元（儲存編碼往返會改寫；sol#3）', [ok, batchRow('\ud800')], 'errRowInvalid'],
            ['id 代替者以控制字元起首（LMDB 鍵編碼多 1 位元組使上限失準；sol#8）', [ok, { id: '\u0001abc', name: 'n', url: 'u' }], 'errRowInvalid'],
            ['name 經字元清理後為空（必填檢核對最終寫入值；sol#2）', [ok, batchRow('x', { name: '<!--x-->' })], 'errRowInvalid'],
            ['url 經字元清理後為空', [ok, batchRow('x', { url: '<!--u-->' })], 'errRowInvalid'],
            ['外部欄位為物件（容器值會被 ORM 深層合併而使重送恆有改變；sol#4）', [ok, batchRow('x', { description: { a: 1 } })], 'errRowInvalid'],
            ['外部欄位為陣列', [ok, batchRow('x', { keywords: ['a'] })], 'errRowInvalid'],
            ['order 為物件', [ok, batchRow('x', { order: {} })], 'errRowInvalid'],
            ['欄位為 NaN', [ok, batchRow('x', { version: NaN })], 'errRowInvalid'],
            ['srcKey 超長', [ok, batchRow('k'.repeat(1979))], 'errRowInvalid'],
            ['srcKey 重複', [batchRow('d'), batchRow('d')], 'errRowInvalid'],
            ['srcKey 與 id 代替者重複', [batchRow('d'), { id: 'd', name: 'n', url: 'u' }], 'errRowInvalid'],
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
                batchRow('a', { name: 'changed', tokens: 'EVIL', authType: 'none', contentType: 'x', timeCreate: '1999', isActive: 'n', userIdUpdate: 'forged', id: 'forged-id' }),
                batchRow('n', { tokens: 'EVIL', authType: 'none', contentType: 'x', timeCreate: '1999', isActive: 'n', userIdUpdate: 'forged', id: 'forged-id-2' }),
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
        assert.notStrictEqual(n.id, 'forged-id-2', '外部指定之 id 不採用（有 srcKey 時 id 由本系統產生）')
        assert.notStrictEqual(n.id, 'n')
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

    it('U06 補 srcKey（遷移）：既有列無 srcKey 而批次以 id 代替 → 命中、內容相同則只補 srcKey（寫入 { id, srcKey }）、計入 nSame 不計 nUpdate；批次以 srcKey=該 id 亦命中同一列', async function() {
        let env = mkEnv([dbRow('legacy-1', '', { srcKey: undefined })])
        delete env.rows.get('legacy-1').srcKey
        let r = await createSyncApis(env.deps)('app', { group: G, rows: [{ ...batchRow('x'), srcKey: undefined, id: 'legacy-1', name: 'name-', url: 'http://x/' }] })
        //此列內容與庫內不同（name、url 不同）→ 為修改，並同時補 srcKey
        assert.deepStrictEqual(r, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 })
        assert.strictEqual(env.rows.get('legacy-1').srcKey, 'legacy-1')
        //內容相同：只補 srcKey
        let env2 = mkEnv([dbRow('legacy-2', 'x')])
        delete env2.rows.get('legacy-2').srcKey
        let r2 = await createSyncApis(env2.deps)('app', { group: G, rows: [{ ...batchRow('legacy-2'), srcKey: undefined, id: 'legacy-2', name: 'name-x', url: 'http://x/x', description: 'desc-x' }] })
        assert.deepStrictEqual(r2, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
        let save = env2.calls.find((c) => c[0] === 'proc.save')[1]
        assert.deepStrictEqual(save.keys, [['id', 'srcKey']], '只補 srcKey，不改外部擁有欄位')
        assert.strictEqual(env2.rows.get('legacy-2').srcKey, 'legacy-2')
        assert.strictEqual(env2.rows.get('legacy-2').name, 'name-x')
    })

    it('U07 以 id 代替 srcKey 之新增列沿用該 id 為內部 id 並寫 srcKey=id；其 id 已存在於他群組或同群組不同來源鍵之列 → errRowInvalid、零寫入（insert 會略過已存在之主鍵而回報成功）', async function() {
        let env = mkEnv([dbRow('i1', 'a'), dbRow('o9', 'q', { group: 'other' })])
        let r = await createSyncApis(env.deps)('app', { group: G, rows: [batchRow('a'), { name: 'n', url: 'u', id: 'legacy-new' }] })
        assert.deepStrictEqual(r, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 1 })
        assert.strictEqual(env.rows.get('legacy-new').srcKey, 'legacy-new')
        assert.strictEqual(env.rows.get('legacy-new').id, 'legacy-new')
        let env2 = mkEnv([dbRow('i1', 'a'), dbRow('o9', 'q', { group: 'other' })])
        let e = await reject(createSyncApis(env2.deps)('app', { group: G, rows: [batchRow('a'), { name: 'n', url: 'u', id: 'o9' }] }))
        assert.strictEqual(e, 'errRowInvalid')
        let e2 = await reject(createSyncApis(env2.deps)('app', { group: G, rows: [{ name: 'n', url: 'u', id: 'i1' }] })) //i1 同群組但 srcKey=a≠i1
        assert.strictEqual(e2, 'errRowInvalid')
        assert.deepStrictEqual(env2.calls.filter((c) => c[0].startsWith('proc.') || c[0].startsWith('orm.')), [], '零寫入')
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

    it('U11 相容：批次中有列兩者皆無 → 該列每次新增（配新 id），其餘有鍵之列仍依來源鍵差異同步（本系統擁有欄位不被清；不 delAll；sol#5）；記警告 noSrcKey；以 id 代替者記警告 idAsSrcKey', async function() {
        let env = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b'), dbRow('o1', 'z', { group: 'other' })])
        let rows = [batchRow('a'), { name: 'k1', url: 'http://k/1' }, { id: 'legacy-x', name: 'k2', url: 'http://k/2' }]
        let r = await createSyncApis(env.deps)('app', { group: G, rows })
        assert.deepStrictEqual(r, { nAdd: 2, nUpdate: 0, nDel: 1, nSame: 1 }, 'a 不變、b 被刪、k1 與 legacy-x 新增')
        assert.ok(!env.calls.some((c) => c[0] === 'orm.delAll'), '混批亦不 delAll')
        assert.deepStrictEqual(env.violations, [])
        assert.ok(env.logs.some((l) => l[0] === 'warn' && l[1].event === 'syncAndReplaceTabs-noSrcKey'))
        assert.ok(env.logs.some((l) => l[0] === 'warn' && l[1].event === 'syncAndReplaceTabs-idAsSrcKey'))
        assert.ok(env.rows.has('o1'), '他群組不動')
        assert.ok(env.rows.has('legacy-x'))
        assert.deepStrictEqual(env.rows.get('i1'), dbRow('i1', 'a'), '有鍵且命中之列（含 tokens／authType 等本系統擁有欄位）完全不動')
        let k1 = [...env.rows.values()].find((v) => v.name === 'k1')
        assert.strictEqual(k1.srcKey, '', '無來源鍵列之 srcKey 為空字串')
        assert.notStrictEqual(k1.id, undefined)
        //再送同一批：無來源鍵列不配對 → 舊的被刪、新的新增（id 改變，同改造前「未帶 id 者每次換 id」）；其餘 a、legacy-x 皆不變
        let idK1 = k1.id
        let r2 = await createSyncApis(env.deps)('app', { group: G, rows })
        assert.deepStrictEqual(r2, { nAdd: 1, nUpdate: 0, nDel: 1, nSame: 2 })
        assert.ok(!env.rows.has(idK1))
        //失敗補償
        let env2 = mkEnv([dbRow('i1', 'a'), dbRow('i2', 'b')], { failOn: { procInsert: 1 } })
        let before = env2.snapshot()
        let e = await reject(createSyncApis(env2.deps)('app', { group: G, rows: [batchRow('a'), { name: 'k1', url: 'http://k/1' }] }))
        assert.strictEqual(e, 'saveWriteFail')
        assert.deepStrictEqual(env2.snapshot(), before, '相容列失敗亦補償')
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

    it('U14 大批次：既有主鍵衝突檢查之 $in 查詢分批（每批 ≤ 1000；sol#9）；補償之查詢亦分批', async function() {
        let env = mkEnv()
        let rows = []
        for (let k = 0; k < 2500; k++) {
            rows.push({ id: `n${k}`, name: `n${k}`, url: 'http://x' })
        }
        let r = await createSyncApis(env.deps)('app', { group: G, rows })
        assert.deepStrictEqual(r, { nAdd: 2500, nUpdate: 0, nDel: 0, nSame: 0 })
        let sizes = env.calls.filter((c) => c[0] === 'select' && c[1].id && c[1].id.$in).map((c) => c[1].id.$in.length)
        assert.deepStrictEqual(sizes, [1000, 1000, 500])
        //補償：insert 失敗後之 del／回讀亦不超過 1000 一批
        let env2 = mkEnv([], { failOn: { procInsert: 1 } })
        let e = await reject(createSyncApis(env2.deps)('app', { group: G, rows: [{ name: 'k', url: 'u' }, ...rows.slice(0, 2400)] }))
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

    it('U17 log 不洩來源鍵：ORM 失敗原文含 id[...]（相容路徑之 id 即外部來源鍵）→ srLog 之 orm 欄遮蔽為 id[*]（sol#14）', async function() {
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
