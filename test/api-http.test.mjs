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

        it('token=sys（開發捷徑）→ state success + 系統管理者 user', async function() {
            let r = await getJson(`${baseUrl}/api/getUserByToken?token=sys`)
            assert.strictEqual(r.state, 'success', `應 success（實得 ${JSON.stringify(r)}）`)
            assert.strictEqual(r.msg.isAdmin, 'y', 'sys 應回 isAdmin=y')
        })

        it('缺 token → state error + errTokenNoPermission（同步檢測短路、未碰認證鏈）', async function() {
            let r = await getJson(`${baseUrl}/api/getUserByToken`)
            assert.strictEqual(r.state, 'error')
            assert.strictEqual(r.msg, 'errTokenNoPermission')
        })

        //S7（ADR-033）：查無使用者 → errUserNotFound，與 /syncAndReplaceTabs（getAndVerifyAppUser）同一 key；改造前經 checkUser({}) 回 errUserIdMissing
        it('非法 token（SSO 未設定→getUserByToken 回 {}，查無使用者）→ state error + errUserNotFound', async function() {
            let r = await getJson(`${baseUrl}/api/getUserByToken?token=invalid-token-xyz`)
            assert.strictEqual(r.state, 'error', `非法 token 應 error（實得 ${JSON.stringify(r)}）`)
            assert.strictEqual(r.msg, 'errUserNotFound', `查無使用者應回 errUserNotFound（實得 ${JSON.stringify(r.msg)}）`)
        })

    })

    describe('POST /syncAndReplaceTabs', function() {

        it('缺 token → state error + errTokenNoPermission', async function() {
            let r = await getJson(`${baseUrl}/syncAndReplaceTabs`, { method: 'POST' })
            assert.strictEqual(r.state, 'error')
            assert.strictEqual(r.msg, 'errTokenNoPermission')
        })

        //S7（ADR-033）：查無使用者之 key 與 GET /api/getUserByToken 相同
        it('非法 token（查無使用者）→ state error + errUserNotFound', async function() {
            let r = await getJson(`${baseUrl}/syncAndReplaceTabs?token=invalid-token-xyz&keyTable=apis`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ group: 'g', rows: [{ name: 'n', url: 'http://x/y' }] }),
            })
            assert.strictEqual(r.state, 'error')
            assert.strictEqual(r.msg, 'errUserNotFound')
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

        beforeEach(async function() {
            this.timeout(30000)
            await resetToBaseSeed() //各案自備前置：前一案之寫入（含改造前會清空群組之行為）不影響下一案
        })

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
            let ok = { srcKey: 'ok-row', name: '同步列', url: 'http://sync/ok', method: 'get', levels: 'API' }
            for (let rows of [[null], [null, null], [1, 2], [ok, 's'], [ok, []]]) {
                let r = await postRows(GROUP_SEED, rows)
                assert.strictEqual(r.state, 'error', `rows=${JSON.stringify(rows)} 應 error`)
                assert.strictEqual(r.msg, 'errRowInvalid', `rows=${JSON.stringify(rows)} 應回 err-key errRowInvalid（實得 ${JSON.stringify(r.msg)}）`)
            }
            assert.strictEqual(await countGroup(GROUP_SEED), n0, '拒絕後既有群組列數不變')
        })

        it('rows 含缺必填欄位之物件列（[{}]／缺 url／name 空字串／base64 空名）→ errRowInvalid、既有群組列數不變', async function() {
            let n0 = await countGroup(GROUP_SEED)
            let ok = { srcKey: 'ok-row', name: '同步列', url: 'http://sync/ok', method: 'get', levels: 'API' }
            let cases = [ //各列皆帶合法 srcKey，使拒收確由 name／url 必填檢核造成
                [{ srcKey: 'k0' }],
                [{ srcKey: 'k1', name: 'x' }],
                [{ srcKey: 'k2', name: '', url: 'http://sync/1' }],
                [ok, { srcKey: 'k3', name: 'y' }],
                [{ srcKey: 'k4', name: 'base64:', url: 'http://sync/1' }], //b64 還原後為空字串 → 檢核在還原之後
            ]
            for (let rows of cases) {
                let r = await postRows(GROUP_SEED, rows)
                assert.strictEqual(r.state, 'error', `rows=${JSON.stringify(rows)} 應 error`)
                assert.strictEqual(r.msg, 'errRowInvalid', `rows=${JSON.stringify(rows)} 應回 errRowInvalid（實得 ${JSON.stringify(r.msg)}）`)
            }
            assert.strictEqual(await countGroup(GROUP_SEED), n0, '拒絕後既有群組列數不變')
        })

        //R-SYNC-1（ADR-038）：有給之來源鍵之可預期失敗一律在寫入之前擋下（errRowInvalid）、既有群組資料不動。
        //2026-10-23（ADR-046，原則 11、規格 §9）：來源鍵即 srcKey，必填；外部不得送 id（列帶 id 整批拒收 idNotAllowed）；原「以 id 代替 srcKey」之案例改為 srcKey 版，並新增 I13 拒收案例。
        //改造前（ADR-038）：含白名單外標籤之主鍵於 insert 整批拒絕而群組已被 delAll 清空；超長主鍵於 LMDB insert 失敗且部分寫入；同批重複主鍵只寫第一筆卻回 success。
        let mkRow = (srcKey, name) => ({ srcKey, name, url: `http://sync/${name}`, method: 'get', levels: 'API' })

        it('R-SYNC-1 srcKey 含 HTML 標記（白名單外標籤）→ errRowInvalid、既有群組列數不變（不得先清空）', async function() {
            let n0 = await countGroup(GROUP_SEED)
            let r = await postRows(GROUP_SEED, [mkRow('api-http-xss-ok', 'x1'), mkRow('api-http<script>x', 'x2')])
            assert.strictEqual(r.state, 'error', `應 error（實得 ${JSON.stringify(r)}）`)
            assert.strictEqual(r.msg, 'errRowInvalid', `應回 errRowInvalid（實得 ${JSON.stringify(r.msg)}）`)
            assert.strictEqual(await countGroup(GROUP_SEED), n0, '拒絕後既有群組列數不變')
        })

        it('R-SYNC-1 srcKey 超過 1978 位元組 → errRowInvalid、既有群組列數不變（不得部分寫入）', async function() {
            let n0 = await countGroup(GROUP_SEED)
            let r = await postRows(GROUP_SEED, [mkRow('api-http-long-ok', 'l1'), mkRow('x'.repeat(1979), 'l2'), mkRow('api-http-long-ok3', 'l3')])
            assert.strictEqual(r.msg, 'errRowInvalid', `應回 errRowInvalid（實得 ${JSON.stringify(r)}）`)
            assert.strictEqual(await countGroup(GROUP_SEED), n0, '拒絕後既有群組列數不變')
            assert.strictEqual((await woItems.apis.select({ srcKey: 'api-http-long-ok' })).length, 0, '不得部分寫入')
        })

        it('R-SYNC-1 同批 srcKey 重複 → errRowInvalid、既有群組列數不變', async function() {
            let n0 = await countGroup(GROUP_SEED)
            let r = await postRows(GROUP_SEED, [mkRow('api-http-dup', 'd1'), mkRow('api-http-dup', 'd2')])
            assert.strictEqual(r.msg, 'errRowInvalid', `應回 errRowInvalid（實得 ${JSON.stringify(r)}）`)
            assert.strictEqual(await countGroup(GROUP_SEED), n0, '拒絕後既有群組列數不變')
        })

        //I13（不提供呼叫端相容）：缺 srcKey（含只送 id）→ errRowInvalid；srcKey 與 id 並送 → idNotAllowed；皆整批拒收、零寫入
        it('I13 缺 srcKey／只送 id／混批 → errRowInvalid；srcKey 與 id 並送 → idNotAllowed；皆整批拒收、既有群組列數不變、不新增任何列', async function() {
            let n0 = await countGroup(GROUP_SEED)
            let nAll0 = (await woItems.apis.select({})).length
            let rowSeed = (await woItems.apis.select({})).find((v) => v.group === GROUP_SEED)
            let noKey = { name: '無鍵列', url: 'http://sync/nokey', method: 'get', levels: 'API' }
            let cases = [
                ['缺 srcKey', [noKey], 'errRowInvalid'],
                ['只送 id（沿用既有列之 id 亦不得代替 srcKey）', [{ id: rowSeed.id, name: rowSeed.name, url: rowSeed.url, method: 'get' }], 'errRowInvalid'],
                ['只送數字 id', [{ id: 123, name: 'num', url: 'http://sync/num' }], 'errRowInvalid'],
                ['混批：部分列缺 srcKey', [mkRow('i13-ok', 'ok'), noKey], 'errRowInvalid'],
                ['srcKey 與 id 並送', [{ ...mkRow('i13-both', 'both'), id: 'forged-id' }], 'idNotAllowed'],
                ['srcKey 與屬他群組既有列之 id 並送', [{ ...mkRow('i13-steal', 'steal'), id: rowSeed.id }], 'idNotAllowed'],
                ['srcKey 與數字 id 並送', [{ ...mkRow('i13-num', 'num'), id: 123 }], 'idNotAllowed'],
            ]
            for (let [label, rows, key] of cases) {
                for (let g of [GROUP_SEED, GROUP_NEW]) {
                    let r = await postRows(g, rows)
                    assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: key }, `${label}（群組 ${g}）：${JSON.stringify(r)}`)
                }
            }
            assert.strictEqual(await countGroup(GROUP_SEED), n0, '拒絕後既有群組列數不變')
            assert.strictEqual(await countGroup(GROUP_NEW), 0, '目標群組不新增任何列')
            assert.strictEqual((await woItems.apis.select({})).length, nAll0, '全庫列數不變')
            assert.strictEqual((await woItems.apis.select({ id: rowSeed.id }))[0].group, GROUP_SEED, '既有列仍屬原群組')
        })

        //srcKey 屬各群組各自之命名空間：與他群組某列之 id（或 srcKey）同值不構成配對、不影響該列
        it('R-SYNC-1 srcKey 與他群組某列之 id 同值 → 於本群組新增新列（內部 id 由系統產生），他群組該列完全不動', async function() {
            let rowSeed = (await woItems.apis.select({})).find((v) => v.group === GROUP_SEED)
            let r = await postRows(GROUP_NEW, [mkRow(rowSeed.id, 'same-as-id')])
            assert.strictEqual(r.state, 'success', JSON.stringify(r))
            assert.deepStrictEqual(r.msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 })
            assert.deepStrictEqual((await woItems.apis.select({ id: rowSeed.id }))[0], rowSeed, '他群組該列完全不動')
            let added = (await woItems.apis.select({})).filter((v) => v.group === GROUP_NEW)
            assert.strictEqual(added.length, 1)
            assert.strictEqual(added[0].srcKey, rowSeed.id)
            assert.notStrictEqual(added[0].id, rowSeed.id, '內部 id 由系統產生')
        })

        //srcKey 須為字串（w-serv-orm 1.1.11 起數字主鍵存為字串；srcKey 為一般字串欄，不接受數字，免與 id 形態混淆）
        it('R-SYNC-1 srcKey 為數字 → errRowInvalid（須為字串）；字串 \'123\' 照常，內部 id 由系統產生', async function() {
            let r0 = await postRows(GROUP_NEW, [mkRow(123, 'num')])
            assert.strictEqual(r0.msg, 'errRowInvalid', `數字 srcKey 應拒（實得 ${JSON.stringify(r0)}）`)
            assert.strictEqual(await countGroup(GROUP_NEW), 0)
            let r1 = await postRows(GROUP_NEW, [mkRow('123', 'num')])
            assert.strictEqual(r1.state, 'success', `應 success（實得 ${JSON.stringify(r1)}）`)
            //2026-10-23（ADR-043）: 外部匯入改差異同步，回應為 { nAdd, nUpdate, nDel, nSame }（原回 insert 結果 [{ id: '123' }]）
            assert.deepStrictEqual(r1.msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 }, '回應為四類計數')
            let rs = await woItems.apis.select({ srcKey: '123' })
            assert.strictEqual(rs.length, 1)
            assert.strictEqual(rs[0].group, GROUP_NEW)
            assert.notStrictEqual(rs[0].id, '123', '內部 id 由系統產生（ADR-046 起不再沿用外部給的值）')
        })

        it('R-SYNC-1 srcKey 恰為 1978 位元組（上限）→ success、以該 srcKey 寫入', async function() {
            let key = 'b'.repeat(1978)
            let r = await postRows(GROUP_NEW, [mkRow(key, 'boundary')])
            assert.strictEqual(r.state, 'success', `上限內應 success（實得 ${JSON.stringify(r).slice(0, 300)}）`)
            assert.strictEqual((await woItems.apis.select({ srcKey: key })).length, 1, '應以該 srcKey 寫入')
            assert.strictEqual(await countGroup(GROUP_NEW), 1)
        })

        it('rows 全部合法 → success、以新列取代該群組（id／timeCreate 由系統補齊；再同步即取代）', async function() {
            let nSeed = await countGroup(GROUP_SEED)
            let r1 = await postRows(GROUP_NEW, [
                { srcKey: 'sync-1', name: '同步列一', url: 'http://sync/1', method: 'get', levels: 'API' },
                { srcKey: 'sync-2', name: '同步列二', url: 'http://sync/2', method: 'post', levels: 'API' },
            ])
            assert.strictEqual(r1.state, 'success', `合法 rows 應 success（實得 ${JSON.stringify(r1)}）`)
            let rs = (await woItems.apis.select({})).filter((r) => r.group === GROUP_NEW)
            assert.strictEqual(rs.length, 2, '新群組應寫入 2 列')
            for (let row of rs) {
                assert.ok(typeof row.id === 'string' && row.id !== '', '每列應由系統配 id')
                assert.ok(typeof row.timeCreate === 'string' && row.timeCreate !== '', '每列應由 procOrm 補 timeCreate')
            }
            //再同步（1 列、srcKey 不同）→ 取代：該群組只剩 1 列；其他群組不受影響
            let r2 = await postRows(GROUP_NEW, [{ srcKey: 'sync-3', name: '同步列三', url: 'http://sync/3', method: 'get', levels: 'API' }])
            assert.strictEqual(r2.state, 'success')
            assert.strictEqual(await countGroup(GROUP_NEW), 1, '再同步應以新列取代該群組')
            assert.strictEqual(await countGroup(GROUP_SEED), nSeed, '其他群組列數不受影響')
        })

    })

})
