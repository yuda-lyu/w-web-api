//api-externalRows：外部列受保護（原則 5「開了外部同步就以外部為主」; 規格 C:\opensrcOper\dspec\外部匯入之定義與機制.md 第 4、7 節; ADR-044, R-EXT-LOCK-01）——
//真後端（隔離子行程：獨立 lmdb，預設選項埠 8555、lockExternalRows:'n' 埠 8556，SlowOrm 注入人為延遲；不碰專案 ./db 與 11005），經真實資料通道（/api/main）呼叫 kpFunExt 之 saveApi／deleteApi／getWebInfor，
//並以 POST /syncAndReplaceTabs 代表外部應用。每個 it 對應 spec 句（括號內為本輪完成條件編號）:
//  外部列(srcKey 非空)不可由後台刪除、不可改 group／srcKey 與外部擁有欄位(逐欄窮盡)、可改本系統擁有欄位; 外部管理之 group 不可新增列、不可把列改入; 違規整次拒收(零寫入);
//  選項 lockExternalRows:'n' 回到 run01 行為; 外部匯入不受此選項影響; 混雜資料(外部管理 group 內無 srcKey 之列)不鎖、不自動刪，下次匯入之行為與 README 一致且有 log 提示。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { buildBaseline } from 'w-serv-orm/src/baseline.mjs'
import contract, { fieldsExternal, fieldsLocal } from '../src/schema/contracts/apis.mjs'
import { startApiServer, sleep } from './tools/apiHarness.mjs'


let PORT_Y = 8555
let PORT_N = 8556
let S = null //預設選項（lockExternalRows 開）
let N = null //lockExternalRows:'n'

let baselineOf = (row) => buildBaseline([row], contract)
let mkExt = (k, extra = {}) => ({ srcKey: k, name: `name-${k}`, url: `http://x/${k}`, method: 'get', levels: 'L.1', version: 'v1', keywords: 'kw', state: 'ok', creator: 'c', dataSource: 'd', description: `desc-${k}`, ...extra })
let byKey = (rs, k, g) => rs.find((v) => v.srcKey === k && v.group === g) || null
let byName = (rs, name) => rs.find((v) => v.name === name) || null

//imp: 外部應用匯入（tokApp）
let imp = (srv, group, rows) => srv.sync('tokApp', { group, rows })

//mkLocal: 後台新增一列（UI 路徑 saveApi，無 id），回庫內列
async function mkLocal(srv, name, extra = {}) {
    let r = await srv.fun('tokA', 'saveApi', [{ name, url: `http://t/${name}`, method: 'get', levels: 'T', group: 'loc', ...extra }])
    assert.ok(r.ok, `新增應成功：${JSON.stringify(r)}`)
    return (await srv.list()).find((v) => v.id === r.msg[0].id)
}

