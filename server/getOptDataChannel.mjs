import keys from 'lodash-es/keys.js'
import get from 'lodash-es/get.js'
import isfun from 'wsemi/src/isfun.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import { ormFail } from './ormErrKey.mjs'


/**
 * 資料通道(w-serv-webdata 之表操作與資料同步)之選項, 交給 WServHapiServer 展開使用(R-DC-1, ADR-038)
 *
 * w-serv-webdata 1.1.7 起 useDbOrm=true 時 authorizeExec 為必填(未給即建構拋錯, w-serv-hapi 1.1.6 起同步拋出); procOrm 不做授權(w-serv-orm 1.1.9 起),
 * 表操作之授權在開放處——本模組:
 * - methodsExec 只綁 select: 前端只以同步(不帶參數之 select)讀表, 寫入一律經 kpFunExt 之 saveApi / deleteApi(驗證、funNew 正規化、lockSave、kmx, ADR-034);
 *   原綁之 insert / save / del 使直打 /api/main 者可繞過上述防護, 一併收斂.
 * - authorizeExec 只放行 userId 為非空字串之 select; 其餘記 srLog 後 reject 語系鍵 'errUserNoPermission'(w-serv-webdata 以拒絕值原樣為回應之 msg).
 *   getUserIdByToken 已 fail-closed(查無即 reject), userId 空字串之分支為防禦.
 * - operOrm 之失敗改回語系鍵(R-ERR-1): select → 'getDataError', 原文入 srLog.
 *
 * @param {Object} deps 輸入依賴物件
 * @param {Object} deps.ds 輸入資料表設定(src/schema)
 * @param {Object} deps.woItems 輸入各資料表 ORM(同步需監聽其 change 事件)
 * @param {Function} deps.procOrm 輸入 w-serv-orm 之 procOrm
 * @param {Object} deps.srLog 輸入後端 log 物件
 * @returns {Object} 回傳 { useDbOrm, kpOrm, operOrm, tableNamesExec, methodsExec, tableNamesSync, authorizeExec }
 */
function getOptDataChannel({ ds, woItems, procOrm, srLog } = {}) {

    //check
    if (!isfun(procOrm)) {
        throw new Error('invalid procOrm')
    }

    //tableNames, 全部資料表皆同步(前端以 select 取整表)
    let tableNames = keys(ds)

    //operOrm
    let operOrm = async (userId, tableName, methodName, input) => {
        return procOrm(userId, tableName, methodName, input)
            .catch(ormFail({ srLog, event: 'dataChannel', key: methodName === 'select' ? 'getDataError' : 'saveWriteFail', info: { tableName, methodName } }))
    }

    //authorizeExec
    let authorizeExec = async ({ userId, tableName, methodName }) => {
        if (isestr(userId) && methodName === 'select') {
            return true
        }
        if (isfun(get(srLog, 'error'))) {
            srLog.error({ event: 'authorizeExec', err: 'errUserNoPermission', tableName, methodName })
        }
        return Promise.reject('errUserNoPermission')
    }

    return {
        useDbOrm: true,
        kpOrm: woItems,
        operOrm,
        tableNamesExec: tableNames,
        methodsExec: ['select'],
        tableNamesSync: [...tableNames],
        authorizeExec,
    }
}


export default getOptDataChannel
