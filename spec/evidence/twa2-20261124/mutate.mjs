//變異驗證(第 603 項, w-web-api): 對產品碼與測試輔助逐項植入單點缺陷, 跑相關測試, 須轉紅(擊殺); 每項還原後以 sha256 回驗
//用法(須經 quiet-run --lock): node tmp/twa2/mutate.mjs [--only <前綴>]
//規則: 錨點須恰出現 expectCount 次(預設 1), 不符即報「錨點錯誤」而非靜默略過; 未變異對照組先跑, 須全綠; 變異期間不做其他編輯
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'

let root = path.resolve('.')
let sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
let MOCHA = path.join(root, 'node_modules', 'mocha', 'bin', 'mocha.js')
let D = '$'

let U = ['test/unit-consoleSites.test.mjs', 'test/unit-consoleNoValuesFront.test.mjs', 'test/unit-maskLog.test.mjs', 'test/unit-ormDiagLog.test.mjs']
let UA = [...U, 'test/api-logLeak.test.mjs']
let UD = ['test/unit-distGuard.test.mjs']
let E = ['test/e2e-consoleNoValues.test.mjs']

//edits: [{ file, find, repl, nth?, expectCount? }]; create: { file, content }
let M = [
    //---- 伺服端(WWebApi.mjs／srv.mjs／maskLog.mjs)
    { id: 'S1', desc: 'checkUser 之 user 站點改印使用者物件本體', tests: UA, edits: [{ file: 'server/WWebApi.mjs', find: "console.log('user', getDiagShape(user))", repl: "console.log('user', user)", nth: 0, expectCount: 7 }] },
    { id: 'S2', desc: '建構參數 url 之站點不再 keys:false(連鍵名亦列)', tests: UA, edits: [{ file: 'server/WWebApi.mjs', find: "console.log('invalid url', getDiagShape(url, { keys: false }))", repl: "console.log('invalid url', getDiagShape(url))" }] },
    { id: 'S3', desc: 'ORM 建構失敗站點印錯誤本體', tests: UA, edits: [{ file: 'server/WWebApi.mjs', find: "console.log('WServOrm init failed', getDiagBriefErr(err))", repl: "console.log('WServOrm init failed', err)" }] },
    { id: 'S4', desc: 'WWebApi 缺 getDiagShape 匯入', tests: UA, edits: [{ file: 'server/WWebApi.mjs', find: "import getDiagShape from 'wsemi/src/getDiagShape.mjs'", repl: '' }] },
    { id: 'S5', desc: 'maskLog 復活本地 shapeOf(定義＋匯出)', tests: UA, edits: [{ file: 'server/maskLog.mjs', find: 'let maskUrl = (u) => {', repl: "let shapeOf = (v) => '(x)'\nlet maskUrl = (u) => {" }, { file: 'server/maskLog.mjs', find: '    maskUrl,', repl: '    maskUrl,\n    shapeOf,' }] },
    { id: 'S6', desc: '請求本體站點(group 無效)漏印 rows 之形狀', tests: UA, edits: [{ file: 'server/WWebApi.mjs', find: "console.log('payload', getDiagShape(payload), 'rows', getDiagShape(get(payload, 'rows')))", repl: "console.log('payload', getDiagShape(payload))", nth: 0, expectCount: 2 }] },
    { id: 'S7', desc: 'keyTable 站點改回 typeof 樣板', tests: UA, edits: [{ file: 'server/WWebApi.mjs', find: "console.log('keyTable', getDiagShape(keyTable))", repl: "console.log('keyTable', `(" + D + "{typeof keyTable})`)", nth: 1, expectCount: 2 }] },
    { id: 'S8', desc: '入口檔寫入失敗站點印 String(err)', tests: UA, edits: [{ file: 'server/WWebApi.mjs', find: 'console.log(getDiagBriefErr(err)) //檔案系統錯誤', repl: 'console.log(String(err)) //檔案系統錯誤' }] },
    { id: 'S9', desc: 'srv.mjs 之 getDiagBriefErr 不宣告 nested cause', tests: U, edits: [{ file: 'srv.mjs', find: "getDiagBriefErr(err, { nested: ['cause'] })", repl: 'getDiagBriefErr(err)', nth: 0, expectCount: 2 }] },
    { id: 'S10', desc: 'srv.mjs state 站點改回 typeof 樣板', tests: U, edits: [{ file: 'srv.mjs', find: 'getDiagShape(state)', repl: '`(' + D + '{typeof state})`' }] },
    { id: 'S11', desc: 'srv.mjs 新增 getDiag( 呼叫(診斷物件用途)', tests: U, edits: [{ file: 'srv.mjs', find: '//node srv.mjs', repl: 'let zzDiag = getDiag(1)\n//node srv.mjs' }] },
    { id: 'S12', desc: 'WWebApi 復活本地 typeOf 閉包並用於一站', tests: UA, edits: [{ file: 'server/WWebApi.mjs', find: "console.log('group', getDiagShape(group))", repl: "let typeOf = (v) => `(" + D + "{typeof v})`\n            console.log('group', typeOf(group))" }] },
    { id: 'S13', desc: 'getDiagBriefErr 匯入指向他處', tests: U, edits: [{ file: 'server/WWebApi.mjs', find: "import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'", repl: "import getDiagBriefErr from './maskLog.mjs'" }] },
    //---- 前端(src)
    { id: 'F1', desc: 'App.vue 登入成功印使用者物件本體', tests: U, edits: [{ file: 'src/App.vue', find: "console.log('login success', getDiagShape(data.user))", repl: "console.log('login success', data.user)" }] },
    { id: 'F2', desc: 'LayoutContentEdit.vue 缺 getDiagBriefErr 匯入', tests: U, edits: [{ file: 'src/components/LayoutContentEdit.vue', find: "import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'", repl: '' }] },
    { id: 'F3', desc: 'main.js 錯誤摘要放進樣板字串(得 [object Object])', tests: U, edits: [{ file: 'src/main.js', find: "console.log('getWebInfor failed', getDiagBriefErr(err))", repl: 'console.log(`getWebInfor failed ' + D + '{getDiagBriefErr(err)}`)' }] },
    { id: 'F4', desc: '復活本地模組 src/describeShape.mjs', tests: U, create: { file: 'src/describeShape.mjs', content: 'export function describeShape(v) {\n    return typeof v\n}\n' } },
    { id: 'F5', desc: 'MdPanel.vue 之 getDiagBriefErr 匯入指向本地模組', tests: U, edits: [{ file: 'src/components/MdPanel.vue', find: "import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'", repl: "import getDiagBriefErr from '../describeShape.mjs'" }] },
    { id: 'F6', desc: 'applyRows.mjs 第一站印錯誤本體', tests: U, edits: [{ file: 'src/store/applyRows.mjs', find: "console.log('applySavedRow', getDiagBriefErr(err))", repl: "console.log('applySavedRow', err)" }] },
    { id: 'F7', desc: 'LayoutContentStats.vue 錯誤摘要經 String()', tests: U, edits: [{ file: 'src/components/LayoutContentStats.vue', find: "console.log('getStaEvent catch', getDiagBriefErr(err))", repl: "console.log('getStaEvent catch', String(getDiagBriefErr(err)))" }] },
    { id: 'F8', desc: 'main.js $alert 印訊息本體', tests: U, edits: [{ file: 'src/main.js', find: 'getDiagShape(msg), getDiagShape(type)', repl: 'msg, getDiagShape(type)' }] },
    { id: 'F9', desc: 'App.vue 之 getDiagShape 匯入指向他處', tests: U, edits: [{ file: 'src/App.vue', find: "import getDiagShape from 'wsemi/src/getDiagShape.mjs'", repl: "import getDiagShape from 'wsemi/src/getDiagBriefErr.mjs'" }] },
    //---- 測試輔助(distGuard／e2e-setup／runner)
    { id: 'H1', desc: 'distGuard 還原不驗 sha256', tests: UD, edits: [{ file: 'test/tools/distGuard.mjs', find: 'if (sha(path.join(distDir, f.rel)) !== f.sha256) {', repl: 'if (false) {' }] },
    { id: 'H2', desc: 'distGuard 還原前不清空 dist(多餘檔殘留)', tests: UD, edits: [{ file: 'test/tools/distGuard.mjs', find: '    fs.rmSync(distDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })', repl: '' }] },
    { id: 'H3', desc: 'distGuard 啟動不處理殘留備份', tests: UD, edits: [{ file: 'test/tools/distGuard.mjs', find: 'if (fs.existsSync(path.join(snapDir, MANIFEST))) {', repl: 'if (false) {' }] },
    { id: 'H4', desc: 'e2e-setup 不備份即建置(guardDistStart 呼叫移除)', tests: UD, edits: [{ file: 'test/tools/e2e-setup.mjs', find: '                    let g = guardDistStart()', repl: '                    let g = { nFiles: 0, staleRestored: false }' }] },
    { id: 'H5', desc: 'e2e-setup 之 cleanup 不還原 dist', tests: UD, edits: [{ file: 'test/tools/e2e-setup.mjs', find: '        guardDistRestore()\n    },', repl: '    },' }] },
    { id: 'H6', desc: 'distGuard 不偵測連結', tests: UD, edits: [{ file: 'test/tools/distGuard.mjs', find: 'if (d.isSymbolicLink()) {', repl: 'if (false) {' }] },
    { id: 'H7', desc: 'distGuard 啟動不清無 manifest 之殘留', tests: UD, edits: [{ file: 'test/tools/distGuard.mjs', find: '    fs.rmSync(snapDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) //無 manifest 之殘留', repl: '    //(變異: 不清殘留)' }] },
    { id: 'H8', desc: '逐檔 runner 收尾不還原 dist', tests: UD, edits: [{ file: 'test/tools/run-e2e-isolated.mjs', find: '        guardDistRestore()\n    },\n})', repl: '    },\n})' }] },
    { id: 'H9', desc: 'distGuard 寫入與實際備份不符之 manifest(還原時找不到備份檔)', tests: UD, edits: [{ file: 'test/tools/distGuard.mjs', find: "    fs.writeFileSync(path.join(snapDir, MANIFEST), JSON.stringify(m, null, 1), 'utf8') //最後才寫: 存在即表示備份完整", repl: "    fs.writeFileSync(path.join(snapDir, MANIFEST), JSON.stringify({ existed: true, files: [{ rel: 'zz-missing.js', sha256: 'x', size: 1, atimeMs: 0, mtimeMs: 0 }], dirs: [] }, null, 1), 'utf8') //變異: 寫入與實際備份不符之 manifest" }] },
    //---- 真瀏覽器(需建置; 各約 1.5 分)
    { id: 'E1', desc: '真瀏覽器: main.js 之 catch 印錯誤本體', tests: E, edits: [{ file: 'src/main.js', find: "console.log('getWebInfor failed', getDiagBriefErr(err))", repl: "console.log('getWebInfor failed', err)" }] },
    { id: 'E2', desc: '真瀏覽器: App.vue 登入成功印使用者物件本體', tests: E, edits: [{ file: 'src/App.vue', find: "console.log('login success', getDiagShape(data.user))", repl: "console.log('login success', data.user)" }] },
]

