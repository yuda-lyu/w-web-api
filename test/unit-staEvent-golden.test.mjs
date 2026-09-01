//staLogsCore (staEvent) golden / 快取 / 併發 / 失敗路徑 單元測試 (鏡像 w-web-sso test/unit-staLogs-golden.test.mjs)
//  fixture: test/staLogs-golden/logs/ (173 檔; 已凍結為資產——原確定性產生器曾落在 ./tmp/ 而隨清除佚失, 擴充時另寫新檔加入 logs/)
//  expected: test/staLogs-golden/expected.json —— 以「改造前」實作 (test/staLogs-golden/legacy/staEvent.mjs, git 38cd93e 原碼留存) 在假時鐘
//            FIXED=1788150896789 (2026-08-31 12:34:56.789 +08:00) 下產出, 為本測試之真理來源 (2026-09-01 以此重產, md5 與原檔一致)
//  重產方式: node --import ./test/staLogs-golden/fakeDate.mjs test/staLogs-golden/gen-expected.mjs expected
import './staLogs-golden/setTz.mjs'
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ot from 'dayjs'
import staEvent from '../server/staLogs/staEvent.mjs'
import { staLogs, scanFiles, genPlan, clearCache, getCacheSize } from '../server/staLogs/staLogsCore.mjs'
import { runWorker, staLogs as staLogsWk } from '../server/staLogs/staLogsCore.callWorker.mjs'
import srLogInit from '../server/srLog.mjs'


let __dirname = path.dirname(fileURLToPath(import.meta.url))
let fdGolden = path.resolve(__dirname, 'staLogs-golden')
let fdLog = path.join(fdGolden, 'logs')
//測試中介資料一律落 test/_tmp/（gitignore、after() 清除），不落 ./tmp/：後者為 AI 代理暫存區隨時會被整個清除（三專案統一目錄名）
let fdCopy = path.resolve(__dirname, '_tmp', 'golden-copy')
let fdTmp = path.resolve(__dirname, '_tmp', 'golden-tmp')

let FIXED = 1788150896789

let expected = JSON.parse(fs.readFileSync(path.join(fdGolden, 'expected.json'), 'utf8'))

function sumKey(rs, key) {
    return rs.reduce((a, r) => a + (r.data[key] || 0), 0)
}

function copyDir(src, dst) {
    fs.rmSync(dst, { recursive: true, force: true })
    fs.mkdirSync(dst, { recursive: true })
    for (let fn of fs.readdirSync(src)) {
        fs.copyFileSync(path.join(src, fn), path.join(dst, fn))
    }
}

function makeSpy() {
    let calls = []
    let fn = async (files, tStartMs, fmt) => {
        calls.push(files.map((f) => f.name))
        return scanFiles(files, tStartMs, fmt)
    }
    return { calls, fn }
}


