import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import cint from 'wsemi/src/cint.mjs'
import WSyslog from 'w-syslog/src/WSyslog.mjs'


//後端 log（比照 w-web-sso server/srLog.mjs）：包 w-syslog，依時段輪檔寫入 ./logs。
//用法：srLog.info({ event, ... }) / srLog.warn({...}) / srLog.error({ event, err, ... })。
//錯誤一律 log 其 err key（對齊「後端錯誤須 log err key」原則），供事後識別。
let init = (opt = {}) => {

    let fdLog = get(opt, 'logFd', '')
    if (!isestr(fdLog)) {
        fdLog = './logs'
    }

    let interval = get(opt, 'logInterval', '')
    if (!isestr(interval)) {
        interval = 'hr'
    }

    //numKeep, settings 之 logNumKeep (opt-in): 未給採 w-syslog 預設 (hr: 365*24, day: 365), 有給但非正整數視為設定錯誤
    let numKeep = get(opt, 'logNumKeep', null)
    let o = { fdLog, interval }
    if (numKeep !== null && numKeep !== undefined && numKeep !== '') {
        if (!ispint(numKeep)) {
            throw new Error(`invalid logNumKeep[${numKeep}], must be positive integer`)
        }
        o.numKeep = cint(numKeep)
    }

    let srLog = WSyslog(o)

    return srLog
}


export default init
