//api-tokenLeak：注入函數上游失敗時之權杖外洩（w-web-sso tmp/sso-token-leak-全盤.md 表 B api 列、W 契約、S7–S9；ADR-033）。
//直打 127.0.0.1 後端（慣例同 api-http），以 srv.mjs 之測試權杖（NODE_ENV!=='production' 才有效）重現兩種上游失敗：
//- TOK_REJECT '{token-for-reject}'：getUserByToken 以舊版 w-web-sso helper 形狀之字串 reject（字串內夾完整網址、合成之介接權杖與所送權杖）
//- TOK_VTHROW '{token-for-verify-throw}'：getUserByToken 回合法管理員，verifyClientUser／verifyAppUser 對其 throw Error(合成秘密)
//斷言通道：C1 HTTP 回應（自家 procLang key、不含合成秘密）與 C2 本次後端之 srLog 檔（不含合成秘密；W 契約之 warn 與呼叫點之 error 如數）。
//「本次 srLog」：以 genTempSettings({ logFd }) 把後端 log 指到本檔專用資料夾後重啟，測完還原 ./settings.json 並刪除該資料夾。
//C3／C4（後端 stdout 與 error 事件）不在本檔：harness 以 stdio:'ignore' 起後端，另由使用者視角驗收與 V3 探測驗證。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import get from 'lodash-es/get.js'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import procLang from '../server/procLang.mjs'
import { startServersOnce, restartBackend, genTempSettings, baseUrl, resetToBaseSeed, woItems } from './tools/e2e-setup.mjs'


let TOK_REJECT = '{token-for-reject}'
let TOK_VTHROW = '{token-for-verify-throw}'
let TOK_UNKNOWN = 'unknown-token-api-tokenLeak' //SSO 未設定 → srv.mjs 之 getUserByToken 回 {}（查無）
let SYS_SECRET = 'SYNTH-SYS-SECRET-FOR-TEST' //TOK_REJECT 之 reject 字串內夾之合成介接權杖（srv.mjs）
let VERIFY_SECRET = 'SYNTH-VERIFY-SECRET-FOR-TEST' //verify 系 throw 之合成秘密（srv.mjs）
let REFERER_SECRET = 'SYNTH-API-REFERER-TOKEN' //E5 之 Referer 查詢權杖（api 之 verifyConn 不記 referer，守其不回歸）
let ARR_SECRETS = ['SYNTH-API-ARRAY-TOKEN-1', 'SYNTH-API-ARRAY-TOKEN-2'] //E7 重複 token 參數（Hapi 解析為陣列）
let SECRETS = [SYS_SECRET, TOK_REJECT, encodeURIComponent(TOK_REJECT), VERIFY_SECRET, REFERER_SECRET, ...ARR_SECRETS]
let LOG_FD = './test/_tmp/_logs-api-tokenLeak' //本檔專用 srLog 資料夾（落 test/_tmp，測完即刪）
let GROUP_E6 = 'api-tokenLeak-e6' //E6 以 saveApi 驗「不執行」：執行即寫入此群組
let kpLang = procLang({})


function assertNoSecret(label, text) {
    for (let s of SECRETS) {
        assert.ok(!text.includes(s), `${label}不得含「${s}」（實得 ${text.slice(0, 300)}）`)
    }
}

//HTTP 路由之回應：{ state:'error', msg:<自家 procLang key（eng＋cht 皆有文字）> }
function assertErrKey(label, text, key) {
    let r = JSON.parse(text)
    assert.strictEqual(r.state, 'error', `${label}應 error（實得 ${text.slice(0, 300)}）`)
    assert.strictEqual(r.msg, key, `${label}應回 ${key}（實得 ${JSON.stringify(r.msg).slice(0, 300)}）`)
    assert.ok(typeof kpLang.eng[key] === 'string' && typeof kpLang.cht[key] === 'string', `${key} 須為自家 procLang 之 key（eng＋cht）`)
}

async function getText(url, opts) {
    let res = await fetch(url, opts)
    return await res.text()
}

//資料通道（w-converhp /api/main）：本體與回應皆為 obj2u8arr 編碼
async function postMain(authToken, payload, headers = {}) {
    let res = await fetch(`${baseUrl}/api/main`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/octet-stream', ...headers },
        body: Buffer.from(obj2u8arr(payload)),
    })
    let u8a = new Uint8Array(await res.arrayBuffer())
    return { raw: Buffer.from(u8a).toString('utf8'), data: u8arr2obj(u8a) }
}

async function countGroup(g) {
    let rs = await woItems.apis.select({})
    return rs.filter((r) => r.group === g).length
}

