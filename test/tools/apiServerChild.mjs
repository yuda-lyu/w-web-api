//apiServerChild: 隔離之 WWebApi 子行程(供 api-concurrency／api-import 等整合測試用; 不帶 .test. 中綴、放 test/tools/)。
//由 apiHarness.mjs 以 child_process.fork 啟動, cwd 為 test/_tmp/<name>/(資料庫、log、tableTags 皆落於此, 測完由 harness 刪除),
//不碰專案 ./db、11005 與 dist。以 IPC 接收控制訊息: 設定 ORM 人為延遲、取操作記錄、停止。
//SlowOrm 包裝 WOrm(依賴注入之接縫, 不改 src): 可對 select／save／del／insert／delAll 加人為延遲, 並記錄各操作之起訖時間與目標,
//供測試以人為延遲驗證「比對與寫入間插不進他人寫入」(多人同時編輯規格 V14、外部匯入 I11)。
//argv: [port, dbName, optJson?]（optJson 為額外之 WWebApi opt, 如 {"lockExternalRows":"n"}; 未給＝預設）
import path from 'path'
import { pathToFileURL } from 'url'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'

//被測後端模組: 預設為本 repo 之 server/WWebApi.mjs; 環境變數 API_SERVER_MODULE 可指向另一份副本（供「修前紅」對 HEAD 版後端、變異測試對變異副本重跑同一批測試，副本放 ./tmp/，不動 repo 之 server/）
let urlServer = process.env.API_SERVER_MODULE ? pathToFileURL(path.resolve(process.env.API_SERVER_MODULE)).href : new URL('../../server/WWebApi.mjs', import.meta.url).href
let { default: WWebApi } = await import(urlServer)


let port = parseInt(process.argv[2], 10)
let dbName = process.argv[3] || 'apitest'
let optExtra = process.argv[4] ? JSON.parse(process.argv[4]) : {}

let delays = { select: 0, save: 0, del: 0, insert: 0, delAll: 0 }
//fails: 人為注入失敗——fails[op] 為剩餘次數, 該操作被呼叫時先扣一次並 reject（寫入中途失敗: 外部匯入 I12）
let fails = {}
//failItems: 人為注入「逐筆 ok:0 但不 reject」(R18)——failItems[op] = { n: 剩餘次數, index: 失敗之筆序 }; 該筆不寫入、其餘筆照常寫入（部分寫入情境）, 回傳該 ORM 契約之結果形狀但該筆 ok 為 0
let failItems = {}
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

