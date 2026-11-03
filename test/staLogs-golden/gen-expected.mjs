//golden expected 產生器 (api): 以「改造前實作」(./legacy/staEvent.mjs, ADR-028 之前之原碼) 於假時鐘產 expected.json
//  node --import ./test/staLogs-golden/fakeDate.mjs test/staLogs-golden/gen-expected.mjs expected
//FIXED now = 1788150896789 = 2026-08-31 12:34:56.789 (+08:00); tStart(7d) = 2026-08-24 12:34:56.789
//fixture (test/staLogs-golden/logs/, 173 檔) 為已凍結資產: 原確定性產生器 (seeded PRNG) 未留存, 擴充邊界案例時另寫新檔加入 logs/ 並重產 expected,
//  不要動既有 173 檔 (expected 永遠由 legacy 產出, 不得手改)。
//
//【R-STA-FUTURE-01 (ADR-058, 2026-11-03, Gitea #58) 之刻意差異】legacy 之輸出無上界, 會含晚於「現在所屬桶」之未來時間桶 (fixture 之 future-1d 事件即為此)。
//  現行規則 (staLogsCore.buildOutput) 不輸出該等桶, 故 expected 自 legacy 輸出剔除之 (dropFuture, 依假時鐘「現在」之桶標籤, 以時間值外之獨立算法 ot(FIXED).format 取得);
//  legacy 檔本身不動 (仍是未剔除前之真理來源), 其餘各列與 legacy 輸出逐筆相同 (剔除之列數與內容於產出時印出, 並須恰為 fixture 內預期之未來桶)。
import './setTz.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ot from 'dayjs'

let mode = process.argv[2] || 'expected'
let fdRoot = path.dirname(fileURLToPath(import.meta.url)) //產物落在本目錄 (fixture 資產, 非使用者工作路徑輸出)
let fdLog = path.join(fdRoot, 'logs')

let FIXED = 1788150896789

//剔除晚於「現在所屬桶」之未來桶 (標籤定寬, 字典序即時間序); 回傳 { kept, dropped }
function dropFuture(rs, fmt) {
    let labelEnd = ot(FIXED).format(fmt)
    return {
        kept: rs.filter((v) => v.time <= labelEnd),
        dropped: rs.filter((v) => v.time > labelEnd),
    }
}

async function genExpected() {
    if (Date.now() !== FIXED) {
        throw new Error('expected 須於假時鐘下產出: node --import ./test/staLogs-golden/fakeDate.mjs test/staLogs-golden/gen-expected.mjs expected')
    }
    let staEvent = (await import('./legacy/staEvent.mjs')).default
    console.log('now(fake)', Date.now(), ot().format())
    let hrLegacy = await staEvent(7, 'hr', { fdLog })
    let dayLegacy = await staEvent(7, 'day', { fdLog })
    let { kept: hr, dropped: hrDropped } = dropFuture(hrLegacy, 'YYYY-MM-DDTHH')
    let { kept: day, dropped: dayDropped } = dropFuture(dayLegacy, 'YYYY-MM-DD')
    console.log('dropped future buckets (R-STA-FUTURE-01)', JSON.stringify({ hr: hrDropped, day: dayDropped }))
    let fp = path.join(fdRoot, 'expected.json')
    fs.writeFileSync(fp, JSON.stringify({ hr, day }, null, 2))
    console.log('expected done', fp, { hr: hr.length, day: day.length, hrLegacy: hrLegacy.length, dayLegacy: dayLegacy.length })
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
