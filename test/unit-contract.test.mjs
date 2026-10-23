//unit-contract：apis 表寫入契約之完整性（多人同時編輯規格第 3、4、9 節；外部匯入規格第 4 節欄位歸屬；rulebook_concurrency.md §1、§4）。
//契約 fields／serverOnly 須涵蓋 schema 全部欄位（去 pk）且不重疊——欄位增減時強迫重新分類（否則新欄位要嘛靜默不入基準、要嘛被存檔回寫舊值）；
//外部擁有／本系統擁有二分與 fields 一致；推送端 provideTabs 只送外部擁有欄位與身分鍵；伺服端 pickWriteRow 白名單只輸出 pk 與 fields。
import assert from 'assert'
import http from 'http'
import { checkContract, pickWriteRow, digestRow } from 'w-serv-orm/src/baseline.mjs'
import ds from '../src/schema/index.mjs'
import contract, { fieldsExternal, fieldsLocal, fieldsServerOnly } from '../src/schema/contracts/apis.mjs'
import provideTabs from '../server/provideTabs.mjs'


let PORT_STUB = 11086 //C08 之替身伺服器（unit-provideTabs 用 11083／11085）
let setOf = (a) => new Set(a)
let sorted = (a) => [...a].sort()


describe('unit-contract (apis 寫入契約完整性)', function() {

    it('C01 契約通過 checkContract；只含 table／pk／fields／serverOnly 四鍵；table=apis、pk=id；不設 orderKey 與 scope（order 為一般欄位、逐列基準不需範圍）', function() {
        assert.strictEqual(checkContract(contract), true)
        assert.deepStrictEqual(Object.keys(contract).sort(), ['fields', 'pk', 'serverOnly', 'table'])
        assert.strictEqual(contract.table, 'apis')
        assert.strictEqual(contract.pk, 'id')
        assert.ok(contract.fields.includes('order'), 'order 可由表單直接編輯，其值入基準')
    })

    it('C02 schema 全部欄位（去 pk）＝ fields ∪ serverOnly，且兩者不重疊、各自無重複（欄位增減強迫重新分類）', function() {
        let keys = Object.keys(ds.apis.settings).filter((k) => k !== contract.pk)
        assert.strictEqual(contract.fields.length, setOf(contract.fields).size, 'fields 無重複')
        assert.strictEqual(contract.serverOnly.length, setOf(contract.serverOnly).size, 'serverOnly 無重複')
        let overlap = contract.fields.filter((k) => contract.serverOnly.includes(k))
        assert.deepStrictEqual(overlap, [], 'fields 與 serverOnly 不重疊')
        assert.deepStrictEqual(sorted([...contract.fields, ...contract.serverOnly]), sorted(keys), '契約須涵蓋 schema 全部欄位')
        assert.strictEqual(ds.apis.keys.length, keys.length + 1, 'ds.apis.keys 含 pk')
    })

    it('C03 統計：fields 24 欄、serverOnly 5 欄（timeCreate、timeUpdate、isActive、userIdUpdate、srcKey）；schema 共 29 欄＋主鍵', function() {
        assert.strictEqual(contract.fields.length, 24)
        assert.deepStrictEqual(sorted(contract.serverOnly), sorted(['timeCreate', 'timeUpdate', 'isActive', 'userIdUpdate', 'srcKey']))
        assert.deepStrictEqual(sorted(fieldsServerOnly), sorted(contract.serverOnly))
        assert.strictEqual(Object.keys(ds.apis.settings).length, 30)
    })

    it('C04 外部擁有（匯入寫）16 欄 ＋ 本系統擁有（匯入不寫）8 欄 ＝ fields，二者不重疊；本系統擁有欄位為 tokens、authType、authConfigJson、testBaseUrl、default*Json、contentType（R-IMPORT-01、C4b）', function() {
        assert.strictEqual(fieldsExternal.length, 16)
        assert.deepStrictEqual(sorted(fieldsLocal), sorted(['tokens', 'testBaseUrl', 'authType', 'authConfigJson', 'defaultHeadersJson', 'defaultQueryJson', 'defaultBodyJson', 'contentType']))
        assert.deepStrictEqual(fieldsExternal.filter((k) => fieldsLocal.includes(k)), [])
        assert.deepStrictEqual(sorted([...fieldsExternal, ...fieldsLocal]), sorted(contract.fields))
        assert.ok(fieldsExternal.includes('group'), '來源範圍 group 屬身分欄，隨批次')
    })

    it('C05 pickWriteRow：只輸出 pk 與 fields；伺服器專有欄位、系統欄位、未知欄位不輸出（V5、A7）', function() {
        let row = ds.apis.funNew({ id: 'x', name: 'n', url: 'u', tokens: 't', srcKey: 'k', timeCreate: '1999', isActive: 'n', userIdUpdate: 'forged', timeUpdate: 'forged', unknown: 'u' })
        row.id = 'x'
        let o = pickWriteRow(row, contract)
        assert.deepStrictEqual(sorted(Object.keys(o)), sorted(['id', ...contract.fields]))
        assert.ok(!('srcKey' in o) && !('timeCreate' in o) && !('isActive' in o) && !('userIdUpdate' in o) && !('timeUpdate' in o) && !('unknown' in o))
    })

    it('C06 摘要只取 fields：伺服器專有欄位（timeUpdate、userIdUpdate、srcKey…）變動不改摘要；fields 內任一欄變動即改摘要', function() {
        let row = ds.apis.funNew({ name: 'n', url: 'u', method: 'get' })
        let d0 = digestRow(row, contract)
        for (let k of contract.serverOnly) {
            assert.strictEqual(digestRow({ ...row, [k]: 'changed' }, contract), d0, `${k} 不入基準`)
        }
        for (let k of contract.fields) {
            assert.notStrictEqual(digestRow({ ...row, [k]: 'changed-xyz' }, contract), d0, `${k} 入基準`)
        }
    })

    it('C07 funNew：產生之列含 schema 全部欄位；srcKey、userIdUpdate 為空字串（後台自建列的來源鍵為空）；isActive=y', function() {
        let row = ds.apis.funNew({ name: 'n', url: 'u' })
        assert.deepStrictEqual(sorted(Object.keys(row)), sorted(ds.apis.keys))
        assert.strictEqual(row.srcKey, '')
        assert.strictEqual(row.userIdUpdate, '')
        assert.strictEqual(row.isActive, 'y')
    })

    it('C08 推送端 provideTabs 只送外部擁有欄位與身分鍵（srcKey、id 相容）：本系統擁有欄位與伺服器專有欄位不送', async function() {
        let body = null
        let srv = await new Promise((resolve) => {
            let s = http.createServer((req, res) => {
                let chunks = []
                req.on('data', (c) => chunks.push(c))
                req.on('end', () => {
                    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({ state: 'success', msg: { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 } }))
                })
            })
            s.listen(PORT_STUB, '127.0.0.1', () => resolve(s))
        })
        try {
            let all = {}
            for (let k of Object.keys(ds.apis.settings)) {
                all[k] = `v-${k}`
            }
            let msg = await provideTabs(`http://127.0.0.1:${PORT_STUB}/syncAndReplaceTabs?keyTable=apis&token=t`, 'apis', 'g', [all])
            assert.deepStrictEqual(msg, { nAdd: 1, nUpdate: 0, nDel: 0, nSame: 0 }, 'provideTabs resolve 伺服器回應之計數')
            let sent = Object.keys(body.rows[0]).sort()
            assert.deepStrictEqual(sent, sorted(['srcKey', 'id', ...fieldsExternal]), '只送 srcKey、id（相容）與外部擁有欄位')
            for (let k of [...fieldsLocal, 'timeCreate', 'timeUpdate', 'isActive', 'userIdUpdate']) {
                assert.ok(!(k in body.rows[0]), `${k} 不得送出`)
            }
            assert.strictEqual(body.group, 'g')
        }
        finally {
            await new Promise((resolve) => srv.close(resolve))
        }
    })

})
