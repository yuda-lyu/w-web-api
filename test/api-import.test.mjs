//api-import：外部匯入（原則 11；規格 C:\opensrcOper\dspec\外部匯入之定義與機制.md；rulebook_backend.md R-IMPORT-01；ADR-043）——
//POST /syncAndReplaceTabs 依外部自訂之來源鍵 srcKey 於 apis 表鎖內差異同步（新增／刪除／修改／不變），回 { nAdd, nUpdate, nDel, nSame }。
//真後端（隔離子行程：獨立 lmdb、埠 8552，SlowOrm 注入人為延遲與失敗；不碰專案 ./db 與 11005），走實際匯入入口（含 base64: 還原、clearXSS 改寫、轉型）。
//每個 it 對應規格驗收 I1～I14（括號）與 inv01 缺陷（E8 同步換 id、C4b 本系統擁有欄位被清空、A5 timeCreate 重設、A1 不取鎖、ADR-016 非原子）。
//相容（現行 major，主控建議、使用者尚未確認）：列未給 srcKey 而給 id 者以 id 為來源鍵（I13）；兩者皆無者該列每次新增（其餘有鍵之列仍差異同步，不再整批 delAll＋insert）並記警告；下一 major srcKey 必填。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { buildBaseline } from 'w-serv-orm/src/baseline.mjs'
import contract, { fieldsLocal } from '../src/schema/contracts/apis.mjs'
import { startApiServer, sleep } from './tools/apiHarness.mjs'


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

        it('身分欄: 範圍（group）由請求決定，批次列自帶之 group 不採用——新增與修改皆然，不致寫入他群組；批次列自帶之 id／srcKey 以外之身分鍵亦不影響', async function() {
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
            //相容路徑（有列無來源鍵 → delAll＋insert）亦同
            let r3 = await imp([{ name: 'legacy-n', url: 'http://l/n', group: 'other-scope' }])
            assert.strictEqual(r3.state, 'success', JSON.stringify(r3))
            rs = await S.list()
            assert.strictEqual(rs.filter((v) => v.group === 'other-scope').length, 0)
            assert.strictEqual(rs.filter((v) => v.group === G).length, 1)
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

        it('I7: 缺／空／非字串／不合規／同批重複的 srcKey → 整批 errRowInvalid、零寫入（其餘合法列亦不寫）', async function() {
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
                'id 代替者以控制字元起首': [ok, { id: '\u0001' + 'x'.repeat(1977), name: 'n', url: 'http://u' }],
                'name 經字元清理後為空': [ok, { ...mkExt('x'), name: '<!--x-->' }],
                '外部欄位為物件': [ok, { ...mkExt('x'), description: { a: 1 } }],
                '外部欄位為陣列': [ok, { ...mkExt('x'), keywords: ['a'] }],
                'srcKey 超過 1978 位元組': [ok, mkExt('k'.repeat(1979))],
                '同批 srcKey 重複': [ok, mkExt('dup'), mkExt('dup')],
                'srcKey 與他列以 id 代替之值重複': [ok, mkExt('dup'), { name: 'n', url: 'http://u', id: 'dup' }],
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

        it('I9／I10: 他群組、後台自建之列永不被觸及；相同 srcKey 於不同群組各自獨立；以 id 代替 srcKey 而撞他群組之 id → 拒收且雙方不變', async function() {
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
            //以 id 代替 srcKey 而該 id 屬他群組之列 → 拒收、雙方不變
            let uiRow = after.find((v) => v.group === 'ui')
            let before3 = await S.list()
            let r3 = await imp([mkExt('a'), { name: 'steal', url: 'http://s', id: uiRow.id }])
            assert.deepStrictEqual({ state: r3.state, msg: r3.msg }, { state: 'error', msg: 'errRowInvalid' })
            assert.deepStrictEqual(await S.list(), before3, '雙方不變')
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
    describe('相容（現行 major；I13）與舊呼叫端', function() {

        it('I13: 列未給 srcKey 而給 id → 以 id 為來源鍵（新增列沿用該 id）、行為與現行一致；重送冪等；並記警告', async function() {
            let rows = [{ id: 'legacy-1', name: 'L1', url: 'http://l/1' }, { id: 'legacy-2', name: 'L2', url: 'http://l/2' }]
            let r1 = await imp(rows)
            assert.deepStrictEqual(r1.msg, { nAdd: 2, nUpdate: 0, nDel: 0, nSame: 0 })
            let rs = await S.list()
            assert.ok(rs.find((v) => v.id === 'legacy-1'), '新增列沿用外部給的 id（行為與現行一致）')
            assert.strictEqual(rs.find((v) => v.id === 'legacy-1').srcKey, 'legacy-1')
            let r2 = await imp(rows)
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 2 })
            assert.deepStrictEqual((await S.list()).map((v) => v.id).sort(), ['legacy-1', 'legacy-2'])
            let txt = await readLogs()
            assert.ok(txt.includes('syncAndReplaceTabs-idAsSrcKey'), '應記警告（下一 major 起 srcKey 必填）')
        })

        it('I13 補: 既有外部列無 srcKey（遷移前資料）→ 首次差異同步命中時於鎖內補上 srcKey = id，不計入 nUpdate、id 不變', async function() {
            //以 UI 路徑建一列（srcKey 空）當作遷移前之外部列，並指定其 group；再以 id 代替 srcKey 匯入同內容
            let u = await S.fun('tokA', 'saveApi', [{ name: 'old-ext', url: 'http://o/1', method: 'get', group: G }])
            let id = u.msg[0].id
            let row = (await S.list())[0]
            let r = await imp([{ id, name: row.name, url: row.url, method: row.method, group: G, order: row.order, description: row.description, version: row.version, levels: row.levels, keywords: row.keywords, state: row.state, creator: row.creator, dataSource: row.dataSource, mdInputParams: row.mdInputParams, inputExample: row.inputExample, mdOutputParams: row.mdOutputParams, outputExample: row.outputExample }])
            assert.deepStrictEqual(r.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1 })
            let now = (await S.list())[0]
            assert.strictEqual(now.id, id)
            assert.strictEqual(now.srcKey, id, '補上 srcKey = id')
            //之後可改以 srcKey 匯入（srcKey = 原 id）：命中同一列
            let r2 = await imp([mkExt(id, { name: row.name, url: row.url, description: row.description, levels: row.levels, version: row.version, keywords: row.keywords, state: row.state, creator: row.creator, dataSource: row.dataSource })])
            assert.strictEqual(r2.msg.nAdd, 0, JSON.stringify(r2))
            assert.strictEqual((await S.list()).length, 1)
        })

        it('批次中有列兩者皆無（無 srcKey 亦無 id）→ 該列每次新增（配新 id），其餘有鍵之列仍差異同步、本系統擁有欄位不被清（不再整批 delAll＋insert；外審 sol#5）；記警告；他群組不動', async function() {
            await imp([mkExt('a'), mkExt('b')])
            await imp([mkExt('o')], 'other')
            //後台為 a 設定本系統擁有欄位
            let a0 = byKey(await S.list(), 'a')
            let setLocal = await S.fun('tokA', 'saveApi', [{ ...a0, tokens: 'MY-TOKEN', authType: 'bearer', contentType: 'text/plain', testBaseUrl: 'http://t' }, { baseline: baselineOf(a0) }])
            assert.ok(setLocal.ok, JSON.stringify(setLocal))
            let aSet = byKey(await S.list(), 'a')
            let r = await imp([mkExt('a'), { name: 'k1', url: 'http://k/1' }, mkExt('with-key')])
            assert.strictEqual(r.state, 'success', JSON.stringify(r))
            assert.deepStrictEqual(r.msg, { nAdd: 2, nUpdate: 0, nDel: 1, nSame: 1 }, 'a 不變、b 被刪、k1 與 with-key 新增')
            let rs = await S.list()
            assert.strictEqual(rs.filter((v) => v.group === G).length, 3)
            assert.strictEqual(rs.filter((v) => v.group === 'other').length, 1, '他群組不動')
            assert.deepStrictEqual(byKey(rs, 'a'), aSet, '有鍵且命中之列（含 tokens／authType／contentType／testBaseUrl）完全不動')
            assert.strictEqual(byKey(rs, 'with-key').srcKey, 'with-key')
            let k1 = rs.find((v) => v.name === 'k1')
            assert.strictEqual(k1.srcKey, '')
            //再送：無來源鍵列不配對 → 換新 id；其餘不動
            let r2 = await imp([mkExt('a'), { name: 'k1', url: 'http://k/1' }, mkExt('with-key')])
            assert.deepStrictEqual(r2.msg, { nAdd: 1, nUpdate: 0, nDel: 1, nSame: 2 })
            let k1b = (await S.list()).find((v) => v.name === 'k1')
            assert.notStrictEqual(k1b.id, k1.id)
            let txt = await readLogs()
            assert.ok(txt.includes('syncAndReplaceTabs-noSrcKey'), '應記警告「未給來源鍵」')
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

        it('大批次（以 id 代替 srcKey 之 1200 列）：既有主鍵衝突檢查之 $in 分批，真實 lmdb 可成功匯入、重送冪等（外審 sol#9）', async function() {
            let rows = []
            for (let k = 0; k < 1200; k++) {
                rows.push({ id: `bulk-${k}`, name: `bulk-${k}`, url: 'http://b' })
            }
            let r1 = await imp(rows)
            assert.deepStrictEqual(r1.msg, { nAdd: 1200, nUpdate: 0, nDel: 0, nSame: 0 }, JSON.stringify(r1).slice(0, 200))
            let r2 = await imp(rows)
            assert.deepStrictEqual(r2.msg, { nAdd: 0, nUpdate: 0, nDel: 0, nSame: 1200 })
            //一次差異同步刪除全數（清理: 避免 beforeEach 逐筆 deleteApi 1200 次）
            let r3 = await imp([mkExt('after-bulk')])
            assert.deepStrictEqual(r3.msg, { nAdd: 1, nUpdate: 0, nDel: 1200, nSame: 0 })
        })

        it('R-SYNC-1 沿用: 以 id 代替 srcKey 時，含 HTML 標記／超過 1978 位元組／同批重複的 id 亦整批拒收；id 恰 1978 位元組可用', async function() {
            let before = await S.list()
            let mk = (id, n) => ({ id, name: n, url: `http://s/${n}` })
            for (let rows of [[mk('ok-1', 'a'), mk('x<script>y', 'b')], [mk('ok-2', 'a'), mk('x'.repeat(1979), 'b')], [mk('d', 'a'), mk('d', 'b')]]) {
                let r = await imp(rows)
                assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errRowInvalid' })
            }
            assert.deepStrictEqual(await S.list(), before, '零寫入')
            let id = 'b'.repeat(1978)
            let r = await imp([mk(id, 'boundary')])
            assert.deepStrictEqual(r.msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 }, JSON.stringify(r).slice(0, 200))
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
