//unit-procApis：procApis 工廠之錯誤路徑（e2e 因前端同步短路不可達、原本完全未測）+ 正常路徑（mock procOrm）。
//對應 z待修清單 T18。純 unit（不需 server/browser），mocha 預設 glob 自動涵蓋。
//ADR-034 起 saveApi／deleteApi 以注入之 lockSave 依使用者占位：會呼叫 procOrm 之案例一律注入與 WWebApi 相同之實作（createLockSave(cacheSt())）。
//多人同時編輯（原則 10，ADR-043）起 saveApi／deleteApi 另取 w-serv-orm 1.1.17 之 apis 表鎖（withTabLocks／guardWrite），
//本檔以「語意相同之替身」（mkLocks：每表一鍵之互斥 + 真實之 compareBaseline）驗證 procApis 對鎖、契約、拒收鍵之使用；
//與真實 WServOrm／lmdb 之整合（鎖覆蓋存檔、刪除、匯入；人為延遲）見 api-concurrency／api-import。
import assert from 'assert'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import pmKeyMutex from 'wsemi/src/pmKeyMutex.mjs'
import { compareBaseline, buildBaseline } from 'w-serv-orm/src/baseline.mjs'
import procApis from '../server/procApis.mjs'
import createLockSave from '../server/lockSave.mjs'
import ds from '../src/schema/index.mjs'
import contract from '../src/schema/contracts/apis.mjs'


//字串型 reject 之斷言（procApis reject err-key 字串、非 Error）
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


//deferred：由測試控制何時完成（雙擊防護案例以此使第 1 次停在處理中，不依賴時序）
function deferred() {
    let d = {}
    d.p = new Promise((resolve, reject) => {
        d.resolve = resolve
        d.reject = reject
    })
    return d
}


