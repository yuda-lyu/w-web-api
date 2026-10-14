//unit-wwebapi-opt：WWebApi 建構期之設定檢核（CLAUDE_rulebook.md R-ORM-1、R-ORM-2；ADR-038）。純 unit：所有案例皆於伺服器建立之前拋錯，不開埠。
//R-ORM-1：w-serv-orm 1.1.9 起移除之 useCheckUser／getUserById／useExcludeWhenNotAdmin——未給、null、false 照常；其他值於「任何副作用之前」拋 Error，
//  訊息之單一擁有者為 w-serv-orm（以 checkOptRemoved 本身產生期望訊息，不在測試內另寫一份）。
//R-ORM-2：serverPort 未給取 11005；有給須為 1–65535 之整數（含數字字串），否則拋 'invalid opt.serverPort'。
//觀察「已通過檢查」之法：一律另給 logNumKeep:-1，使其後之 srLog 初始化以 'invalid logNumKeep[-1]…' 拋錯（server/srLog.mjs，先於 WSyslog 建立，無副作用）——
//  拋的是 srLog 之錯即代表前面之檢查已放行；拋的是被測規則之錯即代表在 srLog（第一個副作用）之前就被擋下。
//副作用斷言：給定之資料庫路徑（test/_tmp/unit-wwebapi-opt/db）不得被建立。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import checkOptRemoved from 'w-serv-orm/src/checkOptRemoved.mjs'
import WWebApi from '../server/WWebApi.mjs'


let FD = path.resolve('./test/_tmp/unit-wwebapi-opt')
let URL_DB = path.join(FD, 'db')
let MSG_SRLOG = 'invalid logNumKeep[-1], must be positive integer'
let fnUser = async () => ({})
let fnVerify = () => false


//建構並回傳拋出之訊息（未拋錯即測試失敗：本檔所有案例皆應於建立伺服器前拋錯）
function ctorMsg(opt) {
    try {
        WWebApi(WOrm, URL_DB, 'wapis', fnUser, fnVerify, fnVerify, { logFd: path.join(FD, 'logs'), ...opt, logNumKeep: -1 })
    }
    catch (err) {
        return err instanceof Error ? err.message : String(err)
    }
    throw new Error('WWebApi 應於建構時拋錯但未拋')
}

//checkOptRemoved 對該 opt 之訊息（期望值之唯一來源）
function removedMsg(opt) {
    try {
        checkOptRemoved(opt)
    }
    catch (err) {
        return err.message
    }
    return null
}


describe('unit-wwebapi-opt（WWebApi 建構期之設定檢核：R-ORM-1 三鍵 fail-fast、R-ORM-2 serverPort）', function() {

    before(function() {
        fs.rmSync(FD, { recursive: true, force: true })
    })

    after(function() {
        fs.rmSync(FD, { recursive: true, force: true })
        let fdTmp = path.resolve('./test/_tmp')
        if (fs.existsSync(fdTmp) && fs.readdirSync(fdTmp).length === 0) {
            fs.rmSync(fdTmp, { recursive: true, force: true })
        }
    })

    for (let k of ['useCheckUser', 'getUserById', 'useExcludeWhenNotAdmin']) {

        it(`R-ORM-1 ${k} 給予非 null/false 之值（true、'y'、0、''、函數、{}）→ 建構即拋 w-serv-orm 之訊息，且先於 srLog 初始化、未建立資料庫`, function() {
            for (let v of [true, 'y', 0, '', () => null, {}]) {
                let expected = removedMsg({ [k]: v })
                assert.ok(typeof expected === 'string' && expected.includes(`opt.${k} has been removed`), `checkOptRemoved 對 ${k}=${String(v)} 應拋錯`)
                assert.strictEqual(ctorMsg({ [k]: v }), expected, `${k}=${typeof v === 'function' ? 'function' : JSON.stringify(v)} 應拋 checkOptRemoved 之訊息（先於 srLog）`)
            }
            assert.ok(!fs.existsSync(URL_DB), '拋錯前不得建立資料庫')
        })

        it(`R-ORM-1 ${k} 未給／null／false → 通過檢查（其後才由 srLog 拋錯）`, function() {
            for (let v of [undefined, null, false]) {
                assert.strictEqual(ctorMsg({ [k]: v }), MSG_SRLOG, `${k}=${String(v)} 應通過檢查`)
            }
            assert.ok(!fs.existsSync(URL_DB), '拋錯前不得建立資料庫')
        })

    }

    it('R-ORM-2 serverPort 無效（0、-1、70000、1.5、\'abc\'、true、65536）→ 建構即拋 invalid opt.serverPort（先於 srLog、不退回預設）', function() {
        for (let v of [0, -1, 70000, 1.5, 'abc', true, 65536]) {
            assert.strictEqual(ctorMsg({ serverPort: v }), 'invalid opt.serverPort', `serverPort=${JSON.stringify(v)} 應拋 invalid opt.serverPort`)
        }
        assert.ok(!fs.existsSync(URL_DB), '拋錯前不得建立資料庫')
    })

    it('R-ORM-2 serverPort 未給／null／1／65535／\'11005\' → 通過檢查（其後才由 srLog 拋錯）', function() {
        for (let v of [undefined, null, 1, 65535, '11005']) {
            assert.strictEqual(ctorMsg({ serverPort: v }), MSG_SRLOG, `serverPort=${JSON.stringify(v)} 應通過檢查`)
        }
    })

})
