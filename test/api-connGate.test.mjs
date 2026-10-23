//api-connGate：資料通道之連線閘（verifyConn）＝token 認證＋部署方注入之授權鉤子 verifyClientUser(user, apiType)
//（規格 C:\opensrcOper\dspec\w-web呼叫者身分驗證.md 規則 1、3、5、6；ADR-048；rulebook_backend.md R-CONNGATE-01）。
//真後端（隔離子行程：獨立 lmdb、埠 8554，部署方 verifyClientUser 由 test/tools/apiServerChild.mjs 提供並記錄 { userId, from }；不碰專案 ./db 與 11005），
//經真實資料通道（/api/main 及 w-converhp 其餘五條路由）直打。被拒情境之使用者皆 isAdmin 'y'，使「被拒」只能出自 verifyClientUser（而非 isAdmin 欄位）：
//- tokDenied：verifyClientUser 回 false；tokVThrow：拋錯；tokVReject：reject；tokVFalsy：回 undefined（falsy）；tokOnlyMain：只在入口 'main' 放行（驗 from 為入口名）
//- 套件不強加政策之正向格：tokNonAdmin（isAdmin 'n' 但鉤子放行）→ 通過；tokVTruthy（鉤子回 1，truthy 非 true）→ 與登入檢查同一判定（falsy 才拒）而通過
//- tokNoEmail：使用者欄位不齊 → 認證即失敗（permission denied），不呼叫鉤子
//- sys／tokA：放行（對照組）
//斷言：被拒者 → 傳輸層 permission denied（{ error }，未進 w-serv-webdata）、ORM 零操作（零寫入）、庫內不變、代發目標零命中；
//鉤子被呼叫且 from 為 w-converhp 之入口名；拋錯／reject／falsy 視同拒絕且回應與 srLog 不含鉤子拋出之內容；未通過認證者不呼叫鉤子；拒絕記 srLog 且只含白名單欄位、不含 token 與使用者資料。
import assert from 'assert'
import http from 'http'
import get from 'lodash-es/get.js'
import { startApiServer, waitLogs } from './tools/apiHarness.mjs'
import { callFun, postMain } from './tools/apiMain.mjs'


let PORT = 8554
let PORT_ECHO = 8557 //proxyRequest 之代發目標（計命中數，證明被拒者之 proxyRequest 未執行）
let PORT_LOG = 8558 //srLog 案專用之子行程（log 只含該案自己的請求，免與其他案的拒絕記錄混算）
let S = null
let echo = null
let nEcho = 0
let SECRET = 'SYNTH-VERIFY-SECRET-FOR-TEST' //鉤子 throw／reject 之內容（apiServerChild）

//w-converhp 六條路由與其 apiType（verifyConn 所見之入口名）
let ROUTES = [
    { path: '/api/main', method: 'POST', apiType: 'main' },
    { path: '/api/ulctr', method: 'POST', apiType: 'upload-controller' },
    { path: '/api/slc', method: 'POST', apiType: 'upload-slice' },
    { path: '/api/dwgfn', method: 'POST', apiType: 'download-get-filename' },
    { path: '/api/dwgf', method: 'GET', apiType: 'download-get-file' },
    { path: '/api/dw', method: 'POST', apiType: 'download' },
]

//isDenied：傳輸層拒絕（verifyConn 未放行 → w-converhp 回 { error: 'permission denied' }，不進資料通道，故無 success.output）
let isDenied = (r) => r.ok === false && r.data && r.data.error === 'permission denied'

async function seedRow(name = 'gate-seed') {
    let r = await S.fun('tokA', 'saveApi', [{ name, url: `http://t/${name}`, method: 'get', levels: 'T', group: 'gate' }])
    assert.ok(r.ok, `置入列應成功：${JSON.stringify(r)}`)
    return r.msg[0].id
}

