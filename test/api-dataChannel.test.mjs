//api-dataChannel：資料通道之表操作授權（CLAUDE_rulebook.md R-DC-1；ADR-038）——真後端（srv.mjs，11005）直打 w-converhp /api/main，驗端到端不變式。
//w-serv-webdata 1.1.7 起 useDbOrm=true 必給 authorizeExec（未給即建構拋錯，後端起不來）；本套件只綁同步所需之 apis.select，
//寫入一律經 kpFunExt 之 saveApi／deleteApi（驗證、funNew、lockSave、kmx，ADR-034）。原綁之 apis.insert／save／del 使直打者可繞過上述防護。
//操作者 'sys'（srv.mjs 開發捷徑，NODE_ENV!=='production'）。跑法：npx mocha test/api-dataChannel.test.mjs --timeout 180000（須在測試鎖下）
import assert from 'assert'
import { startServersOnce, baseUrl, resetToBaseSeed, woItems } from './tools/e2e-setup.mjs'
import { callFun } from './tools/apiMain.mjs'


let TOKEN = 'sys'


describe('api-dataChannel（資料通道只開放 select：R-DC-1）', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(180000)
        await startServersOnce() //build dist + 起後端（與 api-http／e2e 共用，只起一次）
        await resetToBaseSeed()
    })

    after(async function() {
        this.timeout(60000)
        await resetToBaseSeed()
    })

    it('[sys:getFuncList] 含 apis.select 與 kpFunExt（saveApi／deleteApi／proxyRequest／getWebInfor／getStaEvent／getApisList），不含 apis.insert／save／del', async function() {
        let r = await callFun(baseUrl, TOKEN, '[sys:getFuncList]', [])
        assert.strictEqual(r.ok, true, `應 success（實得 ${JSON.stringify(r.data).slice(0, 300)}）`)
        for (let f of ['apis.select', 'saveApi', 'deleteApi', 'proxyRequest', 'getWebInfor', 'getStaEvent', 'getApisList']) {
            assert.ok(r.msg.includes(f), `函數清單應含 ${f}（實得 ${JSON.stringify(r.msg)}）`)
        }
        for (let f of ['apis.insert', 'apis.save', 'apis.del']) {
            assert.ok(!r.msg.includes(f), `函數清單不得含 ${f}`)
        }
    })

    it('apis.select（同步之呼叫形狀：不帶參數）→ success，筆數等於資料庫筆數', async function() {
        let n = (await woItems.apis.select({})).length
        assert.ok(n > 0, 'base seed 應有資料')
        let r = await callFun(baseUrl, TOKEN, 'apis.select', [])
        assert.strictEqual(r.ok, true, `應 success（實得 ${JSON.stringify(r.data).slice(0, 300)}）`)
        assert.strictEqual(r.msg.length, n)
    })

    it('直打 apis.save／apis.insert／apis.del → error（invalid func），資料庫不變', async function() {
        let rs0 = await woItems.apis.select({})
        let row = rs0[0]
        let cases = [
            ['apis.save', [[{ ...row, description: 'api-dataChannel-save' }]]],
            ['apis.insert', [[{ name: 'api-dataChannel-insert', url: 'http://x/insert', group: 'api-dataChannel' }]]],
            ['apis.del', [{ id: row.id }]],
        ]
        for (let [func, args] of cases) {
            let r = await callFun(baseUrl, TOKEN, func, args)
            assert.strictEqual(r.state, 'error', `${func} 應 error（實得 ${JSON.stringify(r.data).slice(0, 300)}）`)
            assert.strictEqual(r.msg, `invalid func[${func}]`)
        }
        let rs1 = await woItems.apis.select({})
        assert.strictEqual(rs1.length, rs0.length, '筆數不變')
        assert.strictEqual(rs1.find((v) => v.id === row.id).description, row.description, '既有列未被改寫')
        assert.strictEqual(rs1.filter((v) => v.group === 'api-dataChannel').length, 0, '未新增列')
    })

})
