//api-ormDiagCred：含憑證之外來值經 WWebApi 對外輸出（console、'error' 事件、拋出之錯誤、srLog 檔）時不含憑證（規格〈診斷輸出與遮罩〉D3；wsemi R-DIAG-01；R-ORMDIAG-01，ADR-055）。
//外來值＝資料庫 ORM（使用端注入之 WOrm）於建構與 close 時拋出／reject 之值，其訊息帶連線字串（含帳密）。
//遮罩由 w-serv-orm 1.1.22 之 WServOrm 於其建構與 closeAll 站點以 wsemi 之 diag.err 完成（秘密＝WWebApi 收到之 url，兩者同一來源）；本套件於 catch 站點只轉出，不另包第二層（同源重複遮罩無新增保護）。
//本檔釘住該契約：若日後升版使 w-serv-orm 不再遮罩，或本套件改動站點使外來值繞過，這裡轉紅。
//作法: 子行程（cwd 為 test/_tmp/api-ormDiagCred/，logs 落於此）以假 WOrm 建構 WWebApi，斷言子行程 stdout／stderr 與 logs 內容；埠 8574（api 測試埠範圍內，與 api-ormDiag、api-sysFuncs 同埠，循序執行）。
//不碰專案 ./db 與 11005。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'


let fdTest = path.dirname(fileURLToPath(import.meta.url))
let urlWWebApi = process.env.API_SERVER_MODULE ? pathToFileURL(path.resolve(process.env.API_SERVER_MODULE)).href : pathToFileURL(path.resolve(fdTest, '../server/WWebApi.mjs')).href
let FD = path.resolve(fdTest, '_tmp/api-ormDiagCred')
let PORT = 8574

//連線字串（含帳密與查詢秘密）: 同 wsemi 共用語料之測試秘密形狀，另綴本檔專用標記
let PW = 'Pw9xQ!z7-ormDiagCred'
let URL_CRED = `postgres://dbuser:${PW}@db.example.com:5432/app?sslpassword=Ssl8kLm3-cred`

let child = `
import path from 'path'
import WOrmLmdb from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WWebApi from ${JSON.stringify(urlWWebApi)}
let scenario = process.argv[2]
let urlCred = process.argv[3]
let fn = async () => ({})
let opt = { serverPort: ${PORT}, logFd: './logs' }

//construct: 資料庫 ORM 於建構時拋出，訊息帶連線字串與密碼
class BadOrm {
    constructor(o) {
        throw new Error('connect failed to ' + o.url + ' as dbuser with password ${PW}')
    }
}

//close: 資料庫 ORM 於 close 時 reject，訊息帶連線字串（實際儲存為本地 lmdb，url 僅作為被拒絕之訊息內容）
function CloseFailOrm(o) {
    let wo = new WOrmLmdb({ ...o, url: path.resolve('./db') })
    let orig = wo.close.bind(wo)
    wo.close = async () => {
        await orig()
        throw new Error('close failed for ' + o.url + ' password ${PW}')
    }
    return wo
}

//bad*: 建構參數誤傳為含帳密之設定物件或字串（參數驗證失敗時 console 只可印型別）
let bad = { host: 'db.example.com', user: 'dbuser', password: '${PW}' }
let args = { WOrm: WOrmLmdb, url: urlCred, db: 'wapis', g: fn, v1: () => false, v2: () => false }
let BAD = { badorm: ['WOrm', bad], badurl: ['url', bad], baddb: ['db', bad], badhook: ['g', 'password ${PW}'], badv1: ['v1', bad], badv2: ['v2', 'password ${PW}'] }

try {
    if (BAD[scenario]) {
        args[BAD[scenario][0]] = BAD[scenario][1]
        try {
            WWebApi(args.WOrm, args.url, args.db, args.g, args.v1, args.v2, opt)
            console.log('CONSTRUCTED')
        }
        catch (err) {
            console.log('THROW ' + (err && err.message ? err.message : String(err)))
        }
    }
    else if (scenario === 'construct') {
        try {
            WWebApi(BadOrm, urlCred, 'wapis', fn, () => false, () => false, opt)
            console.log('CONSTRUCTED')
        }
        catch (err) {
            console.log('THROW ' + (err && err.message ? err.message : String(err)))
        }
    }
    else if (scenario === 'close') {
        let inst = WWebApi(CloseFailOrm, urlCred, 'wapis', fn, () => false, () => false, opt)
        inst.on('error', (err) => {
            console.log('EVENT-ERROR ' + (err && err.message ? err.message : String(err)))
        })
        await inst.ready()
        await inst.stop()
        console.log('STOPPED')
    }
}
catch (err) {
    console.log('UNEXPECTED ' + String(err && err.message))
}
setTimeout(() => {
    console.log('STILL-ALIVE')
    process.exit(9)
}, 20000).unref()
`


//readAll: 讀 dir 下全部檔案內容串接（srLog 輪檔）
let readAll = (fd) => {
    let s = ''
    if (!fs.existsSync(fd)) {
        return s
    }
    for (let f of fs.readdirSync(fd, { withFileTypes: true })) {
        let p = path.join(fd, f.name)
        s += f.isDirectory() ? readAll(p) : fs.readFileSync(p, 'utf8')
    }
    return s
}

