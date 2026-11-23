/* eslint-disable no-template-curly-in-string, comma-spacing, object-property-newline -- 變異清單以字面文字比對原始碼(含 ${…} 樣板片段與稀疏解構), 為證據腳本, 不改其邏輯 */
//第 301／570／206 項(api 側)之變異驗證: 逐項於原位植入單點缺陷, 跑目標測試, 判定「擊殺」(有 failing)／存活／未判定(無摘要行), 每項還原並以 sha256 回驗
//用法: node spec/evidence/twa1-20261123/mutate.mjs <群組: 301|570|206|e2e|all> [輸出 json 路徑]
//  須在測試鎖下執行(quiet-run --lock); 變異期間會暫時改動 server/、src/ 之檔(結束必還原; 異常結束時以記錄之 sha256 與 git 比對)
//規則(skill role-coder-for-test §10): 錨點不存在或不唯一即報失敗; 無摘要行(passing+failing=0)判未判定而非擊殺; 先跑未變異之對照組須全綠
import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const root = path.resolve('.')
const mocha = path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js')
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

const T301 = ['test/unit-staLogs-timeLength.test.mjs']
const T206 = ['test/unit-consoleNoValuesFront.test.mjs']

//[id, 目標檔, 錨點(須恰出現一次), 取代, 測試檔[], 環境變數]
const M = [
    //---- 301: timeLength／timeNow 入口 ----
    ['M301-01', 'server/staLogs/staLogsCore.mjs', 'if (nDay === null) {', 'if (nDay === null && false) {', T301],
    ['M301-02', 'server/staLogs/staLogsCore.mjs', 'let MAX_TIME_LENGTH_DAY = 3650', 'let MAX_TIME_LENGTH_DAY = 100000', T301],
    ['M301-03', 'server/staLogs/staLogsCore.mjs', 'path.resolve(plan.fdLog), plan.timeLength, plan.timeInterval', 'path.resolve(plan.fdLog), timeLength, plan.timeInterval', T301],
    ['M301-04', 'server/staLogs/staLogsCore.mjs', 'return Promise.reject(get(err, \'message\') === \'errTimeLengthInvalid\' ? \'errTimeLengthInvalid\' : err)', 'throw err', T301],
    ['M301-05', 'server/staLogs/staLogsCore.mjs', 'let isNowOk = typeof timeNow === \'number\' && timeNow >= TIME_NOW_MIN && timeNow <= TIME_NOW_MAX', 'let isNowOk = typeof timeNow === \'number\' && !Number.isNaN(ot(timeNow).valueOf())', T301],
    ['M301-06', 'server/staLogs/staLogsCore.mjs', 'iseint(timeLength, { min: 0, max: MAX_TIME_LENGTH_DAY })', 'iseint(timeLength, { min: -100000, max: MAX_TIME_LENGTH_DAY })', T301],
    ['M301-07', 'server/staLogs/staLogsCore.mjs', 'return (typeof timeLength === \'string\' ? Number(timeLength.trim()) : timeLength) + 0', 'return timeLength', T301],
    ['M301-08', 'server/staLogs/staLogsCore.mjs', 'let TIME_NOW_MIN = 0', 'let TIME_NOW_MIN = -8.64e15', T301],
    ['M301-09', 'server/staLogs/staLogsCore.mjs', 'plan.timeNowPinned ? plan.timeNow : null', 'get(opt, \'timeNow\', null)', T301],
    ['M301-10', 'server/staLogs/staLogsCore.mjs', 'throw new Error(\'errTimeLengthInvalid\')', 'throw new Error(\'errTimeLength\')', T301],
    ['M301-11', 'server/procLang.mjs', '    errTimeLengthInvalid: {', '    errTimeLengthInvalidX: {', T301],
    ['M301-12', 'server/WWebApi.mjs', 'return staEvent(timeLength, timeInterval, { fdLog: logFd, srLog })', 'return staEvent(Number(timeLength), timeInterval, { fdLog: logFd, srLog })', T301],
    ['M301-13', 'server/staLogs/staLogsCore.mjs', ': timeLength) + 0', ': timeLength)', T301],
    ['M301-14', 'server/staLogs/staLogsCore.mjs', 'let nDay = parseTimeLength(timeLength)', 'let nDay = Number.isInteger(timeLength) ? timeLength : parseTimeLength(timeLength)', T301],
    ['M301-15', 'server/staLogs/staLogsCore.mjs', 'timeNowPinned: isNowOk', 'timeNowPinned: true', T301],
    ['M301-16', 'server/staLogs/staLogsCore.mjs', 'if (!iseint(timeLength, { min: 0, max: MAX_TIME_LENGTH_DAY })) {', 'if (!Number.isInteger(timeLength)) {', T301],
    ['M301-17', 'server/staLogs/staLogsCore.mjs', 'return Promise.reject(get(err, \'message\') === \'errTimeLengthInvalid\' ? \'errTimeLengthInvalid\' : err)', 'return Promise.reject(\'errTimeLengthInvalid\')', T301],
    ['M301-A1','server/staLogs/staLogsCore.mjs', 'if (!iseint(timeLength, { min: 0, max: MAX_TIME_LENGTH_DAY })) {', 'if (!Number.isInteger(timeLength)) {', ['test/api-staEventTimeLength.test.mjs']],
    //---- 570: 前置純函數與註解 ----
    ['M570-01', 'server/checkSyncRows.mjs', 'let hasId = (id) => isestr(id) || (typeof id === \'number\' && Number.isFinite(id))', 'let hasId = (id) => isestr(id) || (typeof id === \'number\')', ['test/unit-syncRows.test.mjs']],
    ['M570-02', 'server/checkSyncRows.mjs', 'let hasId = (id) => isestr(id) || (typeof id === \'number\' && Number.isFinite(id))', 'let hasId = (id) => isestr(id) || (typeof id === \'number\' && !Number.isNaN(id))', ['test/unit-syncRows.test.mjs']],
    //---- 206: 前端 console ----
    ['M206-01', 'src/App.vue', 'console.log(\'login success\', describeShape(data.user))', 'console.log(\'login success\', data.user)', T206],
    ['M206-02', 'src/components/LayoutContentEdit.vue', 'console.log(\'saveApi\', describeErr(err))', 'console.log(\'saveApi\', err)', T206],
    ['M206-03', 'src/describeShape.mjs', 'return `(keys: ${s})`', 'return JSON.stringify(v)', T206],
    ['M206-04', 'src/describeShape.mjs', 'let isCtl = x < 32 || (x >= 127 && x <= 159) || x === 0x2028 || x === 0x2029 || (x >= 0x202a && x <= 0x202e) || (x >= 0x2066 && x <= 0x2069)', 'let isCtl = x < 32 || x === 127', T206],
    ['M206-05', 'src/describeShape.mjs', 'return b.errCode === undefined ? `(${safeCtl(String(b.errType))})`', 'return b.errCode === undefined ? `(${safeCtl(String(b.errType))}: ${safeCtl(String(err && err.message))})`', T206],
    ['M206-06', 'src/main.js', 'console.log(\'$alert\', describeShape(msg), describeShape(type))', 'console.log(\'$alert\', msg, type)', T206],
    ['M206-07', 'src/components/MdPanel.vue', 'console.log(\'md2html\', describeErr(err))', 'console.log(\'md2html\', describeErr(err)); console.log(\'md\', vo.md)', T206],
    ['M206-08', 'src/store/applyRows.mjs', 'console.log(\'applyDeletedRow\', describeErr(err))', 'let c = console; c.log(\'applyDeletedRow\', describeErr(err))', T206],
    ['M206-09', 'server/maskLog.mjs', 'let errBrief = (err) => {', 'let describeErr = (err) => \'x\'\nlet errBrief = (err) => {', T206],
    ['M206-10', 'src/describeShape.mjs', 'import isarr from \'wsemi/src/isarr.mjs\'', 'import fs from \'fs\'\nimport isarr from \'wsemi/src/isarr.mjs\'', T206],
    ['M206-11', 'src/App.vue', 'console.log(\'urlRedirect\', describeShape(urlRedirect))', 'console.log(\'urlRedirect\', urlRedirect)', T206],
    ['M206-12', 'src/main.js', 'console.log(\'getWebInfor failed\', describeErr(err))', 'console.log(\'getWebInfor failed\', err)', T206],
    ['M206-13', 'src/components/MdPanel.vue', 'import { describeErr } from \'../describeShape.mjs\'', 'import { describeErr } from \'../plugins/mShare.mjs\'', T206],
    ['M206-14', 'server/maskLog.mjs', 'let errBrief = (err) => {', 'let xx = () => getDiagBriefErr(1)\nlet errBrief = (err) => {', ['test/unit-ormDiagLog.test.mjs']],
    ['M206-15', 'src/describeShape.mjs', 'return b.errCode === undefined ? `(${safeCtl(String(b.errType))})` : `(${safeCtl(String(b.errType))} ${safeCtl(String(b.errCode))})`', 'return !(err && err.code) ? `(${safeCtl(String(b.errType))})` : `(${safeCtl(String(b.errType))} ${safeCtl(String(err.code))})`', T206],
    ['M206-16', 'src/App.vue', 'console.log(\'login error\', describeShape(data))', 'console.log(\'login error\', data)', T206],
    ['M206-17', 'src/describeShape.mjs', 'return `(array, length=${Number.isInteger(v.length) ? v.length : \'?\'})`', 'return `(array, length=${v.length})`', T206],
    //---- 206 真瀏覽器層(e2e): 登入成功印使用者物件 ----
    ['M206-E2E', 'src/App.vue', 'console.log(\'login success\', describeShape(data.user))', 'console.log(\'login success\', data.user)', ['test/e2e-consoleNoValues.test.mjs', '--grep', 'CN-001'], { E2E_MUT: '1' }],
    //失敗路徑: getWebInfor 之 catch 印錯誤本體(經 describeErr 之接線於瀏覽器內執行)
    ['M206-E2E-2', 'src/main.js', 'console.log(\'getWebInfor failed\', describeErr(err))', 'console.log(\'getWebInfor failed\', err)', ['test/e2e-consoleNoValues.test.mjs', '--grep', 'CN-002'], { E2E_MUT: '1' }],
]

