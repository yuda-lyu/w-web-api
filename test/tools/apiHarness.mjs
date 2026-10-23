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

    let setDelays = async (value) => {
        await ipc('delays', { value })
    }
    let setFails = async (value) => {
        await ipc('fails', { value })
    }
    let getOps = async (clear = false) => {
        let r = await ipc('ops', { clear })
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

    return { base, cwd, fun, sync, list, wipe, setDelays, setFails, getOps, now, stop }
}


let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


export { startApiServer, sleep }
