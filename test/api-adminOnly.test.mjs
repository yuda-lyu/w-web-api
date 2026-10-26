//api-adminOnly：API 管理後台與資料通道只限系統管理者，由套件自行強制（R-ADMINONLY-01，ADR-051；
//使用者 2026-10-24 裁示：「不管部署方會怎麼安排，套件這邊得自己有一套做法」；跨套件原則 C:\opensrcOper\dspec\使用者身分驗證原則.md 二.4：函數層級須另檢查角色，不得只靠部署方之授權設定）。
//定義：api 無自有使用者表；系統管理者＝token 經部署方 getUserByToken 所回使用者之 isAdmin 為 'y'（WWebApi.mjs 之 checkUser 已限值域 'y'／'n'）；其餘為一般使用者。
//真後端（隔離子行程：獨立 lmdb、埠 8566；部署方 getUserByToken／verifyClientUser 由 test/tools/apiServerChild.mjs 提供並記錄 { userId, from }；不碰專案 ./db 與 11005），經真實資料通道與 hapi 路由直打。
//一般使用者情境（皆讓部署方鉤子放行或改寫，使「被拒」只能出自套件自己的角色檢查）：
//- tokNonAdmin：isAdmin 'n'、鉤子回 true；tokMutateAdmin：isAdmin 'n'、鉤子把傳入物件改寫為 isAdmin 'y' 再回 true（套件須以 getUserByToken 所回之原值判斷，不受鉤子改寫影響）；tokNonAdminDenied：isAdmin 'n'、鉤子回 false（部署方可再收緊）
//斷言（對應使用者裁示與提示詞〈完成條件〉1）：
//- 後台登入檢查 GET /api/getUserByToken：一般使用者 → 固定鍵 errUserNotAdmin（不含 token 與使用者資料），系統管理者 → 照常；鉤子先於角色檢查被呼叫，部署方拒絕者仍回 errUserNoPermission
//- 資料通道（w-converhp 六條路由；main 之全部 kpFunExt、表 select、非開放之表寫入、三個系統函數）：一般使用者 → permission denied、ORM 零操作、庫內不變、回應與 srLog 不含第三方憑證
//- 執行身分（請求本體 __sysToken__，getUserIdByToken）：標頭為系統管理者、本體為一般使用者 → 函數不執行、固定鍵 errUserIdMissing、零寫入；標頭為一般使用者、本體為系統管理者 → 連線閘即拒
//- 系統管理者（sys、tokA、tokB）一律照常：後台登入、全部函數、整列（含憑證）、寫入；部署方鉤子仍照常套用（可再收緊，只能收緊）
import assert from 'assert'
import http from 'http'
import get from 'lodash-es/get.js'
import { startApiServer, mkLegacyRow, waitLogs } from './tools/apiHarness.mjs'
import { callFun, postMain } from './tools/apiMain.mjs'


let PORT = 8566
let PORT_LOG = 8567 //srLog 案專用之子行程（log 只含該案自己的請求）
let PORT_ECHO = 8568 //proxyRequest 之代發目標（計命中數，證明一般使用者之 proxyRequest 未執行）
let S = null
let echo = null
let nEcho = 0

//第三方憑證與本系統擁有／伺服器專有欄位之哨兵值（任何一般使用者可見之回應與 log 不得出現其中任一個；系統管理者之整列才含）
let SECRET = {
    tokens: 'SECRET-TOKENS-ADMINONLY',
    authConfigJson: 'SECRET-AUTHCFG-ADMINONLY',
    defaultHeadersJson: 'SECRET-DEFHDR-ADMINONLY',
    testBaseUrl: 'http://SECRET-TESTBASE-ADMINONLY.example',
}
let SECRET_VALUES = Object.values(SECRET)

//w-converhp 六條路由與其 apiType（verifyConn 所見之入口名）
let ROUTES = [
    { path: '/api/main', method: 'POST', apiType: 'main' },
    { path: '/api/ulctr', method: 'POST', apiType: 'upload-controller' },
    { path: '/api/slc', method: 'POST', apiType: 'upload-slice' },
    { path: '/api/dwgfn', method: 'POST', apiType: 'download-get-filename' },
    { path: '/api/dwgf', method: 'GET', apiType: 'download-get-file' },
    { path: '/api/dw', method: 'POST', apiType: 'download' },
]