let group = process.argv[2] || 'all'
let fpOut = process.argv[3] ? path.resolve(process.argv[3]) : null
let pick = (id) => group === 'all' ? !id.startsWith('M206-E2E') : (group === 'e2e' ? id.startsWith('M206-E2E') : id.startsWith(`M${group}-`) && !id.startsWith('M206-E2E'))

function runMocha(tests, env, timeoutMs) {
    let r = spawnSync(process.execPath, [mocha, '--no-parallel', '--bail', ...tests, '--timeout', '120000', '--reporter', 'dot'], {
        cwd: root, encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, TL_CHILD_TIMEOUT_MS: '8000', ...(env || {}) },
    })
    let out = String(r.stdout || '') + String(r.stderr || '')
    let passing = Number((/(\d+) passing/.exec(out) || [0, 0])[1])
    let failing = Number((/(\d+) failing/.exec(out) || [0, 0])[1])
    let firstFail = ''
    let m = /1\) ([^\n]*)\n([^\n]*)\n/.exec(out)
    if (m) {
        firstFail = `${m[1]} | ${m[2]}`.trim().slice(0, 160)
    }
    return { passing, failing, exit: r.status, timedOut: !!(r.error && r.error.code === 'ETIMEDOUT'), firstFail }
}

let results = []
let originals = new Map() //檔 → Buffer(全程以此為還原來源)
let restoreAll = () => {
    for (let [rel, buf] of originals) {
        fs.writeFileSync(path.join(root, rel), buf)
    }
}
process.on('SIGINT', () => {
    restoreAll()
    process.exit(130)
})

