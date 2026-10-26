//api-accessMatrix：API 層存取矩陣（入口 × 呼叫者），以 dspec《w-web存取管控表》第三節 3.2 為驗收依據逐格斷言（任務 20261024182736，排程第 133 項 api-run01；缺口 A-1、A-2）。
//目標存取表（C:\opensrcOper\dspec\w-web存取管控表.md §3.2；系統管理者之判準為 token 反查回來之 isAdmin，api 無自有使用者表）：
//- 入口 19 個：靜態檔 1、hapi 路由 3（GET /api/getUserByToken、GET /api/getApisList、POST /syncAndReplaceTabs）、資料通道 /api/main 之 10 個函數（kpFunExt 6、表 apis.select、系統函數 3）、通訊路由 5（ulctr、slc、dwgfn、dwgf、dw）
//- 呼叫者 6 類：無（無 token：缺、空、重複、查無、逾期、非 Bearer 方案）、U（使用者 token・一般使用者）、A（使用者 token・系統管理者）、AU綁一般使用者（應用系統 token・使用者用途，反查回所綁一般使用者、isApp 'y'）、AU綁系統管理者（同，綁系統管理者）、AS（應用系統 token・系統服務用途，反查回 id 'app:<金鑰主鍵>'、isApp 'y'、isAdmin 'y'）
//- 預期（EXPECT，字面值取自 dspec 表，不由實作衍生）：靜態檔六類皆 ✓；GET /api/getApisList 「無」✗、其餘 ✓；其餘 17 個入口「無」✗、U ✗、A ✓、AU 同所綁使用者（綁一般 ✗、綁系統管理者 ✓）、AS ✓
//- 通訊路由 5 條之「✓」只表示**通過連線閘**（dspec 該列原文：未註冊監聽，通過連線閘後亦不受理）：系統管理者等級通過連線閘後回 invalid …（空本體之參數錯誤，不受理）；其餘呼叫者被連線閘 permission denied
//- 共 19 × 6 = 114 格，每格一個 it；「無」格內含多種子變體（各變體皆須被拒）。UI 頁面（dspec §3.1，3 格）由 e2e-init 覆蓋，不在本檔
//- 延伸：資料通道兩個 token（標頭＝連線閘、本體 __sysToken__＝執行身分）交叉；部署方使用者物件含拋錯取值器之 fail-closed；欄位檢查、鉤子照舊、不變語意、srLog 與全 log 無敏感值
//真後端（隔離子行程：獨立 lmdb、埠 8571；部署方 getUserByToken／verifyClientUser／verifyAppUser 由 test/tools/apiServerChild.mjs 提供，對本檔之呼叫者一律放行〔id 以 id-mx- 或 app: 起頭〕，故「被拒」只能出自套件自己的等級檢查）。
//被拒格另斷言：ORM 零操作、庫內不變、代發目標零命中、回應不含 token 與使用者敏感欄位值（SECRET-MX-*）、部署方鉤子之呼叫次數與入口名（鉤子先於等級檢查，部署方只能再收緊）。放行格另斷言成功結果；後台登入檢查之回應欄位須恰為白名單（A-2）。
import assert from 'assert'
import http from 'http'
import get from 'lodash-es/get.js'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { startApiServer, mkLegacyRow, readLogs, waitLogs } from './tools/apiHarness.mjs'
import { callFun } from './tools/apiMain.mjs'


let PORT = 8571
let PORT_ECHO = 8572 //proxyRequest 之代發目標（計命中數）
let PORT_LOG = 8573 //srLog 案專用之子行程
let S = null
let echo = null
let nEcho = 0

//敏感欄位哨兵：第三方憑證（庫內列）與部署方使用者物件上之多餘欄位（apiServerChild 的 MX_EXTRA）；不得出現在任何被拒格或後台登入檢查之回應與 log
let SECRET_ROW = ['SECRET-MX-TOKENS', 'SECRET-MX-AUTHCFG']
let SECRET_USER = ['SECRET-MX-ACCOUNT', 'SECRET-MX-PASSWORD', 'SECRET-MX-TOKENVERIFY', 'SECRET-MX-DESCRIPTION', 'SECRET-MX-TIMEEXPIRED']

//後台登入檢查成功時回應之使用者欄位白名單（A-2；字面值，不 import 實作常數；單一來源實作見 server/pickLoginUser.mjs，由 unit-pickLoginUser 釘住）
let LOGIN_FIELDS = ['email', 'id', 'isAdmin', 'name']

//GET /api/getApisList 公開欄位白名單（R-PUBLICAPIS-01；字面值）
let PUBLIC_FIELDS = ['id', 'order', 'name', 'description', 'url', 'method', 'version', 'group', 'levels', 'keywords', 'state', 'creator', 'dataSource', 'mdInputParams', 'inputExample', 'mdOutputParams', 'outputExample']

//呼叫者 6 類（順序與 EXPECT 每列一致）
let CALLERS = [
    { cls: '無', none: true },
    { cls: 'U', tok: 'tokMxU', userId: 'id-mx-u', isApp: 'n' },
    { cls: 'A', tok: 'tokMxA', userId: 'id-mx-a', isApp: 'n' },
    { cls: 'AU綁一般使用者', tok: 'tokMxAuU', userId: 'id-mx-au-u', isApp: 'y' },
    { cls: 'AU綁系統管理者', tok: 'tokMxAuA', userId: 'id-mx-au-a', isApp: 'y' },
    { cls: 'AS', tok: 'tokMxAs', userId: 'app:key-mx-001', isApp: 'y' },
]

//存取表 §3.2（1＝✓放行、0＝✗拒絕；欄序＝CALLERS）。字面值，取自 dspec，不由實作衍生
let ALL = [1, 1, 1, 1, 1, 1] //靜態檔：公開
let ANY_USER = [0, 1, 1, 1, 1, 1] //GET /api/getApisList：有效 token 之任何使用者（一般使用者與系統管理者）
let ADMIN = [0, 0, 1, 0, 1, 1] //其餘 17 個入口：系統管理者等級（A、AU綁系統管理者、AS）
let EXPECT = {
    '靜態檔 /{file*}': ALL,
    'GET /api/getUserByToken': ADMIN,
    'GET /api/getApisList': ANY_USER,
    'POST /syncAndReplaceTabs': ADMIN,
    'main: getWebInfor': ADMIN,
    'main: getApisList（整列含憑證）': ADMIN,
    'main: saveApi': ADMIN,
    'main: deleteApi': ADMIN,
    'main: proxyRequest': ADMIN,
    'main: getStaEvent': ADMIN,
    'main: apis.select': ADMIN,
    'main: [sys:getFuncList]': ADMIN,
    'main: [sys:getTableTags]': ADMIN,
    'main: [sys:polling]': ADMIN,
    'POST /api/ulctr': ADMIN,
    'POST /api/slc': ADMIN,
    'POST /api/dwgfn': ADMIN,
    'GET /api/dwgf': ADMIN,
    'POST /api/dw': ADMIN,
}

