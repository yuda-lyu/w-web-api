//api-sysFuncs：系統函數收緊（任務 20261025161335，排程第 128 項 api-run01；R-SYSFUNCS-01）。
//依據（C:\opensrcOper\dspec\使用者身分驗證原則.md）：
//- 二.7 系統函數：只回公開資訊者（函數名稱清單）可公開；會回資料或改變狀態者須身分。w-serv-webdata 之 sysFuncsPublic 預設三者（[sys:getFuncList]、[sys:polling]、[sys:getTableTags]）公開（相容），
//  使用方須顯式設為只公開 [sys:getFuncList]（w-serv-hapi 1.1.8、w-serv-webdata 1.1.16、w-serv-broadcast 1.1.12）。
//- 二.8 框架改版之傳播：已發布之舊前端建置檔，其輪詢（[sys:polling]）之本體只有 { clientId }（不帶 __sysToken__ 鍵）；新前端元件之輪詢於本體帶 __sysToken__。
//  收緊後，不帶 token 之輪詢被拒（升版後舊前端建置檔須重新載入）；帶有效 token 者放行。
//本檔以真後端（隔離子行程：獨立 lmdb、埠 8574；部署方 getUserByToken／verifyClientUser 由 test/tools/apiServerChild.mjs 提供，對 tokMx* 呼叫者一律放行，故「被拒」只能出自套件自己的關卡）直打資料通道 /api/main，
//逐格斷言（呼叫者 7 類 × 協定 4 種 × 系統函數 3 個＝84 格）。EXPECT 為字面值，取自原則與本套件之存取規則（後台與資料通道限系統管理員、執行身分完整驗證），不由實作衍生：
//- 呼叫者：無 token（無 Authorization 標頭）、未知 token（反查查無）、U（使用者 token・一般使用者）、A（系統管理員）、AU綁一般使用者（應用系統 token・使用者用途）、AU綁管理員、AS（應用系統 token・系統服務用途）
//- 協定：新（本體帶 __sysToken__＝標頭同一 token）、缺鍵（本體不帶 __sysToken__ 鍵；**只有輪詢**是已發布之舊前端建置檔之真實形狀——舊元件輪詢為 { clientId }，其函數呼叫仍帶 __sysToken__，
//  對函數呼叫而言缺鍵是低階封包，外審 sol #8 以舊 bundle 核對）、空（__sysToken__ 為空字串）、他人（__sysToken__ 為未知 token）
//- 關卡順序：連線閘（標頭 token；一般使用者與無效者即 permission denied）→ 輪詢之身分關卡／執行身分（本體 token）。故：
//  標頭不通過連線閘者（無、未知、U、AU綁一般）→ 一律 permission denied；
//  標頭通過者（A、AU綁管理員、AS）＋新協定 → 三個系統函數皆放行；＋舊／空／他人 → 輪詢被拒（'[sys:polling] permission denied'）；
//  [sys:getFuncList] 與 [sys:getTableTags] 被拒：舊（本體不帶鍵）回 'invalid token'（w-serv-webdata 於 getUserIdByToken 之前），空／他人回 errUserIdMissing（getUserIdByToken fail-closed）。
//註：[sys:getFuncList] 雖列於 sysFuncsPublic（公開），本套件之資料通道一律先經連線閘與 getUserIdByToken（對空／無效 token fail-closed），故實際仍須有效身分（同 w-web-task 之先例）；
//修前（框架預設三者公開）與修後之差別只在「標頭有效、本體不帶 __sysToken__ 鍵」之輪詢（舊前端建置檔）：修前放行、修後被拒。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import get from 'lodash-es/get.js'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { startApiServer } from './tools/apiHarness.mjs'


let PORT = 8574
let S = null

//呼叫者 7 類：tok 為標頭 token（null＝不帶 Authorization 標頭）；gate 為「通過連線閘」（字面值：僅系統管理員等級〔A、AU綁管理員、AS〕通過）
let CALLERS = [
    { cls: '無 token', tok: null, gate: false },
    { cls: '未知 token', tok: 'tokMxUnknown', gate: false },
    { cls: 'U 使用者 token・一般使用者', tok: 'tokMxU', gate: false },
    { cls: 'A 使用者 token・系統管理員', tok: 'tokMxA', gate: true },
    { cls: 'AU 應用系統 token・使用者用途綁一般使用者', tok: 'tokMxAuU', gate: false },
    { cls: 'AU 應用系統 token・使用者用途綁管理員', tok: 'tokMxAuA', gate: true },
    { cls: 'AS 應用系統 token・系統服務用途', tok: 'tokMxAs', gate: true },
]

