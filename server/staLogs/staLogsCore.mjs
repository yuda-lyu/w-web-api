import fs from 'fs'
import path from 'path'
import readline from 'readline'
import ot from 'dayjs'
import get from 'lodash-es/get.js'
import isfun from 'wsemi/src/isfun.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import fsTreeFolder from 'wsemi/src/fsTreeFolder.mjs'
import filterVpfsByWindow from './filterVpfsByWindow.mjs'


//staLogsCore: staEvent (各 event 時序分桶) 之核心 (鏡像 w-web-sso server/staLogs/staLogsCore.mjs, ADR-051)
//  1. 逐行先比 event 再算時間: time 為 epoch ms 數值 (pino) 直接數值比較, 桶鍵以分鐘整數 memo 查表, 不逐行 dayjs; 就地累加不建陣列
//  2. 檔級彙總快取: w-syslog 依寫入當下時鐘切檔, 整點跨過後舊檔不再被寫入, 每檔彙總以 (name, size, mtimeMs) 為鍵快取;
//     檔內最早可計入行 minTimeMs > tStartMs 時窗過濾為 no-op 才沿用, 否則 (邊界檔) 重掃; 當前小時檔 size 變動自然重掃; 快取依 fmt 分開
//     彙總相依於掃描當下之窗 (窗外行不進 agg), 故 entry 另記 scanTStartMs, 沿用須同時滿足「掃描時無行被窗過濾 (minTimeMs > scanTStartMs)」
//     與「整檔仍在新窗內 (minTimeMs > 新 tStartMs)」; 否則 timeLength 由小變大 (窗後退) 時會沿用以窄窗掃出之不完整彙總而靜默漏算
//  3. single-flight: 同參數併發呼叫共用同一 in-flight promise
//  4. 資料夾項目略過; 單檔讀取錯誤略過該檔 (不入快取、不整體失敗)
//  輸出形狀與原 staEvent.mjs 一致 (golden test: test/unit-staEvent-golden.test.mjs 以改造前實作產出之 expected 深比較)
//  刻意差異: 無 time (或 time 無法解析) 之行不計入任何桶 (原實作 ot(undefined) 視為 now 而計入當前桶)


//快取: `${fdLog}|${fmt}` → Map(檔名 → { size, mtimeMs, minTimeMs, scanTStartMs, agg })
let kpCache = new Map()

//single-flight: key → promise
let kpInflight = new Map()


function normTimeInterval(timeInterval) {
    //非 'day' 一律視同 'hr' (原以 ==='day' 決定 fmt、==='hr' 決定 unit, 傳其他值時兩者不一致, 此處收斂為單一判斷)
    return timeInterval === 'day' ? 'day' : 'hr'
}


function genPlan(timeLength = 7, timeInterval = 'hr', opt = {}) {

    //fdLog
    let fdLog = get(opt, 'fdLog')
    if (!isestr(fdLog)) {
        fdLog = './logs'
    }

    //timeInterval, fmt, unit
    let ti = normTimeInterval(timeInterval)
    let fmt = ti === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH'
    let unit = ti === 'day' ? 'day' : 'hour'

    //now, 測試可由 opt.timeNow (epoch ms) 釘住
    let timeNow = get(opt, 'timeNow')
    let now = (typeof timeNow === 'number') ? ot(timeNow) : ot()

    //tStart
    let tStart = now.subtract(timeLength, 'day')
    let tStartMs = tStart.valueOf()

    //kpTime, 產生完整的時間區間 (無資料時段亦補 { count: 0 }, 圖表 x 軸不留空洞)
    let tCurr = tStart.startOf(unit)
    let tEnd = now.startOf(unit)
    let kpTime = []
    while (!tCurr.isAfter(tEnd)) {
        kpTime.push(tCurr.format(fmt))
        tCurr = tCurr.add(1, unit)
    }

    return { fdLog, timeInterval: ti, fmt, unit, tStart, tStartMs, kpTime, timeNow: now.valueOf() }
}


function listFiles(fdLog, tStart, fmt) {

    //vpfs
    let vpfs = fsTreeFolder(fdLog)

    //剔除資料夾項目 (fsTreeFolder 會列出子資料夾, 對其開讀取串流會 throw)
    vpfs = vpfs.filter((vpf) => {
        return !get(vpf, 'isFolder', false)
    })

    //開檔前剔除窗外檔, 見該模組註解
    vpfs = filterVpfsByWindow(vpfs, tStart, fmt)

    //stat
    let files = []
    for (let vpf of vpfs) {
        try {
            let st = fs.statSync(vpf.path)
            if (!st.isFile()) {
                continue
            }
            files.push({ path: vpf.path, name: vpf.name, size: st.size, mtimeMs: st.mtimeMs })
        }
        catch (err) {
            //列出後即被移除 (cleanLogs) → 略過
        }
    }

    return files
}


