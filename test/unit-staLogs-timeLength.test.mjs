//統計(staEvent)之 timeLength 入口檢測(排程第 301 項〔api 側〕; 規格 C:/opensrcOper/dspec/輸入參數之檢測機制.md: timeLength 為必須參數, 個數類 N2 非負整數 0～3650, 數字字串收下並以轉換值為準 K4／K7,
//  無效 reject 固定鍵不回顯 K9; 與 w-web-perm、w-web-sso 之同名核心同一判準)
//
//TL-001 判準函數 parseTimeLength 之有效／無效全表(進行程序內; 無效之輸入不會進迴圈)
//TL-002 無效 timeLength × 各層入口(genPlan、staLogs、staLogs〔worker 版〕、staEvent): 一律被拒且為固定鍵 errTimeLengthInvalid(genPlan 為同步 throw Error, 其餘為 reject 字串)
//TL-003 有效 timeLength × 各層入口: 照常產出(桶數 = 天數 × 24 + 1); 數字字串收下並以轉換值為準(修前 '7'、' 7 '、'1e1'、'+7' 被拒)
//TL-004 K4 檢測之值即使用之值: '7' 與 7 共用同一 single-flight(同一 promise); 無效或超範圍之 timeNow 與未給同鍵且不使 staLogs 同步拋錯
//TL-005 opt.timeNow 為 NaN、±Infinity、超出 1970～2100 者視為未給(退回現在), 不再使 kpTime 迴圈成為無窮迴圈(修前 8 種使子行程卡死, 4 種被照單採用)
//TL-006 站點不變式: 凡使用 timeLength 之伺服端檔案為已盤點之全集; 檢測先於 subtract／快取鍵; 伺服端唯一對外入口 getStaEvent 只經 staEvent; 不留第二份檢測(Number.isInteger)
//TL-007 procLang 有 errTimeLengthInvalid 之 eng 與 cht 文字
//
//why 子行程: 修前之 timeNow 為 NaN、±Infinity、1e300、±8.64e15 時 genPlan 之 `while (!tCurr.isAfter(tEnd))` 為同步無窮迴圈, 同行程內 mocha 之逾時計時器亦無法觸發, 故 TL-002／003／005 以 spawnSync 之 timeout 終止(修前紅: 逾時即判該層「卡住」)
//跑法: npx mocha test/unit-staLogs-timeLength.test.mjs --timeout 600000
//修前紅: 將本檔與 test/tools/timeLengthChild.mjs 複製進修前碼之鏡像根(server/、src/ 取自 HEAD)後於該根執行(見 sgud/rule/rulebook_backend.md R-STA-TIMELENGTH-01 之〈修前紅〉)
import './staLogs-golden/setTz.mjs' //釘 Asia/Taipei(無夏令時間): 桶數 = 天數 × 24 + 1 之斷言於有夏令時間之時區會因窗跨 DST 而差 1(子行程繼承 process.env.TZ)
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import ot from 'dayjs'
import { staLogs, parseTimeLength, MAX_TIME_LENGTH_DAY } from '../server/staLogs/staLogsCore.mjs'
import { codeText } from './tools/srcScan.mjs'

const A = assert.strict
const projRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fdTmp = path.join(projRoot, 'test', '_tmp', 'staLogs-timeLength')
const fdLog = path.join(fdTmp, 'emptylogs')
const CHILD = path.join(projRoot, 'test', 'tools', 'timeLengthChild.mjs')
const KEY = 'errTimeLengthInvalid'

//有效候選(名稱同子行程) → 天數
const VALID = {
    'v-0': 0, 'v-negzero': 0, 'v-1': 1, 'v-7': 7, 'v-undef': 7, 'v-str7': 7, 'v-str-spaced': 7, 'v-str-sci': 10, 'v-str-plus': 7, 'v-30': 30, 'v-3650': 3650,
}
//無效候選(名稱同子行程)
const INVALID = [
    'x-NaN', 'x-Infinity', 'x-negInfinity', 'x-neg1', 'x-negHuge', 'x-float1.5', 'x-3651', 'x-100000', 'x-1e20', 'x-1e308',
    'x-strAbc', 'x-strEmpty', 'x-strSpace', 'x-strHex', 'x-strInfinity', 'x-strNaN', 'x-strFloat', 'x-strNeg', 'x-strHuge', 'x-strMarker',
    'x-null', 'x-true', 'x-false', 'x-obj', 'x-objValueOf', 'x-arr', 'x-arr7', 'x-bigint', 'x-symbol', 'x-numberObj', 'x-fn', 'x-revokedProxy', 'x-date',
]
const LAYERS = ['genPlan', 'staLogs', 'staLogsWorker', 'staEvent']