//rawRoute：直打 w-converhp 路由（空本體），回狀態碼與 Return-Type／Return-Msg 標頭
async function rawRoute(route, token, base = S.base) {
    let url = `${base}${route.path}`
    let headers = { 'Content-Type': 'application/octet-stream' }
    if (token !== '') {
        if (route.method === 'GET') { ///dwgf 之 token 走 query（瀏覽器導覽下載，無標頭可用）
            url += `?token=${encodeURIComponent(token)}`
        }
        else {
            headers['Authorization'] = `Bearer ${token}`
        }
    }
    let res = await fetch(url, { method: route.method, headers, body: route.method === 'GET' ? undefined : Buffer.from('x') })
    let body = Buffer.from(await res.arrayBuffer()).toString('utf8')
    return { status: res.status, type: res.headers.get('return-type'), msg: res.headers.get('return-msg'), body }
}

//資料通道之函數全集（kpFunExt、表操作 select、系統函數、非開放之表寫入）：每條在被拒情境下都不得執行
let mkFuncs = (idDel) => [
    { name: '[sys:getFuncList]（系統函數）', func: '[sys:getFuncList]', args: [] },
    { name: '[sys:getTableTags]（系統函數）', func: '[sys:getTableTags]', args: [] },
    { name: '[sys:polling]（系統函數）', func: '[sys:polling]', args: [] },
    { name: 'getWebInfor', func: 'getWebInfor', args: [] },
    { name: 'getApisList', func: 'getApisList', args: [] },
    { name: 'saveApi', func: 'saveApi', args: [{ name: 'gate-write', url: 'http://t/gate-write', method: 'get', levels: 'T', group: 'gate' }] },
    { name: 'deleteApi', func: 'deleteApi', args: [idDel] },
    { name: 'proxyRequest', func: 'proxyRequest', args: [{ method: 'GET', url: `http://127.0.0.1:${PORT_ECHO}/gate`, headers: [], query: [], timeout: 30000 }] },
    { name: 'getStaEvent', func: 'getStaEvent', args: [7, 'hr'] },
    { name: 'apis.select（表操作）', func: 'apis.select', args: [] },
    { name: 'apis.save（未開放之表寫入）', func: 'apis.save', args: [[{ id: idDel, name: 'x' }]] },
    { name: 'apis.insert（未開放之表寫入）', func: 'apis.insert', args: [[{ name: 'x', url: 'http://x', group: 'gate' }]] },
    { name: 'apis.del（未開放之表寫入）', func: 'apis.del', args: [{ id: idDel }] },
]