try {
    let list = M.filter((m) => pick(m[0]))
    //錨點檢查(不執行): 每項錨點須恰出現一次
    for (let [id, rel, find] of list) {
        let buf = fs.readFileSync(path.join(root, rel))
        if (!originals.has(rel)) {
            originals.set(rel, buf)
        }
        let n = buf.toString('utf8').split(find).length - 1
        if (n !== 1) {
            throw new Error(`${id}: 錨點於 ${rel} 出現 ${n} 次(須恰 1 次)`)
        }
    }
    //對照組: 同一組測試檔於未變異狀態須全綠
    let seen = new Set()
    for (let [id, , , , tests, env] of list) {
        let k = tests.join(',') + JSON.stringify(env || {})
        if (seen.has(k) || id.startsWith('M206-E2E')) {
            continue
        }
        seen.add(k)
        let c = runMocha(tests, env, 900000)
        console.log(JSON.stringify({ control: tests, passing: c.passing, failing: c.failing, exit: c.exit }))
        if (c.failing !== 0 || c.passing === 0 || c.exit !== 0) {
            throw new Error(`對照組(未變異)非全綠: ${tests}`)
        }
    }
    for (let [id, rel, find, rep, tests, env] of list) {
        let fp = path.join(root, rel)
        let orig = originals.get(rel)
        let hOrig = sha(orig)
        let mutated = orig.toString('utf8').replace(find, () => rep)
        fs.writeFileSync(fp, mutated, 'utf8')
        let res = null
        try {
            res = runMocha(tests, env, 900000)
        }
        finally {
            fs.writeFileSync(fp, orig)
        }
        let hBack = sha(fs.readFileSync(fp))
        let verdict = res.passing + res.failing === 0 ? 'UNDETERMINED' : (res.failing > 0 ? 'KILLED' : 'SURVIVED')
        let o = { id, file: rel, tests, verdict, passing: res.passing, failing: res.failing, exit: res.exit, timedOut: res.timedOut, firstFail: res.firstFail, restoredSha256Same: hBack === hOrig }
        results.push(o)
        console.log(JSON.stringify(o))
        if (hBack !== hOrig) {
            throw new Error(`${id}: 還原後 sha256 不符`)
        }
    }
}
finally {
    restoreAll()
}
let summary = { total: results.length, killed: results.filter((r) => r.verdict === 'KILLED').length, survived: results.filter((r) => r.verdict === 'SURVIVED').map((r) => r.id), undetermined: results.filter((r) => r.verdict === 'UNDETERMINED').map((r) => r.id), allRestored: results.every((r) => r.restoredSha256Same) }
console.log(JSON.stringify({ summary }))
if (fpOut) {
    fs.mkdirSync(path.dirname(fpOut), { recursive: true })
    fs.writeFileSync(fpOut, JSON.stringify({ results, summary }, null, 2) + '\n', 'utf8')
}
