//unit-dataChannel：資料通道之選項（server/getOptDataChannel.mjs；CLAUDE_rulebook.md R-DC-1、R-ERR-1；ADR-038）。
//以實際選項建構 w-serv-webdata 伺服端（事件物件用 wsemi evem，不連線、不開埠），以 execute 事件模擬前端呼叫（w-converhp 之契約：func、input、pm）。
//R-DC-1：w-serv-webdata 1.1.7 起 useDbOrm=true 必給 authorizeExec；表操作只綁 select（同步所需），寫入只經 kpFunExt；
//  authorizeExec 只放行 userId 非空字串之 select，其餘記 srLog 後 reject 'errUserNoPermission'。
//R-ERR-1：表操作 select 失敗 → 'getDataError'，procOrm 原文入 srLog。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import keys from 'lodash-es/keys.js'
import evem from 'wsemi/src/evem.mjs'
import WServWebdataServer from 'w-serv-webdata/src/WServWebdataServer.mjs'
import getOptDataChannel from '../server/getOptDataChannel.mjs'
import ds from '../src/schema/index.mjs'


let FD = path.resolve('./test/_tmp/unit-dataChannel')

//execute：模擬前端經 w-converhp 呼叫（回 w-serv-webdata 經 pm.resolve 之 { state, msg }）
function exec(srv, func, args, token) {
    return new Promise((resolve) => {
        let pm = { resolve: (v) => resolve(v), reject: (v) => resolve({ state: 'reject', msg: v }) }
        srv.emit('execute', func, { __sysInputArgs__: args, __sysToken__: token }, pm)
    })
}


describe('unit-dataChannel（資料通道之選項：R-DC-1 只開放 select 並授權、R-ERR-1 select 失敗回 getDataError）', function() {

    let srv = null
    let logs = []
    let calls = []
    let selectFail = false
    let srLog = { error: (o) => logs.push(o), info: () => {}, warn: () => {} }
    let rows = [{ id: 'x1' }, { id: 'x2' }]
    let procOrm = async (userId, tableName, methodName, input) => {
        calls.push({ userId, tableName, methodName, input })
        if (selectFail) {
            return Promise.reject('failed to select data')
        }
        return rows
    }
    let woItems = {}
    for (let k of keys(ds)) {
        woItems[k] = new EventEmitter() //同步需可監聽 change
    }
    let opt = null

    before(function() {
        fs.rmSync(FD, { recursive: true, force: true })
        fs.mkdirSync(FD, { recursive: true })
        opt = getOptDataChannel({ ds, woItems, procOrm, srLog })
        srv = new WServWebdataServer(evem(), {
            ...opt,
            getUserIdByToken: async (token) => (token === 'tok-u1' ? 'u1' : Promise.reject('errUserIdMissing')),
            kpFunExt: { saveApi: async (userId, row) => `saved-by-${userId}` },
            fpTableTags: path.join(FD, 'tableTags.json'),
        })
    })

    after(function() {
        if (srv) {
            srv.clearBroadcast()
            srv.clearSync()
        }
        fs.rmSync(FD, { recursive: true, force: true })
        let fdTmp = path.resolve('./test/_tmp')
        if (fs.existsSync(fdTmp) && fs.readdirSync(fdTmp).length === 0) {
            fs.rmSync(fdTmp, { recursive: true, force: true })
        }
    })

    beforeEach(function() {
        logs = []
        calls = []
        selectFail = false
    })

    it('選項：useDbOrm true、methodsExec 只有 select、同步全部資料表、kpOrm 為 woItems、authorizeExec 與 operOrm 為函數（w-serv-webdata 1.1.12 建構成功）', function() {
        assert.strictEqual(opt.useDbOrm, true)
        assert.deepStrictEqual(opt.methodsExec, ['select'])
        assert.deepStrictEqual(opt.tableNamesExec, keys(ds))
        assert.deepStrictEqual(opt.tableNamesSync, keys(ds))
        assert.strictEqual(opt.kpOrm, woItems)
        assert.strictEqual(typeof opt.authorizeExec, 'function')
        assert.strictEqual(typeof opt.operOrm, 'function')
        assert.ok(srv, '以實際選項建構 w-serv-webdata 伺服端應成功')
    })

    it('[sys:getFuncList]：含 apis.select 與 kpFunExt，不含 apis.insert／save／del', async function() {
        let r = await exec(srv, '[sys:getFuncList]', [], 'tok-u1')
        assert.strictEqual(r.state, 'success')
        assert.ok(r.msg.includes('apis.select') && r.msg.includes('saveApi'), `清單應含 apis.select 與 saveApi（實得 ${JSON.stringify(r.msg)}）`)
        for (let m of ['apis.insert', 'apis.save', 'apis.del']) {
            assert.ok(!r.msg.includes(m), `清單不得含 ${m}`)
        }
    })

    it('apis.select（同步之呼叫形狀：不帶參數）→ 放行並以 userId 呼叫 procOrm', async function() {
        let r = await exec(srv, 'apis.select', [], 'tok-u1')
        assert.deepStrictEqual(r, { state: 'success', msg: rows })
        assert.deepStrictEqual(calls, [{ userId: 'u1', tableName: 'apis', methodName: 'select', input: undefined }])
    })

    it('apis.save／insert／del → invalid func（未綁定），不呼叫 procOrm', async function() {
        for (let m of ['save', 'insert', 'del']) {
            let r = await exec(srv, `apis.${m}`, [[{ id: 'p1', name: 'n', url: 'u' }]], 'tok-u1')
            assert.deepStrictEqual(r, { state: 'error', msg: `invalid func[apis.${m}]` })
        }
        assert.deepStrictEqual(calls, [])
    })

    it('authorizeExec：userId 空字串或方法非 select → reject errUserNoPermission 並記 srLog；userId 非空之 select → true', async function() {
        let ae = opt.authorizeExec
        await assert.rejects(ae({ userId: '', tableName: 'apis', methodName: 'select' }), (e) => e === 'errUserNoPermission')
        await assert.rejects(ae({ userId: 'u1', tableName: 'apis', methodName: 'save' }), (e) => e === 'errUserNoPermission')
        assert.deepStrictEqual(logs, [
            { event: 'authorizeExec', err: 'errUserNoPermission', tableName: 'apis', methodName: 'select' },
            { event: 'authorizeExec', err: 'errUserNoPermission', tableName: 'apis', methodName: 'save' },
        ])
        assert.strictEqual(await ae({ userId: 'u1', tableName: 'apis', methodName: 'select' }), true)
    })

    it('R-ERR-1：procOrm 之 select 失敗 → 回 getDataError（不外露英文原文），原文入 srLog', async function() {
        selectFail = true
        let r = await exec(srv, 'apis.select', [], 'tok-u1')
        assert.deepStrictEqual(r, { state: 'error', msg: 'getDataError' })
        assert.deepStrictEqual(logs, [{ event: 'dataChannel', err: 'getDataError', orm: 'failed to select data', tableName: 'apis', methodName: 'select' }])
    })

    it('kpFunExt 不經 authorizeExec；查無使用者之 token 由 getUserIdByToken 拒絕（fail-closed）', async function() {
        assert.deepStrictEqual(await exec(srv, 'saveApi', [{ name: 'n' }], 'tok-u1'), { state: 'success', msg: 'saved-by-u1' })
        assert.deepStrictEqual(await exec(srv, 'apis.select', [], 'tok-bad'), { state: 'error', msg: 'errUserIdMissing' })
        assert.deepStrictEqual(calls, [], '查無使用者時不得呼叫 procOrm')
    })

})
