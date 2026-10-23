//api-execIdentity：資料通道之「執行身分」完整驗證（C3，ADR-050，R-EXECID-01；跨套件規格 C:\opensrcOper\dspec\w-web呼叫者身分驗證.md 規則 4）。
//背景：資料通道只傳遞 token，兩處各帶一個——連線閘驗 Authorization 標頭之 token（verifyConn）、函數執行前 w-serv-webdata 以請求本體之 __sysToken__ 呼叫
//getUserIdByToken 取得 userId。兩者可為不同值、框架不比對；w-serv-orm 1.1.10 起亦不做使用者檢查，故「反查使用者」即驗證身分之步驟，屬本套件之責：
//getUserIdByToken 須與連線閘同等完整（token 認證＋部署方 verifyClientUser(user, 'main')），拒絕即不執行函數、零寫入。
//使用者 2026-10-23 說明：資料通道只傳遞 token，反查使用者（getUserIdByToken）即驗證身分之步驟，屬使用方之責。
//真後端（隔離子行程：獨立 lmdb、埠 8559；部署方 getUserByToken／verifyClientUser 由 test/tools/apiServerChild.mjs 提供並記錄 { userId, from }；不碰專案 ./db 與 11005），
//經真實資料通道（/api/main）直打，標頭 token 與本體 token 可分別指定。斷言：
//- 標頭為放行者（tokA）、本體 __sysToken__ 為被 verifyClientUser 拒絕者／拋錯／reject／回 falsy／欄位不齊／查無／空字串 → 函數不執行（ORM 零操作、庫內不變），回應只含固定 key errUserIdMissing
//- 兩 token 皆有效而不同 → 以本體 token 之使用者執行（userIdUpdate 為本體使用者）
//- 本體 token 之驗證：認證在前、授權在後（欄位不齊與查無者不呼叫鉤子）；鉤子之 from 為 'main'；srLog 只記白名單欄位與認證／授權之既有 key，不含 token 與使用者資料
import assert from 'assert'
import http from 'http'
import get from 'lodash-es/get.js'
import { startApiServer, waitLogs } from './tools/apiHarness.mjs'
import { postMain } from './tools/apiMain.mjs'


let PORT = 8559
let PORT_ECHO = 8564 //proxyRequest 之代發目標（計命中數）
let PORT_LOG = 8565 //srLog 案專用之子行程（log 只含該案自己的請求）
let SECRET = 'SYNTH-VERIFY-SECRET-FOR-TEST' //鉤子 throw／reject 之內容（apiServerChild）
let S = null
let SL = null
let echo = null
let nEcho = 0

//post：標頭 token 與本體 token 分別指定（callFun 只能同值）；回 { state, msg, raw, data }
async function post(headerTok, bodyTok, func, args = []) {
    let r = await postMain(S.base, headerTok, { func, input: { __sysInputArgs__: args, __sysToken__: bodyTok } })
    return { state: get(r.data, 'success.output.state', ''), msg: get(r.data, 'success.output.msg', null), raw: r.raw, data: r.data }
}

let rowOf = (name, group = 'execid') => ({ name, url: `http://t/${name}`, method: 'get', levels: 'T', group })

//資料通道之函數全集（kpFunExt、表操作 select、系統函數）：本體 token 被拒時每條都不得執行
let mkFuncs = (idDel) => [
    { name: '[sys:getFuncList]（系統函數）', func: '[sys:getFuncList]', args: [] },
    { name: '[sys:getTableTags]（系統函數）', func: '[sys:getTableTags]', args: [] },
    //[sys:polling] 不在此列：w-serv-broadcast 之輪詢層於資料通道執行之前同步定案其回應（getUserIdByToken 其後仍被呼叫，但結果無法改變回應），身分只由連線閘（標頭 token）把關；屬框架層，見下方獨立案
    { name: 'getWebInfor', func: 'getWebInfor', args: [] },
    { name: 'getApisList', func: 'getApisList', args: [] },
    { name: 'saveApi', func: 'saveApi', args: [rowOf('execid-write')] },
    { name: 'deleteApi', func: 'deleteApi', args: [idDel] },
    { name: 'proxyRequest', func: 'proxyRequest', args: [{ method: 'GET', url: `http://127.0.0.1:${PORT_ECHO}/execid`, headers: [], query: [], timeout: 30000 }] },
    { name: 'getStaEvent', func: 'getStaEvent', args: [7, 'hr'] },
    { name: 'apis.select（表操作）', func: 'apis.select', args: [] },
    { name: 'nope（不存在之函數）', func: 'nope', args: [] },
]

