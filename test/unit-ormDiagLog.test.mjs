//unit-ormDiagLog：w-serv-orm 診斷輸出（opt.funLog）轉入本套件 srLog 之接線測試（R-ORMDIAG-01，ADR-054／ADR-055；wsemi R-DIAG-01；跨套件規格 C:\opensrcOper\dspec\診斷輸出與遮罩.md）。
//遮罩、序列化與拷貝一律由 wsemi 之 genDiagFunLog 處理（D1：本套件不另寫等價實作），故本檔不測形態，只測「接線」：
//1) WWebApi.mjs 之呼叫點確為 genDiagFunLog((o) => srLog.warn(o))（取出該表達式原文，以假 srLog 實際執行）；
//2) wsemi 共用語料 _diagCases 中適用於伺服端轉接器之子集（A01～A06、A09、A10）經該呼叫點重跑（形態類案不在本檔重寫）；
//3) 舊制不留（server/ormDiagLog.mjs 已刪）、建立 w-serv-orm 之站點全集、srLog.clear() 前必先 ormLog.close()、依賴下限（safe 白名單之生產者為 w-serv-orm 1.1.22）。
//真後端整合（w-serv-orm 實際呼叫 funLog、srLog 檔內容、console 不多輸出）見 api-ormDiag；含憑證之外來值見 api-ormDiagCred。
//規格句：「把 label 與安全摘要 safe 寫入本套件日誌；不讀細節 detail（不含 id／email／token／錯誤原文之資料值）；日誌寫入失敗不得影響原流程；safe 為物件」。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import genDiagFunLog from 'wsemi/src/genDiagFunLog.mjs'
import getDiag from 'wsemi/src/getDiag.mjs'
import diagCases from 'wsemi/src/_diagCases.mjs'


let fdRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
//被測原始碼: 預設為本 repo 之 server/；環境變數 API_SERVER_MODULE（指向 WWebApi.mjs 之副本，同 test/tools/apiServerChild.mjs，變異測試用，副本放 ./tmp/）存在時取該副本所在夾
let fdServer = process.env.API_SERVER_MODULE ? path.dirname(path.resolve(process.env.API_SERVER_MODULE)) : path.join(fdRoot, 'server')
let srcWWebApi = fs.readFileSync(path.join(fdServer, 'WWebApi.mjs'), 'utf8')

//readSrc: 盤點用之讀檔; repo 之 server/WWebApi.mjs 以被測原始碼（可為變異副本）取代，使站點盤點亦能抓到變異副本內之改動
let fpRepoWWebApi = path.resolve(fdRoot, 'server', 'WWebApi.mjs')
let readSrc = (f) => (path.resolve(f) === fpRepoWWebApi ? srcWWebApi : fs.readFileSync(f, 'utf8'))

//非註解行（以 // 或 * 起頭者略）
let codeLines = srcWWebApi.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*)/.test(l))

//取出呼叫點表達式: let ormLog = <expr>
let exprs = codeLines.map((l) => l.match(/^\s*let ormLog = (.*?)\s*$/)).filter((m) => m !== null).map((m) => m[1])

//mkSite: 以假 srLog 實際執行 WWebApi.mjs 內之呼叫點表達式原文，回傳 { funLog, close }
let mkSite = (srLog) => {
    assert.strictEqual(exprs.length, 1, 'WWebApi.mjs 應恰有 1 處 let ormLog = …')
    return new Function('genDiagFunLog', 'srLog', `return ${exprs[0]}`)(genDiagFunLog, srLog)
}

let EMAIL = 'victim.person@example.com'
let TOKEN = 'tok-SECRET-0123456789'

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


