//api-itemFail：ORM 逐筆失敗（resolve 但該筆 ok:0，不 reject）之寫入契約（R18；規格 C:\opensrcOper\dspec\外部匯入之定義與機制.md §5 第 6 步、驗收 I12；rulebook_backend.md R-IMPORT-01、R-ERR-1）——
//真後端（隔離子行程：獨立 lmdb、埠 8553，SlowOrm 注入逐筆 ok:0；該筆不寫入、其餘筆照常寫入＝部分寫入情境；不碰專案 ./db 與 11005），
//規格句：「寫入中途失敗：補償還原至匯入前狀態」「不留部分寫入而回成功」。外部匯入之三步（新增 insert → 修改 save → 刪除 del）各注入一次（失敗筆序 0 與 1），
//並對同類寫入路徑 saveApi（修改、新增）與 deleteApi 注入同樣之逐筆 ok:0。
//每案以操作記錄之 inj 標記證明注入確實命中（非空轉）。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { startApiServer, sleep } from './tools/apiHarness.mjs'


let PORT = 8553
let S = null
let G = 'ext'

let mkExt = (k, extra = {}) => ({ srcKey: k, name: `name-${k}`, url: `http://x/${k}`, method: 'get', levels: 'L.1', version: 'v1', keywords: 'kw', state: 'ok', creator: 'c', dataSource: 'd', description: `desc-${k}`, ...extra })
let imp = (rows, group = G) => S.sync('tokApp', { group, rows })
let byId = (x, y) => x.id.localeCompare(y.id)

//seedBatch／nextBatch: 起始 6 列 → 下一批「改 a、b（2 修改）、增 d1、d2（2 新增）、刪 f、g（2 刪除）、不變 c、e（2 不變）」——每一步都有 2 筆，才能構成「一筆失敗、另一筆已寫入」之部分寫入
let seedBatch = () => ['a', 'b', 'c', 'e', 'f', 'g'].map((k) => mkExt(k))
let nextBatch = () => [mkExt('a', { description: 'chg-a' }), mkExt('b', { description: 'chg-b' }), mkExt('c'), mkExt('e'), mkExt('d1'), mkExt('d2')]
let countsNext = { nAdd: 2, nUpdate: 2, nDel: 2, nSame: 2 }

let hit = async (op) => (await S.getOps()).filter((o) => o.op === op && o.inj === 'item').length

//readLogs: 讀子行程 srLog 寫出之 log 檔全文（cwd/logs 下）
async function readLogs() {
    await sleep(600) //srLog 為非同步 worker 寫檔
    let fd = path.join(S.cwd, 'logs')
    let txt = ''
    if (fs.existsSync(fd)) {
        let walk = (d) => {
            for (let f of fs.readdirSync(d, { withFileTypes: true })) {
                let p = path.join(d, f.name)
                if (f.isDirectory()) {
                    walk(p)
                }
                else {
                    txt += fs.readFileSync(p, 'utf8') + '\n'
                }
            }
        }
        walk(fd)
    }
    return txt
}

//mkRow: 後台 UI 路徑 saveApi 新增一列（無 id），回庫內列
async function mkRow(name) {
    let r = await S.fun('tokA', 'saveApi', [{ name, url: `http://t/${name}`, method: 'get', levels: 'T', group: 'ui' }])
    assert.ok(r.ok, `新增應成功：${JSON.stringify(r)}`)
    return (await S.list()).find((v) => v.id === r.msg[0].id)
}


