//api-ormDiag：w-serv-orm 診斷輸出（opt.funLog，1.1.20 起，R-DIAG-01）由 WWebApi 接管並轉入 srLog（R-ORMDIAG-01，ADR-054；任務 20261028054319 第 154 項）——
//真後端（隔離子行程：獨立 lmdb、埠 8574〔api 測試埠範圍內，與 api-sysFuncs 同埠, 循序執行〕，stdout／stderr 以 pipeOut 收集；SlowOrm 注入逐筆 ok:0 與 reject；不碰專案 ./db 與 11005）。
//規格句：「寫入失敗之診斷由本套件日誌收（label 與 safe），不含 id／email／錯誤原文之資料值；console 不多出輸出；ORM 失敗之回應與庫內狀態不變」。
//以使用者識別型主鍵（email）之列模擬「主鍵可能是使用者識別」，以注入錯誤之固定標記字串（INJECTED-ITEM-FAIL／INJECTED-FAIL）代表錯誤原文，
//斷言限定在 event 為 orm-diag 之 log 行（既有 R-ERR-1 之 orm 欄由 ormFail 另記失敗筆主鍵，屬既有設計，不在本檔斷言範圍）。
import assert from 'assert'
import { startApiServer, sleep, mkLegacyRow, readLogs, waitLogs } from './tools/apiHarness.mjs'


let PORT = 8574
let S = null

let VICTIM = 'victim.person@example.com' //升版前既有列之主鍵（使用者識別型）
let DESC = 'desc-SECRET-value-ormDiag' //資料欄位值

let isDiag = (l) => l.includes('"event":"orm-diag"')
let diagOf = (lines) => lines.filter(isDiag).map((l) => JSON.parse(l))