//本體 token 應被拒之情境：[說明, token, 認證階段即失敗（不呼叫鉤子）]
let DENIED = [
    ['verifyClientUser 回 false（tokDenied，isAdmin y）', 'tokDenied', false],
    ['verifyClientUser 拋錯（tokVThrow）', 'tokVThrow', false],
    ['verifyClientUser reject（tokVReject）', 'tokVReject', false],
    ['verifyClientUser 回 undefined（tokVFalsy）', 'tokVFalsy', false],
    ['verifyClientUser 回 null（tokVNull）', 'tokVNull', false],
    ['verifyClientUser 回 0（tokVZero）', 'tokVZero', false],
    ['verifyClientUser 回空字串（tokVEmptyStr）', 'tokVEmptyStr', false],
    ['verifyClientUser 回 Promise.resolve(false)（tokVAsyncFalse）', 'tokVAsyncFalse', false],
    ['使用者欄位不齊（tokNoEmail：無 email）', 'tokNoEmail', true],
    ['使用者欄位不齊（tokNoName：無 name）', 'tokNoName', true],
    ['使用者欄位不齊（tokNoId：無 id）', 'tokNoId', true],
    ['使用者欄位不合（tokBadRole：isAdmin 非 y／n）', 'tokBadRole', true],
    ['查無此 token（getUserByToken 回 {}）', 'tokUnknownBody', true],
    ['空字串 token', '', true],
    ['帶 Bearer 前綴之字串（"Bearer tokA" 非使用者 token）', 'Bearer tokA', true],
]


