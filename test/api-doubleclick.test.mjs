//api-doubleclick：按鈕雙擊防護之後端占位（ADR-034；機制同 w-web-sso ADR-074）——真後端直打資料通道（w-converhp /api/main），驗端到端不變式。
//後端以「操作:使用者 id」於 cacheSt 原子占位（server/lockSave.mjs）：同一使用者之同一操作處理中再送出 → reject，不排隊
//（saveApi：'saveInProgress'；deleteApi：'deleteInProgress'；proxyRequest：'requestInProgress'）。
//兩次請求是否重疊取決於時序，故只斷言與時序無關之不變式（占位機制本身由 unit-lockSave／unit-procApis／unit-procProxy 以受控 deferred 驗）：
//- 至少 1 次成功；被拒者之 key 只能是該操作之占位 key；
//- 資料終態：被拒者不寫入、不送出（新增列筆數＝成功次數；echo 收到之請求數＝成功次數）；既有列只 1 筆且為送出值；刪除後不存在。
//操作者一律 'sys'（srv.mjs 開發捷徑，使用者 id-for-admin；NODE_ENV!=='production'）。srv.mjs 無第二個有效之測試使用者，
//「不同使用者並行皆成功」由 unit-procApis／unit-procProxy（PROXY-025）驗。
//echo 目標：本檔自起 127.0.0.1:11086（延遲 500ms 回應，使兩次請求多半重疊；斷言不依賴之）。後端 srv.mjs 未設 isAllowTarget，本機目標可達。
//跑法：npx mocha test/api-doubleclick.test.mjs --timeout 180000（startServersOnce 於 11005 空著時會 build dist 並起後端，同 api-http）
import assert from 'assert'
import http from 'http'
import get from 'lodash-es/get.js'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { startServersOnce, baseUrl, resetToBaseSeed, woItems } from './tools/e2e-setup.mjs'


let TOKEN = 'sys'
let PORT_ECHO = 11086
let DELAY_ECHO_MS = 500
let GROUP_DC02 = 'api-doubleclick-dc02' //DC-02 新增列之群組（計數用；after 以 resetToBaseSeed 清除）


//資料通道（w-converhp /api/main）：本體與回應皆為 obj2u8arr 編碼（同 api-tokenLeak.postMain）；
//kpFunExt 之結果經 w-serv-webdata pm2resolve 為 { state:'success'|'error', msg }（msg 於 error 時為後端 reject 之 key）
async function callFun(func, args) {
    let res = await fetch(`${baseUrl}/api/main`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(obj2u8arr({ func, input: { __sysInputArgs__: args, __sysToken__: TOKEN } })),
    })
    let data = u8arr2obj(new Uint8Array(await res.arrayBuffer()))
    let state = get(data, 'success.output.state', '')
    return { ok: state === 'success', state, msg: get(data, 'success.output.msg', null), data }
}


//至少 1 次成功、被拒者之 key 只能是 key；回傳成功次數
function assertOnlyLockRejects(vs, key) {
    let brief = JSON.stringify(vs.map((v) => (v.ok ? 'ok' : v.data)))
    let nOk = vs.filter((v) => v.ok).length
    assert.ok(nOk >= 1, `至少 1 次成功（實得 ${brief}）`)
    for (let v of vs.filter((v) => !v.ok)) {
        assert.strictEqual(v.msg, key, `被拒者之 key 應為 ${key}（實得 ${brief}）`)
    }
    return nOk
}


async function findSeedRow(name) {
    let rs = await woItems.apis.select({})
    let row = rs.find((r) => r.name === name)
    assert.ok(row, `base seed 應含「${name}」`)
    return row
}


