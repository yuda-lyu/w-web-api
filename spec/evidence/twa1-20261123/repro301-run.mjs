//第 301 項最小重現(父行程): 逐候選以逾時保護之子行程(test/tools/timeLengthChild.mjs)跑各層入口; 逾時視為同步無窮迴圈或過慢
//用法: node spec/evidence/twa1-20261123/repro301-run.mjs [根目錄=專案根] [逾時ms=6000] [輸出 jsonl 路徑]
//  根目錄可指向修前碼之鏡像根(其下須有 server/、src/、test/tools/timeLengthChild.mjs), 以重現修前行為; 輸出為每行一筆 JSON(候選名、各層結果或 hang)
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

let root = path.resolve(process.argv[2] || '.')
let timeout = Number(process.argv[3] || 6000)
let child = path.join(root, 'test', 'tools', 'timeLengthChild.mjs')
let fdLog = path.join(root, 'test', '_tmp', 'repro301-logs')
fs.mkdirSync(fdLog, { recursive: true })

//候選名取自子行程之清單(同一份, 不另抄一份)
let src = fs.readFileSync(child, 'utf8')
let names = [...src.matchAll(/^\s*'((?:v|x)-[^']+)':/gm)].map((m) => m[1])
let nowNames = [...src.matchAll(/^\s*'(now-[^']+)':/gm)].map((m) => m[1])

let fpOut = process.argv[4] ? path.resolve(process.argv[4]) : null //選填: 同時寫出 jsonl 證據檔
let lines = []
for (let n of [...names, ...nowNames]) {
    let r = spawnSync(process.execPath, [child, n, fdLog], { timeout, windowsHide: true, encoding: 'utf8', killSignal: 'SIGKILL', cwd: root })
    let o = null
    if (r.error && r.error.code === 'ETIMEDOUT') {
        let done = String(r.stdout || '').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
        o = { name: n, hang: true, layersDone: done.map((d) => d.layer), note: `timeout ${timeout}ms (同步無窮迴圈或過慢)` }
    }
    else {
        let layers = String(r.stdout || '').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
        o = { name: n, hang: false, layers: layers.map((d) => `${d.layer}:${d.kind}:${d.v}`) }
    }
    lines.push(JSON.stringify(o))
    console.log(lines[lines.length - 1])
}
fs.rmSync(fdLog, { recursive: true, force: true })
if (fpOut) {
    fs.mkdirSync(path.dirname(fpOut), { recursive: true })
    fs.writeFileSync(fpOut, lines.join('\n') + '\n', 'utf8')
}