//協定 4 種：body(tok) 回本體之 token 欄位（舊協定不帶鍵）
//fnDenied：標頭通過連線閘而本體 token 不通過時，資料通道函數（[sys:getFuncList]、[sys:getTableTags]）之拒絕值（字面值）
let PROTOS = [
    { name: '新（本體帶同一 __sysToken__）', key: 'new', tokenField: (tok) => ({ __sysToken__: tok === null ? '' : tok }), validBody: true },
    { name: '缺鍵（本體不帶 __sysToken__ 鍵；輪詢即已發布之舊前端建置檔之形狀）', key: 'old', tokenField: () => ({}), validBody: false, fnDenied: 'invalid token' },
    { name: '空（__sysToken__ 為空字串）', key: 'empty', tokenField: () => ({ __sysToken__: '' }), validBody: false, fnDenied: 'errUserIdMissing' },
    { name: '他人（__sysToken__ 為未知 token）', key: 'other', tokenField: () => ({ __sysToken__: 'tokMxUnknown' }), validBody: false, fnDenied: 'errUserIdMissing' },
]

//系統函數 3 個（原則二.7）
let FUNCS = ['[sys:getFuncList]', '[sys:getTableTags]', '[sys:polling]']

let seq = 0

//post：直打資料通道；tok 為 null 時不帶 Authorization；輪詢之本體為 { clientId, ...token }，其餘為 { __sysInputArgs__: [], ...token }（同 w-serv-webdata／w-serv-broadcast 之協定）
async function post(tok, func, tokenField, clientId = null) {
    let headers = { 'Content-Type': 'application/octet-stream' }
    if (tok !== null) {
        headers['Authorization'] = `Bearer ${tok}`
    }
    let input = func === '[sys:polling]' ? { clientId: clientId === null ? `c-sf-${++seq}` : clientId, ...tokenField } : { __sysInputArgs__: [], ...tokenField }
    let res = await fetch(`${S.base}/api/main`, { method: 'POST', headers, body: Buffer.from(obj2u8arr({ func, input })) })
    let u8a = new Uint8Array(await res.arrayBuffer())
    let data = u8arr2obj(u8a)
    return {
        raw: Buffer.from(u8a).toString('utf8'),
        data,
        err: get(data, 'error', null), //通訊層錯誤（連線閘 permission denied；輪詢身分關卡 [sys:polling] permission denied）
        state: get(data, 'success.output.state', ''), //資料通道函數之結果
        msg: get(data, 'success.output.msg', null),
        out: get(data, 'success.output', null), //輪詢成功時為其佇列（陣列）
    }
}

//postRaw：直打資料通道，input 原樣（供輸入形狀案）；回形狀同 post
async function postRaw(tok, func, input) {
    let headers = { 'Content-Type': 'application/octet-stream' }
    if (tok !== null) {
        headers['Authorization'] = `Bearer ${tok}`
    }
    let res = await fetch(`${S.base}/api/main`, { method: 'POST', headers, body: Buffer.from(obj2u8arr({ func, input })) })
    let u8a = new Uint8Array(await res.arrayBuffer())
    let data = u8arr2obj(u8a)
    return { raw: Buffer.from(u8a).toString('utf8'), data, err: get(data, 'error', null), state: get(data, 'success.output.state', ''), msg: get(data, 'success.output.msg', null), out: get(data, 'success.output', null) }
}

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

//outcome：把回應歸類為 'gate'（連線閘拒）、'ok'（放行）、'poll-denied'（輪詢之身分關卡拒）、`fn-denied:<拒絕值>`（資料通道函數之拒絕）、'unexpected'
function outcome(func, r) {
    if (r.err === 'permission denied') {
        return 'gate'
    }
    if (func === '[sys:polling]') {
        if (Array.isArray(r.out)) {
            return 'ok'
        }
        if (typeof r.err === 'string' && r.err === '[sys:polling] permission denied') {
            return 'poll-denied'
        }
        return 'unexpected'
    }
    if (r.state === 'success') {
        return 'ok'
    }
    if (r.state === 'error' && typeof r.msg === 'string') {
        return `fn-denied:${r.msg}`
    }
    return 'unexpected'
}

