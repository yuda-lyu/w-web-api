//test_staEvent：staEvent 通用事件頻率統計之單元測試。
//
//與 w-web-sso 之 test_staIp.mjs（純 console.log 人工核對）不同，本檔走「合成 log + 真 assert」（對齊全域 §6.2：
//測試是規格的翻譯，非現狀指紋）：自建確定性 NDJSON log → 呼叫 staEvent → 斷言聚合結果 → 清理。
//
//執行：node server/staLogs/test_staEvent.mjs（全綠印 PASS、process exit 0；任一斷言失敗 throw、exit 1）。
//
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import ot from 'dayjs'
import staEvent from './staEvent.mjs'
import filterVpfsByWindow from './filterVpfsByWindow.mjs'


//tmp log 資料夾（落在主 cwd ./tmp/，集中可一鍵清；不污染真實 ./logs）
let fdLog = './tmp/_logs-test-staEvent'

//以「當前小時正中（:30）」為錨點，避免測試剛好跨小時邊界導致 bucket 飄移
let anchor = ot().startOf('hour')
let tNow = anchor.add(30, 'minute')         //本小時 bucket
let tPrev = anchor.subtract(30, 'minute')   //前一小時 bucket
let tOld = anchor.subtract(30, 'day')       //30 天前（超出 timeLength=7，應被排除）

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


//testFilterVpfsByWindowDirect：直測 filterVpfsByWindow「粒度自適應」防線（filterVpfsByWindow.mjs:22），
//以自造 vpfs 物件陣列覆蓋 P-2 要求之三個分支，不經 staEvent／fsTreeFolder。
function testFilterVpfsByWindowDirect() {

    //tStart 固定為 2026-07-08 21:00，keyStart（fmt='YYYY-MM-DDTHH'）= '2026-07-08T21'
    let tStart = ot('2026-07-08T21:00:00')
    let fmtHr2 = 'YYYY-MM-DDTHH'

    //①day 粒度檔名（10 字元）× fmt='YYYY-MM-DDTHH'，且 tStart 落在該日內 → 應保留。
    //對應規格：filterVpfsByWindow.mjs:11-14 註解——不 slice 則 '2026-07-08' < '2026-07-08T21'（同日
    //字典序比較，短字串為前綴恆較小）誤判窗外漏讀整天；filterVpfsByWindow.mjs:22 之
    //`bn >= keyStart.slice(0, bn.length)` 為此案例之防線（slice 後同為 '2026-07-08'，相等即保留）。
    let vpfDaySameDate = { path: '/x/2026-07-08.log', name: '2026-07-08.log', isFolder: false, level: 1 }
    let rs1 = filterVpfsByWindow([vpfDaySameDate], tStart, fmtHr2)
    assert.strictEqual(rs1.length, 1, 'day 粒度同日檔名（10 字元）於 hr fmt（13 字元）下應被保留')

    //②明確窗外之 hr 檔名（早於 tStart 所在小時）→ 應剔除。
    //對應規格：filterVpfsByWindow.mjs:22 主邏輯 `bn >= keyStart.slice(0, bn.length)`——
    //bn 與 keyStart 同為 hr 粒度（13 字元）時 slice 為 no-op，純字串比較即可判窗外。
    let vpfHrBefore = { path: '/x/2026-07-08T10.log', name: '2026-07-08T10.log', isFolder: false, level: 1 }
    let rs2 = filterVpfsByWindow([vpfHrBefore], tStart, fmtHr2)
    assert.strictEqual(rs2.length, 0, '明確窗外（早於 tStart 小時）之 hr 檔名應被剔除')

    //③非 ISO 前綴檔名 → fail-open 保留。
    //對應規格：filterVpfsByWindow.mjs:9,19-20 註解——「fail-open: 檔名不符 ISO 前綴者一律保留
    //（寧可多讀, 不可漏讀）」。
    let vpfNonIso = { path: '/x/current.log', name: 'current.log', isFolder: false, level: 1 }
    let rs3 = filterVpfsByWindow([vpfNonIso], tStart, fmtHr2)
    assert.strictEqual(rs3.length, 1, '非 ISO 前綴檔名應 fail-open 保留')

    console.log('=== testFilterVpfsByWindowDirect PASS ===')
}


