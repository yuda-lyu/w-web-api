//api-logLeak：console 診斷不輸出資料值——以同一組含識別值之測資（ZZ-secret-9317）置於使用者物件、請求本體、查詢參數、建構參數與環境路徑，實際觸發各站點，
//斷言後端行程 stdout／stderr 不含該值（ADR-057，取代 ADR-033／048 之「console 印使用者物件，記錄不修」；規格〈診斷輸出與遮罩〉D2「預設不輸出資料值」、
//〈輸入參數之檢測機制〉V20「訊息與 throw 前之 console 皆不含輸入值」；站點全集與判定見 sgud/rule/rulebook_backend.md R-CONSOLE-01）。
//每個案例同時斷言「站點確實被走到」（固定詞彙之標記句出現在 console），避免站點沒觸發而空綠。
//A 建構期（子行程，spawnSync）：無效建構參數、opt.serverPort、opt.proxyAllowList／proxyAllowInternal、ORM 建構失敗（外來錯誤）、入口檔缺失（路徑含識別值）。
//B 請求期（apiHarness 子行程，pipeOut 收 stdout／stderr）：認證階段使用者物件欄位不齊、授權拒絕、查詢參數、請求本體、權杖。
//無法由外部觸發之站點（防禦性分支、WServHapiServer 建構失敗）由 unit-consoleSites 之 AST 掃描守。
//環境變數 API_SERVER_MODULE 可指向另一份 WWebApi.mjs（修前紅對 HEAD 副本、變異測試對變異副本重跑同一檔，副本放 ./tmp/）。
//埠 8574（api 測試埠範圍內，與 api-ormDiag、api-ormDiagCred、api-sysFuncs 同埠，循序執行）；不碰專案 ./db 與 11005。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import { startApiServer, sleep } from './tools/apiHarness.mjs'
import { postMain } from './tools/apiMain.mjs'


let fdTest = path.dirname(fileURLToPath(import.meta.url))
let urlWWebApi = process.env.API_SERVER_MODULE ? pathToFileURL(path.resolve(process.env.API_SERVER_MODULE)).href : pathToFileURL(path.resolve(fdTest, '../server/WWebApi.mjs')).href
let PORT = 8574
let SECRET = 'ZZ-secret-9317' //識別值：任何 console 輸出含此字串即判為輸出資料值
let FD_CTOR = path.resolve(fdTest, '_tmp/api-logLeak-ctor')


//A 建構期之子行程腳本：依 scenario 以含識別值之參數建構 WWebApi，只印固定詞彙與錯誤名稱（不印錯誤訊息，避免子行程腳本自己把識別值印出）
let child = `
import WOrmLmdb from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WWebApi from ${JSON.stringify(urlWWebApi)}
let scenario = process.argv[2]
let SECRET = process.argv[3]
let fn = async () => ({})
let opt = { serverPort: ${PORT}, logFd: './logs' }

//ormfail: 資料庫 ORM 於建構時拋出，訊息帶識別值（外來錯誤；w-serv-orm 只遮連線字串，不遮此值）
class BadOrm {
    constructor() {
        throw new Error('connect failed ' + SECRET)
    }
}

let bad = { host: 'db.example.com', user: 'dbuser', password: SECRET }
let args = { WOrm: WOrmLmdb, url: './db', db: 'wapislog', g: fn, v1: () => false, v2: () => false, opt }
let BAD = { badorm: ['WOrm', bad], badurl: ['url', bad], baddb: ['db', bad], badhook: ['g', SECRET], badv1: ['v1', bad], badv2: ['v2', SECRET] }

let run = async () => {
    if (BAD[scenario]) {
        args[BAD[scenario][0]] = BAD[scenario][1]
    }
    else if (scenario === 'port') {
        args.opt = { ...opt, serverPort: SECRET }
    }
    else if (scenario === 'portobj') {
        args.opt = { ...opt, serverPort: bad }
    }
    else if (scenario === 'proxylist') {
        args.opt = { ...opt, proxyAllowList: [SECRET + '/99'] }
    }
    else if (scenario === 'proxyinternal') {
        args.opt = { ...opt, proxyAllowInternal: SECRET }
    }
    else if (scenario === 'ormfail') {
        args.WOrm = BadOrm
    }
    let inst = null
    try {
        inst = WWebApi(args.WOrm, args.url, args.db, args.g, args.v1, args.v2, args.opt)
        console.log('CONSTRUCTED')
    }
    catch (err) {
        console.log('THROW ' + (err && err.name))
        return
    }
    //nodist: 建構成功（cwd 下無 dist，入口檔缺失之站點已走過）；停止以釋放資源
    await inst.ready().catch(() => {})
    await inst.stop()
    console.log('STOPPED')
}
await run()
setTimeout(() => {
    console.log('STILL-ALIVE')
    process.exit(9)
}, 20000).unref()
`