//expect：字面值規則（不由實作衍生）：標頭不通過連線閘 → gate；通過 + 新協定 → ok；通過 + 其他協定 → 輪詢 poll-denied、函數 fn-denied:<proto.fnDenied>
function expectOf(caller, proto, func) {
    if (!caller.gate) {
        return 'gate'
    }
    if (proto.validBody) {
        return 'ok'
    }
    return func === '[sys:polling]' ? 'poll-denied' : `fn-denied:${proto.fnDenied}`
}


describe('api-sysFuncs (系統函數收緊: sysFuncsPublic 只公開 [sys:getFuncList]; 輪詢須帶 token)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        S = await startApiServer({ name: 'sysfuncs', port: PORT })
    })

    after(async function() {
        if (S) {
            await S.stop()
        }
    })

    describe('矩陣：呼叫者 7 類 × 協定 4 種 × 系統函數 3 個', function() {
        for (let caller of CALLERS) {
            for (let proto of PROTOS) {
                for (let func of FUNCS) {
                    it(`${caller.cls} × ${proto.name} × ${func}`, async function() {
                        await S.getOps(true)
                        let r = await post(caller.tok, func, proto.tokenField(caller.tok))
                        let exp = expectOf(caller, proto, func)
                        assert.strictEqual(outcome(func, r), exp, `預期 ${exp}（實得 ${r.raw.slice(0, 200)}）`)

                        //被拒者：ORM 零操作、回應不含 token
                        if (exp !== 'ok') {
                            assert.deepStrictEqual(await S.getOps(), [], '被拒者 ORM 應零操作')
                            if (caller.tok !== null) {
                                assert.ok(!r.raw.includes(caller.tok), '回應不得含 token')
                            }
                        }

                        //放行者：結果內容（原則二.7：getFuncList 只回函數名稱；getTableTags 回同步表時間戳；輪詢回其佇列〔新建立之 clientId 為空陣列〕）
                        if (exp === 'ok') {
                            if (func === '[sys:getFuncList]') {
                                assert.ok(Array.isArray(r.msg) && r.msg.includes('saveApi') && r.msg.includes('getWebInfor'), `函數名稱清單（實得 ${r.raw.slice(0, 200)}）`)
                                assert.ok(!r.msg.includes('[sys:getTableTags]'), '內部同步用系統函數不列入清單')
                            }
                            else if (func === '[sys:getTableTags]') {
                                assert.strictEqual(r.state, 'success')
                                assert.ok(r.msg && r.msg.mode === 'syncKpTable' && r.msg.data && typeof r.msg.data.apis === 'string' && r.msg.data.apis !== '', `同步表時間戳應為 { mode: 'syncKpTable', data: { apis: <非空標記> } }（實得 ${r.raw.slice(0, 200)}）`) //外審 sol #7: 不只驗成功狀態
                            }
                            else {
                                assert.deepStrictEqual(r.out, [], '新建立之 clientId 之佇列應為空陣列')
                            }
                        }
                    })
                }
            }
        }
    })

    describe('輪詢（[sys:polling]）：舊前端建置檔之輪詢（本體只有 { clientId }）被拒；新前端元件之輪詢（帶有效 __sysToken__）放行', function() {
        it('標頭為有效系統管理員等級者（A、AU綁管理員、AS），本體只有 { clientId }（不帶 __sysToken__ 鍵）→ 被拒 "[sys:polling] permission denied"，回應不含佇列', async function() {
            for (let tok of ['tokMxA', 'tokMxAuA', 'tokMxAs']) {
                let r = await post(tok, '[sys:polling]', {}, `c-sf-old-${tok}`)
                assert.strictEqual(r.err, '[sys:polling] permission denied', `${tok}（實得 ${r.raw.slice(0, 200)}）`)
                assert.strictEqual(r.out, null, `${tok}：不得有輪詢結果`)
            }
        })

        it('被拒之輪詢不建立 clientId 綁定：舊協定輪詢被拒後，同一 clientId 以新協定（有效 token）輪詢仍放行；其後他人身分重用該 clientId 被拒', async function() {
            let cid = 'c-sf-bind-1'
            let r1 = await post('tokMxA', '[sys:polling]', {}, cid)
            assert.strictEqual(r1.err, '[sys:polling] permission denied', `舊協定被拒（實得 ${r1.raw.slice(0, 200)}）`)
            let r2 = await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxA' }, cid)
            assert.deepStrictEqual(r2.out, [], `新協定放行（實得 ${r2.raw.slice(0, 200)}）`)
            let r3 = await post('tokMxAs', '[sys:polling]', { __sysToken__: 'tokMxAs' }, cid)
            assert.strictEqual(r3.err, '[sys:polling] permission denied', `他人身分重用同一 clientId 應被拒（實得 ${r3.raw.slice(0, 200)}）`)
            let r4 = await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxA' }, cid)
            assert.deepStrictEqual(r4.out, [], `原身分續輪詢仍放行（實得 ${r4.raw.slice(0, 200)}）`)
        })

        it('帶有效 token 之輪詢：A、AU綁管理員、AS 皆放行（新前端元件之輪詢形狀），身分各自與 clientId 綁定', async function() {
            for (let tok of ['tokMxA', 'tokMxAuA', 'tokMxAs']) {
                let cid = `c-sf-new-${tok}`
                for (let i = 0; i < 2; i++) {
                    let r = await post(tok, '[sys:polling]', { __sysToken__: tok }, cid)
                    assert.deepStrictEqual(r.out, [], `${tok} 第 ${i + 1} 次（實得 ${r.raw.slice(0, 200)}）`)
                }
            }
        })

        it('標頭有效、本體 token 為不能通過執行身分驗證者（未知、一般使用者、鉤子拒絕者）→ 輪詢被拒（帶 token 鍵者一律反查，含公開設定下）', async function() {
            for (let bodyTok of ['tokMxUnknown', 'tokMxU', 'tokMxAuU', 'tokMxDenied', '']) {
                let r = await post('tokMxA', '[sys:polling]', { __sysToken__: bodyTok }, `c-sf-body-${bodyTok || 'empty'}`)
                assert.strictEqual(r.err, '[sys:polling] permission denied', `本體 ${bodyTok || '(空)'}（實得 ${r.raw.slice(0, 200)}）`)
            }
        })
    })

    describe('輪詢身分綁定：標頭與本體分軸；綁的是 userId 而非 token（外審 sol #1、#2）', function() {
        it('標頭 A、本體 AS（兩者皆有效而不同）→ 輪詢放行並綁定「本體」身分（AS）；其後標頭 AS、本體 AS 同一 clientId 放行；標頭 A、本體 A 同一 clientId 被拒', async function() {
            let cid = 'c-sf-axis-1'
            let r1 = await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxAs' }, cid)
            assert.deepStrictEqual(r1.out, [], `標頭 A／本體 AS（實得 ${r1.raw.slice(0, 200)}）`)
            let r2 = await post('tokMxAs', '[sys:polling]', { __sysToken__: 'tokMxAs' }, cid)
            assert.deepStrictEqual(r2.out, [], `只換標頭（本體身分不變）不因歸屬而拒絕（實得 ${r2.raw.slice(0, 200)}）`)
            let r3 = await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxA' }, cid)
            assert.strictEqual(r3.err, '[sys:polling] permission denied', `本體換成另一人（標頭不變）應因歸屬而被拒（實得 ${r3.raw.slice(0, 200)}）`)
        })

        it('同一使用者（id 相同）之另一把 token 作本體 → 同一 clientId 放行（綁定單位為 userId，非 token）；另一位使用者（AU 綁管理員）仍被拒', async function() {
            let cid = 'c-sf-axis-2'
            let r1 = await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxA' }, cid)
            assert.deepStrictEqual(r1.out, [], r1.raw.slice(0, 200))
            let r2 = await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxASame' }, cid)
            assert.deepStrictEqual(r2.out, [], `同 userId 之另一把 token（實得 ${r2.raw.slice(0, 200)}）`)
            let r3 = await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxAuA' }, cid)
            assert.strictEqual(r3.err, '[sys:polling] permission denied', `不同 userId（實得 ${r3.raw.slice(0, 200)}）`)
        })

        it('標頭被拒（一般使用者）而本體為有效管理員 token → 連線閘即拒（permission denied），不進輪詢身分關卡', async function() {
            let r = await post('tokMxU', '[sys:polling]', { __sysToken__: 'tokMxA' }, 'c-sf-axis-3')
            assert.strictEqual(r.err, 'permission denied', r.raw.slice(0, 200))
        })
    })

    describe('本體 __sysToken__ 之型別軸（序列化後仍帶鍵、值不是有效 token 字串）→ 輪詢與函數皆被拒（外審 sol #5）', function() {
        for (let [label, v] of [['null', null], ['false', false], ['true', true], ['0', 0], ['空陣列', []], ['空物件', {}], ['物件', { a: 1 }]]) {
            it(`標頭有效（A），__sysToken__＝${label}`, async function() {
                let rp = await post('tokMxA', '[sys:polling]', { __sysToken__: v }, `c-sf-type-${label}`)
                assert.strictEqual(rp.err, '[sys:polling] permission denied', `輪詢（實得 ${rp.raw.slice(0, 200)}）`)
                for (let func of ['[sys:getFuncList]', '[sys:getTableTags]']) {
                    let r = await post('tokMxA', func, { __sysToken__: v })
                    assert.strictEqual(outcome(func, r), 'fn-denied:errUserIdMissing', `${func}（實得 ${r.raw.slice(0, 200)}）`)
                }
            })
        }
    })

    describe('輪詢輸入形狀：clientId 不合法者在身分關卡前即被輪詢層拒絕，不進反查（外審 sol #6）', function() {
        for (let [label, cid] of [['缺', undefined], ['空字串', ''], ['數字', 123], ['陣列', []], ['物件', {}]]) {
            it(`標頭與本體 token 皆有效（A），clientId＝${label} → 被拒且無輪詢結果`, async function() {
                await S.getVerifyCalls(true)
                let input = { ...(cid === undefined ? {} : { clientId: cid }), __sysToken__: 'tokMxA' }
                let r = await postRaw('tokMxA', '[sys:polling]', input)
                assert.strictEqual(r.out, null, `不得有輪詢結果（實得 ${r.raw.slice(0, 200)}）`)
                assert.ok(String(r.err || r.raw).includes('[sys:polling]'), `應為輪詢層之錯誤（實得 ${r.raw.slice(0, 200)}）`)
                assert.strictEqual((await S.getVerifyCalls()).length, 1, '只經連線閘一次，不反查本體 token')
            })
        }
    })

    describe('輪詢佇列：被拒之輪詢不取走、不影響合法身分之佇列（外審 sol #7）', function() {
        it('A 以兩個 clientId（X、Y）登記後表變更產生推播；X 上缺鍵／無效／他人身分之輪詢皆被拒；其後 A 仍自 X 取得原推播（非空、每則有 mode）', async function() {
            this.timeout(60000)
            let x = 'c-sf-queue-x'
            let y = 'c-sf-queue-y'
            assert.deepStrictEqual((await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxA' }, x)).out, [])
            assert.deepStrictEqual((await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxA' }, y)).out, [])
            let rs = await S.fun('tokMxA', 'saveApi', [{ name: 'sf-queue', url: 'http://t/sf-queue', method: 'get', levels: 'T', group: 'sf-queue' }])
            assert.strictEqual(rs.ok, true, `saveApi（實得 ${JSON.stringify(rs.msg).slice(0, 200)}）`)

            //以 Y 觀察推播已進佇列（X、Y 為同一次廣播；Y 取走自己的，不影響 X）
            let gotY = []
            for (let i = 0; i < 40 && gotY.length === 0; i++) {
                let r = await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxA' }, y)
                gotY = Array.isArray(r.out) ? r.out : []
                if (gotY.length === 0) {
                    await sleep(250)
                }
            }
            assert.ok(gotY.length >= 1, '表變更後應有推播（Y）')

            //X 上之被拒輪詢：缺鍵、本體為一般使用者、未知、另一位有效身分（歸屬不符）
            for (let [label, f] of [['缺鍵', {}], ['一般使用者', { __sysToken__: 'tokMxU' }], ['未知', { __sysToken__: 'tokMxUnknown' }], ['另一位有效身分（AS）', { __sysToken__: 'tokMxAs' }]]) {
                let r = await post('tokMxA', '[sys:polling]', f, x)
                assert.strictEqual(r.err, '[sys:polling] permission denied', `${label}（實得 ${r.raw.slice(0, 200)}）`)
                assert.strictEqual(r.out, null, `${label}：不得取得佇列`)
            }

            //原身分仍取得原推播（未被被拒之輪詢取走或清空）
            let rx = await post('tokMxA', '[sys:polling]', { __sysToken__: 'tokMxA' }, x)
            assert.ok(Array.isArray(rx.out) && rx.out.length >= 1 && rx.out.every((m) => m && typeof m.mode === 'string'), `X 之推播應保留（實得 ${rx.raw.slice(0, 300)}）`)
        })
    })

    describe('設定盤點（靜態）：sysFuncsPublic 恰為 [\'[sys:getFuncList]\']', function() {
        //原則二.7：只回公開資訊者（函數名稱清單）可公開。本套件之資料通道先經連線閘與 getUserIdByToken（fail-closed），函數呼叫路徑不可能以空身分到達「公開與否」之判斷，
        //故多公開 [sys:getTableTags]、或連 [sys:getFuncList] 都不公開，皆無法由請求行為觀察（上方矩陣抓不到）；設定值本身以此案釘住。被測後端可由 API_SERVER_MODULE 指向副本（變異測試）
        it('server/WWebApi.mjs 恰有一處 sysFuncsPublic 設定，其值恰為 [\'[sys:getFuncList]\']（不採框架預設三者皆公開）', function() {
            let fp = process.env.API_SERVER_MODULE ? path.resolve(process.env.API_SERVER_MODULE) : path.resolve('./server/WWebApi.mjs')
            let src = fs.readFileSync(fp, 'utf8')
            let ms = [...src.matchAll(/^[ \t]*sysFuncsPublic[ \t]*:[ \t]*(\[.*\])[ \t]*,?[ \t]*\r?$/gm)] //該行不另附行尾註解(值內含 ] 字元, 故以貪婪比對至行尾)
            assert.strictEqual(ms.length, 1, `應恰有一處 sysFuncsPublic 設定（實得 ${ms.length}）`)
            assert.deepStrictEqual(JSON.parse(ms[0][1].replace(/'/g, '"')), ['[sys:getFuncList]'])
        })
    })

    describe('函數呼叫（[sys:getFuncList]、[sys:getTableTags]）：身分由連線閘與執行身分把關，不因 sysFuncsPublic 之公開設定而匿名可通', function() {
        it('[sys:getFuncList]：標頭有效、本體不帶 token 鍵 → invalid token；本體空 token → errUserIdMissing（getUserIdByToken fail-closed）；本體為有效 token → 放行', async function() {
            let r1 = await post('tokMxA', '[sys:getFuncList]', {})
            assert.strictEqual(outcome('[sys:getFuncList]', r1), 'fn-denied:invalid token', r1.raw.slice(0, 200))
            let r2 = await post('tokMxA', '[sys:getFuncList]', { __sysToken__: '' })
            assert.strictEqual(outcome('[sys:getFuncList]', r2), 'fn-denied:errUserIdMissing', r2.raw.slice(0, 200))
            let r3 = await post('tokMxA', '[sys:getFuncList]', { __sysToken__: 'tokMxA' })
            assert.strictEqual(outcome('[sys:getFuncList]', r3), 'ok', r3.raw.slice(0, 200))
        })

        it('[sys:getTableTags]：標頭有效、本體不帶 token 鍵 → invalid token；空 token、一般使用者之本體 token → errUserIdMissing；管理員之本體 token → 放行', async function() {
            let r1 = await post('tokMxA', '[sys:getTableTags]', {})
            assert.strictEqual(outcome('[sys:getTableTags]', r1), 'fn-denied:invalid token', r1.raw.slice(0, 200))
            let r2 = await post('tokMxA', '[sys:getTableTags]', { __sysToken__: '' })
            assert.strictEqual(outcome('[sys:getTableTags]', r2), 'fn-denied:errUserIdMissing', r2.raw.slice(0, 200))
            let r3 = await post('tokMxA', '[sys:getTableTags]', { __sysToken__: 'tokMxU' })
            assert.strictEqual(outcome('[sys:getTableTags]', r3), 'fn-denied:errUserIdMissing', r3.raw.slice(0, 200))
            let r4 = await post('tokMxA', '[sys:getTableTags]', { __sysToken__: 'tokMxA' })
            assert.strictEqual(outcome('[sys:getTableTags]', r4), 'ok', r4.raw.slice(0, 200))
        })
    })
})
