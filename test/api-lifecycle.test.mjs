//api-lifecycle：WWebApi 回傳物件之 stop 釋放本套件自建之資源（CLAUDE_rulebook.md R-RES-1；ADR-038）。真伺服器：子行程內以 WWebApi 起 127.0.0.1:8550。
//stop 依序：w-serv-hapi 之 stop → cacheSt.clear()（TTL 偵測計時器）→ woItems 之 closeAll()（LMDB）→ srLog.clear()（log worker）；可重複呼叫、回同一 promise。
//斷言（使用者可觀察之契約）：子行程 ready 後可服務 HTTP（/api/getUserByToken?token=sys 回 success）；呼叫 stop 兩次得同一 promise；stop 後埠即釋放，
//且子行程**自行結束**（離開碼 0、未印 STILL-ALIVE）。釋放步驟失敗時以 error 事件通知且不中斷其餘釋放（監聽器自身拋錯亦同，經 wsemi evEmit 隔離）。
//子行程之 cwd 為 test/_tmp 下之專用資料夾（資料庫、log、tableTags、uploadTemp 皆落於此，測完刪除）。
//埠：8550（主控指定之新埠範圍 8550–8574；須在測試鎖下執行）。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'


let PORT = 8550
let fdTest = path.dirname(fileURLToPath(import.meta.url))
let fpWWebApi = path.resolve(fdTest, '../server/WWebApi.mjs')
let FD = path.resolve(fdTest, '_tmp/api-lifecycle')

//closeFail：資料表 ORM 之 close 先照常關閉再拒絕（合成之釋放失敗），且 error 監聽器自身同步拋錯——stop 仍須 resolve、其後之 srLog.clear 照常執行
let child = (urlWWebApi, urlWOrm, closeFail = false) => `
import WWebApi from ${JSON.stringify(urlWWebApi)}
import WOrmLmdb from ${JSON.stringify(urlWOrm)}
let WOrm = WOrmLmdb
if (${closeFail}) {
    WOrm = function(opt) {
        let wo = new WOrmLmdb(opt)
        let closeReal = wo.close
        wo.close = async () => {
            await closeReal()
            throw new Error('SYNTH-CLOSE-FAIL')
        }
        return wo
    }
}
let getUserByToken = async (token) => (token === 'sys' ? { id: 'id-for-admin', name: 'admin', email: 'admin@example.com', isAdmin: 'y' } : {})
let verify = (user) => user.isAdmin === 'y'
let inst = WWebApi(WOrm, './db', 'wapis', getUserByToken, verify, verify, { serverPort: ${PORT}, logFd: './logs' })
inst.on('error', (err) => {
    console.log('ERROR-EVENT ' + String(err && err.message ? err.message : err).slice(0, 200))
    if (${closeFail}) {
        throw new Error('LISTENER-THROW')
    }
})
await inst.ready()
console.log('READY')
let res = await fetch('http://127.0.0.1:${PORT}/api/getUserByToken?token=sys')
let j = await res.json()
console.log('HTTP ' + j.state)
let p1 = inst.stop()
let p2 = inst.stop()
console.log('SAME-PROMISE ' + (p1 === p2))
await p1
console.log('STOPPED')
setTimeout(() => {
    console.log('STILL-ALIVE ' + JSON.stringify(process.getActiveResourcesInfo()))
    process.exit(9)
}, 10000).unref()
`


function portListening(port) {
    return new Promise((resolve) => {
        fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) }).then(() => resolve(true), () => resolve(false))
    })
}