//runFailItem: 第 k 筆不寫入、其餘筆交真 ORM 寫入, 回傳形狀同 w-orm-lmdb——save／del 為逐筆陣列（第 k 筆 ok:0 附 err）, insert 為聚合物件 { n, nInserted, ok:0, err }
let runFailItem = async (orig, m, args, k) => {
    let a = args[0]
    let rows = Array.isArray(a) ? a : [a]
    let rest = rows.filter((v, i) => i !== k)
    let r = rest.length > 0 ? await orig(rest, ...args.slice(1)) : []
    let err = `INJECTED-ITEM-FAIL ${m}`
    if (m === 'insert') {
        return { n: rows.length, nInserted: rest.length, ok: 0, err }
    }
    let out = Array.isArray(r) ? r.slice() : []
    out.splice(k, 0, m === 'save' ? { n: 1, nInserted: 0, nModified: 0, ok: 0, err } : { n: 1, nDeleted: 0, ok: 0, err })
    return out
}

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
                if (failItems[m] && failItems[m].n > 0) {
                    //index 為數字（每次同一筆序）或陣列（第 i 次被注入之呼叫用 index[i]）
                    let fi = failItems[m]
                    let k = Array.isArray(fi.index) ? fi.index[fi.used || 0] : fi.index
                    fi.used = (fi.used || 0) + 1
                    fi.n--
                    rec.inj = 'item' //操作記錄標示本次為逐筆 ok:0 注入（測試據此證明注入確實命中, 非空轉）
                    return await runFailItem(orig, m, args, k || 0)
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
//api-connGate 用之部署方授權情境(除標明者外皆 isAdmin 'y', 使「拒絕」只能出自 verifyClientUser 而非 isAdmin 欄位):
//tokDenied(verifyClientUser 回 false)、tokVThrow(拋錯)、tokVReject(reject)、tokVFalsy(回 undefined)、tokVTruthy(回 1, 非 true 之 truthy)、
//tokOnlyMain(只在入口 'main' 放行, 驗 from 為入口名)、tokNonAdmin(isAdmin 'n' 但資料通道之鉤子放行: 1.1.17 起套件自行限系統管理員, 仍被拒; 其 verifyAppUser 回 false)、tokNoEmail(使用者欄位不齊: 認證即失敗, 不呼叫鉤子)
let users = {
    sys: { id: 'id-for-admin', name: 'admin', email: 'admin@example.com', isAdmin: 'y' },
    tokA: { id: 'id-for-adminA', name: 'adminA', email: 'a@example.com', isAdmin: 'y' },
    tokB: { id: 'id-for-adminB', name: 'adminB', email: 'b@example.com', isAdmin: 'y' },
    tokApp: { id: 'id-for-app', name: 'app', email: 'app@example.com', isAdmin: 'y' },
    tokDenied: { id: 'id-denied', name: 'denied', email: 'denied@example.com', isAdmin: 'y' },
    tokVThrow: { id: 'id-vthrow', name: 'vthrow', email: 'vthrow@example.com', isAdmin: 'y' },
    tokVReject: { id: 'id-vreject', name: 'vreject', email: 'vreject@example.com', isAdmin: 'y' },
    tokVFalsy: { id: 'id-vfalsy', name: 'vfalsy', email: 'vfalsy@example.com', isAdmin: 'y' },
    tokOnlyMain: { id: 'id-onlymain', name: 'onlymain', email: 'onlymain@example.com', isAdmin: 'y' },
    tokVTruthy: { id: 'id-vtruthy', name: 'vtruthy', email: 'vtruthy@example.com', isAdmin: 'y' },
    tokNonAdmin: { id: 'id-nonadmin', name: 'nonadmin', email: 'nonadmin@example.com', isAdmin: 'n' },
    tokNoEmail: { id: 'id-noemail', name: 'noemail', isAdmin: 'y' },
    //api-run02(api-execIdentity／api-connGate): 認證階段之欄位檢查各缺一格、鉤子之其他 falsy 結果與非同步結果、鉤子改寫傳入物件
    tokNoName: { id: 'id-noname', email: 'noname@example.com', isAdmin: 'y' },
    tokBadRole: { id: 'id-badrole', name: 'badrole', email: 'badrole@example.com', isAdmin: 'maybe' },
    tokNoId: { name: 'noid', email: 'noid@example.com', isAdmin: 'y' },
    tokVNull: { id: 'id-vnull', name: 'vnull', email: 'vnull@example.com', isAdmin: 'y' },
    tokVZero: { id: 'id-vzero', name: 'vzero', email: 'vzero@example.com', isAdmin: 'y' },
    tokVEmptyStr: { id: 'id-vemptystr', name: 'vemptystr', email: 'vemptystr@example.com', isAdmin: 'y' },
    tokVAsyncFalse: { id: 'id-vasyncfalse', name: 'vasyncfalse', email: 'vasyncfalse@example.com', isAdmin: 'y' },
    tokMutate: { id: 'id-mutate', name: 'mutate', email: 'mutate@example.com', isAdmin: 'y' },
    //api-run01(api-adminOnly／api-publicApisList, R-ADMINONLY-01): tokNonAdmin 為一般使用者(isAdmin 'n')且鉤子放行(套件須自行拒絕); tokMutateAdmin 為一般使用者且鉤子把傳入物件改寫為 isAdmin 'y' 再放行(角色判斷須取 getUserByToken 所回之原值);
    //tokNonAdminDenied 為一般使用者且鉤子拒絕(部署方可再收緊: 一般使用者取 API 清單被鉤子拒)
    tokMutateAdmin: { id: 'id-mutateadmin', name: 'mutateadmin', email: 'mutateadmin@example.com', isAdmin: 'n' },
    tokNonAdminDenied: { id: 'id-nonadmindenied', name: 'nonadmindenied', email: 'nonadmindenied@example.com', isAdmin: 'n' },
    //應用入口(POST /syncAndReplaceTabs, verifyAppUser): 1.1.18 起套件自行要求管理員等級與欄位齊備(A-1)——tokAppNonAdmin 為 isAdmin 'n' 且 verifyAppUser 放行(仍被拒 errUserNotAdmin); tokAppMinimal 只有 id(欄位檢查不過, errUserEmailMissing)
    tokAppNonAdmin: { id: 'id-appnonadmin', name: 'appnonadmin', email: 'appnonadmin@example.com', isAdmin: 'n' },
    tokAppMinimal: { id: 'id-appminimal' },
}

//api-run01(存取矩陣 api-accessMatrix, 任務 20261024182736, 排程第 133 項): dspec w-web存取管控表 §3.2 之呼叫者類。
//部署方鉤子(verifyClientUser／verifyAppUser)對 id 以 'id-mx-' 或 'app:' 起頭者一律放行, 使「被拒」只能出自套件自己的等級檢查;
//反查回傳形狀比照 w-web-sso 第 130 項: 使用者 token＝該使用者實際資料、isApp 'n'; 應用系統 token 使用者用途＝所綁使用者實際資料、isApp 'y'; 系統服務用途＝id 'app:<金鑰主鍵>'、isApp 'y'、isAdmin 'y'、name 為金鑰名稱、其餘為佔位字串。
//MX_EXTRA 為部署方使用者物件上「不得出現在後台登入檢查回應」之多餘欄位(哨兵值前綴 SECRET-MX-, 便於全文掃描)
let MX_EXTRA = {
    account: 'SECRET-MX-ACCOUNT',
    password: 'SECRET-MX-PASSWORD',
    tokenVerify: 'SECRET-MX-TOKENVERIFY',
    description: 'SECRET-MX-DESCRIPTION',
    timeExpired: 'SECRET-MX-TIMEEXPIRED',
    isActive: 'y',
}
Object.assign(users, {
    tokMxU: { id: 'id-mx-u', name: 'mx-u', email: 'mx-u@example.com', isAdmin: 'n', isApp: 'n', ...MX_EXTRA }, //U: 使用者 token・一般使用者
    tokMxA: { id: 'id-mx-a', name: 'mx-a', email: 'mx-a@example.com', isAdmin: 'y', isApp: 'n', ...MX_EXTRA }, //A: 使用者 token・系統管理員
    tokMxAuU: { id: 'id-mx-au-u', name: 'mx-au-u', email: 'mx-au-u@example.com', isAdmin: 'n', isApp: 'y', ...MX_EXTRA }, //AU: 應用系統 token・使用者用途, 綁一般使用者
    tokMxAuA: { id: 'id-mx-au-a', name: 'mx-au-a', email: 'mx-au-a@example.com', isAdmin: 'y', isApp: 'y', ...MX_EXTRA }, //AU: 應用系統 token・使用者用途, 綁系統管理員
    tokMxAs: { id: 'app:key-mx-001', name: 'mx-as-key', email: 'placeholder@app.invalid', isAdmin: 'y', isApp: 'y', ...MX_EXTRA }, //AS: 應用系統 token・系統服務用途(不綁使用者)
    //一般使用者, 部署方鉤子(兩支)把傳入物件改寫為 isAdmin 'y' 再放行: 套件須以 getUserByToken 所回之原值判斷等級
    tokMxMutate: { id: 'id-mx-mutate', name: 'mx-mutate', email: 'mx-mutate@example.com', isAdmin: 'n', isApp: 'n', ...MX_EXTRA },
    //欄位檢查(與瀏覽端同一規則): isAdmin 值域只限 'y'／'n', 大寫 'Y' 不是管理員也不是合法值; 缺 isAdmin 欄亦不合法
    tokMxRoleY: { id: 'id-mx-roley', name: 'mx-roley', email: 'mx-roley@example.com', isAdmin: 'Y', isApp: 'y', ...MX_EXTRA },
    tokMxNoRole: { id: 'id-mx-norole', name: 'mx-norole', email: 'mx-norole@example.com', isApp: 'y', ...MX_EXTRA },
    //同一使用者(id 與 tokMxA 相同)之另一把 token(如使用者 token 與綁定同一使用者之應用系統 token): 驗輪詢 clientId 綁的是 userId 而非 token(api-sysFuncs)
    tokMxASame: { id: 'id-mx-a', name: 'mx-a', email: 'mx-a@example.com', isAdmin: 'y', isApp: 'y', ...MX_EXTRA },
    //管理員, 部署方鉤子拒絕(部署方可再收緊)
    tokMxDenied: { id: 'id-mx-denied', name: 'mx-denied', email: 'mx-denied@example.com', isAdmin: 'y', isApp: 'n', ...MX_EXTRA },
})
let isMxId = (id) => typeof id === 'string' && (id.startsWith('id-mx-') || id.startsWith('app:'))

//mkGetterUser: 部署方使用者物件含「拋錯之取值器」(getter)——prop 為額外欄位('trap')或必要欄位('email'); 套件須固定鍵拒絕且不外洩例外原文(外審 sol #7)
let GETTER_SECRET = 'SYNTH-GETTER-SECRET-FOR-TEST'
let mkGetterUser = (id, prop) => {
    let u = { id, name: 'mx-getter', email: 'mx-getter@example.com', isAdmin: 'y', isApp: 'y' }
    Object.defineProperty(u, prop, {
        enumerable: true,
        configurable: true,
        get() {
            throw new Error(GETTER_SECRET)
        },
    })
    return u
}

//tokMxExpired: 上游(如 w-web-sso)對逾期或不可用之 token 以 reject 回應; 套件須視同查無(errUserNotFound)
let getUserByToken = async (token) => {
    if (token === 'tokMxExpired') {
        return Promise.reject(new Error('SYNTH-EXPIRED-FOR-TEST'))
    }
    if (token === 'tokMxGetterExtra') {
        return mkGetterUser('id-mx-getter-x', 'trap')
    }
    if (token === 'tokMxGetterReq') {
        return mkGetterUser('id-mx-getter-r', 'email')
    }
    return users[token] ? { ...users[token] } : {}
}

//verifyAppCalls: verifyAppUser 之呼叫記錄({ userId, from, isApp }), 供測試證明「部署方鉤子照舊被呼叫(欄位不齊者不呼叫)、from 為入口名」; IPC 'verifyAppCalls' 取出
let verifyAppCalls = []
let verify = (user, from) => {
    verifyAppCalls.push({ userId: user.id, from, isApp: user.isApp })
    if (user.id === 'id-mx-denied') {
        return false
    }
    if (user.id === 'id-mx-mutate') {
        user.isAdmin = 'y' //部署方鉤子改寫傳入之物件(企圖把一般使用者升為管理員): 套件須以 getUserByToken 所回之原值判斷等級
        return true
    }
    if (isMxId(user.id)) {
        return true
    }
    return user.isAdmin === 'y' || user.id === 'id-appnonadmin' || user.id === 'id-appminimal'
}

//verifyCalls: verifyClientUser 之呼叫記錄({ userId, from }), 供測試證明「連線閘確實呼叫部署方之授權鉤子、且 from 為入口名」; IPC 'verifyCalls' 取出
let verifyCalls = []
let verifyClient = (user, from) => {
    verifyCalls.push({ userId: user.id, from })
    if (user.id === 'id-denied' || user.id === 'id-mx-denied') {
        return false
    }
    if (user.id === 'id-mx-mutate') {
        user.isAdmin = 'y' //同 verifyAppUser 之改寫情境
        return true
    }
    if (isMxId(user.id)) {
        return true //存取矩陣之呼叫者類: 部署方一律放行, 被拒只能出自套件自己的等級檢查
    }
    if (user.id === 'id-vthrow') {
        throw new Error('SYNTH-VERIFY-SECRET-FOR-TEST')
    }
    if (user.id === 'id-vreject') {
        return Promise.reject('SYNTH-VERIFY-SECRET-FOR-TEST')
    }
    if (user.id === 'id-vfalsy') {
        return undefined
    }
    if (user.id === 'id-onlymain') {
        return from === 'main'
    }
    if (user.id === 'id-vtruthy') {
        return 1
    }
    if (user.id === 'id-nonadmin') {
        return true
    }
    if (user.id === 'id-mutateadmin') {
        user.isAdmin = 'y' //部署方鉤子改寫傳入之物件(企圖把一般使用者升為管理員): 套件須以 getUserByToken 所回之原值判斷角色
        return true
    }
    if (user.id === 'id-nonadmindenied') {
        return false
    }
    if (user.id === 'id-vnull') {
        return null
    }
    if (user.id === 'id-vzero') {
        return 0
    }
    if (user.id === 'id-vemptystr') {
        return ''
    }
    if (user.id === 'id-vasyncfalse') {
        return Promise.resolve(false)
    }
    if (user.id === 'id-mutate') {
        user.id = '' //部署方鉤子改寫傳入之物件(驗執行身分取自驗證前之快照, 不受鉤子改寫影響)
        return true
    }
    return user.isAdmin === 'y'
}

let inst = WWebApi(SlowOrm, path.resolve('./db'), dbName, getUserByToken, verifyClient, verify, { serverPort: port, logFd: path.resolve('./logs'), ...optExtra })
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
    else if (msg.cmd === 'failItems') {
        failItems = JSON.parse(JSON.stringify(msg.value || {}))
        process.send({ id: msg.id, ok: true })
    }
    else if (msg.cmd === 'wipe') {
        let wo = (instances[msg.table] || [])[0]
        if (wo) {
            await wo.delAll()
        }
        process.send({ id: msg.id, ok: true })
    }
    else if (msg.cmd === 'seed') {
        //seed: 直接寫入列（測試鷹架: 模擬升版前既有資料, 如舊同步寫入而無 srcKey 欄之列; 不經 kpFunExt、表鎖與 procOrm, 欄位由呼叫端給齊）; 不計入操作記錄
        let wo = (instances[msg.table] || [])[0]
        if (wo) {
            let n0 = ops.length
            await wo.insert(msg.rows)
            ops.length = n0
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
    else if (msg.cmd === 'verifyCalls') {
        let r = verifyCalls.slice()
        if (msg.clear) {
            verifyCalls = []
        }
        process.send({ id: msg.id, ok: true, value: r })
    }
    else if (msg.cmd === 'verifyAppCalls') {
        let r = verifyAppCalls.slice()
        if (msg.clear) {
            verifyAppCalls = []
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
