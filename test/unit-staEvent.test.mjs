//unit：staEvent 通用事件頻率統計（合成 log + 真 assert；對齊全域 §16.1：測試是規格的翻譯，非現狀指紋）。
//原為 server/staLogs/test_staEvent.mjs（standalone，靠 package.json 之 test script 前置執行）；全域 §16.5 起 scripts 僅留 `test`
//（單一 mocha 指令），故改寫為 mocha 格式置於 test/。臨時 log 落 test/_tmp/_logs-unit-staEvent（gitignore，測完即刪、失敗路徑亦清）。
//與 unit-staEvent-golden 分工：golden 以 173 檔 fixture 深比較改造前輸出並守快取/併發/worker；本檔守聚合語意（bucket 計數、補零、排序、
//雜訊與超期排除）、粒度自適應防線（filterVpfsByWindow 直測 + 整合路徑），兩者臨時目錄各自獨立，可於同一 mocha 進程共存。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ot from 'dayjs'
import staEvent from '../server/staLogs/staEvent.mjs'
import filterVpfsByWindow from '../server/staLogs/filterVpfsByWindow.mjs'


let __dirname = path.dirname(fileURLToPath(import.meta.url))
let fdTmpRoot = path.join(__dirname, '_tmp') //test/_tmp（全域 §16.4；絕不用專案 ./tmp/）
let fdLog = path.join(fdTmpRoot, '_logs-unit-staEvent')
let fdLog2 = path.join(fdTmpRoot, '_logs-unit-staEvent-granularity')

//移除 test/_tmp 本身（僅在已空時；非空代表尚有其他測試之臨時資料，留著）
function rmTmpRootIfEmpty() {
    try {
        fs.rmdirSync(fdTmpRoot)
    }
    catch (e) {} //ENOTEMPTY / ENOENT 皆屬正常
}

//以「當前小時正中（:30）」為錨點，避免測試剛好跨小時邊界導致 bucket 飄移
let anchor = ot().startOf('hour')
let tNow = anchor.add(30, 'minute') //本小時 bucket
let tPrev = anchor.subtract(30, 'minute') //前一小時 bucket
let tOld = anchor.subtract(30, 'day') //30 天前（超出 timeLength=7，應被排除）

let fmtHr = 'YYYY-MM-DDTHH'
let keyNow = tNow.format(fmtHr)
let keyPrev = tPrev.format(fmtHr)


//一筆 log（NDJSON 一行）
function logLine(t, event, extra = {}) {
    let o = { level: 30, time: t.valueOf(), pid: 1, hostname: 'test', event, ...extra }
    return JSON.stringify(o)
}


function writeSyntheticLogs() {
    fs.rmSync(fdLog, { recursive: true, force: true })
    fs.mkdirSync(fdLog, { recursive: true })

    //本小時：verifyConn ×3、kpfun-getApisList ×2、kpfun-saveApi ×1 → count 6
    let lines1 = [
        logLine(tNow, 'verifyConn', { apiType: 'ws' }),
        logLine(tNow, 'verifyConn', { apiType: 'ws' }),
        logLine(tNow, 'verifyConn', { apiType: 'http' }),
        logLine(tNow, 'kpfun-getApisList'),
        logLine(tNow, 'kpfun-getApisList'),
        logLine(tNow, 'kpfun-saveApi'),
        //雜訊：無 event 欄位（應被忽略，不計入 count）
        JSON.stringify({ level: 30, time: tNow.valueOf(), pid: 1, hostname: 'test', msg: 'no-event-here' }),
        //雜訊：壞 JSON 行（應被忽略）
        '{ this is not valid json',
    ]
    //前一小時：verifyConn ×1 → count 1
    let lines2 = [
        logLine(tPrev, 'verifyConn', { apiType: 'ws' }),
    ]
    //30 天前：1 筆（超出 timeLength=7 天，應被排除）
    let lines3 = [
        logLine(tOld, 'verifyConn', { apiType: 'ws' }),
    ]

    //分檔寫入（模擬輪檔多檔；staEvent 會掃整個資料夾）
    fs.writeFileSync(path.join(fdLog, `${keyNow}.log`), lines1.join('\n') + '\n', 'utf8')
    fs.writeFileSync(path.join(fdLog, `${keyPrev}.log`), lines2.join('\n') + '\n', 'utf8')
    fs.writeFileSync(path.join(fdLog, `old.log`), lines3.join('\n') + '\n', 'utf8')
}