let isDenied = (r) => r.ok === false && r.data && r.data.error === 'permission denied'

let seqPoll = 0 //輪詢之 clientId 序號（每次呼叫不同）

//mx-3 為停用列（isActive 'n'）：公開清單不得含它（R-PUBLICAPIS-01）；整列（資料通道 getApisList）系統管理者等級仍可見
let seedRows = () => [
    mkLegacyRow('mx-1', 'mx-group', { name: 'mx-1', tokens: SECRET_ROW[0], authConfigJson: SECRET_ROW[1] }),
    mkLegacyRow('mx-2', 'mx-group', { name: 'mx-2', tokens: SECRET_ROW[0], authConfigJson: SECRET_ROW[1] }),
    mkLegacyRow('mx-3', 'mx-group', { name: 'mx-3-disabled', tokens: SECRET_ROW[0], authConfigJson: SECRET_ROW[1], isActive: 'n' }),
]

//snapshot：以系統管理者讀取整表（依 id 排序之 JSON），供「庫內不變」比對
let snapshot = async () => JSON.stringify((await S.list('tokMxA')).sort((a, b) => (a.id < b.id ? -1 : 1)))

let noSecret = (text, label) => {
    for (let s of [...SECRET_ROW, ...SECRET_USER]) {
        assert.ok(!text.includes(s), `${label}不得含敏感值「${s}」`)
    }
}

//postAuth：直打資料通道，authorization 為 null 時不帶 Authorization 標頭；f 為 MAIN_FUNCS 之項（func、args()、input）；回 { ok, state, msg, data, raw }（形狀同 callFun，另附 raw）
async function postAuth(authorization, f, bodyToken = '') {
    let headers = { 'Content-Type': 'application/octet-stream' }
    if (authorization !== null) {
        headers['Authorization'] = authorization
    }
    let payload = { func: f.func, input: { ...(typeof f.input === 'function' ? f.input() : (f.input || {})), __sysInputArgs__: f.args(), __sysToken__: bodyToken } }
    let res = await fetch(`${S.base}/api/main`, { method: 'POST', headers, body: Buffer.from(obj2u8arr(payload)) })
    let u8a = new Uint8Array(await res.arrayBuffer())
    let data = u8arr2obj(u8a)
    let state = get(data, 'success.output.state', '')
    return { ok: state === 'success', state, msg: get(data, 'success.output.msg', null), data, raw: Buffer.from(u8a).toString('utf8') }
}

//callMain：以 Bearer 標頭 token 與本體 token（預設同一個）呼叫資料通道之函數 f；回形狀同 postAuth
async function callMain(headerTok, f, bodyTok = headerTok) {
    return await postAuth(`Bearer ${headerTok}`, f, bodyTok)
}

//w-converhp 五條通訊路由（main 即資料通道，另列）：路徑、方法、apiType
let ROUTES = [
    { path: '/api/ulctr', method: 'POST', apiType: 'upload-controller' },
    { path: '/api/slc', method: 'POST', apiType: 'upload-slice' },
    { path: '/api/dwgfn', method: 'POST', apiType: 'download-get-filename' },
    { path: '/api/dwgf', method: 'GET', apiType: 'download-get-file' },
    { path: '/api/dw', method: 'POST', apiType: 'download' },
]

//rawRoute：直打通訊路由（空本體）；token 為 null 表示不帶，authorization 可覆寫標頭（驗非 Bearer 方案），rawQuery 為 GET 路由之原樣 query（驗空字串與重複 token）。回 { status, msg }（msg 取 return-msg 標頭）
async function rawRoute(route, { token = null, authorization = undefined, rawQuery = null } = {}) {
    let url = `${S.base}${route.path}`
    let headers = { 'Content-Type': 'application/octet-stream' }
    if (route.method === 'GET') { //dwgf 之 token 走 query（瀏覽器導覽下載）
        if (rawQuery !== null) {
            url += `?${rawQuery}`
        }
        else if (token !== null) {
            url += `?token=${encodeURIComponent(token)}`
        }
    }
    else if (authorization !== undefined) {
        if (authorization !== null) {
            headers['Authorization'] = authorization
        }
    }
    else if (token !== null) {
        headers['Authorization'] = `Bearer ${token}`
    }
    let res = await fetch(url, { method: route.method, headers, body: route.method === 'GET' ? undefined : Buffer.from('x') })
    await res.arrayBuffer()
    return { status: res.status, msg: res.headers.get('return-msg') }
}

//hapi 路由「無」類子變體：[說明, query 片段, 預期錯誤鍵]。缺、空、重複（解析為陣列）→ errTokenNoPermission；查無、逾期（上游 reject）→ errUserNotFound
let NONE_QUERIES = [
    ['缺 token', '', 'errTokenNoPermission'],
    ['空字串 token', 'token=', 'errTokenNoPermission'],
    ['重複 token（?token=tokMxA&token=tokMxA，解析為陣列，不借用其中任一值）', 'token=tokMxA&token=tokMxA', 'errTokenNoPermission'],
    ['查無 token', 'token=tok-not-exist-mx', 'errUserNotFound'],
    ['逾期 token（部署方 getUserByToken 對其 reject）', 'token=tokMxExpired', 'errUserNotFound'],
]

//資料通道/通訊路由「無」類子變體：[說明, Authorization 標頭值（null＝不帶）]
let NONE_AUTHS = [
    ['缺 Authorization 標頭', null],
    ['Bearer 後無憑證', 'Bearer '],
    ['非 Bearer 方案（Basic tokMxA）', 'Basic tokMxA'],
    ['查無 token', 'Bearer tok-not-exist-mx'],
    ['逾期 token（部署方 getUserByToken 對其 reject）', 'Bearer tokMxExpired'],
]

