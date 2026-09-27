//unit：server/wrapInjected.mjs——注入函數（getUserByToken／verifyClientUser／verifyAppUser）之唯一呼叫出口（W 契約；
//w-web-sso tmp/sso-token-leak-全盤.md〈六〉「共用契約 W」）：上游同步拋錯或 reject 一律視同否定結果（回 failValue），
//失敗描述只含 K 契約白名單 key，否則只含型別與 Error.name，絕不含原文。每條斷言對應契約之一句；ADR-033。
import assert from 'assert'
import { wrapInjected, describeUpstream } from '../server/wrapInjected.mjs'


let SECRET = 'SYNTH-W-SECRET-FOR-TEST'

//K 契約 14 key（規格〈六〉；w-web-sso helper 之 reject 詞彙，與 wrapInjected.mjs 白名單為同步點）
let KS = [
    'invalidUrl', 'invalidTokenSelf', 'invalidTokenTar', 'invalidUserIdTar',
    'noTokenKeyValueInUrl', 'noTokenKeyUserIdInUrl', 'noTokenInUrl',
    'cannotGetUserByUrl', 'cannotGetUsersByUrl', 'cannotGetUserDataByUrl', 'cannotGetUsersDataByUrl',
    'noUserDataByUrl', 'noUsersDataByUrl', 'noUserDataAfterConvert',
]

//舊版 w-web-sso helper 失敗時之 reject 形狀（字串內夾完整網址、介接權杖與所送權杖）
let OLD_HELPER_REJECT = `can not get user data by url[http://127.0.0.1:11007/api/getSsoUserInfor?token=${SECRET}&key=token&value=${SECRET}-U]`


//以 onFail 收集失敗描述
function track(fn, failValue) {
    let fails = []
    let w = wrapInjected(fn, { failValue, onFail: (info) => fails.push(info) })
    return { w, fails }
}

function assertNoSecret(label, v) {
    let s = JSON.stringify(v)
    assert.ok(!s.includes(SECRET), `${label} 不得含合成秘密（實得 ${s}）`)
}