function findBucket(rs, time) {
    return rs.find((v) => v.time === time)
}


describe('unit-staEvent', function() {
    this.timeout(60000)

    before(function() {
        writeSyntheticLogs()
    })

    after(function() {
        //成功與失敗路徑皆清（mocha after 於 case 失敗時仍執行）
        fs.rmSync(fdLog, { recursive: true, force: true })
        fs.rmSync(fdLog2, { recursive: true, force: true })
        rmTmpRootIfEmpty()
    })


    //spec 流程_統計資訊.md：hr 粒度依小時 bucket 聚合各 event 次數；無 event / 壞 JSON 行不計；超出 timeLength 之檔排除；無資料時段補 { count: 0 }；時間遞增
    it('STAEVENT-001 hr 粒度：各 event 計數、雜訊與超期排除、補零、排序', async function() {
        let rs = await staEvent(7, 'hr', { fdLog })

        //本小時 bucket：精確比對各 event 與總數
        let bNow = findBucket(rs, keyNow)
        assert.ok(bNow, `應有本小時 bucket ${keyNow}`)
        assert.strictEqual(bNow.data.count, 6, '本小時總次數應為 6')
        assert.strictEqual(bNow.data['verifyConn'], 3, '本小時 verifyConn 應為 3')
        assert.strictEqual(bNow.data['kpfun-getApisList'], 2, '本小時 kpfun-getApisList 應為 2')
        assert.strictEqual(bNow.data['kpfun-saveApi'], 1, '本小時 kpfun-saveApi 應為 1')

        //前一小時 bucket
        let bPrev = findBucket(rs, keyPrev)
        assert.ok(bPrev, `應有前一小時 bucket ${keyPrev}`)
        assert.strictEqual(bPrev.data.count, 1, '前一小時總次數應為 1')
        assert.strictEqual(bPrev.data['verifyConn'], 1, '前一小時 verifyConn 應為 1')

        //無資料時段應補 0（kpTime 補零生效）：取一個既非 now 亦非 prev 的 bucket
        let bEmpty = rs.find((v) => v.time !== keyNow && v.time !== keyPrev)
        assert.ok(bEmpty, '應有其他時段 bucket')
        assert.strictEqual(bEmpty.data.count, 0, '無資料時段 count 應為 0')

        //雜訊與過期排除：全部 bucket count 總和 = 7（本小時 6 + 前一小時 1；無 event/壞行/30 天前皆排除）
        let total = rs.reduce((acc, v) => acc + v.data.count, 0)
        assert.strictEqual(total, 7, '有效事件總和應為 7（無 event/壞行/超期 均不計）')

        //時間遞增排序
        let times = rs.map((v) => v.time)
        let sorted = [...times].sort()
        assert.deepStrictEqual(times, sorted, '結果應依時間遞增排序')
    })


    //spec：day 粒度把同日事件聚到同一天，有效總和不變
    it('STAEVENT-002 day 粒度：同日事件聚到同一天、總和不變', async function() {
        let rsDay = await staEvent(7, 'day', { fdLog })
        let totalDay = rsDay.reduce((acc, v) => acc + v.data.count, 0)
        assert.strictEqual(totalDay, 7, 'day 粒度有效事件總和亦應為 7')
        let keyDayNow = tNow.format('YYYY-MM-DD')
        let bDay = findBucket(rsDay, keyDayNow)
        assert.ok(bDay, `應有本日 bucket ${keyDayNow}`)
        //本日至少含本小時 6 筆（前一小時若跨日則在另一桶，故用 >=）
        assert.ok(bDay.data['verifyConn'] >= 3, '本日 verifyConn 應 >= 3')
    })


    //filterVpfsByWindow「粒度自適應」防線直測（filterVpfsByWindow.mjs 之 slice 比較），覆蓋三個分支，不經 staEvent／fsTreeFolder
    it('STAEVENT-003 filterVpfsByWindow：day 檔名於 hr fmt 保留、窗外 hr 檔名剔除、非 ISO 檔名 fail-open', function() {
        //tStart 固定為 2026-07-08 21:00，keyStart（fmt='YYYY-MM-DDTHH'）= '2026-07-08T21'
        let tStart = ot('2026-07-08T21:00:00')
        let fmtHr2 = 'YYYY-MM-DDTHH'

        //①day 粒度檔名（10 字元）× fmt='YYYY-MM-DDTHH'，且 tStart 落在該日內 → 應保留。
        //不 slice 則 '2026-07-08' < '2026-07-08T21'（同日字典序比較，短字串為前綴恆較小）誤判窗外漏讀整天；
        //`bn >= keyStart.slice(0, bn.length)` 為此案例之防線（slice 後同為 '2026-07-08'，相等即保留）。
        let vpfDaySameDate = { path: '/x/2026-07-08.log', name: '2026-07-08.log', isFolder: false, level: 1 }
        assert.strictEqual(filterVpfsByWindow([vpfDaySameDate], tStart, fmtHr2).length, 1, 'day 粒度同日檔名（10 字元）於 hr fmt（13 字元）下應被保留')

        //②明確窗外之 hr 檔名（早於 tStart 所在小時）→ 應剔除（bn 與 keyStart 同為 13 字元時 slice 為 no-op，純字串比較）
        let vpfHrBefore = { path: '/x/2026-07-08T10.log', name: '2026-07-08T10.log', isFolder: false, level: 1 }
        assert.strictEqual(filterVpfsByWindow([vpfHrBefore], tStart, fmtHr2).length, 0, '明確窗外（早於 tStart 小時）之 hr 檔名應被剔除')

        //③非 ISO 前綴檔名 → fail-open 保留（寧可多讀, 不可漏讀）
        let vpfNonIso = { path: '/x/current.log', name: 'current.log', isFolder: false, level: 1 }
        assert.strictEqual(filterVpfsByWindow([vpfNonIso], tStart, fmtHr2).length, 1, '非 ISO 前綴檔名應 fail-open 保留')
    })


    //整合路徑：srLog 之 logInterval（決定檔名粒度）與 staLogs 之 timeInterval（決定 fmt）不同調時（day 粒度檔名 × hr 粒度 fmt），
    //窗內事件仍須被 staEvent 讀到——證明 filterVpfsByWindow 之 slice 防線在 staEvent 呼叫處（經 fsTreeFolder + fsBuildReadStreamText 實際開檔讀行）確實生效
    it('STAEVENT-004 粒度自適應整合：day 粒度檔名於 hr timeInterval 下窗內事件被計入', async function() {
        fs.rmSync(fdLog2, { recursive: true, force: true })
        fs.mkdirSync(fdLog2, { recursive: true })

        //tRef 近似 staEvent 內部之 tStart（timeLength=0 → tStart ≈ now）；day 粒度檔名（10 字元）＝ tRef 當日
        let tRef = ot()
        let dayFileName = `${tRef.format('YYYY-MM-DD')}.log`
        let tEvent = tRef.add(5, 'second') //晚於 tStart，使 per-line `t.isAfter(tStart)` 成立
        fs.writeFileSync(path.join(fdLog2, dayFileName), logLine(tEvent, 'granularityProbe') + '\n', 'utf8')

        let rsG = await staEvent(0, 'hr', { fdLog: fdLog2 }) //timeLength=0 為合法下界（staLogsCore 之輸入閘允許）
        let totalG = rsG.reduce((acc, v) => acc + v.data.count, 0)
        assert.strictEqual(totalG, 1, 'day 粒度檔名於 hr timeInterval 下，窗內事件應被 staEvent 計入（不被誤判窗外漏讀）')
    })

})