function createBucketLabeler(fmt) {
    //以分鐘整數為 memo 鍵 (任何整分鐘偏移之時區皆與逐行 format 等價), 標籤仍由 dayjs 產生
    let kp = new Map()
    return (tms) => {
        let k = Math.floor(tms / 60000)
        let s = kp.get(k)
        if (s === undefined) {
            s = ot(k * 60000).format(fmt)
            kp.set(k, s)
        }
        return s
    }
}


function toMs(t) {
    if (typeof t === 'number') {
        return t
    }
    if (isestr(t)) {
        return ot(t).valueOf() //ISO 字串 (非 w-syslog 之來源) 走慢路徑; 無法解析回 NaN
    }
    return NaN
}


function readLines(fp, onLine) {
    return new Promise((resolve, reject) => {
        let errTemp = null
        let stream = fs.createReadStream(fp, { encoding: 'utf8' })
        let rl = readline.createInterface({
            input: stream,
            crlfDelay: Infinity,
        })
        rl.on('line', onLine)
        let onError = (err) => {
            errTemp = err
            rl.close()
        }
        stream.on('error', onError)
        rl.on('error', onError) //readline Interface 會把 input 之 error 再拋一次, 未監聽即 unhandled
        stream.on('close', () => {
            if (errTemp) {
                reject(errTemp)
            }
            else {
                resolve()
            }
        })
    })
}


//掃一檔: 各桶 { count, kp:{event:n} }, 任何帶 event 字串之行皆計入 (通用, 不鎖定單一 event)
async function scanFile(fp, tStartMs, fmt, labeler = null) {
    if (!isfun(labeler)) {
        labeler = createBucketLabeler(fmt)
    }

    let agg = { minTimeMs: null, ev: {} }

    await readLines(fp, (line) => {

        //v
        let v = null
        try {
            v = JSON.parse(line)
        }
        catch (err) {
            return //略過非 JSON / 壞行
        }
        if (v === null || typeof v !== 'object') {
            return
        }

        //event, 先比對再算時間
        let e = v.event
        if (!isestr(e)) {
            return
        }

        //tms
        let tms = toMs(v.time)
        if (Number.isNaN(tms)) {
            return //無 time 或無法解析: 不計入 (刻意差異, 見檔頭)
        }

        //minTimeMs, 對所有可計入之行取最小值 (不論是否在窗內), 供快取有效性判斷
        if (agg.minTimeMs === null || tms < agg.minTimeMs) {
            agg.minTimeMs = tms
        }

        //窗判斷, 對齊原 t.isAfter(tStart)
        if (!(tms > tStartMs)) {
            return
        }

        //accumulate
        let label = labeler(tms)
        let b = agg.ev[label]
        if (b === undefined) {
            b = { count: 0, kp: {} }
            agg.ev[label] = b
        }
        b.count += 1
        b.kp[e] = (b.kp[e] || 0) + 1

    })

    return agg
}


//掃描一批檔案, 回傳 [{ name, ok, agg | err }]; 單檔失敗不影響其他檔 (worker 端亦呼叫此函式)
async function scanFiles(files, tStartMs, fmt) {
    let labeler = createBucketLabeler(fmt)
    let rs = []
    for (let f of files) {
        try {
            let agg = await scanFile(f.path, tStartMs, fmt, labeler)
            rs.push({ name: f.name, ok: true, agg })
        }
        catch (err) {
            rs.push({ name: f.name, ok: false, err: String(get(err, 'message', err)) })
        }
    }
    return rs
}


function mergeAgg(target, agg) {
    for (let label in agg.ev) {
        let s = agg.ev[label]
        let b = target[label]
        if (b === undefined) {
            b = { count: 0, kp: {} }
            target[label] = b
        }
        b.count += s.count
        for (let e in s.kp) {
            b.kp[e] = (b.kp[e] || 0) + s.kp[e]
        }
    }
    return target
}


function buildOutput(merged, kpTime) {
    //對齊原 merge({}, kpTime, gsLog) + Object.keys().sort(): 窗內桶補零, 資料桶 (含未來時間桶) 聯集
    let kp = {}
    for (let label of kpTime) {
        kp[label] = { count: 0 }
    }
    for (let label in merged) {
        let b = merged[label]
        kp[label] = { count: b.count, ...b.kp }
    }
    return Object.keys(kp)
        .sort()
        .map((time) => ({
            time,
            data: kp[time],
        }))
}


