//api-http：兩支對外 HTTP API（GET /api/getUserByToken、POST /syncAndReplaceTabs）之整合測試，
//直打 127.0.0.1 後端，涵蓋認證鏈 reject 路徑（缺/非法 token、不合法 keyTable）與成功讀取——
//e2e 只走 WebSocket kpFunExt 不打這兩路由，原本完全無測。對應 z待修清單 T06 + T07（認證鏈 reject 經真實端點驗證）。
//回應格式：handler 經 pm2resolve 回 { state:'success'|'error', msg: user|err-key }。
import assert from 'assert'
import { startServersOnce, baseUrl, resetToBaseSeed, woItems } from './tools/e2e-setup.mjs'


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

    //ADR-031：rows 逐列檢核（每列須為物件且 name／url 非空）在 delAll 之前——任一列無效即整批拒絕（errRowInvalid）、既有群組資料不動；
    //改造前只有陣列層 isearr（僅長度 1 檢查元素），[null,null] 通過後 v.group= 即 TypeError 外洩；[{}] 則以空名稱進樹。
    describe('POST /syncAndReplaceTabs 逐列檢核', function() {
        let GROUP_SEED = '寵物' //base seed 既有群組：檢核在 delAll 之前，拒絕後列數須不變
        let GROUP_NEW = 'api-http-sync'
        let url = `${baseUrl}/syncAndReplaceTabs?token=sys&keyTable=apis`

        async function countGroup(g) {
            let rs = await woItems.apis.select({})
            return rs.filter((r) => r.group === g).length
        }
        async function postRows(group, rows) {
            return await getJson(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group, rows }) })
        }

        after(async function() {
            this.timeout(30000)
            await resetToBaseSeed() //清掉本 describe 寫入之 GROUP_NEW、還原 base seed
        })

        it('rows 為空陣列／非陣列 → errRowsInvalid（陣列層），既有群組列數不變', async function() {
            let n0 = await countGroup(GROUP_SEED)
            assert.ok(n0 > 0, 'base seed 應含既有群組列')
            for (let rows of [[], 'x', null, 123]) {
                let r = await postRows(GROUP_SEED, rows)
                assert.strictEqual(r.state, 'error', `rows=${JSON.stringify(rows)} 應 error`)
                assert.strictEqual(r.msg, 'errRowsInvalid', `rows=${JSON.stringify(rows)} 應回 errRowsInvalid（實得 ${r.msg}）`)
            }
            assert.strictEqual(await countGroup(GROUP_SEED), n0, '拒絕後既有群組列數不變')
        })

        it('rows 含非物件列（[null]／[null,null]／[1,2]／合法列+字串）→ errRowInvalid、既有群組列數不變（檢核在 delAll 之前、無 TypeError 外洩）', async function() {
            let n0 = await countGroup(GROUP_SEED)
            let ok = { name: '同步列', url: 'http://sync/ok', method: 'get', levels: 'API' }
            for (let rows of [[null], [null, null], [1, 2], [ok, 's'], [ok, []]]) {
                let r = await postRows(GROUP_SEED, rows)
                assert.strictEqual(r.state, 'error', `rows=${JSON.stringify(rows)} 應 error`)
                assert.strictEqual(r.msg, 'errRowInvalid', `rows=${JSON.stringify(rows)} 應回 err-key errRowInvalid（實得 ${JSON.stringify(r.msg)}）`)
            }
            assert.strictEqual(await countGroup(GROUP_SEED), n0, '拒絕後既有群組列數不變')
        })

        it('rows 含缺必填欄位之物件列（[{}]／缺 url／name 空字串／base64 空名）→ errRowInvalid、既有群組列數不變', async function() {
            let n0 = await countGroup(GROUP_SEED)
            let ok = { name: '同步列', url: 'http://sync/ok', method: 'get', levels: 'API' }
            let cases = [
                [{}],
                [{ name: 'x' }],
                [{ name: '', url: 'http://sync/1' }],
                [ok, { name: 'y' }],
                [{ name: 'base64:', url: 'http://sync/1' }], //b64 還原後為空字串 → 檢核在還原之後
            ]
            for (let rows of cases) {
                let r = await postRows(GROUP_SEED, rows)
                assert.strictEqual(r.state, 'error', `rows=${JSON.stringify(rows)} 應 error`)
                assert.strictEqual(r.msg, 'errRowInvalid', `rows=${JSON.stringify(rows)} 應回 errRowInvalid（實得 ${JSON.stringify(r.msg)}）`)
            }
            assert.strictEqual(await countGroup(GROUP_SEED), n0, '拒絕後既有群組列數不變')
        })

        it('rows 全部合法 → success、以新列取代該群組（id／timeCreate 由 ORM 補齊；再同步即取代）', async function() {
            let nSeed = await countGroup(GROUP_SEED)
            let r1 = await postRows(GROUP_NEW, [
                { name: '同步列一', url: 'http://sync/1', method: 'get', levels: 'API' },
                { name: '同步列二', url: 'http://sync/2', method: 'post', levels: 'API' },
            ])
            assert.strictEqual(r1.state, 'success', `合法 rows 應 success（實得 ${JSON.stringify(r1)}）`)
            let rs = (await woItems.apis.select({})).filter((r) => r.group === GROUP_NEW)
            assert.strictEqual(rs.length, 2, '新群組應寫入 2 列')
            for (let row of rs) {
                assert.ok(typeof row.id === 'string' && row.id !== '', '每列應由 ORM 配 id')
                assert.ok(typeof row.timeCreate === 'string' && row.timeCreate !== '', '每列應由 procOrm 補 timeCreate')
            }
            //再同步（1 列）→ 取代：該群組只剩 1 列；其他群組不受影響
            let r2 = await postRows(GROUP_NEW, [{ name: '同步列三', url: 'http://sync/3', method: 'get', levels: 'API' }])
            assert.strictEqual(r2.state, 'success')
            assert.strictEqual(await countGroup(GROUP_NEW), 1, '再同步應以新列取代該群組')
            assert.strictEqual(await countGroup(GROUP_SEED), nSeed, '其他群組列數不受影響')
        })

    })

})