let args = process.argv.slice(2)
let iOnly = args.indexOf('--only')
let only = iOnly >= 0 ? args[iOnly + 1].split(',') : null
let outJson = path.join(root, 'tmp', 'twa2', iOnly >= 0 ? `mutation-results-${only.join('_')}.json` : 'mutation-results.json')

let runMocha = (files) => {
    let r = spawnSync(process.execPath, [MOCHA, '--no-parallel', ...files, '--timeout', '300000'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true })
    let out = `${r.stdout || ''}${r.stderr || ''}`
    let p = /(\d+) passing/.exec(out)
    let f = /(\d+) failing/.exec(out)
    let names = [...out.matchAll(/^\s+\d+\) (.+)$/gm)].map((m) => m[1].trim().slice(0, 90))
    return { exit: r.status, passing: p ? Number(p[1]) : 0, failing: f ? Number(f[1]) : 0, names: [...new Set(names)].slice(0, 6) }
}

let results = []
//未變異對照組
let groups = new Map()
for (let m of M) {
    if (only && !only.some((o) => m.id === o)) {
        continue
    }
    groups.set(m.tests.join('|'), m.tests)
}
for (let [k, tests] of groups) {
    let r = runMocha(tests)
    let ok = r.exit === 0 && r.failing === 0 && r.passing > 0
    console.log(`[control] ${tests.join(' ')} => passing=${r.passing} failing=${r.failing} ${ok ? 'OK' : 'NOT-GREEN'}`)
    results.push({ id: `CONTROL:${k}`, ...r, ok })
    if (!ok) {
        fs.writeFileSync(outJson, JSON.stringify(results, null, 1))
        throw new Error(`對照組非全綠, 停止: ${k}`)
    }
}

