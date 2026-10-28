//unit-ormDiagLog：w-serv-orm 診斷輸出（opt.funLog，1.1.20 起，R-DIAG-01）轉入本套件 srLog 之轉送函數（R-ORMDIAG-01，ADR-054；server/ormDiagLog.mjs）。
//純函數層：假 srLog 收集寫入；真後端整合（WWebApi 確實把 funLog 交給 WServOrm、console 不多輸出）見 api-ormDiag。
//規格句（任務 20261028054319 第 154 項）：「把 label 與 safe 寫入本套件日誌；detail 不得含 id／email／token／錯誤原文之資料值；日誌寫入失敗不得影響原流程」。
import assert from 'assert'
import fs from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import path from 'path'


//被測模組: 預設為本 repo 之 server/ormDiagLog.mjs; 環境變數 API_SERVER_MODULE（指向 WWebApi.mjs 之副本，同 test/tools/apiServerChild.mjs）存在時取同夾之副本（變異測試用，副本放 ./tmp/）
let urlMod = process.env.API_SERVER_MODULE ? pathToFileURL(path.join(path.dirname(path.resolve(process.env.API_SERVER_MODULE)), 'ormDiagLog.mjs')).href : new URL('../server/ormDiagLog.mjs', import.meta.url).href
let { createOrmDiagLog, toLabel, toSafe } = await import(urlMod)


//mkLog: 假 srLog, warn 收集傳入之物件; 其他等級若被呼叫即記入 others（轉送只應走 warn）
let mkLog = () => {
    let warns = []
    let others = []
    return {
        warns,
        others,
        warn: (o) => {
            warns.push(o)
        },
        info: (o) => {
            others.push(['info', o])
        },
        error: (o) => {
            others.push(['error', o])
        },
    }
}

let EMAIL = 'victim.person@example.com'
let TOKEN = 'tok-SECRET-0123456789'


