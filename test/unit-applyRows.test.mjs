//unit-applyRows：存檔／刪除成功後立即更新 store 列陣列之純函數（src/store/applyRows.mjs；api-run03）。
//規格 C:\opensrcOper\dspec\多人同時編輯之寫入契約.md 第 8 節：
//  「存檔成功後之新基準取自伺服端，且須立即取得：存檔 API 回傳寫入後之列（鎖內新鮮讀取），前端立即以之更新畫面與基準。其後抵達之同內容推播，摘要相同即不視為他人更新。」
//  「不得以自己送出之值當新基準：寫入時 clearXSS 等會改寫部分字串，例 a<b 存為 a&lt;b。」
//先動先贏不被削弱（規格 V1）：回傳列只在 store 列仍等於開啟編輯時之基準且不比回傳列新時才寫入；store 已是別的內容或較新時不回退；晚到之較舊快照不退回我剛寫入之列。
//編輯器對推播之判定（LayoutContentEdit.onItemChange）為「該列摘要 === 載入時基準」，本檔以同一判定驗「其後之同內容推播不被當成他人更新」。
import assert from 'assert'
import { buildBaseline, digestRow } from 'w-serv-orm/src/baseline.mjs'
import contract from '../src/schema/contracts/apis.mjs'
import { applySavedRow, applyDeletedRow, createRecentRows } from '../src/store/applyRows.mjs'


//timeUpdate 為伺服端 nowms2str 格式（毫秒、含時區）
let T0 = '2026-10-23T00:00:00.000+08:00'
let T1 = '2026-10-23T00:00:05.000+08:00'
let T2 = '2026-10-23T00:00:09.000+08:00'
let mkRow = (id, over = {}) => ({ id, name: `n-${id}`, url: `http://t/${id}`, method: 'get', group: 'g', description: 'd', order: 1, srcKey: '', timeUpdate: T0, ...over })
let baselineOf = (row) => buildBaseline([row], contract)
//編輯器之判定: 推播抵達之該列與載入時基準同摘要 → 不視為他人更新
let isSameAsBaseline = (row, baseline) => digestRow(row, contract) === baseline[0][1]