let getJson = async (url, init) => {
    let res = await fetch(url, init)
    let raw = await res.text()
    return { raw, ...JSON.parse(raw) }
}

let loginCheck = (token) => getJson(`${S.base}/api/getUserByToken?token=${encodeURIComponent(token)}`)

let syncBatch = (key) => ({ group: 'mx-sync', rows: [{ srcKey: `k-${key}`, name: `sync-${key}`, url: `http://t/sync-${key}` }] })
let syncRaw = (q, key) => getJson(`${S.base}/syncAndReplaceTabs?${q}&keyTable=apis`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(syncBatch(key)) })

//assertNoSideEffect：被拒格之共同斷言（ORM 零操作、庫內不變、代發零命中）
let assertNoSideEffect = async (before, label) => {
    assert.deepStrictEqual(await S.getOps(), [], `${label}：ORM 應零操作（零讀取、零寫入）`)
    assert.strictEqual(await snapshot(), before, `${label}：庫內不變`)
    assert.strictEqual(nEcho, 0, `${label}：代發目標零命中`)
}

//資料通道之 10 個函數（args 為各函數的合法呼叫；放行格之 verify 為成功斷言）
let okSuccess = async (r) => {
    assert.strictEqual(r.state, 'success', JSON.stringify(r.msg))
}
let MAIN_FUNCS = [
    {
        key: 'main: getWebInfor',
        func: 'getWebInfor',
        args: () => [],
        verify: okSuccess,
    },
    {
        key: 'main: getApisList（整列含憑證）',
        func: 'getApisList',
        args: () => [],
        verify: async (r) => {
            assert.strictEqual(r.state, 'success')
            let row = r.msg.find((x) => x.id === 'mx-1')
            assert.strictEqual(row.tokens, SECRET_ROW[0], '系統管理者等級之整列含 tokens（後台編輯所需）')
            assert.strictEqual(row.authConfigJson, SECRET_ROW[1])
        },
    },
    {
        key: 'main: saveApi',
        func: 'saveApi',
        args: () => [{ name: 'mx-write', url: 'http://t/mx-write', method: 'get', levels: 'T', group: 'mx-group' }],
        verify: async (r) => {
            assert.strictEqual(r.state, 'success', JSON.stringify(r.msg))
            assert.ok((await S.list('tokMxA')).some((x) => x.name === 'mx-write'), '新增列已寫入')
        },
    },
    {
        key: 'main: deleteApi',
        func: 'deleteApi',
        args: () => ['mx-2'],
        verify: async (r) => {
            assert.strictEqual(r.state, 'success', JSON.stringify(r.msg))
            assert.ok(!(await S.list('tokMxA')).some((x) => x.id === 'mx-2'), 'mx-2 已刪')
        },
    },
    {
        key: 'main: proxyRequest',
        func: 'proxyRequest',
        args: () => [{ method: 'GET', url: `http://127.0.0.1:${PORT_ECHO}/mx`, headers: [], query: [], timeout: 30000 }],
        verify: async (r) => {
            assert.strictEqual(r.state, 'success', JSON.stringify(r.msg))
            assert.strictEqual(nEcho, 1, '代發目標命中一次')
        },
    },
    {
        key: 'main: getStaEvent',
        func: 'getStaEvent',
        args: () => [7, 'hr'],
        verify: okSuccess,
    },
    {
        key: 'main: apis.select',
        func: 'apis.select',
        args: () => [],
        verify: okSuccess,
    },
    {
        key: 'main: [sys:getFuncList]',
        func: '[sys:getFuncList]',
        args: () => [],
        verify: okSuccess,
    },
    {
        key: 'main: [sys:getTableTags]',
        func: '[sys:getTableTags]',
        args: () => [],
        verify: okSuccess,
    },
    {
        //[sys:polling] 由 w-serv-broadcast 輪詢層於資料通道執行之前處理（w-serv-webdata 1.1.16 起經 verifyPolling 驗證本體 __sysToken__，見 api-sysFuncs）：帶非空 clientId 與有效 token 時回其佇列（空陣列）。
        //clientId 與身分綁定（先到先綁，不同身分重用即被拒），故每次呼叫用不同 clientId（各呼叫者類不共用）
        key: 'main: [sys:polling]',
        func: '[sys:polling]',
        input: () => ({ clientId: `c-mx-polling-${++seqPoll}` }),
        args: () => [],
        verify: async (r) => {
            assert.ok(!isDenied(r), `不得被連線閘拒絕（實得 ${JSON.stringify(r.data).slice(0, 200)}）`)
            assert.deepStrictEqual(get(r.data, 'success.output'), [], `輪詢回應應為其佇列（空陣列）（實得 ${r.raw.slice(0, 200)}）`)
        },
    },
]

//ENTRIES：19 個入口；每個入口提供 none（「無」類全部子變體）、allowed（放行格）、denied（等級不足格）三個斷言函數
let ENTRIES = []

ENTRIES.push({
    key: '靜態檔 /{file*}',
    none: async () => {
        for (let p of ['/mx-probe.js', '/']) {
            let res = await fetch(`${S.base}${p}`)
            let text = await res.text()
            assert.strictEqual(res.status, 200, `${p} 公開：不帶 token 亦 200`)
            assert.ok(text.includes('MX-STATIC-PROBE') || text.includes('MX-INDEX'), `${p} 內容為前端建置檔`)
        }
    },
    allowed: async (c) => {
        for (let p of ['/mx-probe.js', '/']) {
            let res = await fetch(`${S.base}${p}`, { headers: { Authorization: `Bearer ${c.tok}` } })
            let text = await res.text()
            assert.strictEqual(res.status, 200, `${p}：帶 token 亦 200（公開，不檢查 token）`)
            noSecret(text, `${p} 回應`)
        }
    },
    denied: null, //靜態檔六類皆放行
})

