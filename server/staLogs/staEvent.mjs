import ot from 'dayjs'
import get from 'lodash-es/get.js'
import size from 'lodash-es/size.js'
import groupBy from 'lodash-es/groupBy.js'
import each from 'lodash-es/each.js'
import mapValues from 'lodash-es/mapValues.js'
import merge from 'lodash-es/merge.js'
import genPm from 'wsemi/src/genPm.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import fsTreeFolder from 'wsemi/src/fsTreeFolder.mjs'
import fsBuildReadStreamText from 'wsemi/src/fsBuildReadStreamText.mjs'
import filterVpfsByWindow from './filterVpfsByWindow.mjs'


//staEvent（通用事件頻率統計，骨架移植自 w-web-sso server/staLogs/staIp.mjs，但「不過濾特定 event」、
//內層改依 `event` 欄位分組）：掃 fdLog 下所有 NDJSON log 檔，依時間 bucket（hr/day）+ 各 event 名聚合次數。
//輸出供前端統計圖：可呈現「全部（count）」或「各 event 各自」之時段發生頻率。
//
//回傳格式（時間遞增、無資料時段補 0）：
//  [
//    { time: '2026-06-22T10', data: { count: 6, 'verifyConn': 3, 'kpfun-getApisList': 2, 'kpfun-saveApi': 1 } },
//    { time: '2026-06-22T11', data: { count: 0 } },
//    ...
//  ]
//
//參數：
//  timeLength   往回統計天數（預設 7）
//  timeInterval 時間粒度 'hr'（每小時，預設）/ 'day'（每日）
//  opt.fdLog    log 資料夾（預設 './logs'，須與 srLog 寫入之 logFd 一致；e2e 可指向合成 log 達 hermetic）
async function staEvent(timeLength = 7, timeInterval = 'hr', opt = {}) {

    //fdLog
    let fdLog = get(opt, 'fdLog')
    if (!isestr(fdLog)) {
        fdLog = './logs'
    }

    //fmt
    let fmt = timeInterval === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH'

    //unit
    let unit = timeInterval === 'hr' ? 'hour' : 'day'

    //kpTime，產生完整的時間區間（無資料時段亦補 { count: 0 }，圖表 x 軸不留空洞）
    let now = ot()
    let tStart = now.subtract(timeLength, 'day')
    let tCurr = tStart.startOf(unit)
    let tEnd = now.startOf(unit)
    let kpTime = {}
    while (!tCurr.isAfter(tEnd)) {
        kpTime[tCurr.format(fmt)] = { data: { count: 0 } }
        tCurr = tCurr.add(1, unit)
    }

    //vpfs
    let vpfs = fsTreeFolder(fdLog)
    vpfs = filterVpfsByWindow(vpfs, tStart, fmt) //開檔前剔除窗外檔, 見該模組註解

    //logs（逐檔逐行 stream parse，挑出 tStart 之後、且帶 event 字串者）
    let logs = []
    for (let vpf of vpfs) {

        //fp
        let fp = vpf.path

        //ev
        let ev = fsBuildReadStreamText(fp)

        //line
        ev.on('line', (line) => {
            let v = null
            try {
                v = JSON.parse(line)
                let t = ot(v.time)
                let timeFmt = t.format(fmt)
                let b1 = t.isAfter(tStart)
                let b2 = isestr(v.event) //通用：任何帶 event 字串之 log 皆納入（非鎖定單一 event）
                let b = b1 && b2
                if (b) {
                    logs.push({
                        timeFmt,
                        ...v,
                    })
                }
            }
            catch (err) {} //略過非 JSON / 壞行
        })

        //await close
        let pm = genPm()
        ev.on('close', () => {
            pm.resolve()
        })
        await pm

    }

    //gs，依時間 bucket 分組
    let gs = groupBy(logs, 'timeFmt')

    //gsLog，各 bucket 內依 event 名計數 + 總數 count
    let gsLog = mapValues(gs, vs => {
        let count = size(vs)
        let gev = groupBy(vs, 'event')
        let kp = {}
        each(gev, (vvs, event) => {
            kp[event] = size(vvs)
        })
        return {
            data: {
                count,
                ...kp,
            }
        }
    })

    //merge（補零時段 + 實際資料）
    let mr = merge({}, kpTime, gsLog)

    //rs（時間遞增排序輸出）
    let rs = Object.keys(mr)
        .sort()
        .map(time => ({
            time,
            ...mr[time]
        }))

    return rs
}

export default staEvent
