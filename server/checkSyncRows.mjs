import isestr from 'wsemi/src/isestr.mjs'
import clearXSS from 'wsemi/src/clearXSS.mjs'


//maxIdBytes: 主鍵 UTF-8 位元組上限, 取自 LMDB 之鍵長上限(lmdb 3.5.6: 1978 可寫、1979 拋 'Key size is larger than the maximum key size (1978)', 2026-10-14 實測);
//本套件之參考部署以 w-orm-lmdb 存放, 超長主鍵於 insert 才失敗且已排入之列先行提交(部分寫入), 故於 delAll 之前擋下(R-SYNC-1, ADR-038)
let maxIdBytesDef = 1978


//hasId: 是否為「有給主鍵」——非空字串或有限數字; NaN、±Infinity 與其他型別視為未給(同 w-serv-orm 1.1.11 之補值規則: 由其補主鍵)
let hasId = (id) => isestr(id) || (typeof id === 'number' && Number.isFinite(id))


/**
 * 外部同步(syncAndReplaceTabs)之來源鍵檢核(R-SYNC-1 第③項; 2026-10-23 起對象為 srcKey 值, 以 { id: srcKey } 形狀傳入), 純函數, 不讀寫資料庫
 *
 * 只檢查「有給主鍵」之列: 主鍵為非空字串或有限數字者; 空字串、未給、NaN、±Infinity 或其他型別視為未給, 由 w-serv-orm 補主鍵, 不在此限.
 * 依序檢查, 回報第一個違反: (a) xss: 字串主鍵經 wsemi clearXSS 會被改寫(同 w-serv-orm getMapOrm.mjs 之 getItemsIdXSS 判準; 其於 insert 時整批拒絕, 而同步已先 delAll)
 * (b) bytes: UTF-8 位元組超過 maxIdBytes (c) dup: 同批已出現同一主鍵 (d) group: 資料庫中同主鍵之列屬他群組(insert 為主鍵已存在即略過, 不會搬移).
 * 重複與群組之比對以 String(id) 正規化: w-serv-orm 1.1.11 起字串型主鍵欄之有限數字主鍵存為其字串形式(123 存為 '123'、回應之 id 為 '123'),
 * 故 123 與 '123' 為同一主鍵(2026-10-14 定案; 原「數字主鍵語意待確認、保守視為同鍵」之註記作廢).
 *
 * @param {Array} rows 輸入資料列陣列(已經 ltdtmapping, 各列為物件)
 * @param {Object} [opt={}] 輸入設定物件
 * @param {String} [opt.group=''] 輸入本次同步之群組
 * @param {Map} [opt.groupById=new Map()] 輸入資料庫中既有主鍵(String(id))對應之群組, 只需涵蓋本批之主鍵
 * @param {Integer} [opt.maxIdBytes=1978] 輸入主鍵 UTF-8 位元組上限
 * @returns {Object|null} 回傳 null 代表全部通過; 否則回傳 { index, field: 'id', reason }, reason 為 'xss'、'bytes'、'dup'、'group' 之一
 */
function checkRowIds(rows, opt = {}) {
    let group = isestr(opt.group) ? opt.group : ''
    let groupById = opt.groupById instanceof Map ? opt.groupById : new Map()
    let maxIdBytes = Number.isInteger(opt.maxIdBytes) && opt.maxIdBytes > 0 ? opt.maxIdBytes : maxIdBytesDef

    let seen = new Set()
    for (let k = 0; k < rows.length; k++) {
        let id = rows[k] ? rows[k].id : undefined
        if (!hasId(id)) {
            continue //未給主鍵, 由 w-serv-orm 補
        }
        let sid = String(id)
        if (isestr(id) && clearXSS(id) !== id) {
            return { index: k, field: 'id', reason: 'xss' }
        }
        if (Buffer.byteLength(sid, 'utf8') > maxIdBytes) {
            return { index: k, field: 'id', reason: 'bytes' }
        }
        if (seen.has(sid)) {
            return { index: k, field: 'id', reason: 'dup' }
        }
        seen.add(sid)
        if (groupById.has(sid) && groupById.get(sid) !== group) {
            return { index: k, field: 'id', reason: 'group' }
        }
    }
    return null
}


export { checkRowIds, maxIdBytesDef }
export default checkRowIds
