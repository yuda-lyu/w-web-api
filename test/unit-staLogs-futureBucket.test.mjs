//unit: 統計之輸出以「現在」所屬桶為上界, 不含晚於它之未來時間桶 (R-STA-FUTURE-01; ADR-058; Gitea #58)
//spec 對應: spec/流程_統計資訊.md〈getStaEvent 輸出契約〉FB-1~FB-5
//  FB-1 晚於現在所屬桶之資料桶不輸出 (hr / day 皆然; 以其所屬桶標籤判定, 不以紀錄時間是否晚於 timeNow 判定)
//  FB-2 現在所屬桶內晚於 timeNow 之紀錄照計 (統計執行期間新寫入者不被丟棄); 桶邊界: 本桶最後 1 ms 計入、下一桶第 1 ms 不輸出
//  FB-3 過濾只在輸出層: 掃描與檔級快取不依 timeNow 上界, 快取開啟時 timeNow 後移至該紀錄之後, 該桶須出現 (反向亦然)
//  FB-4 輸出最末一列恆為現在所屬桶 (無資料時為 { count: 0 }); 窗內缺桶補零不變
//  FB-5 無未來紀錄之合法輸入, 輸出與修前相同 (以不依賴桶標籤字串比較之獨立 oracle 驗: 依時間值判定)
//與 unit-staEvent-golden 分工: golden 以 173 檔 fixture 深比較改造前輸出 (expected 已依本規則剔除未來桶, 見其檔頭), 本檔守未來桶規則之各邊界與快取互動.
//被測模組: 預設 server/staLogs/staLogsCore.mjs; 環境變數 STALOGS_CORE_MODULE 可指向另一份副本 (「修前紅」對 HEAD 版、變異測試對變異副本重跑同一檔; 副本放 ./tmp/, 且須連同同夾之 filterVpfsByWindow.mjs)
import './staLogs-golden/setTz.mjs'
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import ot from 'dayjs'


let __dirname = path.dirname(fileURLToPath(import.meta.url))
let fdTmpRoot = path.join(__dirname, '_tmp') //測試中介資料一律落 test/_tmp/ (測完即刪), 不落 ./tmp/
let fdRoot = path.join(fdTmpRoot, '_logs-unit-staLogs-futureBucket')

let urlCore = process.env.STALOGS_CORE_MODULE ? pathToFileURL(path.resolve(process.env.STALOGS_CORE_MODULE)).href : new URL('../server/staLogs/staLogsCore.mjs', import.meta.url).href
let core = await import(urlCore)
let { staLogs, buildOutput, clearCache } = core
let staEventWorker = (await import(new URL('./staLogsCore.callWorker.mjs', urlCore).href)).staLogs //與被測 core 同夾之 worker 版入口 (override 時亦取副本之同夾檔)

let HOUR = 3600 * 1000
let DAY = 24 * HOUR
let ANCHOR = Date.parse('2026-01-02T12:00:00.000+08:00') //timeNow: 現在所屬 hr 桶 '2026-01-02T12'、day 桶 '2026-01-02'
let LABEL_NOW = { hr: '2026-01-02T12', day: '2026-01-02' }
let FMT = { hr: 'YYYY-MM-DDTHH', day: 'YYYY-MM-DD' }
let UNIT = { hr: 'hour', day: 'day' }

let seq = 0


function line(t, event) {
    return JSON.stringify({ level: 30, time: t, pid: 1, hostname: 'test', event })
}

//建一個全新之 log 夾; files: { 檔名: [ [time, event], ... ] }
function mkDir(files) {
    seq += 1
    let fd = path.join(fdRoot, `c${seq}`)
    fs.rmSync(fd, { recursive: true, force: true })
    fs.mkdirSync(fd, { recursive: true })
    for (let fn in files) {
        fs.writeFileSync(path.join(fd, fn), files[fn].map(([t, e]) => line(t, e)).join('\n') + '\n', 'utf8')
    }
    return fd
}

//窗內 3 筆 (2 小時前, evIn) + 現在所屬桶 1 筆 (正為 timeNow, evNow)
function baseFiles() {
    return {
        '2026-01-02T10.log': [[ANCHOR - 2 * HOUR, 'evIn'], [ANCHOR - 2 * HOUR + 1000, 'evIn'], [ANCHOR - 2 * HOUR + 2000, 'evIn']],
        '2026-01-02T12.log': [[ANCHOR, 'evNow']],
    }
}