describe('unit-ormDiagLog (w-serv-orm funLog → srLog: 只收 label 與 safe)', function() {

    it('ORMDIAG-001 funLog(label, safe) → srLog.warn({ event:"orm-diag", label, safe: JSON 字串 })，且只呼叫 warn 一次（規格: 把 label 與 safe 寫入本套件日誌）', function() {
        let log = mkLog()
        let { funLog } = createOrmDiagLog(log)
        funLog('apis.save fail', { n: 1, ks: [0] })
        assert.deepStrictEqual(log.warns, [{ event: 'orm-diag', label: 'apis.save fail', safe: '{"n":1,"ks":[0]}' }])
        assert.deepStrictEqual(log.others, [])
    })

    it('ORMDIAG-002 safe 為 undefined（w-serv-orm 只有標籤之站點, 如 backup finish）→ safe 為空字串，仍寫入', function() {
        let log = mkLog()
        let { funLog } = createOrmDiagLog(log)
        funLog('apis.save row not found')
        assert.deepStrictEqual(log.warns, [{ event: 'orm-diag', label: 'apis.save row not found', safe: '' }])
    })

    it('ORMDIAG-003 第三個引數 detail（含主鍵 email、權杖、錯誤原文）不得進入 srLog，且不被讀取（getter 不被執行）', function() {
        let log = mkLog()
        let { funLog } = createOrmDiagLog(log)
        let touched = 0
        //detail 為物件且帶可列舉之取值器: 任何走訪（JSON.stringify、展開、Object.keys 後取值）都會觸發 touched
        let detail = {
            fails: [{ k: 0, id: EMAIL, err: `ORM error for ${EMAIL} token=${TOKEN}` }],
            get extra() {
                touched++
                return TOKEN
            },
        }
        funLog('apis.save fail', { n: 1, ks: [0] }, detail)
        assert.strictEqual(touched, 0, 'detail 不得被讀取')
        let txt = JSON.stringify(log.warns)
        assert.ok(!txt.includes(EMAIL), `srLog 不得含主鍵／email（實得 ${txt}）`)
        assert.ok(!txt.includes(TOKEN), `srLog 不得含權杖（實得 ${txt}）`)
        assert.ok(!txt.includes('ORM error'), `srLog 不得含錯誤原文（實得 ${txt}）`)
        assert.deepStrictEqual(log.warns, [{ event: 'orm-diag', label: 'apis.save fail', safe: '{"n":1,"ks":[0]}' }])
    })

    it('ORMDIAG-004 label 之控制字元換成 ?（防 log 注入）、超過 200 字截斷、非字串只給型別', function() {
        assert.strictEqual(toLabel('apis.save\nfail\r\u0000\u007f'), 'apis.save?fail???')
        assert.strictEqual(toLabel('a'.repeat(200)), 'a'.repeat(200))
        assert.strictEqual(toLabel('a'.repeat(201)), `${'a'.repeat(200)}...`)
        assert.strictEqual(toLabel(123), '(number)')
        assert.strictEqual(toLabel(undefined), '(undefined)')
        let obj = {
            toString() {
                return EMAIL
            },
        }
        assert.strictEqual(toLabel(obj), '(object)')
    })

    it('ORMDIAG-005 safe 序列化: JSON（控制字元由 JSON 轉義）、超過 500 字截斷、不可序列化（循環、BigInt）與函數只給型別或標記', function() {
        assert.strictEqual(toSafe({ errType: 'Error', errCode: 'ENOENT' }), '{"errType":"Error","errCode":"ENOENT"}')
        assert.strictEqual(toSafe(['a\nb']), '["a\\nb"]')
        assert.strictEqual(toSafe('x'.repeat(600)), `${JSON.stringify('x'.repeat(600)).slice(0, 500)}...`)
        let cyc = {}
        cyc.self = cyc
        assert.strictEqual(toSafe(cyc), '(unserializable)')
        assert.strictEqual(toSafe(BigInt(1)), '(unserializable)')
        assert.strictEqual(toSafe(() => EMAIL), '(function)')
        assert.strictEqual(toSafe(undefined), '')
        assert.strictEqual(toSafe(null), 'null')
    })

    it('ORMDIAG-006 srLog.warn 拋錯、srLog 缺 warn、srLog 為 undefined／null → funLog 不上拋（日誌寫入失敗不影響原流程）', function() {
        let bad = {
            warn: () => {
                throw new Error(`boom ${EMAIL}`)
            },
        }
        assert.doesNotThrow(() => createOrmDiagLog(bad).funLog('apis.save fail', { n: 1, ks: [0] }))
        for (let v of [{}, { warn: 'x' }, undefined, null]) {
            assert.doesNotThrow(() => createOrmDiagLog(v).funLog('apis.save fail', { n: 1, ks: [0] }))
        }
    })

    it('ORMDIAG-007 srLog.warn 回傳 rejected promise 亦不產生 unhandledRejection（funLog 自行吞下, 不回傳 srLog 之回傳值）', async function() {
        let got = []
        let onUnh = (e) => {
            got.push(e)
        }
        process.on('unhandledRejection', onUnh)
        try {
            let { funLog } = createOrmDiagLog({ warn: () => Promise.reject(new Error('async boom')) })
            let r = funLog('apis.save fail', { n: 1, ks: [0] })
            assert.strictEqual(r, undefined, 'funLog 不回傳值')
            await new Promise((resolve) => setTimeout(resolve, 100))
        }
        finally {
            process.off('unhandledRejection', onUnh)
        }
        assert.deepStrictEqual(got.map((e) => String(e && e.message)), [], 'srLog.warn 回傳之 rejected promise 無人處理會成為 unhandledRejection')
    })

    it('ORMDIAG-008 close() 之後不再寫入（srLog.clear() 之後再呼叫 log 方法會使宿主終止）；close 前之寫入照常', function() {
        let log = mkLog()
        let { funLog, close } = createOrmDiagLog(log)
        funLog('apis.save fail', { n: 1, ks: [0] })
        close()
        funLog('apis.save fail', { n: 1, ks: [1] })
        assert.strictEqual(log.warns.length, 1)
        assert.strictEqual(log.warns[0].safe, '{"n":1,"ks":[0]}')
        close() //重複呼叫無礙
    })

    it('ORMDIAG-009 不同實例互不干擾：一個 close 不影響另一個', function() {
        let a = mkLog()
        let b = mkLog()
        let la = createOrmDiagLog(a)
        let lb = createOrmDiagLog(b)
        la.close()
        la.funLog('x', undefined)
        lb.funLog('y', undefined)
        assert.strictEqual(a.warns.length, 0)
        assert.strictEqual(b.warns.length, 1)
    })

    //--------------------------------------------------------------------------
    //R-ORMDIAG-01 站點全集與接線之靜態盤點（盤點指令見 sgud/rule/rulebook_backend.md）: 新增建立 WServOrm 之站點時本案轉紅, 逼迫分類（接 funLog 或載明刻意不接）
    describe('R-ORMDIAG-01 接線盤點', function() {
        let fdRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
        let fdServer = process.env.API_SERVER_MODULE ? path.dirname(path.resolve(process.env.API_SERVER_MODULE)) : path.join(fdRoot, 'server')
        let srcWWebApi = fs.readFileSync(path.join(fdServer, 'WWebApi.mjs'), 'utf8')

        let walk = (fd, rs = []) => {
            for (let f of fs.readdirSync(fd, { withFileTypes: true })) {
                let p = path.join(fd, f.name)
                if (f.isDirectory()) {
                    walk(p, rs)
                }
                else if (/\.(mjs|js|vue)$/.test(f.name)) {
                    rs.push(p)
                }
            }
            return rs
        }

        it('ORMDIAG-010 建立 WServOrm 之站點全集 ＝ server/WWebApi.mjs（接 funLog）＋ g_mOrm.mjs（離線工具, 刻意不接: 無 srLog, console 即操作者終端機, 預設已不含個資）', function() {
            let files = [...walk(path.join(fdRoot, 'server')), ...walk(path.join(fdRoot, 'src')), ...walk(path.join(fdRoot, 'toolg')), path.join(fdRoot, 'srv.mjs')]
            for (let f of fs.readdirSync(fdRoot)) {
                if (/^g_.*\.mjs$/.test(f)) {
                    files.push(path.join(fdRoot, f))
                }
            }
            let sites = []
            for (let f of files) {
                let txt = fs.readFileSync(f, 'utf8')
                for (let l of txt.split(/\r?\n/)) {
                    if (/\bWServOrm\(/.test(l) && !/^\s*(\/\/|\*)/.test(l)) {
                        sites.push(`${path.relative(fdRoot, f).replace(/\\/g, '/')}: ${l.trim()}`)
                    }
                }
            }
            assert.deepStrictEqual(sites.sort(), [
                'g_mOrm.mjs: let r = WServOrm(ds, WOrm, url, db)',
                'server/WWebApi.mjs: wp = WServOrm(ds, WOrm, url, db, { funLog: ormLog.funLog })',
            ])
        })

        it('ORMDIAG-011 WWebApi 內每一處 srLog.clear() 之前都已 ormLog.close()（clear 之後再呼叫 log 方法會使宿主終止）；funLog 取自 createOrmDiagLog(srLog)，且建立於 WServOrm 之前', function() {
            let reClear = /srLog\.clear\(\)/g
            let n = 0
            let m
            while ((m = reClear.exec(srcWWebApi)) !== null) {
                n++
                //ormLog.close() 之後、srLog.clear() 之前只允許同行註解、空白、分號與 return（同一語句序列內緊鄰）
                let before = srcWWebApi.slice(Math.max(0, m.index - 160), m.index)
                assert.ok(/ormLog\.close\(\)[^\n]*\n?\s*(return\s+)?$/.test(before), `第 ${n} 處 srLog.clear() 前未見緊鄰之 ormLog.close()（前文: ${JSON.stringify(before)}）`)
            }
            assert.strictEqual(n, 3, 'WWebApi 內 srLog.clear() 應有 3 處（WServOrm 失敗、WServHapiServer 失敗、stop）')
            let iCreate = srcWWebApi.indexOf('createOrmDiagLog(srLog)')
            let iOrm = srcWWebApi.indexOf('WServOrm(ds, WOrm, url, db,')
            assert.ok(iCreate > 0 && iOrm > iCreate, 'createOrmDiagLog(srLog) 須先於 WServOrm 建立')
        })
    })
})