function getCacheKey(fdLog, fmt) {
    return `${path.resolve(fdLog)}|${fmt}`
}


function getCacheDir(key) {
    let m = kpCache.get(key)
    if (!m) {
        m = new Map()
        kpCache.set(key, m)
    }
    return m
}


function clearCache() {
    kpCache.clear()
}


function getCacheSize(fdLog = './logs', timeInterval = 'hr') {
    let fmt = normTimeInterval(timeInterval) === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH'
    let m = kpCache.get(getCacheKey(fdLog, fmt))
    return m ? m.size : 0
}


async function run(plan, opt = {}) {

    //useCache
    let useCache = get(opt, 'useCache') !== false

    //scanFilesFn, callWorker 注入 worker 版
    let scanFilesFn = get(opt, 'scanFiles')
    if (!isfun(scanFilesFn)) {
        scanFilesFn = scanFiles
    }

    //srLog
    let srLog = get(opt, 'srLog', null)

    //files
    let files = listFiles(plan.fdLog, plan.tStart, plan.fmt)

    //cacheDir
    let cacheDir = getCacheDir(getCacheKey(plan.fdLog, plan.fmt))

    //分流: 快取可沿用 vs 需重掃
    let toScan = []
    let kpAgg = {}
    for (let f of files) {
        let c = useCache ? cacheDir.get(f.name) : undefined
        //沿用條件: 檔未變 + 彙總完整 (掃描時無行被窗過濾: minTimeMs > scanTStartMs) + 整檔仍在新窗內 (minTimeMs > 新 tStartMs)
        //  只檢查後者時, timeLength 由小變大 (tStart 後退) 會沿用以窄窗掃出之不完整彙總 → 靜默漏算
        let b = c !== undefined &&
            c.size === f.size &&
            c.mtimeMs === f.mtimeMs &&
            (c.minTimeMs === null || (c.minTimeMs > c.scanTStartMs && c.minTimeMs > plan.tStartMs))
        if (b) {
            kpAgg[f.name] = c.agg
        }
        else {
            toScan.push(f)
        }
    }

    //淘汰已不存在之檔 (cleanLogs 刪舊檔)
    if (useCache) {
        let kpName = new Set(files.map((f) => f.name))
        for (let name of cacheDir.keys()) {
            if (!kpName.has(name)) {
                cacheDir.delete(name)
            }
        }
    }

    //scan
    let errors = []
    if (toScan.length > 0) {
        let rs = await scanFilesFn(toScan.map((f) => ({ path: f.path, name: f.name })), plan.tStartMs, plan.fmt)
        let kpRs = {}
        for (let r of rs) {
            kpRs[r.name] = r
        }
        for (let f of toScan) {
            let r = kpRs[f.name]
            if (r && r.ok) {
                kpAgg[f.name] = r.agg
                if (useCache) {
                    cacheDir.set(f.name, { size: f.size, mtimeMs: f.mtimeMs, minTimeMs: r.agg.minTimeMs, scanTStartMs: plan.tStartMs, agg: r.agg })
                }
            }
            else {
                let err = get(r, 'err', 'no result')
                errors.push({ name: f.name, err })
                if (useCache) {
                    cacheDir.delete(f.name)
                }
                if (srLog && isfun(srLog.warn)) {
                    srLog.warn({ event: 'fun-staLogs', key: 'staLogsFileSkipped', name: f.name, err })
                }
            }
        }
    }

    //merge
    let merged = {}
    for (let f of files) {
        let agg = kpAgg[f.name]
        if (agg) {
            mergeAgg(merged, agg)
        }
    }

    //output
    let rs = buildOutput(merged, plan.kpTime)
    return {
        rs,
        stat: {
            nFiles: files.length,
            nScanned: toScan.length,
            nCached: files.length - toScan.length,
            errors,
        },
    }
}


//staLogs: 核心入口, 回傳 { rs, stat }
function staLogs(timeLength = 7, timeInterval = 'hr', opt = {}) {
    //非 async: 併發呼叫須回傳同一個 promise 物件

    //plan
    let plan = genPlan(timeLength, timeInterval, opt)

    //single-flight
    let key = JSON.stringify([path.resolve(plan.fdLog), timeLength, plan.timeInterval, get(opt, 'timeNow', null)])
    if (kpInflight.has(key)) {
        return kpInflight.get(key)
    }
    let pm = run(plan, opt)
        .finally(() => {
            kpInflight.delete(key)
        })
    kpInflight.set(key, pm)

    return pm
}


export { staLogs, genPlan, listFiles, scanFile, scanFiles, mergeAgg, buildOutput, clearCache, getCacheSize, normTimeInterval }
export default staLogs