describe('unit-applyRows (存檔／刪除成功後立即更新 store)', function() {

    describe('applySavedRow: 修改既有列', function() {

        it('store 列仍等於開啟編輯時之基準 → 以伺服端回傳之列取代（規格 §8 立即更新）；其他列原樣不動', function() {
            let a = mkRow('a')
            let b = mkRow('b')
            let rows = [a, b]
            let returned = mkRow('a', { name: 'saved-by-me', timeUpdate: T1 })
            let out = applySavedRow(rows, returned, baselineOf(a), contract)
            assert.notStrictEqual(out, rows, '應回傳新陣列')
            assert.strictEqual(out[0].name, 'saved-by-me')
            assert.strictEqual(out[0].timeUpdate, T1, '伺服器專有欄位亦取回傳值')
            assert.strictEqual(out[1], b, '其他列為同一物件（不複製、不動）')
            assert.strictEqual(rows[0], a, '輸入陣列不被改動（Vuex 嚴格模式）')
        })

        it('新基準取自伺服端回傳之列、不是自己送出之值（clearXSS 改寫 a<b → a&lt;b）', function() {
            let a = mkRow('a')
            let sent = mkRow('a', { name: 'x<b' }) //前端送出之值
            let returned = mkRow('a', { name: 'x&lt;b', timeUpdate: T1 }) //伺服端存放（回傳）之值
            let out = applySavedRow([a], returned, baselineOf(a), contract)
            assert.strictEqual(out[0].name, 'x&lt;b', 'store 列為伺服端存放之值')
            assert.notStrictEqual(out[0].name, sent.name)
            //下次開編輯以 store 列算之基準 ＝ 對回傳列算者；≠ 對送出值算者（以送出值當基準會被自己誤擋）
            assert.deepStrictEqual(baselineOf(out[0]), baselineOf(returned))
            assert.notDeepStrictEqual(baselineOf(out[0]), baselineOf(sent))
        })

        it('其後抵達之同內容推播（重新讀取之列，摘要相同）→ 與新基準同摘要，編輯器不視為他人更新', function() {
            let a = mkRow('a')
            let returned = mkRow('a', { name: 'saved-by-me', timeUpdate: T1 })
            let out = applySavedRow([a], returned, baselineOf(a), contract)
            let newBaseline = baselineOf(out[0]) //存檔後立即再開編輯之基準
            let pushed = mkRow('a', { name: 'saved-by-me', timeUpdate: T2 }) //推播抵達之列（伺服器專有欄位可不同）
            assert.ok(isSameAsBaseline(pushed, newBaseline), '同內容推播不應被當成他人更新')
            //對照（修前行為）：不更新 store 時，再開編輯之基準為存檔前之列，推播抵達即被當成他人更新
            assert.ok(!isSameAsBaseline(pushed, baselineOf(a)), '存檔前之基準與推播不同（N1 之誤擋來源）')
        })

        it('存檔未改任何契約欄位（內容與基準相同，僅伺服器專有欄位換新）→ 仍以回傳列取代，使 store 之 timeUpdate 等取得最新', function() {
            let a = mkRow('a')
            let returned = mkRow('a', { timeUpdate: T1 })
            let out = applySavedRow([a], returned, baselineOf(a), contract)
            assert.strictEqual(out[0].timeUpdate, T1)
            assert.deepStrictEqual(baselineOf(out[0]), baselineOf(a), '契約欄位不變 → 基準不變')
        })

        it('推播已先到（store 列已等於回傳列）→ 無變動，回傳原陣列', function() {
            let a = mkRow('a')
            let returned = mkRow('a', { name: 'saved-by-me', timeUpdate: T1 })
            let rows = [mkRow('a', { name: 'saved-by-me', timeUpdate: T1 })]
            assert.strictEqual(applySavedRow(rows, returned, baselineOf(a), contract), rows)
        })

        it('他人在我之後又改、其推播先到（store 列既非基準亦非回傳列）→ 不回退，以推播為準（先動先贏不被削弱）', function() {
            let a = mkRow('a')
            let returned = mkRow('a', { name: 'saved-by-me', timeUpdate: T1 })
            let rows = [mkRow('a', { name: 'changed-by-other-later', timeUpdate: T2 })]
            let out = applySavedRow(rows, returned, baselineOf(a), contract)
            assert.strictEqual(out, rows, '不動')
            assert.strictEqual(out[0].name, 'changed-by-other-later')
        })

        it('摘要雖等於基準但 store 列較新（外部匯入在我之後補上 srcKey，其推播先到；或他人改了又改回基準內容）→ 不回退', function() {
            let a = mkRow('a')
            //我對內部列做了無內容變更之存檔（srcKey 仍為空）；之後外部同內容匯入補上 srcKey（伺服器專有欄位, 不入摘要）, 其推播先到
            let returned = mkRow('a', { timeUpdate: T1 })
            let rows = [mkRow('a', { srcKey: 'ext-key', timeUpdate: T2 })]
            assert.strictEqual(digestRow(rows[0], contract), baselineOf(a)[0][1], '前提: 摘要與基準相同')
            let out = applySavedRow(rows, returned, baselineOf(a), contract)
            assert.strictEqual(out, rows, '不動')
            assert.strictEqual(out[0].srcKey, 'ext-key', '外部列身分不被舊回應清掉')
            //他人改了又改回基準內容（內容同基準, timeUpdate 較新）
            let rows2 = [mkRow('a', { description: 'd', timeUpdate: T2 })]
            assert.strictEqual(applySavedRow(rows2, returned, baselineOf(a), contract), rows2)
        })

        it('timeUpdate 缺值或無法解析（無從比新舊）→ 退回僅以摘要判斷（等於基準即取代）', function() {
            let a = mkRow('a', { timeUpdate: undefined })
            let returned = mkRow('a', { name: 'saved-by-me', timeUpdate: 'not-a-date' })
            let out = applySavedRow([a], returned, baselineOf(a), contract)
            assert.strictEqual(out[0].name, 'saved-by-me')
        })

        it('其後被他人刪除、其推播先到（store 已無該列）→ 不復活', function() {
            let a = mkRow('a')
            let rows = [mkRow('b')]
            let out = applySavedRow(rows, mkRow('a', { name: 'saved-by-me', timeUpdate: T1 }), baselineOf(a), contract)
            assert.strictEqual(out, rows)
            assert.ok(!out.some((v) => v.id === 'a'))
        })

        it('基準格式不符該列（id 不同、非單列、摘要非字串）→ 視為無法確認 store 列未被超前，不更新', function() {
            let a = mkRow('a')
            let returned = mkRow('a', { name: 'saved-by-me', timeUpdate: T1 })
            for (let bad of [baselineOf(mkRow('zzz')), [], [['a']], [['a', 1]], null, 'x']) {
                let rows = [a]
                assert.strictEqual(applySavedRow(rows, returned, bad, contract), rows)
            }
        })

    })

    describe('applySavedRow: 新增列（無基準；伺服端配新 id）', function() {

        it('store 尚無（推播未到）→ 加入回傳之列（複本，含新 id）', function() {
            let b = mkRow('b')
            let rows = [b]
            let returned = mkRow('new-id-1', { name: 'brand-new', timeUpdate: T1 })
            let out = applySavedRow(rows, returned, undefined, contract)
            assert.strictEqual(out.length, 2)
            assert.strictEqual(out[0], b)
            assert.deepStrictEqual(out[1], returned)
            assert.notStrictEqual(out[1], returned, '加入複本，不與呼叫端共用參考')
            assert.strictEqual(rows.length, 1, '輸入陣列不被改動')
        })

        it('推播已先到（store 已有該列、內容相同）→ 無變動', function() {
            let rows = [mkRow('new-id-1', { name: 'brand-new', timeUpdate: T1 })]
            assert.strictEqual(applySavedRow(rows, mkRow('new-id-1', { name: 'brand-new', timeUpdate: T1 }), undefined, contract), rows)
        })

        it('store 已有同 id 而內容不同（他人其後之更新先到）→ 不回退', function() {
            let rows = [mkRow('new-id-1', { name: 'changed-by-other-later', timeUpdate: T2 })]
            assert.strictEqual(applySavedRow(rows, mkRow('new-id-1', { name: 'brand-new', timeUpdate: T1 }), undefined, contract), rows)
        })

    })

    describe('applySavedRow: 輸入不合法時不動（退回等推播，不拋錯）', function() {

        it('rows 非陣列（尚未同步）、row 非物件、row 無字串主鍵 → 原樣回傳', function() {
            let rows = [mkRow('a')]
            assert.strictEqual(applySavedRow(null, mkRow('a'), undefined, contract), null)
            assert.strictEqual(applySavedRow(undefined, mkRow('a'), undefined, contract), undefined)
            for (let bad of [null, undefined, 'x', 7, [], [mkRow('a')]]) {
                assert.strictEqual(applySavedRow(rows, bad, baselineOf(rows[0]), contract), rows)
            }
            for (let id of [undefined, null, 5, '', {}]) {
                assert.strictEqual(applySavedRow(rows, { ...mkRow('a'), id }, baselineOf(rows[0]), contract), rows)
            }
        })

        it('store 列含不可摘要之值（過深巢狀，無法與基準比對）→ 不更新、不拋錯', function() {
            let deep = { v: 1 }
            for (let k = 0; k < 120; k++) {
                deep = { v: deep }
            }
            let rows = [mkRow('a', { dataSource: deep })]
            assert.strictEqual(applySavedRow(rows, mkRow('a', { name: 'saved-by-me', timeUpdate: T1 }), baselineOf(mkRow('a')), contract), rows)
        })

    })

    describe('applyDeletedRow', function() {

        it('刪除成功、store 列仍等於基準 → 立即移除該列；其他列原樣', function() {
            let a = mkRow('a')
            let b = mkRow('b')
            let rows = [a, b]
            let out = applyDeletedRow(rows, 'a', baselineOf(a), contract)
            assert.deepStrictEqual(out, [b])
            assert.strictEqual(out[0], b)
            assert.strictEqual(rows.length, 2, '輸入陣列不被改動')
        })

        it('推播已先到（store 已無該列）→ 無變動', function() {
            let rows = [mkRow('b')]
            assert.strictEqual(applyDeletedRow(rows, 'a', baselineOf(mkRow('a')), contract), rows)
        })

        it('store 列已是別的內容（刪除後被重新匯入或他人重建，其推播先到）→ 不移除，以推播為準', function() {
            let a = mkRow('a')
            let rows = [mkRow('a', { name: 'recreated' })]
            assert.strictEqual(applyDeletedRow(rows, 'a', baselineOf(a), contract), rows)
        })

        it('未帶基準或基準格式不符（無法確認 store 列仍是被刪的那一版）→ 不動，以推播為準', function() {
            let rows = [mkRow('a'), mkRow('b')]
            for (let bad of [undefined, null, [], baselineOf(mkRow('zzz')), [['a']]]) {
                assert.strictEqual(applyDeletedRow(rows, 'a', bad, contract), rows)
            }
        })

        it('rows 非陣列、id 非字串 → 原樣回傳；store 列含不可摘要之值 → 不移除、不拋錯', function() {
            let rows = [mkRow('a')]
            assert.strictEqual(applyDeletedRow(null, 'a', baselineOf(rows[0]), contract), null)
            for (let id of [undefined, null, 5, '', {}]) {
                assert.strictEqual(applyDeletedRow(rows, id, baselineOf(rows[0]), contract), rows)
            }
            let deep = { v: 1 }
            for (let k = 0; k < 120; k++) {
                deep = { v: deep }
            }
            let rowsDeep = [mkRow('a', { dataSource: deep })]
            assert.strictEqual(applyDeletedRow(rowsDeep, 'a', baselineOf(mkRow('a')), contract), rowsDeep)
        })

    })

    describe('createRecentRows: 晚到之較舊整表快照不退回我剛寫入之列', function() {

        it('快照中該列比我寫入的舊（快照在我寫入之前讀取、晚於回應才抵達）→ 保留我寫入之列；其餘列取快照；不改動輸入快照', function() {
            let recent = createRecentRows(contract)
            let mine = mkRow('a', { name: 'saved-by-me', timeUpdate: T1 })
            recent.mark(mine)
            let snapshot = [mkRow('a', { timeUpdate: T0 }), mkRow('b', { name: 'b-newer', timeUpdate: T2 })]
            let out = recent.guard(snapshot)
            assert.strictEqual(out[0].name, 'saved-by-me', '保留我寫入之列')
            assert.strictEqual(out[1], snapshot[1], '其餘列取快照')
            assert.strictEqual(snapshot[0].name, 'n-a', '輸入快照不被改動')
            assert.notStrictEqual(out[0], mine, '放入複本')
            //仍在保護中: 下一個較舊快照同樣被擋
            assert.strictEqual(recent.guard([mkRow('a', { timeUpdate: T0 })])[0].name, 'saved-by-me')
        })

        it('快照已追上（timeUpdate 相同）或超前（他人其後之更新）→ 採用快照並不再保護', function() {
            let recent = createRecentRows(contract)
            recent.mark(mkRow('a', { name: 'saved-by-me', timeUpdate: T1 }))
            let caught = [mkRow('a', { name: 'saved-by-me', timeUpdate: T1 })]
            assert.strictEqual(recent.guard(caught), caught, '追上: 原樣')
            //已忘掉: 之後即使來了舊快照也照單全收（不再有保護記憶）
            let old = [mkRow('a', { timeUpdate: T0 })]
            assert.strictEqual(recent.guard(old), old)
            //超前
            recent.mark(mkRow('a', { name: 'saved-by-me', timeUpdate: T1 }))
            let ahead = [mkRow('a', { name: 'changed-by-other-later', timeUpdate: T2 })]
            assert.strictEqual(recent.guard(ahead), ahead, '超前: 採用快照')
        })

        it('快照缺該列 → 不復活，並不再保護（可能被他人刪除）', function() {
            let recent = createRecentRows(contract)
            recent.mark(mkRow('a', { name: 'saved-by-me', timeUpdate: T1 }))
            let snapshot = [mkRow('b')]
            assert.strictEqual(recent.guard(snapshot), snapshot)
            let later = [mkRow('a', { timeUpdate: T0 })]
            assert.strictEqual(recent.guard(later), later, '已忘掉')
        })

        it('超過 ttl 未被追上 → 忘掉（有界）；時間比較缺值或無法解析 → 採用快照', function() {
            let t = 1000
            let recent = createRecentRows(contract, { ttlMs: 500, now: () => t })
            recent.mark(mkRow('a', { name: 'saved-by-me', timeUpdate: T1 }))
            t = 1400
            assert.strictEqual(recent.guard([mkRow('a', { timeUpdate: T0 })])[0].name, 'saved-by-me', 'ttl 內仍保護')
            t = 1501
            let old = [mkRow('a', { timeUpdate: T0 })]
            assert.strictEqual(recent.guard(old), old, '超過 ttl: 採用快照')
            let r2 = createRecentRows(contract)
            r2.mark(mkRow('a', { name: 'saved-by-me', timeUpdate: 'x' }))
            let snap = [mkRow('a', { timeUpdate: T0 })]
            assert.strictEqual(r2.guard(snap), snap, '無法比新舊 → 不保護')
        })

        it('mark 非物件／無主鍵者忽略；guard 對非陣列或無記憶時原樣回傳', function() {
            let recent = createRecentRows(contract)
            recent.mark(null)
            recent.mark({ name: 'no-id' })
            recent.mark('x')
            let snapshot = [mkRow('a', { timeUpdate: T0 })]
            assert.strictEqual(recent.guard(snapshot), snapshot)
            assert.strictEqual(recent.guard(null), null)
            recent.mark(mkRow('a', { timeUpdate: T1 }))
            assert.strictEqual(recent.guard(undefined), undefined)
        })

    })

})
