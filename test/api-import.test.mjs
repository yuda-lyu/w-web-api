//api-import：外部匯入（原則 11；規格 C:\opensrcOper\dspec\外部匯入之定義與機制.md；rulebook_backend.md R-IMPORT-01；ADR-043）——
//POST /syncAndReplaceTabs 依外部自訂之來源鍵 srcKey 於 apis 表鎖內差異同步（新增／刪除／修改／不變），回 { nAdd, nUpdate, nDel, nSame }。
//真後端（隔離子行程：獨立 lmdb、埠 8552，SlowOrm 注入人為延遲與失敗；不碰專案 ./db 與 11005），走實際匯入入口（含 base64: 還原、clearXSS 改寫、轉型）。
//每個 it 對應規格驗收 I1～I14（括號）與 inv01 缺陷（E8 同步換 id、C4b 本系統擁有欄位被清空、A5 timeCreate 重設、A1 不取鎖、ADR-016 非原子）。
//不提供呼叫端相容（2026-10-23 使用者裁示；規格 §9、驗收 I13／I15；ADR-046）：srcKey 即刻必填——缺（含只送 id）、空、非字串 → 整批 errRowInvalid（＝規格之 srcKeyInvalid）；
//列帶 id（即使同時有 srcKey）→ 整批 idNotAllowed；皆零寫入。舊資料遷移（I15，一次性、非呼叫端相容）：既有無 srcKey 之外部列，批次 srcKey 等於其 id 者視為同一列並補 srcKey，id 不變、本地欄位保留。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { buildBaseline } from 'w-serv-orm/src/baseline.mjs'
import contract, { fieldsLocal } from '../src/schema/contracts/apis.mjs'
import { startApiServer, sleep, mkLegacyRow } from './tools/apiHarness.mjs'


let PORT = 8552
let S = null
let G = 'ext' //外部來源範圍（group）

let baselineOf = (row) => buildBaseline([row], contract)
let mkExt = (k, extra = {}) => ({ srcKey: k, name: `name-${k}`, url: `http://x/${k}`, method: 'get', levels: 'L.1', version: 'v1', keywords: 'kw', state: 'ok', creator: 'c', dataSource: 'd', description: `desc-${k}`, ...extra })
let imp = (rows, group = G, token = 'tokApp') => S.sync(token, { group, rows })
let byKey = (rs, k, g = G) => rs.find((v) => v.srcKey === k && v.group === g) || null

//pick: 取列的指定欄位（比較「除時間與最後修改者外是否完全未變」用）
let strip = (v) => {
    let o = { ...v }
    delete o.timeUpdate
    delete o.userIdUpdate
    return o
}

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

async function clean() {
    await S.wipe('apis') //直接清表: 外部列受保護後 deleteApi 不能刪外部列（api-run02, ADR-044），清理屬測試鷹架
}