describe('unit-staEvent-golden', function() {
    this.timeout(300000)

    before(function() {
        assert.strict.equal(new Date().getTimezoneOffset(), -480, '本測試需於 Asia/Taipei 時區執行 (setTz.mjs 已設 TZ)')
        clearCache()
    })

    after(function() {
        fs.rmSync(fdCopy, { recursive: true, force: true })
        fs.rmSync(fdTmp, { recursive: true, force: true })
        //測完即刪：test/_tmp/ 本身若已空也移除（其他測試可能同時使用，非空則留）
        try {
            let d = path.dirname(fdTmp)
            if (fs.existsSync(d) && fs.readdirSync(d).length === 0) {
                fs.rmdirSync(d)
            }
        }
        catch (err) { /* ignore */ }
        clearCache()
    })


    //GOLD-001: staEvent (worker 路徑, 即 WWebApi 實際使用路徑) hr / day 與舊實作 expected 深比較
    it('GOLD-001-staEvent-hr-day-deep-equal-legacy-expected', async function() {
        clearCache()
        let hr = await staEvent(7, 'hr', { fdLog, timeNow: FIXED })
        let day = await staEvent(7, 'day', { fdLog, timeNow: FIXED })
        assert.deepStrictEqual(hr, expected.hr)
        assert.deepStrictEqual(day, expected.day)
        assert.strict.equal(sumKey(hr, 'boundary-plus1'), 1)
        assert.strict.equal(sumKey(hr, 'boundary-eq'), 0)
        assert.strict.equal(sumKey(hr, 'iso-string-time'), 1)
        assert.strict.equal(sumKey(hr, 'garbage-time'), 0)
        assert.strict.equal(sumKey(hr, 'future-1d'), 1)
        //第二次 (只重掃邊界檔) 亦一致
        let hr2 = await staEvent(7, 'hr', { fdLog, timeNow: FIXED })
        assert.deepStrictEqual(hr2, expected.hr)
    })


    //GOLD-002: 無 time 之行不計入 (刻意差異); timeInterval 非法值視同 hr
    it('GOLD-002-line-without-time-and-invalid-timeInterval', async function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdTmp, { recursive: true })
        let t = ot(FIXED).subtract(3, 'hour')
        let lines = [
            JSON.stringify({ level: 30, event: 'no-time' }),
            JSON.stringify({ level: 30, time: t.valueOf(), event: 'has-time' }),
        ]
        fs.writeFileSync(path.join(fdTmp, ot(FIXED).format('YYYY-MM-DDTHH') + '.log'), lines.join('\n') + '\n')
        let rs = await staEvent(7, 'hr', { fdLog: fdTmp, timeNow: FIXED })
        assert.strict.equal(sumKey(rs, 'no-time'), 0)
        assert.strict.equal(sumKey(rs, 'has-time'), 1)
        let plan = genPlan(7, 'xx', { fdLog, timeNow: FIXED })
        assert.strict.equal(plan.fmt, 'YYYY-MM-DDTHH')
        let rs2 = await staEvent(7, 'xx', { fdLog, timeNow: FIXED })
        assert.deepStrictEqual(rs2, expected.hr)
    })


    //GOLD-010: 第二次只重掃邊界檔; hr/day 快取分開; 併發共用同一 promise
    it('GOLD-010-cache-and-single-flight', async function() {
        clearCache()
        let spy = makeSpy()
        let opt = { fdLog, timeNow: FIXED, scanFiles: spy.fn }
        let p1 = staLogs(7, 'hr', opt)
        let p2 = staLogs(7, 'hr', opt)
        assert.strict.equal(p1, p2, '併發呼叫應回同一 promise')
        let [r1] = await Promise.all([p1, p2])
        let r2 = await staLogs(7, 'hr', opt)
        assert.strict.equal(spy.calls.length, 2)
        assert.strict.equal(spy.calls[0].length, r1.stat.nFiles)
        assert.strict.equal(r1.stat.nFiles, 171)
        assert.deepStrictEqual(spy.calls[1], ['2026-08-24T12.log'])
        assert.deepStrictEqual(r2.rs, expected.hr)
        let d = await staEvent(7, 'day', opt)
        assert.deepStrictEqual(d, expected.day)
        assert.strict.equal(getCacheSize(fdLog, 'hr'), 171)
        assert.strict.equal(getCacheSize(fdLog, 'day'), 173)
    })


    //GOLD-011: 封閉檔補寫 → 重掃; 窗前進 → 只重掃新邊界檔且快取路徑 = 無快取全掃; 刪檔 → 淘汰
    it('GOLD-011-modified-window-advance-deleted', async function() {
        copyDir(fdLog, fdCopy)
        clearCache()
        let spy = makeSpy()
        let opt = { fdLog: fdCopy, timeNow: FIXED, scanFiles: spy.fn }
        let r1 = await staLogs(7, 'hr', opt)
        fs.appendFileSync(path.join(fdCopy, '2026-08-27T03.log'), JSON.stringify({ level: 30, time: ot('2026-08-27T03:30:00').valueOf(), event: 'appended' }) + '\n')
        let r2 = await staLogs(7, 'hr', opt)
        assert.ok(spy.calls[1].includes('2026-08-27T03.log'))
        assert.strict.equal(sumKey(r2.rs, 'appended'), 1)
        assert.strict.equal(sumKey(r2.rs, 'count'), sumKey(r1.rs, 'count') + 1)

        let now2 = FIXED + 2 * 3600000
        let rCached = await staLogs(7, 'hr', { fdLog: fdCopy, timeNow: now2, scanFiles: spy.fn })
        let rFresh = await staLogs(7, 'hr', { fdLog: fdCopy, timeNow: now2, useCache: false })
        assert.deepStrictEqual(spy.calls[2], ['2026-08-24T14.log'])
        assert.deepStrictEqual(rCached.rs, rFresh.rs)

        let n1 = getCacheSize(fdCopy, 'hr')
        fs.rmSync(path.join(fdCopy, '2026-08-25T00.log'))
        let r3 = await staLogs(7, 'hr', { fdLog: fdCopy, timeNow: now2 })
        let r3f = await staLogs(7, 'hr', { fdLog: fdCopy, timeNow: now2, useCache: false })
        assert.strict.equal(getCacheSize(fdCopy, 'hr'), n1 - 1)
        assert.deepStrictEqual(r3.rs, r3f.rs)
    })


    //GOLD-020: 子資料夾略過; 單檔錯誤略過不整體失敗、srLog.warn、不入快取
    it('GOLD-020-subfolder-and-single-file-error', async function() {
        copyDir(fdLog, fdCopy)
        fs.mkdirSync(path.join(fdCopy, 'sub'))
        fs.writeFileSync(path.join(fdCopy, 'sub', '2026-08-28T01.log'), JSON.stringify({ level: 30, time: ot('2026-08-28T01:10:00').valueOf(), event: 'in-sub' }) + '\n')
        clearCache()
        let rs = await staEvent(7, 'hr', { fdLog: fdCopy, timeNow: FIXED })
        assert.deepStrictEqual(rs, expected.hr)

        let warns = []
        let srLog = { warn: (o) => warns.push(o) }
        let badName = '2026-08-25T00.log'
        let scanFilesBad = async (files, tStartMs, fmt) => {
            let fs2 = files.map((f) => (f.name === badName ? { ...f, path: path.join(fdCopy, 'not-exist.log') } : f))
            return scanFiles(fs2, tStartMs, fmt)
        }
        clearCache()
        let r = await staLogs(7, 'hr', { fdLog: fdCopy, timeNow: FIXED, scanFiles: scanFilesBad, srLog })
        assert.strict.equal(r.stat.errors.length, 1)
        assert.strict.equal(warns[0].key, 'staLogsFileSkipped')
        assert.strict.equal(r.rs.length, expected.hr.length)
        assert.strict.equal(getCacheSize(fdCopy, 'hr'), 170)
    })


    //SRLOG-001: logNumKeep opt-in
    it('SRLOG-001-logNumKeep-opt-in', async function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdTmp, { recursive: true })
        assert.throws(() => srLogInit({ logFd: fdTmp, logInterval: 'hr', logNumKeep: 'abc' }), /logNumKeep/)
        for (let fn of ['2000-01-01T00.log', '2000-01-01T01.log', '2000-01-01T02.log', '2000-01-01T03.log']) {
            fs.writeFileSync(path.join(fdTmp, fn), '')
        }
        let srLog = srLogInit({ logFd: fdTmp, logInterval: 'hr', logNumKeep: 2 })
        srLog.cleanLogs()
        let left = fs.readdirSync(fdTmp).filter((fn) => fn.startsWith('2000-01-01T'))
        assert.deepStrictEqual(left.sort(), ['2000-01-01T02.log', '2000-01-01T03.log'])
        await srLog.clear()
        let srLog2 = srLogInit({ logFd: fdTmp, logInterval: 'hr' })
        await srLog2.clear()
    })


    //GOLD-030: 檔級快取跨 timeLength: 先以較小 timeLength 查詢 (窄窗, 檔內有行被窗過濾), 再以較大 timeLength 查詢, 結果須與清快取後直接查詢全等
    //  述語對應 ADR-028 修正紀錄 P1: 沿用須同時滿足「彙總完整 (minTimeMs > scanTStartMs)」與「整檔在新窗內」
    it('GOLD-030-cache-not-reused-when-timeLength-widens', async function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdTmp, { recursive: true })
        //同一檔 (非 ISO 檔名, 不被檔名層窗過濾) 內含 20 天前 5 筆 oldEvent 與 2 天前 3 筆 newEvent
        let lines = []
        for (let i = 0; i < 5; i++) {
            lines.push(JSON.stringify({ level: 30, time: ot(FIXED).subtract(20, 'day').valueOf() + i * 1000, event: 'oldEvent' }))
        }
        for (let i = 0; i < 3; i++) {
            lines.push(JSON.stringify({ level: 30, time: ot(FIXED).subtract(2, 'day').valueOf() + i * 1000, event: 'newEvent' }))
        }
        fs.writeFileSync(path.join(fdTmp, 'mixed.log'), lines.join('\n') + '\n')
        clearCache()
        let r7 = await staLogs(7, 'hr', { fdLog: fdTmp, timeNow: FIXED })
        assert.strict.equal(sumKey(r7.rs, 'oldEvent'), 0)
        assert.strict.equal(sumKey(r7.rs, 'newEvent'), 3)
        assert.strict.equal(r7.stat.nScanned, 1)
        //窗變寬: 該檔 minTimeMs (20 天前) > 30 天窗起點, 但掃描時曾被 7 天窗過濾 → 不得沿用, 須重掃
        let r30 = await staLogs(30, 'hr', { fdLog: fdTmp, timeNow: FIXED })
        let r30f = await staLogs(30, 'hr', { fdLog: fdTmp, timeNow: FIXED, useCache: false })
        assert.strict.equal(r30.stat.nScanned, 1, '窗變寬時不得沿用窄窗彙總')
        assert.strict.equal(sumKey(r30.rs, 'oldEvent'), 5)
        assert.strict.equal(sumKey(r30.rs, 'newEvent'), 3)
        assert.deepStrictEqual(r30.rs, r30f.rs)
        //窗變寬後彙總完整 (掃描時無行被過濾) → 同窗可沿用; 再變窄時該檔含窗外行 (整檔不在新窗內) → 仍須重掃, 結果與首次窄窗查詢全等
        let r30b = await staLogs(30, 'hr', { fdLog: fdTmp, timeNow: FIXED })
        assert.strict.equal(r30b.stat.nCached, 1)
        assert.deepStrictEqual(r30b.rs, r30f.rs)
        let r7b = await staLogs(7, 'hr', { fdLog: fdTmp, timeNow: FIXED })
        assert.strict.equal(r7b.stat.nScanned, 1, '窗變窄且檔含窗外行時不得沿用寬窗彙總')
        assert.deepStrictEqual(r7b.rs, r7.rs)
    })


    //WORKER-002: worker 未回傳訊息即退出 → promise 須 reject (非 pending), 且同 key 之後續呼叫可正常重試
    //  述語對應 ADR-028 修正紀錄 P2
    it('WORKER-002-worker-exit-without-message-rejects-and-retry-ok', async function() {
        let fpExit = path.join(fdGolden, 'exitWorker.mjs')
        let settled = false
        let pm = runWorker({ files: [], tStartMs: 0, fmt: 'YYYY-MM-DDTHH' }, fpExit)
            .then(() => {
                settled = 'resolved'
            }, (err) => {
                settled = String(err.message)
            })
        await Promise.race([pm, new Promise((resolve) => setTimeout(resolve, 3000))])
        assert.ok(settled && settled !== 'resolved', `worker exit 後 promise 須 reject, 實際: ${settled}`)
        assert.match(settled, /exited without result, code=0/)
        //single-flight 釋放: 以 worker 路徑 (正常 shellWorker) 之同參數呼叫可正常取得結果
        clearCache()
        let scanFilesExit = () => runWorker({ files: [], tStartMs: 0, fmt: 'YYYY-MM-DDTHH' }, fpExit)
        let bad = await staLogs(7, 'hr', { fdLog, timeNow: FIXED, scanFiles: scanFilesExit }).then(() => 'resolved', (err) => String(err.message))
        assert.match(bad, /exited without result/)
        let ok = await staLogsWk(7, 'hr', { fdLog, timeNow: FIXED })
        assert.deepStrictEqual(ok.rs, expected.hr, '同 key 於 reject 後重試須正常')
    })

})
