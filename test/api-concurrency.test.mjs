//api-concurrency：多人同時編輯之寫入契約（原則 10；規格 C:\opensrcOper\dspec\多人同時編輯之寫入契約.md；rulebook_concurrency.md）——
//真後端（隔離子行程：獨立 lmdb、埠 8551，SlowOrm 注入人為延遲與操作記錄；不碰專案 ./db 與 11005），經真實資料通道（/api/main，wsemi 編碼）呼叫 kpFunExt 之 saveApi／deleteApi，
//並以 POST /syncAndReplaceTabs 代表外部應用。每個 it 對應 spec 句（括號內為 inv01 缺陷編號 E5～E8／A1～A7／C4b 與規格 V1～V14）。
//V4（系統直寫雙方欄位）：本表無雙方欄位，不適用（rulebook_concurrency.md §1）；V8（整表存檔之刪除集合）、V12（清單頁多列提交）：本套件無整表存檔、無清單頁，不適用；
//V9（名次）：不設 orderKey，改以一般欄位 order 測「他人改 order → 舊基準被拒」；V11（草稿保護）為前端行為，見 e2e-concurrent。
//外部匯入之行為（I1～I14）見 api-import。
import assert from 'assert'
import { buildBaseline } from 'w-serv-orm/src/baseline.mjs'
import contract from '../src/schema/contracts/apis.mjs'
import { startApiServer, sleep } from './tools/apiHarness.mjs'


let PORT = 8551
let S = null

//baselineOf: 前端開啟編輯時之基準——對「畫面所見之列」自算（此處以 getApisList 經真實傳輸路徑取回之列，等同前端 store 列）
let baselineOf = (row) => buildBaseline([row], contract)

//mkRow: 新增一列（後台 UI 路徑 saveApi，無 id），回庫內列
async function mkRow(token, name, extra = {}) {
    let r = await S.fun(token, 'saveApi', [{ name, url: `http://t/${name}`, method: 'get', levels: 'T', group: 'ui', ...extra }])
    assert.ok(r.ok, `新增應成功：${JSON.stringify(r)}`)
    return await getRow(r.msg[0].id)
}

async function getRow(id) {
    let rs = await S.list()
    return rs.find((v) => v.id === id) || null
}

//clean: 清空 apis（測試端自刪，各案前置）。直接清表（S.wipe）而非逐列 deleteApi: 外部列（srcKey 非空）受保護後台不可刪（原則 5, ADR-044, api-externalRows），
//清理屬測試鷹架、不是被測行為，不可依賴會被拒的路徑（api-run02 起）
async function clean() {
    await S.wipe('apis')
    assert.strictEqual((await S.list()).length, 0)
}

//opsOf: 取操作記錄中指定表之寫入類與讀取類，依起始時間排序
let byT0 = (a, b) => a.t0 - b.t0