//runCtor: 在 cwd 為 test/_tmp/api-logLeak-ctor/<識別值>/ 之子行程跑 scenario（cwd 名稱含識別值，供入口檔缺失與寫入失敗之路徑站點）；prep(cwd) 可預先佈置 cwd（預設不建 dist）
let runCtor = (scenario, prep = null) => {
    let cwd = path.join(FD_CTOR, SECRET)
    fs.rmSync(cwd, { recursive: true, force: true })
    fs.mkdirSync(cwd, { recursive: true })
    if (prep !== null) {
        prep(cwd)
    }
    let fpChild = path.join(FD_CTOR, 'child.mjs')
    fs.writeFileSync(fpChild, child, 'utf8')
    let r = spawnSync(process.execPath, [fpChild, scenario, SECRET], { cwd, encoding: 'utf8', timeout: 60000 })
    return { out: `${r.stdout || ''}${r.stderr || ''}`, status: r.status }
}


describe('api-logLeak (console 診斷不輸出資料值：以含識別值之測資觸發各站點)', function() {
    this.timeout(180000)

    describe('A 建構期', function() {

        after(function() {
            fs.rmSync(FD_CTOR, { recursive: true, force: true })
            let fdTmp = path.resolve(fdTest, '_tmp')
            if (fs.existsSync(fdTmp) && fs.readdirSync(fdTmp).length === 0) {
                fs.rmSync(fdTmp, { recursive: true, force: true })
            }
        })

        //spec D2／V20：無效建構參數只印型別（WWebApi.mjs 之 invalid WOrm／url／db／getUserByToken／verifyClientUser／verifyAppUser）
        let BADS = [
            ['badorm', 'invalid WOrm (object)'],
            ['badurl', 'invalid url (object)'],
            ['baddb', 'invalid db (object)'],
            ['badhook', 'invalid getUserByToken (string)'],
            ['badv1', 'invalid verifyClientUser (object)'],
            ['badv2', 'invalid verifyAppUser (string)'],
        ]
        BADS.forEach(([sc, marker], i) => {
            it(`CTOR-00${1 + i} 建構參數誤傳含識別值之${sc.startsWith('badhook') || sc === 'badv2' ? '字串' : '物件'}（${sc}）→ console 只印型別「${marker}」`, function() {
                let { out, status } = runCtor(sc)
                assert.ok(out.includes(marker), `應印「${marker}」（實得 ${out.slice(0, 300)}）`)
                assert.ok(!out.includes(SECRET), `console 不得含 ${SECRET}（實得 ${out.slice(0, 500)}）`)
                assert.strictEqual(status, 0)
            })
        })

        //spec V20「訊息與 throw 前之 console 皆不含輸入值」：opt.serverPort 無效值（字串、物件）只印型別（原印值：ADR-048 之後之 C2 站點，ADR-057 改）
        it('CTOR-007 opt.serverPort 誤傳含識別值之字串 → console 只印 invalid opt.serverPort (string)', function() {
            let { out, status } = runCtor('port')
            assert.ok(out.includes('invalid opt.serverPort (string)'), `實得 ${out.slice(0, 300)}`)
            assert.ok(!out.includes(SECRET), `console 不得含 ${SECRET}（實得 ${out.slice(0, 500)}）`)
            assert.strictEqual(status, 0)
        })

        it('CTOR-008 opt.serverPort 誤傳含識別值之物件 → console 只印 invalid opt.serverPort (object)', function() {
            let { out, status } = runCtor('portobj')
            assert.ok(out.includes('invalid opt.serverPort (object)'), `實得 ${out.slice(0, 300)}`)
            assert.ok(!out.includes(SECRET), `console 不得含 ${SECRET}（實得 ${out.slice(0, 500)}）`)
            assert.strictEqual(status, 0)
        })

        //spec V20：proxy 目標政策之設定值不入 console（訊息為固定詞彙 invalid opt.proxyAllowList／proxyAllowInternal；本案例為回歸守護，修前即綠）
        it('CTOR-009 opt.proxyAllowList／proxyAllowInternal 含識別值之無效項 → console 只印固定詞彙，不含識別值', function() {
            let a = runCtor('proxylist')
            assert.ok(a.out.includes('invalid opt.proxyAllowList'), `實得 ${a.out.slice(0, 300)}`)
            assert.ok(!a.out.includes(SECRET), `console 不得含 ${SECRET}（實得 ${a.out.slice(0, 500)}）`)
            let b = runCtor('proxyinternal')
            assert.ok(b.out.includes('invalid opt.proxyAllowInternal'), `實得 ${b.out.slice(0, 300)}`)
            assert.ok(!b.out.includes(SECRET), `console 不得含 ${SECRET}（實得 ${b.out.slice(0, 500)}）`)
        })

        //spec D2「不含後端錯誤原文」：ORM 建構失敗之外來錯誤，console 只給錯誤名稱與代碼（站點 WServOrm init failed）；錯誤本身仍原樣拋出（子行程以 THROW Error 印名稱）
        it('CTOR-010 WOrm 建構時拋出含識別值之 Error → console 只印 WServOrm init failed ＋ 錯誤名稱，不含識別值；仍拋出', function() {
            let { out, status } = runCtor('ormfail')
            assert.ok(out.includes('WServOrm init failed'), `站點應被走到（實得 ${out.slice(0, 300)}）`)
            assert.ok(/WServOrm init failed Error\r?\n/.test(out), `應只給錯誤名稱（實得 ${out.slice(0, 300)}）`)
            assert.ok(out.includes('THROW Error'), `建構仍應拋出（實得 ${out.slice(0, 300)}）`)
            assert.ok(!out.includes(SECRET), `console 不得含 ${SECRET}（實得 ${out.slice(0, 500)}）`)
            assert.ok(!out.includes('STILL-ALIVE'), '拋錯後行程應自行結束')
            assert.strictEqual(status, 0)
        })

        //spec V20「路徑不入診斷」：入口檔缺失時不印路徑（cwd 名稱含識別值），只印固定詞彙與錯誤名稱
        it('CTOR-011 dist 入口檔缺失（cwd 名稱含識別值）→ console 只印 invalid fpEntryIn、can not generate index.html，不含路徑', function() {
            let { out, status } = runCtor('nodist')
            assert.ok(out.includes('invalid fpEntryIn'), `站點應被走到（實得 ${out.slice(0, 300)}）`)
            assert.ok(out.includes('can not generate index.html'), `實得 ${out.slice(0, 300)}`)
            assert.ok(!out.includes(SECRET), `console 不得含路徑中之 ${SECRET}（實得 ${out.slice(0, 600)}）`)
            assert.ok(!out.includes('STILL-ALIVE'), '行程應自行結束')
            assert.strictEqual(status, 0)
        })

        //spec D2「不含後端錯誤原文」、V20「路徑不入診斷」：入口檔寫入失敗（index.html 位置為目錄 → EISDIR，錯誤訊息帶含識別值之絕對路徑）→ console 只給錯誤名稱與代碼
        it('CTOR-012 dist/index.html 寫入失敗（檔案系統錯誤之訊息帶路徑，cwd 名稱含識別值）→ console 只印 can not generate index.html ＋ 錯誤名稱與代碼，不含路徑', function() {
            let { out, status } = runCtor('nodist', (cwd) => {
                fs.mkdirSync(path.join(cwd, 'dist'), { recursive: true })
                fs.writeFileSync(path.join(cwd, 'dist', 'index.tmp'), '<!doctype html><html><body>{sfd}{urlRedirect}{language}</body></html>', 'utf8')
                fs.mkdirSync(path.join(cwd, 'dist', 'index.html')) //寫入 index.html 時 EISDIR
            })
            assert.ok(out.includes('can not generate index.html'), `站點應被走到（實得 ${out.slice(0, 300)}）`)
            assert.ok(/^Error EISDIR\r?$/m.test(out), `應只給錯誤名稱與代碼（實得 ${out.slice(0, 300)}）`)
            assert.ok(!out.includes(SECRET), `console 不得含路徑中之 ${SECRET}（實得 ${out.slice(0, 600)}）`)
            assert.ok(!out.includes('STILL-ALIVE'), '行程應自行結束')
            assert.strictEqual(status, 0)
        })

    })

    describe('B 請求期', function() {
        let S = null
        let base = ''

        before(async function() {
            this.timeout(120000)
            S = await startApiServer({ name: 'api-logLeak', port: PORT, pipeOut: true })
            base = S.base
        })

        after(async function() {
            this.timeout(60000)
            if (S) {
                await S.stop()
            }
        })

        //doReq: 執行 fn（發請求）後，等到 console 出現標記句（站點確實被走到），回傳本次請求期間新增之 console 文字
        let doReq = async (fn, marker) => {
            let o0 = S.getOut().length
            let r = await fn()
            let t0 = Date.now()
            while (!S.getOut().slice(o0).includes(marker) && Date.now() - t0 < 10000) {
                await sleep(50)
            }
            await sleep(100) //同一請求之後續行（如 token 行）隨之落入
            let seg = S.getOut().slice(o0)
            assert.ok(seg.includes(marker), `站點應被走到：console 應出現「${marker}」（實得 ${seg.slice(0, 400)}）`)
            return { seg, r }
        }
        let getJson = async (url, opts) => {
            let res = await fetch(url, opts)
            return JSON.parse(await res.text())
        }
        let postSync = (qs, body, ct = 'application/json') => getJson(`${base}/syncAndReplaceTabs?${qs}`, { method: 'POST', headers: { 'content-type': ct }, body })
        let noSecret = (label, seg) => {
            assert.ok(!seg.includes(SECRET), `${label} console 不得含 ${SECRET}（實得 ${seg.slice(0, 600)}）`)
        }

        //認證階段（checkUser）：部署方使用者物件欄位不齊——各欄位與額外欄位（account、password、description、tokenVerify）皆為識別值，console 只印鍵名
        let USERS = [
            ['REQ-001', 'tokZzNoId', 'can not get the userId', 'errUserIdMissing'],
            ['REQ-002', 'tokZzNoEmail', 'can not get the email of user', 'errUserEmailMissing'],
            ['REQ-003', 'tokZzNoName', 'can not get userName', 'errUserNameMissing'],
            ['REQ-004', 'tokZzBadRole', 'can not get the role of user', 'errUserRoleMissing'],
        ]
        USERS.forEach(([id, tok, marker, key]) => {
            it(`${id} GET /api/getUserByToken，${tok}（使用者物件各欄位為識別值）→ ${key}；console 只印鍵名`, async function() {
                let { seg, r } = await doReq(() => getJson(`${base}/api/getUserByToken?token=${tok}`), marker)
                assert.strictEqual(r.state, 'error')
                assert.strictEqual(r.msg, key)
                assert.ok(seg.includes('(keys: '), `應印使用者物件之鍵名形狀（實得 ${seg.slice(0, 300)}）`)
                noSecret(id, seg)
            })
        })

        //授權階段：部署方鉤子拒絕——瀏覽端（getAndVerifyClientUser）與應用端（getAndVerifyAppUser）各一站
        it('REQ-005 GET /api/getUserByToken，tokZzDenied（verifyClientUser 拒絕）→ errUserNoPermission；console 不印使用者物件之值', async function() {
            let { seg, r } = await doReq(() => getJson(`${base}/api/getUserByToken?token=tokZzDenied`), 'user does not have permission\n')
            assert.strictEqual(r.msg, 'errUserNoPermission')
            assert.ok(seg.includes('(keys: '), `應印使用者物件之鍵名形狀（實得 ${seg.slice(0, 300)}）`)
            noSecret('REQ-005', seg)
        })

        it('REQ-006 POST /syncAndReplaceTabs，tokZzDenied（verifyAppUser 拒絕）→ errUserNoPermission；console 不印使用者物件之值', async function() {
            let { seg, r } = await doReq(() => postSync('token=tokZzDenied&keyTable=apis', JSON.stringify({ group: 'g', rows: [{ srcKey: 'k', name: 'n', url: 'http://x/y' }] })), 'user does not have permission\n')
            assert.strictEqual(r.msg, 'errUserNoPermission')
            assert.ok(seg.includes('(keys: '), `應印使用者物件之鍵名形狀（實得 ${seg.slice(0, 300)}）`)
            noSecret('REQ-006', seg)
        })

        //查詢參數（token 缺漏之分支）：整包 req.query 改印鍵名；原 maskQuery 只遮 token 鍵，其餘參數值（此處 foo／bar／keyTable）照印
        it('REQ-007 GET /api/getUserByToken 無 token、其他查詢參數為識別值 → errTokenNoPermission；console 只印查詢參數之鍵名', async function() {
            let { seg, r } = await doReq(() => getJson(`${base}/api/getUserByToken?foo=${SECRET}&bar=${SECRET}`), '[API]getUserByToken/check token: invalid token')
            assert.strictEqual(r.msg, 'errTokenNoPermission')
            assert.ok(seg.includes('(keys: foo,bar)'), `應印查詢參數之鍵名（實得 ${seg.slice(0, 300)}）`)
            noSecret('REQ-007', seg)
        })

        it('REQ-008 GET /api/getApisList 無 token、其他查詢參數為識別值 → errTokenNoPermission；console 只印查詢參數之鍵名', async function() {
            let { seg, r } = await doReq(() => getJson(`${base}/api/getApisList?foo=${SECRET}`), '[API]getApisList/check token: invalid token')
            assert.strictEqual(r.msg, 'errTokenNoPermission')
            assert.ok(seg.includes('(keys: foo)'), `應印查詢參數之鍵名（實得 ${seg.slice(0, 300)}）`)
            noSecret('REQ-008', seg)
        })

        it('REQ-009 POST /syncAndReplaceTabs 無 token、其他查詢參數為識別值 → errTokenNoPermission；console 只印查詢參數之鍵名', async function() {
            let { seg, r } = await doReq(() => postSync(`foo=${SECRET}&keyTable=apis`, '{}'), '[API]syncAndReplaceTabs/check token: invalid token')
            assert.strictEqual(r.msg, 'errTokenNoPermission')
            assert.ok(seg.includes('(keys: foo,keyTable)'), `應印查詢參數之鍵名（實得 ${seg.slice(0, 300)}）`)
            noSecret('REQ-009', seg)
        })

        //keyTable：重複參數（陣列）與白名單外之值；console 不印其值
        it('REQ-010 POST /syncAndReplaceTabs，keyTable 為重複參數（陣列，含識別值）→ errKeyTableInvalid；console 不含識別值', async function() {
            let { seg, r } = await doReq(() => postSync(`token=sys&keyTable=a&keyTable=${SECRET}`, '{}'), '[API]syncAndReplaceTabs/check keyTable: invalid keyTable')
            assert.strictEqual(r.msg, 'errKeyTableInvalid')
            noSecret('REQ-010', seg)
        })

        it('REQ-011 POST /syncAndReplaceTabs，keyTable 為白名單外之字串（識別值）→ errKeyTableInvalid；console 不含識別值', async function() {
            let { seg, r } = await doReq(() => postSync(`token=sys&keyTable=${SECRET}`, '{}'), 'unexpected keyTable')
            assert.strictEqual(r.msg, 'errKeyTableInvalid')
            noSecret('REQ-011', seg)
        })

        //請求本體（payload）：非物件、group 非字串（物件夾識別值）、rows 非陣列（識別值）；console 只印 payloadShape（鍵名與筆數）
        it('REQ-012 POST /syncAndReplaceTabs，本體為字串（識別值）→ errPayloadInvalid；console 不含識別值', async function() {
            let { seg, r } = await doReq(() => postSync('token=sys&keyTable=apis', JSON.stringify(SECRET)), 'invalid payload in req')
            assert.strictEqual(r.msg, 'errPayloadInvalid')
            noSecret('REQ-012', seg)
        })

        it('REQ-013 POST /syncAndReplaceTabs，group 為物件（夾識別值）→ errGroupInvalid；console 只印鍵名與筆數', async function() {
            let { seg, r } = await doReq(() => postSync('token=sys&keyTable=apis', JSON.stringify({ group: { v: SECRET }, rows: [{ name: SECRET }] })), 'invalid group in payload')
            assert.strictEqual(r.msg, 'errGroupInvalid')
            assert.ok(/keys: \[ 'group', 'rows' \]/.test(seg), `應印本體之鍵名（實得 ${seg.slice(0, 300)}）`)
            noSecret('REQ-013', seg)
        })

        it('REQ-014 POST /syncAndReplaceTabs，rows 為字串（識別值）→ errRowsInvalid；console 不含識別值', async function() {
            let { seg, r } = await doReq(() => postSync('token=sys&keyTable=apis', JSON.stringify({ group: 'g', rows: SECRET })), 'invalid rows in payload')
            assert.strictEqual(r.msg, 'errRowsInvalid')
            noSecret('REQ-014', seg)
        })

        //權杖（M 契約：maskTok，照舊）：識別值作為查無之 token，console 只印前後各至多 4 字＋長度；本案例為回歸守護，修前即綠
        it('REQ-015 GET /api/getUserByToken，token 為識別值（查無）→ errUserNotFound；console 只印遮罩後之權杖', async function() {
            let { seg, r } = await doReq(() => getJson(`${base}/api/getUserByToken?token=${SECRET}`), 'can not find the user from token')
            assert.strictEqual(r.msg, 'errUserNotFound')
            assert.ok(seg.includes('Z...7(len=14)'), `權杖應經 maskTok（14 字元: k＝min(4, floor(14/8))＝1，前後各 1 字）（實得 ${seg.slice(0, 300)}）`)
            noSecret('REQ-015', seg)
        })

        //資料通道連線閘（verifyConn）：Authorization 非 Bearer 方案（識別值）、本體 __sysToken__ 為識別值、授權拒絕；console 只印固定詞彙與遮罩後之權杖
        it('REQ-016 POST /api/main，Authorization 為 Basic ＋ 識別值 → permission denied；console 不含識別值', async function() {
            let { seg, r } = await doReq(() => postMain(base, 'x', { func: 'getWebInfor', input: { __sysInputArgs__: [], __sysToken__: 'sys' } }, { Authorization: `Basic ${SECRET}` }), 'invalid token')
            assert.deepStrictEqual(r.data, { error: 'permission denied' })
            noSecret('REQ-016', seg)
        })

        it('REQ-017 POST /api/main，Authorization 有效而 __sysToken__ 為識別值 → 不執行（errUserIdMissing）；console 只印遮罩後之權杖', async function() {
            let { seg } = await doReq(() => postMain(base, 'sys', { func: 'getWebInfor', input: { __sysInputArgs__: [], __sysToken__: SECRET } }), 'can not verify the user from token for execution')
            noSecret('REQ-017', seg)
        })

        it('REQ-018 POST /api/main，tokZzDenied（部署方授權拒絕）→ permission denied；console 只印入口名，不印使用者物件', async function() {
            let { seg, r } = await doReq(() => postMain(base, 'tokZzDenied', { func: 'getWebInfor', input: { __sysInputArgs__: [], __sysToken__: 'tokZzDenied' } }), 'user does not have permission, apiType[main]')
            assert.deepStrictEqual(r.data, { error: 'permission denied' })
            noSecret('REQ-018', seg)
        })

        //總結：本檔全部請求期間之 console 累計不含識別值（防前面案例之標記句截取窗口漏掉後續行）
        it('REQ-019 整段請求期之 console 累計不含識別值', async function() {
            await sleep(300)
            noSecret('REQ-019', S.getOut())
        })

    })

})
