//unit-syncRows：外部同步之主鍵檢核純函數（server/checkSyncRows.mjs；CLAUDE_rulebook.md R-SYNC-1；ADR-038）。不讀寫資料庫、不開埠。
//2026-10-23（ADR-046）起，syncApis 以 { id: srcKey } 形狀傳入來源鍵（srcKey 即刻必填、外部不得送 id），本函數檢核對象為 srcKey 值；規則本身不變。
//規則：有給之主鍵（非空字串或有限數字；NaN、±Infinity 於本函數視為未給、不檢查——2026-11-23 排程第 570 項更正：原註稱「同 w-serv-orm 1.1.11 之補值規則」於 w-serv-orm 第 568 項後不再成立，
//  上游現行對 NaN、±Infinity 整批 reject 而非補主鍵，見 SR-570b；本函數判定不改，其唯一呼叫端 syncApis 傳入已驗證為非空字串之 srcKey，該路徑不可達，見 SR-570c）
//  須 (a) clearXSS 不改寫 (b) UTF-8 ≤ 1978 位元組（LMDB 鍵長上限，2026-10-14 實測 1978 可寫、1979 失敗）
//(c) 同批不重複 (d) 不屬他群組；未給主鍵（空字串、未給、其他型別）於本函數照常（不檢查）。回報第一個違反之 { index, field:'id', reason }。
//重複與群組以 String(id) 比對：w-serv-orm 1.1.11 起字串型主鍵欄之有限數字主鍵存為其字串形式（123 存為 '123'、回應之 id 為 '123'），故 123 與 '123' 為同一主鍵。
//pickRowIds（取本批主鍵供查既有群組）隨「以 id 代替 srcKey」之相容一併移除（其唯一呼叫端 syncApis 已不查既有主鍵）。
import assert from 'assert'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from '../src/schema/index.mjs'
import { checkRowIds, maxIdBytesDef } from '../server/checkSyncRows.mjs'


let row = (id, extra = {}) => ({ id, name: 'n', url: 'http://x', group: 'G', ...extra })

//SR-570b 用: 以公開主入口 WServOrm 組出真 procOrm(WOrm 建構子以記憶體替身代之; 與 WWebApi 內 WServOrm(ds, WOrm, url, db, opt) 同一組裝), 替身只計底層 insert／save 之呼叫次數與保存之列
let mkTable = () => {
    let kp = new Map()
    let cnt = { insert: 0, save: 0 }
    let toArr = (d) => (Array.isArray(d) ? d : [d])
    return {
        cnt,
        size: () => kp.size,
        select: async () => [...kp.values()],
        insert: async (data) => {
            cnt.insert++
            toArr(data).forEach((v) => kp.set(v.id, v))
            return { n: toArr(data).length, nInserted: toArr(data).length, ok: 1 }
        },
        save: async (data) => {
            cnt.save++
            return toArr(data).map((v) => {
                kp.set(v.id, v)
                return { n: 1, nInserted: 1, ok: 1 }
            })
        },
    }
}
let mkProcOrm = (woItems) => {
    function WOrmReplica(opt) {
        return woItems[opt.cl]
    }
    return WServOrm(ds, WOrmReplica, 'replica', 'replica').procOrm
}
let apiRow = (id) => ({ id, name: 'bad', group: 'G', url: 'http://x', method: 'get' })


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

    //SR-570a: 本函數之判定（判定不改）：NaN、±Infinity 視為未給、不檢查（不參與 dup／group）；0 與負數為有限數字照常。
    //  2026-11-23 更正：此判定並非「同 w-serv-orm 之補值規則」——上游現行對之整批 reject（SR-570b）；本函數只是不替上游多擋一次
    it('SR-570a NaN、±Infinity 於本函數視為未給主鍵（判定不改）：checkRowIds 不檢查；0 與負數為有限數字照常', function() {
        assert.strictEqual(checkRowIds([row(NaN), row(NaN), row(Infinity), row(Infinity), row(-Infinity)], { group: 'G' }), null, '不得因 Infinity 重複而報 dup')
        assert.strictEqual(checkRowIds([row(Infinity)], { group: 'G', groupById: new Map([['Infinity', 'OTHER']]) }), null, '不得以 Infinity 比對他群組')
        assert.deepStrictEqual(checkRowIds([row(0), row('0')], { group: 'G' }), { index: 1, field: 'id', reason: 'dup' })
    })

    //SR-570b: 上游現行行為（已安裝 w-serv-orm 1.1.52，第 568 項起）：主鍵「給了而無效」（NaN、±Infinity、布林、物件）於任何寫入之前整批 reject，零寫入，不補主鍵；
    //  只有未給（undefined、null、''）才補主鍵並寫入。與 SR-570a 並存之理由見 SR-570c。本案守護「註解所述之上游行為」為真，上游改回補值時此案轉紅而提醒更正註解（實測 spec/evidence/twa1-20261123/measure570.mjs）
    it('SR-570b 上游（真 procOrm，已安裝 w-serv-orm）對 NaN、±Infinity、布林、物件主鍵：insert／save 皆整批 reject（invalid id: data[k]）、零寫入、不補主鍵；未給（undefined、null、\'\'）則補主鍵並寫入', async function() {
        for (let [nm, id] of [['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['true', true], ['{}', {}]]) {
            for (let fn of ['insert', 'save']) {
                let woItems = { apis: mkTable() }
                let procOrm = mkProcOrm(woItems)
                let err = null
                try {
                    await procOrm('id-u', 'apis', fn, [apiRow('A-ok'), apiRow(id)])
                }
                catch (e) {
                    err = e
                }
                assert.ok(err !== null, `${nm} ${fn}: 應 reject（上游不再補主鍵），實得 resolve`)
                let msg = typeof err === 'string' ? err : String(err && err.message) //上游以字串 reject
                assert.ok(/invalid id: data\[1\]/.test(msg), `${nm} ${fn}: 訊息應為 invalid id: data[1]（列其位置、不回顯主鍵），實得 ${msg.slice(0, 80)}`)
                assert.strictEqual(woItems.apis.size(), 0, `${nm} ${fn}: 零寫入（含同批之有效列）`)
                assert.strictEqual(woItems.apis.cnt.insert + woItems.apis.cnt.save, 0, `${nm} ${fn}: 不得呼叫底層 insert／save`)
            }
        }
        for (let id of [undefined, null, '']) {
            let woItems = { apis: mkTable() }
            await mkProcOrm(woItems)('id-u', 'apis', 'insert', [apiRow(id)])
            assert.strictEqual(woItems.apis.size(), 1, `未給主鍵（${String(id)}）: 應補主鍵並寫入`)
        }
    })

    //SR-570c: NaN、±Infinity 無法經 JSON 送達（外部匯入與資料通道皆為 JSON，序列化為 null）；另 syncApis 傳入 checkRowIds 者為已驗證之非空字串 srcKey
    //  （server/syncApis.mjs:211-214 先拒缺／空／非字串，守護見 unit-syncApis 之非字串 srcKey 案）——故「本函數視為未給、上游整批 reject」之不一致在本套件不可觀察，判定不改
    it('SR-570c NaN、±Infinity 經 JSON 往返為 null（未給），checkRowIds 對之不檢查', function() {
        for (let v of [NaN, Infinity, -Infinity]) {
            let back = JSON.parse(JSON.stringify([{ id: v, name: 'x' }]))
            assert.strictEqual(back[0].id, null, `${String(v)} 經 JSON 往返應為 null`)
            assert.strictEqual(checkRowIds(back, { group: 'G' }), null)
        }
    })

})