for (let m of M) {
    if (only && !only.some((o) => m.id === o)) {
        continue
    }
    let backups = new Map()
    let created = null
    let result = { id: m.id, desc: m.desc, tests: m.tests }
    try {
        if (m.create) {
            created = path.join(root, m.create.file)
            if (fs.existsSync(created)) {
                throw new Error(`錨點錯誤: ${m.create.file} 已存在`)
            }
            fs.writeFileSync(created, m.create.content, 'utf8')
        }
        for (let e of m.edits || []) {
            let fp = path.join(root, e.file)
            if (!backups.has(fp)) {
                backups.set(fp, fs.readFileSync(fp))
            }
            let s = fs.readFileSync(fp, 'utf8')
            let eol = s.includes('\r\n') ? '\r\n' : '\n'
            let find = e.find.replace(/\n/g, eol)
            let repl = e.repl.replace(/\n/g, eol)
            let n = s.split(find).length - 1
            let want = e.expectCount || 1
            if (n !== want) {
                throw new Error(`錨點錯誤: ${e.file} 之「${e.find.slice(0, 50)}」出現 ${n} 次, 預期 ${want}`)
            }
            let nth = e.nth || 0
            let idx = -1
            for (let i = 0; i <= nth; i++) {
                idx = s.indexOf(find, idx + 1)
            }
            fs.writeFileSync(fp, s.slice(0, idx) + repl + s.slice(idx + find.length), 'utf8')
        }
        let r = runMocha(m.tests)
        //殺死: 有測試失敗(failing > 0), 或離開碼非 0 且有統計; 無統計(崩潰未輸出摘要)者為未判定
        let judged = r.passing + r.failing > 0
        result = { ...result, ...r, verdict: !judged ? 'UNDECIDED' : r.failing > 0 ? 'KILLED' : 'SURVIVED' }
    }
    catch (err) {
        result = { ...result, verdict: 'ANCHOR-ERROR', error: String(err.message).slice(0, 200) }
    }
    finally {
        for (let [fp, buf] of backups) {
            fs.writeFileSync(fp, buf)
            if (sha(fs.readFileSync(fp)) !== sha(buf)) {
                result.restoreMismatch = true
            }
        }
        if (created !== null) {
            fs.rmSync(created, { force: true })
            if (fs.existsSync(created)) {
                result.restoreMismatch = true
            }
        }
    }
    console.log(`[${m.id}] ${result.verdict} passing=${result.passing} failing=${result.failing} ${result.names ? JSON.stringify(result.names.slice(0, 2)) : ''} ${result.error || ''}${result.restoreMismatch ? ' RESTORE-MISMATCH' : ''}`)
    results.push(result)
    fs.writeFileSync(outJson, JSON.stringify(results, null, 1))
}
let sum = { killed: 0, survived: 0, undecided: 0, anchor: 0 }
for (let r of results) {
    if (r.verdict === 'KILLED') sum.killed++
    else if (r.verdict === 'SURVIVED') sum.survived++
    else if (r.verdict === 'UNDECIDED') sum.undecided++
    else if (r.verdict === 'ANCHOR-ERROR') sum.anchor++
}
console.log(`SUMMARY ${JSON.stringify(sum)}`)