//讀本次 srLog（pino JSON 行）；pino 經 worker 非同步落檔，輪詢至 E7（最後一組請求）之紀錄落檔，確保之前各筆皆已寫出
function readLogLines() {
    if (!fs.existsSync(LOG_FD)) {
        return []
    }
    let lines = []
    for (let fn of fs.readdirSync(LOG_FD)) {
        for (let l of fs.readFileSync(path.join(LOG_FD, fn), 'utf8').split(/\r?\n/)) {
            if (l.trim() !== '') {
                lines.push(l)
            }
        }
    }
    return lines
}
async function waitLogFlushed() {
    let t0 = Date.now()
    for (;;) {
        let lines = readLogLines()
        let nSync = lines.filter((l) => l.includes('"event":"api/syncAndReplaceTabs"')).length
        if (nSync >= 3 || Date.now() - t0 > 15000) {
            return lines
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
    }
}


describe('api-tokenLeak (注入函數上游失敗之權杖外洩：C1 回應／C2 srLog)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(180000)
        await startServersOnce() //build dist + 起後端（與 api-http／e2e 共用，只起一次）
        fs.rmSync(LOG_FD, { recursive: true, force: true }) //「本次」srLog：清掉前次殘留
        await restartBackend(genTempSettings({ logFd: LOG_FD }))
        await resetToBaseSeed()
    })

    after(async function() {
        this.timeout(60000)
        await restartBackend('./settings.json') //還原預設設定（logFd 回 ./logs），同 e2e-init／e2e-stainfor
        await resetToBaseSeed() //清掉 E6 若被執行而寫入之列
        try {
            fs.rmSync(LOG_FD, { recursive: true, force: true })
        }
        catch (err) {}
    })

    //E1：注入 getUserByToken reject（上游失敗）→ 視同查無：errUserNotFound（S7，與 getAndVerifyAppUser 同一 key）
    it('E1 GET /api/getUserByToken，TOK_REJECT → errUserNotFound、回應不含合成秘密', async function() {
        let text = await getText(`${baseUrl}/api/getUserByToken?token=${encodeURIComponent(TOK_REJECT)}`)
        assertNoSecret('E1 回應', text)
        assertErrKey('E1 ', text, 'errUserNotFound')
    })

    //E1：注入 verifyClientUser throw → 視同無權限：errUserNoPermission
    it('E1 GET /api/getUserByToken，TOK_VTHROW（verifyClientUser 拋錯）→ errUserNoPermission、回應不含合成秘密', async function() {
        let text = await getText(`${baseUrl}/api/getUserByToken?token=${encodeURIComponent(TOK_VTHROW)}`)
        assertNoSecret('E1 回應', text)
        assertErrKey('E1 ', text, 'errUserNoPermission')
    })

    //E4：注入 getUserByToken reject → errUserNotFound；DB 寫入前即拒
    it('E4 POST /syncAndReplaceTabs，TOK_REJECT → errUserNotFound、回應不含合成秘密', async function() {
        let text = await getText(`${baseUrl}/syncAndReplaceTabs?token=${encodeURIComponent(TOK_REJECT)}&keyTable=apis`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ group: 'api-tokenLeak-e4', rows: [{ name: 'n', url: 'http://x/y' }] }),
        })
        assertNoSecret('E4 回應', text)
        assertErrKey('E4 ', text, 'errUserNotFound')
    })

    //E4：注入 verifyAppUser throw → errUserNoPermission（三個注入函數一體套用，S5）
    it('E4 POST /syncAndReplaceTabs，TOK_VTHROW（verifyAppUser 拋錯）→ errUserNoPermission、回應不含合成秘密', async function() {
        let text = await getText(`${baseUrl}/syncAndReplaceTabs?token=${encodeURIComponent(TOK_VTHROW)}&keyTable=apis`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ group: 'api-tokenLeak-e4', rows: [{ name: 'n', url: 'http://x/y' }] }),
        })
        assertNoSecret('E4 回應', text)
        assertErrKey('E4 ', text, 'errUserNoPermission')
        assert.strictEqual(await countGroup('api-tokenLeak-e4'), 0, 'E4 失敗不得寫入')
    })

    //E5：資料通道 verifyConn，Authorization 為 TOK_REJECT（並帶含權杖之 Referer）→ permission denied
    it('E5 POST /api/main，Authorization TOK_REJECT（Referer 帶權杖）→ permission denied、回應不含合成秘密', async function() {
        let r = await postMain(TOK_REJECT, { func: 'getWebInfor', input: { __sysInputArgs__: [], __sysToken__: TOK_REJECT } }, {
            'Referer': `${baseUrl}/?view=x&token=${REFERER_SECRET}`,
        })
        assertNoSecret('E5 回應', r.raw)
        assert.deepStrictEqual(r.data, { error: 'permission denied' })
    })

    //E6：資料通道 Authorization 有效（sys）而本體 __sysToken__ 為 TOK_REJECT → getUserIdByToken 失敗即不執行（fail-closed，S9）。
    //註：修正前此條即綠——舊碼之 reject 以例外中斷 execFun（偶然 fail-closed，原文只經 error 事件落 stdout）；本條守「包裝後不得退化為 fail-open」。
    it('E6 POST /api/main，__sysToken__ TOK_REJECT → 不執行函數（fail-closed）、回應不含合成秘密', async function() {
        let n0 = await countGroup(GROUP_E6)
        let r = await postMain('sys', { func: 'saveApi', input: { __sysInputArgs__: [{ name: 'e6-reject', url: 'http://x/e6', group: GROUP_E6, levels: 'API', method: 'get' }], __sysToken__: TOK_REJECT } })
        assertNoSecret('E6 回應', r.raw)
        assert.strictEqual(get(r, 'data.success.output.state'), 'error', `E6 不得執行（實得 ${r.raw.slice(0, 300)}）`)
        assert.strictEqual(await countGroup(GROUP_E6), n0, 'E6 不得寫入')
    })

    //E6：__sysToken__ 查無使用者（getUserByToken 回 {}）→ 修正前 userId='' 仍執行（fail-open，本條修正前紅）；修正後 errUserIdMissing 不執行
    it('E6 POST /api/main，__sysToken__ 查無使用者 → 不執行函數（fail-closed）', async function() {
        let n0 = await countGroup(GROUP_E6)
        let r = await postMain('sys', { func: 'saveApi', input: { __sysInputArgs__: [{ name: 'e6-unknown', url: 'http://x/e6', group: GROUP_E6, levels: 'API', method: 'get' }], __sysToken__: TOK_UNKNOWN } })
        assert.strictEqual(get(r, 'data.success.output.state'), 'error', `E6 查無使用者不得執行（實得 ${r.raw.slice(0, 300)}）`)
        assert.strictEqual(await countGroup(GROUP_E6), n0, 'E6 查無使用者不得寫入')
    })

    //E7：重複 token 參數（陣列）→ 同步檢測即拒（errTokenNoPermission）。註：修正前即綠（探測 result-before.json api E7 不外洩），屬回歸守護
    it('E7 重複 token 參數（陣列）打 E1／E4 → errTokenNoPermission、回應不含合成秘密', async function() {
        let q = `token=${ARR_SECRETS[0]}&token=${ARR_SECRETS[1]}`
        let t1 = await getText(`${baseUrl}/api/getUserByToken?${q}`)
        assertNoSecret('E7(E1) 回應', t1)
        assertErrKey('E7(E1) ', t1, 'errTokenNoPermission')
        let t4 = await getText(`${baseUrl}/syncAndReplaceTabs?${q}&keyTable=apis`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"group":"g","rows":[{}]}' })
        assertNoSecret('E7(E4) 回應', t4)
        assertErrKey('E7(E4) ', t4, 'errTokenNoPermission')
    })

    //C2：本次 srLog 不含任何合成秘密；W 契約之 warn（因）與呼叫點之 error（果）如數（每次上游失敗 2 筆：warn＋error）
    it('srLog：不含合成秘密；inject-*-fail 為 warn、只記型別與名稱；呼叫點 error 記自家 key', async function() {
        let lines = await waitLogFlushed()
        assert.ok(lines.length > 0, `本次 srLog 應有紀錄（${LOG_FD}）`)
        assertNoSecret('srLog ', lines.join('\n'))

        let recs = lines.map((l) => JSON.parse(l))
        let pick = (event) => recs.filter((o) => o.event === event)
        let brief = (os) => os.map((o) => ({ level: o.level, upstream: o.upstream, upstreamType: o.upstreamType, upstreamName: o.upstreamName, err: o.err }))

        //因：包裝處 warn（level 40），非白名單只記 upstreamType／upstreamName
        let wUser = { level: 40, upstream: undefined, upstreamType: 'string', upstreamName: '', err: undefined }
        let wVerify = { level: 40, upstream: undefined, upstreamType: 'error', upstreamName: 'Error', err: undefined }
        assert.deepStrictEqual(brief(pick('inject-getUserByToken-fail')), [wUser, wUser, wUser, wUser], 'E1／E4／E5／E6 之 TOK_REJECT 各 1 筆')
        assert.deepStrictEqual(brief(pick('inject-verifyClientUser-fail')), [wVerify], 'E1 之 TOK_VTHROW 1 筆')
        assert.deepStrictEqual(brief(pick('inject-verifyAppUser-fail')), [wVerify], 'E4 之 TOK_VTHROW 1 筆')

        //果：呼叫點 error（level 50）記自家 key
        let e = (err) => ({ level: 50, upstream: undefined, upstreamType: undefined, upstreamName: undefined, err })
        assert.deepStrictEqual(brief(pick('api/getUserByToken')), [e('errUserNotFound'), e('errUserNoPermission'), e('errTokenNoPermission')])
        assert.deepStrictEqual(brief(pick('api/syncAndReplaceTabs')), [e('errUserNotFound'), e('errUserNoPermission'), e('errTokenNoPermission')])
        assert.deepStrictEqual(brief(pick('verifyConn').filter((o) => o.level === 50)), [e('errUserNotFound')])
        assert.deepStrictEqual(brief(pick('getUserIdByToken')), [e('errUserIdMissing'), e('errUserIdMissing')], 'E6 兩筆（TOK_REJECT、查無）')
    })

})
