//api-publicApisList：一般使用者以 token 取得 API 清單（GET /api/getApisList?token=；R-PUBLICAPIS-01，ADR-051；使用者 2026-10-24 裁示：
//「經由指定 token 應該是取得 api 清單，但系統管理員才能取得頁面多表」）。
//token 須通過完整驗證（有效使用者＋部署方 verifyClientUser(user, 'getApisList')），一般使用者與管理員皆可；只回啟用中（isActive 'y'）之 API，
//且每列只含公開欄位白名單（src/schema/contracts/apis.mjs 之 fieldsPublic），固定排除 tokens、authConfigJson 等第三方憑證、測試設定與伺服器專有欄位。
//真後端（隔離子行程：獨立 lmdb、埠 8569；部署方 getUserByToken／verifyClientUser 由 test/tools/apiServerChild.mjs 提供並記錄 { userId, from }；不碰專案 ./db 與 11005）直打。
//白名單與禁止欄位在本檔以字面值獨立列出（不 import 實作之常數）：實作若把憑證欄位加入白名單，本檔即紅。
import assert from 'assert'
import { startApiServer, mkLegacyRow, waitLogs } from './tools/apiHarness.mjs'
import { callFun } from './tools/apiMain.mjs'


let PORT = 8569
let PORT_LOG = 8570 //srLog 案專用之子行程（log 只含該案自己的請求）
let S = null

//公開欄位（字面值，依 schema 宣告序）
let PUBLIC_KEYS = ['id', 'order', 'name', 'description', 'url', 'method', 'version', 'group', 'levels', 'keywords', 'state', 'creator', 'dataSource', 'mdInputParams', 'inputExample', 'mdOutputParams', 'outputExample']
//永不出現之欄位：第三方憑證、測試設定、本系統擁有之其餘欄位、伺服器專有欄位
let FORBIDDEN_KEYS = ['tokens', 'authConfigJson', 'testBaseUrl', 'authType', 'defaultHeadersJson', 'defaultQueryJson', 'defaultBodyJson', 'contentType', 'timeCreate', 'timeUpdate', 'isActive', 'userIdUpdate', 'srcKey']

//禁止欄位之哨兵值（前綴 SECRET-；回應全文不得出現）
let secretOver = {
    tokens: 'SECRET-TOKENS-PUBAPIS',
    authConfigJson: 'SECRET-AUTHCFG-PUBAPIS',
    testBaseUrl: 'http://SECRET-TESTBASE-PUBAPIS.example',
    authType: 'SECRET-AUTHTYPE-PUBAPIS',
    defaultHeadersJson: 'SECRET-DEFHDR-PUBAPIS',
    defaultQueryJson: 'SECRET-DEFQRY-PUBAPIS',
    defaultBodyJson: 'SECRET-DEFBODY-PUBAPIS',
    contentType: 'SECRET-CT-PUBAPIS',
    timeCreate: 'SECRET-TC-PUBAPIS',
    timeUpdate: 'SECRET-TU-PUBAPIS',
    userIdUpdate: 'SECRET-UID-PUBAPIS',
    srcKey: 'SECRET-SRCKEY-PUBAPIS',
}

//pa-1 之公開欄位值（種入庫與逐欄比對共用）
let PA1_PUBLIC = {
    order: 7,
    name: 'pa-1-name',
    description: 'pa-1-desc',
    url: 'http://pa/1',
    method: 'post',
    version: 'v2',
    levels: 'A.B',
    keywords: 'k1;k2',
    state: 'ok',
    creator: 'pa-creator',
    dataSource: 'pa-source',
    mdInputParams: 'pa-in-md',
    inputExample: 'pa-in-ex',
    mdOutputParams: 'pa-out-md',
    outputExample: 'pa-out-ex',
}

