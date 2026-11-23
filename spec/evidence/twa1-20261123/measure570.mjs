//第 570 項(api 側)實測: w-serv-orm 現行版(已安裝)對「主鍵為 NaN、±Infinity」之寫入行為(procOrm insert／save; 以真 getMapOrm → getProc 組裝, 資料表為記憶體替身)
//  同時量測 checkRowIds(本套件前置純函數)對同批輸入之判定, 與「JSON 通道可否送達 NaN／±Infinity」(JSON.stringify 後 → null)
//用法: node spec/evidence/twa1-20261123/measure570.mjs
import { createRequire } from 'module'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from '../../../src/schema/index.mjs'
import { checkRowIds } from '../../../server/checkSyncRows.mjs'

const require = createRequire(import.meta.url)
console.log(JSON.stringify({ wServOrmVersion: require('w-serv-orm/package.json').version }))

//以公開主入口 WServOrm 組出真 procOrm(WOrm 建構子以替身代之: 回傳呼叫端給定之記憶體資料表, 與 WWebApi 內 WServOrm(ds, WOrm, url, db, opt) 同一組裝)
function mkProcOrm(woItems) {
    function WOrmReplica(opt) {
        return woItems[opt.cl]
    }
    return WServOrm(ds, WOrmReplica, 'replica', 'replica').procOrm
}

//最小記憶體資料表替身: 只計次數與保存寫入之列(上游若整批拒絕, 底層一次也不會被呼叫)
function mkTable() {
    let kp = new Map()
    let cnt = { insert: 0, save: 0 }
    return {
        cnt,
        size: () => kp.size,
        select: async () => [...kp.values()],
        insert: async (data) => {
            cnt.insert++
            let ds0 = Array.isArray(data) ? data : [data]
            for (let v of ds0) {
                kp.set(v.id, v)
            }
            return { n: ds0.length, nInserted: ds0.length, ok: 1 }
        },
        save: async (data) => {
            cnt.save++
            let ds0 = Array.isArray(data) ? data : [data]
            return ds0.map((v) => {
                kp.set(v.id, v)
                return { n: 1, nInserted: 1, ok: 1 }
            })
        },
    }
}

let ids = [['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['true', true], ['{}', {}]]
for (let [nm, id] of ids) {
    for (let fn of ['insert', 'save']) {
        let woItems = { apis: mkTable() }
        let procOrm = mkProcOrm(woItems)
        let r = null
        try {
            let x = await procOrm('id-u', 'apis', fn, [{ id: 'A-ok', name: 'ok', group: 'g', url: 'http://x', method: 'get' }, { id, name: 'bad', group: 'g', url: 'http://x', method: 'get' }])
            r = { resolved: true, ok: JSON.stringify(x).slice(0, 80) }
        }
        catch (err) {
            r = { rejected: true, msg: String((err && err.message) || err).slice(0, 120) }
        }
        console.log(JSON.stringify({ id: nm, fn, ...r, tableSize: woItems.apis.size(), insertCalls: woItems.apis.cnt.insert, saveCalls: woItems.apis.cnt.save }))
    }
    console.log(JSON.stringify({ id: nm, checkRowIds: checkRowIds([{ id }]), afterJsonRoundTrip: JSON.parse(JSON.stringify({ id })).id }))
}

//對照: 未給主鍵(undefined、null、'')——上游補主鍵並寫入
for (let id of [undefined, null, '']) {
    let woItems = { apis: mkTable() }
    let procOrm = mkProcOrm(woItems)
    let r = null
    try {
        await procOrm('id-u', 'apis', 'insert', [{ id, name: 'idless', group: 'g', url: 'http://x', method: 'get' }])
        r = { resolved: true }
    }
    catch (err) {
        r = { rejected: true, msg: String((err && err.message) || err).slice(0, 120) }
    }
    console.log(JSON.stringify({ id: String(id), fn: 'insert', ...r, tableSize: woItems.apis.size() }))
}
