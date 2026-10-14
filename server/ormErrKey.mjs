import get from 'lodash-es/get.js'
import isfun from 'wsemi/src/isfun.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import { pickErrName, pickErrCode } from './maskLog.mjs'


/**
 * procOrm／ORM 之失敗轉為語系鍵(R-ERR-1, ADR-038)
 *
 * w-serv-orm 之 procOrm 失敗時 reject 英文訊息字串(如 'failed to save data: id[...]', 1.1.8 起), 直呼 ORM(woItems)者則可能 reject Error;
 * 兩者皆不是本套件之語系鍵, 原樣交出會使前端 $transErr 只能回退 anUnexpectedErrorOccurred、外部呼叫端收到非 key 之字串(CLAUDE.md「錯誤一律回 key」).
 * 故於呼叫 ORM 處以 .catch(ormFail(...)) 改回語系鍵: 寫入類(save/insert/del/delAll)→ 'saveWriteFail'(同 w-web-sso 用語: 部分變更可能已生效)、
 * 讀取類(select)→ 'getDataError'; 原文入 srLog 之 orm 欄供查因.
 * 只用於 ORM 呼叫之 .catch: 本套件自身之 key(如 lockSave 之 saveInProgress)不經此處, 故不需辨識「已是語系鍵」.
 * 記錄規則(權杖外洩防護之 srLog 規則, ADR-033): 字串(w-serv-orm 自產之英文訊息, 只含主鍵或位置)截 200 字; Error 只記名稱與代碼, 不記 message.
 *
 * @param {Object} opt 輸入設定物件
 * @param {Object} opt.srLog 輸入後端 log 物件(須有 error 函數; 未給時不記錄, 仍回語系鍵)
 * @param {String} opt.event 輸入 log 之 event 名稱
 * @param {String} opt.key 輸入對外之語系鍵('saveWriteFail' 或 'getDataError')
 * @param {Object} [opt.info={}] 輸入額外記錄之欄位(如 tableName、method)
 * @returns {Function} 回傳 (err) => Promise.reject(key)
 */
function ormFail({ srLog, event, key, info = {} }) {
    return (err) => {
        let orm = ''
        if (isestr(err)) {
            orm = err.slice(0, 200)
        }
        else {
            let name = pickErrName(err)
            let code = pickErrCode(err)
            orm = `(${typeof err})${name ? ` ${name}` : ''}${code ? ` ${code}` : ''}`
        }
        if (isfun(get(srLog, 'error'))) {
            srLog.error({ event, err: key, orm, ...info })
        }
        return Promise.reject(key)
    }
}


export { ormFail }
export default ormFail