let seedRows = () => {
    let r3 = mkLegacyRow('pa-3', 'pubapis', { name: 'pa-3-inactive', isActive: 'n', tokens: 'SECRET-TOKENS-INACTIVE' })
    let r4 = mkLegacyRow('pa-4', 'pubapis', { name: 'pa-4-noactive', tokens: 'SECRET-TOKENS-NOACTIVE' })
    delete r4.isActive
    return [
        mkLegacyRow('pa-1', 'pubapis', { ...PA1_PUBLIC, ...secretOver }),
        mkLegacyRow('pa-2', 'pubapis', { name: 'pa-2-name', ...secretOver, tokens: 'SECRET-TOKENS-PA2' }),
        r3,
        r4,
        mkLegacyRow('pa-5', 'pubapis', { name: 'pa-5-emptyactive', isActive: '', tokens: 'SECRET-TOKENS-EMPTYACTIVE' }),
        mkLegacyRow('pa-6', 'pubapis', { name: 'pa-6-upper', isActive: 'Y', tokens: 'SECRET-TOKENS-UPPER' }),
    ]
}

let getList = async (token, base = S.base) => {
    let url = token === undefined ? `${base}/api/getApisList` : `${base}/api/getApisList?token=${encodeURIComponent(token)}`
    let res = await fetch(url)
    let raw = await res.text()
    let j = null
    try {
        j = JSON.parse(raw)
    }
    catch (e) {
        j = null
    }
    return { status: res.status, raw, state: j && j.state, msg: j && j.msg }
}