async function run(fd, ti, opt = {}) {
    let r = await staLogs(7, ti, { fdLog: fd, timeNow: ANCHOR, useCache: false, ...opt })
    return r.rs
}

function bucket(rs, time) {
    return rs.find((v) => v.time === time)
}

function sumEv(rs, ev) {
    return rs.reduce((a, r) => a + (r.data[ev] || 0), 0)
}

//獨立 oracle: 依「時間值」判定 (紀錄時間 > 窗起點, 且 <= 現在所屬桶之結束時刻), 不用桶標籤字串比較; 補零之窗內桶依時間迭代
function oracle(records, timeLength, ti, timeNow) {
    let fmt = FMT[ti]
    let unit = UNIT[ti]
    let tStart = ot(timeNow).subtract(timeLength, 'day')
    let tEndMs = ot(timeNow).endOf(unit).valueOf()
    let kp = {}
    for (let t = tStart.startOf(unit), tEnd = ot(timeNow).startOf(unit); !t.isAfter(tEnd); t = t.add(1, unit)) {
        kp[t.format(fmt)] = { count: 0 }
    }
    for (let [t, e] of records) {
        if (!(t > tStart.valueOf()) || t > tEndMs) {
            continue
        }
        let b = kp[ot(t).format(fmt)]
        b.count += 1
        b[e] = (b[e] || 0) + 1
    }
    return Object.keys(kp).sort().map((time) => ({ time, data: kp[time] }))
}

//確定性 PRNG (mulberry32)
function mkRand(seed) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}