describe('api-connGate (資料通道連線閘: token 認證＋部署方 verifyClientUser(user, apiType))', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        echo = http.createServer((req, res) => {
            nEcho++
            res.setHeader('Content-Type', 'text/plain')
            res.end('echo')
        })
        await new Promise((resolve, reject) => {
            echo.once('error', reject)
            echo.listen(PORT_ECHO, '127.0.0.1', resolve)
        })
        //代發目標為本機 echo（127.0.0.1）：內建位址政策預設拒絕本機位址（P1, ADR-049），放行 127.0.0.1 使「被拒者之 proxyRequest 零命中」與「放行者命中一次」仍由連線閘（而非位址政策）決定
        S = await startApiServer({ name: 'api-connGate', port: PORT, opt: { proxyAllowList: ['127.0.0.1'] } })
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
        nEcho = 0
    })

    //--------------------------------------------------------------------------
    describe('被 verifyClientUser 拒絕者：經資料通道呼叫任何函數皆被拒、零寫入（規則 1、3、5）', function() {

        let idDel = ''
        let funcs = []

        beforeEach(async function() {
            idDel = await seedRow('gate-keep')
            funcs = mkFuncs(idDel)
            await S.getOps(true)
            await S.getVerifyCalls(true)
        })

        //規則 3：連線驗證＝token 認證＋verifyClientUser；規則 1、5：kpFunExt、表操作、系統函數皆同
        for (let f of mkFuncs('x')) {
            it(`${f.name}：tokDenied（verifyClientUser 回 false）→ permission denied，未執行（ORM 零操作）`, async function() {
                let r = await callFun(S.base, 'tokDenied', f.func, mkFuncs(idDel).find((v) => v.func === f.func).args)
                assert.ok(isDenied(r), `應傳輸層拒絕（實得 ${JSON.stringify(r.data).slice(0, 300)}）`)
                assert.deepStrictEqual(await S.getOps(), [], '被拒者不得觸及 ORM（零寫入、零讀取）')
                assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: 'id-denied', from: 'main' }], '鉤子恰被呼叫一次，from 為入口名 main')
                assert.strictEqual(nEcho, 0, 'proxyRequest 之目標零命中')
            })
        }

        it('全部函數（kpFunExt、表操作、系統函數、未開放之表寫入）連呼後：庫內仍只有原列、未被改寫或刪除、無新列', async function() {
            for (let f of funcs) {
                let r = await callFun(S.base, 'tokDenied', f.func, f.args)
                assert.ok(isDenied(r), `${f.name} 應被拒（實得 ${JSON.stringify(r.data).slice(0, 200)}）`)
            }
            assert.deepStrictEqual(await S.getOps(), [], '全程 ORM 零操作')
            let rs = await S.list()
            assert.strictEqual(rs.length, 1, '無新列')
            assert.strictEqual(rs[0].id, idDel)
            assert.strictEqual(rs[0].name, 'gate-keep', '原列未被改寫')
            assert.strictEqual(nEcho, 0)
        })

        it('Authorization 為被拒者而 __sysToken__ 為放行者 → 仍被拒（連線閘看 Authorization）', async function() {
            let { data } = await postMain(S.base, 'tokDenied', { func: 'saveApi', input: { __sysInputArgs__: [{ name: 'mix', url: 'http://t/mix', group: 'gate', levels: 'T', method: 'get' }], __sysToken__: 'tokA' } })
            assert.deepStrictEqual(data, { error: 'permission denied' })
            assert.deepStrictEqual(await S.getOps(), [])
            assert.strictEqual((await S.list()).length, 1)
        })

    })

    //--------------------------------------------------------------------------
    describe('放行者（對照組）：照常使用資料通道', function() {

        it('tokA 呼叫各函數 → 皆非 permission denied；寫入與讀取照常；proxyRequest 命中目標；鉤子 from 為 main', async function() {
            let idDel = await seedRow('gate-ok')
            await S.getVerifyCalls(true)
            let nCall = 0
            for (let f of mkFuncs(idDel)) {
                if (f.func === 'deleteApi') {
                    continue //最後單獨驗
                }
                await S.getOps(true)
                let r = await callFun(S.base, 'tokA', f.func, f.args)
                nCall++
                assert.ok(!isDenied(r), `${f.name} 放行者不得被拒（實得 ${JSON.stringify(r.data).slice(0, 200)}）`)
                if (f.func.startsWith('apis.') && f.func !== 'apis.select') {
                    assert.strictEqual(r.state, 'error', `${f.name} 未開放，應 invalid func（R-DC-1，行為不變）`)
                    assert.strictEqual(r.msg, `invalid func[${f.func}]`, `${f.name} 應為 invalid func，不是其他執行或驗證錯誤`)
                    assert.deepStrictEqual(await S.getOps(), [], `${f.name} 未觸及 ORM`)
                }
                else if (f.func === '[sys:polling]') {
                    assert.ok(String(r.data && r.data.error).includes('[sys:polling]'), `${f.name} 已進輪詢處理（無 clientId 回其自家錯誤，不是 permission denied；實得 ${JSON.stringify(r.data).slice(0, 200)}）`)
                }
                else {
                    assert.strictEqual(r.state, 'success', `${f.name} 應 success（實得 ${JSON.stringify(r.data).slice(0, 300)}）`)
                }
            }
            let rd = await callFun(S.base, 'tokA', 'deleteApi', [idDel])
            nCall++
            assert.strictEqual(rd.state, 'success', 'deleteApi 放行者可刪')
            let calls = await S.getVerifyCalls()
            //每個放行之請求呼叫鉤子兩次：連線閘（標頭 token）＋執行身分（本體 __sysToken__，C3：getUserIdByToken 與連線閘同等完整驗證；api-execIdentity 另驗兩 token 不同之情形）
            assert.strictEqual(calls.length, nCall * 2, '每個放行之請求呼叫鉤子兩次（連線閘＋執行身分）')
            assert.ok(calls.every((c) => c.userId === 'id-for-adminA' && c.from === 'main'), `from 皆為 main（實得 ${JSON.stringify(calls.slice(0, 3))}）`)
            assert.strictEqual(nEcho, 1, 'proxyRequest 命中目標一次')
            let rs = await S.list()
            assert.ok(rs.some((v) => v.name === 'gate-write'), 'saveApi 寫入成功')
            assert.ok(!rs.some((v) => v.id === idDel), 'deleteApi 刪除成功')
        })

    })

    //--------------------------------------------------------------------------
    describe('鉤子拋錯／reject／回 falsy（undefined、null、0、空字串、Promise.resolve(false)）→ 視同拒絕（規則 3；ADR-033 W 契約），回應不含鉤子內容', function() {

        for (let tok of ['tokVThrow', 'tokVReject', 'tokVFalsy', 'tokVNull', 'tokVZero', 'tokVEmptyStr', 'tokVAsyncFalse']) {
            it(`${tok}：saveApi／getApisList → permission denied、ORM 零操作、回應不含鉤子拋出之內容`, async function() {
                await S.getOps(true)
                await S.getVerifyCalls(true)
                for (let [func, args] of [['saveApi', [{ name: 'vx', url: 'http://t/vx', group: 'gate', levels: 'T', method: 'get' }]], ['getApisList', []]]) {
                    let r = await callFun(S.base, tok, func, args)
                    assert.ok(isDenied(r), `${func} 應被拒（實得 ${JSON.stringify(r.data).slice(0, 200)}）`)
                    assert.ok(!JSON.stringify(r.data).includes(SECRET), `回應不得含鉤子拋出之內容`)
                }
                assert.deepStrictEqual(await S.getOps(), [])
                let calls = await S.getVerifyCalls()
                assert.strictEqual(calls.length, 2, '鉤子確被呼叫（拋錯／reject 是鉤子自己的結果，不是閘沒呼叫）')
                assert.ok(calls.every((c) => c.from === 'main'))
            })
        }

    })

    //--------------------------------------------------------------------------
    describe('套件不強加授權政策（規則 3：政策屬部署方）：放行與否只看部署方鉤子', function() {

        it('tokNonAdmin（isAdmin \'n\'，鉤子回 true）→ 通過連線閘，函數照常執行（套件未額外要求管理員）', async function() {
            await S.getVerifyCalls(true)
            let r1 = await callFun(S.base, 'tokNonAdmin', 'getApisList', [])
            assert.strictEqual(r1.state, 'success', `應 success（實得 ${JSON.stringify(r1.data).slice(0, 200)}）`)
            let r2 = await callFun(S.base, 'tokNonAdmin', 'saveApi', [{ name: 'nonadmin-write', url: 'http://t/na', method: 'get', levels: 'T', group: 'gate' }])
            assert.strictEqual(r2.state, 'success')
            assert.deepStrictEqual(await S.getVerifyCalls(), [ //每個放行之請求兩次：連線閘＋執行身分（C3）
                { userId: 'id-nonadmin', from: 'main' },
                { userId: 'id-nonadmin', from: 'main' },
                { userId: 'id-nonadmin', from: 'main' },
                { userId: 'id-nonadmin', from: 'main' },
            ])
            assert.ok((await S.list()).some((v) => v.name === 'nonadmin-write'), '寫入成功') //S.list 以 sys 讀取，會多一筆鉤子記錄，故置於記錄斷言之後
        })

        it('tokVTruthy（鉤子回 1，truthy 非 true）→ 連線閘與登入檢查同一判定（falsy 才拒）：兩處皆通過', async function() {
            await S.getVerifyCalls(true)
            let r1 = await callFun(S.base, 'tokVTruthy', 'getApisList', [])
            assert.strictEqual(r1.state, 'success', `資料通道應通過（實得 ${JSON.stringify(r1.data).slice(0, 200)}）`)
            let r2 = await (await fetch(`${S.base}/api/getUserByToken?token=tokVTruthy`)).json()
            assert.strictEqual(r2.state, 'success', '登入檢查同樣通過（兩處同一判定）')
            assert.deepStrictEqual(await S.getVerifyCalls(), [
                { userId: 'id-vtruthy', from: 'main' }, //連線閘
                { userId: 'id-vtruthy', from: 'main' }, //執行身分（C3）
                { userId: 'id-vtruthy', from: 'getUserByToken' },
            ])
        })

        it('tokNoEmail（使用者欄位不齊）→ 認證即失敗，permission denied，鉤子零呼叫、ORM 零操作', async function() {
            await S.getVerifyCalls(true)
            await S.getOps(true)
            let r = await callFun(S.base, 'tokNoEmail', 'getApisList', [])
            assert.ok(isDenied(r), `應被拒（實得 ${JSON.stringify(r.data).slice(0, 200)}）`)
            assert.deepStrictEqual(await S.getVerifyCalls(), [], '認證未過不得呼叫授權鉤子')
            assert.deepStrictEqual(await S.getOps(), [])
        })

    })

    //--------------------------------------------------------------------------
    describe('from 為 w-converhp 之入口名（六條路由皆套用連線閘）', function() {

        for (let rt of ROUTES) {
            it(`${rt.method} ${rt.path}：tokOnlyMain（只在 main 放行）→ ${rt.apiType === 'main' ? '通過連線閘' : 'permission denied'}，鉤子 from=${rt.apiType}`, async function() {
                await S.getVerifyCalls(true)
                let r = await rawRoute(rt, 'tokOnlyMain')
                let calls = await S.getVerifyCalls()
                assert.deepStrictEqual(calls, [{ userId: 'id-onlymain', from: rt.apiType }], '鉤子被呼叫一次，from 為入口名')
                if (rt.apiType === 'main') {
                    assert.notStrictEqual(r.msg, 'permission denied', `main 放行，不得 permission denied（實得 ${r.msg}）`)
                    assert.ok(/^invalid /.test(String(r.msg)), `main 放行後進入路由之封包檢核（空本體），實得 msg=${r.msg}`)
                }
                else {
                    assert.strictEqual(r.msg, 'permission denied', `${rt.apiType} 應被拒（實得 status=${r.status} msg=${r.msg}）`)
                    assert.strictEqual(r.status, rt.apiType === 'download-get-file' ? 403 : 200, '狀態碼同 w-converhp 之 permission 回覆')
                }
            })

            it(`${rt.method} ${rt.path}：sys（放行）→ 通過連線閘（進入路由之參數檢核，回 invalid …，不是 permission denied），鉤子 from=${rt.apiType}`, async function() {
                await S.getVerifyCalls(true)
                let r = await rawRoute(rt, 'sys')
                assert.notStrictEqual(r.msg, 'permission denied', `放行者不得被拒（實得 status=${r.status} msg=${r.msg}）`)
                assert.ok(/^invalid /.test(String(r.msg)), `應進入路由並回其參數錯誤（空本體），實得 status=${r.status} msg=${r.msg}`)
                assert.strictEqual(r.status, rt.apiType === 'download-get-file' ? 400 : 200, `${rt.apiType} 參數錯誤之狀態碼`)
                assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: 'id-for-admin', from: rt.apiType }])
            })

            it(`${rt.method} ${rt.path}：tokDenied → permission denied`, async function() {
                await S.getVerifyCalls(true)
                let r = await rawRoute(rt, 'tokDenied')
                assert.strictEqual(r.msg, 'permission denied')
                assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: 'id-denied', from: rt.apiType }])
            })
        }

    })

    //--------------------------------------------------------------------------
    describe('認證先於授權：未通過 token 認證者一律被拒且不呼叫鉤子（行為不變）', function() {

        it('無 Authorization（無 token）、未知 token → 六路由與 main 函數皆 permission denied，鉤子零呼叫', async function() {
            await S.getVerifyCalls(true)
            for (let tok of ['', 'unknown-token-api-connGate']) {
                for (let rt of ROUTES) {
                    let r = await rawRoute(rt, tok)
                    assert.strictEqual(r.msg, 'permission denied', `${rt.path} token[${tok}]`)
                }
            }
            let r2 = await callFun(S.base, 'unknown-token-api-connGate', 'getApisList', [])
            assert.ok(isDenied(r2))
            assert.deepStrictEqual(await S.getVerifyCalls(), [], '認證未過不得呼叫授權鉤子')
        })

    })

    //--------------------------------------------------------------------------
    //Authorization 方案：嚴格要求 Bearer 前綴（RFC 9110 §11.1：方案名不分大小寫，方案名與憑證間為一個以上空白）。
    //修正前以 strdelleft(authorization, 7) 無條件刪前 7 字元，從不驗方案：'Basic  tokA'、'Token  tokA'（方案名後兩個空白）亦通過連線閘（api-run01 實測 F4）。
    //方案不符者視為未帶 token：認證即失敗（permission denied），不呼叫部署方之鉤子。
    describe('Authorization 方案：嚴格要求 Bearer（方案名不分大小寫），不符即拒（api-run02）', function() {

        let mainWith = (auth) => postMain(S.base, 'unused', { func: 'getWebInfor', input: { __sysInputArgs__: [], __sysToken__: 'tokA' } }, { Authorization: auth })
        let isOk = (r) => get(r.data, 'success.output.state', '') === 'success'
        let isDeny = (r) => get(r.data, 'error', '') === 'permission denied'

        //方案正確者（方案名大小寫任意、空白一個以上）→ 通過；連線閘與執行身分各呼叫鉤子一次
        for (let auth of ['Bearer tokA', 'bearer tokA', 'BEARER tokA', 'BeArEr tokA', 'Bearer  tokA', 'Bearer     tokA']) {
            it(`Authorization: ${JSON.stringify(auth)} → 通過連線閘、函數執行`, async function() {
                await S.getVerifyCalls(true)
                let r = await mainWith(auth)
                assert.ok(isOk(r), `應通過（實得 ${r.raw.slice(0, 200)}）`)
                assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: 'id-for-adminA', from: 'main' }, { userId: 'id-for-adminA', from: 'main' }])
            })
        }

        //方案不符、缺方案、缺憑證者 → permission denied；token 視為未帶，不呼叫鉤子、ORM 零操作
        let rejects = [
            'Basic tokA', 'Basic  tokA', 'Token tokA', 'Token  tokA', 'Digest tokA', 'Negotiate tokA', 'OAuth tokA', //他種方案（含 api-run01 之 F4：方案名後兩個空白）
            'tokA', 'BearertokA', 'Bearer', 'Bearer ', //缺方案、方案與憑證之間無空白、無憑證
            'Bearer:tokA', 'Bearer\ttokA', 'XBearer tokA', 'Bearer-x tokA', 'Bearers tokA', //方案名不等於 Bearer、分隔非空白
            'tokA Bearer', //方案在後
        ]
        for (let auth of rejects) {
            it(`Authorization: ${JSON.stringify(auth)} → permission denied（方案不符視為未帶 token）；鉤子零呼叫、ORM 零操作`, async function() {
                await S.getVerifyCalls(true)
                await S.getOps(true)
                let r = await mainWith(auth)
                assert.ok(isDeny(r), `應被拒（實得 ${r.raw.slice(0, 200)}）`)
                assert.deepStrictEqual(await S.getVerifyCalls(), [], '認證未過不得呼叫授權鉤子')
                assert.deepStrictEqual(await S.getOps(), [])
            })
        }

        it('五條標頭型 w-converhp 路由（main、ulctr、slc、dwgfn、dw；GET /api/dwgf 之 token 走 query 由 w-converhp 合成 Bearer，不適用）：非 Bearer 方案（\'Basic  tokA\'、\'Token  tokA\'）→ permission denied；Bearer（任意大小寫）→ 通過連線閘進入路由之參數檢核', async function() {
            await S.getVerifyCalls(true)
            for (let rt of ROUTES.filter((x) => x.method === 'POST')) {
                for (let auth of ['Basic  tokA', 'Token  tokA']) {
                    let res = await fetch(`${S.base}${rt.path}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Authorization': auth }, body: Buffer.from('x') })
                    assert.strictEqual(res.headers.get('return-msg'), 'permission denied', `${rt.path} ${auth}`)
                }
                for (let auth of ['Bearer tokA', 'bearer tokA']) {
                    let res = await fetch(`${S.base}${rt.path}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Authorization': auth }, body: Buffer.from('x') })
                    let msg = res.headers.get('return-msg')
                    assert.notStrictEqual(msg, 'permission denied', `${rt.path} ${auth}`)
                    assert.ok(/^invalid /.test(String(msg)), `${rt.path} ${auth} 應進入路由之參數檢核（實得 ${msg}）`)
                }
            }
            assert.deepStrictEqual((await S.getVerifyCalls()).map((c) => c.from), ROUTES.filter((x) => x.method === 'POST').flatMap((rt) => [rt.apiType, rt.apiType]), '只有 Bearer 者呼叫鉤子，各一次')
        })

    })

    //--------------------------------------------------------------------------
    describe('其他入口之行為不變：/api/getUserByToken 之 from 仍為 getUserByToken', function() {

        it('GET /api/getUserByToken：sys → success；tokDenied → errUserNoPermission；鉤子 from=getUserByToken', async function() {
            await S.getVerifyCalls(true)
            let r1 = await (await fetch(`${S.base}/api/getUserByToken?token=sys`)).json()
            assert.strictEqual(r1.state, 'success')
            let r2 = await (await fetch(`${S.base}/api/getUserByToken?token=tokDenied`)).json()
            assert.deepStrictEqual({ state: r2.state, msg: r2.msg }, { state: 'error', msg: 'errUserNoPermission' })
            assert.deepStrictEqual(await S.getVerifyCalls(), [
                { userId: 'id-for-admin', from: 'getUserByToken' },
                { userId: 'id-denied', from: 'getUserByToken' },
            ])
        })

    })

    //--------------------------------------------------------------------------
    describe('拒絕記 srLog（規則 6），不含 token 與使用者資料', function() {

        let SL = null

        before(async function() {
            this.timeout(120000)
            SL = await startApiServer({ name: 'api-connGate-log', port: PORT_LOG }) //獨立子行程: log 只含本案自己的請求
        })

        after(async function() {
            this.timeout(30000)
            if (SL) {
                await SL.stop()
            }
        })

        it('每次被拒之連線各記 verifyConn error（err=errUserNoPermission、含 apiType）；log 不含 token、使用者欄位、鉤子拋出之內容', async function() {
            //本案自己製造：6 路由 × tokDenied ＋ main × (tokVThrow、tokVReject、tokVFalsy)
            for (let rt of ROUTES) {
                await rawRoute(rt, 'tokDenied', SL.base)
            }
            for (let tok of ['tokVThrow', 'tokVReject', 'tokVFalsy']) {
                await callFun(SL.base, tok, 'getApisList', [])
            }
            let want = 9
            let isDeny = (l) => l.includes('"event":"verifyConn"') && l.includes('"err":"errUserNoPermission"')
            let lines = await waitLogs(SL.cwd, (ls) => ls.filter(isDeny).length >= want)
            let recs = lines.filter(isDeny).map((l) => JSON.parse(l))
            assert.strictEqual(recs.length, want, `拒絕記錄應恰 ${want} 筆（實得 ${recs.length}）`)
            assert.ok(recs.every((o) => o.level === 50), '拒絕為 error 等級')
            let types = recs.map((o) => o.apiType).sort()
            assert.deepStrictEqual(types, ['download', 'download-get-file', 'download-get-filename', 'main', 'main', 'main', 'main', 'upload-controller', 'upload-slice'])
            //拒絕記錄只允許白名單欄位（pino 基本欄位＋event、err、apiType）：任何使用者欄位（userId、name、email…）一出現即紅
            let allowed = ['level', 'time', 'pid', 'hostname', 'event', 'err', 'apiType']
            for (let o of recs) {
                let extra = Object.keys(o).filter((k) => !allowed.includes(k))
                assert.deepStrictEqual(extra, [], `拒絕記錄含白名單外欄位（${JSON.stringify(o)}）`)
            }
            let text = lines.join('\n')
            let forbidden = [
                'tokDenied', 'tokVThrow', 'tokVReject', 'tokVFalsy', 'tokOnlyMain', //token
                'id-denied', 'id-vthrow', 'id-vreject', 'id-vfalsy', //使用者 id
                'denied@example.com', 'vthrow@example.com', 'vreject@example.com', 'vfalsy@example.com', //email
                SECRET, //鉤子拋出之內容
            ]
            for (let s of forbidden) {
                assert.ok(!text.includes(s), `srLog 不得含「${s}」`)
            }
        })

    })

})