describe('api-ormDiag (w-serv-orm funLog → srLog: label＋safe, 不含 id／email／錯誤原文; console 不多輸出)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        S = await startApiServer({ name: 'api-ormDiag', port: PORT, pipeOut: true })
    })

    after(async function() {
        this.timeout(30000)
        if (S) {
            await S.stop()
        }
    })

    beforeEach(async function() {
        this.timeout(30000)
        await S.setFails({})
        await S.setFailItems({})
        await S.wipe('apis')
        await S.seed([mkLegacyRow(VICTIM, 'ui', { description: DESC })])
        await S.getOps(true)
    })

    //row: 庫內 VICTIM 列（getApisList）
    let getRow = async () => (await S.list()).find((v) => v.id === VICTIM)

    //assertNoLeak: 一組 orm-diag log 行不含主鍵、資料值、錯誤原文標記
    let assertNoLeak = (diags, marks) => {
        let txt = JSON.stringify(diags)
        for (let m of [VICTIM, 'victim.person', DESC, 'changed-by-test', ...marks]) {
            assert.ok(!txt.includes(m), `orm-diag 不得含 ${m}（實得 ${txt.slice(0, 400)}）`)
        }
    }

    //assertSafeShape: orm-diag 行之 safe 為物件（genDiagFunLog 正規化後）、鍵限 w-serv-orm 1.1.22 之 safe 白名單（本套件在 funLog 端不再過濾，白名單由生產者保證；此處釘住契約）、值無巢狀超過 2 層
    let SAFE_KEYS = ['n', 'ks', 'skipped', 'ok', 'type', 'reason', 'msgs', 'table', 'tables', 'keys', 'nOther', 'errType', 'errCode']
    let assertSafeShape = (diags) => {
        for (let d of diags) {
            assert.strictEqual(typeof d.safe, 'object', `safe 應為物件（實得 ${JSON.stringify(d.safe)}）`)
            assert.ok(d.safe !== null && !Array.isArray(d.safe))
            for (let k of Object.keys(d.safe)) {
                assert.ok(SAFE_KEYS.includes(k), `safe 之鍵 ${k} 不在 w-serv-orm 白名單（${SAFE_KEYS.join(',')}）`)
            }
        }
    }

    it('ORMDIAG-API-001 saveApi 修改, 該筆回 ok:0 → srLog 有 orm-diag(label apis.save fail、safe {n:1,ks:[0]} 物件、warn)，不含主鍵／資料值／錯誤原文；console 無 w-serv-orm 診斷行；回應與庫內不變', async function() {
        let row = await getRow()
        assert.ok(row, '前置: VICTIM 列已 seed')
        let o0 = S.getOut().length
        let n0 = diagOf(readLogs(S.cwd)).length
        await S.setFailItems({ save: { n: 1, index: 0 } })
        let r = await S.fun('tokA', 'saveApi', [{ ...row, description: 'changed-by-test' }])
        await S.setFailItems({})
        assert.strictEqual((await S.getOps()).filter((o) => o.op === 'save' && o.inj === 'item').length, 1, '逐筆 ok:0 注入須命中恰 1 次')
        assert.deepStrictEqual(r, { ok: false, msg: 'saveWriteFail' }, '既有契約不變: 對外回語系鍵')
        assert.deepStrictEqual(await getRow(), row, '庫內列不變')

        let lines = await waitLogs(S.cwd, (ls) => diagOf(ls).length > n0)
        let diags = diagOf(lines).slice(n0)
        assert.deepStrictEqual(diags.map((d) => ({ level: d.level, label: d.label, safe: d.safe })), [{ level: 40, label: 'apis.save fail', safe: { n: 1, ks: [0] } }], 'srLog 應有恰 1 筆 orm-diag（level 40=warn）；safe 為物件（1.1.23 以前為 JSON 字串）')
        assertNoLeak(diags, ['INJECTED-ITEM-FAIL'])
        assertSafeShape(diags)

        await sleep(300)
        let out = S.getOut().slice(o0)
        assert.ok(!out.includes('apis.save fail'), `console 不得再印 w-serv-orm 之診斷行（實得 ${out.slice(0, 300)}）`)
        assert.ok(!out.includes(VICTIM), 'console 不得含主鍵')
        assert.ok(!out.includes('INJECTED-ITEM-FAIL'), 'console 不得含逐筆失敗之錯誤原文')
    })

    it('ORMDIAG-API-002 ORM 寫入 reject → srLog 有 orm-diag(label apis.save catch、safe {"errType":"Error"})，不含錯誤原文 INJECTED-FAIL；console 無診斷行', async function() {
        let row = await getRow()
        let o0 = S.getOut().length
        let n0 = diagOf(readLogs(S.cwd)).length
        await S.setFails({ save: 1 })
        let r = await S.fun('tokA', 'saveApi', [{ ...row, description: 'changed-by-test' }])
        await S.setFails({})
        assert.deepStrictEqual(r, { ok: false, msg: 'saveWriteFail' })
        assert.deepStrictEqual(await getRow(), row, '庫內列不變')

        let lines = await waitLogs(S.cwd, (ls) => diagOf(ls).length > n0)
        let diags = diagOf(lines).slice(n0)
        assert.deepStrictEqual(diags.map((d) => ({ label: d.label, safe: d.safe })), [{ label: 'apis.save catch', safe: { errType: 'Error' } }])
        assertNoLeak(diags, ['INJECTED-FAIL'])
        assertSafeShape(diags)

        await sleep(300)
        let out = S.getOut().slice(o0)
        assert.ok(!out.includes('apis.save catch'), `console 不得再印 w-serv-orm 之診斷行（實得 ${out.slice(0, 300)}）`)
        assert.ok(!out.includes('INJECTED-FAIL'), 'console 不得含錯誤原文')
    })

    it('ORMDIAG-API-003 deleteApi, 該筆回 ok:0 → srLog 有 orm-diag(label apis.del fail、safe {n:1,ks:[0]})，不含主鍵', async function() {
        let row = await getRow()
        let o0 = S.getOut().length
        let n0 = diagOf(readLogs(S.cwd)).length
        await S.setFailItems({ del: { n: 1, index: 0 } })
        let r = await S.fun('tokA', 'deleteApi', [VICTIM])
        await S.setFailItems({})
        assert.deepStrictEqual(r, { ok: false, msg: 'saveWriteFail' })
        assert.deepStrictEqual(await getRow(), row, '列仍在')

        let lines = await waitLogs(S.cwd, (ls) => diagOf(ls).length > n0)
        let diags = diagOf(lines).slice(n0)
        assert.deepStrictEqual(diags.map((d) => ({ label: d.label, safe: d.safe })), [{ label: 'apis.del fail', safe: { n: 1, ks: [0] } }])
        assertNoLeak(diags, ['INJECTED-ITEM-FAIL'])
        assertSafeShape(diags)

        await sleep(300)
        assert.ok(!S.getOut().slice(o0).includes('apis.del fail'), 'console 不得再印 w-serv-orm 之診斷行')
    })

    it('ORMDIAG-API-004 寫入成功 → 不產生 orm-diag（不增噪音）', async function() {
        let row = await getRow()
        let n0 = diagOf(readLogs(S.cwd)).length
        let r = await S.fun('tokA', 'saveApi', [{ ...row, description: 'changed-by-test' }])
        assert.strictEqual(r.ok, true, `寫入應成功: ${JSON.stringify(r)}`)
        await sleep(1000)
        assert.strictEqual(diagOf(readLogs(S.cwd)).length, n0, '成功寫入不應有 orm-diag')
        assert.strictEqual((await getRow()).description, 'changed-by-test', '前置: 寫入確實生效（非空轉）')
    })
})
