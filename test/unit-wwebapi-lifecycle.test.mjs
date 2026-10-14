//unit-wwebapi-lifecycle：WWebApi 建構於資源建立後失敗時釋放已建立之資源（CLAUDE_rulebook.md R-RES-1；ADR-038）。不開埠：失敗發生於伺服器啟動之前。
//作法：子行程（cwd 為 test/_tmp 下之專用資料夾，使 dist／uploadTemp／tableTags 等相對路徑皆落於此）以「不可監聽 change 之資料表 ORM」建構 WWebApi——
//WServOrm 照常建立（ORM 實例不需事件），其後建立 cacheSt（TTL 偵測計時器）與 srLog，至 WServHapiServer 時 w-serv-webdata 以「同步之表無法監聽 change」同步拋錯。
//斷言（使用者可觀察之契約）：WWebApi 原樣拋出該錯誤，且子行程於捕捉後**自行結束**（離開碼 0、未印 STILL-ALIVE）——資源未釋放時 cacheSt 之計時器使行程無法結束。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'


let fdTest = path.dirname(fileURLToPath(import.meta.url))
let fpWWebApi = path.resolve(fdTest, '../server/WWebApi.mjs')
let FD = path.resolve(fdTest, '_tmp/unit-wwebapi-lifecycle')

let child = (urlWWebApi) => `
import { EventEmitter } from 'events'
import WWebApi from ${JSON.stringify(urlWWebApi)}
//資料表 ORM：可建構、有 select 等函數，但非事件物件（無 on）→ 資料同步無法監聽 change，w-serv-webdata 於建構時拋錯
class WOrmNoEvent {
    constructor(opt) { this.opt = opt }
    async select() { return [] }
    async insert() { return { n: 0, nInserted: 0, ok: 1 } }
    async save() { return [] }
    async del() { return [] }
    async delAll() { return { n: 0, nDeleted: 0, ok: 1 } }
}
let fn = async () => ({})
try {
    WWebApi(WOrmNoEvent, './db', 'wapis', fn, () => false, () => false, { serverPort: 8574, logFd: './logs' })
    console.log('CONSTRUCTED')
}
catch (err) {
    console.log('THROW ' + (err && err.message ? err.message : String(err)))
}
setTimeout(() => {
    console.log('STILL-ALIVE ' + JSON.stringify(process.getActiveResourcesInfo()))
    process.exit(9)
}, 8000).unref()
`


describe('unit-wwebapi-lifecycle（建構失敗時釋放已建立之資源：R-RES-1）', function() {
    this.timeout(60000)

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

    it('WServHapiServer 建構失敗（資料表 ORM 不可監聽 change）→ WWebApi 原樣拋出，且子行程自行結束（cacheSt 計時器、ORM、srLog 已釋放）', function() {
        let fpChild = path.join(FD, 'child.mjs')
        fs.writeFileSync(fpChild, child(pathToFileURL(fpWWebApi).href), 'utf8')
        let r = spawnSync(process.execPath, [fpChild], { cwd: FD, encoding: 'utf8', timeout: 30000 })
        let out = `${r.stdout || ''}`
        assert.ok(out.includes('THROW kpOrm[apis] can not listen to change events'), `WWebApi 應原樣拋出 w-serv-webdata 之設定錯誤 kpOrm[apis] can not listen to change events（實得 ${out.slice(-400)}${r.stderr ? ' | stderr ' + r.stderr.slice(0, 200) : ''}）`)
        assert.ok(!out.includes('CONSTRUCTED'), '不應建構成功')
        assert.ok(!out.includes('STILL-ALIVE'), `拋錯後行程應自行結束，不得被本套件之資源撐住（實得 ${out.slice(0, 400)}）`)
        assert.strictEqual(r.status, 0, `子行程離開碼應為 0（實得 ${r.status}）`)
    })

})
