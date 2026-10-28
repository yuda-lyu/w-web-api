import get from 'lodash-es/get.js'
import isfun from 'wsemi/src/isfun.mjs'
import isestr from 'wsemi/src/isestr.mjs'


//w-serv-orm 診斷輸出(opt.funLog, 1.1.20 起, R-DIAG-01)轉入本套件 srLog(R-ORMDIAG-01, ADR-054)。
//w-serv-orm 預設把診斷輸出(寫入失敗、輸入被拒等)以 console.log(標籤, 摘要) 印到 stdout, 摘要不含主鍵、資料值與錯誤原文; 給 funLog 時診斷輸出只交給它、不再寫 console。
//本套件之行程標準輸出常被 pm2／容器收集, 故接管: 把 label 與 safe 寫入 srLog(event 'orm-diag', 等級 warn), 與其他後端事件同檔、同輪檔、同保留期, 統計頁亦可見。
//
//只寫 label 與 safe, 不寫第三個引數 detail(含主鍵、錯誤原文、查詢條件與資料列等), 本函數之參數表也不宣告它, 故不讀取、不序列化:
//1) 本套件日誌政策(ADR-033, rulebook_backend.md「srLog 之欄位不含權杖與上游原文」)不收上游原文與資料值; detail 之形狀依 w-serv-orm 各站點而異(失敗清單、被拒之查詢條件、Error、資料表定義),
//   以樣式遮罩(正規式)只能列舉已知形狀, 漏一種即外洩使用者識別(email 等)或查詢值, 白名單(只收 safe)才能保證;
//2) 寫入失敗之可診斷性不靠 detail: ORM 失敗由呼叫處 ormFail 另記一筆(err key＋orm 欄, R-ERR-1), safe 提供 w-serv-orm 層之站點(label 含表名與操作)、失敗筆數與位置、錯誤類別與機器代碼。
//safe 另經長度上限與 JSON 序列化(控制字元轉義), label 控制字元換成 ?(防 log 注入, 同 maskLog.mjs 之 maskCtrl)。
//寫入失敗不得影響原流程: 全程 try／catch, 不上拋; close() 之後不再寫入(srLog.clear() 之後再呼叫 log 方法會使宿主終止, 見 w-syslog R21)。


//label 與 safe 之長度上限(label 為「表名.操作 結果」之短句, safe 為 { n, ks }／{ errType, errCode } 等小物件, 超過者截斷, 不收長文)
const N_LABEL = 200
const N_SAFE = 500


let clip = (s, n) => {
    return s.length > n ? `${s.slice(0, n)}...` : s
}


//控制字元 \u0000-\u001f、\u007f 換成 ?(同 maskLog.mjs 之 maskCtrl)
let maskCtrl = (s) => {
    let r = ''
    for (let c of s) {
        let code = c.charCodeAt(0)
        r += (code <= 0x1f || code === 0x7f) ? '?' : c
    }
    return r
}


let toLabel = (label) => {
    if (!isestr(label)) {
        return `(${typeof label})`
    }
    return maskCtrl(clip(label, N_LABEL))
}


let toSafe = (safe) => {
    if (safe === undefined) {
        return ''
    }
    try {
        let s = JSON.stringify(safe)
        return isestr(s) ? clip(s, N_SAFE) : `(${typeof safe})`
    }
    catch (err) {
        return '(unserializable)'
    }
}


/**
 * 建立交給 WServOrm 之 opt.funLog
 *
 * @param {Object} srLog 輸入後端 log 物件(須有 warn 函數; 沒有時不記錄)
 * @returns {Object} 回傳 { funLog, close }, funLog 為 (label, safe) => undefined, close() 為關閉後不再寫入之閂(srLog.clear() 之前呼叫)
 */
function createOrmDiagLog(srLog) {
    let closed = false

    let funLog = (label, safe) => {
        if (closed) {
            return
        }
        try {
            let warn = get(srLog, 'warn')
            if (!isfun(warn)) {
                return
            }
            let r = warn.call(srLog, { event: 'orm-diag', label: toLabel(label), safe: toSafe(safe) })
            if (r !== null && r !== undefined && isfun(r.then)) {
                r.then(undefined, () => {}) //srLog 若回傳 promise, 其 reject 不成為 unhandledRejection
            }
        }
        catch (err) {
            //診斷輸出失敗不影響 ORM 流程(w-serv-orm 亦吞下 funLog 之拋錯, 此處再保一層)
        }
    }

    let close = () => {
        closed = true
    }

    return { funLog, close }
}


export { createOrmDiagLog, toLabel, toSafe }
export default createOrmDiagLog