//mkLocks：w-serv-orm withTabLocks／guardWrite 之替身（語意同: 每表一鍵互斥; guardWrite 於鎖內 read → 有 baseline 則 compareBaseline → 不符 reject Error(key) → write）
//calls 記錄 guardWrite／withTabLocks 之呼叫形狀供斷言
function mkLocks() {
    let kmx = pmKeyMutex()
    let calls = { withTabLocks: [], guardWrite: [] }
    let withTabLocks = (tables, fn) => {
        calls.withTabLocks.push(tables)
        return kmx('apis', fn)
    }
    let guardWrite = (o) => {
        calls.guardWrite.push({ tables: o.tables, baseline: o.baseline, contract: o.contract })
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
    return { withTabLocks, guardWrite, calls }
}


//mkWoItems：woItems.apis.select 之替身（依 id 篩 rows），記錄查詢條件
function mkWoItems(rows = []) {
    let queries = []
    let woItems = {
        apis: {
            select: async (q) => {
                queries.push(q)
                let ids = q && q.id && q.id.$in
                return ids ? rows.filter((r) => ids.includes(r.id)) : rows
            },
        },
    }
    return { woItems, queries }
}


describe('unit-procApis (錯誤路徑 + 正常路徑)', function() {

    //lockSave：與 WWebApi 注入者同一實作；cacheSt 有 TTL 偵測 timer，於 before 建立、after clear（否則 mocha 不結束；
    //建在 hook 內而非 describe 層：--grep 未選中本組時 hook 不跑，亦不留 timer）
    let cst = null
    let lockSave = null

    before(function() {
        cst = cacheSt()
        lockSave = createLockSave(cst)
    })

    after(function() {
        cst.clear()
    })

    //mk：組 procApis 之依賴（含替身表鎖）
    let mk = (o = {}) => {
        let locks = mkLocks()
        let wi = mkWoItems(o.rows || [])
        let deps = { woItems: wi.woItems, ds, lockSave, withTabLocks: locks.withTabLocks, guardWrite: locks.guardWrite, ...o.deps }
        return { api: procApis(deps), locks, queries: wi.queries }
    }

    it('saveApi: row 非物件 → reject errApiRowInvalid（檢測在碰 deps 前，故無需 procOrm）', async function() {
        let { saveApi } = procApis({})
        for (let bad of [null, undefined, 'str', 123, []]) {
            await expectReject(() => saveApi('u', bad), 'errApiRowInvalid')
        }
    })

    it('deleteApi: id 非字串/空 → reject errApiIdInvalid', async function() {
        let { deleteApi } = procApis({})
        for (let bad of [null, undefined, '', 123, {}]) {
            await expectReject(() => deleteApi('u', bad), 'errApiIdInvalid')
        }
    })

    //--- 新增（row 無 id）：不比對、不去重，於 apis 表鎖內寫入 ---

    it('saveApi(新增): 正常 row → withTabLocks([apis]) 內 funNew 正規化（配 id）後以 ("apis","save",[o]) 呼叫 procOrm（無第 5 參 opt）', async function() {
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a)
            return 'ok'
        }
        let { api, locks } = mk({ deps: { procOrm } })
        let r = await api.saveApi('u1', { name: 'x', url: 'http://a', method: 'GET' })
        assert.strictEqual(r, 'ok')
        assert.strictEqual(calls.length, 1)
        assert.strictEqual(calls[0].length, 4, '新增走 procOrm 四參數（無 mustExist；以新 id 寫入即新增）')
        assert.strictEqual(calls[0][0], 'u1')
        assert.strictEqual(calls[0][1], 'apis')
        assert.strictEqual(calls[0][2], 'save')
        assert.ok(Array.isArray(calls[0][3]) && calls[0][3].length === 1, 'arg 應為單元素陣列')
        assert.ok(typeof calls[0][3][0].id === 'string' && calls[0][3][0].id.length > 0, 'funNew 應配 id')
        assert.deepStrictEqual(locks.calls.withTabLocks, [['apis']], '新增亦取 apis 表鎖（與匯入、其他存檔序列化）')
        assert.strictEqual(locks.calls.guardWrite.length, 0, '新增不比對基準')
    })

    it('saveApi(新增): 客戶端送來之伺服器專有欄位（srcKey、timeCreate、isActive、userIdUpdate）與非字串 id 一律不採用（A7）', async function() {
        let captured = null
        let procOrm = async (userId, table, method, arg) => {
            captured = arg[0]; return 'ok'
        }
        let { api } = mk({ deps: { procOrm } })
        await api.saveApi('u1', { id: 123, name: 'x', url: 'http://a', method: 'GET', srcKey: 'forged-key', timeCreate: '1999-01-01 00:00:00', isActive: 'n', userIdUpdate: 'forged-user' })
        assert.notStrictEqual(captured.id, 123, '非字串 id 不採用，由 funNew 配新 id')
        assert.ok(typeof captured.id === 'string')
        assert.strictEqual(captured.srcKey, '', 'srcKey 為匯入之身分欄，後台不可寫（新增列為空字串）')
        assert.notStrictEqual(captured.timeCreate, '1999-01-01 00:00:00', 'timeCreate 由伺服器配（A7）')
        assert.strictEqual(captured.isActive, 'y', 'isActive 由伺服器配')
        assert.notStrictEqual(captured.userIdUpdate, 'forged-user', 'userIdUpdate 由 procOrm 寫操作者，客戶端值不採用')
    })

    //--- 修改（row.id 為字串）：只改不增、只寫白名單欄位、有基準則同鎖內比對 ---

    it('saveApi(修改): 以 guardWrite（tables [apis]、契約、read 只讀該列）→ procOrm save + opt { mustExist: true }；只寫契約白名單欄位（A7、V5）', async function() {
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a); return 'ok'
        }
        let rowDb = { id: 'fixed-id-1', name: 'old', url: 'http://old', method: 'get' }
        let { api, locks, queries } = mk({ rows: [rowDb], deps: { procOrm } })
        let r = await api.saveApi('u1', {
            id: 'fixed-id-1',
            name: 'x',
            url: 'http://a',
            method: 'GET',
            timeCreate: '1999-01-01 00:00:00',
            timeUpdate: 'forged',
            isActive: 'n',
            userIdUpdate: 'forged-user',
            srcKey: 'forged-key',
        })
        assert.strictEqual(r, 'ok')
        assert.strictEqual(calls.length, 1)
        assert.deepStrictEqual(calls[0].slice(0, 3), ['u1', 'apis', 'save'])
        let o = calls[0][3][0]
        assert.strictEqual(o.id, 'fixed-id-1', '既有 id 應被保留')
        for (let k of ['timeCreate', 'timeUpdate', 'isActive', 'userIdUpdate', 'srcKey']) {
            assert.ok(!Object.prototype.hasOwnProperty.call(o, k), `伺服器專有欄位 ${k} 不得寫入（取庫內值）`)
        }
        assert.deepStrictEqual(calls[0][4], { mustExist: true }, 'opt 只由伺服端自組（只改不增）')
        assert.deepStrictEqual(locks.calls.guardWrite[0].tables, ['apis'])
        assert.strictEqual(locks.calls.guardWrite[0].contract, contract, '使用前後端同一份寫入契約')
        assert.deepStrictEqual(queries, [{ id: { $in: ['fixed-id-1'] } }], '逐列存檔之 read 只讀該列（若讀整表，列被刪時會得 baselineMismatch 而非 rowNotFound）')
    })

    it('saveApi(修改): authType／contentType 空值補預設（同 funNew），但只在列帶該欄時才補；未帶者不碰庫內值', async function() {
        let captured = []
        let procOrm = async (userId, table, method, arg) => {
            captured.push(arg[0]); return 'ok'
        }
        let { api } = mk({ deps: { procOrm } })
        await api.saveApi('u1', { id: 'a1', name: 'x', url: 'http://a', method: 'GET', authType: '', contentType: '' })
        assert.strictEqual(captured[0].authType, 'none')
        assert.strictEqual(captured[0].contentType, 'application/json')
        await api.saveApi('u2', { id: 'a1', name: 'x', url: 'http://a', method: 'GET' })
        assert.ok(!Object.prototype.hasOwnProperty.call(captured[1], 'authType'), '未帶 authType 不得寫入預設值')
        assert.ok(!Object.prototype.hasOwnProperty.call(captured[1], 'contentType'))
    })

    it('saveApi(修改): 第 3 參數 opt 只讀 baseline 一鍵、絕不轉給 procOrm（客戶端不得指定 mustExist／keepUserId）', async function() {
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a); return 'ok'
        }
        let rowDb = { id: 'a1', name: 'x', url: 'http://a', method: 'get' }
        let { api } = mk({ rows: [rowDb], deps: { procOrm } })
        let baseline = buildBaseline([rowDb], contract)
        await api.saveApi('u1', { ...rowDb }, { baseline, mustExist: false, keepUserId: true, userId: 'forged' })
        assert.deepStrictEqual(calls[0][4], { mustExist: true }, '客戶端 opt 之 mustExist:false／keepUserId:true 不得進入 procOrm')
    })

    it('saveApi(修改): opt 未給、null、{}、{ baseline: undefined } ＝ 不帶基準（本 major 允許）；仍取鎖、仍只改不增', async function() {
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a); return 'ok'
        }
        let rowDb = { id: 'a1', name: 'old', url: 'http://a', method: 'get' }
        let { api, locks } = mk({ rows: [rowDb], deps: { procOrm } })
        for (let opt of [undefined, null, {}, { baseline: undefined }]) {
            await api.saveApi('u1', { ...rowDb, name: 'new' }, opt)
        }
        assert.strictEqual(calls.length, 4)
        assert.ok(locks.calls.guardWrite.every((c) => c.baseline === undefined), '不帶基準時 guardWrite 之 baseline 為 undefined（只取鎖與讀取，不比對）')
        assert.ok(calls.every((c) => c[4] && c[4].mustExist === true))
    })

    it('saveApi(修改): 基準格式不識（null 基準、非陣列、h9 版本、非物件 opt）→ errBaselineFormat，不得降級為不帶基準，且不寫入', async function() {
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a); return 'ok'
        }
        let rowDb = { id: 'a1', name: 'old', url: 'http://a', method: 'get' }
        let { api } = mk({ rows: [rowDb], deps: { procOrm } })
        for (let opt of [{ baseline: null }, { baseline: 'x' }, { baseline: [['a1', 'h9:00000000000000']] }, { baseline: [['a1']] }, 'str', 7, true, [], [1]]) {
            await expectReject(() => api.saveApi('u1', { ...rowDb, name: 'new' }, opt), 'errBaselineFormat')
        }
        //空陣列為格式合法之基準（代表載入時無此列）→ 與庫內現有此列比對不符，屬先動先贏之拒收而非格式錯誤
        await expectReject(() => api.saveApi('u1', { ...rowDb, name: 'new' }, { baseline: [] }), 'saveStale')
        assert.strictEqual(calls.length, 0, '格式不識與不符一律零寫入')
    })

    it('saveApi(修改): 持舊基準（庫內列已被他人改過）→ saveStale、零寫入（先動先贏）；持新基準 → 可存', async function() {
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a); return 'ok'
        }
        let rowOld = { id: 'a1', name: 'old', url: 'http://a', method: 'get' }
        let rowNow = { ...rowOld, name: 'changed-by-other' }
        let { api } = mk({ rows: [rowNow], deps: { procOrm } })
        await expectReject(() => api.saveApi('u1', { ...rowOld, name: 'mine' }, { baseline: buildBaseline([rowOld], contract) }), 'saveStale')
        assert.strictEqual(calls.length, 0)
        assert.strictEqual(await api.saveApi('u1', { ...rowNow, name: 'mine' }, { baseline: buildBaseline([rowNow], contract) }), 'ok')
        assert.strictEqual(calls.length, 1)
    })

    it('saveApi(修改): 列已被刪（庫內無此列）→ 帶基準得 errApiRowNotFound（逐列 read 只讀該列）；不帶基準時 procOrm 之 rowNotFound 亦轉 errApiRowNotFound（E5／E5b）', async function() {
        let procOrm = async () => Promise.reject('rowNotFound') //mustExist 之未命中
        let rowOld = { id: 'a1', name: 'old', url: 'http://a', method: 'get' }
        let { api } = mk({ rows: [], deps: { procOrm } })
        await expectReject(() => api.saveApi('u1', { ...rowOld }, { baseline: buildBaseline([rowOld], contract) }), 'errApiRowNotFound')
        await expectReject(() => api.saveApi('u1', { ...rowOld }), 'errApiRowNotFound')
        await expectReject(() => api.saveApi('u1', { id: 'ghost-id-never-existed', name: 'g', url: 'u' }), 'errApiRowNotFound')
    })

    it('拒收鍵轉語系鍵：rowsInvalid（庫內主鍵重複）→ getDataError 並記 srLog；其餘一般例外 → saveWriteFail 並記原文', async function() {
        let logs = []
        let srLog = { error: (o) => logs.push(o) }
        let rowOld = { id: 'a1', name: 'old', url: 'http://a', method: 'get' }
        let { api } = mk({ rows: [rowOld, rowOld], deps: { procOrm: async () => 'ok', srLog } }) //庫內讀出同 id 兩列
        await expectReject(() => api.saveApi('u1', { ...rowOld }, { baseline: buildBaseline([rowOld], contract) }), 'getDataError')
        assert.ok(logs.some((l) => l.event === 'kpfun-saveApi-rowsInvalid' && l.err === 'getDataError'), 'rowsInvalid 屬伺服端資料錯誤，須記 log')
    })

    it('鎖內讀取失敗（woItems.select reject）→ saveApi／deleteApi 皆回 getDataError（讀取類，同 getApisList 與外部匯入）並記 srLog；零寫入（外審 sol#12）', async function() {
        let logs = []
        let srLog = { error: (o) => logs.push(o) }
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a); return 'ok'
        }
        let rowOld = { id: 'a1', name: 'old', url: 'http://a', method: 'get' }
        let { api } = mk({ deps: { procOrm, srLog, woItems: { apis: { select: async () => Promise.reject(new Error('lmdb read fail')) } } } })
        await expectReject(() => api.saveApi('u1', { ...rowOld }), 'getDataError') //不帶基準
        await expectReject(() => api.saveApi('u1', { ...rowOld }, { baseline: buildBaseline([rowOld], contract) }), 'getDataError') //帶基準
        await expectReject(() => api.deleteApi('u1', 'a1'), 'getDataError')
        assert.strictEqual(calls.length, 0, '讀取失敗零寫入')
        assert.ok(logs.some((l) => l.event === 'kpfun-saveApi-read-orm' && l.err === 'getDataError'))
        assert.ok(logs.some((l) => l.event === 'kpfun-deleteApi-read-orm' && l.err === 'getDataError'))
        assert.ok(!logs.some((l) => l.err === 'saveWriteFail'), '不誤記為寫入失敗')
    })

    //--- 刪除 ---

    it('deleteApi: 正常 id → guardWrite（read 只讀該列）內以 ("apis","del",{id}) + { mustExist: true } 呼叫 procOrm，回傳 procOrm 之結果（形狀不變）', async function() {
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a); return [{ n: 1, nDeleted: 1, ok: 1 }]
        }
        let rowDb = { id: 'id-1', name: 'x', url: 'http://a', method: 'get' }
        let { api, queries } = mk({ rows: [rowDb], deps: { procOrm } })
        let r = await api.deleteApi('u1', 'id-1')
        assert.deepStrictEqual(r, [{ n: 1, nDeleted: 1, ok: 1 }])
        assert.deepStrictEqual(calls[0], ['u1', 'apis', 'del', { id: 'id-1' }, { mustExist: true }])
        assert.deepStrictEqual(queries, [{ id: { $in: ['id-1'] } }])
    })

    it('deleteApi: 未命中（procOrm rowNotFound）→ errApiRowNotFound（含不帶基準者，E6）；持舊基準 → saveStale 零刪除；基準格式錯 → errBaselineFormat', async function() {
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a); return Promise.reject('rowNotFound')
        }
        let rowOld = { id: 'id-1', name: 'old', url: 'http://a', method: 'get' }
        let rowNow = { ...rowOld, name: 'changed' }
        let { api } = mk({ rows: [rowNow], deps: { procOrm } })
        await expectReject(() => api.deleteApi('u1', 'id-1'), 'errApiRowNotFound')
        calls.length = 0
        await expectReject(() => api.deleteApi('u1', 'id-1', { baseline: buildBaseline([rowOld], contract) }), 'saveStale')
        await expectReject(() => api.deleteApi('u1', 'id-1', { baseline: 'bad' }), 'errBaselineFormat')
        await expectReject(() => api.deleteApi('u1', 'id-1', 'str'), 'errBaselineFormat')
        assert.strictEqual(calls.length, 0, '比對不符或格式錯皆零刪除')
    })

    //R-ERR-1: 直呼 woItems.select 之 getApisList（ADR-031：getApisList 經 procOrm）
    it('getApisList: 以 ("apis","select",{}) 呼叫 procOrm 並回傳其結果（不直呼 woItems）', async function() {
        let calls = []
        let procOrm = async (...a) => {
            calls.push(a)
            return [{ id: 'x' }]
        }
        let woItems = {
            apis: {
                select: async () => {
                    throw new Error('不得直呼 woItems.apis.select')
                },
            },
        }
        let { getApisList } = procApis({ woItems, procOrm, ds })
        let r = await getApisList('u1')
        assert.deepStrictEqual(r, [{ id: 'x' }])
        assert.deepStrictEqual(calls, [['u1', 'apis', 'select', {}]])
    })

    //--- 表鎖：存檔、刪除共用同一把 apis 表鎖（修 A2：原 saveApi:<id> 與 deleteApi:<id> 異鍵不互斥）---

    it('表鎖: 不同使用者對同一列並發 saveApi／deleteApi → 全部序列化（procOrm 不重疊）；不同列亦序列化（一表一鍵）', async function() {
        let active = 0
        let maxActive = 0
        let order = []
        let procOrm = async (userId, table, method, arg) => {
            active += 1
            maxActive = Math.max(maxActive, active)
            order.push(method + ':' + (Array.isArray(arg) ? arg[0].id : arg.id))
            await new Promise((resolve) => setTimeout(resolve, 40))
            active -= 1
            return 'ok'
        }
        let rows = [{ id: 'same-id', name: 'x' }, { id: 'other-id', name: 'y' }]
        let { api } = mk({ rows, deps: { procOrm } })
        let rs = await Promise.allSettled([
            api.saveApi('u1', { id: 'same-id', name: 'a', url: 'http://a', method: 'GET' }),
            api.saveApi('u2', { id: 'same-id', name: 'b', url: 'http://b', method: 'GET' }),
            api.deleteApi('u1', 'same-id'),
            api.deleteApi('u2', 'other-id'),
            api.saveApi('u3', { name: 'new-one', url: 'http://c', method: 'GET' }),
        ])
        assert.ok(rs.every((r) => r.status === 'fulfilled'), `皆成功（序列化非拒絕）：${JSON.stringify(rs.map((r) => r.status))}`)
        assert.strictEqual(order.length, 5)
        assert.strictEqual(maxActive, 1, `一表一鍵：任何寫入皆不重疊，實測最大並行 ${maxActive}`)
    })

    //--- 雙擊防護（後端依使用者占位，ADR-034）：同一使用者之同一操作處理中再送出 → reject（儲存 'saveInProgress'、刪除 'deleteInProgress'）、
    //    不排隊（第 2 次不寫入）；以 deferred 使第 1 次停在 procOrm 內（處理中），第 2 次必於其間到達，不依賴時序 ---

    it('雙擊防護: 同一 userId 並行 saveApi（新增列，無 id）→ 第 2 次 reject saveInProgress，只插入 1 筆', async function() {
        let d = deferred()
        let saved = []
        let procOrm = async (userId, table, method, arg) => {
            saved.push({ userId, method, id: arg[0].id })
            await d.p
            return 'ok'
        }
        let { api } = mk({ deps: { procOrm } })
        let row = { name: 'dc-new', url: 'http://a', method: 'GET' }
        let p1 = api.saveApi('u1', row)
        await expectReject(() => api.saveApi('u1', row), 'saveInProgress')
        d.resolve()
        assert.strictEqual(await p1, 'ok', '第 1 次照常完成')
        assert.strictEqual(saved.length, 1, `只插入 1 筆（實得 ${JSON.stringify(saved)}）`)
        //占位於完成後釋放：同一使用者再送出（合法之下一次儲存）可執行
        assert.strictEqual(await api.saveApi('u1', row), 'ok')
        assert.strictEqual(saved.length, 2)
    })

    it('雙擊防護: 同一 userId 並行 saveApi（既有列）／deleteApi → 第 2 次各 reject saveInProgress／deleteInProgress，procOrm 各只 1 次', async function() {
        let dSave = deferred()
        let dDel = deferred()
        let calls = []
        let procOrm = async (userId, table, method, arg) => {
            calls.push(method)
            await (method === 'save' ? dSave.p : dDel.p)
            return 'ok'
        }
        let rows = [{ id: 'id-dc-1', name: 'x' }, { id: 'id-dc-2', name: 'y' }]
        let { api } = mk({ rows, deps: { procOrm } })
        let row = { id: 'id-dc-1', name: 'x', url: 'http://a', method: 'GET' }
        let pSave = api.saveApi('u1', row)
        await expectReject(() => api.saveApi('u1', row), 'saveInProgress')
        //不同操作（刪除）不受儲存之占位影響；刪除處理中再刪除亦拒絕（刪除之占位衝突 key 為 deleteInProgress）
        //（表鎖為一表一鍵：刪除須等儲存完成才執行，但占位判斷在表鎖之外，故第 2 次刪除立即被拒）
        let pDel = api.deleteApi('u1', 'id-dc-2')
        await expectReject(() => api.deleteApi('u1', 'id-dc-2'), 'deleteInProgress')
        dSave.resolve()
        dDel.resolve()
        assert.strictEqual(await pSave, 'ok')
        assert.strictEqual(await pDel, 'ok')
        assert.deepStrictEqual(calls.sort(), ['del', 'save'], `procOrm 各只 1 次（實得 ${JSON.stringify(calls)}）`)
    })

    it('雙擊防護: 不同 userId 並行 saveApi（同名新增）→ 皆成功、各插入 1 筆（不以名稱為唯一鍵）', async function() {
        let ids = []
        let procOrm = async (userId, table, method, arg) => {
            ids.push(arg[0].id)
            await new Promise((resolve) => setTimeout(resolve, 20))
            return 'ok'
        }
        let { api } = mk({ deps: { procOrm } })
        let row = { name: 'dc-same-name', url: 'http://a', method: 'GET' }
        let rs = await Promise.all([api.saveApi('u1', row), api.saveApi('u2', row)])
        assert.deepStrictEqual(rs, ['ok', 'ok'])
        assert.strictEqual(ids.length, 2, '兩位使用者各插入 1 筆')
        assert.notStrictEqual(ids[0], ids[1], '新增列各自配 id')
    })

    //R-ERR-1（ADR-038）：procOrm 之失敗字串（w-serv-orm 1.1.8 起為英文，如 getMapOrm.mjs 之 'failed to save data'、'failed to delete data'）不外露：
    //存／刪回語系鍵 saveWriteFail、原文入 srLog；占位照常釋放（原期望為原樣轉出，且替身仍為 1.1.8 前之中文字串）
    it('雙擊防護: procOrm 失敗時回 saveWriteFail（原文入 srLog）並釋放占位（同一使用者可再送出；存／刪皆同）', async function() {
        let n = 0
        let procOrm = async (userId, table, method) => {
            n += 1
            if (n === 1 || n === 3) {
                return Promise.reject(method === 'save' ? 'failed to save data' : 'failed to delete data') //mapOrm 之失敗字串（w-serv-orm 1.1.10）
            }
            return 'ok'
        }
        let logs = []
        let srLog = { error: (o) => logs.push(o) }
        let rows = [{ id: 'id-dc-3', name: 'x' }]
        let { api } = mk({ rows, deps: { procOrm, srLog } })
        let row = { id: 'id-dc-3', name: 'x', url: 'http://a', method: 'GET' }
        await expectReject(() => api.saveApi('u1', row), 'saveWriteFail')
        assert.strictEqual(await api.saveApi('u1', row), 'ok', '儲存失敗結束後占位已釋放')
        await expectReject(() => api.deleteApi('u1', 'id-dc-3'), 'saveWriteFail')
        assert.strictEqual(await api.deleteApi('u1', 'id-dc-3'), 'ok', '刪除失敗結束後占位已釋放')
        assert.deepStrictEqual(logs, [
            { event: 'kpfun-saveApi-orm', err: 'saveWriteFail', orm: 'failed to save data' },
            { event: 'kpfun-deleteApi-orm', err: 'saveWriteFail', orm: 'failed to delete data' },
        ], 'procOrm 原文只入 srLog')
    })

    it('R-ERR-1: getApisList 之 procOrm 失敗 → 回 getDataError（原文入 srLog）；Error 型拒絕只記名稱不記訊息', async function() {
        let logs = []
        let srLog = { error: (o) => logs.push(o) }
        let { getApisList } = procApis({ procOrm: async () => Promise.reject('failed to select data'), ds, srLog })
        await expectReject(() => getApisList('u1'), 'getDataError')
        let err = new TypeError('secret-in-message')
        let { api } = mk({ deps: { procOrm: async () => Promise.reject(err), srLog } })
        await expectReject(() => api.saveApi('u1', { name: 'x', url: 'http://a', method: 'GET' }), 'saveWriteFail')
        assert.deepStrictEqual(logs, [
            { event: 'kpfun-getApisList-orm', err: 'getDataError', orm: 'failed to select data' },
            { event: 'kpfun-saveApi-orm', err: 'saveWriteFail', orm: '(object) TypeError' },
        ])
        assert.ok(!JSON.stringify(logs).includes('secret-in-message'), 'Error 之 message 不得入 log')
    })

    it('fail-closed: 未注入 lockSave／withTabLocks／guardWrite 任一 → saveApi／deleteApi reject 且不呼叫 procOrm（不以無占位、無表鎖模式執行）', async function() {
        let calls = 0
        let procOrm = async () => {
            calls += 1
            return 'ok'
        }
        let locks = mkLocks()
        let wi = mkWoItems([{ id: 'id-x' }])
        let base = { procOrm, ds, woItems: wi.woItems }
        let fnNew = (a) => () => a.saveApi('u1', { name: 'x', url: 'http://a', method: 'GET' })
        let fnMod = (a) => () => a.saveApi('u1', { id: 'id-x', name: 'x', url: 'http://a', method: 'GET' })
        let fnDel = (a) => () => a.deleteApi('u1', 'id-x')
        let variants = [
            { name: 'lockSave', deps: { ...base, withTabLocks: locks.withTabLocks, guardWrite: locks.guardWrite }, fns: [fnNew, fnMod, fnDel] },
            { name: 'withTabLocks', deps: { ...base, lockSave, guardWrite: locks.guardWrite }, fns: [fnNew] }, //新增路徑用 withTabLocks
            { name: 'guardWrite', deps: { ...base, lockSave, withTabLocks: locks.withTabLocks }, fns: [fnMod, fnDel] }, //修改、刪除路徑用 guardWrite
        ]
        for (let v of variants) {
            let a = procApis(v.deps)
            for (let mkFn of v.fns) {
                let rejected = false
                await mkFn(a)().catch(() => {
                    rejected = true
                })
                assert.ok(rejected, `未注入 ${v.name} 應 reject`)
            }
        }
        assert.strictEqual(calls, 0, '缺任一依賴皆不得呼叫 procOrm')
    })

    //--- 存檔成功回傳寫入後之列（api-run03；規格第8節「存檔成功後之新基準取自伺服端，且須立即取得」）---
    //mkStateful: 有狀態之替身——庫內列（Map）、procOrm save 寫入並模擬 clearXSS 改寫（< → &lt;）與 timeUpdate 換新、表鎖替身標記「是否在鎖內」；
    //log 記錄 save／select 之先後與是否在鎖內，供斷言「讀回發生在寫入之後、仍在同一把表鎖內」
    function mkStateful(initial = [], over = {}) {
        let store = new Map(initial.map((r) => [r.id, r]))
        let kmx = pmKeyMutex()
        let inLock = false
        let log = []
        let nSelect = 0
        let inside = async (fn) => {
            return kmx('apis', async () => {
                inLock = true
                try {
                    return await fn()
                }
                finally {
                    inLock = false
                }
            })
        }
        let withTabLocks = (tables, fn) => inside(fn)
        let guardWrite = (o) => inside(async () => {
            let rows = await o.read()
            return await o.write(rows)
        })
        let woItems = {
            apis: {
                select: async (q) => {
                    nSelect += 1
                    log.push({ op: 'select', inLock })
                    if (over.failSelectFrom !== undefined && nSelect >= over.failSelectFrom) {
                        return Promise.reject(new Error('select boom'))
                    }
                    if (over.emptySelectFrom !== undefined && nSelect >= over.emptySelectFrom) {
                        return []
                    }
                    let ids = q && q.id && q.id.$in
                    return [...store.values()].filter((r) => (ids ? ids.includes(r.id) : true)).map((r) => ({ ...r }))
                },
            },
        }
        let procOrm = async (userId, table, mode, arg) => {
            log.push({ op: 'save', inLock })
            let rs = []
            for (let r of arg) {
                let w = { ...(store.get(r.id) || {}), ...r }
                if (typeof w.name === 'string') {
                    w.name = w.name.replace(/</g, '&lt;') //模擬寫入時 clearXSS 改寫
                }
                w.timeUpdate = `T${log.length}`
                store.set(r.id, w)
                rs.push({ id: r.id, ok: 1, n: 1 })
            }
            return rs
        }
        let errs = []
        let srLog = { error: (o) => errs.push(o) }
        let api = procApis({ woItems, procOrm, ds, lockSave, withTabLocks, guardWrite, srLog })
        return { api, store, log, errs }
    }

    it('saveApi(修改): 回傳 procOrm save 之逐筆結果（id、ok 等原鍵不變），第 0 筆另帶 row ＝表鎖內寫入後新鮮讀回之列（含 clearXSS 改寫值，非送出值）', async function() {
        let { api, store, log } = mkStateful([{ id: 'a1', name: 'old', url: 'http://old', method: 'get', timeCreate: 'T-create', isActive: 'y' }])
        let r = await api.saveApi('u1', { id: 'a1', name: 'x<b', url: 'http://a', method: 'GET' })
        assert.ok(Array.isArray(r) && r.length === 1)
        assert.strictEqual(r[0].id, 'a1', 'procOrm 結果之 id 鍵不變')
        assert.strictEqual(r[0].ok, 1, 'procOrm 結果之 ok 鍵不變')
        assert.strictEqual(r[0].n, 1)
        assert.strictEqual(r[0].row.name, 'x&lt;b', 'row 為伺服端存放之值（clearXSS 已改寫），不是前端送出之 x<b（規格第8節: 不得以送出值當新基準）')
        assert.strictEqual(r[0].row.url, 'http://a')
        assert.strictEqual(r[0].row.timeCreate, 'T-create', '伺服器專有欄位亦在（取庫內值）')
        assert.strictEqual(r[0].row.isActive, 'y')
        assert.deepStrictEqual(r[0].row, store.get('a1'), 'row ＝讀回時刻之庫內列')
        //讀回發生在寫入之後，且仍在同一把表鎖內
        let iSave = log.findIndex((v) => v.op === 'save')
        let reads = log.map((v, i) => ({ ...v, i })).filter((v) => v.op === 'select')
        assert.strictEqual(reads.length, 2, 'guardWrite 之 read ＋ 寫入後之讀回')
        assert.ok(reads[1].i > iSave, '讀回在寫入之後')
        assert.ok(log[iSave].inLock && reads[1].inLock, '寫入與讀回皆在表鎖內（讀回之間不會夾入他人之寫入）')
    })

    it('saveApi(新增): 回傳之 row 含伺服端 funNew 配的新 id（與寫入的是同一個）', async function() {
        let { api, store, log } = mkStateful()
        let r = await api.saveApi('u1', { name: 'brand<new', url: 'http://a', method: 'GET' })
        assert.ok(Array.isArray(r) && r.length === 1)
        let id = r[0].id
        assert.ok(typeof id === 'string' && id.length > 0)
        assert.strictEqual(r[0].row.id, id, 'row.id ＝ 新配之 id')
        assert.strictEqual(r[0].row.name, 'brand&lt;new')
        assert.deepStrictEqual(r[0].row, store.get(id))
        let iSave = log.findIndex((v) => v.op === 'save')
        let reads = log.map((v, i) => ({ ...v, i })).filter((v) => v.op === 'select')
        assert.strictEqual(reads.length, 1, '新增只有寫入後之讀回')
        assert.ok(reads[0].i > iSave && reads[0].inLock, '讀回在寫入之後且在表鎖內')
    })

    it('saveApi: 寫入後讀回失敗（拒絕）不使存檔失敗（寫入已生效）→ 回 procOrm 原結果（無 row；前端退回等推播），讀回失敗入 srLog 且只記錯誤鍵', async function() {
        let m = mkStateful([{ id: 'a1', name: 'old', url: 'http://old', method: 'get' }], { failSelectFrom: 2 })
        let r = await m.api.saveApi('u1', { id: 'a1', name: 'x', url: 'http://a', method: 'GET' })
        assert.deepStrictEqual(r, [{ id: 'a1', ok: 1, n: 1 }])
        assert.strictEqual(m.store.get('a1').name, 'x', '寫入已生效')
        assert.strictEqual(m.errs.length, 1)
        assert.strictEqual(m.errs[0].event, 'kpfun-saveApi-readBack-orm')
        assert.strictEqual(m.errs[0].err, 'getDataError')
        assert.ok(!JSON.stringify(m.errs[0]).includes('http://a'), 'log 不記列值')
        //新增路徑同
        let n = mkStateful([], { failSelectFrom: 1 })
        let r2 = await n.api.saveApi('u1', { name: 'y', url: 'http://b', method: 'GET' })
        assert.ok(Array.isArray(r2) && r2.length === 1 && !('row' in r2[0]))
        assert.strictEqual(n.store.size, 1)
        assert.strictEqual(n.errs[0].err, 'getDataError')
    })

    it('saveApi: 寫入後讀回未命中（列不見）→ 回 procOrm 原結果，不附 row、不失敗，並入 srLog（-readBack-miss）', async function() {
        let m = mkStateful([{ id: 'a1', name: 'old', url: 'http://old', method: 'get' }], { emptySelectFrom: 2 })
        let r = await m.api.saveApi('u1', { id: 'a1', name: 'x', url: 'http://a', method: 'GET' })
        assert.deepStrictEqual(r, [{ id: 'a1', ok: 1, n: 1 }])
        assert.strictEqual(m.errs.length, 1)
        assert.strictEqual(m.errs[0].event, 'kpfun-saveApi-readBack-miss')
        assert.strictEqual(m.errs[0].err, 'getDataError')
    })

    it('saveApi: procOrm 結果不是「全為物件之非空陣列」（非預期形狀，如含 null 元素）→ 原樣回傳、不讀回', async function() {
        for (let shape of [[{ id: 'a1', ok: 1 }, null], [], 'ok', null, [7]]) {
            let wi = mkWoItems([{ id: 'a1', name: 'old', url: 'http://old', method: 'get' }])
            let locks = mkLocks()
            let procOrm = async () => shape
            let api = procApis({ woItems: wi.woItems, procOrm, ds, lockSave, withTabLocks: locks.withTabLocks, guardWrite: locks.guardWrite })
            let r = await api.saveApi('u1', { id: 'a1', name: 'x', url: 'http://a', method: 'GET' })
            assert.strictEqual(r, shape, `形狀 ${JSON.stringify(shape)} 應原樣回傳`)
            assert.strictEqual(wi.queries.length, 1, '只有 guardWrite 之 read，不讀回')
        }
    })

    it('saveApi: 被拒（saveStale）時不讀回、不附 row（寫入階段之拒收路徑不變; errApiRowNotFound 見 api-concurrency）', async function() {
        let rowNow = { id: 'a1', name: 'changed-by-other', url: 'http://a', method: 'get' }
        let rowOld = { ...rowNow, name: 'old' }
        let locks = mkLocks()
        let wi = mkWoItems([rowNow])
        let procOrm = async () => [{ id: 'a1', ok: 1, n: 1 }]
        let api = procApis({ woItems: wi.woItems, procOrm, ds, lockSave, withTabLocks: locks.withTabLocks, guardWrite: locks.guardWrite })
        await expectReject(() => api.saveApi('u1', { ...rowOld, name: 'mine' }, { baseline: buildBaseline([rowOld], contract) }), 'saveStale')
        assert.strictEqual(wi.queries.length, 1, '只有 guardWrite 之 read，被拒後不讀回')
    })

})