describe('unit-staLogs-futureBucket (輸出之桶以現在所屬桶為上界, R-STA-FUTURE-01)', function() {
    this.timeout(120000)

    before(function() {
        assert.strict.equal(new Date().getTimezoneOffset(), -480, '本測試需於 Asia/Taipei 時區執行 (setTz.mjs 已設 TZ)')
        fs.rmSync(fdRoot, { recursive: true, force: true })
        fs.mkdirSync(fdRoot, { recursive: true })
        clearCache()
    })

    beforeEach(function() {
        clearCache()
    })

    after(function() {
        fs.rmSync(fdRoot, { recursive: true, force: true })
        try {
            if (fs.existsSync(fdTmpRoot) && fs.readdirSync(fdTmpRoot).length === 0) {
                fs.rmdirSync(fdTmpRoot)
            }
        }
        catch (err) { /* ignore */ }
        clearCache()
    })


    //FB-1: 窗內紀錄 + 300 天後之紀錄 (檔名亦為未來時段), 輸出須與無該紀錄時相同 [issue #58 §2.1]
    for (let ti of ['hr', 'day']) {
        it(`FB-1-${ti}: 300 天後之紀錄不產生桶, 輸出與無該紀錄時相同`, async function() {
            let files = baseFiles()
            let r0 = await run(mkDir(files), ti)
            let tF = ANCHOR + 300 * DAY
            files['2026-10-29T12.log'] = [[tF, 'evFuture'], [tF + 1000, 'evFuture']]
            let r1 = await run(mkDir(files), ti)
            assert.deepStrictEqual(r1, r0)
            assert.strict.equal(sumEv(r1, 'evFuture'), 0)
            assert.strict.equal(bucket(r1, ot(tF).format(FMT[ti])), undefined, '未來桶標籤不得出現')
        })
    }

    //FB-1: 未來紀錄位於「現在所屬時段之 log 檔」或「非 ISO 檔名之檔」內亦不輸出 (過濾依桶標籤, 與檔名層之窗過濾無關)
    for (let ti of ['hr', 'day']) {
        for (let fn of ['2026-01-02T12.log', 'misc.log']) {
            it(`FB-1-${ti}-in-file-${fn}: 同檔內之未來紀錄 (+3 天) 不輸出`, async function() {
                let files = baseFiles()
                let r0 = await run(mkDir(files), ti)
                files[fn] = (files[fn] || []).concat([[ANCHOR + 3 * DAY, 'evFuture']])
                let r1 = await run(mkDir(files), ti)
                assert.deepStrictEqual(r1, r0)
            })
        }
    }

    //FB-1 / FB-2: 以現在所屬桶之「標籤」為界, 同一筆紀錄於 hr 與 day 之歸屬不同
    //  +1 小時 (13:00): hr 為未來桶 → 不輸出; day 仍屬現在所屬日桶 → 計入
    //  +13 小時 (隔日 01:00): hr、day 皆為未來桶 → 不輸出
    it('FB-1-boundary: 現在 +1 小時之紀錄: hr 不輸出、day 計入現在所屬日桶', async function() {
        let files = baseFiles()
        files['2026-01-02T13.log'] = [[ANCHOR + HOUR, 'evPlus1h']]
        let fd = mkDir(files)
        let hr = await run(fd, 'hr')
        let day = await run(fd, 'day')
        assert.strict.equal(sumEv(hr, 'evPlus1h'), 0)
        assert.strict.equal(bucket(hr, '2026-01-02T13'), undefined)
        assert.strict.equal(hr[hr.length - 1].time, LABEL_NOW.hr)
        assert.strict.equal(bucket(day, LABEL_NOW.day).data.evPlus1h, 1)
        assert.strict.equal(bucket(day, LABEL_NOW.day).data.count, 5) //evIn 3 + evNow 1 + evPlus1h 1
    })
    it('FB-1-boundary: 現在 +13 小時 (隔日) 之紀錄: hr、day 皆不輸出', async function() {
        let files = baseFiles()
        files['2026-01-03T01.log'] = [[ANCHOR + 13 * HOUR, 'evNextDay']]
        let fd = mkDir(files)
        let hr = await run(fd, 'hr')
        let day = await run(fd, 'day')
        assert.strict.equal(sumEv(hr, 'evNextDay'), 0)
        assert.strict.equal(sumEv(day, 'evNextDay'), 0)
        assert.strict.equal(bucket(day, '2026-01-03'), undefined)
    })

    //FB-2: 現在所屬桶內略晚於 timeNow 之紀錄仍計入 [issue #58 §2.2]; hr 與 day 皆然
    it('FB-2-hr: 同屬現在所屬桶而略晚於現在之紀錄 (+1 分鐘) 仍計入, 且為最末桶', async function() {
        let files = baseFiles()
        files['2026-01-02T12.log'].push([ANCHOR + 60 * 1000, 'evLater'])
        let r = await run(mkDir(files), 'hr')
        let last = r[r.length - 1]
        assert.strict.equal(last.time, LABEL_NOW.hr)
        assert.strict.equal(last.data.count, 2)
        assert.strict.equal(last.data.evLater, 1)
        assert.strict.equal(bucket(r, '2026-01-02T10').data.count, 3)
    })
    it('FB-2-day: 同屬現在所屬日桶而晚於現在之紀錄 (+8 小時 59 分) 仍計入, 且為最末桶', async function() {
        let files = baseFiles()
        files['2026-01-02T20.log'] = [[ANCHOR + 8 * HOUR + 59 * 60 * 1000, 'evLater']]
        let r = await run(mkDir(files), 'day')
        let last = r[r.length - 1]
        assert.strict.equal(last.time, LABEL_NOW.day)
        assert.strict.equal(last.data.evLater, 1)
        assert.strict.equal(last.data.count, 5)
    })

    //FB-2: 桶邊界 (hr): 本桶最後 1 ms 計入; 下一桶第 1 ms 不輸出
    it('FB-2-edge: hr 桶邊界——12:59:59.999 計入現在所屬桶, 13:00:00.000 屬未來桶不輸出', async function() {
        let files = baseFiles()
        files['2026-01-02T12.log'].push([ANCHOR + HOUR - 1, 'evLastMs'])
        files['2026-01-02T13.log'] = [[ANCHOR + HOUR, 'evNextBucketFirstMs']]
        let r = await run(mkDir(files), 'hr')
        assert.strict.equal(bucket(r, LABEL_NOW.hr).data.evLastMs, 1)
        assert.strict.equal(sumEv(r, 'evNextBucketFirstMs'), 0)
        assert.strict.equal(r[r.length - 1].time, LABEL_NOW.hr)
    })

    //FB-4: 只有未來紀錄時, 最末一列仍為現在所屬桶且為補零之 { count: 0 }; 窗內桶數不變 (hr 169 桶 / day 8 桶)
    for (let ti of ['hr', 'day']) {
        it(`FB-4-${ti}: 只有未來紀錄時最末列為現在所屬桶之 { count: 0 }, 窗內桶全數補零`, async function() {
            let fd = mkDir({ '2026-01-05T00.log': [[ANCHOR + 3 * DAY, 'evFuture']] })
            let r = await run(fd, ti)
            assert.strict.equal(r.length, ti === 'hr' ? 169 : 8)
            assert.deepStrictEqual(r[r.length - 1], { time: LABEL_NOW[ti], data: { count: 0 } })
            assert.ok(r.every((v) => v.data.count === 0))
            assert.deepStrictEqual(r.map((v) => v.time), r.map((v) => v.time).sort(), '時間遞增')
        })
    }

    //FB-1: 荒謬之未來時間 (年份 ≥ 10000 之標籤長於窗標籤、超出 Date 範圍之標籤為 'Invalid Date') 亦不輸出
    for (let [name, t] of [['year-10000', 253402300800000], ['max-date', 8.64e15], ['beyond-max-date', 8.64e15 + 60000]]) {
        for (let ti of ['hr', 'day']) {
            it(`FB-1-absurd-${name}-${ti}: 時間 ${t} 之紀錄不輸出`, async function() {
                let files = baseFiles()
                let r0 = await run(mkDir(files), ti)
                files['misc.log'] = [[t, 'evAbsurd']]
                let r1 = await run(mkDir(files), ti)
                assert.deepStrictEqual(r1, r0)
            })
        }
    }

    //FB-3: 快取開啟時, timeNow 移到未來紀錄之後, 該桶須出現 (未因先前查詢而遺失) [issue #58 §2.3]; 反向亦然
    for (let ti of ['hr', 'day']) {
        it(`FB-3-${ti}: 快取開啟——先以較早 timeNow 查 (不輸出), 再把 timeNow 移到紀錄之後 (輸出該桶, 且確由快取沿用)`, async function() {
            let tF = ANCHOR + 3 * DAY
            let files = baseFiles()
            files['2026-01-05T12.log'] = [[tF, 'evFuture'], [tF + 1000, 'evFuture']]
            let fd = mkDir(files)
            let q = (timeNow) => staLogs(7, ti, { fdLog: fd, timeNow }) //useCache 預設開
            let a = await q(ANCHOR)
            assert.strict.equal(sumEv(a.rs, 'evFuture'), 0, '較早之 timeNow: 未來桶不輸出')
            assert.ok(a.stat.nScanned >= 1)
            let tLater = tF + 2 * HOUR
            let b = await q(tLater)
            assert.strict.equal(b.stat.nCached >= 1, true, '第二次查詢須沿用快取 (確實走快取路徑)')
            assert.strict.equal(sumEv(b.rs, 'evFuture'), 2, '較晚之 timeNow: 該桶須出現')
            assert.strict.equal(bucket(b.rs, ot(tF).format(FMT[ti])).data.evFuture, 2)
            //與清快取後直接查之結果全等
            let bf = await staLogs(7, ti, { fdLog: fd, timeNow: tLater, useCache: false })
            assert.deepStrictEqual(b.rs, bf.rs)
            //反向: timeNow 退回較早時, 該桶又不輸出 (快取內之彙總未被改動)
            let c = await q(ANCHOR)
            assert.deepStrictEqual(c.rs, a.rs)
        })
    }

    //FB-3: 同一 timeNow 連查 (快取) 與無快取結果相同, 且不含未來桶
    it('FB-3-same-timeNow: 快取沿用時之輸出與無快取相同, 不含未來桶', async function() {
        let files = baseFiles()
        files['2026-10-29T12.log'] = [[ANCHOR + 300 * DAY, 'evFuture']]
        let fd = mkDir(files)
        let a = await staLogs(7, 'hr', { fdLog: fd, timeNow: ANCHOR })
        let b = await staLogs(7, 'hr', { fdLog: fd, timeNow: ANCHOR })
        let f = await staLogs(7, 'hr', { fdLog: fd, timeNow: ANCHOR, useCache: false })
        assert.ok(b.stat.nCached >= 1)
        assert.deepStrictEqual(b.rs, a.rs)
        assert.deepStrictEqual(b.rs, f.rs)
        assert.strict.equal(sumEv(b.rs, 'evFuture'), 0)
    })

    //FB-1: 實際使用路徑 (worker 掃描, 輸出於主執行緒) 同樣不輸出未來桶
    it('FB-1-worker: worker 版 staLogs (WWebApi 實際使用路徑) 不輸出未來桶', async function() {
        let files = baseFiles()
        let r0 = (await staEventWorker(7, 'hr', { fdLog: mkDir(files), timeNow: ANCHOR, useCache: false })).rs
        files['2026-10-29T12.log'] = [[ANCHOR + 300 * DAY, 'evFuture']]
        let r1 = (await staEventWorker(7, 'hr', { fdLog: mkDir(files), timeNow: ANCHOR, useCache: false })).rs
        assert.deepStrictEqual(r1, r0)
        assert.strict.equal(r1[r1.length - 1].time, LABEL_NOW.hr)
    })

    //FB-5: 合法輸入 (無未來紀錄) 之輸出等於獨立 oracle; 混入未來紀錄後亦等於 oracle (依時間值判定上界)
    //  同一批紀錄放入單一非 ISO 檔名之檔 (不經檔名層過濾); 400 筆, 時間均勻分布於 timeNow 前 9 天 ~ 後 20 天, 4 種事件
    for (let seed of [1, 7, 20261103]) {
        for (let ti of ['hr', 'day']) {
            for (let timeLength of [0, 1, 7]) {
                it(`FB-5-oracle seed=${seed} ${ti} timeLength=${timeLength}: 輸出等於獨立 oracle (窗內補零 + 計數; 晚於現在所屬桶者不輸出)`, async function() {
                    let rand = mkRand(seed)
                    let evs = ['evA', 'evB', 'evC', 'evD']
                    let records = []
                    for (let i = 0; i < 400; i++) {
                        let t = ANCHOR - 9 * DAY + Math.floor(rand() * 29 * DAY)
                        records.push([t, evs[Math.floor(rand() * 4)]])
                    }
                    let fd = mkDir({ 'rand.log': records })
                    let r = (await staLogs(timeLength, ti, { fdLog: fd, timeNow: ANCHOR, useCache: false })).rs
                    assert.deepStrictEqual(r, oracle(records, timeLength, ti, ANCHOR))
                    //無未來紀錄之合法輸入 (只留 <= timeNow 者): 修前修後相同, 亦等於 oracle
                    let past = records.filter(([t]) => t <= ANCHOR)
                    let fd2 = mkDir({ 'rand.log': past })
                    let r2 = (await staLogs(timeLength, ti, { fdLog: fd2, timeNow: ANCHOR, useCache: false })).rs
                    assert.deepStrictEqual(r2, oracle(past, timeLength, ti, ANCHOR))
                })
            }
        }
    }

    //buildOutput 直測 (exported): 上界取 kpTime 最末桶; kpTime 為空時不設上界 (與修前相同; genPlan 不會產生空 kpTime)
    it('FB-1-buildOutput: 資料桶晚於 kpTime 最末桶者不輸出, 等於或早於者保留; 空 kpTime 不設上界', function() {
        let merged = {
            '2026-01-02T10': { count: 2, kp: { a: 2 } },
            '2026-01-02T12': { count: 1, kp: { a: 1 } },
            '2026-01-02T13': { count: 5, kp: { b: 5 } },
            '2026-10-29T12': { count: 1, kp: { c: 1 } },
        }
        let kpTime = ['2026-01-02T10', '2026-01-02T11', '2026-01-02T12']
        assert.deepStrictEqual(buildOutput(merged, kpTime), [
            { time: '2026-01-02T10', data: { count: 2, a: 2 } },
            { time: '2026-01-02T11', data: { count: 0 } },
            { time: '2026-01-02T12', data: { count: 1, a: 1 } },
        ])
        assert.deepStrictEqual(buildOutput(merged, []).map((v) => v.time), ['2026-01-02T10', '2026-01-02T12', '2026-01-02T13', '2026-10-29T12'])
        assert.deepStrictEqual(buildOutput({}, kpTime).map((v) => v.data.count), [0, 0, 0])
    })

})