//readLogs: 讀子行程 srLog 寫出之 log 檔全文
async function readLogs(srv) {
    await sleep(600)
    let fd = path.join(srv.cwd, 'logs')
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

//改外部擁有欄位之值（逐欄）: order 為數字，method 為合法方法，其餘字串
let changedValue = (f) => (f === 'order' ? 99 : f === 'method' ? 'post' : `changed-${f}`)


describe('api-externalRows (外部列受保護: 刪除、改欄位、外部管理 group、選項 n、匯入不受影響)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        S = await startApiServer({ name: 'api-externalRows-y', port: PORT_Y })
        N = await startApiServer({ name: 'api-externalRows-n', port: PORT_N, opt: { lockExternalRows: 'n' } })
    })

    after(async function() {
        this.timeout(60000)
        if (S) {
            await S.stop()
        }
        if (N) {
            await N.stop()
        }
    })

    beforeEach(async function() {
        this.timeout(30000)
        for (let srv of [S, N]) {
            await srv.setDelays({})
            await srv.wipe('apis')
            await srv.getOps(true)
        }
    })

    //--------------------------------------------------------------------------
    describe('webInfor（前端依此顯示鎖頭與唯讀）', function() {

        it('getWebInfor.lockExternalRows: 預設 y；選項 n 為 n', async function() {
            assert.strictEqual((await S.fun('tokA', 'getWebInfor')).msg.lockExternalRows, 'y')
            assert.strictEqual((await N.fun('tokA', 'getWebInfor')).msg.lockExternalRows, 'n')
        })

    })

    //--------------------------------------------------------------------------
    describe('刪除外部列（完成條件 1: 後台刪外部列被拒）', function() {

        it('deleteApi 外部列（不帶／帶最新基準）→ deleteExternalRowDenied，列仍在、內容未變；後台列與混雜列可刪', async function() {
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1')])).state, 'success')
            let ext = byKey(await S.list(), 'k1', 'ext')
            let r0 = await S.fun('tokA', 'deleteApi', [ext.id])
            assert.deepStrictEqual(r0, { ok: false, msg: 'deleteExternalRowDenied' })
            let r1 = await S.fun('tokA', 'deleteApi', [ext.id, { baseline: baselineOf(ext) }])
            assert.deepStrictEqual(r1, { ok: false, msg: 'deleteExternalRowDenied' })
            assert.deepStrictEqual((await S.list()).find((v) => v.id === ext.id), ext, '零寫入: 列完全未變（含 timeUpdate）')
            //後台列可刪
            let loc = await mkLocal(S, 'loc1')
            assert.ok((await S.fun('tokA', 'deleteApi', [loc.id])).ok)
            //拒收入 log（事件、鍵; 不含值）
            let logs = await readLogs(S)
            assert.ok(logs.includes('kpfun-deleteApi-external') && logs.includes('deleteExternalRowDenied'), 'srLog 應記錄拒收')
        })

        it('外部列於匯入後仍可被「匯入」刪除（批次少一列）——選項只管後台，不影響匯入', async function() {
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1'), mkExt('k2')])).state, 'success')
            let r = await imp(S, 'ext', [mkExt('k1')])
            assert.deepStrictEqual(r.msg, { nAdd: 0, nUpdate: 0, nDel: 1, nSame: 1 })
            assert.strictEqual(byKey(await S.list(), 'k2', 'ext'), null)
        })

    })

    //--------------------------------------------------------------------------
    describe('修改外部列（完成條件 1: 改外部擁有欄位被拒；改本系統擁有欄位可存）', function() {

        it('逐一改動每個外部擁有欄位（含 group；窮盡 fieldsExternal）→ saveExternalRowChanged，列完全未變（零寫入）', async function() {
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1')])).state, 'success')
            let ext = byKey(await S.list(), 'k1', 'ext')
            for (let f of fieldsExternal) {
                let r = await S.fun('tokA', 'saveApi', [{ ...ext, [f]: changedValue(f) }])
                assert.deepStrictEqual(r, { ok: false, msg: 'saveExternalRowChanged' }, `改 ${f}`)
                assert.deepStrictEqual((await S.list()).find((v) => v.id === ext.id), ext, `改 ${f} 被拒後列未變`)
            }
        })

        it('改 srcKey（改送為他值）→ saveExternalRowChanged，srcKey 不變；空字串（持舊畫面之回聲）不拒也不採用；帶舊基準 → saveStale（先動先贏優先）', async function() {
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1')])).state, 'success')
            let ext = byKey(await S.list(), 'k1', 'ext')
            let r0 = await S.fun('tokA', 'saveApi', [{ ...ext, srcKey: 'forged' }])
            assert.deepStrictEqual(r0, { ok: false, msg: 'saveExternalRowChanged' })
            assert.strictEqual((await S.list()).find((v) => v.id === ext.id).srcKey, 'k1')
            let r1 = await S.fun('tokA', 'saveApi', [{ ...ext, srcKey: '', tokens: 'echo' }])
            assert.ok(r1.ok, `空字串 srcKey（舊回聲）不算改：${JSON.stringify(r1)}`)
            assert.strictEqual((await S.list()).find((v) => v.id === ext.id).srcKey, 'k1', '空字串不被採用')
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1', { description: 'newer' })])).state, 'success') //外部先改
            let r = await S.fun('tokA', 'saveApi', [{ ...ext, name: 'x' }, { baseline: baselineOf(ext) }])
            assert.deepStrictEqual(r, { ok: false, msg: 'saveStale' })
        })

        it('改本系統擁有欄位（8 欄全改，含 tokens）→ 成功；外部擁有欄位／id／srcKey／group 不變；再匯入同批次 nSame 且本系統欄位保留', async function() {
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1')])).state, 'success')
            let ext = byKey(await S.list(), 'k1', 'ext')
            let patch = {}
            for (let f of fieldsLocal) {
                patch[f] = f === 'authType' ? 'bearer' : f === 'authConfigJson' ? '{"token":"t"}' : f.endsWith('Json') ? '{"a":1}' : `mine-${f}`
            }
            let r = await S.fun('tokA', 'saveApi', [{ ...ext, ...patch }, { baseline: baselineOf(ext) }])
            assert.ok(r.ok, `本系統擁有欄位應可存：${JSON.stringify(r)}`)
            let now = (await S.list()).find((v) => v.id === ext.id)
            for (let f of fieldsLocal) {
                assert.strictEqual(now[f], patch[f], `${f} 已存`)
            }
            for (let f of [...fieldsExternal, 'id', 'srcKey', 'timeCreate']) {
                assert.strictEqual(now[f], ext[f], `${f} 不變`)
            }
            assert.strictEqual(now.userIdUpdate, 'id-for-adminA', '最後修改者為後台操作者')
            let r2 = await imp(S, 'ext', [mkExt('k1')])
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
            let again = (await S.list()).find((v) => v.id === ext.id)
            for (let f of fieldsLocal) {
                assert.strictEqual(again[f], patch[f], `匯入後 ${f} 保留`)
            }
        })

        it('整列原樣送回（如編輯表單）只改 tokens → 成功；之後外部改外部擁有欄位 → 匯入 nUpdate=1 且 tokens 保留（外部為主）', async function() {
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1')])).state, 'success')
            let ext = byKey(await S.list(), 'k1', 'ext')
            let r = await S.fun('tokA', 'saveApi', [{ ...ext, tokens: 'tok-1' }, { baseline: baselineOf(ext) }])
            assert.ok(r.ok, JSON.stringify(r))
            let r2 = await imp(S, 'ext', [mkExt('k1', { name: 'renamed-by-external' })])
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 })
            let now = (await S.list()).find((v) => v.id === ext.id)
            assert.strictEqual(now.name, 'renamed-by-external')
            assert.strictEqual(now.tokens, 'tok-1')
        })

    })

    //--------------------------------------------------------------------------
    describe('寫入之值即檢查之值（外審 #1、#3）', function() {

        it('外部列之數字回聲（version 7 對庫內 "7"）通過等價比對但不被寫入: 庫內 version 仍為字串 "7"、同批再匯入 nSame', async function() {
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1', { version: 7 })])).state, 'success')
            let ext = byKey(await S.list(), 'k1', 'ext')
            assert.strictEqual(ext.version, '7', '匯入把有限數字轉字串存入')
            let r = await S.fun('tokA', 'saveApi', [{ ...ext, version: 7, tokens: 'echo-num' }])
            assert.ok(r.ok, JSON.stringify(r))
            let now = (await S.list()).find((v) => v.id === ext.id)
            assert.strictEqual(now.tokens, 'echo-num')
            assert.strictEqual(now.version, '7', '外部擁有欄位之型別不被等價回聲改寫')
            let r2 = await imp(S, 'ext', [mkExt('k1', { version: 7 })])
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
        })

        it('group 為非字串（陣列、數字、布林、物件）→ errApiRowInvalid，不寫入（新增、後台列改入、外部列回聲皆然）；否則陣列 group 會被匯入之 select({ group }) 命中而被刪', async function() {
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1')])).state, 'success')
            let loc = await mkLocal(S, 'arr-target', { group: 'loc' })
            let ext = byKey(await S.list(), 'k1', 'ext')
            let n0 = (await S.list()).length
            for (let g of [['ext'], 7, true, { a: 1 }]) {
                let rAdd = await S.fun('tokA', 'saveApi', [{ name: 'bad-add', url: 'http://t/b', method: 'get', group: g }])
                assert.deepStrictEqual(rAdd, { ok: false, msg: 'errApiRowInvalid' }, `新增 group=${JSON.stringify(g)}`)
                let rMove = await S.fun('tokA', 'saveApi', [{ ...loc, group: g }])
                assert.deepStrictEqual(rMove, { ok: false, msg: 'errApiRowInvalid' }, `改入 group=${JSON.stringify(g)}`)
                let rExt = await S.fun('tokA', 'saveApi', [{ ...ext, group: g }])
                assert.deepStrictEqual(rExt, { ok: false, msg: 'errApiRowInvalid' }, `外部列 group=${JSON.stringify(g)}`)
            }
            let after = await S.list()
            assert.strictEqual(after.length, n0, '零寫入')
            assert.strictEqual(after.find((v) => v.id === loc.id).group, 'loc')
            assert.strictEqual(after.find((v) => v.id === ext.id).group, 'ext')
            //選項 n（run01 行為）不檢查形狀
            let rn = await N.fun('tokA', 'saveApi', [{ name: 'n-mode-array', url: 'http://t/n', method: 'get', group: ['x'] }])
            assert.ok(rn.ok, JSON.stringify(rn))
        })

    })

    //--------------------------------------------------------------------------
    describe('外部管理之 group（完成條件 1: 在外部 group 新增列被拒）', function() {

        it('新增列於外部管理 group → saveExternalGroupDenied，筆數不變；其他 group、無 group、只有後台列之 group 可新增', async function() {
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1')])).state, 'success')
            await mkLocal(S, 'seed-loc', { group: 'loc' })
            let n0 = (await S.list()).length
            let r = await S.fun('tokA', 'saveApi', [{ name: 'add-ext', url: 'http://t/add', method: 'get', group: 'ext' }])
            assert.deepStrictEqual(r, { ok: false, msg: 'saveExternalGroupDenied' })
            assert.strictEqual((await S.list()).length, n0, '零寫入')
            for (let g of ['loc', '', 'brand-new']) {
                let r1 = await S.fun('tokA', 'saveApi', [{ name: `add-${g || 'nogroup'}`, url: 'http://t/x', method: 'get', group: g }])
                assert.ok(r1.ok, `group=${JSON.stringify(g)}：${JSON.stringify(r1)}`)
            }
            let logs = await readLogs(S)
            assert.ok(logs.includes('kpfun-saveApi-external') && logs.includes('saveExternalGroupDenied'))
        })

        it('後台列的 group 改入外部管理 group → saveExternalGroupDenied，列留在原 group；改到非外部 group 可', async function() {
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1')])).state, 'success')
            let loc = await mkLocal(S, 'move-me', { group: 'loc' })
            let r = await S.fun('tokA', 'saveApi', [{ ...loc, group: 'ext' }])
            assert.deepStrictEqual(r, { ok: false, msg: 'saveExternalGroupDenied' })
            assert.strictEqual((await S.list()).find((v) => v.id === loc.id).group, 'loc')
            let r2 = await S.fun('tokA', 'saveApi', [{ ...loc, group: 'loc2' }])
            assert.ok(r2.ok, JSON.stringify(r2))
            assert.strictEqual((await S.list()).find((v) => v.id === loc.id).group, 'loc2')
        })

        it('匯入使 group 變成外部管理後，該 group 先前存在之後台列隨匯入被刪（D6），其後新增被拒——後台自建之列不會留在外部 group', async function() {
            let loc = await mkLocal(S, 'before-import', { group: 'race' })
            let r = await imp(S, 'race', [mkExt('k1')])
            assert.deepStrictEqual(r.msg, { nAdd: 1, nUpdate: 0, nDel: 1, nSame: 0 }, '批次未以 id 列入之後台列被刪')
            assert.strictEqual((await S.list()).find((v) => v.id === loc.id), undefined)
            let r2 = await S.fun('tokA', 'saveApi', [{ name: 'after-import', url: 'http://t/a', method: 'get', group: 'race' }])
            assert.deepStrictEqual(r2, { ok: false, msg: 'saveExternalGroupDenied' })
        })

        it('group 內最後一列外部列被匯入刪除後（批次只剩無來源鍵之列）→ group 不再外部管理，後台可再新增', async function() {
            assert.strictEqual((await imp(S, 'gone', [mkExt('k1'), mkExt('k2')])).state, 'success')
            assert.strictEqual((await S.fun('tokA', 'saveApi', [{ name: 'try1', url: 'http://t/1', method: 'get', group: 'gone' }])).msg, 'saveExternalGroupDenied')
            let r0 = await imp(S, 'gone', [{ name: 'nokey-only', url: 'http://x/nokey-only', method: 'get' }]) //兩列外部列皆被刪，批次僅一列無鍵列（相容路徑）
            assert.deepStrictEqual(r0.msg, { nAdd: 1, nUpdate: 0, nDel: 2, nSame: 0 })
            assert.deepStrictEqual((await S.list()).filter((v) => v.group === 'gone').map((v) => v.srcKey), [''], 'group 內已無外部列')
            let r = await S.fun('tokA', 'saveApi', [{ name: 'try2', url: 'http://t/2', method: 'get', group: 'gone' }])
            assert.ok(r.ok, JSON.stringify(r))
        })

    })

    //--------------------------------------------------------------------------
    describe('混雜資料（完成條件 4: 外部 group 內已有 srcKey 為空之列：不鎖、不自動刪、下次匯入行為與 README 一致且有提示）', function() {

        // 混雜列的成因: 相容路徑之無鍵列（批次中 srcKey 與 id 皆無之列）每次匯入新增、srcKey 為空
        let seedMixed = async () => {
            let r = await imp(S, 'mix', [mkExt('mk1'), { name: 'nokey', url: 'http://x/nokey', method: 'get', description: 'no source key' }])
            assert.strictEqual(r.state, 'success', JSON.stringify(r))
            let rs = await S.list()
            let mixed = byName(rs, 'nokey')
            assert.strictEqual(mixed.srcKey, '', '無鍵列 srcKey 為空（混雜列）')
            return { ext: byKey(rs, 'mk1', 'mix'), mixed }
        }

        it('混雜列不鎖: 可改任何欄位、可刪除、可改到非外部 group；改入另一外部 group 被拒', async function() {
            let { mixed } = await seedMixed()
            assert.strictEqual((await imp(S, 'ext', [mkExt('k1')])).state, 'success')
            let r1 = await S.fun('tokA', 'saveApi', [{ ...mixed, description: 'edited-by-admin', url: 'http://x/edited' }])
            assert.ok(r1.ok, JSON.stringify(r1))
            let r2 = await S.fun('tokA', 'saveApi', [{ ...mixed, group: 'ext' }])
            assert.deepStrictEqual(r2, { ok: false, msg: 'saveExternalGroupDenied' }, '不得改入另一外部 group')
            let r3 = await S.fun('tokA', 'saveApi', [{ ...mixed, group: 'elsewhere' }])
            assert.ok(r3.ok, JSON.stringify(r3))
            let r4 = await S.fun('tokA', 'deleteApi', [mixed.id])
            assert.ok(r4.ok, `混雜列（srcKey 空）可由後台刪除：${JSON.stringify(r4)}`)
        })

        it('下次匯入: 批次未以 id 列入 → 混雜列被刪並記 warn（syncAndReplaceTabs-delNoSrcKey）；以 id 列入 → 保留並補 srcKey=id 成為外部列', async function() {
            let { mixed } = await seedMixed()
            let logs0 = await readLogs(S)
            let n0 = (logs0.match(/syncAndReplaceTabs-delNoSrcKey/g) || []).length
            //以 id 列入: 命中混雜列，補 srcKey=id（成為外部列）
            let r = await imp(S, 'mix', [mkExt('mk1'), { id: mixed.id, name: mixed.name, url: mixed.url, method: mixed.method, description: mixed.description }])
            assert.strictEqual(r.state, 'success', JSON.stringify(r))
            assert.strictEqual(r.msg.nDel, 0, '以 id 列入者不刪')
            let kept = (await S.list()).find((v) => v.id === mixed.id)
            assert.strictEqual(kept.srcKey, mixed.id, '補 srcKey=id')
            assert.deepStrictEqual(await S.fun('tokA', 'deleteApi', [mixed.id]), { ok: false, msg: 'deleteExternalRowDenied' }, '成為外部列後即受保護')
            //未列入: 另造一個混雜列（無鍵列）後以只含 mk1 之批次匯入 → 該列被刪
            assert.strictEqual((await imp(S, 'mix', [mkExt('mk1'), mkExt('mk2'), { id: mixed.id, name: mixed.name, url: mixed.url, method: mixed.method, description: mixed.description }, { name: 'nokey2', url: 'http://x/nokey2', method: 'get' }])).state, 'success')
            let nokey2 = byName(await S.list(), 'nokey2')
            assert.strictEqual(nokey2.srcKey, '')
            let r2 = await imp(S, 'mix', [mkExt('mk1'), mkExt('mk2'), { id: mixed.id, name: mixed.name, url: mixed.url, method: mixed.method, description: mixed.description }])
            assert.strictEqual(r2.msg.nDel, 1, '未以 id 列入之混雜列被刪（README Upgrade Notes）')
            assert.strictEqual(byName(await S.list(), 'nokey2'), null)
            let logs1 = await readLogs(S)
            let n1 = (logs1.match(/syncAndReplaceTabs-delNoSrcKey/g) || []).length
            assert.ok(n1 > n0, `刪除無來源鍵之列須記 warn 提示（不靜默）：${n0} → ${n1}`)
        })

    })

    //--------------------------------------------------------------------------
    describe('表鎖: 匯入與後台新增並行（外部管理 group 之判定與寫入同鎖）', function() {

        it('匯入進行中（寫入延遲）後台新增同 group → 新增等鎖，匯入完成後判為外部管理 group → saveExternalGroupDenied；庫內該 group 無後台列', async function() {
            await S.setDelays({ insert: 300, save: 300, del: 300, select: 150 })
            let pSync = imp(S, 'race2', [mkExt('k1')])
            await sleep(100)
            let pAdd = S.fun('tokA', 'saveApi', [{ name: 'racer', url: 'http://t/racer', method: 'get', group: 'race2' }])
            let [rs, ra] = await Promise.all([pSync, pAdd])
            await S.setDelays({})
            assert.strictEqual(rs.state, 'success', JSON.stringify(rs))
            assert.deepStrictEqual(ra, { ok: false, msg: 'saveExternalGroupDenied' }, '匯入先取鎖，新增於鎖內重新讀取後被拒')
            let inGroup = (await S.list()).filter((v) => v.group === 'race2')
            assert.deepStrictEqual(inGroup.map((v) => v.srcKey), ['k1'], '外部管理 group 內只有外部列')
        })

        it('後台新增先取鎖（寫入延遲）→ 匯入等鎖，隨後以 group 完整清單語意刪除該後台列；最終 group 內只有外部列', async function() {
            await S.setDelays({ insert: 300, save: 300, del: 300, select: 150 })
            let pAdd = S.fun('tokA', 'saveApi', [{ name: 'racer2', url: 'http://t/racer2', method: 'get', group: 'race3' }])
            await sleep(100)
            let pSync = imp(S, 'race3', [mkExt('k1')])
            let [ra, rs] = await Promise.all([pAdd, pSync])
            await S.setDelays({})
            assert.ok(ra.ok, JSON.stringify(ra))
            assert.strictEqual(rs.state, 'success', JSON.stringify(rs))
            assert.deepStrictEqual(rs.msg, { nAdd: 1, nUpdate: 0, nDel: 1, nSame: 0 })
            let inGroup = (await S.list()).filter((v) => v.group === 'race3')
            assert.deepStrictEqual(inGroup.map((v) => v.srcKey), ['k1'])
        })

    })

    //--------------------------------------------------------------------------
    describe(`選項 lockExternalRows:'n'（完成條件 1: 選項 n 回舊行為 = run01）`, function() {

        it('外部列可刪除、可改外部擁有欄位與 group；外部管理 group 可新增與改入；匯入照常以外部為主', async function() {
            assert.strictEqual((await imp(N, 'ext', [mkExt('k1'), mkExt('k2'), mkExt('k3')])).state, 'success')
            let rs = await N.list()
            let e1 = byKey(rs, 'k1', 'ext')
            let e2 = byKey(rs, 'k2', 'ext')
            let e3 = byKey(rs, 'k3', 'ext')
            //改外部擁有欄位
            let r1 = await N.fun('tokA', 'saveApi', [{ ...e1, name: 'admin-renamed', url: 'http://admin/u', description: 'admin-desc' }, { baseline: baselineOf(e1) }])
            assert.ok(r1.ok, JSON.stringify(r1))
            assert.strictEqual((await N.list()).find((v) => v.id === e1.id).name, 'admin-renamed')
            //srcKey 仍為伺服器專有（不採客戶端值，與 run01 相同）
            let r1b = await N.fun('tokA', 'saveApi', [{ ...e1, srcKey: 'forged' }])
            assert.ok(r1b.ok)
            assert.strictEqual((await N.list()).find((v) => v.id === e1.id).srcKey, 'k1')
            //刪除
            let r2 = await N.fun('tokA', 'deleteApi', [e2.id])
            assert.ok(r2.ok, JSON.stringify(r2))
            assert.strictEqual((await N.list()).find((v) => v.id === e2.id), undefined)
            //外部管理 group 內新增、改入
            let r3 = await N.fun('tokA', 'saveApi', [{ name: 'add-in-ext', url: 'http://t/a', method: 'get', group: 'ext' }])
            assert.ok(r3.ok, JSON.stringify(r3))
            let loc = await mkLocal(N, 'mover', { group: 'loc' })
            let r4 = await N.fun('tokA', 'saveApi', [{ ...loc, group: 'ext' }])
            assert.ok(r4.ok, JSON.stringify(r4))
            //改 group（外部列移出）
            let r5 = await N.fun('tokA', 'saveApi', [{ ...e3, group: 'moved-out' }])
            assert.ok(r5.ok, JSON.stringify(r5))
            //下次匯入以外部為主: 被後台改過的列還原、被刪的列重建、後台在外部 group 新增／改入的列被刪
            let r6 = await imp(N, 'ext', [mkExt('k1'), mkExt('k2')])
            assert.strictEqual(r6.state, 'success', JSON.stringify(r6))
            let after = await N.list()
            assert.strictEqual(byKey(after, 'k1', 'ext').name, 'name-k1', '外部為主: 後台改過之外部擁有欄位被還原')
            assert.ok(byKey(after, 'k2', 'ext'), '被後台刪除之外部列由匯入重建')
            assert.strictEqual(byName(after, 'add-in-ext'), null, '後台在外部 group 新增之列被匯入刪除')
            assert.strictEqual(byName(after, 'mover'), null, '後台改入外部 group 之列被匯入刪除')
        })

        it(`選項 n 不改變: 後台列／錯誤路徑照常（刪除不存在 → errApiRowNotFound；saveStale）`, async function() {
            let loc = await mkLocal(N, 'plain', { group: 'loc' })
            assert.deepStrictEqual(await N.fun('tokA', 'deleteApi', ['no-such']), { ok: false, msg: 'errApiRowNotFound' })
            assert.ok((await N.fun('tokB', 'saveApi', [{ ...loc, description: 'b' }])).ok)
            assert.deepStrictEqual(await N.fun('tokA', 'saveApi', [{ ...loc, description: 'a' }, { baseline: baselineOf(loc) }]), { ok: false, msg: 'saveStale' })
        })

    })

})