describe('unit-ormDiagLog (w-serv-orm funLog → srLog: 接線測試，遮罩與序列化交 wsemi genDiagFunLog)', function() {

    describe('呼叫點', function() {

        it('ORMDIAG-001 WWebApi.mjs 之呼叫點為 genDiagFunLog((o) => srLog.warn(o))：write 直接交 srLog.warn，本套件不另包遮罩、序列化或 console', function() {
            assert.deepStrictEqual(exprs, ['genDiagFunLog((o) => srLog.warn(o))'])
            assert.ok(/^import genDiagFunLog from 'wsemi\/src\/genDiagFunLog\.mjs'$/m.test(srcWWebApi), '須自 wsemi/src/genDiagFunLog.mjs 匯入')
        })

        it('ORMDIAG-002 funLog(label, safe) → srLog.warn({ event:"orm-diag", label, safe: 物件 })，恰一次且只走 warn（規格: 把 label 與 safe 寫入本套件日誌；safe 為物件）', function() {
            let log = mkLog()
            let { funLog } = mkSite(log)
            funLog('apis.save fail', { n: 1, ks: [0] })
            assert.deepStrictEqual(log.warns, [{ event: 'orm-diag', label: 'apis.save fail', safe: { n: 1, ks: [0] } }])
            assert.deepStrictEqual(log.others, [])
        })

        it('ORMDIAG-003 只有標籤之站點（funLog 無 safe，如 apis.save row not found）→ 照寫入，無 safe 欄（1.1.23 以前為空字串）', function() {
            let log = mkLog()
            let { funLog } = mkSite(log)
            funLog('apis.save row not found')
            assert.deepStrictEqual(log.warns, [{ event: 'orm-diag', label: 'apis.save row not found', safe: undefined }])
            assert.strictEqual(JSON.stringify(log.warns[0]), '{"event":"orm-diag","label":"apis.save row not found"}', '序列化後無 safe 欄')
        })

        it('ORMDIAG-004 funLog 帶 noDetail 且只宣告 2 個參數（w-serv-orm 見 noDetail 即不取細節、不做拷貝）；第三引數 detail（含 email、權杖、錯誤原文與可列舉取值器）不讀取、不寫入', function() {
            let log = mkLog()
            let { funLog } = mkSite(log)
            assert.strictEqual(funLog.noDetail, true)
            assert.strictEqual(funLog.length, 2)
            let touched = 0
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
            for (let m of [EMAIL, TOKEN, 'ORM error']) {
                assert.ok(!txt.includes(m), `srLog 不得含 ${m}（實得 ${txt}）`)
            }
        })

        it('ORMDIAG-005 close() 之後不再寫入（srLog.clear() 之後再呼叫 log 方法會使宿主終止）；close 前之寫入照常；不同呼叫點實例互不干擾', function() {
            let a = mkLog()
            let b = mkLog()
            let la = mkSite(a)
            let lb = mkSite(b)
            la.funLog('x', { n: 1 })
            la.close()
            la.funLog('x', { n: 2 })
            lb.funLog('y', { n: 3 })
            la.close() //重複呼叫無礙
            assert.deepStrictEqual(a.warns.map((o) => o.safe), [{ n: 1 }])
            assert.deepStrictEqual(b.warns.map((o) => o.safe), [{ n: 3 }])
        })

    })


    //--------------------------------------------------------------------------
    //共用語料子集（wsemi _diagCases；規則見 wsemi R-DIAG-01 規則 12）: 伺服端轉接器適用 A 組之轉接器行為案，經本套件呼叫點（WWebApi.mjs 內該行原文）重跑。
    //排除: A07（須自訂 event 名稱，本套件用預設 'orm-diag'; getDetail 不被呼叫之性質由 wsemi 測試與 api-ormDiag 之真 w-serv-orm 鏈涵蓋）、A08（write 非函數: 本套件之 write 為固定箭頭函數）；
    //T/K/V/B/E/P/S/C/U/R/O 各組（文字遮罩、拷貝、秘密導出、摘要、對外錯誤值、出口）皆為 getDiag／maskDiag* 之案，本套件不呼叫（ORMDIAG-021 盤點鎖定）。
    describe('共用語料子集（A 組轉接器案，經本套件呼叫點）', function() {
        let IDS = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A09', 'A10']

        IDS.forEach((id, i) => {
            let label = (diagCases.cases.find((x) => x.id === id) || { label: '缺' }).label
            it(`ORMDIAG-0${10 + i} 語料 ${id}（${label}）`, async function() {
                let c = diagCases.cases.find((x) => x.id === id)
                assert.ok(c, `語料缺 ${id}（wsemi 共用語料已變動，須重新核對適用子集）`)
                let unh = 0
                let onUnh = () => {
                    unh++
                }
                process.on('unhandledRejection', onUnh)
                try {
                    let ctx = diagCases.mkCtx({ unhandled: () => unh, tick: () => new Promise((resolve) => setTimeout(resolve, 50)) })
                    //api: 轉接器經本套件呼叫點（write 為語料給的函數，掛在假 srLog.warn 之後）; getDiag 供 A10 之對照
                    let api = {
                        getDiag,
                        genDiagFunLog: (write) => mkSite({ warn: (o) => write(o) }),
                    }
                    let out = await c.call(api, ctx)
                    assert.strictEqual(diagCases.verify(c, out, ctx), null, `${id} 失敗`)
                }
                finally {
                    process.off('unhandledRejection', onUnh)
                }
            })
        })

        it('ORMDIAG-019 語料子集涵蓋 wsemi 語料中全部標 genDiagFunLog 之案，排除者僅 A07、A08（wsemi 新增轉接器案時本案轉紅，逼迫分類）', function() {
            let all = diagCases.cases.filter((c) => c.fn === 'genDiagFunLog').map((c) => c.id).sort()
            assert.deepStrictEqual(all, ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'])
            assert.deepStrictEqual(all.filter((id) => !IDS.includes(id)), ['A07', 'A08'])
        })
    })


    //--------------------------------------------------------------------------
    //舊制不留、站點全集、依賴下限（R-ORMDIAG-01 盤點指令見 sgud/rule/rulebook_backend.md）
    describe('R-ORMDIAG-01 接線盤點', function() {
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

        it('ORMDIAG-020 舊制不留（專案原則 14）: server/ormDiagLog.mjs 已刪，server／src／toolg／srv.mjs／g_*.mjs 無 createOrmDiagLog、ormDiagLog.mjs 字樣', function() {
            assert.ok(!fs.existsSync(path.join(fdRoot, 'server', 'ormDiagLog.mjs')))
            assert.ok(!fs.existsSync(path.join(fdServer, 'ormDiagLog.mjs')))
            let files = [...walk(path.join(fdRoot, 'server')), ...walk(path.join(fdRoot, 'src')), ...walk(path.join(fdRoot, 'toolg')), path.join(fdRoot, 'srv.mjs')]
            for (let f of fs.readdirSync(fdRoot)) {
                if (/^g_.*\.mjs$/.test(f)) {
                    files.push(path.join(fdRoot, f))
                }
            }
            for (let f of files) {
                let txt = readSrc(f)
                assert.ok(!/createOrmDiagLog|ormDiagLog\.mjs/.test(txt), `${path.relative(fdRoot, f)} 仍有舊制字樣`)
            }
        })

        it('ORMDIAG-021 本套件只用 genDiagFunLog：server／src／toolg／srv.mjs／g_*.mjs 無 getDiag(、getDiagSecrets、maskDiag*、getDiagBriefErr 呼叫（新增即轉紅，須補接線案並擴充語料子集）', function() {
            let files = [...walk(path.join(fdRoot, 'server')), ...walk(path.join(fdRoot, 'src')), ...walk(path.join(fdRoot, 'toolg')), path.join(fdRoot, 'srv.mjs')]
            for (let f of fs.readdirSync(fdRoot)) {
                if (/^g_.*\.mjs$/.test(f)) {
                    files.push(path.join(fdRoot, f))
                }
            }
            let hits = []
            for (let f of files) {
                for (let l of readSrc(f).split(/\r?\n/)) {
                    if (!/^\s*(\/\/|\*)/.test(l) && /\b(getDiag|getDiagSecrets|getDiagBriefErr|maskDiag[A-Za-z]*)\b/.test(l)) {
                        hits.push(`${path.relative(fdRoot, f).replace(/\\/g, '/')}: ${l.trim()}`)
                    }
                }
            }
            assert.deepStrictEqual(hits, [])
        })

        it('ORMDIAG-022 建立 WServOrm 之站點全集 ＝ server/WWebApi.mjs（接 funLog）＋ g_mOrm.mjs（離線工具, 刻意不接: 無 srLog, console 即操作者終端機, 預設已不含個資）', function() {
            let files = [...walk(path.join(fdRoot, 'server')), ...walk(path.join(fdRoot, 'src')), ...walk(path.join(fdRoot, 'toolg')), path.join(fdRoot, 'srv.mjs')]
            for (let f of fs.readdirSync(fdRoot)) {
                if (/^g_.*\.mjs$/.test(f)) {
                    files.push(path.join(fdRoot, f))
                }
            }
            let sites = []
            for (let f of files) {
                let txt = readSrc(f)
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

        it('ORMDIAG-023 WWebApi 內每一處 srLog.clear() 之前都已 ormLog.close()（clear 之後再呼叫 log 方法會使宿主終止）；funLog 建立於 WServOrm 之前', function() {
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
            let iCreate = srcWWebApi.indexOf('let ormLog = genDiagFunLog(')
            let iOrm = srcWWebApi.indexOf('WServOrm(ds, WOrm, url, db,')
            assert.ok(iCreate > 0 && iOrm > iCreate, 'ormLog（genDiagFunLog）須先於 WServOrm 建立')
        })

        it('ORMDIAG-024 依賴下限: wsemi ≥ 1.9.31（genDiagFunLog）、w-serv-orm ≥ 1.1.22（funLog 之 safe 只留白名單鍵、errType 只列內建類別名; 本套件不在 funLog 端再過濾）', function() {
            let pkg = JSON.parse(fs.readFileSync(path.join(fdRoot, 'package.json'), 'utf8'))
            let ge = (spec, min) => {
                let a = String(spec).replace(/^[\^~>=\s]+/, '').split('.').map(Number)
                let b = min.split('.').map(Number)
                for (let i = 0; i < 3; i++) {
                    if (a[i] !== b[i]) {
                        return a[i] > b[i]
                    }
                }
                return true
            }
            assert.ok(ge(pkg.dependencies.wsemi, '1.9.31'), `wsemi 下限 ${pkg.dependencies.wsemi}`)
            assert.ok(ge(pkg.dependencies['w-serv-orm'], '1.1.22'), `w-serv-orm 下限 ${pkg.dependencies['w-serv-orm']}`)
            let v = (n) => JSON.parse(fs.readFileSync(path.join(fdRoot, 'node_modules', n, 'package.json'), 'utf8')).version
            assert.ok(ge(v('wsemi'), '1.9.31'), `已安裝 wsemi ${v('wsemi')}`)
            assert.ok(ge(v('w-serv-orm'), '1.1.22'), `已安裝 w-serv-orm ${v('w-serv-orm')}`)
        })
    })
})
