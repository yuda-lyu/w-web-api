//unit-procApis：procApis 工廠之錯誤路徑（e2e 因前端同步短路不可達、原本完全未測）+ 正常路徑（mock procOrm）。
//對應 z待修清單 T18。純 unit（不需 server/browser），mocha 預設 glob 自動涵蓋。
import assert from 'assert'
import procApis from '../server/procApis.mjs'
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


describe('unit-procApis (錯誤路徑 + 正常路徑)', function() {

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
        let { saveApi } = procApis({ procOrm, ds })
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
        let { saveApi } = procApis({ procOrm, ds })
        await saveApi('u1', { id: 'fixed-id-1', name: 'x', url: 'http://a', method: 'GET' })
        assert.strictEqual(captured.id, 'fixed-id-1', '既有 id 應被保留')
    })

    it('deleteApi: 正常 id → 以 ("apis","del",{id}) 呼叫 procOrm', async function() {
        let calls = []
        let procOrm = async (...a) => { calls.push(a); return 'ok' }
        let { deleteApi } = procApis({ procOrm })
        let r = await deleteApi('u1', 'id-1')
        assert.strictEqual(r, 'ok')
        assert.deepStrictEqual(calls[0], ['u1', 'apis', 'del', { id: 'id-1' }])
    })

    //後端層雙擊 / 並發防護（CLAUDE.md 三層之第 3 層）：同 key 之寫入以 pmKeyMutex 序列化，procOrm 呼叫不得重疊；不同 key 可並行
    it('saveApi/deleteApi: 同 key 並發 → 序列化執行（procOrm 不重疊）；不同 key 不互相阻塞', async function() {
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
        let { saveApi, deleteApi } = procApis({ procOrm, ds })
        //同 id 並發 save ×2 + del ×1（del 為不同 key，可與 save 並行）
        let rs = await Promise.allSettled([
            saveApi('u1', { id: 'same-id', name: 'a', url: 'http://a', method: 'GET' }),
            saveApi('u1', { id: 'same-id', name: 'b', url: 'http://b', method: 'GET' }),
            deleteApi('u1', 'other-id'),
        ])
        assert.ok(rs.every((r) => r.status === 'fulfilled' && r.value === 'ok'), '三者皆成功（序列化非拒絕）')
        assert.strictEqual(order.filter((s) => s.startsWith('save:same-id')).length, 2)
        //同 key 兩次 save 不得重疊：允許的最大並行 = save 其一 + 不同 key 的 del
        assert.ok(maxActive <= 2, `同 key 應序列化，實測最大並行 ${maxActive}`)
        //新增筆（無 id）以 name 為 key：同名並發亦序列化
        active = 0; maxActive = 0
        await Promise.all([
            saveApi('u1', { name: 'dup', url: 'http://a', method: 'GET' }),
            saveApi('u1', { name: 'dup', url: 'http://b', method: 'GET' }),
        ])
        assert.strictEqual(maxActive, 1, '同名新增應序列化')
    })

})
