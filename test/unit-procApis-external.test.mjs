//unit-procApis-external：procApis 對外部列之守門（原則 5「開了外部同步就以外部為主」; 規格 外部匯入之定義與機制.md 第 4、7 節; ADR-044, R-EXT-LOCK-01）。
//以「語意相同之替身」（mkLocks: 每表一鍵互斥 + 真實 compareBaseline; mkWoItems: 依 id／group 篩選）驗證 saveApi／deleteApi 在表鎖內以新鮮讀取之庫內原列判定:
//  外部列(srcKey 非空)不可刪除、不可改 group／srcKey 與外部擁有欄位(逐欄窮盡)、可改本系統擁有欄位; 外部管理之 group 不可新增列、不可把列改入; 違規整次拒收(procOrm 未被呼叫);
//  lockExternalRows=false 回到 run01 行為。與真實 WServOrm／lmdb 之整合見 api-externalRows。
import assert from 'assert'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import pmKeyMutex from 'wsemi/src/pmKeyMutex.mjs'
import { compareBaseline, buildBaseline } from 'w-serv-orm/src/baseline.mjs'
import procApis from '../server/procApis.mjs'
import createLockSave from '../server/lockSave.mjs'
import ds from '../src/schema/index.mjs'
import contract, { fieldsExternal, fieldsLocal } from '../src/schema/contracts/apis.mjs'


async function expectReject(fn, key) {
    let rejected = false
    try {
        await fn()
    }
    catch (e) {
        rejected = true
        assert.strictEqual(e, key, `應 reject「${key}」，實得「${e}」`)
    }
    assert.ok(rejected, `應 reject「${key}」但未 reject`)
}


//deferred：由測試控制何時完成（占住表鎖用）
function deferred() {
    let d = {}
    d.p = new Promise((resolve, reject) => {
        d.resolve = resolve
        d.reject = reject
    })
    return d
}


function mkLocks() {
    let kmx = pmKeyMutex()
    let withTabLocks = (tables, fn) => kmx('apis', fn)
    let guardWrite = (o) => {
        return kmx('apis', async () => {
            let rows = await o.read()
            if (o.baseline !== undefined) {
                let r = compareBaseline(rows, o.baseline, o.contract)
                if (!r.ok) {
                    let e = new Error(r.reason)
                    e.key = r.reason
                    throw e
                }
            }
            return await o.write(rows)
        })
    }
    return { withTabLocks, guardWrite }
}


//mkWoItems: select 依 { id: { $in } } 或 { group } 篩選庫內列; failGroup=true 時 group 查詢 reject（讀取失敗）
function mkWoItems(rows, { failGroup = false } = {}) {
    let queries = []
    let woItems = {
        apis: {
            select: async (q) => {
                queries.push(q)
                if (q && q.id && q.id.$in) {
                    return rows.filter((r) => q.id.$in.includes(r.id))
                }
                if (q && Object.prototype.hasOwnProperty.call(q, 'group')) {
                    if (failGroup) {
                        return Promise.reject(new Error('boom'))
                    }
                    return rows.filter((r) => r.group === q.group)
                }
                return rows
            },
        },
    }
    return { woItems, queries }
}


//庫內：外部 group ext（k1、k2 兩外部列 + 一混雜列 m1）、後台 group loc（l1）、僅有後台列之 group onlyloc（o1）
let mkRows = () => {
    let base = (id, group, srcKey, o = {}) => ({
        id,
        group,
        srcKey,
        order: 1,
        name: `n-${id}`,
        description: `d-${id}`,
        url: `http://x/${id}`,
        method: 'get',
        version: 'v1',
        levels: '',
        keywords: '',
        state: 'ok',
        creator: 'c',
        dataSource: 'ds',
        mdInputParams: 'mi',
        inputExample: 'ie',
        mdOutputParams: 'mo',
        outputExample: 'oe',
        isActive: 'y',
        userIdUpdate: 'u0',
        timeCreate: 't0',
        timeUpdate: 't0',
        tokens: 'tk',
        testBaseUrl: '',
        authType: 'none',
        authConfigJson: '',
        defaultHeadersJson: '',
        defaultQueryJson: '',
        defaultBodyJson: '',
        contentType: 'application/json',
        ...o,
    })
    return [
        base('e1', 'ext', 'k1'),
        base('e2', 'ext', 'k2'),
        base('m1', 'ext', ''), //混雜列
        base('l1', 'loc', ''),
        base('o1', 'onlyloc', ''),
    ]
}


