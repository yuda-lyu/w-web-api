//golden expected 產生器 (api): 以「改造前實作」(./legacy/staEvent.mjs, ADR-028 之前之原碼) 於假時鐘產 expected.json
//  node --import ./test/staLogs-golden/fakeDate.mjs test/staLogs-golden/gen-expected.mjs expected
//FIXED now = 1788150896789 = 2026-08-31 12:34:56.789 (+08:00); tStart(7d) = 2026-08-24 12:34:56.789
//fixture (test/staLogs-golden/logs/, 173 檔) 為已凍結資產: 原確定性產生器 (seeded PRNG) 未留存, 擴充邊界案例時另寫新檔加入 logs/ 並重產 expected,
//  不要動既有 173 檔 (expected 永遠由 legacy 產出, 不得手改)。
import './setTz.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ot from 'dayjs'

let mode = process.argv[2] || 'expected'
let fdRoot = path.dirname(fileURLToPath(import.meta.url)) //產物落在本目錄 (fixture 資產, 非使用者工作路徑輸出)
let fdLog = path.join(fdRoot, 'logs')

let FIXED = 1788150896789

async function genExpected() {
    if (Date.now() !== FIXED) {
        throw new Error('expected 須於假時鐘下產出: node --import ./test/staLogs-golden/fakeDate.mjs test/staLogs-golden/gen-expected.mjs expected')
    }
    let staEvent = (await import('./legacy/staEvent.mjs')).default
    console.log('now(fake)', Date.now(), ot().format())
    let hr = await staEvent(7, 'hr', { fdLog })
    let day = await staEvent(7, 'day', { fdLog })
    let fp = path.join(fdRoot, 'expected.json')
    fs.writeFileSync(fp, JSON.stringify({ hr, day }, null, 2))
    console.log('expected done', fp, { hr: hr.length, day: day.length })
}

if (mode === 'expected') {
    await genExpected()
}
else if (mode === 'fixture') {
    throw new Error('fixture 已凍結為資產 (logs/ 173 檔), 本專案無確定性產生器; 擴充請另寫新檔加入 logs/ 後重產 expected')
}
else {
    throw new Error(`invalid mode[${mode}], use expected`)
}