//runCand: 以子行程跑單一候選, 回 { timedOut, status, byLayer: { 層: { kind, v } }, ms }
function runCand(name, timeoutMs = (Number(process.env.TL_CHILD_TIMEOUT_MS) || 15000)) { //TL_CHILD_TIMEOUT_MS: 變異測試縮短卡住之候選的等待(預設 15 秒)
    let t0 = Date.now()
    let r = spawnSync(process.execPath, [CHILD, name, fdLog], { cwd: projRoot, encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024, windowsHide: true })
    let byLayer = {}
    for (let ln of String(r.stdout || '').split(/\r?\n/)) {
        try {
            let o = JSON.parse(ln)
            byLayer[o.layer] = o
        }
        catch (err) {}
    }
    return { timedOut: (r.error && r.error.code === 'ETIMEDOUT') === true, status: r.status, byLayer, ms: Date.now() - t0, stderr: String(r.stderr || '').slice(-300) }
}


describe('unit-staLogs-timeLength (統計 timeLength 入口檢測, 排程第 301 項〔api 側〕)', function() {
    this.timeout(600000)

    before(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdLog, { recursive: true })
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })


    it('TL-001 parseTimeLength: 0～3650 之整數與其數字字串有效(回轉換後 number); 其餘一律 null(不拋錯)', function() {
        A.equal(MAX_TIME_LENGTH_DAY, 3650)
        //有效(含頭尾空白、科學記號、正號、前導零之數字字串; -0)
        for (let [v, n] of [[0, 0], [-0, 0], [1, 1], [7, 7], [3650, 3650], ['7', 7], [' 7 ', 7], ['1e1', 10], ['+7', 7], ['00012', 12], ['0', 0], ['3650', 3650], ['-0', 0]]) {
            let r = parseTimeLength(v)
            A.ok(typeof r === 'number' && Object.is(r, n), `parseTimeLength(${JSON.stringify(v)}) 應為 number ${n}(+0), 實得 ${typeof r} ${r}`)
        }
        //無效
        let revoked = Proxy.revocable({}, {})
        revoked.revoke()
        let bads = [NaN, Infinity, -Infinity, -1, -1e9, 1.5, 3651, 100000, 1e20, 1e308, 'abc', '', '   ', '0x10', 'Infinity', 'NaN', '7.5', '-1', '1e400', 'NP', null, undefined, true, false, {}, { valueOf: () => 7 }, [], [7], 7n, Symbol('x'), new Number(7), () => 7, revoked.proxy, new Date(0), 2 ** 53, '9007199254740993'] // eslint-disable-line no-new-wrappers
        for (let v of bads) {
            let r = null
            A.doesNotThrow(() => {
                r = parseTimeLength(v)
            }, `parseTimeLength 對 ${typeof v} 不得拋錯`)
            A.equal(r, null, `parseTimeLength(${typeof v}) 應為 null`)
        }
    })


    describe('TL-002 無效 timeLength 於各層入口皆被拒(固定鍵, 不回顯值, 不卡住)', function() {
        for (let name of INVALID) {
            it(`TL-002-${name}`, function() {
                let c = runCand(name)
                A.equal(c.timedOut, false, `候選 ${name} 子行程逾時(同步無窮迴圈或過慢): 已完成之層 ${Object.keys(c.byLayer)}, ms=${c.ms}`)
                A.equal(c.status, 0, `候選 ${name} 子行程異常結束 status=${c.status} stderr=${c.stderr}`)
                for (let layer of LAYERS) {
                    let o = c.byLayer[layer]
                    A.ok(o, `候選 ${name} 缺層 ${layer}(該層未回應); 已完成之層 ${Object.keys(c.byLayer)}`)
                    //genPlan 為同步 throw Error; 其餘入口回傳 Promise, 一律 reject 固定鍵字串(規格 §5.1; 不同步 throw)
                    A.equal(o.kind, layer === 'genPlan' ? 'throw' : 'reject', `候選 ${name} 層 ${layer}: 應被拒, 實得 ${o.kind} ${JSON.stringify(o.v)}`)
                    A.equal(o.v, KEY, `候選 ${name} 層 ${layer}: 應為固定鍵 ${KEY}(不回顯值), 實得 ${JSON.stringify(o.v)}`)
                }
            })
        }
    })


    describe('TL-003 有效 timeLength 於各層入口照常產出(桶數 = 天數 × 24 + 1; 數字字串以轉換值為準)', function() {
        for (let [name, days] of Object.entries(VALID)) {
            it(`TL-003-${name}`, function() {
                let c = runCand(name)
                A.equal(c.timedOut, false, `候選 ${name} 逾時: 已完成之層 ${Object.keys(c.byLayer)}, ms=${c.ms}`)
                A.equal(c.status, 0, `候選 ${name} 異常結束 stderr=${c.stderr}`)
                let n = days * 24 + 1
                A.equal(c.byLayer.genPlan && c.byLayer.genPlan.v, `kpTime(${n})`, `genPlan: ${JSON.stringify(c.byLayer.genPlan)}`)
                for (let layer of ['staLogs', 'staLogsWorker', 'staEvent']) {
                    let o = c.byLayer[layer]
                    A.ok(o, `缺層 ${layer}`)
                    A.equal(o.kind, 'ok', `層 ${layer}: ${JSON.stringify(o)}`)
                    A.equal(o.v, `array(${n})`, `層 ${layer} 桶數(與同一固定時刻之 genPlan 同為 ${n})`)
                }
            })
        }
    })


    //K4: 檢測之值即使用之值——數字字串 '7' 與數字 7 為同一查詢(修前 single-flight 鍵以原值 JSON 序列化, '7' 與 7 不同鍵而各掃一次)
    it('TL-004 single-flight: staLogs(7) 與 staLogs(\'7\')、staLogs(\' 7 \') 共用同一 promise(K4)', async function() {
        let o = { fdLog, timeNow: Date.UTC(2026, 10, 23, 4, 0, 0), useCache: false }
        let p1 = staLogs(7, 'hr', o)
        let p2 = staLogs('7', 'hr', o)
        let p3 = staLogs(' 7 ', 'hr', o)
        A.ok(p1 === p2 && p1 === p3, '7、\'7\'、\' 7 \' 應為同一 in-flight promise(轉換後之值為鍵)')
        let r = await p1
        A.equal(r.rs.length, 169)
        //無效者之 reject(不佔 single-flight 之鍵)於 TL-002 以子行程涵蓋(同行程呼叫於修前遇 timeNow 無效會同步無窮迴圈而卡死整個 mocha, 此處不放)
    })

    it('TL-004b single-flight: 無效之 timeNow(含 BigInt、循環物件、toJSON 拋錯者)已退回現在, 與未給同鍵, 且不使 staLogs 同步拋錯(原值不入鍵)', async function() {
        let circ = {}
        circ.self = circ
        let evil = {
            toJSON: () => {
                throw new Error('boom')
            },
        }
        for (let bad of [10n, circ, evil, '2026-01-01', NaN, Infinity]) {
            let p1 = null
            A.doesNotThrow(() => {
                p1 = staLogs(7, 'hr', { fdLog, timeNow: bad, useCache: false })
            }, `timeNow=${typeof bad} 不得使 staLogs 同步拋錯`)
            let p2 = staLogs(7, 'hr', { fdLog, useCache: false })
            A.ok(p1 === p2, `無效 timeNow(${typeof bad})應與未給同鍵(同一 in-flight promise)`)
            await p1
        }
    })


    //非 errTimeLengthInvalid 之錯誤(此處以已撤銷之 Proxy 作 opt, 令 genPlan 內 get(opt, …) 拋 TypeError)原樣交回(rejected Promise 之原因為該 Error 物件, 不被改成固定鍵), 且 staLogs 不同步拋錯——
    //  固定鍵只對「timeLength 無效」; 其他錯誤不得被誤標為 timeLength 無效而掩蓋真因(opt 於伺服端為固定值, 此為縱深防禦之行為釘住)
    it('TL-004c staLogs: genPlan 拋出非 errTimeLengthInvalid 之錯誤時, 回 rejected Promise 且原因為原 Error(不被改寫為固定鍵), 不同步拋錯', async function() {
        let revoked = Proxy.revocable({}, {})
        revoked.revoke()
        let pm = null
        A.doesNotThrow(() => {
            pm = staLogs(7, 'hr', revoked.proxy)
        }, 'staLogs 不得同步拋錯')
        let reason = null
        await pm.then(() => {
            reason = 'resolved'
        }, (e) => {
            reason = e
        })
        A.ok(reason instanceof Error, `原因應為 Error 物件(原樣), 實得 ${typeof reason} ${String(reason).slice(0, 60)}`)
        A.notEqual(reason, KEY, '不得被改寫為 errTimeLengthInvalid')
    })

    //有效範圍 1970-01-01(epoch 0)～2100-01-01T00:00:00.000Z(含); 範圍外(含 Date 本身之極值 ±8.64e15, 其後之 subtract／add 溢位成 Invalid Date)視為未給改用現在, 不使 kpTime 迴圈無窮; 範圍內(含兩端)照常使用該時刻
    describe('TL-005 opt.timeNow 為無效時刻者視為未給(退回現在), 不使迴圈無窮; 範圍內者照常使用', function() {
        const FMT = 'YYYY-MM-DDTHH'
        //範圍外或無效(退回現在): 現在所屬桶之標籤為現在之小時(容許跨整點差一小時)
        for (let name of ['now-NaN', 'now-Infinity', 'now-neg-Infinity', 'now-1e300', 'now-neg1e300', 'now-str', 'now-date-max', 'now-date-min', 'now-date-max-minus-5d', 'now-date-min-plus-5d', 'now-beyond-2100', 'now-year-9999', 'now-negative-epoch']) {
            it(`TL-005-fallback-${name}`, function() {
                let c = runCand(name)
                A.equal(c.timedOut, false, `候選 ${name} 逾時(kpTime 迴圈無窮): 已完成之層 ${Object.keys(c.byLayer)}, ms=${c.ms}`)
                A.equal(c.status, 0, `候選 ${name} 異常結束 stderr=${c.stderr}`)
                A.match(c.byLayer.genPlan.v, /^kpTime\(169\)$/, `genPlan: ${JSON.stringify(c.byLayer.genPlan)}`)
                for (let layer of ['staLogs', 'staLogsWorker', 'staEvent']) {
                    A.equal(c.byLayer[layer].kind, 'ok', `層 ${layer}: ${JSON.stringify(c.byLayer[layer])}`)
                    A.equal(c.byLayer[layer].v, 'array(169)')
                }
                let nowLabels = [ot().format(FMT), ot().subtract(1, 'hour').format(FMT)]
                A.ok(nowLabels.includes(c.byLayer.pinned.v), `應退回現在所屬桶(${nowLabels}), 實得 ${c.byLayer.pinned.v}`)
            })
        }
        //範圍內(含兩端): 照常使用所給時刻
        for (let [name, ms] of [['now-ok-epoch0', 0], ['now-ok-2100', 4102444800000]]) {
            it(`TL-005-pinned-${name}`, function() {
                let c = runCand(name)
                A.equal(c.timedOut, false, `候選 ${name} 逾時: ${Object.keys(c.byLayer)}`)
                A.match(c.byLayer.genPlan.v, /^kpTime\(169\)$/)
                A.equal(c.byLayer.pinned.v, ot(ms).format(FMT), '範圍內之 timeNow 須被採用(現在所屬桶為該時刻之小時)')
                for (let layer of ['staLogs', 'staLogsWorker', 'staEvent']) {
                    A.equal(c.byLayer[layer].v, 'array(169)')
                }
            })
        }
    })


    //語系鍵(CLAUDE.md: 後端錯誤一律回 key, 前端依 lang 查文字): errTimeLengthInvalid 於 procLang 須有 eng 與 cht 且非空
    it('TL-007 procLang 有 errTimeLengthInvalid 之 eng 與 cht 文字', async function() {
        let m = await import('../server/procLang.mjs')
        let L = m.default({}) //{ eng: { 鍵: 文字 }, cht: { 鍵: 文字 } }
        for (let lang of ['eng', 'cht']) {
            let s = L[lang].errTimeLengthInvalid
            A.ok(typeof s === 'string' && s.trim() !== '', `procLang(${lang}) 缺 errTimeLengthInvalid 或為空`)
        }
    })


    describe('TL-006 站點不變式(全部入口皆經檢測)', function() {
        const fdServer = path.join(projRoot, 'server')
        let codeOf = (rel) => codeText(path.join(fdServer, rel))

        //全集: server/ 下可執行碼提及 timeLength 之檔(新增檔須先判定是否為新入口)
        it('TL-006a 使用 timeLength 之伺服端檔案為已盤點之全集', function() {
            let hits = []
            let walk = (d) => {
                for (let n of fs.readdirSync(d, { withFileTypes: true })) {
                    let fp = path.join(d, n.name)
                    if (n.isDirectory()) {
                        walk(fp)
                    }
                    else if (n.name.endsWith('.mjs') && /\btimeLength\b/.test(codeText(fp))) {
                        hits.push(path.relative(fdServer, fp).replace(/\\/g, '/'))
                    }
                }
            }
            walk(fdServer)
            A.deepEqual(hits.sort(), [
                'WWebApi.mjs', //kpFunExt getStaEvent: 遠端唯一入口, 只轉交 staEvent(見 TL-006c)
                'staLogs/staEvent.mjs', //轉交 staLogs(callWorker)
                'staLogs/staLogsCore.callWorker.mjs', //轉交 staLogsCore
                'staLogs/staLogsCore.mjs', //核心: genPlan 檢測
            ].sort(), '出現新的 timeLength 使用檔: 須先判定是否為新入口並納入檢測, 再更新本全集')
        })

        it('TL-006b staLogsCore.genPlan: parseTimeLength 先於 now.subtract 與 kpTime 迴圈; 無效 throw errTimeLengthInvalid; staLogs reject 固定鍵且 single-flight 鍵用轉換後之值', function() {
            let code = codeOf('staLogs/staLogsCore.mjs')
            let i0 = code.indexOf('function genPlan(')
            let body = code.slice(i0, code.indexOf('function listFiles('))
            let iParse = body.indexOf('parseTimeLength(')
            let iSub = body.indexOf('.subtract(')
            let iLoop = body.indexOf('while (')
            A.ok(iParse >= 0 && iSub >= 0 && iLoop >= 0, 'genPlan 須含 parseTimeLength、subtract、迴圈')
            A.ok(iParse < iSub && iSub < iLoop, `檢測須先於 subtract 與迴圈(位置 ${iParse} < ${iSub} < ${iLoop})`)
            A.ok(/throw new Error\('errTimeLengthInvalid'\)/.test(body), '無效須 throw Error(errTimeLengthInvalid)')
            let bodyStaLogs = code.slice(code.indexOf('function staLogs('))
            A.ok(/Promise\.reject\(/.test(bodyStaLogs) && /plan\.timeLength/.test(bodyStaLogs) && /plan\.timeNowPinned/.test(bodyStaLogs), 'staLogs 須 reject 固定鍵, single-flight 鍵用 plan.timeLength 與 plan.timeNowPinned(不用原值)')
            A.ok(!/\bget\(opt, 'timeNow', null\)/.test(bodyStaLogs), 'single-flight 鍵不得再用 opt.timeNow 原值')
        })

        it('TL-006c 伺服端唯一之遠端入口 getStaEvent 只經 staEvent(→ staLogs → genPlan); staEvent／staLogs 於 server/ 之呼叫者只有 WWebApi 與其轉交鏈; 不留第二份檢測', function() {
            let code = codeOf('WWebApi.mjs')
            let m = /getStaEvent: wrapErrLog\('getStaEvent', \(userId, timeLength = 7, timeInterval = 'hr'\) => \{[\s\S]*?\n {12}\}\),/.exec(code)
            A.ok(m, '須找到 kpFunExt getStaEvent')
            A.ok(/staEvent\(timeLength, timeInterval, \{ fdLog: logFd, srLog \}\)/.test(m[0]), 'getStaEvent 須轉交 staEvent(timeLength, timeInterval, …)')
            A.ok(!/staLogs\(|genPlan\(|parseTimeLength\(/.test(m[0]), 'kpFunExt getStaEvent 不得直接呼叫 staLogs／genPlan／自行檢測(單一擁有者在 genPlan)')
            //server/ 內(staLogs/ 資料夾除外)呼叫 staEvent／staLogs 者
            let callers = []
            let walk = (d) => {
                for (let n of fs.readdirSync(d, { withFileTypes: true })) {
                    let fp = path.join(d, n.name)
                    let rel = path.relative(fdServer, fp).replace(/\\/g, '/')
                    if (n.isDirectory()) {
                        if (rel !== 'staLogs') {
                            walk(fp)
                        }
                    }
                    else if (n.name.endsWith('.mjs') && /\b(staEvent|staLogs)\(/.test(codeText(fp))) {
                        callers.push(rel)
                    }
                }
            }
            walk(fdServer)
            A.deepEqual(callers, ['WWebApi.mjs'], 'staLogs 資料夾外只有 WWebApi 可呼叫 staEvent／staLogs(其檢測已於 genPlan 首動作)')
            //單一擁有者: 不得另留 Number.isInteger(timeLength 式之第二份檢測(修前之寫法)
            for (let rel of ['staLogs/staLogsCore.mjs', 'staLogs/staEvent.mjs', 'staLogs/staLogsCore.callWorker.mjs', 'WWebApi.mjs']) {
                A.ok(!/Number\.isInteger\(\s*timeLength/.test(codeOf(rel)), `${rel} 不得留 Number.isInteger(timeLength…) 之第二份檢測`)
            }
        })
    })
})