ENTRIES.push({
    key: 'GET /api/getUserByToken',
    none: async () => {
        for (let [name, q, key] of NONE_QUERIES) {
            let r = await getJson(`${S.base}/api/getUserByToken?${q}`)
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: key }, name)
        }
        assert.deepStrictEqual(await S.getVerifyCalls(), [], '認證未通過：部署方鉤子零呼叫')
    },
    allowed: async (c) => {
        let r = await loginCheck(c.tok)
        assert.strictEqual(r.state, 'success', JSON.stringify(r))
        //A-2：只回欄位白名單；部署方使用者物件上的 password、tokenVerify、description、isApp… 一律不出現
        assert.deepStrictEqual(Object.keys(r.msg).sort(), LOGIN_FIELDS, `msg 之鍵須恰為白名單（實得 ${Object.keys(r.msg)}）`)
        assert.strictEqual(r.msg.id, c.userId)
        assert.strictEqual(r.msg.isAdmin, 'y')
        noSecret(r.raw, '後台登入檢查回應')
        assert.ok(!r.raw.includes('isApp'), '不回 isApp（前端只用 name、email；等級只看 isAdmin）')
        assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: c.userId, from: 'getUserByToken' }])
    },
    denied: async (c) => {
        let r = await loginCheck(c.tok)
        assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errUserNotAdmin' })
        assert.ok(!r.raw.includes(c.tok) && !r.raw.includes(c.userId) && !r.raw.includes('@example.com'), `回應不得含 token／使用者資料（實得 ${r.raw}）`)
        noSecret(r.raw, '回應')
        assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: c.userId, from: 'getUserByToken' }], '部署方鉤子先於等級檢查被呼叫一次')
    },
})

ENTRIES.push({
    key: 'GET /api/getApisList',
    none: async () => {
        for (let [name, q, key] of NONE_QUERIES) {
            let r = await getJson(`${S.base}/api/getApisList?${q}`)
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: key }, name)
        }
        assert.deepStrictEqual(await S.getVerifyCalls(), [])
        assert.deepStrictEqual(await S.getOps(), [], '不得讀取清單')
    },
    allowed: async (c) => {
        let r = await getJson(`${S.base}/api/getApisList?token=${encodeURIComponent(c.tok)}`)
        assert.strictEqual(r.state, 'success', JSON.stringify(r))
        assert.deepStrictEqual(r.msg.map((x) => x.id).sort(), ['mx-1', 'mx-2'], '啟用中之列；停用列 mx-3（isActive n）不得出現')
        assert.ok(!r.raw.includes('mx-3'), '停用列之任何欄位不得出現於回應')
        for (let row of r.msg) {
            assert.deepStrictEqual(Object.keys(row).sort(), [...PUBLIC_FIELDS].sort(), '每列只含公開欄位')
        }
        noSecret(r.raw, '清單回應')
        assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: c.userId, from: 'getApisList' }])
    },
    denied: null, //有效 token 之任何使用者皆放行
})

ENTRIES.push({
    key: 'POST /syncAndReplaceTabs',
    none: async () => {
        let before = await snapshotBefore()
        for (let [name, q, key] of NONE_QUERIES) {
            let r = await syncRaw(q, 'none')
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: key }, name)
        }
        assert.deepStrictEqual(await S.getVerifyAppCalls(), [], '認證未通過：部署方鉤子零呼叫')
        await assertNoSideEffect(before, '無 token')
    },
    allowed: async (c) => {
        let r = await syncRaw(`token=${encodeURIComponent(c.tok)}`, c.userId)
        assert.deepStrictEqual({ state: r.state, nAdd: get(r, 'msg.nAdd') }, { state: 'success', nAdd: 1 }, JSON.stringify(r))
        let row = (await S.list('tokMxA')).find((x) => x.name === `sync-${c.userId}`)
        assert.ok(row, '匯入列已寫入')
        assert.strictEqual(row.userIdUpdate, c.userId, '稽核欄記錄呼叫者（AS 為 app:<金鑰主鍵>）')
        assert.deepStrictEqual(await S.getVerifyAppCalls(), [{ userId: c.userId, from: 'syncAndReplaceTabs', isApp: c.isApp }], '部署方 verifyAppUser 照舊被呼叫（user, from）；反查之 isApp 隨使用者物件傳入')
    },
    denied: async (c) => {
        let before = await snapshotBefore()
        let r = await syncRaw(`token=${encodeURIComponent(c.tok)}`, c.userId)
        assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errUserNotAdmin' }, JSON.stringify(r))
        noSecret(r.raw, '回應')
        assert.ok(!r.raw.includes(c.tok) && !r.raw.includes(c.userId), '回應不含 token 與使用者 id')
        assert.deepStrictEqual(await S.getVerifyAppCalls(), [{ userId: c.userId, from: 'syncAndReplaceTabs', isApp: c.isApp }], '部署方鉤子先於等級檢查被呼叫一次')
        await assertNoSideEffect(before, c.cls) //零副作用：ORM 零操作（含不得先讀後拒）、庫內不變（匯入列未寫入）
    },
})

for (let f of MAIN_FUNCS) {
    ENTRIES.push({
        key: f.key,
        none: async () => {
            let before = await snapshotBefore()
            for (let [name, auth] of NONE_AUTHS) {
                let r = await postAuth(auth, f)
                assert.ok(isDenied(r), `${name}：應 permission denied（實得 ${r.raw.slice(0, 200)}）`)
                noSecret(r.raw, `${name} 回應`)
            }
            assert.deepStrictEqual(await S.getVerifyCalls(), [], '認證未通過：部署方鉤子零呼叫')
            await assertNoSideEffect(before, '無 token')
        },
        allowed: async (c) => {
            let r = await callMain(c.tok, f)
            assert.ok(!isDenied(r), `${c.cls} 不得被拒（實得 ${JSON.stringify(r.data).slice(0, 200)}）`)
            let calls = await S.getVerifyCalls() //先取鉤子記錄（f.verify 內讀庫會再經資料通道）
            assert.deepStrictEqual(calls, [{ userId: c.userId, from: 'main' }, { userId: c.userId, from: 'main' }], '連線閘（標頭 token）與執行身分（本體 token）各呼叫部署方鉤子一次，皆由 main 入口')
            await f.verify(r)
        },
        denied: async (c) => {
            let before = await snapshotBefore()
            let r = await callMain(c.tok, f)
            assert.ok(isDenied(r), `${c.cls} 應 permission denied（實得 ${JSON.stringify(r.data).slice(0, 200)}）`)
            noSecret(JSON.stringify(r.data), '回應')
            assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: c.userId, from: 'main' }], '部署方鉤子先於等級檢查被呼叫一次（被拒於連線閘，未進執行身分）')
            await assertNoSideEffect(before, c.cls)
        },
    })
}