let run = (scenario) => {
    fs.rmSync(FD, { recursive: true, force: true })
    fs.mkdirSync(path.join(FD, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(FD, 'dist', 'index.tmp'), '<!doctype html><html><body>{sfd}{urlRedirect}{language}</body></html>', 'utf8') //WWebApi 啟動時讀 dist/index.tmp 產生 index.html
    let fpChild = path.join(FD, 'child.mjs')
    fs.writeFileSync(fpChild, child, 'utf8')
    let r = spawnSync(process.execPath, [fpChild, scenario, URL_CRED], { cwd: FD, encoding: 'utf8', timeout: 60000 })
    return { out: `${r.stdout || ''}${r.stderr || ''}`, logs: readAll(path.join(FD, 'logs')), status: r.status }
}

let SECRETS = [PW, 'Ssl8kLm3-cred', `dbuser:${PW}`, URL_CRED]


describe('api-ormDiagCred (含憑證之外來值: 不出現於 console、error 事件、拋出之錯誤與 srLog)', function() {
    this.timeout(120000)

    after(function() {
        fs.rmSync(FD, { recursive: true, force: true })
        let fdTmp = path.resolve(fdTest, '_tmp')
        if (fs.existsSync(fdTmp) && fs.readdirSync(fdTmp).length === 0) {
            fs.rmSync(fdTmp, { recursive: true, force: true })
        }
    })

    it('ORMDIAG-CRED-001 WOrm 建構時拋出含連線字串與密碼之 Error → WWebApi 拋出之錯誤與 console（WServOrm init failed）皆不含憑證，保留非憑證之訊息；srLog 無憑證', function() {
        let { out, logs, status } = run('construct')
        assert.ok(out.includes('THROW '), `應拋出（實得 ${out.slice(0, 300)}）`)
        assert.ok(!out.includes('CONSTRUCTED') && !out.includes('UNEXPECTED') && !out.includes('STILL-ALIVE'), `拋錯後行程應自行結束（實得 ${out.slice(0, 300)}）`)
        assert.ok(out.includes('connect failed to'), `非憑證之訊息應保留（實得 ${out.slice(0, 300)}）`)
        assert.ok(out.includes('WServOrm init failed'), 'console 應有 WServOrm init failed（站點確實被走到）')
        for (let s of SECRETS) {
            assert.ok(!out.includes(s), `console／拋出之錯誤不得含 ${s}（實得 ${out.slice(0, 600)}）`)
            assert.ok(!logs.includes(s), `srLog 不得含 ${s}`)
        }
        assert.strictEqual(status, 0)
    })

    it('ORMDIAG-CRED-002 WOrm 於 stop() 之 close 時 reject 含連線字串與密碼之 Error → \'error\' 事件收到之錯誤與 console 皆不含憑證，保留非憑證之訊息；stop 仍完成；srLog 無憑證', function() {
        let { out, logs, status } = run('close')
        assert.ok(out.includes('EVENT-ERROR '), `應有 error 事件（實得 ${out.slice(0, 400)}）`)
        assert.ok(out.includes('STOPPED'), `stop 應完成（實得 ${out.slice(0, 400)}）`)
        assert.ok(!out.includes('UNEXPECTED') && !out.includes('STILL-ALIVE'), `行程應自行結束（實得 ${out.slice(0, 400)}）`)
        assert.ok(out.includes('close failed for'), `非憑證之訊息應保留（實得 ${out.slice(0, 400)}）`)
        for (let s of SECRETS) {
            assert.ok(!out.includes(s), `error 事件／console 不得含 ${s}（實得 ${out.slice(0, 600)}）`)
            assert.ok(!logs.includes(s), `srLog 不得含 ${s}`)
        }
        assert.strictEqual(status, 0)
    })

    //無效建構參數: 誤傳含帳密之設定物件或字串時, console 只印型別（D2）; 拋出之錯誤訊息為固定詞彙（不含值）
    let BADS = [
        ['badorm', 'invalid WOrm', '(object)'],
        ['badurl', 'invalid url', '(object)'],
        ['baddb', 'invalid db', '(object)'],
        ['badhook', 'invalid getUserByToken', '(string)'],
        ['badv1', 'invalid verifyClientUser', '(object)'],
        ['badv2', 'invalid verifyAppUser', '(string)'],
    ]
    BADS.forEach(([sc, msg, ty], i) => {
        it(`ORMDIAG-CRED-00${3 + i} 建構參數誤傳含帳密之值（${sc}）→ 拋 ${msg}，console 只印 ${ty}，不含帳密`, function() {
            let { out, logs, status } = run(sc)
            assert.ok(out.includes(`THROW ${msg}\n`) || out.includes(`THROW ${msg}\r\n`), `應拋 ${msg}（實得 ${out.slice(0, 300)}）`)
            assert.ok(out.includes(`${msg} ${ty}`), `console 應只印型別 ${msg} ${ty}（實得 ${out.slice(0, 300)}）`)
            for (let s of [PW, 'dbuser', 'db.example.com']) {
                assert.ok(!out.includes(s), `console 不得含 ${s}（實得 ${out.slice(0, 400)}）`)
                assert.ok(!logs.includes(s), `srLog 不得含 ${s}`)
            }
            assert.strictEqual(status, 0)
        })
    })

})