describe('api-publicApisList (一般使用者以 token 取得 API 清單：只含啟用中、只含公開欄位、無任何憑證)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        S = await startApiServer({ name: 'api-publicApisList', port: PORT })
    })

    after(async function() {
        this.timeout(30000)
        if (S) {
            await S.stop()
        }
    })

    beforeEach(async function() {
        this.timeout(30000)
        await S.wipe('apis')
        await S.seed(seedRows())
        await S.getOps(true)
        await S.getVerifyCalls(true)
    })


    describe('一般使用者與管理員皆可取得；內容相同（皆為公開視圖）', function() {

        for (let tok of ['tokNonAdmin', 'tokMutateAdmin', 'tokA', 'sys']) {
            it(`${tok}：state=success；只含啟用中（pa-1、pa-2；停用 n、缺欄、空字串、大寫 Y 者皆不含）；每列恰為公開欄位（依序）；回應全文無 SECRET-`, async function() {
                let r = await getList(tok)
                assert.strictEqual(r.status, 200)
                assert.strictEqual(r.state, 'success', r.raw.slice(0, 300))
                assert.deepStrictEqual(r.msg.map((x) => x.id).sort(), ['pa-1', 'pa-2'], '只含 isActive 嚴格為 y 者')
                for (let row of r.msg) {
                    assert.deepStrictEqual(Object.keys(row), PUBLIC_KEYS, `每列恰為公開欄位（實得 ${Object.keys(row).join(',')}）`)
                    for (let k of FORBIDDEN_KEYS) {
                        assert.ok(!(k in row), `不得含 ${k}`)
                    }
                }
                assert.ok(!r.raw.includes('SECRET-'), `回應全文不得含憑證／禁止欄位之值（實得 ${r.raw.slice(0, 400)}）`)
            })
        }

        it('公開欄位值取自庫內原值（pa-1 逐欄）；缺欄之公開欄位（pa-2 的 order 為空字串）以空字串補齊', async function() {
            let r = await getList('tokNonAdmin')
            let row = r.msg.find((x) => x.id === 'pa-1')
            assert.deepStrictEqual(row, { id: 'pa-1', group: 'pubapis', ...PA1_PUBLIC })
            let row2 = r.msg.find((x) => x.id === 'pa-2')
            assert.strictEqual(row2.order, '')
            assert.strictEqual(row2.name, 'pa-2-name')
        })

        it('唯讀：取清單只對 apis 表 select，零寫入；鉤子被呼叫一次且 from=getApisList', async function() {
            await S.getOps(true)
            await S.getVerifyCalls(true)
            await getList('tokNonAdmin')
            let ops = await S.getOps()
            assert.ok(ops.length >= 1 && ops.every((o) => o.tab === 'apis' && o.op === 'select'), `只應有 apis.select（實得 ${JSON.stringify(ops)}）`)
            assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: 'id-nonadmin', from: 'getApisList' }])
        })

        it('後台經 saveApi 新增後，公開清單即時反映新列，但 tokens 仍不出現（端到端）', async function() {
            let r1 = await callFun(S.base, 'tokA', 'saveApi', [{ name: 'pa-new', description: 'pa-new-desc', url: 'http://pa/new', method: 'get', levels: 'N', group: 'pubapis-local', tokens: 'SECRET-TOKENS-NEWROW', authConfigJson: 'SECRET-AUTHCFG-NEWROW' }])
            assert.strictEqual(r1.state, 'success', JSON.stringify(r1.msg))
            let r = await getList('tokNonAdmin')
            let row = r.msg.find((x) => x.name === 'pa-new')
            assert.ok(row, '新列應出現在公開清單')
            assert.strictEqual(row.description, 'pa-new-desc')
            assert.deepStrictEqual(Object.keys(row), PUBLIC_KEYS)
            assert.ok(!r.raw.includes('SECRET-'), '新列之憑證亦不出現')
        })

        it('後台修改既有列（有 id：改說明與權杖）後，公開清單反映新說明、舊值消失，tokens 仍不出現（外審 sol R7）', async function() {
            await S.seed([mkLegacyRow('pa-7', 'pubapis-local', { name: 'pa-7-name', description: 'pa-7-desc-old', srcKey: '', tokens: 'SECRET-TOKENS-OLD' })])
            let before = await getList('tokNonAdmin')
            assert.strictEqual(before.msg.find((x) => x.id === 'pa-7').description, 'pa-7-desc-old')
            let cur = (await callFun(S.base, 'tokA', 'getApisList', [])).msg.find((x) => x.id === 'pa-7')
            let r1 = await callFun(S.base, 'tokA', 'saveApi', [{ ...cur, description: 'pa-7-desc-new', tokens: 'SECRET-TOKENS-NEW' }])
            assert.strictEqual(r1.state, 'success', JSON.stringify(r1.msg))
            let r = await getList('tokNonAdmin')
            let row = r.msg.find((x) => x.id === 'pa-7')
            assert.strictEqual(row.description, 'pa-7-desc-new')
            assert.ok(!r.raw.includes('pa-7-desc-old') && !r.raw.includes('SECRET-'))
        })

        it('資料表為空 → state=success、msg 為空陣列', async function() {
            await S.wipe('apis')
            let r = await getList('tokNonAdmin')
            assert.strictEqual(r.state, 'success')
            assert.deepStrictEqual(r.msg, [])
        })

        it('一般使用者經資料通道取同名函數 getApisList（整列含憑證）→ permission denied；公開清單是其唯一入口', async function() {
            let r = await callFun(S.base, 'tokNonAdmin', 'getApisList', [])
            assert.ok(r.ok === false && r.data.error === 'permission denied')
            assert.ok(!JSON.stringify(r.data).includes('SECRET-'))
        })

    })


    describe('token 須通過完整驗證，否則被拒且不回清單', function() {

        let cases = [
            ['未帶 token', undefined, 'errTokenNoPermission', false],
            ['空字串 token', '', 'errTokenNoPermission', false],
            ['查無此 token', 'tok-not-exist-publicapis', 'errUserNotFound', false],
            ['使用者欄位不齊（tokNoEmail）', 'tokNoEmail', 'errUserEmailMissing', false],
            ['使用者欄位不合（tokBadRole：isAdmin 非 y／n）', 'tokBadRole', 'errUserRoleMissing', false],
            ['部署方鉤子拒絕（tokDenied，管理員）', 'tokDenied', 'errUserNoPermission', true],
            ['部署方鉤子拒絕（tokNonAdminDenied，一般使用者：部署方可再收緊）', 'tokNonAdminDenied', 'errUserNoPermission', true],
            ['部署方鉤子只在 main 放行（tokOnlyMain；from 為 getApisList 被拒）', 'tokOnlyMain', 'errUserNoPermission', true],
            ['部署方鉤子拋錯（tokVThrow）', 'tokVThrow', 'errUserNoPermission', true],
            ['部署方鉤子 reject（tokVReject）', 'tokVReject', 'errUserNoPermission', true],
            ['部署方鉤子回 undefined（tokVFalsy）', 'tokVFalsy', 'errUserNoPermission', true],
        ]
        for (let [name, tok, key, hooked] of cases) {
            it(`${name} → state=error、msg=${key}，不回任何列、不含憑證與鉤子拋出之內容，ORM 零操作`, async function() {
                await S.getVerifyCalls(true)
                await S.getOps(true)
                let r = await getList(tok)
                assert.strictEqual(r.state, 'error', r.raw.slice(0, 300))
                assert.strictEqual(r.msg, key)
                assert.ok(!r.raw.includes('SECRET-'), '回應不得含憑證或鉤子拋出之內容')
                assert.deepStrictEqual(await S.getOps(), [], '被拒時不得先讀資料（外審 sol R5）')
                let calls = await S.getVerifyCalls()
                assert.strictEqual(calls.length, hooked ? 1 : 0, hooked ? '通過認證者呼叫鉤子一次' : '未通過認證者不呼叫鉤子')
                if (hooked) {
                    assert.strictEqual(calls[0].from, 'getApisList')
                }
            })
        }

        //外審 sol R2：token 只認 query；來源衝突或型別錯誤不得借用其他來源
        it('只有 Authorization: Bearer 標頭（管理員）、無 query token → errTokenNoPermission（不從標頭補），鉤子與 ORM 零呼叫', async function() {
            await S.getVerifyCalls(true)
            await S.getOps(true)
            let res = await fetch(`${S.base}/api/getApisList`, { headers: { Authorization: 'Bearer sys' } })
            let j = await res.json()
            assert.deepStrictEqual({ state: j.state, msg: j.msg }, { state: 'error', msg: 'errTokenNoPermission' })
            assert.deepStrictEqual(await S.getVerifyCalls(), [])
            assert.deepStrictEqual(await S.getOps(), [])
        })

        it('標頭為管理員（Bearer sys）、query 為 tokNonAdminDenied → 以 query 為準：errUserNoPermission（不借用標頭之管理員身分）', async function() {
            let res = await fetch(`${S.base}/api/getApisList?token=tokNonAdminDenied`, { headers: { Authorization: 'Bearer sys' } })
            let j = await res.json()
            assert.deepStrictEqual({ state: j.state, msg: j.msg }, { state: 'error', msg: 'errUserNoPermission' })
        })

        it('query token 重複（?token=sys&token=sys，解析為陣列）→ errTokenNoPermission，不取其中任一值；鉤子與 ORM 零呼叫', async function() {
            await S.getVerifyCalls(true)
            await S.getOps(true)
            let res = await fetch(`${S.base}/api/getApisList?token=sys&token=sys`)
            let j = await res.json()
            assert.deepStrictEqual({ state: j.state, msg: j.msg }, { state: 'error', msg: 'errTokenNoPermission' })
            assert.deepStrictEqual(await S.getVerifyCalls(), [])
            assert.deepStrictEqual(await S.getOps(), [])
        })

        it('ORM 讀取失敗（注入 select 失敗一次）→ state=error、msg=getDataError，不回清單、不含原始錯誤；失敗後恢復可取（外審 sol R5）', async function() {
            await S.setFails({ select: 1 })
            let r = await getList('tokNonAdmin')
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'getDataError' })
            assert.ok(!r.raw.includes('INJECTED-FAIL') && !r.raw.includes('SECRET-'), `不得含原始錯誤：${r.raw}`)
            await S.setFails({})
            let r2 = await getList('tokNonAdmin')
            assert.strictEqual(r2.state, 'success')
            assert.deepStrictEqual(r2.msg.map((x) => x.id).sort(), ['pa-1', 'pa-2'])
        })

        it('鉤子改寫傳入物件不影響後續（tokMutateAdmin 取清單照常成功，回的仍是公開視圖）', async function() {
            let r = await getList('tokMutateAdmin')
            assert.strictEqual(r.state, 'success')
            assert.ok(!r.raw.includes('SECRET-'))
        })

        it('只接受 GET：POST /api/getApisList 不回清單（404）', async function() {
            let res = await fetch(`${S.base}/api/getApisList?token=sys`, { method: 'POST', body: '{}' })
            assert.strictEqual(res.status, 404)
            assert.ok(!(await res.text()).includes('pa-1'))
        })

    })


    describe('srLog：成功記 info（event api/getApisList、只含 userId），失敗記 error key；log 不含 token 與憑證', function() {

        let SL = null

        before(async function() {
            this.timeout(120000)
            SL = await startApiServer({ name: 'api-publicApisList-log', port: PORT_LOG }) //獨立子行程: log 只含本案自己的請求（外審 sol R6：免被先前案例之紀錄滿足）
            await SL.seed(seedRows())
        })

        after(async function() {
            this.timeout(30000)
            if (SL) {
                await SL.stop()
            }
        })

        it('一般使用者成功一次、無效 token 一次 → 各恰一筆（event api/getApisList）；欄位白名單；log 全文不含 token 值、使用者 email 與 SECRET-', async function() {
            await getList('tokNonAdmin', SL.base)
            await getList('tok-not-exist-publicapis', SL.base)
            let isEv = (l) => l.includes('"event":"api/getApisList"')
            let lines = await waitLogs(SL.cwd, (ls) => ls.filter(isEv).length >= 2)
            await new Promise((resolve) => setTimeout(resolve, 500)) //再等一下，確認沒有多餘紀錄
            lines = await waitLogs(SL.cwd, () => true)
            let evs = lines.filter(isEv).map((l) => JSON.parse(l))
            assert.strictEqual(evs.length, 2, `本案請求應恰產生 2 筆 api/getApisList 紀錄（實得 ${evs.length}）`)
            let ok = evs.filter((o) => o.level === 30)
            let err = evs.filter((o) => o.level === 50)
            assert.strictEqual(ok.length, 1)
            assert.strictEqual(err.length, 1)
            assert.strictEqual(ok[0].userId, 'id-nonadmin')
            assert.strictEqual(err[0].err, 'errUserNotFound')
            let allowedOk = ['level', 'time', 'pid', 'hostname', 'event', 'userId']
            let allowedErr = ['level', 'time', 'pid', 'hostname', 'event', 'err']
            assert.deepStrictEqual(Object.keys(ok[0]).filter((k) => !allowedOk.includes(k)), [], `成功紀錄含白名單外欄位：${JSON.stringify(ok[0])}`)
            assert.deepStrictEqual(Object.keys(err[0]).filter((k) => !allowedErr.includes(k)), [], `失敗紀錄含白名單外欄位：${JSON.stringify(err[0])}`)
            let text = lines.join('\n')
            for (let s of ['tokNonAdmin', 'tok-not-exist-publicapis', 'nonadmin@example.com', 'SECRET-']) {
                assert.ok(!text.includes(s), `srLog 不得含「${s}」`)
            }
        })

        it('ORM 讀取失敗 → 記 error（event api-getApisList-orm，err=getDataError）；回應不含原始錯誤（原文只入 log）', async function() {
            await SL.setFails({ select: 1 })
            let r = await getList('tokNonAdmin', SL.base)
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'getDataError' })
            await SL.setFails({})
            let isOrm = (l) => l.includes('"event":"api-getApisList-orm"')
            let lines = await waitLogs(SL.cwd, (ls) => ls.some(isOrm))
            let recs = lines.filter(isOrm).map((l) => JSON.parse(l))
            assert.strictEqual(recs.length, 1)
            assert.strictEqual(recs[0].err, 'getDataError')
            assert.ok(!r.raw.includes('INJECTED-FAIL'), '原始錯誤只入 log，不入回應')
        })

    })

})
