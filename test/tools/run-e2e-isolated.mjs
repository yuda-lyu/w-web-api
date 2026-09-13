//逐檔隔離執行 e2e：每個 e2e 檔以「獨立 mocha 進程 + 全新後端」跑（移植自 w-web-perm，技能 §9.2）。
//
//本專案後端 srv.mjs（11005）同時 serve build 後之 dist 與 API，無獨立前端 dev server；每檔前殺後端 → 新 mocha 進程之
//startServersOnce 偵測 11005 沒人 → 重新 build + spawn 全新後端（build 約數十秒；若要省 build 可先自行 `npm run build`，
//startServersOnce 仍會 build 一次——此為 hermetic 之代價，逐檔隔離優先）。
//
//定位：`npm test` 依全域 §16.5 為單一 mocha 進程跑全部 test/*.test.mjs（各 e2e 檔以 after 還原後端 settings / 資料表使其 hermetic）；
//  本 runner 為輔助工具（全域 §16.4 test/tools/），用於 flake 排查或需完全隔離之情境：每檔獨立 mocha 進程 + 全新後端。
//
//用法：node test/tools/run-e2e-isolated.mjs   (exit 0=全綠；非 0=有失敗檔)

import { spawnSync, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url)) //test/tools
const testDir = join(__dirname, '..') //test, e2e 測試檔所在
const projRoot = join(__dirname, '..', '..')
const isWin = process.platform === 'win32'
const BACKEND_PORT = 11005

//動態列舉全部 e2e 檔（pattern 白名單）：新增之 e2e-*.test.mjs 自動納入
const E2E_FILES = fs.readdirSync(testDir)
    .filter((f) => /^e2e-.*\.test\.mjs$/.test(f))
    .sort()

function killPort(port) {
    if (!isWin) {
        try { execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore' }) } catch (e) {}
        return
    }
    try {
        const out = execSync(`netstat -ano | findstr ":${port}"`, { encoding: 'utf8' })
        const pids = new Set()
        for (const line of out.split(/\r?\n/).filter((l) => /LISTENING/.test(l))) {
            const m = line.match(/\s(\d+)\s*$/)
            if (m) { pids.add(m[1]) }
        }
        for (const pid of pids) { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }) } catch (e) {} }
    }
    catch (e) { /* 無監聽 */ }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

const results = []
for (const f of E2E_FILES) {
    killPort(BACKEND_PORT)
    await sleep(2000)
    console.log(`\n=== [run-e2e-isolated] 執行 ${f}（全新後端）===`)
    const r = spawnSync('npx', ['mocha', join('test', f), '--reporter', 'list', '--timeout', '300000'], {
        cwd: projRoot, stdio: 'inherit', shell: isWin,
    })
    results.push({ file: f, code: r.status })
}

killPort(BACKEND_PORT)

console.log('\n=== [run-e2e-isolated] 逐檔結果 ===')
let failed = 0
for (const { file, code } of results) {
    console.log(`  ${code === 0 ? '✔' : '✘'} ${file} (exit ${code})`)
    if (code !== 0) { failed++ }
}
console.log(`\n${failed === 0 ? '✔ e2e 全部通過' : `✘ ${failed} 個 e2e 檔失敗`}`)
process.exit(failed === 0 ? 0 : 1)