for (let rt of ROUTES) {
    ENTRIES.push({
        key: `${rt.method} ${rt.path}`,
        gateOnly: true, //「放行」＝通過連線閘；本套件未註冊監聽，通過後亦不受理（dspec 該列原文）
        none: async () => {
            let variants = [['缺 token', {}], ['查無 token', { token: 'tok-not-exist-mx' }], ['逾期 token', { token: 'tokMxExpired' }]]
            if (rt.method === 'POST') {
                variants.push(['非 Bearer 方案（Basic tokMxA）', { authorization: 'Basic tokMxA' }])
                variants.push(['Bearer 後無憑證', { authorization: 'Bearer ' }])
            }
            else { //GET /api/dwgf：token 走 query，補空字串與重複（解析為陣列，不借用其中任一值）
                variants.push(['空字串 token（?token=）', { rawQuery: 'token=' }])
                variants.push(['重複 token（?token=tokMxA&token=tokMxA）', { rawQuery: 'token=tokMxA&token=tokMxA' }])
            }
            for (let [name, opt] of variants) {
                let r = await rawRoute(rt, opt)
                assert.strictEqual(r.msg, 'permission denied', `${name}：實得 status=${r.status} msg=${r.msg}`)
            }
            assert.deepStrictEqual(await S.getVerifyCalls(), [], '認證未通過：部署方鉤子零呼叫')
        },
        allowed: async (c) => {
            let r = await rawRoute(rt, { token: c.tok })
            assert.notStrictEqual(r.msg, 'permission denied', `通過連線閘（實得 status=${r.status} msg=${r.msg}）`)
            assert.ok(/^invalid /.test(String(r.msg)), `通過連線閘後本套件未註冊監聽、不受理（空本體回 invalid …），實得 msg=${r.msg}`)
            assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: c.userId, from: rt.apiType }])
        },
        denied: async (c) => {
            let r = await rawRoute(rt, { token: c.tok })
            assert.strictEqual(r.msg, 'permission denied', `實得 status=${r.status} msg=${r.msg}`)
            assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: c.userId, from: rt.apiType }], '部署方鉤子先於等級檢查被呼叫一次')
        },
    })
}

//snapshotBefore：每個 it 開頭已於 beforeEach 重置庫；被拒格需要「操作前」快照，故於 none/denied 內取（ORM 操作記錄因取快照而非零，取後清空）
async function snapshotBefore() {
    let s = await snapshot()
    await S.getOps(true)
    await S.getVerifyCalls(true)
    return s
}