//testGranularityAdaptiveIntegration：整合路徑驗證——srLog 之 logInterval（決定檔名粒度）與 staLogs 之
//timeInterval（決定 fmt）不同調時（day 粒度檔名 × hr 粒度 fmt），窗內事件仍須被 staEvent 讀到。
//對應規格：filterVpfsByWindow.mjs:11-14 註解之情境重現於整合路徑（經 fsTreeFolder + fsBuildReadStreamText
//實際開檔讀行），證明 filterVpfsByWindow.mjs:22 之 slice 防線在 staEvent.mjs:57 呼叫處確實生效，
//而非僅單元測試層級成立。
async function testGranularityAdaptiveIntegration() {
    let fdLog2 = './tmp/_logs-test-staEvent-granularity'
    fs.rmSync(fdLog2, { recursive: true, force: true })
    fs.mkdirSync(fdLog2, { recursive: true })

    //tRef 近似 staEvent 內部之 tStart（timeLength=0 → tStart ≈ now）；day 粒度檔名（10 字元）＝ tRef 當日
    let tRef = ot()
    let dayFileName = `${tRef.format('YYYY-MM-DD')}.log`
    let tEvent = tRef.add(5, 'second') //晚於 tStart，使 staEvent.mjs:76 之 per-line `t.isAfter(tStart)` 成立
    let lines = [logLine(tEvent, 'granularityProbe')]
    fs.writeFileSync(path.join(fdLog2, dayFileName), lines.join('\n') + '\n', 'utf8')

    let rsG = await staEvent(0, 'hr', { fdLog: fdLog2 })
    let totalG = rsG.reduce((acc, v) => acc + v.data.count, 0)
    assert.strictEqual(totalG, 1, 'day 粒度檔名於 hr timeInterval 下，窗內事件應被 staEvent 計入（不被誤判窗外漏讀）')

    fs.rmSync(fdLog2, { recursive: true, force: true })

    console.log('=== testGranularityAdaptiveIntegration PASS ===')
}


async function main() {

    writeSyntheticLogs()

    //=== 'hr' 粒度 ===
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

    //雜訊與過期排除驗證：全部 bucket count 總和 = 7（本小時6 + 前一小時1；無 event/壞行/30天前 皆排除）
    let total = rs.reduce((acc, v) => acc + v.data.count, 0)
    assert.strictEqual(total, 7, '有效事件總和應為 7（無 event/壞行/超期 均不計）')

    //時間遞增排序
    let times = rs.map((v) => v.time)
    let sorted = [...times].sort()
    assert.deepStrictEqual(times, sorted, '結果應依時間遞增排序')

    //=== 'day' 粒度 ===（同日事件聚到同一天）
    let rsDay = await staEvent(7, 'day', { fdLog })
    let totalDay = rsDay.reduce((acc, v) => acc + v.data.count, 0)
    assert.strictEqual(totalDay, 7, 'day 粒度有效事件總和亦應為 7')
    let keyDayNow = tNow.format('YYYY-MM-DD')
    let bDay = findBucket(rsDay, keyDayNow)
    assert.ok(bDay, `應有本日 bucket ${keyDayNow}`)
    //本日至少含本小時 6 筆（前一小時若跨日則在另一桶，故用 >=）
    assert.ok(bDay.data['verifyConn'] >= 3, '本日 verifyConn 應 >= 3')

    //清理
    fs.rmSync(fdLog, { recursive: true, force: true })

    //=== 粒度自適應防線（P-2）===
    testFilterVpfsByWindowDirect()
    await testGranularityAdaptiveIntegration()

    console.log('=== test_staEvent PASS ===')
    console.log(`hr buckets: ${rs.length}, 本小時=${JSON.stringify(bNow.data)}, 前一小時=${JSON.stringify(bPrev.data)}`)
}


main().catch((err) => {
    console.error('=== test_staEvent FAIL ===')
    console.error(err)
    try { fs.rmSync(fdLog, { recursive: true, force: true }) } catch (e) {}
    process.exit(1)
})
