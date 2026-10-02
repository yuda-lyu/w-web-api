//unit-procApis：procApis 工廠之錯誤路徑（e2e 因前端同步短路不可達、原本完全未測）+ 正常路徑（mock procOrm）。
//對應 z待修清單 T18。純 unit（不需 server/browser），mocha 預設 glob 自動涵蓋。
//ADR-034 起 saveApi／deleteApi 以注入之 lockSave 依使用者占位：會呼叫 procOrm 之案例一律注入與 WWebApi 相同之實作（createLockSave(cacheSt())）。
import assert from 'assert'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import procApis from '../server/procApis.mjs'
import createLockSave from '../server/lockSave.mjs'
import ds from '../src/schema/index.mjs'


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

    it('saveApi: 正常 row → funNew 正規化（配 id）後以 ("apis","save",[o]) 呼叫 procOrm', async function() {
        let calls = []
        let procOrm = async (userId, table, method, arg) => {
            calls.push({ userId, table, method, arg })
            return 'ok'
        }
        let { saveApi } = procApis({ procOrm, ds, lockSave })
        let r = await saveApi('u1', { name: 'x', url: 'http://a', method: 'GET' })
        assert.strictEqual(r, 'ok')
        assert.strictEqual(calls.length, 1)
        assert.strictEqual(calls[0].userId, 'u1')
        assert.strictEqual(calls[0].table, 'apis')
        assert.strictEqual(calls[0].method, 'save')
        assert.ok(Array.isArray(calls[0].arg) && calls[0].arg.length === 1, 'arg 應為單元素陣列')
        assert.ok(typeof calls[0].arg[0].id === 'string' && calls[0].arg[0].id.length > 0, 'funNew 應配 id')
    })

    it('saveApi: 帶既有 id → 保留原 id（既有筆 update）', async function() {
        let captured = null
        let procOrm = async (userId, table, method, arg) => { captured = arg[0]; return 'ok' }
        let { saveApi } = procApis({ procOrm, ds, lockSave })
        await saveApi('u1', { id: 'fixed-id-1', name: 'x', url: 'http://a', method: 'GET' })
        assert.strictEqual(captured.id, 'fixed-id-1', '既有 id 應被保留')
    })

    //ADR-031：getApisList 經 procOrm（與 save/del 同一入口），ORM 層政策（useCheckUser / useExcludeWhenNotAdmin）才套到讀取；改造前直呼 woItems.select 繞過
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

    it('deleteApi: 正常 id → 以 ("apis","del",{id}) 呼叫 procOrm', async function() {
        let calls = []
        let procOrm = async (...a) => { calls.push(a); return 'ok' }
        let { deleteApi } = procApis({ procOrm, lockSave })
        let r = await deleteApi('u1', 'id-1')
        assert.strictEqual(r, 'ok')
        assert.deepStrictEqual(calls[0], ['u1', 'apis', 'del', { id: 'id-1' }])
    })

    //後端層並發防護：同 key 之寫入以 pmKeyMutex 序列化，procOrm 呼叫不得重疊；不同 key 可並行。
    //ADR-034 起同一使用者之同一操作處理中再送出即被 lockSave 拒絕（見下方「雙擊防護」案例），故本案之同 key 兩次寫入改由
    //兩位使用者（u1／u2）送出，保留原契約（kmx 序列化、非拒絕）；原本兩次皆為 u1
    it('saveApi/deleteApi: 不同使用者同 key 並發 → 序列化執行（procOrm 不重疊）；不同 key 不互相阻塞', async function() {
        let active = 0
        let maxActive = 0
        let order = []
        let procOrm = async (userId, table, method, arg) => {
            active += 1
            maxActive = Math.max(maxActive, active)
            order.push(method + ':' + (Array.isArray(arg) ? arg[0].id : arg.id))
            await new Promise((resolve) => setTimeout(resolve, 60))
            active -= 1
            return 'ok'
        }
        let { saveApi, deleteApi } = procApis({ procOrm, ds, lockSave })
        //同 id 並發 save ×2（兩位使用者）+ del ×1（del 為不同 key 與不同操作，可與 save 並行）
        let rs = await Promise.allSettled([
            saveApi('u1', { id: 'same-id', name: 'a', url: 'http://a', method: 'GET' }),
            saveApi('u2', { id: 'same-id', name: 'b', url: 'http://b', method: 'GET' }),
            deleteApi('u1', 'other-id'),
        ])
        assert.ok(rs.every((r) => r.status === 'fulfilled' && r.value === 'ok'), '三者皆成功（序列化非拒絕）')
        assert.strictEqual(order.filter((s) => s.startsWith('save:same-id')).length, 2)
        //同 key 兩次 save 不得重疊：允許的最大並行 = save 其一 + 不同 key 的 del
        assert.ok(maxActive <= 2, `同 key 應序列化，實測最大並行 ${maxActive}`)
        //新增筆（無 id）以 name 為 key：不同使用者同名並發亦序列化
        active = 0; maxActive = 0
        await Promise.all([
            saveApi('u1', { name: 'dup', url: 'http://a', method: 'GET' }),
            saveApi('u2', { name: 'dup', url: 'http://b', method: 'GET' }),
        ])
        assert.strictEqual(maxActive, 1, '同名新增應序列化')
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
        let { saveApi } = procApis({ procOrm, ds, lockSave })
        let row = { name: 'dc-new', url: 'http://a', method: 'GET' }
        let p1 = saveApi('u1', row)
        await expectReject(() => saveApi('u1', row), 'saveInProgress')
        d.resolve()
        assert.strictEqual(await p1, 'ok', '第 1 次照常完成')
        assert.strictEqual(saved.length, 1, `只插入 1 筆（實得 ${JSON.stringify(saved)}）`)
        //占位於完成後釋放：同一使用者再送出（合法之下一次儲存）可執行
        assert.strictEqual(await saveApi('u1', row), 'ok')
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
        let { saveApi, deleteApi } = procApis({ procOrm, ds, lockSave })
        let row = { id: 'id-dc-1', name: 'x', url: 'http://a', method: 'GET' }
        let pSave = saveApi('u1', row)
        await expectReject(() => saveApi('u1', row), 'saveInProgress')
        //不同操作（刪除）不受儲存之占位影響；刪除處理中再刪除亦拒絕（刪除之占位衝突 key 為 deleteInProgress）
        let pDel = deleteApi('u1', 'id-dc-2')
        await expectReject(() => deleteApi('u1', 'id-dc-2'), 'deleteInProgress')
        dSave.resolve()
        dDel.resolve()
        assert.strictEqual(await pSave, 'ok')
        assert.strictEqual(await pDel, 'ok')
        assert.deepStrictEqual(calls.sort(), ['del', 'save'], `procOrm 各只 1 次（實得 ${JSON.stringify(calls)}）`)
    })

    it('雙擊防護: 不同 userId 並行 saveApi（同名新增）→ 皆成功、各插入 1 筆（不以名稱為唯一鍵）', async function() {
        let d = deferred()
        let ids = []
        let procOrm = async (userId, table, method, arg) => {
            ids.push(arg[0].id)
            await d.p
            return 'ok'
        }
        let { saveApi } = procApis({ procOrm, ds, lockSave })
        let row = { name: 'dc-same-name', url: 'http://a', method: 'GET' }
        let ps = [saveApi('u1', row), saveApi('u2', row)]
        d.resolve()
        let rs = await Promise.all(ps)
        assert.deepStrictEqual(rs, ['ok', 'ok'])
        assert.strictEqual(ids.length, 2, '兩位使用者各插入 1 筆')
        assert.notStrictEqual(ids[0], ids[1], '新增列各自配 id')
    })

    it('雙擊防護: 不同 userId 並行 deleteApi 同一列 → 皆執行（不被占位拒絕），kmx 序列化不重疊', async function() {
        let d = deferred()
        let active = 0
        let maxActive = 0
        let calls = []
        let procOrm = async (userId, table, method, arg) => {
            active += 1
            maxActive = Math.max(maxActive, active)
            calls.push([userId, method, arg.id])
            await d.p
            active -= 1
            return 'ok'
        }
        let { deleteApi } = procApis({ procOrm, lockSave })
        let ps = [deleteApi('u1', 'id-dc-4'), deleteApi('u2', 'id-dc-4')]
        d.resolve()
        assert.deepStrictEqual(await Promise.all(ps), ['ok', 'ok'])
        assert.deepStrictEqual(calls, [['u1', 'del', 'id-dc-4'], ['u2', 'del', 'id-dc-4']], '兩位使用者各執行 1 次（依序）')
        assert.strictEqual(maxActive, 1, '同一列之刪除以 kmx 序列化')
    })

    it('雙擊防護: procOrm 失敗時原樣 reject 並釋放占位（同一使用者可再送出；存／刪皆同）', async function() {
        let n = 0
        let procOrm = async (userId, table, method) => {
            n += 1
            if (n === 1 || n === 3) {
                return Promise.reject(method === 'save' ? '儲存資料失敗' : '刪除資料失敗') //mapOrm 之失敗字串
            }
            return 'ok'
        }
        let { saveApi, deleteApi } = procApis({ procOrm, ds, lockSave })
        let row = { id: 'id-dc-3', name: 'x', url: 'http://a', method: 'GET' }
        await expectReject(() => saveApi('u1', row), '儲存資料失敗')
        assert.strictEqual(await saveApi('u1', row), 'ok', '儲存失敗結束後占位已釋放')
        await expectReject(() => deleteApi('u1', 'id-dc-3'), '刪除資料失敗')
        assert.strictEqual(await deleteApi('u1', 'id-dc-3'), 'ok', '刪除失敗結束後占位已釋放')
    })

    it('雙擊防護: 未注入 lockSave → saveApi／deleteApi reject 且不呼叫 procOrm（fail-closed，不以無占位模式執行）', async function() {
        let calls = 0
        let procOrm = async () => {
            calls += 1
            return 'ok'
        }
        let { saveApi, deleteApi } = procApis({ procOrm, ds })
        for (let fn of [() => saveApi('u1', { name: 'x', url: 'http://a', method: 'GET' }), () => deleteApi('u1', 'id-x')]) {
            let rejected = false
            await fn().catch(() => {
                rejected = true
            })
            assert.ok(rejected, '未注入 lockSave 應 reject')
        }
        assert.strictEqual(calls, 0, '不得呼叫 procOrm')
    })

})