describe('api-import (外部匯入: srcKey 差異同步)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        S = await startApiServer({ name: 'api-import', port: PORT })
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
        await clean()
        await S.getOps(true)
    })

    //--------------------------------------------------------------------------
    describe('冪等、新增、刪除、修改（I1～I5；E8）', function() {

        it('I1／V2／E8: 同一批次重送 → 回 nSame＝全數、零寫入（ORM 無任何 save／insert／del）、內部 id 不變、後台以匯入前之基準仍可存', async function() {
            let rows = [mkExt('a'), mkExt('b'), mkExt('c', { name: '含特殊字元 a<b', description: '孔深 < 500 m 且 > 10 m' })]
            let r1 = await imp(rows)
            assert.strictEqual(r1.state, 'success', JSON.stringify(r1))
            assert.deepStrictEqual(r1.msg, { nAdd: 3, nUpdate: 0, nDel: 0, nSame: 0 })
            let before = await S.list()
            assert.strictEqual(before.length, 3)
            let base = baselineOf(byKey(before, 'a'))
            await S.getOps(true)
            let r2 = await imp(rows)
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 3 }, '重送：全數相同（含 clearXSS 改寫之 a<b → a&lt;b 亦視為相同）')
            let writes = (await S.getOps(true)).filter((o) => o.op !== 'select')
            assert.deepStrictEqual(writes, [], '零寫入——不再 delAll＋insert')
            let after = await S.list()
            assert.deepStrictEqual(after.map((v) => v.id).sort(), before.map((v) => v.id).sort(), '內部 id 不變（E8）')
            assert.deepStrictEqual(after.map(strip).sort((x, y) => x.id.localeCompare(y.id)), before.map(strip).sort((x, y) => x.id.localeCompare(y.id)), '內容與 timeUpdate 皆不變')
            assert.strictEqual(byKey(after, 'a').timeUpdate, byKey(before, 'a').timeUpdate, '不寫 → timeUpdate 不變')
            let rs = await S.fun('tokA', 'saveApi', [{ ...byKey(after, 'a'), tokens: 'mine' }, { baseline: base }])
            assert.ok(rs.ok, `匯入前之基準仍可存（基準不變）：${JSON.stringify(rs)}`)
        })

        it('I2: 批次新增一列 → nAdd=1、配新 id（非 srcKey）、其餘不動；新增列：本系統擁有欄位初始為空字串、isActive=y、userIdUpdate 為 app 使用者', async function() {
            await imp([mkExt('a'), mkExt('b')])
            let b0 = await S.list()
            let r = await imp([mkExt('a'), mkExt('b'), mkExt('n')])
            assert.deepStrictEqual(r.msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 2 })
            let rs = await S.list()
            let n = byKey(rs, 'n')
            assert.ok(n && typeof n.id === 'string' && n.id !== 'n', '內部 id 由本系統產生，不等於來源鍵')
            assert.strictEqual(n.group, G)
            assert.strictEqual(n.isActive, 'y')
            assert.strictEqual(n.userIdUpdate, 'id-for-app')
            for (let f of fieldsLocal) {
                assert.strictEqual(n[f], '', `新增列之本系統擁有欄位 ${f} 初始為空字串`)
            }
            for (let k of ['a', 'b']) {
                assert.deepStrictEqual(byKey(rs, k), byKey(b0, k), `其餘列 ${k} 完全不動（含 timeUpdate）`)
            }
        })

        it('I3: 批次少一列 → 該列刪除，其餘不動', async function() {
            await imp([mkExt('a'), mkExt('b'), mkExt('c')])
            let b0 = await S.list()
            let r = await imp([mkExt('a'), mkExt('c')])
            assert.deepStrictEqual(r.msg, { nAdd: 0, nUpdate: 0, nDel: 1, nSame: 2 })
            let rs = await S.list()
            assert.strictEqual(rs.length, 2)
            assert.strictEqual(byKey(rs, 'b'), null)
            assert.deepStrictEqual(byKey(rs, 'a'), byKey(b0, 'a'))
            assert.deepStrictEqual(byKey(rs, 'c'), byKey(b0, 'c'))
        })

        it('I4／I5: 某列外部擁有欄位改變（含改名；同 srcKey）→ nUpdate=1、id 不變；批次缺該欄視為空值；後台持匯入前基準被拒、持新基準可存（I11）', async function() {
            await imp([mkExt('a'), mkExt('b')])
            let b0 = await S.list()
            let a0 = byKey(b0, 'a')
            let baseOld = baselineOf(a0)
            let r = await imp([mkExt('a', { name: 'renamed-a', description: undefined }), mkExt('b')])
            assert.deepStrictEqual(r.msg, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 1 })
            let rs = await S.list()
            let a1 = byKey(rs, 'a')
            assert.strictEqual(a1.id, a0.id, 'id 保留')
            assert.strictEqual(a1.name, 'renamed-a')
            assert.strictEqual(a1.description, '', '批次缺 description → 視為空值寫入（外部為主）')
            assert.strictEqual(a1.timeCreate, a0.timeCreate, 'A5: timeCreate 只於新增時寫')
            assert.deepStrictEqual(byKey(rs, 'b'), byKey(b0, 'b'), '未變列不動')
            //I11: 匯入有改變內容 → 持舊畫面之後台存檔被拒（以外部為主）；持新基準可存
            let rOld = await S.fun('tokA', 'saveApi', [{ ...a0, keywords: 'mine' }, { baseline: baseOld }])
            assert.deepStrictEqual(rOld, { ok: false, msg: 'saveStale' })
            let rNew = await S.fun('tokA', 'saveApi', [{ ...a1, tokens: 'mine' }, { baseline: baselineOf(a1) }])
            assert.ok(rNew.ok)
        })

        it('A5: 匯入更新既有列不重設 timeCreate；isActive 不被匯入改寫（後台 UI 存過 y，匯入後仍 y）', async function() {
            await imp([mkExt('a')])
            let a0 = byKey(await S.list(), 'a')
            await sleep(1100) //時間欄為秒級字串，隔秒才分辨得出是否被重設
            await imp([mkExt('a', { name: 'changed' })])
            let a1 = byKey(await S.list(), 'a')
            assert.strictEqual(a1.timeCreate, a0.timeCreate)
            assert.notStrictEqual(a1.timeUpdate, a0.timeUpdate, '有改變 → 有寫入 → timeUpdate 更新')
            assert.strictEqual(a1.isActive, 'y')
        })

    })

    //--------------------------------------------------------------------------
    describe('欄位歸屬：本系統擁有欄位匯入一律不寫（I6；C4b）', function() {

        it('I6／C4b: tokens、authType、authConfigJson、testBaseUrl、default*Json、contentType 於匯入後維持庫內值（即使批次帶了也忽略）', async function() {
            await imp([mkExt('a')])
            let a0 = byKey(await S.list(), 'a')
            let mine = {
                tokens: 'my-token-1;my-token-2',
                authType: 'bearer',
                authConfigJson: '{"token":"{token}"}',
                testBaseUrl: 'http://test.local',
                defaultHeadersJson: '{"X-A":"1"}',
                defaultQueryJson: '{"q":"1"}',
                defaultBodyJson: '{"b":1}',
                contentType: 'text/plain',
            }
            let rs = await S.fun('tokA', 'saveApi', [{ ...a0, ...mine }, { baseline: baselineOf(a0) }])
            assert.ok(rs.ok)
            let a1 = byKey(await S.list(), 'a')
            for (let f of fieldsLocal) {
                assert.strictEqual(a1[f], mine[f], `編輯表單寫入 ${f}`)
            }
            //再匯入：外部內容改變（觸發 nUpdate）且批次夾帶偽造之本系統擁有欄位
            let r = await imp([mkExt('a', { description: 'ext-changed', tokens: 'EVIL', authType: 'none', authConfigJson: '{}', testBaseUrl: 'http://evil', defaultHeadersJson: '{}', defaultQueryJson: '{}', defaultBodyJson: '{}', contentType: '', isActive: 'n', timeCreate: '1999-01-01 00:00:00', userIdUpdate: 'forged' })])
            assert.deepStrictEqual(r.msg, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 })
            let a2 = byKey(await S.list(), 'a')
            for (let f of fieldsLocal) {
                assert.strictEqual(a2[f], mine[f], `匯入後 ${f} 維持庫內值`)
            }
            assert.strictEqual(a2.description, 'ext-changed', '外部擁有欄位照寫')
            assert.strictEqual(a2.isActive, a1.isActive, 'isActive 不被批次改寫')
            assert.strictEqual(a2.timeCreate, a1.timeCreate)
            assert.strictEqual(a2.userIdUpdate, 'id-for-app', 'userIdUpdate 由 procOrm 寫操作者，批次值不採用')
            //新增列帶偽造之本系統擁有欄位 → 亦被忽略（初始空字串）
            await imp([mkExt('a'), mkExt('z', { tokens: 'EVIL', authType: 'basic', contentType: 'x' })])
            let z = byKey(await S.list(), 'z')
            for (let f of fieldsLocal) {
                assert.strictEqual(z[f], '', `新增列 ${f} 不採批次值`)
            }
        })

        it('身分欄: 範圍（group）由請求決定，批次列自帶之 group 不採用——新增與修改皆然，不致寫入他群組', async function() {
            let r1 = await imp([mkExt('g1', { group: 'other-scope' }), mkExt('g2')])
            assert.deepStrictEqual(r1.msg, { nAdd: 2, nUpdate: 0, nDel: 0, nSame: 0 })
            let rs = await S.list()
            assert.strictEqual(byKey(rs, 'g1', G).group, G, '新增列之 group 為請求之 group')
            assert.strictEqual(rs.filter((v) => v.group === 'other-scope').length, 0, '不得出現批次自帶之 group')
            let r2 = await imp([mkExt('g1', { group: 'other-scope', name: 'renamed' }), mkExt('g2')])
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 1 })
            rs = await S.list()
            assert.strictEqual(byKey(rs, 'g1', G).name, 'renamed')
            assert.strictEqual(rs.filter((v) => v.group === 'other-scope').length, 0)
        })

        it('I6 補: 本系統擁有欄位有值之列，於「外部內容不變」之重送中零寫入（不因本地欄不同而誤判為改變）', async function() {
            await imp([mkExt('a')])
            let a0 = byKey(await S.list(), 'a')
            assert.ok((await S.fun('tokA', 'saveApi', [{ ...a0, tokens: 't', authType: 'bearer' }, { baseline: baselineOf(a0) }])).ok)
            await S.getOps(true)
            let r = await imp([mkExt('a')])
            assert.deepStrictEqual(r.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
            assert.deepStrictEqual((await S.getOps(true)).filter((o) => o.op !== 'select'), [], '零寫入')
        })

    })

    //--------------------------------------------------------------------------
    describe('整批驗證、全有或全無（I7～I10）', function() {

        let seed = async () => {
            await imp([mkExt('a'), mkExt('b')])
            await S.fun('tokA', 'saveApi', [{ name: 'ui-row', url: 'http://ui', method: 'get', group: 'ui' }])
            return await S.list()
        }
        let expectNoChange = async (before, label) => {
            let after = await S.list()
            assert.deepStrictEqual(after.sort((x, y) => x.id.localeCompare(y.id)), before.sort((x, y) => x.id.localeCompare(y.id)), `${label}: 拒收後庫內完全不變（零寫入）`)
        }

        it('I7: 空／非字串／不合規／同批重複的 srcKey 與其他列檢核失敗 → 整批 errRowInvalid、零寫入（其餘合法列亦不寫）；缺 srcKey 與列帶 id 見 I13', async function() {
            let before = await seed()
            let ok = mkExt('good-new')
            let cases = {
                'srcKey 空字串': [ok, { ...mkExt('x'), srcKey: '' }],
                'srcKey 為數字': [ok, { ...mkExt('x'), srcKey: 5 }],
                'srcKey 為物件': [ok, { ...mkExt('x'), srcKey: { a: 1 } }],
                'srcKey 為 null（提供空值不得降級為無鍵列）': [ok, { ...mkExt('x'), srcKey: null }],
                'srcKey 含 HTML 標記': [ok, mkExt('<script>alert(1)</script>')],
                'srcKey 含白名單標籤': [ok, mkExt('<b>key</b>')],
                'srcKey 為孤立代理字元': [ok, mkExt('\ud800')],
                'name 經字元清理後為空': [ok, { ...mkExt('x'), name: '<!--x-->' }],
                '外部欄位為物件': [ok, { ...mkExt('x'), description: { a: 1 } }],
                '外部欄位為陣列': [ok, { ...mkExt('x'), keywords: ['a'] }],
                'srcKey 超過 1978 位元組': [ok, mkExt('k'.repeat(1979))],
                '同批 srcKey 重複': [ok, mkExt('dup'), mkExt('dup')],
                'srcKey 為 base64: 空值（還原後為空字串）': [ok, mkExt('x', { srcKey: 'base64:' })],
                '缺必填 name': [ok, { srcKey: 'k', url: 'http://u' }],
                '缺必填 url': [ok, { srcKey: 'k', name: 'n' }],
                'name 為 base64: 空值': [ok, { srcKey: 'k', name: 'base64:', url: 'http://u' }],
                '非物件列': [ok, null],
            }
            for (let [label, rows] of Object.entries(cases)) {
                let r = await imp(rows)
                assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errRowInvalid' }, `${label}: ${JSON.stringify(r)}`)
                await expectNoChange(before, label)
            }
        })

        it('I8: 空批次（rows 為空陣列／非陣列）→ 拒收 errRowsInvalid（不誤清該來源）；group 為空／非字串 → errGroupInvalid', async function() {
            let before = await seed()
            for (let rows of [[], 'x', null, 123, {}]) {
                let r = await imp(rows)
                assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errRowsInvalid' }, JSON.stringify(rows))
            }
            for (let g of ['', null, 5, undefined, 'a<b']) {
                let r = await S.sync('tokApp', { group: g, rows: [mkExt('q')] })
                assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errGroupInvalid' }, `group=${JSON.stringify(g)}`)
            }
            await expectNoChange(before, 'I8')
        })

        it('I9／I10: 他群組、後台自建之列永不被觸及；相同 srcKey 於不同群組各自獨立；srcKey 與他群組某列之 id 同值不構成配對（於本群組新增）；列帶他群組某列之 id → idNotAllowed 且雙方不變', async function() {
            let before = await seed()
            //同 srcKey 於另一群組：各自獨立
            let r = await imp([mkExt('a', { name: 'in-other-group' })], 'ext2')
            assert.deepStrictEqual(r.msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 })
            let rs = await S.list()
            assert.strictEqual(byKey(rs, 'a', 'ext2').name, 'in-other-group')
            assert.deepStrictEqual(byKey(rs, 'a', G), before.find((v) => v.srcKey === 'a' && v.group === G), '原群組之同 srcKey 列不動')
            //重送原群組（少一列）不碰 ext2 與 ui 群組之列
            let b2 = await S.list()
            let r2 = await imp([mkExt('a')])
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 1, nSame: 1 })
            let after = await S.list()
            assert.deepStrictEqual(after.filter((v) => v.group !== G), b2.filter((v) => v.group !== G), '他群組與後台自建（ui）之列完全不動')
            //列帶他群組某列之 id（外部不得指定 id）→ 整批拒收、雙方不變
            let uiRow = after.find((v) => v.group === 'ui')
            let before3 = await S.list()
            let r3 = await imp([mkExt('a'), mkExt('steal', { id: uiRow.id })])
            assert.deepStrictEqual({ state: r3.state, msg: r3.msg }, { state: 'error', msg: 'idNotAllowed' })
            assert.deepStrictEqual(await S.list(), before3, '雙方不變')
            //srcKey 與他群組某列之 id 同值：srcKey 的命名空間是各群組自己的，不配對、不觸及該列，於本群組新增
            let r3b = await imp([mkExt('a'), mkExt(uiRow.id)])
            assert.deepStrictEqual(r3b.msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 1 })
            let after3 = await S.list()
            assert.deepStrictEqual(after3.find((v) => v.id === uiRow.id), uiRow, '他群組該列完全不動')
            assert.strictEqual(byKey(after3, uiRow.id).group, G)
            assert.notStrictEqual(byKey(after3, uiRow.id).id, uiRow.id)
            //group 空字串＝後台自建之列，不是來源範圍
            let r4 = await S.sync('tokApp', { group: '', rows: [mkExt('a')] })
            assert.strictEqual(r4.msg, 'errGroupInvalid')
        })

        it('列物件含 length、constructor 等任意欄位名不致崩潰、不被複製進庫（R-OBJ-ITER-01 / R-KEY-01 維持）；含 __proto__ 鍵之本文在 HTTP 層即被拒（hapi 原型污染防護）、不寫入', async function() {
            let row = JSON.parse('{"srcKey":"p1","name":"n","url":"http://u","length":999999999,"constructor":"x","toString":"y"}')
            let r = await imp([row])
            assert.strictEqual(r.state, 'success', JSON.stringify(r))
            let p = byKey(await S.list(), 'p1')
            assert.ok(p)
            assert.strictEqual(p.length, undefined)
            assert.strictEqual(p.constructor, Object, '不以外部欄位名覆寫')
            assert.strictEqual(typeof p.toString, 'function')
            let before = await S.list()
            let res = await fetch(`${S.base}/syncAndReplaceTabs?token=tokApp&keyTable=apis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"group":"ext","rows":[{"srcKey":"p2","name":"n","url":"http://u","__proto__":{"polluted":"y"}}]}' })
            assert.strictEqual(res.status, 400)
            assert.deepStrictEqual(await S.list(), before)
            assert.strictEqual(({}).polluted, undefined)
        })

    })

    //--------------------------------------------------------------------------
    describe('轉型與入口（base64: 還原、clearXSS、數字欄位）', function() {

        it('base64: 前綴欄位自動還原（含多行 markdown、JSON）；srcKey 亦可 base64: 還原；重送冪等', async function() {
            let md = '### GET網址參數\n| 參數 | 型別 |\n| -- | -- |\n| token | STRING |\n'
            let ex = '[\n  {"id":"x","v":1.5}\n]'
            let b64 = (s) => 'base64:' + Buffer.from(s, 'utf8').toString('base64')
            let rows = [mkExt('b', { srcKey: b64('src-鍵/1'), mdInputParams: b64(md), outputExample: b64(ex) })]
            let r1 = await imp(rows)
            assert.deepStrictEqual(r1.msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 }, JSON.stringify(r1))
            let a = (await S.list())[0]
            assert.strictEqual(a.srcKey, 'src-鍵/1')
            assert.strictEqual(a.mdInputParams, md)
            assert.strictEqual(a.outputExample, ex)
            let r2 = await imp(rows)
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
        })

        it('order 由外部給（數字／字串各依原值）、clearXSS 改寫值重送冪等、數字與字串不互轉（"5" 與 5 視為不同 → 改一次後穩定）', async function() {
            let rows = [mkExt('o', { order: 5, name: 'a<b>c', description: '<script>x</script>' })]
            assert.deepStrictEqual((await imp(rows)).msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 })
            assert.deepStrictEqual((await imp(rows)).msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 }, '含標記之值經 clearXSS 改寫後重送仍視為相同')
            assert.deepStrictEqual((await imp([mkExt('o', { order: '5', name: 'a<b>c', description: '<script>x</script>' })])).msg, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 0 }, '數字 5 與字串 "5" 不互轉')
            assert.deepStrictEqual((await imp([mkExt('o', { order: '5', name: 'a<b>c', description: '<script>x</script>' })])).msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
        })

    })

    //--------------------------------------------------------------------------
    describe('並行與中途失敗（I11、I12；ADR-016 非原子之消除）', function() {

        it('I11: 匯入與後台存檔並行——同一把 apis 表鎖序列化；匯入完成後持舊基準者被拒、持新基準者可存', async function() {
            await imp([mkExt('a'), mkExt('b')])
            let a0 = byKey(await S.list(), 'a')
            let base0 = baselineOf(a0)
            await S.setDelays({ select: 250, save: 250 })
            let pI = imp([mkExt('a', { description: 'ext-new' }), mkExt('b')])
            await sleep(80)
            let pS = S.fun('tokA', 'saveApi', [{ ...a0, keywords: 'mine' }, { baseline: base0 }])
            let [ri, rsv] = await Promise.all([pI, pS])
            await S.setDelays({})
            assert.deepStrictEqual(ri.msg, { nAdd: 0, nUpdate: 1, nDel: 0, nSame: 1 })
            assert.deepStrictEqual(rsv, { ok: false, msg: 'saveStale' }, '先到的匯入先寫入；後台持舊基準於鎖內比對 → 被拒')
            let a1 = byKey(await S.list(), 'a')
            assert.strictEqual(a1.description, 'ext-new')
            assert.strictEqual(a1.keywords, a0.keywords, '被拒者零寫入')
            assert.ok((await S.fun('tokA', 'saveApi', [{ ...a1, tokens: 'mine' }, { baseline: baselineOf(a1) }])).ok)
        })

        it('I12: 寫入中途失敗（人為注入）——補償還原至匯入前狀態並回 saveWriteFail，不留部分寫入（新增、修改、刪除各步失敗皆然）', async function() {
            await imp([mkExt('a'), mkExt('b'), mkExt('c')])
            let seedRows = await S.list()
            let batch = [mkExt('a', { description: 'changed-a' }), mkExt('c'), mkExt('d')] //改 a、刪 b、增 d
            for (let op of ['insert', 'save', 'del']) {
                await S.setFails({ [op]: 1 })
                let r = await imp(batch)
                assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'saveWriteFail' }, `${op} 失敗: ${JSON.stringify(r)}`)
                await S.setFails({})
                let now = await S.list()
                assert.deepStrictEqual(now.sort((x, y) => x.id.localeCompare(y.id)), seedRows.slice().sort((x, y) => x.id.localeCompare(y.id)), `${op} 失敗後庫內完全回到匯入前（含 timeUpdate、userIdUpdate）`)
            }
            //補償後可重送成功
            let ok = await imp(batch)
            assert.deepStrictEqual(ok.msg, { nAdd: 1, nUpdate: 1, nDel: 1, nSame: 1 })
        })

        it('I12 補: 補償本身也失敗 → 明確回報 saveWriteFail 並記錄 restoreFail（不回成功）', async function() {
            await imp([mkExt('a'), mkExt('b')])
            await S.setFails({ del: 2 }) //刪除步驟失敗，補償時的 del 亦失敗
            let r = await imp([mkExt('a')]) //刪 b（僅刪除步驟）
            await S.setFails({})
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'saveWriteFail' })
            let txt = await readLogs()
            assert.ok(txt.includes('syncAndReplaceTabs-orm'), '寫入失敗入 srLog')
            assert.ok(txt.includes('syncAndReplaceTabs-restoreFail'), '無法補償須記錄供人工處置')
            assert.ok(!txt.includes('name-a') && !txt.includes('desc-a'), 'log 不含列內容值')
        })

    })

    //--------------------------------------------------------------------------
    describe('不提供呼叫端相容（I13）、一次性遷移（I15）與其他', function() {

        it('I13: 缺 srcKey（無該欄）／只送 id／srcKey 與 id 並送／混批（部分列缺 srcKey）→ 整批拒收（errRowInvalid＝規格之 srcKeyInvalid；列帶 id 為 idNotAllowed）、零寫入（庫內完全不變、ORM 零呼叫）、srLog 無相容分支之警告', async function() {
            let rows0 = await (async () => {
                await imp([mkExt('a'), mkExt('b')])
                await S.fun('tokA', 'saveApi', [{ name: 'ui-row', url: 'http://ui', method: 'get', group: 'ui' }])
                return await S.list()
            })()
            let a0 = byKey(rows0, 'a')
            await S.getOps(true)
            let noKey = { name: 'no-key', url: 'http://nk/1' }
            let cases = [
                ['缺 srcKey', [noKey], 'errRowInvalid'],
                ['只送 id（沿用既有列之 id 亦不得代替 srcKey）', [{ id: a0.id, name: a0.name, url: a0.url }], 'errRowInvalid'],
                ['只送 id（全新之 id）', [{ id: 'legacy-1', name: 'L1', url: 'http://l/1' }], 'errRowInvalid'],
                ['混批：有鍵之列＋缺 srcKey 之列', [mkExt('a'), noKey, mkExt('with-key')], 'errRowInvalid'],
                ['混批：有鍵之列＋只送 id 之列', [mkExt('a'), { id: 'legacy-x', name: 'k2', url: 'http://k/2' }], 'errRowInvalid'],
                ['srcKey 與 id 並送', [mkExt('a', { id: a0.id })], 'idNotAllowed'],
                ['srcKey 與全新之 id 並送', [mkExt('new-k', { id: 'forged-id' })], 'idNotAllowed'],
                ['混批：僅一列帶 id', [mkExt('a'), mkExt('b'), mkExt('c', { id: 'x' })], 'idNotAllowed'],
                ['id 為空字串（仍屬帶 id）', [mkExt('c', { id: '' })], 'idNotAllowed'],
                ['id 為 null（仍屬帶 id）', [mkExt('c', { id: null })], 'idNotAllowed'],
            ]
            for (let [label, rows, key] of cases) {
                await S.getOps(true)
                let r = await imp(rows)
                assert.deepStrictEqual(await S.getOps(true), [], `${label}: 驗證在任何 ORM 呼叫之前（零呼叫）`)
                assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: key }, `${label}: ${JSON.stringify(r)}`)
                assert.ok(!JSON.stringify(r).includes('forged-id') && !JSON.stringify(r).includes(a0.id), `${label}: 錯誤回應不回顯 id 值`)
                assert.deepStrictEqual(await S.list(), rows0, `${label}: 庫內完全不變（零寫入）`)
            }
            let txt = await readLogs()
            assert.ok(!txt.includes('syncAndReplaceTabs-idAsSrcKey') && !txt.includes('syncAndReplaceTabs-noSrcKey'), '相容分支之警告事件已不存在')
            assert.ok(txt.includes('idNotAllowed'), '列帶 id 之拒收入 srLog（只含事件、範圍、列索引、欄位名）')
            assert.ok(!txt.includes('forged-id'), 'srLog 不含 id 值')
        })

        it('I15: 既有外部列無 srcKey（舊同步寫入或相容期所寫；遷移前資料）、批次 srcKey 等於其 id → 視為同一列、於鎖內補上 srcKey；id 不變、本地欄位（tokens 等）與 timeCreate 保留；內容相同不計 nUpdate；其後只認 srcKey、重送零寫入', async function() {
            //遷移前之列：L1 無 srcKey 欄（升版前）、L2 srcKey 為空字串（相容期無鍵列）、L3 對不上；K 為已有 srcKey 之列（id 與 srcKey 不同）
            await S.seed([mkLegacyRow('L1', G), mkLegacyRow('L2', G, { srcKey: '' }), mkLegacyRow('L3', G), mkLegacyRow('Kid', G, { srcKey: 'K' }), mkLegacyRow('O1', 'other')])
            let before = await S.list()
            let l1 = before.find((v) => v.id === 'L1')
            assert.ok(!l1.srcKey, '前提: L1 無 srcKey（遷移前資料）')
            let rowOf = (id, over = {}) => ({ name: `legacy-${id}`, url: `http://legacy/${id}`, description: `desc-${id}`, method: 'get', version: 'v1', levels: 'L.1', keywords: 'kw', state: 'ok', creator: 'c', dataSource: 'd', ...over })
            await S.getOps(true)
            //批次: L1（內容相同）、L2（改名）、K（已有 srcKey，內容相同）、Kid（srcKey 等於 Kid 列之 id，但該列已有 srcKey=K，不得以 id 配對 → 新增）、N（全新）；L3、O1 不在批次內／不在本群組
            let r = await imp([mkExt('L1', rowOf('L1')), mkExt('L2', rowOf('L2', { name: 'renamed' })), mkExt('K', rowOf('Kid', { name: 'legacy-Kid' })), mkExt('Kid'), mkExt('N')])
            assert.strictEqual(r.state, 'success', JSON.stringify(r))
            assert.deepStrictEqual(r.msg, { nAdd: 2, nUpdate: 1, nDel: 1, nSame: 2 }, 'L1 補鍵(同)、K 不變(同)、L2 改名(更新)、Kid／N 新增、L3 刪除')
            let after = await S.list()
            //L1: 同一列, srcKey 補為 id, id 不變, 本地欄位與 timeCreate 保留, 外部擁有欄位不變
            let l1b = after.find((v) => v.id === 'L1')
            assert.strictEqual(l1b.srcKey, 'L1')
            for (let f of [...fieldsLocal, 'timeCreate', 'isActive', 'name', 'url', 'description']) {
                assert.strictEqual(l1b[f], l1[f], `L1 的 ${f} 保留`)
            }
            //L2: 同一列(id 不變)，srcKey 補為 id，名稱更新，本地欄位保留
            let l2 = before.find((v) => v.id === 'L2')
            let l2b = after.find((v) => v.id === 'L2')
            assert.strictEqual(l2b.srcKey, 'L2')
            assert.strictEqual(l2b.name, 'renamed')
            assert.strictEqual(l2b.timeCreate, l2.timeCreate)
            for (let f of fieldsLocal) {
                assert.strictEqual(l2b[f], l2[f], `L2 的本地欄位 ${f} 保留`)
            }
            //L3 對不上 → 刪舊
            assert.strictEqual(after.find((v) => v.id === 'L3'), undefined)
            //K 列(id=Kid, srcKey=K): 只認 srcKey; 批次 'Kid' 是新增列, 內部 id 由系統產生, K 列完全不動
            assert.deepStrictEqual(after.find((v) => v.id === 'Kid'), before.find((v) => v.id === 'Kid'))
            let kidNew = byKey(after, 'Kid')
            assert.ok(kidNew && kidNew.id !== 'Kid', '新增列, 內部 id 由系統產生')
            assert.ok(byKey(after, 'N'))
            //他群組不動
            assert.deepStrictEqual(after.find((v) => v.id === 'O1'), before.find((v) => v.id === 'O1'))
            //其後只認 srcKey: 重送同一批 → 零寫入
            await S.getOps(true)
            let r2 = await imp([mkExt('L1', rowOf('L1')), mkExt('L2', rowOf('L2', { name: 'renamed' })), mkExt('K', rowOf('Kid', { name: 'legacy-Kid' })), mkExt('Kid'), mkExt('N')])
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 5 })
            assert.deepStrictEqual((await S.getOps(true)).filter((o) => o.op !== 'select'), [], '零寫入')
            let byId = (x, y) => x.id.localeCompare(y.id)
            assert.deepStrictEqual((await S.list()).sort(byId), after.slice().sort(byId), '重送後庫內完全不變（含 timeUpdate）')
        })

        it('I15 補: 遷移前之列於首次匯入時，批次 srcKey 未等於其 id 者依差異同步（刪舊增新）；刪除無 srcKey 之列記 warn（syncAndReplaceTabs-delNoSrcKey）、不靜默', async function() {
            await S.seed([mkLegacyRow('U1', G), mkLegacyRow('U2', G, { srcKey: '' })])
            let txt0 = await readLogs()
            let n0 = (txt0.match(/syncAndReplaceTabs-delNoSrcKey/g) || []).length
            let r = await imp([mkExt('u-new-1'), mkExt('u-new-2')])
            assert.deepStrictEqual(r.msg, { nAdd: 2, nUpdate: 0, nDel: 2, nSame: 0 })
            let rs = await S.list()
            assert.deepStrictEqual(rs.map((v) => v.srcKey).sort(), ['u-new-1', 'u-new-2'])
            assert.ok(!rs.some((v) => v.id === 'U1' || v.id === 'U2'), '舊列已刪')
            let txt1 = await readLogs()
            let n1 = (txt1.match(/syncAndReplaceTabs-delNoSrcKey/g) || []).length
            assert.ok(n1 > n0, `刪除無來源鍵之列須記 warn：${n0} → ${n1}`)
        })

        it('I15 補2: 庫內同 group 之有效來源鍵撞名（srcKey=\'x\' 之列與 id=\'x\' 之無鍵列並存）→ 無法唯一配對，整批 errRowInvalid、零寫入、不靜默刪改（規格 §5 第 4 步；與批次內容無關）', async function() {
            await S.seed([mkLegacyRow('ex', G, { srcKey: 'x' }), mkLegacyRow('x', G)])
            let before = await S.list()
            await S.getOps(true)
            for (let rows of [[mkExt('z')], [mkExt('x')], [mkExt('ex')]]) {
                let r = await imp(rows)
                assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errRowInvalid' }, JSON.stringify(rows.map((v) => v.srcKey)))
                assert.deepStrictEqual((await S.getOps(true)).filter((o) => o.op !== 'select'), [], '零寫入')
            }
            let byId = (x, y) => x.id.localeCompare(y.id)
            assert.deepStrictEqual((await S.list()).sort(byId), before.slice().sort(byId), '庫內完全不變')
            assert.ok((await readLogs()).includes('dbDuplicate'), '原因入 srLog')
        })

        it('欄位型別：有限數字／布林轉字串存入（前端以字串處理 method 等）；含孤立代理字元之外部欄位正規化後重送冪等（外審 sol#3、#4）', async function() {
            let rows = [mkExt('t', { method: 7, version: true, description: 'x\ud800y' })]
            let r1 = await imp(rows)
            assert.deepStrictEqual(r1.msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 }, JSON.stringify(r1))
            let t = byKey(await S.list(), 't')
            assert.strictEqual(t.method, '7')
            assert.strictEqual(t.version, 'true')
            assert.strictEqual(t.description, 'x�y')
            let r2 = await imp(rows)
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 }, '重送不誤判有改變（內部 id 不變）')
            assert.strictEqual(byKey(await S.list(), 't').id, t.id)
            //srcKey 為孤立代理字元已於 I7 拒收；srcKey 為 Unicode 合法字元（含中文、表情）可用且冪等
            let rows2 = [...rows, mkExt('來源-鍵-😀')]
            assert.deepStrictEqual((await imp(rows2)).msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 1 })
            assert.deepStrictEqual((await imp(rows2)).msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 2 })
        })

        it('大批次（1200 列）：真實 lmdb 可成功匯入、重送冪等、一次差異同步全數刪除（外審 sol#9）', async function() {
            let rows = []
            for (let k = 0; k < 1200; k++) {
                rows.push({ srcKey: `bulk-${k}`, name: `bulk-${k}`, url: 'http://b' })
            }
            let r1 = await imp(rows)
            assert.deepStrictEqual(r1.msg, { nAdd: 1200, nUpdate: 0, nDel: 0, nSame: 0 }, JSON.stringify(r1).slice(0, 200))
            let r2 = await imp(rows)
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1200 })
            //一次差異同步刪除全數（清理: 避免 beforeEach 逐筆 deleteApi 1200 次）
            let r3 = await imp([mkExt('after-bulk')])
            assert.deepStrictEqual(r3.msg, { nAdd: 1, nUpdate: 0, nDel: 1200, nSame: 0 })
        })

        it('R-SYNC-1 沿用: srcKey 含 HTML 標記／超過 1978 位元組／同批重複亦整批拒收；srcKey 恰 1978 位元組可用（含多位元組字元之位元組計）', async function() {
            let before = await S.list()
            let mk = (srcKey, n) => ({ srcKey, name: n, url: `http://s/${n}` })
            for (let rows of [[mk('ok-1', 'a'), mk('x<script>y', 'b')], [mk('ok-2', 'a'), mk('x'.repeat(1979), 'b')], [mk('d', 'a'), mk('d', 'b')], [mk('中'.repeat(660), 'a')]]) {
                let r = await imp(rows)
                assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errRowInvalid' })
            }
            assert.deepStrictEqual(await S.list(), before, '零寫入')
            let key = 'b'.repeat(1978)
            let r = await imp([mk(key, 'boundary'), mk('中'.repeat(659), 'cjk')])
            assert.deepStrictEqual(r.msg, { nAdd: 2, nUpdate: 0, nDel: 0, nSame: 0 }, JSON.stringify(r).slice(0, 200))
        })

    })

    //--------------------------------------------------------------------------
    describe('權限與入口（I14）', function() {

        it('I14: 無權限之權杖 → errUserNotFound；未列之 keyTable → errKeyTableInvalid；缺 token → errTokenNoPermission；皆不寫入', async function() {
            await imp([mkExt('a')])
            let before = await S.list()
            let r1 = await S.sync('no-such-token', { group: G, rows: [mkExt('x')] })
            assert.deepStrictEqual({ state: r1.state, msg: r1.msg }, { state: 'error', msg: 'errUserNotFound' })
            let r2 = await S.sync('tokApp', { group: G, rows: [mkExt('x')] }, 'users')
            assert.deepStrictEqual({ state: r2.state, msg: r2.msg }, { state: 'error', msg: 'errKeyTableInvalid' })
            let res = await fetch(`${S.base}/syncAndReplaceTabs?keyTable=apis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group: G, rows: [mkExt('x')] }) })
            let j = await res.json()
            assert.deepStrictEqual({ state: j.state, msg: j.msg }, { state: 'error', msg: 'errTokenNoPermission' })
            assert.deepStrictEqual(await S.list(), before)
        })

        it('響應只回固定鍵之計數，不回顯列內容；錯誤只回固定錯誤鍵', async function() {
            let r = await imp([mkExt('secret-key-123', { description: 'SECRET-DESC' })])
            assert.deepStrictEqual(Object.keys(r.msg).sort(), ['nAdd', 'nDel', 'nSame', 'nUpdate'])
            let e = await imp([mkExt('secret-key-123'), mkExt('secret-key-123')])
            assert.strictEqual(e.msg, 'errRowInvalid')
            assert.ok(!JSON.stringify(e).includes('secret-key-123'), '錯誤回應不回顯來源鍵值')
        })

    })

})
