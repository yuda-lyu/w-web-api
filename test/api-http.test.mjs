//api-http：兩支對外 HTTP API（GET /api/getUserByToken、POST /syncAndReplaceTabs）之整合測試，
//直打 127.0.0.1 後端，涵蓋認證鏈 reject 路徑（缺/非法 token、不合法 keyTable）與成功讀取——
//e2e 只走 WebSocket kpFunExt 不打這兩路由，原本完全無測。對應 z待修清單 T06 + T07（認證鏈 reject 經真實端點驗證）。
//回應格式：handler 經 pm2resolve 回 { state:'success'|'error', msg: user|err-key }。
import assert from 'assert'
import { startServersOnce, baseUrl } from './e2e-setup.mjs'


async function getJson(url, opts) {
    let res = await fetch(url, opts)
    let txt = await res.text()
    try {
        return JSON.parse(txt)
    }
    catch (e) {
        throw new Error(`回應非 JSON（status ${res.status}）：${txt.slice(0, 200)}`)
    }
}


describe('api-http (HTTP API 整合 / 認證鏈)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(180000)
        await startServersOnce() //build dist + 起後端（與 e2e 共用，只起一次）
    })

    describe('GET /api/getUserByToken', function() {

        it('token=sys（開發捷徑）→ state success + 管理員 user', async function() {
            let r = await getJson(`${baseUrl}/api/getUserByToken?token=sys`)
            assert.strictEqual(r.state, 'success', `應 success（實得 ${JSON.stringify(r)}）`)
            assert.strictEqual(r.msg.isAdmin, 'y', 'sys 應回 isAdmin=y')
        })

        it('缺 token → state error + errTokenNoPermission（同步檢測短路、未碰認證鏈）', async function() {
            let r = await getJson(`${baseUrl}/api/getUserByToken`)
            assert.strictEqual(r.state, 'error')
            assert.strictEqual(r.msg, 'errTokenNoPermission')
        })

        it('非法 token（SSO 未設定→getUserByToken 回 {}→checkUser reject）→ state error', async function() {
            let r = await getJson(`${baseUrl}/api/getUserByToken?token=invalid-token-xyz`)
            assert.strictEqual(r.state, 'error', `非法 token 應 error（實得 ${JSON.stringify(r)}）`)
        })

    })

    describe('POST /syncAndReplaceTabs', function() {

        it('缺 token → state error + errTokenNoPermission', async function() {
            let r = await getJson(`${baseUrl}/syncAndReplaceTabs`, { method: 'POST' })
            assert.strictEqual(r.state, 'error')
            assert.strictEqual(r.msg, 'errTokenNoPermission')
        })

        it('token=sys 但 keyTable 不在白名單 → state error + errKeyTableInvalid（DB 寫入前即拒、非破壞性）', async function() {
            let r = await getJson(`${baseUrl}/syncAndReplaceTabs?token=sys&keyTable=badtable`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ from: 'x', rows: [] }),
            })
            assert.strictEqual(r.state, 'error')
            assert.strictEqual(r.msg, 'errKeyTableInvalid')
        })

    })

})