describe('api-doubleclick（後端依使用者占位：同一使用者之同一操作處理中再送出即拒絕、不寫入不送出，ADR-034）', function() {
    this.timeout(180000)

    let srvEcho = null
    let nEcho = 0

    before(async function() {
        this.timeout(180000)
        await startServersOnce() //build dist + 起後端（與 api-http／e2e 共用，只起一次）
        srvEcho = await new Promise((resolve, reject) => {
            let s = http.createServer((req, res) => {
                req.resume()
                req.on('end', () => {
                    nEcho += 1
                    setTimeout(() => {
                        res.writeHead(200, { 'Content-Type': 'application/json' })
                        res.end('{"echo":true}')
                    }, DELAY_ECHO_MS)
                })
            })
            s.on('error', reject)
            s.listen(PORT_ECHO, '127.0.0.1', () => resolve(s))
        })
    })

    after(async function() {
        this.timeout(60000)
        if (srvEcho) {
            await new Promise((resolve) => srvEcho.close(() => resolve()))
        }
        await resetToBaseSeed() //清掉本檔寫入之列、還原 base seed
    })

    beforeEach(async function() {
        await resetToBaseSeed()
        nEcho = 0
    })


    it('DC-01 並行 2 次同一使用者之 saveApi（既有列）→ 至少 1 成功、被拒者只能是 saveInProgress；該列只 1 筆且為送出值、總筆數不變', async function() {
        let n0 = (await woItems.apis.select({})).length
        let row = await findSeedRow('取得寵物清單')
        let payload = { ...row, description: 'api-doubleclick-dc01' }

        let vs = await Promise.all([callFun('saveApi', [payload]), callFun('saveApi', [payload])])
        assertOnlyLockRejects(vs, 'saveInProgress')

        let rs = await woItems.apis.select({ id: row.id })
        assert.strictEqual(rs.length, 1, `該列應只 1 筆（實得 ${rs.length}）`)
        assert.strictEqual(rs[0].description, 'api-doubleclick-dc01', '該列應為送出值')
        assert.strictEqual((await woItems.apis.select({})).length, n0, '既有列為更新，總筆數不變')
    })

    it('DC-02 並行 2 次同一使用者之 saveApi（新增列，無 id）→ 至少 1 成功、被拒者只能是 saveInProgress；新增列筆數＝成功次數（被拒者不寫入）', async function() {
        let payload = { name: 'dc02-new', url: 'http://dc02/new', method: 'get', group: GROUP_DC02, levels: 'API' }

        let vs = await Promise.all([callFun('saveApi', [payload]), callFun('saveApi', [payload])])
        let nOk = assertOnlyLockRejects(vs, 'saveInProgress')

        //不以名稱為唯一鍵（ADR-034 不訂）：兩次未重疊時兩次皆成功、各插入 1 列，故不變式為「列數＝成功次數」而非「恆為 1」
        let rs = (await woItems.apis.select({})).filter((r) => r.group === GROUP_DC02)
        assert.strictEqual(rs.length, nOk, `新增列筆數應等於成功次數 ${nOk}（實得 ${rs.length}）`)
    })

    it('DC-03 並行 2 次同一使用者之 deleteApi 同一列 → 至少 1 成功、被拒者只能是 deleteInProgress；該列已不存在', async function() {
        let n0 = (await woItems.apis.select({})).length
        let row = await findSeedRow('刪除狗狗資訊')

        let vs = await Promise.all([callFun('deleteApi', [row.id]), callFun('deleteApi', [row.id])])
        assertOnlyLockRejects(vs, 'deleteInProgress')

        assert.strictEqual((await woItems.apis.select({ id: row.id })).length, 0, '該列應已刪除')
        assert.strictEqual((await woItems.apis.select({})).length, n0 - 1, '只少該列')
    })

    it('DC-04 並行 2 次同一使用者之 proxyRequest → 至少 1 成功、被拒者只能是 requestInProgress；目標收到之請求數＝成功次數（被拒者不送出）', async function() {
        let spec = { method: 'POST', url: `http://127.0.0.1:${PORT_ECHO}/dc04`, headers: [['Content-Type', 'application/json']], query: [], body: '{"n":1}', timeout: 30000 }

        let vs = await Promise.all([callFun('proxyRequest', [spec]), callFun('proxyRequest', [spec])])
        let nOk = assertOnlyLockRejects(vs, 'requestInProgress')

        assert.strictEqual(nEcho, nOk, `目標收到之請求數應等於成功次數 ${nOk}（實得 ${nEcho}）`)
        for (let v of vs.filter((v) => v.ok)) {
            assert.strictEqual(get(v, 'msg.status'), 200, '成功者為目標之回應')
        }
    })

    it('DC-05 依序 2 次同一使用者之 saveApi（既有列）與 proxyRequest → 皆成功（占位於完成後釋放，合法之連續操作不受影響）', async function() {
        let row = await findSeedRow('取得狗狗清單')
        for (let i = 1; i <= 2; i++) {
            let v = await callFun('saveApi', [{ ...row, description: `api-doubleclick-dc05-${i}` }])
            assert.strictEqual(v.ok, true, `第 ${i} 次 saveApi 應成功（實得 ${JSON.stringify(v.data)}）`)
        }
        assert.strictEqual((await woItems.apis.select({ id: row.id }))[0].description, 'api-doubleclick-dc05-2')

        let spec = { method: 'GET', url: `http://127.0.0.1:${PORT_ECHO}/dc05`, headers: [], query: [], timeout: 30000 }
        for (let i = 1; i <= 2; i++) {
            let v = await callFun('proxyRequest', [spec])
            assert.strictEqual(v.ok, true, `第 ${i} 次 proxyRequest 應成功（實得 ${JSON.stringify(v.data)}）`)
        }
        assert.strictEqual(nEcho, 2)
    })

})
