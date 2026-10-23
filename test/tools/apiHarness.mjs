//apiHarness: 啟動隔離之 WWebApi 子行程(apiServerChild.mjs)供整合測試用, 並提供直打 kpFunExt／POST /syncAndReplaceTabs 之 helper。
//子行程 cwd 為 test/_tmp/<name>/(測試自建、自刪; 不用 ./tmp/), 埠由呼叫端指定(8551–8574 為主控指定之 api 測試埠範圍, 須在測試鎖下執行)。
import fs from 'fs'
import path from 'path'
import get from 'lodash-es/get.js'
import { fork } from 'child_process'
import { fileURLToPath } from 'url'
import { callFun } from './apiMain.mjs'


let fdTools = path.dirname(fileURLToPath(import.meta.url))
let fpChild = path.resolve(fdTools, 'apiServerChild.mjs')


async function startApiServer({ name, port, opt = null }) {

    let cwd = path.resolve(fdTools, '..', '_tmp', name)
    fs.rmSync(cwd, { recursive: true, force: true })
    fs.mkdirSync(cwd, { recursive: true })

    let base = `http://127.0.0.1:${port}`
    let args = [String(port), name.replace(/[^a-zA-Z0-9]/g, '')]
    if (opt !== null) {
        args.push(JSON.stringify(opt)) //額外之 WWebApi opt（如 { lockExternalRows: 'n' }）
    }
    let child = fork(fpChild, args, { cwd, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })

    //ipc: 以 id 對應請求與回應
    let seq = 0
    let waits = new Map()
    let pmReady = new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject(new Error(`api server child not ready: ${name}`)), 60000)
        child.on('message', (msg) => {
            if (msg && msg.ready) {
                clearTimeout(timer)
                resolve()
            }
            else if (msg && waits.has(msg.id)) {
                waits.get(msg.id)(msg)
                waits.delete(msg.id)
            }
        })
        child.on('exit', (code) => {
            clearTimeout(timer)
            reject(new Error(`api server child exited early: ${name} code=${code}`))
        })
    })
    let ipc = (cmd, extra = {}) => new Promise((resolve) => {
        let id = ++seq
        waits.set(id, resolve)
        child.send({ id, cmd, ...extra })
    })

    await pmReady

    //fun: kpFunExt 呼叫(以 token 身分; 與瀏覽器同一條資料通道 /api/main)
    let fun = async (token, func, args = []) => {
        let r = await callFun(base, token, func, args)
        return { ok: r.ok, msg: r.msg }
    }

    //sync: POST /syncAndReplaceTabs(外部應用路徑, 不帶基準); body 可為物件(JSON)
    let sync = async (token, body, keyTable = 'apis') => {
        let res = await fetch(`${base}/syncAndReplaceTabs?token=${token}&keyTable=${keyTable}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(body),
        })
        let j = await res.json()
        return { http: res.status, state: get(j, 'state'), msg: get(j, 'msg') }
    }

    //list: getApisList(伺服端新鮮讀取經 procOrm select)
    let list = async (token = 'sys') => {
        let r = await fun(token, 'getApisList')
        return r.msg
    }

    //wipe: 直接清空某表（測試清理用; 不經 kpFunExt、表鎖與外部列保護——外部列不可由 deleteApi 刪除）
    let wipe = async (table = 'apis') => {
        await ipc('wipe', { table })
    }

    //seed: 直接寫入列（測試鷹架: 模擬升版前既有之資料, 如舊同步寫入而無 srcKey 欄之列; 不經 kpFunExt、表鎖與 procOrm, 列由呼叫端給齊, 見 mkLegacyRow）
    let seed = async (rows, table = 'apis') => {
        await ipc('seed', { table, rows })
    }

    let setDelays = async (value) => {
        await ipc('delays', { value })
    }
    let setFails = async (value) => {
        await ipc('fails', { value })
    }
    //setFailItems: 注入逐筆 ok:0（不 reject）, value 如 { save: { n: 1, index: 0 } }, 見 apiServerChild 之 runFailItem
    let setFailItems = async (value) => {
        await ipc('failItems', { value })
    }
    let getOps = async (clear = false) => {
        let r = await ipc('ops', { clear })
        return r.value
    }
    //getVerifyCalls: 部署方 verifyClientUser 之呼叫記錄 [{ userId, from }]（clear=true 取後清空）
    let getVerifyCalls = async (clear = false) => {
        let r = await ipc('verifyCalls', { clear })
        return r.value
    }
    let now = async () => {
        let r = await ipc('now')
        return r.value
    }

    let stop = async () => {
        await ipc('stop').catch(() => {})
        await new Promise((resolve) => {
            if (child.exitCode !== null) {
                return resolve()
            }
            child.once('exit', () => resolve())
            setTimeout(() => {
                try {
                    child.kill()
                }
                catch (e) {
                    console.log('apiHarness kill', e && e.message)
                }
                resolve()
            }, 10000).unref()
        })
        fs.rmSync(cwd, { recursive: true, force: true })
    }

    return { base, cwd, fun, sync, list, wipe, seed, setDelays, setFails, setFailItems, getOps, getVerifyCalls, now, stop }
}


let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


//readLogs: 讀子行程本次 srLog（pino JSON 行；落 <cwd>/logs，cwd 為 startApiServer 回傳之 cwd）。各 api 測試共用（原 api-connGate 本地版收斂於此）
function readLogs(cwd) {
    let fd = path.resolve(cwd, 'logs')
    if (!fs.existsSync(fd)) {
        return []
    }
    let lines = []
    for (let fn of fs.readdirSync(fd)) {
        for (let l of fs.readFileSync(path.join(fd, fn), 'utf8').split(/\r?\n/)) {
            if (l.trim() !== '') {
                lines.push(l)
            }
        }
    }
    return lines
}

//waitLogs: 輪詢至 pred(lines) 成立或逾時（pino 經 worker 非同步落檔）；回傳最後讀到之行
async function waitLogs(cwd, pred, ms = 15000) {
    let t0 = Date.now()
    for (;;) {
        let lines = readLogs(cwd)
        if (pred(lines) || Date.now() - t0 > ms) {
            return lines
        }
        await sleep(200)
    }
}


//mkLegacyRow: 升版前既有之列（舊同步寫入或相容期所寫: 無 srcKey 欄; over 可覆寫任一欄, 如 { srcKey: '' } 模擬相容期之無鍵列）, 供 seed 用; 欄位齊全（含本系統擁有欄位之非空值，驗遷移保留）
let mkLegacyRow = (id, group, over = {}) => ({
    id,
    group,
    order: '',
    name: `legacy-${id}`,
    description: `desc-${id}`,
    url: `http://legacy/${id}`,
    method: 'get',
    version: 'v1',
    levels: 'L.1',
    keywords: 'kw',
    state: 'ok',
    creator: 'c',
    dataSource: 'd',
    mdInputParams: '',
    inputExample: '',
    mdOutputParams: '',
    outputExample: '',
    tokens: `tok-${id}`,
    testBaseUrl: '',
    authType: 'bearer',
    authConfigJson: '',
    defaultHeadersJson: '',
    defaultQueryJson: '',
    defaultBodyJson: '',
    contentType: 'text/plain',
    timeCreate: '2026-01-01 00:00:00',
    timeUpdate: '2026-01-01 00:00:00',
    userIdUpdate: 'legacy-user',
    isActive: 'y',
    ...over,
})


export { startApiServer, sleep, mkLegacyRow, readLogs, waitLogs }