describe('api-execIdentity (資料通道執行身分: getUserIdByToken 與連線閘同等完整驗證)', function() {
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
        //代發目標為本機 echo：放行 127.0.0.1（內建位址政策預設拒絕本機，P1），使「被拒者之 proxyRequest 零命中」確由執行身分檢查而非位址政策決定
        S = await startApiServer({ name: 'api-execIdentity', port: PORT, opt: { proxyAllowList: ['127.0.0.1'] } })
    })

    after(async function() {
        this.timeout(30000)
        for (let x of [S, SL]) {
            if (x) {
                await x.stop()
            }
        }
        if (echo) {
            await new Promise((resolve) => echo.close(() => resolve()))
        }
    })

    beforeEach(async function() {
        nEcho = 0
        await S.getOps(true)
        await S.getVerifyCalls(true)
    })


    describe('標頭 token 放行、本體 __sysToken__ 被拒 → 函數不執行', function() {
        for (let [name, tok] of DENIED) {
            it(`本體：${name} → saveApi 不執行；回應只有固定 key errUserIdMissing；ORM 零操作；庫內無此列；回應不含鉤子拋出之內容與使用者資料`, async function() {
                let nm = `execid-denied-${DENIED.findIndex((d) => d[1] === tok)}`
                let r = await post('tokA', tok, 'saveApi', [rowOf(nm)])
                assert.strictEqual(r.state, 'error')
                assert.strictEqual(r.msg, 'errUserIdMissing', `msg 應為固定 key（實得 ${JSON.stringify(r.msg)}）`)
                assert.deepStrictEqual(await S.getOps(), [], 'ORM 應零操作（零寫入、零讀取）')
                let list = await S.list('tokA')
                assert.ok(!list.some((x) => x.name === nm), '庫內不得有被拒者寫入之列')
                assert.ok(!r.raw.includes(SECRET), '回應不得含鉤子拋出之內容')
                assert.ok(!/id-denied|id-vthrow|id-vreject|id-vfalsy|id-vnull|id-vzero|id-vemptystr|id-vasyncfalse|id-noemail|id-noname|id-badrole|denied@|noemail|noname|badrole/.test(r.raw), `回應不得含使用者資料（實得 ${r.raw.slice(0, 300)}）`)
            })
        }

        it('各被拒情境之回應完全相同（不洩漏「查無」「欄位不齊」「授權拒絕」之差別）', async function() {
            let seen = new Set()
            for (let [, tok] of DENIED) {
                let r = await post('tokA', tok, 'getWebInfor')
                seen.add(JSON.stringify({ state: r.state, msg: r.msg }))
            }
            assert.deepStrictEqual([...seen], [JSON.stringify({ state: 'error', msg: 'errUserIdMissing' })])
        })

        it('本體被拒者借用放行者之連線：資料通道函數全集（kpFunExt、表 select、系統函數、不存在之函數）皆不執行；代發目標零命中；ORM 零操作', async function() {
            let seedR = await post('tokA', 'tokA', 'saveApi', [rowOf('execid-seed')])
            assert.strictEqual(seedR.state, 'success', JSON.stringify(seedR.msg))
            let idDel = seedR.msg[0].id
            await S.getOps(true)
            nEcho = 0
            for (let f of mkFuncs(idDel)) {
                let r = await post('tokA', 'tokDenied', f.func, f.args)
                assert.strictEqual(r.state, 'error', `${f.name} 應被拒（實得 ${r.raw.slice(0, 200)}）`)
                assert.strictEqual(r.msg, 'errUserIdMissing', f.name)
            }
            assert.deepStrictEqual(await S.getOps(), [], 'ORM 應零操作')
            assert.strictEqual(nEcho, 0, 'proxyRequest 之目標零命中')
            let list = await S.list('tokA')
            assert.ok(list.some((x) => x.id === idDel), 'deleteApi 不得刪除')
            assert.ok(!list.some((x) => x.name === 'execid-write'), 'saveApi 不得寫入')
        })

        it('[sys:polling]（框架之輪詢層於資料通道執行之前同步回應）：getUserIdByToken 仍被呼叫（鉤子兩次），但其結果不影響輪詢之回應——本體 token 被拒亦同；身分只由連線閘把關（框架層行為之記錄）', async function() {
            for (let bodyTok of ['tokDenied', 'tokA']) {
                await S.getVerifyCalls(true)
                //無 clientId：輪詢層之固定錯誤
                let r = await post('tokA', bodyTok, '[sys:polling]')
                assert.ok(r.raw.includes('[sys:polling] invalid clientId'), `本體 ${bodyTok}（實得 ${r.raw.slice(0, 200)}）`)
                //有 clientId：輪詢層回其佇列（空陣列）；本體被拒者之回應與放行者相同
                let r2 = await postMain(S.base, 'tokA', { func: '[sys:polling]', input: { clientId: 'c-execid', __sysInputArgs__: [], __sysToken__: bodyTok } })
                assert.deepStrictEqual(get(r2.data, 'success.output'), [], `本體 ${bodyTok} 有 clientId 之輪詢回應（實得 ${r2.raw.slice(0, 200)}）`)
                let ids = (await S.getVerifyCalls()).map((c) => c.userId)
                assert.deepStrictEqual(ids, ['id-for-adminA', bodyTok === 'tokDenied' ? 'id-denied' : 'id-for-adminA', 'id-for-adminA', bodyTok === 'tokDenied' ? 'id-denied' : 'id-for-adminA'], `本體 ${bodyTok}：兩次輪詢請求各呼叫鉤子兩次（連線閘＋執行身分，後者之結果不影響回應）`)
            }
            assert.deepStrictEqual(await S.getOps(), [], 'ORM 零操作')
            let rd = await post('tokDenied', 'tokA', '[sys:polling]') //標頭被拒者仍於連線閘即被拒
            assert.strictEqual(get(rd.data, 'error'), 'permission denied')
        })

        it('對照：同一批函數以本體 tokA（放行者）執行 → 非 errUserIdMissing（證明上列被拒確出自本體 token 之驗證，非函數本身之錯誤）', async function() {
            for (let f of mkFuncs('nonexistent-id').filter((x) => ['getWebInfor', 'getApisList', 'apis.select（表操作）', '[sys:getFuncList]（系統函數）'].includes(x.name))) {
                let r = await post('tokA', 'tokA', f.func, f.args)
                assert.strictEqual(r.state, 'success', `${f.name}（實得 ${r.raw.slice(0, 200)}）`)
            }
            let r = await post('tokA', 'tokA', 'nope')
            assert.strictEqual(r.msg, 'invalid func[nope]', '放行者呼叫不存在之函數 → 函數層錯誤（被拒者則先被身分檢查擋下）')
        })
    })


    describe('標頭 token 放行、本體 token 亦放行 → 以本體 token 之使用者執行', function() {
        it('標頭 tokA、本體 tokB（兩者皆有效且不同）→ saveApi 成功，userIdUpdate 為本體使用者 id-for-adminB', async function() {
            let r = await post('tokA', 'tokB', 'saveApi', [rowOf('execid-b')])
            assert.strictEqual(r.state, 'success', JSON.stringify(r.msg))
            let list = await S.list('tokA')
            let row = list.find((x) => x.name === 'execid-b')
            assert.ok(row, '應已寫入')
            assert.strictEqual(row.userIdUpdate, 'id-for-adminB')
        })

        it('標頭 tokB、本體 tokA → userIdUpdate 為 id-for-adminA（身分取自本體，與標頭無關）', async function() {
            let r = await post('tokB', 'tokA', 'saveApi', [rowOf('execid-a')])
            assert.strictEqual(r.state, 'success', JSON.stringify(r.msg))
            let row = (await S.list('tokA')).find((x) => x.name === 'execid-a')
            assert.strictEqual(row.userIdUpdate, 'id-for-adminA')
        })

        it('套件不強加政策：本體 tokNonAdmin（isAdmin n，鉤子放行）、tokVTruthy（鉤子回 1）→ 執行，userIdUpdate 為各自 id', async function() {
            for (let [tok, id] of [['tokNonAdmin', 'id-nonadmin'], ['tokVTruthy', 'id-vtruthy']]) {
                let r = await post('tokA', tok, 'saveApi', [rowOf(`execid-${tok}`)])
                assert.strictEqual(r.state, 'success', `${tok} ${JSON.stringify(r.msg)}`)
                let row = (await S.list('tokA')).find((x) => x.name === `execid-${tok}`)
                assert.strictEqual(row.userIdUpdate, id, tok)
            }
        })

        it('部署方鉤子改寫傳入之使用者物件（tokMutate：鉤子把 user.id 設為空字串後回 true）→ 執行身分取自驗證前之快照，不受改寫影響：userIdUpdate 為 id-mutate', async function() {
            await S.getVerifyCalls(true)
            let r = await post('tokA', 'tokMutate', 'saveApi', [rowOf('execid-mutate')])
            assert.strictEqual(r.state, 'success', JSON.stringify(r.msg))
            let row = (await S.list('tokA')).find((x) => x.name === 'execid-mutate')
            assert.strictEqual(row.userIdUpdate, 'id-mutate', '不得以被鉤子改寫後之空 id 執行')
            assert.deepStrictEqual((await S.getVerifyCalls()).slice(0, 2).map((c) => c.userId), ['id-for-adminA', 'id-mutate'])
        })

        it('本體 token 之 from 為 \'main\'：tokOnlyMain（鉤子只在 from===\'main\' 放行）作本體 → 執行', async function() {
            let r = await post('tokA', 'tokOnlyMain', 'saveApi', [rowOf('execid-onlymain')])
            assert.strictEqual(r.state, 'success', JSON.stringify(r.msg))
            let row = (await S.list('tokA')).find((x) => x.name === 'execid-onlymain')
            assert.strictEqual(row.userIdUpdate, 'id-onlymain')
        })
    })


    describe('部署方鉤子之呼叫：兩個 token 各經完整驗證，認證在前授權在後', function() {
        let calls = async () => await S.getVerifyCalls(true)

        it('標頭 tokA、本體 tokB → 鉤子依序被呼叫兩次：連線閘 { id-for-adminA, main }、執行身分 { id-for-adminB, main }', async function() {
            await post('tokA', 'tokB', 'getWebInfor')
            assert.deepStrictEqual(await calls(), [{ userId: 'id-for-adminA', from: 'main' }, { userId: 'id-for-adminB', from: 'main' }])
        })

        it('標頭與本體為同一 token → 仍各驗一次（共兩次；本套件不比對兩 token、不跳過本體之驗證）', async function() {
            await post('tokA', 'tokA', 'getWebInfor')
            assert.deepStrictEqual(await calls(), [{ userId: 'id-for-adminA', from: 'main' }, { userId: 'id-for-adminA', from: 'main' }])
        })

        it('本體 tokDenied → 鉤子對其被呼叫且 from 為 main（授權階段拒絕）', async function() {
            await post('tokA', 'tokDenied', 'getWebInfor')
            assert.deepStrictEqual(await calls(), [{ userId: 'id-for-adminA', from: 'main' }, { userId: 'id-denied', from: 'main' }])
        })

        it('本體欄位不齊（無 email／name／id）、isAdmin 不合、查無、空字串 → 認證階段即失敗，不呼叫鉤子（僅連線閘之一次）', async function() {
            for (let tok of ['tokNoEmail', 'tokNoName', 'tokNoId', 'tokBadRole', 'tokUnknownBody', '']) {
                await post('tokA', tok, 'getWebInfor')
                assert.deepStrictEqual(await calls(), [{ userId: 'id-for-adminA', from: 'main' }], `本體 token[${tok}]`)
            }
        })

        it('標頭被拒者仍於連線閘即被拒（permission denied；不進資料通道，本體 token 不被驗）', async function() {
            let r = await post('tokDenied', 'tokA', 'saveApi', [rowOf('execid-gate')])
            assert.strictEqual(get(r.data, 'error'), 'permission denied')
            assert.deepStrictEqual(await calls(), [{ userId: 'id-denied', from: 'main' }])
            assert.deepStrictEqual(await S.getOps(), [])
        })
    })


    describe('srLog：失敗記 getUserIdByToken，只含白名單欄位與認證／授權之既有 key', function() {
        it('本體 tokDenied／tokNoEmail／查無 各一次 → err 依序為 errUserNoPermission／errUserEmailMissing／errUserNotFound；不含 token、使用者資料與鉤子拋出之內容', async function() {
            SL = await startApiServer({ name: 'api-execIdentity-log', port: PORT_LOG })
            let want = [['tokDenied', 'errUserNoPermission'], ['tokNoEmail', 'errUserEmailMissing'], ['tokUnknownBody', 'errUserNotFound'], ['tokVThrow', 'errUserNoPermission']]
            for (let [tok] of want) {
                let r = await postMain(SL.base, 'tokA', { func: 'getWebInfor', input: { __sysInputArgs__: [], __sysToken__: tok } })
                assert.strictEqual(get(r.data, 'success.output.msg'), 'errUserIdMissing', tok)
            }
            //對照：放行者（本體 tokA）執行一次 getWebInfor → 該函數成功時才記 kpfun-getWebInfor info；故被拒之 4 次若函數曾執行，此事件會多於 1 筆（「函數未執行」之直接觀察，不依賴 ORM 副作用）
            let rc = await postMain(SL.base, 'tokA', { func: 'getWebInfor', input: { __sysInputArgs__: [], __sysToken__: 'tokA' } })
            assert.strictEqual(get(rc.data, 'success.output.state'), 'success')
            let lines = await waitLogs(SL.cwd, (ls) => ls.filter((l) => l.includes('"event":"getUserIdByToken"')).length >= want.length && ls.filter((l) => l.includes('"event":"kpfun-getWebInfor"')).length >= 1)
            assert.strictEqual(lines.filter((l) => l.includes('"event":"kpfun-getWebInfor"')).length, 1, 'getWebInfor 只有對照那一次執行（被拒之 4 次函數未執行）')
            let recs = lines.map((l) => JSON.parse(l)).filter((o) => o.event === 'getUserIdByToken')
            assert.deepStrictEqual(recs.map((o) => o.err), want.map((w) => w[1]))
            for (let o of recs) {
                assert.strictEqual(o.level, 50)
                assert.deepStrictEqual(Object.keys(o).sort(), ['err', 'event', 'hostname', 'level', 'pid', 'time'], 'srLog 欄位為白名單')
            }
            let text = lines.join('\n')
            assert.ok(!text.includes(SECRET), 'srLog 不得含鉤子拋出之內容')
            assert.ok(!/tokDenied|tokNoEmail|tokUnknownBody|tokVThrow|id-denied|id-noemail|id-vthrow|denied@|noemail/.test(text), `srLog 不得含 token 與使用者資料`)
        })
    })
})