describe('unit-wrapInjected', function() {

    //W 契約：上游 resolve → 原樣回傳（同一參考），不觸發 onFail；參數原樣轉交
    it('WRAP-001 resolve 原樣回傳、參數原樣轉交、不觸發 onFail', async function() {
        let u = { id: 'u1', name: 'n', email: 'e@x', isAdmin: 'y' }
        let got = []
        let { w, fails } = track(async (...args) => {
            got.push(args)
            return u
        }, null)
        let r = await w('tok', 'from-x')
        assert.strictEqual(r, u)
        assert.deepStrictEqual(got, [['tok', 'from-x']])
        assert.strictEqual(fails.length, 0)
    })

    //W 契約：注入函數可為同步函數（非 Promise 回傳）→ 原樣回傳；verify 系回 false 為正常否定結果，不算上游失敗
    it('WRAP-002 非 Promise 回傳原樣（含 false／undefined），不觸發 onFail', async function() {
        for (let v of [true, false, undefined, { id: 'u2' }, 0, '']) {
            let { w, fails } = track(() => v, false)
            assert.strictEqual(await w({ id: 'x' }, 'from'), v, `同步回傳 ${JSON.stringify(v)}`)
            assert.strictEqual(fails.length, 0, `同步回傳 ${JSON.stringify(v)} 不得觸發 onFail`)
        }
    })

    //W 契約：reject 非白名單字串（舊版 helper 形狀，含合成秘密）→ 回 failValue；onFail 收到之物件只含型別與名稱、不含秘密
    it('WRAP-003 reject 字串含合成秘密 → failValue，onFail 只收型別、不含秘密', async function() {
        let { w, fails } = track(async () => Promise.reject(OLD_HELPER_REJECT), null)
        assert.strictEqual(await w('tok'), null)
        assert.strictEqual(fails.length, 1)
        assert.deepStrictEqual(fails[0], { upstreamType: 'string', upstreamName: '' })
        assertNoSecret('onFail 物件', fails[0])

        let v = track(async () => Promise.reject(OLD_HELPER_REJECT), false)
        assert.strictEqual(await v.w({ id: 'x' }), false, 'verify 系之 failValue 為 false')
        assertNoSecret('onFail 物件', v.fails)
    })

    //W 契約：reject 值（或 Error.message）屬 K 契約 14 key → { upstream: key } 照記
    it('WRAP-004 白名單 key（字串或 Error.message）照記為 upstream', async function() {
        assert.strictEqual(KS.length, 14)
        for (let k of KS) {
            let a = track(async () => Promise.reject(k), null)
            assert.strictEqual(await a.w('tok'), null)
            assert.deepStrictEqual(a.fails, [{ upstream: k }], `reject('${k}')`)
            let b = track(async () => Promise.reject(new Error(k)), null)
            assert.strictEqual(await b.w('tok'), null)
            assert.deepStrictEqual(b.fails, [{ upstream: k }], `reject(new Error('${k}'))`)
        }
    })

    //W 契約：reject／throw Error（message 含秘密）→ failValue；只記型別與 Error.name
    it('WRAP-005 Error 物件（message 含秘密）→ failValue，只記 upstreamType／upstreamName', async function() {
        let a = track(async () => Promise.reject(new Error(OLD_HELPER_REJECT)), null)
        assert.strictEqual(await a.w('tok'), null)
        assert.deepStrictEqual(a.fails, [{ upstreamType: 'error', upstreamName: 'Error' }])
        let b = track(async () => {
            throw new TypeError(`fetch failed ${SECRET}`, { cause: new Error(SECRET) })
        }, false)
        assert.strictEqual(await b.w({ id: 'x' }), false)
        assert.deepStrictEqual(b.fails, [{ upstreamType: 'error', upstreamName: 'TypeError' }])
        //Error.name 被塞入非名稱形狀之字串 → 不記
        let c = track(async () => Promise.reject(Object.assign(new Error('x'), { name: `Bad ${SECRET}` })), null)
        assert.strictEqual(await c.w('tok'), null)
        assert.deepStrictEqual(c.fails, [{ upstreamType: 'error', upstreamName: '' }])
    })

    //W 契約：同步拋錯（非 async 函數內 throw）→ failValue，不向上拋
    it('WRAP-006 同步 throw（Error／字串）→ failValue、不向上拋', async function() {
        let a = track(() => {
            throw new Error(SECRET)
        }, false)
        assert.strictEqual(await a.w({ id: 'x' }), false)
        assert.deepStrictEqual(a.fails, [{ upstreamType: 'error', upstreamName: 'Error' }])
        let b = track(() => {
            throw OLD_HELPER_REJECT
        }, null)
        assert.strictEqual(await b.w('tok'), null)
        assert.deepStrictEqual(b.fails, [{ upstreamType: 'string', upstreamName: '' }])
    })

    //非原生 Promise 之 thenable reject 亦視同上游失敗；onFail 本身拋錯或未給仍回 failValue（包裝函數永不 reject）
    it('WRAP-007 thenable reject、onFail 拋錯或未給 → 仍回 failValue', async function() {
        let a = track(() => ({ then: (res, rej) => rej(OLD_HELPER_REJECT) }), null)
        assert.strictEqual(await a.w('tok'), null)
        assert.deepStrictEqual(a.fails, [{ upstreamType: 'string', upstreamName: '' }])
        let b = wrapInjected(async () => Promise.reject(OLD_HELPER_REJECT), {
            failValue: false,
            onFail: () => {
                throw new Error('onFail broken')
            },
        })
        assert.strictEqual(await b({ id: 'x' }), false)
        let c = wrapInjected(async () => Promise.reject(OLD_HELPER_REJECT), { failValue: null })
        assert.strictEqual(await c('tok'), null)
    })

    //describeUpstream：只有「字串或 Error 之 message 恰為白名單 key」才照記；近似字串、非 Error 物件之 message 一律只記型別
    it('WRAP-008 describeUpstream：白名單須完全相符，其餘只記型別與名稱', function() {
        assert.deepStrictEqual(describeUpstream('cannotGetUserByUrl'), { upstream: 'cannotGetUserByUrl' })
        for (let v of [' cannotGetUserByUrl', 'CannotGetUserByUrl', 'cannotGetUserByUrl[http://x/?token=SYNTH]', 'errUserNotFound']) {
            assert.deepStrictEqual(describeUpstream(v), { upstreamType: 'string', upstreamName: '' }, JSON.stringify(v))
        }
        assert.deepStrictEqual(describeUpstream({ message: 'cannotGetUserByUrl' }), { upstreamType: 'object', upstreamName: '' })
        assert.deepStrictEqual(describeUpstream(null), { upstreamType: 'null', upstreamName: '' })
        assert.deepStrictEqual(describeUpstream(undefined), { upstreamType: 'undefined', upstreamName: '' })
        assert.deepStrictEqual(describeUpstream(404), { upstreamType: 'number', upstreamName: '' })
        assert.deepStrictEqual(describeUpstream([SECRET]), { upstreamType: 'array', upstreamName: '' })
        assert.deepStrictEqual(describeUpstream({ token: SECRET }), { upstreamType: 'object', upstreamName: '' })
    })

})