describe('api-accessMatrix (存取表 §3.2：19 入口 × 6 呼叫者類 = 114 格)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        echo = http.createServer((req, res) => {
            nEcho++
            req.resume()
            res.setHeader('Content-Type', 'text/plain')
            res.end('echo')
        })
        await new Promise((resolve, reject) => {
            echo.once('error', reject)
            echo.listen(PORT_ECHO, '127.0.0.1', resolve)
        })
        //靜態檔：子行程以 cwd 下 dist 供應 /{file*}（index.tmp 由套件啟動時產生 index.html）
        let files = {
            'dist/index.tmp': '<!doctype html><html><body>MX-INDEX {language}</body></html>',
            'dist/mx-probe.js': 'console.log("MX-STATIC-PROBE")',
        }
        //代發目標為本機 echo：放行 127.0.0.1（內建位址政策預設拒絕本機），使「proxyRequest 零命中」確由等級檢查決定
        S = await startApiServer({ name: 'api-accessMatrix', port: PORT, opt: { proxyAllowList: ['127.0.0.1'] }, files })
    })

    after(async function() {
        this.timeout(30000)
        if (S) {
            await S.stop()
        }
        if (echo) {
            await new Promise((resolve) => echo.close(() => resolve()))
        }
    })

    beforeEach(async function() {
        this.timeout(30000)
        await S.wipe('apis')
        await S.seed(seedRows())
        nEcho = 0
        await S.getOps(true)
        await S.getVerifyCalls(true)
        await S.getVerifyAppCalls(true)
    })


    //--------------------------------------------------------------------------
    describe('矩陣自檢：入口全集與格數', function() {

        it('MX00 矩陣 19 入口 × 6 呼叫者類 = 114 格，且每個入口都有 EXPECT 字面值', function() {
            assert.strictEqual(ENTRIES.length, 19)
            assert.strictEqual(CALLERS.length, 6)
            assert.deepStrictEqual(ENTRIES.map((e) => e.key), Object.keys(EXPECT))
            for (let k of Object.keys(EXPECT)) {
                assert.strictEqual(EXPECT[k].length, 6, k)
            }
            let n = ENTRIES.length * CALLERS.length
            assert.strictEqual(n, 114)
        })

        it('MX01 資料通道函數全集：系統管理者取得之 [sys:getFuncList] 所列函數＝矩陣 main 入口之函數集（伺服端新增函數而矩陣未列即紅）', async function() {
            let r = await callFun(S.base, 'tokMxA', '[sys:getFuncList]', [])
            assert.strictEqual(r.state, 'success')
            let list = Array.isArray(r.msg) ? r.msg : Object.keys(r.msg)
            let names = list.map((x) => (typeof x === 'string' ? x : get(x, 'name', get(x, 'func', ''))))
            let inMatrix = MAIN_FUNCS.map((f) => f.func).filter((n) => !n.startsWith('[sys:'))
            for (let n of inMatrix) {
                assert.ok(names.includes(n), `函數清單應含 ${n}（實得 ${JSON.stringify(names)}）`)
            }
            let extra = names.filter((n) => !inMatrix.includes(n) && !n.startsWith('[sys:'))
            assert.deepStrictEqual(extra, [], `函數清單有矩陣未列之函數：${JSON.stringify(extra)}`)
        })

    })


    //--------------------------------------------------------------------------
    for (let e of ENTRIES) {
        describe(`入口：${e.key}`, function() {
            for (let [i, c] of CALLERS.entries()) {
                let ok = EXPECT[e.key][i] === 1
                it(`${c.cls}：${ok ? (e.gateOnly ? '✓ 通過連線閘（本套件未註冊監聽，不受理）' : '✓ 放行') : '✗ 拒絕'}`, async function() {
                    if (c.none) {
                        assert.strictEqual(ok, e.key.startsWith('靜態檔'), '「無」類只有靜態檔放行')
                        await e.none()
                    }
                    else if (ok) {
                        await e.allowed(c)
                    }
                    else {
                        await e.denied(c)
                    }
                })
            }
        })
    }


    //--------------------------------------------------------------------------
    //資料通道兩個 token 交叉（標頭＝連線閘，本體 __sysToken__＝執行身分）：兩道關卡各自須為系統管理者等級（authToken 共用；R-ADMINONLY-01、R-EXECID-01）。
    //新呼叫者類 AU／AS 作為本體 token 亦須依其等級（api-adminOnly／api-execIdentity 只涵蓋 U 與系統管理者）
    describe('資料通道兩個 token 交叉：標頭（連線閘）× 本體 __sysToken__（執行身分）', function() {

        let saveFunc = (tag) => ({
            func: 'saveApi',
            args: () => [{ name: `mx-cross-${tag}`, url: `http://t/mx-cross-${tag}`, method: 'get', levels: 'T', group: 'mx-group' }],
        })
        let ADMIN_TOKS = [['tokMxA', 'id-mx-a'], ['tokMxAuA', 'id-mx-au-a'], ['tokMxAs', 'app:key-mx-001']]
        let LOW_BODIES = [['tokMxU', '一般使用者 U'], ['tokMxAuU', 'AU 綁一般使用者'], ['', '空字串'], ['tok-not-exist-mx', '查無 token'], ['tokMxExpired', '逾期 token（上游 reject）']]

        for (let [hdr, hdrId] of ADMIN_TOKS) {
            for (let [body, bodyId] of ADMIN_TOKS) {
                it(`標頭 ${hdr}（系統管理者等級）× 本體 ${body}（系統管理者等級）→ saveApi 照常；鉤子各被呼叫一次；稽核欄＝本體使用者 ${bodyId}`, async function() {
                    let f = saveFunc(`${hdr}-${body}`)
                    let r = await callMain(hdr, f, body)
                    assert.strictEqual(r.state, 'success', JSON.stringify(r.msg))
                    assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: hdrId, from: 'main' }, { userId: bodyId, from: 'main' }])
                    let row = (await S.list('tokMxA')).find((x) => x.name === `mx-cross-${hdr}-${body}`)
                    assert.ok(row, '新增列已寫入')
                    assert.strictEqual(row.userIdUpdate, bodyId)
                })
            }
        }

        for (let hdr of ['tokMxA', 'tokMxAs']) {
            for (let [body, name] of LOW_BODIES) {
                it(`標頭 ${hdr}（系統管理者等級）× 本體 ${name} → 函數不執行：errUserIdMissing、ORM 零操作、庫內不變、回應無敏感值`, async function() {
                    let before = await snapshotBefore()
                    let r = await callMain(hdr, saveFunc(`low-${hdr}`), body)
                    assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errUserIdMissing' }, r.raw.slice(0, 200))
                    noSecret(r.raw, '回應')
                    await assertNoSideEffect(before, `標頭 ${hdr} × 本體 ${name}`)
                })
            }
        }

        for (let hdr of ['tokMxU', 'tokMxAuU']) {
            it(`標頭 ${hdr}（等級不足）× 本體 tokMxA（系統管理者）→ 連線閘即拒 permission denied；本體不被驗（鉤子只被呼叫一次）；ORM 零操作`, async function() {
                let before = await snapshotBefore()
                let r = await callMain(hdr, saveFunc(`hdr-${hdr}`), 'tokMxA')
                assert.ok(isDenied(r), r.raw.slice(0, 200))
                await assertNoSideEffect(before, `標頭 ${hdr}`)
            })
        }

    })


    //--------------------------------------------------------------------------
    //fail-closed：部署方使用者物件含拋錯之取值器（getter）。額外欄位（交給鉤子前展開拷貝時拋）→ 視同鉤子拒絕 errUserNoPermission；
    //必要欄位（checkUser 讀取時拋）→ 視同查無 errUserNotFound。皆固定鍵；例外原文不得出現於回應與 srLog；部署方鉤子零呼叫（外審 sol #7）
    describe('fail-closed：部署方使用者物件含拋錯取值器', function() {

        let GS = 'SYNTH-GETTER-SECRET-FOR-TEST'
        let GETTER_CASES = [
            ['tokMxGetterExtra', '額外欄位', 'errUserNoPermission'],
            ['tokMxGetterReq', '必要欄位 email', 'errUserNotFound'],
        ]

        for (let [tok, name, key] of GETTER_CASES) {
            it(`${tok}（${name}之取值器拋錯）→ 後台登入檢查、公開清單、匯入皆固定鍵 ${key}；資料通道 permission denied；本體 token → errUserIdMissing；回應無例外原文、該使用者之鉤子零呼叫、ORM 零操作`, async function() {
                let before = await snapshotBefore()
                let rs = [await loginCheck(tok), await getJson(`${S.base}/api/getApisList?token=${tok}`), await syncRaw(`token=${tok}`, `getter-${tok}`)]
                for (let r of rs) {
                    assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: key }, JSON.stringify(r))
                    assert.ok(!r.raw.includes(GS), `回應不得含例外原文（實得 ${r.raw}）`)
                }
                let rGate = await callMain(tok, MAIN_FUNCS[0])
                assert.ok(isDenied(rGate), rGate.raw.slice(0, 200))
                assert.ok(!rGate.raw.includes(GS))
                let rBody = await callMain('tokMxA', MAIN_FUNCS[0], tok)
                assert.deepStrictEqual({ state: rBody.state, msg: rBody.msg }, { state: 'error', msg: 'errUserIdMissing' }, rBody.raw.slice(0, 200))
                assert.ok(!rBody.raw.includes(GS))
                assert.deepStrictEqual(await S.getVerifyCalls(), [{ userId: 'id-mx-a', from: 'main' }], '只有標頭 tokMxA 之連線閘呼叫過鉤子；取值器拋錯之使用者零呼叫')
                assert.deepStrictEqual(await S.getVerifyAppCalls(), [], '匯入：鉤子零呼叫')
                await assertNoSideEffect(before, tok)
            })
        }

    })


    //--------------------------------------------------------------------------
    //A-1：應用系統路由之反查結果須經與瀏覽端相同之欄位檢查（getTokenUser→checkUser）；欄位不齊或 isAdmin 非 'y'／'n' 者與瀏覽端回同一固定鍵，部署方鉤子零呼叫、ORM 零操作
    describe('A-1 欄位檢查：POST /syncAndReplaceTabs 與後台登入檢查（瀏覽端）同一規則、同一錯誤鍵', function() {

        let CASES = [
            ['tokNoEmail', '缺 email', 'errUserEmailMissing'],
            ['tokNoName', '缺 name', 'errUserNameMissing'],
            ['tokNoId', '缺 id', 'errUserIdMissing'],
            ['tokBadRole', 'isAdmin 為 maybe', 'errUserRoleMissing'],
            ['tokMxRoleY', 'isAdmin 為大寫 Y（不是 y，也不是合法值）', 'errUserRoleMissing'],
            ['tokMxNoRole', '缺 isAdmin', 'errUserRoleMissing'],
            ['tokAppMinimal', '虛擬使用者只有 id（缺 email）', 'errUserEmailMissing'],
        ]

        for (let [tok, name, key] of CASES) {
            it(`${tok}（${name}）→ 匯入被拒 ${key}，與後台登入檢查同鍵；部署方 verifyAppUser 零呼叫、ORM 零操作、庫內不變`, async function() {
                let before = await snapshotBefore()
                let r = await syncRaw(`token=${tok}`, `field-${tok}`)
                assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: key }, JSON.stringify(r))
                let rl = await loginCheck(tok)
                assert.strictEqual(rl.msg, key, '瀏覽端（後台登入檢查）同一規則、同一錯誤鍵')
                assert.deepStrictEqual(await S.getOps(), [], 'ORM 零操作')
                assert.deepStrictEqual(await S.getVerifyAppCalls(), [], '欄位檢查在前：部署方鉤子零呼叫')
                noSecret(r.raw, '回應')
                assert.ok(!(await S.list('tokMxA')).some((x) => x.name === `sync-field-${tok}`), '庫內無此匯入列')
                assert.strictEqual(await snapshot(), before)
            })
        }

    })


    //--------------------------------------------------------------------------
    //A-1：部署方 verifyAppUser 照舊（先於等級檢查被呼叫；只能再收緊，不能放寬，也不能靠改寫傳入物件升級）
    describe('A-1 部署方 verifyAppUser 照舊：先被呼叫、只能再收緊', function() {

        it('系統管理者但部署方鉤子拒絕（tokMxDenied）→ errUserNoPermission（不是 errUserNotAdmin）；鉤子恰被呼叫一次；庫內無此列', async function() {
            let before = await snapshotBefore()
            await S.getVerifyAppCalls(true)
            let r = await syncRaw('token=tokMxDenied', 'denied')
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errUserNoPermission' }, JSON.stringify(r))
            assert.deepStrictEqual(await S.getVerifyAppCalls(), [{ userId: 'id-mx-denied', from: 'syncAndReplaceTabs', isApp: 'n' }])
            assert.strictEqual(await snapshot(), before)
        })

        it('一般使用者且部署方鉤子拒絕（tokNonAdmin，isAdmin n，verifyAppUser 回 false）→ errUserNoPermission（鉤子先於等級檢查）', async function() {
            let r = await syncRaw('token=tokNonAdmin', 'nonadmin-denied')
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errUserNoPermission' }, JSON.stringify(r))
        })

        it('一般使用者 tokMxMutate（部署方 verifyAppUser 把傳入物件改寫為 isAdmin y 後回 true）→ 仍 errUserNotAdmin：等級取自 getUserByToken 所回之原值，交給鉤子的是拷貝；鉤子確實被呼叫（改寫確實發生）；庫內無此列', async function() {
            let before = await snapshotBefore()
            await S.getVerifyAppCalls(true)
            let r = await syncRaw('token=tokMxMutate', 'mutate')
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errUserNotAdmin' }, JSON.stringify(r))
            assert.deepStrictEqual(await S.getVerifyAppCalls(), [{ userId: 'id-mx-mutate', from: 'syncAndReplaceTabs', isApp: 'n' }])
            assert.strictEqual(await snapshot(), before)
        })

        it('一般使用者 tokMxMutate（verifyClientUser 亦改寫）→ 後台登入檢查 errUserNotAdmin、資料通道 permission denied（authToken 之同一判準，對照組）', async function() {
            let r = await loginCheck('tokMxMutate')
            assert.deepStrictEqual({ state: r.state, msg: r.msg }, { state: 'error', msg: 'errUserNotAdmin' })
            let r2 = await callFun(S.base, 'tokMxMutate', 'getApisList', [])
            assert.ok(isDenied(r2))
        })

        it('系統服務用途（AS，tokMxAs）匯入成功之稽核欄＝其虛擬身分 id（app:<金鑰主鍵>），不是綁定使用者（系統服務用途不綁使用者）', async function() {
            let r = await syncRaw('token=tokMxAs', 'as-stamp')
            assert.strictEqual(r.state, 'success', JSON.stringify(r))
            let row = (await S.list('tokMxA')).find((x) => x.name === 'sync-as-stamp')
            assert.strictEqual(row.userIdUpdate, 'app:key-mx-001')
        })

    })


    //--------------------------------------------------------------------------
    //應用系統路由之 keyTable 與 srcKey 同步語意不變（不得改變）：系統管理者等級放行後仍受 keyTable 白名單與整批驗證約束
    describe('不變：系統管理者等級放行後之匯入語意（keyTable 白名單、srcKey 必填、不得送 id）', function() {

        it('keyTable 非 apis → errKeyTableInvalid（等級檢查前即拒，與呼叫者等級無關）；只送 id 而無 srcKey → errRowInvalid；列帶 id → idNotAllowed', async function() {
            let r1 = await getJson(`${S.base}/syncAndReplaceTabs?token=tokMxAs&keyTable=users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(syncBatch('kt')) })
            assert.deepStrictEqual({ state: r1.state, msg: r1.msg }, { state: 'error', msg: 'errKeyTableInvalid' })
            let r2 = await getJson(`${S.base}/syncAndReplaceTabs?token=tokMxAs&keyTable=apis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group: 'mx-sync', rows: [{ id: 'only-id', name: 'n', url: 'http://t/n' }] }) })
            assert.deepStrictEqual({ state: r2.state, msg: r2.msg }, { state: 'error', msg: 'errRowInvalid' })
            let r3 = await getJson(`${S.base}/syncAndReplaceTabs?token=tokMxAs&keyTable=apis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group: 'mx-sync', rows: [{ srcKey: 'k-id', id: 'x', name: 'n', url: 'http://t/n' }] }) })
            assert.deepStrictEqual({ state: r3.state, msg: r3.msg }, { state: 'error', msg: 'idNotAllowed' })
        })

        it('同一 srcKey 再匯入（系統管理者等級各類）→ nSame（srcKey 同步語意：新增／不變）；後台改過之本系統擁有欄位（tokens）與 id 保留，外部擁有欄位與 srcKey 不變', async function() {
            let r1 = await syncRaw('token=tokMxA', 'twice')
            assert.strictEqual(get(r1, 'msg.nAdd'), 1, JSON.stringify(r1))
            let row1 = (await S.list('tokMxA')).find((x) => x.name === 'sync-twice')
            //後台（系統管理者）改本系統擁有欄位 tokens（外部列只鎖外部擁有欄位，lockExternalRows 預設 'y'）
            let rs = await callFun(S.base, 'tokMxA', 'saveApi', [{ ...row1, tokens: 'LOCAL-KEEP-TOKENS' }])
            assert.strictEqual(rs.state, 'success', JSON.stringify(rs.msg))
            let r2 = await syncRaw('token=tokMxAuA', 'twice')
            assert.deepStrictEqual({ state: r2.state, nAdd: get(r2, 'msg.nAdd'), nUpdate: get(r2, 'msg.nUpdate'), nSame: get(r2, 'msg.nSame') }, { state: 'success', nAdd: 0, nUpdate: 0, nSame: 1 }, JSON.stringify(r2))
            let row2 = (await S.list('tokMxA')).find((x) => x.name === 'sync-twice')
            assert.strictEqual(row2.id, row1.id, 'id 保留')
            assert.strictEqual(row2.tokens, 'LOCAL-KEEP-TOKENS', '本系統擁有欄位保留')
            assert.strictEqual(row2.srcKey, 'k-twice')
            assert.strictEqual(row2.url, row1.url, '外部擁有欄位不變')
        })

    })


    //--------------------------------------------------------------------------
    //拒絕記 srLog（路由邊界 wrapRouteErrLog：err 為固定鍵），不含 token、使用者資料與敏感欄位
    describe('拒絕記 srLog：api/syncAndReplaceTabs 之 err=errUserNotAdmin／errUserNoPermission，只含白名單欄位', function() {

        let SL = null

        before(async function() {
            this.timeout(120000)
            SL = await startApiServer({ name: 'api-accessMatrix-log', port: PORT_LOG }) //獨立子行程: log 只含本案自己的請求
        })

        after(async function() {
            this.timeout(30000)
            if (SL) {
                await SL.stop()
            }
        })

        it('U、AU綁一般使用者各匯入一次 → 各記 error（err=errUserNotAdmin）；系統管理者但鉤子拒絕 → errUserNoPermission；log 不含 token、使用者欄位與敏感值', async function() {
            for (let tok of ['tokMxU', 'tokMxAuU', 'tokMxDenied']) {
                await getJson(`${SL.base}/syncAndReplaceTabs?token=${tok}&keyTable=apis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(syncBatch(tok)) })
            }
            let isEvt = (l) => l.includes('"event":"api/syncAndReplaceTabs"') && l.includes('"err":')
            let lines = await waitLogs(SL.cwd, (ls) => ls.filter(isEvt).length >= 3)
            let errs = lines.filter(isEvt).map((l) => JSON.parse(l))
            assert.deepStrictEqual(errs.map((o) => o.err).sort(), ['errUserNoPermission', 'errUserNotAdmin', 'errUserNotAdmin'])
            assert.ok(errs.every((o) => o.level === 50), '拒絕為 error 等級')
            let allowed = ['level', 'time', 'pid', 'hostname', 'event', 'err']
            for (let o of errs) {
                let extra = Object.keys(o).filter((k) => !allowed.includes(k))
                assert.deepStrictEqual(extra, [], `拒絕記錄含白名單外欄位（${JSON.stringify(o)}）`)
            }
            let text = lines.join('\n')
            for (let s of ['tokMxU', 'tokMxAuU', 'tokMxDenied', 'mx-u@example.com', 'id-mx-u', 'id-mx-au-u', ...SECRET_USER, ...SECRET_ROW]) {
                assert.ok(!text.includes(s), `srLog 不得含「${s}」`)
            }
        })

    })


    //--------------------------------------------------------------------------
    //全檔跑完後（須為本檔最後一個 describe）：主子行程之全部 srLog 不含 token 與敏感值（驗證 114 格與延伸案例沒有任何一條路徑把 token、使用者敏感欄位或憑證寫進 log）
    describe('收尾：主子行程全部 srLog 不含 token 與敏感值', function() {

        it('log 全文不含 tokMx* 權杖字串、使用者 email、SECRET-MX-* 哨兵', async function() {
            //pino 經 worker 非同步落檔：先等先前紀錄落定（連續讀取行數不再增加），再送最後一筆匯入並等其紀錄出現（行數增加），使掃描涵蓋最後一個請求
            let isSync = (l) => l.includes('"event":"api/syncAndReplaceTabs"')
            let nLast = -1
            for (let i = 0; i < 40; i++) {
                let n = readLogs(S.cwd).length
                if (n === nLast) {
                    break
                }
                nLast = n
                await new Promise((resolve) => setTimeout(resolve, 600))
            }
            let n0 = readLogs(S.cwd).filter(isSync).length
            await syncRaw('token=tokMxA', 'tail')
            let lines = await waitLogs(S.cwd, (ls) => ls.filter(isSync).length > n0)
            assert.ok(lines.filter(isSync).length > n0, '最後一筆匯入之紀錄已落檔')
            let text = lines.join('\n')
            assert.ok(lines.length > 50, `應有大量紀錄（實得 ${lines.length} 行）`)
            for (let s of ['tokMx', 'tokNoEmail', 'tokNoName', 'tokNoId', 'tokBadRole', 'tokAppMinimal', 'tokNonAdmin', '@example.com', 'SYNTH-GETTER-SECRET-FOR-TEST', ...SECRET_USER, ...SECRET_ROW]) {
                assert.ok(!text.includes(s), `srLog 不得含「${s}」`)
            }
        })

    })

})