//傳輸層拒絕（verifyConn 未放行 → w-converhp 回 { error: 'permission denied' }，不進資料通道）
let isDenied = (r) => r.ok === false && r.data && r.data.error === 'permission denied'

//一般使用者情境（鉤子放行或改寫，故「被拒」只能出自套件自己的角色檢查）
let NONADMIN = [
    ['tokNonAdmin', 'id-nonadmin'],
    ['tokMutateAdmin', 'id-mutateadmin'],
]

let seedRows = () => [
    mkLegacyRow('ao-1', 'adminonly', { name: 'ao-1', tokens: SECRET.tokens, authConfigJson: SECRET.authConfigJson, defaultHeadersJson: SECRET.defaultHeadersJson, testBaseUrl: SECRET.testBaseUrl }),
    mkLegacyRow('ao-2', 'adminonly', { name: 'ao-2', tokens: SECRET.tokens, authConfigJson: SECRET.authConfigJson }),
]

//資料通道之函數全集（kpFunExt 6、表操作 select、未開放之表寫入 3、系統函數 3）：一般使用者呼叫時每條都不得執行
let mkFuncs = () => [
    { name: '[sys:getFuncList]（系統函數）', func: '[sys:getFuncList]', args: [] },
    { name: '[sys:getTableTags]（系統函數）', func: '[sys:getTableTags]', args: [] },
    { name: '[sys:polling]（系統函數）', func: '[sys:polling]', args: [] },
    { name: 'getWebInfor', func: 'getWebInfor', args: [] },
    { name: 'getApisList', func: 'getApisList', args: [] },
    { name: 'saveApi（新增）', func: 'saveApi', args: [{ name: 'ao-write', url: 'http://t/ao-write', method: 'get', levels: 'T', group: 'adminonly' }] },
    { name: 'saveApi（修改既有列）', func: 'saveApi', args: [{ id: 'ao-1', name: 'ao-hacked', url: 'http://t/ao-hacked', method: 'get', levels: 'T', group: 'adminonly' }] },
    { name: 'deleteApi', func: 'deleteApi', args: ['ao-2'] },
    { name: 'proxyRequest', func: 'proxyRequest', args: [{ method: 'GET', url: `http://127.0.0.1:${PORT_ECHO}/adminonly`, headers: [], query: [], timeout: 30000 }] },
    { name: 'getStaEvent', func: 'getStaEvent', args: [7, 'hr'] },
    { name: 'apis.select（表操作）', func: 'apis.select', args: [] },
    { name: 'apis.save（未開放之表寫入）', func: 'apis.save', args: [[{ id: 'ao-1', name: 'x' }]] },
    { name: 'apis.insert（未開放之表寫入）', func: 'apis.insert', args: [[{ name: 'x', url: 'http://x', group: 'adminonly' }]] },
    { name: 'apis.del（未開放之表寫入）', func: 'apis.del', args: [{ id: 'ao-1' }] },
]

//post：標頭 token 與本體 token 分別指定；回 { state, msg, raw, data }
async function post(headerTok, bodyTok, func, args = []) {
    let r = await postMain(S.base, headerTok, { func, input: { __sysInputArgs__: args, __sysToken__: bodyTok } })
    return { state: get(r.data, 'success.output.state', ''), msg: get(r.data, 'success.output.msg', null), raw: r.raw, data: r.data }
}

//rawRoute：直打 w-converhp 路由（空本體），回 { status, msg }
async function rawRoute(route, token, base = S.base) {
    let url = `${base}${route.path}`
    let headers = { 'Content-Type': 'application/octet-stream' }
    if (route.method === 'GET') { ///dwgf 之 token 走 query（瀏覽器導覽下載）
        url += `?token=${encodeURIComponent(token)}`
    }
    else {
        headers['Authorization'] = `Bearer ${token}`
    }
    let res = await fetch(url, { method: route.method, headers, body: route.method === 'GET' ? undefined : Buffer.from('x') })
    await res.arrayBuffer()
    return { status: res.status, msg: res.headers.get('return-msg') }
}

let loginCheck = async (token, base = S.base) => {
    let res = await fetch(`${base}/api/getUserByToken?token=${encodeURIComponent(token)}`)
    let text = await res.text()
    return { raw: text, ...JSON.parse(text) }
}

//snapshot：以系統管理者讀取整表（依 id 排序之 JSON），供「庫內不變」比對
let snapshot = async () => JSON.stringify((await S.list('sys')).sort((a, b) => (a.id < b.id ? -1 : 1)))