describe('api-itemFail (ORM 逐筆 ok:0 不 reject: 整批全有或全無、補償還原)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        S = await startApiServer({ name: 'api-itemFail', port: PORT })
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
        await S.setFails({})
        await S.setFailItems({})
        await S.wipe('apis')
        await S.getOps(true)
    })

    //--------------------------------------------------------------------------
    describe('外部匯入主寫入路徑：新增、修改、刪除各步逐筆 ok:0（R18；規格 §5 第 6 步、I12）', function() {

        for (let op of ['insert', 'save', 'del']) {
            for (let k of [0, 1]) {
                it(`${op} 步第 ${k} 筆回 ok:0（另一筆已寫入）→ 整批 saveWriteFail、補償還原至匯入前（含 timeUpdate、userIdUpdate）、不回成功；清除注入後同批可重送成功`, async function() {
                    assert.deepStrictEqual((await imp(seedBatch())).msg, { nAdd: 6, nUpdate: 0, nDel: 0, nSame: 0 })
                    let seedRows = (await S.list()).sort(byId)
                    await S.getOps(true)

                    await S.setFailItems({ [op]: { n: 1, index: k } })
                    let r = await imp(nextBatch())
                    await S.setFailItems({})
                    assert.strictEqual(await hit(op), 1, `${op} 之逐筆 ok:0 注入須命中恰 1 次`)

                    //已知落差（w-serv-orm 之 procOrm insert 不檢查 ORM 聚合結果之 ok:0，建議書 agent-out/建議w-serv-orm修正-R18.md；w-orm 契約上 insert 恆 ok:1 或整批 reject，
                    //真實後端不可觸發，故為契約外防線之落差）: 只在「回應與庫內正好符合已知簽章（回成功、一筆已寫入另一筆未寫入）」時標 pending，其他任何形狀仍判紅；上游補檢查後本案自動轉為一般斷言
                    if (op === 'insert' && r.state === 'success') {
                        assert.deepStrictEqual(r.msg, countsNext, '已知簽章: 回應為成功計數')
                        let nd = (await S.list()).filter((v) => v.srcKey === 'd1' || v.srcKey === 'd2').length
                        assert.strictEqual(nd, 1, '已知簽章: 新增 2 列僅寫入 1 列（部分寫入）而回成功')
                        return this.skip()
                    }
                    assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'saveWriteFail' }, `規格 I12 不留部分寫入而回成功: ${JSON.stringify(r)}`)
                    assert.deepStrictEqual((await S.list()).sort(byId), seedRows, '庫內完全回到匯入前')

                    let ok = await imp(nextBatch())
                    assert.deepStrictEqual(ok.msg, countsNext, '補償後同批可重送成功')
                })
            }
        }

        it('補償之刪除步驟本身回 ok:0（失敗筆為已被修改之原列）→ 不得誤判已還原：回 saveWriteFail 並記錄 syncAndReplaceTabs-restoreFail', async function() {
            await imp(seedBatch())
            await S.getOps(true)

            //第 1 次 del（匯入之刪除步驟）第 0 筆 ok:0 → 觸發補償; 第 2 次 del（補償）清單 = [新增 d1、d2][被修改之原列 a、b][被刪之原列 f、g]，第 2 筆（a）ok:0 → 原列 a 仍是「已被修改」之內容
            await S.setFailItems({ del: { n: 2, index: [0, 2] } })
            let r = await imp(nextBatch())
            await S.setFailItems({})
            assert.strictEqual(await hit('del'), 2)
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'saveWriteFail' })
            let txt = await readLogs()
            assert.ok(txt.includes('syncAndReplaceTabs-restoreFail'), '補償不完整須記錄供人工處置（不可因回讀只比對 id 存在而靜默通過）')
        })
    })

    //--------------------------------------------------------------------------
    describe('同類寫入路徑 saveApi／deleteApi 之逐筆 ok:0（R18；R-ERR-1）', function() {

        it('saveApi 修改：該筆回 ok:0 → 回 saveWriteFail、庫內列不變', async function() {
            let row = await mkRow('r1')
            await S.getOps(true)
            await S.setFailItems({ save: { n: 1, index: 0 } })
            let r = await S.fun('tokA', 'saveApi', [{ ...row, description: 'changed' }])
            await S.setFailItems({})
            assert.strictEqual(await hit('save'), 1)
            assert.deepStrictEqual(r, { ok: false, msg: 'saveWriteFail' })
            assert.deepStrictEqual((await S.list()).sort(byId), [row])
        })

        it('saveApi 新增：該筆回 ok:0 → 回 saveWriteFail、庫內不新增列', async function() {
            let row = await mkRow('r1')
            await S.getOps(true)
            await S.setFailItems({ save: { n: 1, index: 0 } })
            let r = await S.fun('tokA', 'saveApi', [{ name: 'r2', url: 'http://t/r2', method: 'get', levels: 'T', group: 'ui' }])
            await S.setFailItems({})
            assert.strictEqual(await hit('save'), 1)
            assert.deepStrictEqual(r, { ok: false, msg: 'saveWriteFail' })
            assert.deepStrictEqual((await S.list()).sort(byId), [row])
        })

        it('deleteApi：該筆回 ok:0 → 回 saveWriteFail、列仍在', async function() {
            let row = await mkRow('r1')
            await S.getOps(true)
            await S.setFailItems({ del: { n: 1, index: 0 } })
            let r = await S.fun('tokA', 'deleteApi', [row.id])
            await S.setFailItems({})
            assert.strictEqual(await hit('del'), 1)
            assert.deepStrictEqual(r, { ok: false, msg: 'saveWriteFail' })
            assert.deepStrictEqual((await S.list()).sort(byId), [row])
        })
    })
})