describe('api-lifecycle（stop 釋放本套件自建之資源：R-RES-1）', function() {
    this.timeout(120000)

    before(function() {
        fs.rmSync(FD, { recursive: true, force: true })
        fs.mkdirSync(FD, { recursive: true })
    })

    after(function() {
        fs.rmSync(FD, { recursive: true, force: true })
        let fdTmp = path.resolve(fdTest, '_tmp')
        if (fs.existsSync(fdTmp) && fs.readdirSync(fdTmp).length === 0) {
            fs.rmSync(fdTmp, { recursive: true, force: true })
        }
    })

    //runChild：於專用資料夾寫出子行程腳本並執行，回傳 { code, out, tail }
    async function runChild(name, closeFail) {
        let fd = path.join(FD, name)
        fs.mkdirSync(fd, { recursive: true })
        let fpChild = path.join(fd, 'child.mjs')
        let urlWOrm = pathToFileURL(path.resolve(fdTest, '../node_modules/w-orm-lmdb/src/WOrmLmdb.mjs')).href
        fs.writeFileSync(fpChild, child(pathToFileURL(fpWWebApi).href, urlWOrm, closeFail), 'utf8')
        let out = ''
        let code = await new Promise((resolve) => {
            let cp = spawn(process.execPath, [fpChild], { cwd: fd })
            cp.stdout.on('data', (d) => {
                out += d.toString()
            })
            cp.stderr.on('data', (d) => {
                out += d.toString()
            })
            let t = setTimeout(() => {
                cp.kill()
                resolve('timeout')
            }, 90000)
            cp.on('exit', (c) => {
                clearTimeout(t)
                resolve(c)
            })
        })
        let tail = out.split('\n').filter((s) => /READY|HTTP|SAME-PROMISE|STOPPED|STILL-ALIVE|ERROR-EVENT|Error/.test(s)).join(' ⏎ ').slice(0, 600)
        return { code, out, tail }
    }

    it(`以 ${PORT} 起服務 → HTTP 正常 → stop（重複呼叫同一 promise）→ 埠釋放且子行程自行結束`, async function() {
        assert.strictEqual(await portListening(PORT), false, `${PORT} 開跑前應無人監聽`)
        let { code, out, tail } = await runChild('normal', false)
        assert.ok(out.includes('READY'), `應啟動完成（實得 ${tail}）`)
        assert.ok(out.includes('HTTP success'), `停止前應可服務 HTTP（實得 ${tail}）`)
        assert.ok(out.includes('SAME-PROMISE true'), `重複呼叫 stop 應回同一 promise（實得 ${tail}）`)
        assert.ok(out.includes('STOPPED'), `stop 應 resolve（實得 ${tail}）`)
        assert.ok(!out.includes('ERROR-EVENT'), `正常釋放不應發出 error 事件（實得 ${tail}）`)
        assert.ok(!out.includes('STILL-ALIVE'), `stop 後子行程應自行結束，不得被本套件之資源撐住（實得 ${tail}）`)
        assert.strictEqual(code, 0, `子行程離開碼應為 0（實得 ${code}；${tail}）`)
        assert.strictEqual(await portListening(PORT), false, `stop 後 ${PORT} 應已釋放`)
    })

    it(`釋放步驟失敗（資料表 ORM 之 close 拒絕）且 error 監聽器自身拋錯 → stop 仍 resolve、以 error 事件通知、其後之 log 釋放照常（子行程自行結束）`, async function() {
        assert.strictEqual(await portListening(PORT), false, `${PORT} 開跑前應無人監聽`)
        let { code, out, tail } = await runChild('closeFail', true)
        assert.ok(out.includes('HTTP success'), `停止前應可服務 HTTP（實得 ${tail}）`)
        assert.ok(out.includes('ERROR-EVENT SYNTH-CLOSE-FAIL'), `釋放失敗應以 error 事件通知（實得 ${tail}）`)
        assert.ok(out.includes('STOPPED'), `釋放失敗與監聽器拋錯皆不使 stop reject（實得 ${tail}）`)
        assert.ok(!out.includes('STILL-ALIVE'), `其後之 srLog.clear 應照常執行，子行程自行結束（實得 ${tail}）`)
        assert.strictEqual(code, 0, `子行程離開碼應為 0（實得 ${code}；${tail}）`)
        assert.strictEqual(await portListening(PORT), false, `stop 後 ${PORT} 應已釋放`)
    })

})