describe('unit-procApis-external (外部列受保護: saveApi／deleteApi／新增)', function() {

    let cst = null
    let lockSave = null

    before(function() {
        cst = cacheSt()
        lockSave = createLockSave(cst)
    })

    after(function() {
        cst.clear()
    })

    //mk: 組 procApis; procOrm 記錄呼叫並回 'ok'
    let mk = (o = {}) => {
        let locks = mkLocks()
        let rows = o.rows || mkRows()
        let wi = mkWoItems(rows, o.wo || {})
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a)
            return 'ok'
        }
        let deps = { woItems: wi.woItems, procOrm, ds, lockSave, withTabLocks: locks.withTabLocks, guardWrite: locks.guardWrite, ...o.deps }
        return { api: procApis(deps), calls, rows, queries: wi.queries, locks }
    }

    let rowOf = (rows, id) => rows.find((v) => v.id === id)

    //--- 刪除 ---

    it('deleteApi: 外部列（srcKey 非空）→ reject deleteExternalRowDenied，procOrm 未被呼叫（零寫入）', async function() {
        let { api, calls, rows } = mk()
        await expectReject(() => api.deleteApi('u1', 'e1'), 'deleteExternalRowDenied')
        assert.strictEqual(calls.length, 0)
        assert.ok(rowOf(rows, 'e1'))
    })

    it('deleteApi: 外部列帶最新基準亦被拒（基準通過後仍判外部列）；帶舊基準 → saveStale（先動先贏優先，零寫入）', async function() {
        let { api, calls, rows } = mk()
        await expectReject(() => api.deleteApi('u1', 'e1', { baseline: buildBaseline([rowOf(rows, 'e1')], contract) }), 'deleteExternalRowDenied')
        await expectReject(() => api.deleteApi('u1', 'e1', { baseline: buildBaseline([{ ...rowOf(rows, 'e1'), name: 'old' }], contract) }), 'saveStale')
        assert.strictEqual(calls.length, 0)
    })

    it('deleteApi: 後台列、混雜列（外部管理 group 內無 srcKey）可刪（呼叫 procOrm del + mustExist）', async function() {
        for (let id of ['l1', 'm1', 'o1']) {
            let { api, calls } = mk()
            let r = await api.deleteApi('u1', id)
            assert.strictEqual(r, 'ok', id)
            assert.strictEqual(calls.length, 1, id)
            assert.deepStrictEqual(calls[0].slice(0, 3), ['u1', 'apis', 'del'])
            assert.deepStrictEqual(calls[0][4], { mustExist: true })
        }
    })

    it('deleteApi: 列不存在 → 不判定外部列，交 procOrm（mustExist 回 rowNotFound → errApiRowNotFound 由 ORM 層負責）', async function() {
        let { api, calls } = mk()
        await api.deleteApi('u1', 'ghost')
        assert.strictEqual(calls.length, 1, '仍呼叫 procOrm del（mustExist 於其內回 rowNotFound）')
    })

    //--- 修改 ---

    it('saveApi(修改外部列): 逐一改動每個外部擁有欄位（含 group；窮盡 fieldsExternal）→ reject saveExternalRowChanged、procOrm 未被呼叫', async function() {
        for (let f of fieldsExternal) {
            let { api, calls, rows } = mk()
            let row = { ...rowOf(rows, 'e1'), [f]: f === 'order' ? 99 : `changed-${f}` }
            await expectReject(() => api.saveApi('u1', row), 'saveExternalRowChanged')
            assert.strictEqual(calls.length, 0, `改 ${f} 不得寫入`)
        }
    })

    it('saveApi(修改外部列): 只送被改之外部擁有欄位（其餘缺欄）亦被拒', async function() {
        let { api, calls } = mk()
        await expectReject(() => api.saveApi('u1', { id: 'e1', url: 'http://changed/' }), 'saveExternalRowChanged')
        assert.strictEqual(calls.length, 0)
    })

    it('saveApi(修改外部列): 客戶端送來非空且與庫內不同之 srcKey → 拒（身分欄）；與庫內相同（原樣送回）或空值（持舊畫面之回聲）→ 通過且 srcKey 不寫入', async function() {
        let { api, calls, rows } = mk()
        await expectReject(() => api.saveApi('u1', { ...rowOf(rows, 'e1'), srcKey: 'forged' }), 'saveExternalRowChanged')
        assert.strictEqual(calls.length, 0)
        for (let sk of ['k1', '', null]) {
            calls.length = 0
            let r = await api.saveApi('u1', { ...rowOf(rows, 'e1'), srcKey: sk, tokens: 'mine' })
            assert.strictEqual(r, 'ok', `srcKey=${JSON.stringify(sk)}`)
            assert.strictEqual(calls.length, 1)
            assert.ok(!Object.prototype.hasOwnProperty.call(calls[0][3][0], 'srcKey'), 'srcKey 仍不寫入（伺服器專有欄位）')
        }
    })

    it('saveApi(修改外部列): 逐一改動每個本系統擁有欄位（含 tokens）→ 通過，且只寫契約欄位', async function() {
        for (let f of fieldsLocal) {
            let { api, calls, rows } = mk()
            let r = await api.saveApi('u1', { ...rowOf(rows, 'e1'), [f]: f === 'authType' ? 'bearer' : `mine-${f}` })
            assert.strictEqual(r, 'ok', f)
            assert.strictEqual(calls.length, 1, f)
            let o = calls[0][3][0]
            assert.strictEqual(o[f], f === 'authType' ? 'bearer' : `mine-${f}`)
            for (let k of ['srcKey', 'timeCreate', 'isActive', 'userIdUpdate']) {
                assert.ok(!Object.prototype.hasOwnProperty.call(o, k), `伺服器專有欄位 ${k} 不得寫入`)
            }
        }
    })

    it('saveApi(修改外部列): 整列原樣送回（如編輯表單只改 tokens）→ 通過；外部擁有欄位的數字／字串型別差異（order 3 vs "3"）不算改', async function() {
        let { api, calls, rows } = mk()
        let e1 = rowOf(rows, 'e1')
        await api.saveApi('u1', { ...e1, tokens: 'new-token', order: String(e1.order) })
        assert.strictEqual(calls.length, 1)
        assert.strictEqual(calls[0][3][0].tokens, 'new-token')
    })

    it('saveApi(修改外部列): 外部擁有欄位被改 + 舊基準 → saveStale（先動先贏優先）；外部擁有欄位被改 + 最新基準 → saveExternalRowChanged', async function() {
        let { api, calls, rows } = mk()
        let e1 = rowOf(rows, 'e1')
        await expectReject(() => api.saveApi('u1', { ...e1, name: 'x' }, { baseline: buildBaseline([{ ...e1, name: 'older' }], contract) }), 'saveStale')
        await expectReject(() => api.saveApi('u1', { ...e1, name: 'x' }, { baseline: buildBaseline([e1], contract) }), 'saveExternalRowChanged')
        assert.strictEqual(calls.length, 0)
    })

    //--- 後台列／混雜列的修改 ---

    it('saveApi(修改後台列): 可改任何欄位（含 group 改到非外部 group）', async function() {
        let { api, calls, rows } = mk()
        let r = await api.saveApi('u1', { ...rowOf(rows, 'l1'), name: 'renamed', group: 'loc2' })
        assert.strictEqual(r, 'ok')
        assert.strictEqual(calls.length, 1)
        assert.strictEqual(calls[0][3][0].group, 'loc2')
    })

    it('saveApi(修改後台列): group 改成外部管理 group → reject saveExternalGroupDenied（不得把列改入）、procOrm 未被呼叫', async function() {
        let { api, calls, rows } = mk()
        await expectReject(() => api.saveApi('u1', { ...rowOf(rows, 'l1'), group: 'ext' }), 'saveExternalGroupDenied')
        assert.strictEqual(calls.length, 0)
    })

    it('saveApi(修改後台列): group 改成「只有後台列」之 group（非外部管理）→ 通過', async function() {
        let { api, calls, rows } = mk()
        await api.saveApi('u1', { ...rowOf(rows, 'l1'), group: 'onlyloc' })
        assert.strictEqual(calls.length, 1)
    })

    it('saveApi(修改混雜列): group 未改（仍在 ext）→ 通過（原就在其內，其他欄位可改）；group 改到另一外部 group → 拒', async function() {
        let rows = mkRows()
        rows.push({ ...rowOf(rows, 'e1'), id: 'x1', group: 'ext2', srcKey: 'kx' })
        let { api, calls, queries } = mk({ rows })
        await api.saveApi('u1', { ...rowOf(rows, 'm1'), description: 'edited' })
        assert.strictEqual(calls.length, 1)
        assert.ok(!queries.some((q) => q && Object.prototype.hasOwnProperty.call(q, 'group')), 'group 未改: 不讀 group（只讀該列）')
        await expectReject(() => api.saveApi('u1', { ...rowOf(rows, 'm1'), group: 'ext2' }), 'saveExternalGroupDenied')
        assert.strictEqual(calls.length, 1)
    })

    it('saveApi(修改後台列): 客戶端偽造 srcKey 不採用也不拒（run01 A7 行為不變）', async function() {
        let { api, calls, rows } = mk()
        await api.saveApi('u1', { ...rowOf(rows, 'l1'), srcKey: 'forged-key' })
        assert.strictEqual(calls.length, 1)
        assert.ok(!Object.prototype.hasOwnProperty.call(calls[0][3][0], 'srcKey'))
    })

    it('saveApi(修改): 列不存在 → 不判定，交 procOrm mustExist', async function() {
        let { api, calls } = mk()
        await api.saveApi('u1', { id: 'ghost', name: 'x', group: 'ext' })
        assert.strictEqual(calls.length, 1, '交 procOrm（mustExist 於其內回 rowNotFound）')
    })

    //--- 新增 ---

    it('saveApi(新增): group 為外部管理 group → reject saveExternalGroupDenied、procOrm 未被呼叫', async function() {
        let { api, calls } = mk()
        await expectReject(() => api.saveApi('u1', { name: 'n', url: 'http://a', method: 'get', group: 'ext' }), 'saveExternalGroupDenied')
        assert.strictEqual(calls.length, 0)
    })

    it('saveApi(新增): group 為空、缺欄、後台 group、只有後台列之 group、全新 group → 通過', async function() {
        for (let g of ['', undefined, 'loc', 'onlyloc', 'brand-new']) {
            let { api, calls } = mk()
            let row = { name: 'n', url: 'http://a', method: 'get' }
            if (g !== undefined) {
                row.group = g
            }
            let r = await api.saveApi('u1', row)
            assert.strictEqual(r, 'ok', String(g))
            assert.strictEqual(calls.length, 1, String(g))
        }
    })

    it('saveApi(新增): 判定用新鮮讀取（於表鎖內 select({ group }) 一次）；僅 group 非空時才讀', async function() {
        let a = mk()
        await a.api.saveApi('u1', { name: 'n', url: 'http://a', method: 'get', group: 'brand-new' })
        assert.deepStrictEqual(a.queries, [{ group: 'brand-new' }])
        let b = mk()
        await b.api.saveApi('u1', { name: 'n', url: 'http://a', method: 'get' })
        assert.deepStrictEqual(b.queries, [], '無 group 不讀')
    })

    it('saveApi(新增): 讀 group 失敗 → reject getDataError（讀取類），procOrm 未被呼叫', async function() {
        let { api, calls } = mk({ wo: { failGroup: true } })
        await expectReject(() => api.saveApi('u1', { name: 'n', url: 'http://a', method: 'get', group: 'ext' }), 'getDataError')
        assert.strictEqual(calls.length, 0)
    })

    it('saveApi(新增): 客戶端偽造 srcKey 不採用也不拒（A7 行為不變）', async function() {
        let { api, calls } = mk()
        await api.saveApi('u1', { name: 'n', url: 'http://a', method: 'get', group: 'loc', srcKey: 'forged-key' })
        assert.strictEqual(calls.length, 1)
        assert.strictEqual(calls[0][3][0].srcKey, '')
    })

    //--- 關閉選項（lockExternalRows=false → run01 行為）與預設 ---

    it('lockExternalRows=false: 外部列可刪、可改外部擁有欄位、外部管理 group 可新增與改入（run01 行為）', async function() {
        let { api, calls, rows } = mk({ deps: { lockExternalRows: false } })
        assert.strictEqual(await api.deleteApi('u1', 'e1'), 'ok')
        assert.strictEqual(await api.saveApi('u1', { ...rowOf(rows, 'e2'), name: 'changed', group: 'elsewhere' }), 'ok')
        assert.strictEqual(await api.saveApi('u1', { name: 'n', url: 'http://a', method: 'get', group: 'ext' }), 'ok')
        assert.strictEqual(await api.saveApi('u1', { ...rowOf(rows, 'l1'), group: 'ext' }), 'ok')
        assert.strictEqual(calls.length, 4)
    })

    it('lockExternalRows 未給 → 預設開啟（預設拒絕）', async function() {
        let { api } = mk()
        await expectReject(() => api.deleteApi('u1', 'e2'), 'deleteExternalRowDenied')
    })

    it('不得改變: 外部列受保護不影響後台列之既有錯誤路徑（非字串 id、非物件 row）', async function() {
        let { api } = mk()
        await expectReject(() => api.deleteApi('u1', 123), 'errApiIdInvalid')
        await expectReject(() => api.saveApi('u1', null), 'errApiRowInvalid')
    })

    //--- 外審(sol)後補強: 「檢查之值」須即「寫入之值」 ---

    it('group 須為合法形狀（外審 #1、#2）: 陣列、數字、布林、物件、含孤立代理字元之字串 → reject errApiRowInvalid、procOrm 未被呼叫（新增與修改皆然）；缺欄、null、字串通過', async function() {
        let bad = [['ext'], 7, true, { a: 1 }, 'a\ud800b']
        for (let g of bad) {
            let { api, calls, rows } = mk()
            await expectReject(() => api.saveApi('u1', { name: 'n', url: 'http://a', method: 'get', group: g }), 'errApiRowInvalid')
            await expectReject(() => api.saveApi('u1', { ...rowOf(rows, 'l1'), group: g }), 'errApiRowInvalid')
            await expectReject(() => api.saveApi('u1', { ...rowOf(rows, 'e1'), group: g }), 'errApiRowInvalid')
            assert.strictEqual(calls.length, 0, `group=${JSON.stringify(g)} 不得寫入`)
        }
        for (let g of [undefined, null, '', 'loc', '中文群組']) {
            let { api, calls } = mk()
            let row = { name: 'n', url: 'http://a', method: 'get' }
            if (g !== undefined) {
                row.group = g
            }
            assert.strictEqual(await api.saveApi('u1', row), 'ok', `group=${JSON.stringify(g)}`)
            assert.strictEqual(calls.length, 1)
        }
    })

    it('group 形狀檢查隨選項: lockExternalRows=false 時維持 run01 行為（不檢）', async function() {
        let { api, calls } = mk({ deps: { lockExternalRows: false } })
        assert.strictEqual(await api.saveApi('u1', { name: 'n', url: 'http://a', method: 'get', group: ['x'] }), 'ok')
        assert.strictEqual(calls.length, 1)
    })

    it('外部列通過守門後只寫 id 與本系統擁有欄位（外審 #3）: 數字回聲（version 7 對庫內 "7"）、庫內未清理之舊值回聲皆不被寫入', async function() {
        let rows = mkRows()
        rows.push({ ...rowOf(rows, 'e1'), id: 'e9', srcKey: 'k9', version: '7', description: 'a<script>x</script>' })
        let { api, calls } = mk({ rows })
        let echo = { ...rowOf(rows, 'e9'), version: 7, tokens: 'new-token', authType: 'bearer' }
        assert.strictEqual(await api.saveApi('u1', echo), 'ok')
        assert.strictEqual(calls.length, 1)
        let w = calls[0][3][0]
        assert.deepStrictEqual(Object.keys(w).sort(), ['id', ...fieldsLocal].sort(), '只寫 id 與本系統擁有欄位（整列回聲之本系統欄位照寫）')
        assert.strictEqual(w.tokens, 'new-token')
        assert.strictEqual(w.authType, 'bearer')
        for (let f of fieldsExternal) {
            assert.ok(!Object.prototype.hasOwnProperty.call(w, f), `外部擁有欄位 ${f} 不得寫入`)
        }
    })

    it('外部列只送被改之外部欄位以外之欄位時亦只寫本系統擁有欄位；後台列照舊寫入白名單全部欄位', async function() {
        let { api, calls, rows } = mk()
        await api.saveApi('u1', { id: 'l1', name: 'renamed', tokens: 't' })
        assert.deepStrictEqual(calls[0][3][0], { id: 'l1', name: 'renamed', tokens: 't' })
        calls.length = 0
        await api.saveApi('u1', { id: 'e1', tokens: 't' })
        assert.deepStrictEqual(calls[0][3][0], { id: 'e1', tokens: 't' })
        assert.ok(rowOf(rows, 'e1'))
    })

    it('group 比對用寫入後之值（外審 #6）: 外部 group 為 ext&lt;script>x 時，新增「ext<script>x」（寫入時被清理為同一字串）→ 被攔', async function() {
        let rows = mkRows()
        rows.push({ ...rowOf(rows, 'e1'), id: 'e7', group: 'ext&lt;script>x', srcKey: 'k7' })
        let { api, calls } = mk({ rows })
        await expectReject(() => api.saveApi('u1', { name: 'n', url: 'http://a', method: 'get', group: 'ext<script>x' }), 'saveExternalGroupDenied')
        await expectReject(() => api.saveApi('u1', { ...rowOf(rows, 'l1'), group: 'ext<script>x' }), 'saveExternalGroupDenied')
        assert.strictEqual(calls.length, 0)
    })

    it('主鍵只讀一次（外審 #5）: 直接呼叫時 id 為存取器（第一次回後台列 l1、其後回外部列 e1）→ 檢查、讀取與寫入皆用第一次之值，不改到 e1', async function() {
        let { api, calls, queries } = mk()
        let n = 0
        let row = {
            name: 'x',
            get id() {
                n++
                return n === 1 ? 'l1' : 'e1'
            }
        }
        await api.saveApi('u1', row)
        assert.strictEqual(calls.length, 1)
        assert.strictEqual(calls[0][3][0].id, 'l1', '寫入之主鍵為第一次讀得之值')
        assert.deepStrictEqual(queries, [{ id: { $in: ['l1'] } }], '讀取原列亦用同一主鍵')
    })

    it('外部管理 group 之判定於取得表鎖之後才讀（外審 #6）: 表鎖被占用時，新增與改入皆不得先讀 group；放行後才讀並被攔', async function() {
        for (let mode of ['add', 'moveIn']) {
            let { api, queries, locks, rows } = mk()
            let hold = deferred()
            let p0 = locks.withTabLocks(['apis'], () => hold.p) //占住 apis 表鎖
            let p1 = mode === 'add' ? api.saveApi('u1', { name: 'n', url: 'http://a', method: 'get', group: 'ext' }) : api.saveApi('u1', { ...rowOf(rows, 'l1'), group: 'ext' })
            let st = 'pending'
            p1.then(() => {
                st = 'ok'
            }, (e) => {
                st = String(e)
            })
            await new Promise((resolve) => setTimeout(resolve, 60))
            assert.strictEqual(st, 'pending', `${mode}: 表鎖被占用時應等待`)
            assert.deepStrictEqual(queries, [], `${mode}: 取鎖前不得讀庫（group 判定須在鎖內）`)
            hold.resolve()
            await p0
            await expectReject(() => p1, 'saveExternalGroupDenied')
            assert.ok(queries.some((q) => q && q.group === 'ext'), `${mode}: 取鎖後讀了 group`)
        }
    })

})