describe('api-adminOnly (API 管理後台與資料通道只限系統管理者：套件自行強制，R-ADMINONLY-01)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        echo = http.createServer((req, res) => {
            nEcho++
            req.resume()
            res.setHeader('Content-Type', 'text/plain')
            res.end('echo')
        })
        await new Promise((resolve, reject) => {
            echo.once('error', reject)
            echo.listen(PORT_ECHO, '127.0.0.1', resolve)
        })
        //代發目標為本機 echo：放行 127.0.0.1（內建位址政策預設拒絕本機，P1），使「一般使用者之 proxyRequest 零命中」確由角色檢查而非位址政策決定
        S = await startApiServer({ name: 'api-adminOnly', port: PORT, opt: { proxyAllowList: ['127.0.0.1'] } })
    })

    after(async function() {
        this.timeout(30000)
        if (S) {
            await S.stop()
        }
        if (echo) {
            await new Promise((resolve) => echo.close(() => resolve()))
        }
    })

    beforeEach(async function() {
        this.timeout(30000)
        await S.wipe('apis')
        await S.seed(seedRows())
        nEcho = 0
        await S.getOps(true)
        await S.getVerifyCalls(true)
    })


    //--------------------------------------------------------------------------
    describe('後台登入檢查 GET /api/getUserByToken：只限系統管理者', function() {

        for (let [tok, id] of NONADMIN) {
            it(`${tok}（一般使用者，鉤子放行或改寫）→ state=error、msg 固定鍵 errUserNotAdmin；回應不含 token 與使用者資料；鉤子先被呼叫一次（from=getUserByToken）`, async function() {
                let r = await loginCheck(tok)
                assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errUserNotAdmin' })
                assert.ok(!r.raw.includes(tok) && !r.raw.includes(id) && !r.raw.includes('@example.com'), `回應不得含 token／使用者資料（實得 ${r.raw}）`)
                assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: id, from: 'getUserByToken' }], '鉤子在角色檢查之前被呼叫（部署方只能再收緊）')
            })
        }

        for (let tok of ['sys', 'tokA', 'tokB']) {
            it(`${tok}（系統管理者）→ success，回使用者物件（isAdmin y）`, async function() {
                let r = await loginCheck(tok)
                assert.strictEqual(r.state, 'success')
                assert.strictEqual(get(r, 'msg.isAdmin'), 'y')
            })
        }

        it('外審 sol R2：query token 重複（?token=sys&token=sys，解析為陣列）→ errTokenNoPermission，不借用其中任一值；鉤子零呼叫', async function() {
            let r = await (await fetch(`${S.base}/api/getUserByToken?token=sys&token=sys`)).json()
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errTokenNoPermission' })
            assert.deepStrictEqual(await S.getVerifyCalls(), [])
        })

        it('外審 sol R2：只有 Authorization 標頭、無 query token → 登入檢查 errTokenNoPermission（hapi 路由只認 query，不從標頭補）', async function() {
            let r = await (await fetch(`${S.base}/api/getUserByToken`, { headers: { Authorization: 'Bearer sys' } })).json()
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errTokenNoPermission' })
            assert.deepStrictEqual(await S.getVerifyCalls(), [])
        })

        it('部署方鉤子先於角色檢查：一般使用者且鉤子拒絕（tokNonAdminDenied）→ errUserNoPermission（不是 errUserNotAdmin）；系統管理者但鉤子拒絕（tokDenied）→ errUserNoPermission', async function() {
            assert.strictEqual((await loginCheck('tokNonAdminDenied')).msg, 'errUserNoPermission')
            assert.strictEqual((await loginCheck('tokDenied')).msg, 'errUserNoPermission')
        })

        it('認證先於授權、授權先於角色：查無 token → errUserNotFound、無 token → errTokenNoPermission、欄位不齊 → 認證錯誤鍵；皆不呼叫鉤子', async function() {
            assert.strictEqual((await loginCheck('tok-not-exist-adminonly')).msg, 'errUserNotFound')
            let r = await (await fetch(`${S.base}/api/getUserByToken`)).json()
            assert.strictEqual(r.msg, 'errTokenNoPermission')
            assert.strictEqual((await loginCheck('tokNoEmail')).msg, 'errUserEmailMissing')
            assert.deepStrictEqual(await S.getVerifyCalls(), [])
        })

    })


    //--------------------------------------------------------------------------
    describe('資料通道連線閘：一般使用者（鉤子放行或改寫）呼叫任何函數皆被拒、零資料外洩、零寫入', function() {

        for (let [tok, id] of NONADMIN) {
            for (let f of mkFuncs()) {
                it(`${tok}：${f.name} → permission denied，函數未執行（ORM 零操作），回應不含任何憑證`, async function() {
                    let before = await snapshot()
                    await S.getOps(true)
                    await S.getVerifyCalls(true)
                    let r = await callFun(S.base, tok, f.func, f.args)
                    assert.ok(isDenied(r), `應被拒（實得 ${JSON.stringify(r.data).slice(0, 200)}）`)
                    assert.deepStrictEqual(await S.getOps(), [], 'ORM 應零操作（零讀取、零寫入）')
                    assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: id, from: 'main' }], '鉤子在角色檢查之前被呼叫一次（被拒於連線閘，未進執行身分）')
                    assert.strictEqual(nEcho, 0, '代發目標零命中')
                    for (let s of SECRET_VALUES) {
                        assert.ok(!JSON.stringify(r.data).includes(s), `回應不得含憑證「${s}」`)
                    }
                    assert.strictEqual(await snapshot(), before, '庫內不變')
                })
            }
        }

        it('一般使用者連續嘗試全部函數後：庫內不變（含 ao-1 未被改、ao-2 未被刪、無 ao-write）、代發目標零命中', async function() {
            let before = await snapshot()
            for (let [tok] of NONADMIN) {
                for (let f of mkFuncs()) {
                    await callFun(S.base, tok, f.func, f.args)
                }
            }
            assert.strictEqual(nEcho, 0)
            let rows = await S.list('sys')
            assert.deepStrictEqual(rows.map((x) => x.name).sort(), ['ao-1', 'ao-2'])
            assert.strictEqual(await snapshot(), before)
        })

        it('系統管理者（對照組）：sys、tokA 呼叫同一批函數照常成功——getApisList 回整列（含憑證，後台編輯所需）、saveApi 可新增與修改既有列、deleteApi 可刪、proxyRequest 命中一次', async function() {
            for (let tok of ['sys', 'tokA']) {
                let r1 = await callFun(S.base, tok, 'getApisList', [])
                assert.strictEqual(r1.state, 'success')
                let ao1 = r1.msg.find((x) => x.id === 'ao-1')
                assert.strictEqual(ao1.tokens, SECRET.tokens, `${tok} 為系統管理者，整列含 tokens`)
                assert.strictEqual(ao1.authConfigJson, SECRET.authConfigJson)
            }
            //修改既有列（外審 sol R7）：以庫內整列為底改 name 與 tokens，送回 saveApi（有 id → 修改分支）
            let cur = (await callFun(S.base, 'tokA', 'getApisList', [])).msg.find((x) => x.id === 'ao-1')
            let r2m = await callFun(S.base, 'tokB', 'saveApi', [{ ...cur, name: 'ao-1-renamed', tokens: 'SECRET-TOKENS-ADMINONLY-2' }])
            assert.strictEqual(r2m.state, 'success', JSON.stringify(r2m.msg))
            let after = (await callFun(S.base, 'tokA', 'getApisList', [])).msg.find((x) => x.id === 'ao-1')
            assert.strictEqual(after.name, 'ao-1-renamed', '系統管理者之修改（有 id）生效')
            assert.strictEqual(after.tokens, 'SECRET-TOKENS-ADMINONLY-2')
            let r2 = await callFun(S.base, 'tokA', 'saveApi', [{ name: 'ao-write', url: 'http://t/ao-write', method: 'get', levels: 'T', group: 'adminonly' }])
            assert.strictEqual(r2.state, 'success', JSON.stringify(r2.msg))
            let r3 = await callFun(S.base, 'tokB', 'deleteApi', ['ao-2'])
            assert.strictEqual(r3.state, 'success', JSON.stringify(r3.msg))
            let r4 = await callFun(S.base, 'sys', 'proxyRequest', [{ method: 'GET', url: `http://127.0.0.1:${PORT_ECHO}/adminonly`, headers: [], query: [], timeout: 30000 }])
            assert.strictEqual(r4.state, 'success', JSON.stringify(r4.msg))
            assert.strictEqual(nEcho, 1)
            let r5 = await callFun(S.base, 'sys', 'apis.select', [])
            assert.strictEqual(r5.state, 'success')
            for (let f of ['[sys:getFuncList]', '[sys:getTableTags]', 'getWebInfor', 'getStaEvent']) {
                let r = await callFun(S.base, 'tokA', f, f === 'getStaEvent' ? [7, 'hr'] : [])
                assert.strictEqual(r.state, 'success', `${f} ${JSON.stringify(r.data).slice(0, 200)}`)
            }
        })

    })


    //--------------------------------------------------------------------------
    describe('w-converhp 六條路由（含上傳、下載之入口名）皆套用系統管理者檢查', function() {

        for (let rt of ROUTES) {
            for (let [tok, id] of NONADMIN) {
                it(`${rt.method} ${rt.path}：${tok}（一般使用者）→ permission denied，鉤子 from=${rt.apiType}`, async function() {
                    let r = await rawRoute(rt, tok)
                    assert.strictEqual(r.msg, 'permission denied', `實得 status=${r.status} msg=${r.msg}`)
                    assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: id, from: rt.apiType }])
                })
            }

            it(`${rt.method} ${rt.path}：sys（系統管理者，對照組）→ 通過連線閘（進入路由之參數檢核，回 invalid …）`, async function() {
                let r = await rawRoute(rt, 'sys')
                assert.notStrictEqual(r.msg, 'permission denied', `系統管理者不得被拒（實得 status=${r.status} msg=${r.msg}）`)
                assert.ok(/^invalid /.test(String(r.msg)), `應進入路由並回其參數錯誤（空本體），實得 msg=${r.msg}`)
            })
        }

    })


    //--------------------------------------------------------------------------
    //應用入口之等級（A-1，api-run01〔任務 20261024182736〕翻轉）：POST /syncAndReplaceTabs 原「照舊、不加角色檢查」（只看部署方 verifyAppUser，外審 sol R1），
    //自 1.1.18 起由套件自行要求系統管理者等級（反查之 isAdmin 'y'，與 assertAdmin 同一判準），且反查結果須經與瀏覽端相同之欄位檢查；部署方 verifyAppUser 照舊先被呼叫、只能再收緊。
    //下列前兩案由「放行」翻轉為「被拒」；完整的入口 × 呼叫者矩陣見 api-accessMatrix
    describe('POST /syncAndReplaceTabs（應用系統，verifyAppUser）：套件自行要求系統管理者等級（A-1）', function() {

        let batch = (key) => ({ group: 'adminonly-sync', rows: [{ srcKey: key, name: `sync-${key}`, url: `http://t/sync-${key}` }] })

        it('【翻轉】tokAppNonAdmin（isAdmin n，verifyAppUser 放行）→ 匯入被拒（errUserNotAdmin），庫內無此列（原：匯入成功）', async function() {
            let r = await S.sync('tokAppNonAdmin', batch('k-nonadmin'))
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errUserNotAdmin' }, JSON.stringify(r))
            assert.ok(!(await S.list('sys')).some((x) => x.name === 'sync-k-nonadmin'))
        })

        it('【翻轉】tokAppMinimal（虛擬應用使用者，只有 id 欄）→ 匯入被拒（反查結果須經與瀏覽端相同之欄位檢查：缺 email → errUserEmailMissing），庫內無此列（原：不經 checkUser、匯入成功）', async function() {
            let r = await S.sync('tokAppMinimal', batch('k-minimal'))
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errUserEmailMissing' }, JSON.stringify(r))
            assert.ok(!(await S.list('sys')).some((x) => x.name === 'sync-k-minimal'))
        })

        it('tokNonAdmin（isAdmin n，verifyAppUser 回 false）→ errUserNoPermission（由部署方鉤子決定，不是套件的角色檢查）；系統管理者 tokApp 照常', async function() {
            let r1 = await S.sync('tokNonAdmin', batch('k-denied'))
            assert.deepStrictEqual({ state: r1.state, msg: r1.msg }, { state: 'error', msg: 'errUserNoPermission' })
            assert.ok(!(await S.list('sys')).some((x) => x.name === 'sync-k-denied'))
            let r2 = await S.sync('tokApp', batch('k-app'))
            assert.strictEqual(r2.state, 'success', JSON.stringify(r2))
        })

    })


    //--------------------------------------------------------------------------
    describe('執行身分（請求本體 __sysToken__，getUserIdByToken）：同樣只限系統管理者', function() {

        for (let [tok] of NONADMIN) {
            it(`標頭 tokA（系統管理者）、本體 ${tok}（一般使用者，鉤子放行或改寫）→ saveApi 不執行；固定鍵 errUserIdMissing；ORM 零操作；庫內無此列；回應不含使用者資料`, async function() {
                let r = await post('tokA', tok, 'saveApi', [{ name: `ao-body-${tok}`, url: 'http://t/body', method: 'get', levels: 'T', group: 'adminonly' }])
                assert.strictEqual(r.state, 'error')
                assert.strictEqual(r.msg, 'errUserIdMissing', `msg 應為固定鍵（實得 ${JSON.stringify(r.msg)}）`)
                assert.deepStrictEqual(await S.getOps(), [], 'ORM 應零操作')
                assert.ok(!(await S.list('sys')).some((x) => x.name === `ao-body-${tok}`), '庫內不得有被拒者寫入之列')
                assert.ok(!/nonadmin|mutateadmin/.test(r.raw), `回應不得含使用者資料（實得 ${r.raw.slice(0, 300)}）`)
            })

            it(`標頭 tokA（系統管理者）、本體 ${tok} → 全部函數皆不執行（kpFunExt、表 select、系統函數），ORM 零操作，回應不含憑證`, async function() {
                for (let f of mkFuncs().filter((v) => v.func !== '[sys:polling]')) { //[sys:polling] 由 w-serv-broadcast 輪詢層於執行之前同步定案其回應（見 api-execIdentity），不在此列
                    let r = await post('tokA', tok, f.func, f.args)
                    assert.strictEqual(r.state, 'error', `${f.name}：${r.raw.slice(0, 200)}`)
                    assert.strictEqual(r.msg, 'errUserIdMissing', f.name)
                    for (let s of SECRET_VALUES) {
                        assert.ok(!r.raw.includes(s), `${f.name} 回應不得含憑證「${s}」`)
                    }
                }
                assert.deepStrictEqual(await S.getOps(), [], 'ORM 應零操作')
                assert.strictEqual(nEcho, 0)
                assert.deepStrictEqual((await S.list('sys')).map((x) => x.name).sort(), ['ao-1', 'ao-2'])
            })

            it(`標頭 ${tok}（一般使用者）、本體 tokA（系統管理者）→ 連線閘即拒（permission denied），本體 token 不被驗`, async function() {
                let r = await post(tok, 'tokA', 'saveApi', [{ name: `ao-hdr-${tok}`, url: 'http://t/hdr', method: 'get', levels: 'T', group: 'adminonly' }])
                assert.strictEqual(get(r.data, 'error'), 'permission denied')
                assert.deepStrictEqual(await S.getOps(), [])
                assert.ok(!(await S.list('sys')).some((x) => x.name === `ao-hdr-${tok}`))
            })
        }

        //外審 sol R2：本體 token 非字串（陣列、物件、數字、null、布林）不得經隱式轉型取得使用者；須固定鍵、函數不執行
        for (let [name, v] of [['陣列 ["tokA"]', ['tokA']], ['物件', { a: 'tokA' }], ['數字 5', 5], ['null', null], ['布林 true', true], ['物件含 toString', { toString: () => 'tokA' }]]) {
            it(`本體 __sysToken__ 為非字串（${name}）→ saveApi 不執行；固定鍵 errUserIdMissing；ORM 零操作`, async function() {
                let r = await post('tokA', v, 'saveApi', [{ name: 'ao-type', url: 'http://t/type', method: 'get', levels: 'T', group: 'adminonly' }])
                assert.strictEqual(r.state, 'error')
                assert.strictEqual(r.msg, 'errUserIdMissing')
                assert.deepStrictEqual(await S.getOps(), [])
                assert.ok(!(await S.list('sys')).some((x) => x.name === 'ao-type'))
            })
        }

        it('標頭 tokA、本體 tokB（兩位系統管理者）→ 照常執行，userIdUpdate 為本體使用者 id-for-adminB（對照組）', async function() {
            let r = await post('tokA', 'tokB', 'saveApi', [{ name: 'ao-two-admins', url: 'http://t/two', method: 'get', levels: 'T', group: 'adminonly' }])
            assert.strictEqual(r.state, 'success', JSON.stringify(r.msg))
            let row = (await S.list('sys')).find((x) => x.name === 'ao-two-admins')
            assert.strictEqual(row.userIdUpdate, 'id-for-adminB')
        })

        it('部署方可再收緊、不能放寬：系統管理者但鉤子拒絕（tokDenied）作本體 → errUserIdMissing；鉤子對一般使用者之放行不改變結果（見上）', async function() {
            let r = await post('tokA', 'tokDenied', 'saveApi', [{ name: 'ao-denied-body', url: 'http://t/d', method: 'get', levels: 'T', group: 'adminonly' }])
            assert.strictEqual(r.msg, 'errUserIdMissing')
            assert.deepStrictEqual(await S.getOps(), [])
        })

    })


    //--------------------------------------------------------------------------
    describe('拒絕記 srLog（verifyConn、getUserIdByToken、api/getUserByToken 之 err=errUserNotAdmin），不含 token、使用者資料與憑證', function() {

        let SL = null

        before(async function() {
            this.timeout(120000)
            SL = await startApiServer({ name: 'api-adminOnly-log', port: PORT_LOG }) //獨立子行程: log 只含本案自己的請求
            await SL.seed(seedRows())
        })

        after(async function() {
            this.timeout(30000)
            if (SL) {
                await SL.stop()
            }
        })

        it('一般使用者：main 兩次、六路由各一次、本體 token 一次、登入檢查一次 → 各記 error（err=errUserNotAdmin），只含白名單欄位；log 不含 token／使用者欄位／憑證', async function() {
            for (let tok of ['tokNonAdmin', 'tokMutateAdmin']) {
                await callFun(SL.base, tok, 'getApisList', [])
            }
            for (let rt of ROUTES.filter((x) => x.apiType !== 'main')) {
                await rawRoute(rt, 'tokNonAdmin', SL.base)
            }
            await postMain(SL.base, 'tokA', { func: 'getWebInfor', input: { __sysInputArgs__: [], __sysToken__: 'tokNonAdmin' } })
            await loginCheck('tokNonAdmin', SL.base)

            let isGate = (l) => l.includes('"event":"verifyConn"') && l.includes('"err":"errUserNotAdmin"')
            let isExec = (l) => l.includes('"event":"getUserIdByToken"') && l.includes('"err":"errUserNotAdmin"')
            let isLogin = (l) => l.includes('"event":"api/getUserByToken"') && l.includes('"err":"errUserNotAdmin"')
            let lines = await waitLogs(SL.cwd, (ls) => ls.filter(isGate).length >= 7 && ls.filter(isExec).length >= 1 && ls.filter(isLogin).length >= 1)
            let gate = lines.filter(isGate).map((l) => JSON.parse(l))
            let exec = lines.filter(isExec).map((l) => JSON.parse(l))
            let login = lines.filter(isLogin).map((l) => JSON.parse(l))
            assert.strictEqual(gate.length, 7, `連線閘拒絕記錄應 7 筆（實得 ${gate.length}）`)
            assert.deepStrictEqual(gate.map((o) => o.apiType).sort(), ['download', 'download-get-file', 'download-get-filename', 'main', 'main', 'upload-controller', 'upload-slice'])
            assert.strictEqual(exec.length, 1)
            assert.strictEqual(login.length, 1)
            assert.ok([...gate, ...exec, ...login].every((o) => o.level === 50), '拒絕為 error 等級')
            let allowed = ['level', 'time', 'pid', 'hostname', 'event', 'err', 'apiType']
            for (let o of [...gate, ...exec, ...login]) {
                let extra = Object.keys(o).filter((k) => !allowed.includes(k))
                assert.deepStrictEqual(extra, [], `拒絕記錄含白名單外欄位（${JSON.stringify(o)}）`)
            }
            //拒絕記錄（error 等級）不含任何使用者識別；全部 log 不含 token、email 與憑證（登入檢查通過授權後另記 info verifyClientUser 之 userId，為既有白名單欄位，不在此限）
            let textErr = [...gate, ...exec, ...login].map((o) => JSON.stringify(o)).join('\n')
            for (let s of ['id-nonadmin', 'id-mutateadmin']) {
                assert.ok(!textErr.includes(s), `拒絕記錄不得含「${s}」`)
            }
            let text = lines.join('\n')
            for (let s of ['tokNonAdmin', 'tokMutateAdmin', 'nonadmin@example.com', 'mutateadmin@example.com', ...SECRET_VALUES]) {
                assert.ok(!text.includes(s), `srLog 不得含「${s}」`)
            }
        })

    })

})
