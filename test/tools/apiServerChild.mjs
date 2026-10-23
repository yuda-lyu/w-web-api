//apiServerChild: 隔離之 WWebApi 子行程(供 api-concurrency／api-import 等整合測試用; 不帶 .test. 中綴、放 test/tools/)。
//由 apiHarness.mjs 以 child_process.fork 啟動, cwd 為 test/_tmp/<name>/(資料庫、log、tableTags 皆落於此, 測完由 harness 刪除),
//不碰專案 ./db、11005 與 dist。以 IPC 接收控制訊息: 設定 ORM 人為延遲、取操作記錄、停止。
//SlowOrm 包裝 WOrm(依賴注入之接縫, 不改 src): 可對 select／save／del／insert／delAll 加人為延遲, 並記錄各操作之起訖時間與目標,
//供測試以人為延遲驗證「比對與寫入間插不進他人寫入」(多人同時編輯規格 V14、外部匯入 I11)。
//argv: [port, dbName, optJson?]（optJson 為額外之 WWebApi opt, 如 {"lockExternalRows":"n"}; 未給＝預設）
import path from 'path'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WWebApi from '../../server/WWebApi.mjs'


let port = parseInt(process.argv[2], 10)
let dbName = process.argv[3] || 'apitest'
let optExtra = process.argv[4] ? JSON.parse(process.argv[4]) : {}

let delays = { select: 0, save: 0, del: 0, insert: 0, delAll: 0 }
//fails: 人為注入失敗——fails[op] 為剩餘次數, 該操作被呼叫時先扣一次並 reject（寫入中途失敗: 外部匯入 I12）
let fails = {}
let ops = []
let t00 = Date.now()
let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

//desc: 操作目標之簡述(不含內容值): select／del 取查詢條件、save／insert 取各列 id
let desc = (m, args) => {
    let a = args[0]
    if (m === 'save' || m === 'insert') {
        let rs = Array.isArray(a) ? a : [a]
        return rs.map((v) => (v && v.id) || '').join(',')
    }
    if (m === 'del') {
        let rs = Array.isArray(a) ? a : [a]
        return rs.map((v) => (v && v.id) || '').join(',')
    }
    return JSON.stringify(a === undefined ? {} : a).slice(0, 120)
}

//instances: 各表 ORM 實例（opt.cl 為表名）, 供 IPC 'wipe' 直接清表——測試清理用, 不經 kpFunExt／表鎖（外部列受保護後 deleteApi 不能刪外部列, 清理不可再走 deleteApi）
let instances = {}

function SlowOrm(opt) {
    let wo = new WOrm(opt)
    ;(instances[opt.cl] = instances[opt.cl] || []).push(wo)
    for (let m of ['select', 'save', 'del', 'insert', 'delAll']) {
        let orig = wo[m].bind(wo)
        wo[m] = async (...args) => {
            let rec = { tab: opt.cl, op: m, key: desc(m, args), t0: Date.now() - t00 }
            if (delays[m] > 0) {
                await sleep(delays[m])
            }
            try {
                if (fails[m] > 0) {
                    fails[m]--
                    return Promise.reject(new Error(`INJECTED-FAIL ${m}`))
                }
                return await orig(...args)
            }
            finally {
                rec.t1 = Date.now() - t00
                ops.push(rec)
            }
        }
    }
    return wo
}

//使用者: sys 為開發捷徑; tokA／tokB 為兩位後台管理員; tokApp 為外部應用(app 權杖)之使用者
let users = {
    sys: { id: 'id-for-admin', name: 'admin', email: 'admin@example.com', isAdmin: 'y' },
    tokA: { id: 'id-for-adminA', name: 'adminA', email: 'a@example.com', isAdmin: 'y' },
    tokB: { id: 'id-for-adminB', name: 'adminB', email: 'b@example.com', isAdmin: 'y' },
    tokApp: { id: 'id-for-app', name: 'app', email: 'app@example.com', isAdmin: 'y' },
}
let getUserByToken = async (token) => (users[token] ? { ...users[token] } : {})
let verify = (user) => user.isAdmin === 'y'

let inst = WWebApi(SlowOrm, path.resolve('./db'), dbName, getUserByToken, verify, verify, { serverPort: port, logFd: path.resolve('./logs'), ...optExtra })
inst.on('error', (err) => {
    console.log('[child] error', String(err && err.message ? err.message : err).slice(0, 200))
})
await inst.ready()

process.on('message', async (msg) => {
    if (!msg || typeof msg.cmd !== 'string') {
        return
    }
    if (msg.cmd === 'delays') {
        delays = { select: 0, save: 0, del: 0, insert: 0, delAll: 0, ...msg.value }
        process.send({ id: msg.id, ok: true })
    }
    else if (msg.cmd === 'fails') {
        fails = { ...msg.value }
        process.send({ id: msg.id, ok: true })
    }
    else if (msg.cmd === 'wipe') {
        let wo = (instances[msg.table] || [])[0]
        if (wo) {
            await wo.delAll()
        }
        process.send({ id: msg.id, ok: true })
    }
    else if (msg.cmd === 'ops') {
        let r = ops.slice()
        if (msg.clear) {
            ops = []
        }
        process.send({ id: msg.id, ok: true, value: r })
    }
    else if (msg.cmd === 'now') {
        process.send({ id: msg.id, ok: true, value: Date.now() - t00 })
    }
    else if (msg.cmd === 'stop') {
        await inst.stop()
        process.send({ id: msg.id, ok: true }, () => process.exit(0))
    }
})

process.send({ ready: true })
