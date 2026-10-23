//unit-syncRows：外部同步之主鍵檢核純函數（server/checkSyncRows.mjs；CLAUDE_rulebook.md R-SYNC-1；ADR-038）。不讀寫資料庫、不開埠。
//2026-10-23（ADR-046）起，syncApis 以 { id: srcKey } 形狀傳入來源鍵（srcKey 即刻必填、外部不得送 id），本函數檢核對象為 srcKey 值；規則本身不變。
//規則：有給之主鍵（非空字串或有限數字；NaN、±Infinity 視為未給，同 w-serv-orm 1.1.11）須 (a) clearXSS 不改寫 (b) UTF-8 ≤ 1978 位元組（LMDB 鍵長上限，2026-10-14 實測 1978 可寫、1979 失敗）
//(c) 同批不重複 (d) 不屬他群組；未給主鍵（空字串、未給、其他型別）照常。回報第一個違反之 { index, field:'id', reason }。
//重複與群組以 String(id) 比對：w-serv-orm 1.1.11 起字串型主鍵欄之有限數字主鍵存為其字串形式（123 存為 '123'、回應之 id 為 '123'），故 123 與 '123' 為同一主鍵。
//pickRowIds（取本批主鍵供查既有群組）隨「以 id 代替 srcKey」之相容一併移除（其唯一呼叫端 syncApis 已不查既有主鍵）。
import assert from 'assert'
import { checkRowIds, maxIdBytesDef } from '../server/checkSyncRows.mjs'


let row = (id, extra = {}) => ({ id, name: 'n', url: 'http://x', group: 'G', ...extra })


describe('unit-syncRows（同步之主鍵檢核：R-SYNC-1）', function() {

    it('上限常數為 1978（取自 LMDB 鍵長上限）', function() {
        assert.strictEqual(maxIdBytesDef, 1978)
    })

    it('未給主鍵者照常：空字串（多列）、undefined、null、物件、布林皆不檢查', function() {
        assert.strictEqual(checkRowIds([row(''), row(''), row(undefined), row(null), row({}), row(true)], { group: 'G' }), null)
    })

    it('(a) xss：主鍵含白名單外標籤（clearXSS 會改寫）→ reason xss；白名單標籤（不改寫）照常', function() {
        assert.deepStrictEqual(checkRowIds([row('ok-1'), row('a<script>x')], { group: 'G' }), { index: 1, field: 'id', reason: 'xss' })
        assert.deepStrictEqual(checkRowIds([row('x<T>y')], { group: 'G' }), { index: 0, field: 'id', reason: 'xss' })
        assert.strictEqual(checkRowIds([row('<b>x</b>')], { group: 'G' }), null, '白名單標籤 clearXSS 不改寫，不擋')
    })

    it('(b) bytes：UTF-8 位元組 1978 通過、1979 擋；多位元組依位元組計（中文 659 字 = 1977 通過、660 字 = 1980 擋）', function() {
        assert.strictEqual(checkRowIds([row('a'.repeat(1978))], { group: 'G' }), null)
        assert.deepStrictEqual(checkRowIds([row('a'.repeat(1979))], { group: 'G' }), { index: 0, field: 'id', reason: 'bytes' })
        assert.strictEqual(checkRowIds([row('中'.repeat(659))], { group: 'G' }), null)
        assert.deepStrictEqual(checkRowIds([row('ok'), row('中'.repeat(660))], { group: 'G' }), { index: 1, field: 'id', reason: 'bytes' })
        assert.deepStrictEqual(checkRowIds([row('abcd')], { group: 'G', maxIdBytes: 3 }), { index: 0, field: 'id', reason: 'bytes' }, 'maxIdBytes 可指定')
    })

    it('(c) dup：同批非空主鍵重複 → 報第二次出現之位置；數字 123 與字串 \'123\' 為同一主鍵（w-serv-orm 1.1.11 起數字主鍵存為其字串形式）', function() {
        assert.deepStrictEqual(checkRowIds([row('d1'), row('d2'), row('d1')], { group: 'G' }), { index: 2, field: 'id', reason: 'dup' })
        assert.deepStrictEqual(checkRowIds([row(123), row('123')], { group: 'G' }), { index: 1, field: 'id', reason: 'dup' })
    })

    it('(d) group：資料庫中同主鍵之列屬他群組 → reason group；屬本群組（同步即取代）照常', function() {
        let groupById = new Map([['ext-1', 'OTHER'], ['ext-2', 'G']])
        assert.deepStrictEqual(checkRowIds([row('new'), row('ext-1')], { group: 'G', groupById }), { index: 1, field: 'id', reason: 'group' })
        assert.strictEqual(checkRowIds([row('ext-2'), row('new')], { group: 'G', groupById }), null)
        assert.deepStrictEqual(checkRowIds([row(77)], { group: 'G', groupById: new Map([['77', 'OTHER']]) }), { index: 0, field: 'id', reason: 'group' }, '數字主鍵以 String 比對')
    })

    it('同一列多項違反時依 xss → bytes → dup → group 回報第一項；回傳第一個違反之列', function() {
        let long = 'a<script>' + 'x'.repeat(2000)
        assert.deepStrictEqual(checkRowIds([row(long)], { group: 'G' }), { index: 0, field: 'id', reason: 'xss' })
        assert.deepStrictEqual(checkRowIds([row('dup'), row('dup'), row('y'.repeat(1979))], { group: 'G' }), { index: 1, field: 'id', reason: 'dup' })
    })

    it('NaN、±Infinity 視為未給主鍵（同 w-serv-orm 1.1.11 之補值規則）：checkRowIds 不檢查；0 與負數為有限數字照常', function() {
        assert.strictEqual(checkRowIds([row(NaN), row(NaN), row(Infinity), row(Infinity), row(-Infinity)], { group: 'G' }), null, '不得因 Infinity 重複而報 dup')
        assert.strictEqual(checkRowIds([row(Infinity)], { group: 'G', groupById: new Map([['Infinity', 'OTHER']]) }), null, '不得以 Infinity 比對他群組')
        assert.deepStrictEqual(checkRowIds([row(0), row('0')], { group: 'G' }), { index: 1, field: 'id', reason: 'dup' })
    })

})