describe('api-concurrency (多人同時編輯: 逐列基準、表鎖、只改不增、刪除未命中)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        S = await startApiServer({ name: 'api-concurrency', port: PORT })
    })

    after(async function() {
        this.timeout(30000)
        if (S) {
            await S.stop()
        }
    })

    beforeEach(async function() {
        this.timeout(30000)
        await S.setDelays({})
        await clean()
        await S.getOps(true)
    })

    //--------------------------------------------------------------------------
    describe('只改不增、刪除未命中（E5、E5b、E6；V6、V7）', function() {

        it('V6／E5: A 建列 → A 刪除 → B 以舊畫面（帶舊基準／不帶基準）修改 → errApiRowNotFound，該列不復活', async function() {
            let row = await mkRow('tokA', 'e5')
            let stale = { ...row, name: 'edited-by-B' }
            assert.ok((await S.fun('tokA', 'deleteApi', [row.id])).ok)
            let r1 = await S.fun('tokB', 'saveApi', [stale, { baseline: baselineOf(row) }])
            assert.deepStrictEqual(r1, { ok: false, msg: 'errApiRowNotFound' })
            let r2 = await S.fun('tokB', 'saveApi', [stale])
            assert.deepStrictEqual(r2, { ok: false, msg: 'errApiRowNotFound' })
            assert.strictEqual(await getRow(row.id), null, '已刪之列不得被修改復活')
            assert.strictEqual((await S.list()).length, 0)
        })

        it('E5b: 以從未存在之 id 呼叫 saveApi → errApiRowNotFound，不新建該列', async function() {
            let r = await S.fun('tokA', 'saveApi', [{ id: 'ghost-id-never-existed', name: 'g', url: 'http://t/g', method: 'get' }])
            assert.deepStrictEqual(r, { ok: false, msg: 'errApiRowNotFound' })
            assert.strictEqual((await S.list()).length, 0)
        })

        it('V7／E6: 刪除不存在之列（不帶／帶基準）→ errApiRowNotFound；先刪先贏——後刪者得 errApiRowNotFound', async function() {
            let row = await mkRow('tokA', 'e6')
            let r0 = await S.fun('tokA', 'deleteApi', ['no-such-id-e6'])
            assert.deepStrictEqual(r0, { ok: false, msg: 'errApiRowNotFound' }, '不帶基準亦回找不到')
            let r1 = await S.fun('tokA', 'deleteApi', ['no-such-id-e6', { baseline: baselineOf({ ...row, id: 'no-such-id-e6' }) }])
            assert.deepStrictEqual(r1, { ok: false, msg: 'errApiRowNotFound' }, '帶基準亦回找不到（逐列 read 只讀該列，不是 saveStale）')
            //先刪先贏
            let rA = await S.fun('tokA', 'deleteApi', [row.id, { baseline: baselineOf(row) }])
            assert.ok(rA.ok, `先刪者成功：${JSON.stringify(rA)}`)
            let rB = await S.fun('tokB', 'deleteApi', [row.id, { baseline: baselineOf(row) }])
            assert.deepStrictEqual(rB, { ok: false, msg: 'errApiRowNotFound' })
            let rB2 = await S.fun('tokB', 'deleteApi', [row.id])
            assert.deepStrictEqual(rB2, { ok: false, msg: 'errApiRowNotFound' })
        })

        it('刪除成功之回傳形狀不變（procOrm del 之逐筆結果，含 n、nDeleted、ok）', async function() {
            let row = await mkRow('tokA', 'shape')
            let r = await S.fun('tokA', 'deleteApi', [row.id])
            assert.ok(r.ok)
            let first = Array.isArray(r.msg) ? r.msg[0] : r.msg
            assert.strictEqual(first.ok, 1)
            assert.strictEqual(first.nDeleted, 1)
        })

    })

    //--------------------------------------------------------------------------
    describe('逐列基準：舊畫面存檔整次拒收，看著最新資料改者照常寫入（V1、V3、V9、V10、V13；A3）', function() {

        it('V1: A、B 載入同一列；A 存；B 以舊基準存 → saveStale，B 整次拒收、零寫入（庫內維持 A 的結果）', async function() {
            let row = await mkRow('tokA', 'v1')
            let rowA = { ...row }
            let rowB = { ...row }
            let baseA = baselineOf(rowA)
            let baseB = baselineOf(rowB)
            assert.ok((await S.fun('tokA', 'saveApi', [{ ...rowA, description: 'by-A' }, { baseline: baseA }])).ok)
            let after = await getRow(row.id)
            let rB = await S.fun('tokB', 'saveApi', [{ ...rowB, keywords: 'by-B', name: 'by-B' }, { baseline: baseB }])
            assert.deepStrictEqual(rB, { ok: false, msg: 'saveStale' })
            let now = await getRow(row.id)
            assert.strictEqual(now.description, 'by-A')
            assert.strictEqual(now.keywords, row.keywords, 'B 的任何欄位都沒有寫入')
            assert.strictEqual(now.name, 'v1')
            assert.strictEqual(now.timeUpdate, after.timeUpdate, '零寫入：timeUpdate 不變')
            assert.strictEqual(now.userIdUpdate, 'id-for-adminA')
        })

        it('V1 後半: B 重新載入（取新列算新基準）後可存；A 與 B 各自的基準於各自存檔時才比對（後者蓋前者，限看著最新資料改者）', async function() {
            let row = await mkRow('tokA', 'v1b')
            assert.ok((await S.fun('tokA', 'saveApi', [{ ...row, description: 'by-A' }, { baseline: baselineOf(row) }])).ok)
            let fresh = await getRow(row.id)
            let rB = await S.fun('tokB', 'saveApi', [{ ...fresh, description: 'by-B' }, { baseline: baselineOf(fresh) }])
            assert.ok(rB.ok, `重新載入後可存：${JSON.stringify(rB)}`)
            let now = await getRow(row.id)
            assert.strictEqual(now.description, 'by-B')
            assert.strictEqual(now.userIdUpdate, 'id-for-adminB', 'A4: 最後修改者為 B')
        })

        it('V3／A3: 外部同步改變內容後，後台以舊基準存檔被拒（不再靜默回寫外部新值）', async function() {
            let sync = (desc) => S.sync('tokApp', { group: 'ext', rows: [{ srcKey: 'k-a3', name: 'a3', url: 'http://x/a3', method: 'get', description: desc }] })
            assert.ok((await sync('v1-desc')).state === 'success')
            let rowA = (await S.list()).find((v) => v.srcKey === 'k-a3')
            let baseA = baselineOf(rowA) //A 載入
            assert.strictEqual((await sync('v2-desc-from-external')).state, 'success') //外部同步改 description
            let r = await S.fun('tokA', 'saveApi', [{ ...rowA, keywords: 'only-keywords' }, { baseline: baseA }])
            assert.deepStrictEqual(r, { ok: false, msg: 'saveStale' })
            let now = await getRow(rowA.id)
            assert.strictEqual(now.description, 'v2-desc-from-external', 'description 維持外部新值，未回寫成舊值 v1-desc')
            assert.strictEqual(now.keywords, rowA.keywords)
        })

        it('V9（改以一般欄位 order 測）: 他人以相同 order 值重存（契約欄位未變）→ 持舊基準者不被誤擋；他人改 order 後 → 持舊基準被拒', async function() {
            let row = await mkRow('tokA', 'v9', { order: 1 })
            let base = baselineOf(row)
            //B 重存同一內容（order 值相同、其他欄位亦不變；僅伺服器專有欄位 timeUpdate／userIdUpdate 會變）→ A 之舊基準仍有效
            assert.ok((await S.fun('tokB', 'saveApi', [{ ...row, order: 1 }, { baseline: base }])).ok)
            assert.strictEqual((await getRow(row.id)).userIdUpdate, 'id-for-adminB', 'B 的重存確實寫入過（伺服器專有欄位已變）')
            let rSame = await S.fun('tokA', 'saveApi', [{ ...row, description: 'x' }, { baseline: base }])
            assert.ok(rSame.ok, `相同 order 值之重存不得使他人之基準失效：${JSON.stringify(rSame)}`)
            //此時庫內已是 A 的內容；B 改 order → A（仍持最初基準）被拒
            let cur = await getRow(row.id)
            assert.ok((await S.fun('tokB', 'saveApi', [{ ...cur, order: 5 }, { baseline: baselineOf(cur) }])).ok)
            let r = await S.fun('tokA', 'saveApi', [{ ...cur, description: 'y' }, { baseline: base }])
            assert.deepStrictEqual(r, { ok: false, msg: 'saveStale' })
            assert.strictEqual((await getRow(row.id)).description, 'x', '被拒者零寫入')
        })

        it('V10: 前端算之基準（以經真實傳輸路徑取回之列自算）＝伺服端新鮮讀取所算——含特殊字元（clearXSS 改寫 a<b → a&lt;b）、數字 order、空值欄位', async function() {
            let r = await S.fun('tokA', 'saveApi', [{ name: 'a<b', url: 'http://t/v10', method: 'get', levels: 'T', group: 'ui', order: 3, description: '孔深 < 500 m 且 > 10 m', keywords: '' }])
            assert.ok(r.ok)
            let row = await getRow(r.msg[0].id)
            assert.strictEqual(row.name, 'a&lt;b', '寫入時 clearXSS 改寫')
            //以傳輸後之列算基準 → 不帶任何修改再存 → 不被誤擋（若傳輸型別漂移或伺服端另算，這裡會得 saveStale）
            let r2 = await S.fun('tokA', 'saveApi', [{ ...row }, { baseline: baselineOf(row) }])
            assert.ok(r2.ok, `前後端基準一致，應可存：${JSON.stringify(r2)}`)
            //對照: 若以「自己送出之值」當基準（規格第 8 節禁止），因 clearXSS 改寫而與庫內不符 → 被自己誤拒
            let sent = { ...row, name: 'a<b' }
            let r3 = await S.fun('tokA', 'saveApi', [{ ...row }, { baseline: baselineOf(sent) }])
            assert.deepStrictEqual(r3, { ok: false, msg: 'saveStale' }, '自己送出之值與庫內值不同 → 證明新基準必須取自伺服端')
        })

        it('V13: 格式或版本不識之基準 → errBaselineFormat，不當作未帶基準（零寫入）', async function() {
            let row = await mkRow('tokA', 'v13')
            let good = baselineOf(row)
            let bads = [
                null,
                'h1:abc',
                {},
                [['x']],
                [[row.id, 'h9:00000000000000']], //不識版本
                [[row.id, good[0][1].replace('h1:', 'h2:')]],
                [[row.id, 'h1:ZZZZZZZZZZZZZZ']], //非小寫 16 進位
                [[row.id, good[0][1]], [row.id, good[0][1]]], //重複 id
                [[1, good[0][1]]], //id 非字串
            ]
            for (let b of bads) {
                let r = await S.fun('tokA', 'saveApi', [{ ...row, name: 'must-not-write' }, { baseline: b }])
                assert.deepStrictEqual(r, { ok: false, msg: 'errBaselineFormat' }, `基準 ${JSON.stringify(b)} 應 errBaselineFormat（實得 ${JSON.stringify(r)}）`)
                let rd = await S.fun('tokA', 'deleteApi', [row.id, { baseline: b }])
                assert.deepStrictEqual(rd, { ok: false, msg: 'errBaselineFormat' }, '刪除同')
            }
            let now = await getRow(row.id)
            assert.strictEqual(now.name, 'v13', '一律零寫入、零刪除')
            //非物件之第 3 參數
            for (let o of ['str', 7, ['baseline']]) {
                let r = await S.fun('tokA', 'saveApi', [{ ...row, name: 'must-not-write' }, o])
                assert.deepStrictEqual(r, { ok: false, msg: 'errBaselineFormat' })
            }
            assert.strictEqual((await getRow(row.id)).name, 'v13')
        })

        it('刪除帶舊基準（列已被他人改過）→ saveStale、零刪除；持新基準可刪', async function() {
            let row = await mkRow('tokA', 'del-stale')
            let base = baselineOf(row)
            assert.ok((await S.fun('tokB', 'saveApi', [{ ...row, description: 'changed' }, { baseline: base }])).ok)
            let r = await S.fun('tokA', 'deleteApi', [row.id, { baseline: base }])
            assert.deepStrictEqual(r, { ok: false, msg: 'saveStale' })
            assert.ok(await getRow(row.id), '零刪除')
            let fresh = await getRow(row.id)
            assert.ok((await S.fun('tokA', 'deleteApi', [row.id, { baseline: baselineOf(fresh) }])).ok)
        })

        it('不帶基準：外部應用／舊頁面直呼 saveApi 仍可存（後者蓋前者），仍只改不增', async function() {
            let row = await mkRow('tokA', 'nobase')
            assert.ok((await S.fun('tokB', 'saveApi', [{ ...row, description: 'by-B' }, { baseline: baselineOf(row) }])).ok)
            let r = await S.fun('tokApp', 'saveApi', [{ ...row, keywords: 'by-app' }]) //持舊列、不帶基準
            assert.ok(r.ok, `不帶基準允許：${JSON.stringify(r)}`)
            assert.strictEqual((await getRow(row.id)).keywords, 'by-app')
        })

        it('客戶端第 3 參數只讀 baseline：夾帶 mustExist:false／keepUserId:true 等不影響（仍只改不增、userIdUpdate 仍為操作者）', async function() {
            let r = await S.fun('tokA', 'saveApi', [{ id: 'ghost-opt', name: 'g', url: 'http://t/g', method: 'get' }, { mustExist: false, keepUserId: true, userId: 'forged', autoInsert: true }])
            assert.deepStrictEqual(r, { ok: false, msg: 'errApiRowNotFound' }, '客戶端不得關掉只改不增')
            assert.strictEqual((await S.list()).length, 0)
        })

    })

    //--------------------------------------------------------------------------
    describe('伺服器專有欄位與最後修改者（A4、A7；V5）', function() {

        it('A4: 新增、修改後 userIdUpdate 為操作者；外部匯入者為 app 使用者', async function() {
            let row = await mkRow('tokA', 'a4')
            assert.strictEqual(row.userIdUpdate, 'id-for-adminA')
            assert.ok((await S.fun('tokB', 'saveApi', [{ ...row, description: 'x' }])).ok)
            assert.strictEqual((await getRow(row.id)).userIdUpdate, 'id-for-adminB')
            assert.strictEqual((await S.sync('tokApp', { group: 'ext', rows: [{ srcKey: 'k-a4', name: 'n', url: 'http://x/n' }] })).state, 'success')
            let ext = (await S.list()).find((v) => v.srcKey === 'k-a4')
            assert.strictEqual(ext.userIdUpdate, 'id-for-app')
        })

        it('A7／V5: 客戶端偽造 timeCreate、isActive、userIdUpdate、srcKey（修改與新增皆然）不被採用；修改保留庫內值', async function() {
            let row = await mkRow('tokA', 'a7')
            let forged = { timeCreate: '1999-01-01 00:00:00', timeUpdate: '1999-01-01 00:00:00', isActive: 'n', userIdUpdate: 'forged-user', srcKey: 'forged-key' }
            assert.ok((await S.fun('tokB', 'saveApi', [{ ...row, ...forged, description: 'x' }])).ok)
            let now = await getRow(row.id)
            assert.strictEqual(now.timeCreate, row.timeCreate, '修改不採用客戶端 timeCreate')
            assert.strictEqual(now.isActive, row.isActive)
            assert.strictEqual(now.srcKey, '')
            assert.strictEqual(now.userIdUpdate, 'id-for-adminB')
            assert.notStrictEqual(now.timeUpdate, '1999-01-01 00:00:00')
            let r = await S.fun('tokA', 'saveApi', [{ name: 'a7n', url: 'http://t/a7n', method: 'get', ...forged }])
            assert.ok(r.ok)
            let nu = await getRow(r.msg[0].id)
            assert.notStrictEqual(nu.timeCreate, forged.timeCreate, '新增亦不採用客戶端 timeCreate')
            assert.strictEqual(nu.isActive, 'y')
            assert.strictEqual(nu.srcKey, '')
            assert.strictEqual(nu.userIdUpdate, 'id-for-adminA')
        })

        it('V5: 系統只改伺服器專有欄位（外部匯入補 srcKey、更新 timeUpdate／userIdUpdate）後，持舊基準之後台仍可存（不被誤擋）', async function() {
            let row = await mkRow('tokA', 'v5', { group: 'ext' }) //後台列：srcKey 為空
            let base = baselineOf(row)
            //外部以 srcKey（等於該列既有之 id，一次性遷移，I15）重送同內容 → 命中該列、補 srcKey（伺服器專有）、內容不變
            let r = await S.sync('tokApp', { group: 'ext', rows: [{ srcKey: row.id, name: row.name, url: row.url, method: row.method, levels: row.levels, group: 'ext', order: row.order, description: row.description, version: row.version, keywords: row.keywords, state: row.state, creator: row.creator, dataSource: row.dataSource, mdInputParams: row.mdInputParams, inputExample: row.inputExample, mdOutputParams: row.mdOutputParams, outputExample: row.outputExample }] })
            assert.strictEqual(r.state, 'success', JSON.stringify(r))
            assert.deepStrictEqual(r.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
            let sys = await getRow(row.id)
            assert.strictEqual(sys.srcKey, row.id, '補上 srcKey = id')
            assert.notStrictEqual(sys.timeUpdate, row.timeUpdate, '系統確實改過伺服器專有欄位')
            let r2 = await S.fun('tokA', 'saveApi', [{ ...row, tokens: 'mine' }, { baseline: base }])
            assert.ok(r2.ok, `只改伺服器專有欄位不應使舊基準失效：${JSON.stringify(r2)}`)
            let now = await getRow(row.id)
            assert.strictEqual(now.tokens, 'mine')
            assert.strictEqual(now.srcKey, row.id, '後台存檔不回寫舊的 srcKey（保留系統所寫之值）')
        })

    })

    //--------------------------------------------------------------------------
    describe('原子：比對與寫入間插不進他人寫入——同一把 apis 表鎖（V14；A1、A2）', function() {

        it('V14／A2: 比對（讀取）與寫入間人為延遲 300 ms——A 修改 row1、B 同時刪除 row1、C 修改 row2：任兩請求之 ORM 操作窗不得交錯', async function() {
            let r1 = await mkRow('tokA', 'v14-r1')
            let r2 = await mkRow('tokA', 'v14-r2')
            await S.getOps(true)
            await S.setDelays({ select: 300, save: 100, del: 100 })
            let t = Date.now()
            let pA = S.fun('tokA', 'saveApi', [{ ...r1, description: 'A' }, { baseline: baselineOf(r1) }])
            await sleep(60)
            let pB = S.fun('tokB', 'deleteApi', [r1.id])
            await sleep(60)
            let pC = S.fun('tokApp', 'saveApi', [{ ...r2, description: 'C' }])
            let [a, b, c] = await Promise.all([pA, pB, pC])
            await S.setDelays({})
            assert.ok(Date.now() - t >= 900, '三個請求被表鎖序列化（各含 300ms 讀取延遲）')
            let ops = (await S.getOps(true)).filter((o) => o.tab === 'apis' && (o.op === 'save' || o.op === 'del' || o.op === 'select')).sort(byT0)
            //只看三個請求之操作（排除 getApisList 之 select({}))
            let mine = ops.filter((o) => o.op !== 'select' || o.key.includes('$in'))
            //序列化: 以時間排序後，相鄰操作所屬請求不得交錯——檢查每個「讀取→寫入」對（同一請求）之間沒有其他請求的操作起訖落入
            let writes = mine.filter((o) => o.op !== 'select')
            let reads = mine.filter((o) => o.op === 'select')
            for (let w of writes) {
                //該寫入對應之讀取 = 該寫入之前最近、且 key 含同一 id 的 read
                let rd = reads.filter((x) => x.t1 <= w.t0 && x.key.includes(w.key.split(',')[0])).pop()
                assert.ok(rd, `寫入 ${w.op}:${w.key} 應有同請求之讀取`)
                let others = mine.filter((o) => o !== w && o !== rd && o.t0 < w.t1 && o.t1 > rd.t0)
                assert.deepStrictEqual(others.map((o) => `${o.op}:${o.key}`), [], `讀取→寫入窗 [${rd.t0},${w.t1}] 內不得有其他請求之操作（同鎖互斥）`)
            }
            //語意結果: A 先到先得鎖 → A 成功後 B 刪除成功；C 成功
            assert.ok(a.ok && b.ok && c.ok, JSON.stringify({ a, b, c }))
            assert.strictEqual(await getRow(r1.id), null, '刪除後該列不得被 A 之寫入復活（A2）')
            assert.strictEqual((await getRow(r2.id)).description, 'C')
        })

        it('A2: 同一列 saveApi（寫入延遲）與 deleteApi 並行——刪除成功後該列不存在；若刪除在先，saveApi 得 errApiRowNotFound', async function() {
            let row = await mkRow('tokA', 'a2')
            await S.setDelays({ save: 400 })
            let pS = S.fun('tokA', 'saveApi', [{ ...row, description: 'A-edit' }])
            await sleep(80)
            let pD = S.fun('tokB', 'deleteApi', [row.id])
            let [s, d] = await Promise.all([pS, pD])
            await S.setDelays({})
            assert.ok(d.ok, `刪除應成功：${JSON.stringify(d)}`)
            assert.strictEqual(await getRow(row.id), null, '舊行為：刪除成功後被延遲中之存檔復活（A2）；現同鎖序列化，不復活')
            assert.ok(s.ok || s.msg === 'errApiRowNotFound', JSON.stringify(s))
        })

        it('A1／I11: 外部同步進行中（寫入延遲）——同時 saveApi 其他列與 deleteApi：被表鎖序列化；匯入後之結果完整（外部新內容不被靜默丟棄）', async function() {
            let mine = await mkRow('tokA', 'a1-mine', { group: 'ui' })
            let gone = await mkRow('tokA', 'a1-gone', { group: 'ui' })
            assert.strictEqual((await S.sync('tokApp', { group: 'ext', rows: [{ srcKey: 'k1', name: 'ext-1', url: 'http://x/1' }] })).state, 'success')
            await S.getOps(true)
            await S.setDelays({ insert: 300, save: 300, del: 300, select: 150 })
            let pSync = S.sync('tokApp', { group: 'ext', rows: [{ srcKey: 'k1', name: 'ext-1-new', url: 'http://x/1' }, { srcKey: 'k2', name: 'ext-2', url: 'http://x/2' }] })
            await sleep(100)
            let pSave = S.fun('tokA', 'saveApi', [{ ...mine, description: 'ui-edit-during-sync' }])
            await sleep(30)
            let pDel = S.fun('tokB', 'deleteApi', [gone.id]) //匯入進行中另一位後台刪除其他列（deleteApi 亦須同鎖）
            let [rs, ru, rd] = await Promise.all([pSync, pSave, pDel])
            await S.setDelays({})
            assert.strictEqual(rs.state, 'success', JSON.stringify(rs))
            assert.deepStrictEqual(rs.msg, { nAdd: 1, nUpdate: 1, nDel: 0, nSame: 0 })
            assert.ok(ru.ok, JSON.stringify(ru))
            assert.ok(rd.ok, JSON.stringify(rd))
            let list = await S.list()
            assert.strictEqual(list.find((v) => v.srcKey === 'k1').name, 'ext-1-new', '外部新內容完整保留')
            assert.ok(list.find((v) => v.srcKey === 'k2'))
            assert.strictEqual(list.find((v) => v.id === mine.id).description, 'ui-edit-during-sync')
            assert.strictEqual(list.find((v) => v.id === gone.id), undefined, 'deleteApi 已刪除')
            //操作窗: 匯入的第一個操作到最後一個操作之間，不得夾有 saveApi 的 save、deleteApi 的 del（同鎖）
            let ops = (await S.getOps(true)).filter((o) => o.tab === 'apis')
            let ids = new Set(list.filter((v) => v.srcKey === 'k1' || v.srcKey === 'k2').map((v) => v.id))
            let syncOps = ops.filter((o) => (o.op === 'select' && !o.key.includes('$in') && o.key.includes('ext')) || ((o.op === 'insert' || o.op === 'save' || o.op === 'del') && o.key.split(',').some((k) => ids.has(k))))
            let uiSave = ops.filter((o) => o.op === 'save' && o.key === mine.id)
            let uiDel = ops.filter((o) => o.op === 'del' && o.key === gone.id)
            assert.ok(syncOps.length >= 3 && uiSave.length === 1 && uiDel.length === 1, JSON.stringify({ n: syncOps.length, s: uiSave.length, d: uiDel.length }))
            let sMin = Math.min(...syncOps.map((o) => o.t0))
            let sMax = Math.max(...syncOps.map((o) => o.t1))
            for (let [label, u] of [['saveApi 之 save', uiSave[0]], ['deleteApi 之 del', uiDel[0]]]) {
                assert.ok(u.t0 >= sMax || u.t1 <= sMin, `${label} [${u.t0},${u.t1}] 不得落入匯入之操作窗 [${sMin},${sMax}]`)
            }
        })

        it('V14: 兩位後台以同一基準並行存同一列（讀取延遲 200 ms）——恰一成功、另一 saveStale（比對與寫入同鎖，無遺失更新）；不同列則各自成功且序列化', async function() {
            let r1 = await mkRow('tokA', 'ser-1')
            let r2 = await mkRow('tokA', 'ser-2')
            await S.setDelays({ select: 200 })
            let b1 = baselineOf(r1)
            let t = Date.now()
            let [x, y] = await Promise.all([
                S.fun('tokA', 'saveApi', [{ ...r1, description: 'by-A' }, { baseline: b1 }]),
                S.fun('tokB', 'saveApi', [{ ...r1, description: 'by-B' }, { baseline: b1 }]),
            ])
            await S.setDelays({})
            assert.strictEqual([x, y].filter((v) => v.ok).length, 1, `同一基準並行存同一列只能一個成功：${JSON.stringify({ x, y })}`)
            assert.deepStrictEqual([x, y].find((v) => !v.ok), { ok: false, msg: 'saveStale' })
            assert.ok(Date.now() - t >= 400, '兩次讀取延遲被序列化')
            let winner = x.ok ? 'by-A' : 'by-B'
            assert.strictEqual((await getRow(r1.id)).description, winner, '庫內為成功者之內容，失敗者零寫入')
            //不同列、各持有效基準 → 一表一鍵仍序列化，兩者皆成功
            await S.setDelays({ select: 200 })
            let t2 = Date.now()
            let cur2 = await getRow(r2.id)
            let [p, q] = await Promise.all([
                S.fun('tokA', 'saveApi', [{ ...cur2, description: 'p' }, { baseline: baselineOf(cur2) }]),
                S.fun('tokB', 'saveApi', [{ ...cur2, keywords: 'q' }, { baseline: baselineOf(cur2) }]),
            ])
            await S.setDelays({})
            assert.strictEqual([p, q].filter((v) => v.ok).length, 1, '同列同基準亦只一成功')
            assert.ok(Date.now() - t2 >= 400)
            let r3 = await mkRow('tokA', 'ser-3')
            await S.setDelays({ select: 200 })
            let t3 = Date.now()
            let cur1 = await getRow(r1.id)
            let [u, v] = await Promise.all([
                S.fun('tokA', 'saveApi', [{ ...cur1, description: 'u' }, { baseline: baselineOf(cur1) }]),
                S.fun('tokB', 'saveApi', [{ ...r3, description: 'v' }, { baseline: baselineOf(r3) }]),
            ])
            await S.setDelays({})
            assert.ok(u.ok && v.ok, JSON.stringify({ u, v }))
            assert.ok(Date.now() - t3 >= 400, '不同列亦被同一把表鎖序列化')
        })

    })

    //--------------------------------------------------------------------------
    describe('存檔成功回傳寫入後之列（規格第8節：新基準取自伺服端，且須立即取得；api-run03，N1）', function() {

        it('N1: 修改存檔回傳 msg[0].row ＝ 寫入後之庫內列（全欄位，含 clearXSS 改寫值 a<b → a&lt;b；id、ok 等原鍵不變）；以 row 算之基準使「存檔後立即再存」不被自己誤擋', async function() {
            let row = await mkRow('tokA', 'n1')
            let r = await S.fun('tokA', 'saveApi', [{ ...row, name: 'a<b' }, { baseline: baselineOf(row) }])
            assert.ok(r.ok, JSON.stringify(r))
            assert.ok(Array.isArray(r.msg) && r.msg.length === 1)
            assert.strictEqual(r.msg[0].id, row.id, 'procOrm 結果之 id 鍵不變')
            let db = await getRow(row.id)
            assert.deepStrictEqual(r.msg[0].row, db, 'row ＝ 存檔後的庫內列（含伺服器專有欄位 timeUpdate、userIdUpdate）')
            assert.strictEqual(r.msg[0].row.name, 'a&lt;b', '伺服端存放值，不是送出之 a<b')
            //立即再存（推播未到）：以回傳之 row 算基準 → 成功
            let r2 = await S.fun('tokA', 'saveApi', [{ ...r.msg[0].row, description: 'second' }, { baseline: baselineOf(r.msg[0].row) }])
            assert.ok(r2.ok, `以回傳之列為基準，立即再存不得被自己上一次之存檔誤擋：${JSON.stringify(r2)}`)
            //對照（修前前端行為：基準仍是存檔前之畫面列）→ 被自己誤擋；證明新基準必須取自回傳
            let cur = await getRow(row.id)
            let r3 = await S.fun('tokA', 'saveApi', [{ ...cur, description: 'third' }, { baseline: baselineOf(row) }])
            assert.deepStrictEqual(r3, { ok: false, msg: 'saveStale' })
        })

        it('先動先贏不被削弱: A 存檔得 row1 → B 其後改了同一列 → A 以 row1 算之基準再存 → saveStale、零寫入', async function() {
            let row = await mkRow('tokA', 'n1-fcfs')
            let r1 = await S.fun('tokA', 'saveApi', [{ ...row, description: 'by-A-1' }, { baseline: baselineOf(row) }])
            assert.ok(r1.ok)
            let row1 = r1.msg[0].row
            let rB = await S.fun('tokB', 'saveApi', [{ ...row1, description: 'by-B' }]) //B 看著最新資料改（不帶基準）
            assert.ok(rB.ok)
            let rA2 = await S.fun('tokA', 'saveApi', [{ ...row1, keywords: 'by-A-2' }, { baseline: baselineOf(row1) }])
            assert.deepStrictEqual(rA2, { ok: false, msg: 'saveStale' })
            let now = await getRow(row.id)
            assert.strictEqual(now.description, 'by-B')
            assert.strictEqual(now.keywords, row.keywords, 'A 第二次存檔零寫入')
            assert.strictEqual(now.userIdUpdate, 'id-for-adminB')
        })

        it('新增: 回傳 msg[0].row 含伺服端配的新 id ＝ 庫內列；以之算基準可立即修改', async function() {
            let r = await S.fun('tokA', 'saveApi', [{ name: 'n1<new', url: 'http://t/n1-new', method: 'get', levels: 'T', group: 'ui' }])
            assert.ok(r.ok, JSON.stringify(r))
            assert.strictEqual(r.msg[0].row.id, r.msg[0].id)
            assert.deepStrictEqual(r.msg[0].row, await getRow(r.msg[0].id))
            assert.strictEqual(r.msg[0].row.name, 'n1&lt;new')
            let r2 = await S.fun('tokA', 'saveApi', [{ ...r.msg[0].row, description: 'edit-right-after-add' }, { baseline: baselineOf(r.msg[0].row) }])
            assert.ok(r2.ok, JSON.stringify(r2))
        })

        it('回傳之 row 取自寫入當下的表鎖內新鮮讀取: 兩位並行不帶基準存同一列（寫入、讀取皆延遲），各自回傳的是自己寫入後之結果，不是對方之後的', async function() {
            let row = await mkRow('tokA', 'n1-lock')
            await S.getOps(true)
            await S.setDelays({ save: 150, select: 150 })
            let [x, y] = await Promise.all([
                S.fun('tokA', 'saveApi', [{ ...row, description: 'only-A' }]),
                S.fun('tokB', 'saveApi', [{ ...row, description: 'only-B' }]),
            ])
            await S.setDelays({})
            assert.ok(x.ok && y.ok, JSON.stringify({ x, y }))
            assert.strictEqual(x.msg[0].row.description, 'only-A', 'A 回傳之 row 為 A 寫入之結果（讀回夾在他人寫入之間 → 會得 only-B）')
            assert.strictEqual(y.msg[0].row.description, 'only-B')
            assert.strictEqual(x.msg[0].row.userIdUpdate, 'id-for-adminA')
            assert.strictEqual(y.msg[0].row.userIdUpdate, 'id-for-adminB')
            //操作窗: 每個請求之 ORM 操作＝讀取（guardWrite 之 read）→ 存在檢查 → 寫入 → 讀回, 皆在同一把表鎖內; 兩請求不得交錯——
            //先寫入者之讀回須在後一請求之任何操作開始之前結束（讀回若移到鎖外, 後一請求之讀取會與之重疊約 150 ms）
            let ops = (await S.getOps(true)).filter((o) => o.tab === 'apis' && ((o.op === 'select' && o.key.includes('$in')) || o.op === 'save')).sort(byT0)
            let saves = ops.filter((o) => o.op === 'save')
            assert.strictEqual(saves.length, 2, '兩次寫入')
            let rbFirst = ops.find((o) => o.op === 'select' && o.t0 >= saves[0].t1) //先寫入者之讀回: 其寫入結束後開始之第一個讀取
            assert.ok(rbFirst, '先寫入者有寫入後之讀回')
            let others = ops.filter((o) => o !== rbFirst && o.t0 >= saves[0].t1) //寫入結束後開始之其餘操作＝後一請求之操作
            assert.ok(others.length >= 3, '後一請求之讀取、存在檢查、寫入、讀回')
            for (let o of others) {
                assert.ok(o.t0 >= rbFirst.t1, `後一請求之操作 ${o.op} [${o.t0}] 須在先寫入者之讀回結束 [${rbFirst.t1}] 之後（同一把表鎖）`)
            }
        })

        it('被拒（saveStale、errApiRowNotFound）時不回傳 row（回傳形狀只有 { ok:false, msg:key }）', async function() {
            let row = await mkRow('tokA', 'n1-rej')
            assert.ok((await S.fun('tokB', 'saveApi', [{ ...row, description: 'b' }])).ok)
            assert.deepStrictEqual(await S.fun('tokA', 'saveApi', [{ ...row, description: 'a' }, { baseline: baselineOf(row) }]), { ok: false, msg: 'saveStale' })
            assert.deepStrictEqual(await S.fun('tokA', 'saveApi', [{ id: 'ghost-n1', name: 'g', url: 'http://t/g', method: 'get' }]), { ok: false, msg: 'errApiRowNotFound' })
        })

    })

})
