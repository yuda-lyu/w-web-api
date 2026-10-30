//unit-ormDiagLog：w-serv-orm 診斷輸出（opt.funLog）轉入本套件 srLog 之接線測試（R-ORMDIAG-01，ADR-054／ADR-055；wsemi R-DIAG-01；跨套件規格 C:\opensrcOper\dspec\診斷輸出與遮罩.md）。
//遮罩、序列化與拷貝一律由 wsemi 之 genDiagFunLog 處理（D1：本套件不另寫等價實作），故本檔不測形態，只測「接線」：
//1) WWebApi.mjs 之呼叫點確為 genDiagFunLog((o) => srLog.warn(o), { safeKeys: SAFE_KEYS })（取出該表達式原文，以假 srLog 實際執行），SAFE_KEYS 取自 w-serv-orm 公開之 safeKeys.mjs（第二道防線：白名單外之鍵不入日誌）；
//2) wsemi 共用語料 _diagCases 中適用於伺服端轉接器之子集（A01～A06、A09、A10）經該呼叫點重跑（形態類案不在本檔重寫；語料之鍵名非 SAFE_KEYS，故以「SAFE_KEYS ＋ 語料鍵名」為白名單執行呼叫點原文，白名單過濾本身由 ORMDIAG-006／007 以真 SAFE_KEYS 驗證）；
//3) 舊制不留（server/ormDiagLog.mjs 已刪）、建立 w-serv-orm 之站點全集、srLog.clear() 前必先 ormLog.close()、依賴下限（safeKeys 選項為 wsemi 1.9.33、SAFE_KEYS 為 w-serv-orm 1.1.23）、不 import w-serv-orm 內部檔（診斷相關者）。
//真後端整合（w-serv-orm 實際呼叫 funLog、srLog 檔內容、console 不多輸出）見 api-ormDiag；funLog 收到白名單外之鍵時之真 srLog 見 api-ormDiagSafeKeys；含憑證之外來值見 api-ormDiagCred。
//規格句：「把 label 與安全摘要 safe 寫入本套件日誌；safe 只含 w-serv-orm 宣告之白名單鍵與 errType、errCode；不讀細節 detail（不含 id／email／token／錯誤原文之資料值）；日誌寫入失敗不得影響原流程；safe 為物件」。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import genDiagFunLog from 'wsemi/src/genDiagFunLog.mjs'
import getDiag from 'wsemi/src/getDiag.mjs'
import diagCases from 'wsemi/src/_diagCases.mjs'
import { SAFE_KEYS } from 'w-serv-orm/src/safeKeys.mjs'


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
//  safeKeys: 呼叫點表達式內 SAFE_KEYS 識別字所指之名單，預設為 w-serv-orm 公開之 SAFE_KEYS（與 WWebApi.mjs 匯入者同一物件）；共用語料之鍵名不在其內，語料子集改傳擴充名單
let mkSite = (srLog, safeKeys = SAFE_KEYS) => {
    assert.strictEqual(exprs.length, 1, 'WWebApi.mjs 應恰有 1 處 let ormLog = …')
    return new Function('genDiagFunLog', 'srLog', 'SAFE_KEYS', `return ${exprs[0]}`)(genDiagFunLog, srLog, safeKeys)
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

        it('ORMDIAG-001 WWebApi.mjs 之呼叫點為 genDiagFunLog((o) => srLog.warn(o), { safeKeys: SAFE_KEYS })：write 直接交 srLog.warn，本套件不另包遮罩、序列化或 console；白名單取自 w-serv-orm 公開之 safeKeys.mjs', function() {
            assert.deepStrictEqual(exprs, ['genDiagFunLog((o) => srLog.warn(o), { safeKeys: SAFE_KEYS })'])
            assert.ok(/^import genDiagFunLog from 'wsemi\/src\/genDiagFunLog\.mjs'$/m.test(srcWWebApi), '須自 wsemi/src/genDiagFunLog.mjs 匯入')
            assert.ok(/^import \{ SAFE_KEYS \} from 'w-serv-orm\/src\/safeKeys\.mjs'$/m.test(srcWWebApi), '須自 w-serv-orm/src/safeKeys.mjs（公開入口）匯入 SAFE_KEYS')
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

        it('ORMDIAG-006 safe 含白名單外之鍵（password、token、email、巢狀物件、自有 __proto__ 鍵）→ srLog 只收 SAFE_KEYS 內之鍵與 errType、errCode；原值不入日誌行（規格: safe 只含 w-serv-orm 宣告之白名單鍵）', function() {
            let log = mkLog()
            let { funLog } = mkSite(log)
            let safe = Object.assign(JSON.parse('{"__proto__":{"leak":"PROTO-SECRET"}}'), {
                n: 1,
                ks: [0],
                password: 'PW-SECRET-1',
                token: TOKEN,
                email: EMAIL,
                sub: { password: 'NESTED-SECRET', k: 1 },
                errType: 'Error',
                errCode: 'PROBE_CODE',
            })
            funLog('apis.save fail', safe)
            assert.deepStrictEqual(log.warns, [{ event: 'orm-diag', label: 'apis.save fail', safe: { n: 1, ks: [0], errType: 'Error', errCode: 'PROBE_CODE' } }])
            let txt = JSON.stringify(log.warns)
            for (let m of ['PW-SECRET-1', TOKEN, EMAIL, 'NESTED-SECRET', 'PROTO-SECRET', 'password', 'sub', 'leak']) {
                assert.ok(!txt.includes(m), `srLog 不得含 ${m}（實得 ${txt}）`)
            }
            //全為白名單外之鍵: 日誌行不含任何其值
            let log2 = mkLog()
            mkSite(log2).funLog('x', { password: 'PW-SECRET-2', sub: { a: 1 } })
            assert.ok(!JSON.stringify(log2.warns).includes('PW-SECRET-2'))
            assert.ok(!JSON.stringify(log2.warns).includes('sub'))
            //safe 非物件（只有標籤之站點）: 照寫，無 safe 欄（不因白名單而拋錯）
            let log3 = mkLog()
            mkSite(log3).funLog('apis.save row not found')
            assert.strictEqual(JSON.stringify(log3.warns[0]), '{"event":"orm-diag","label":"apis.save row not found"}')
        })

        it('ORMDIAG-007 SAFE_KEYS 內每一個鍵皆保留（w-serv-orm 實際產出之鍵不被第二道防線丟失）；errType、errCode 恆保留；巢狀值（陣列）形狀不變', function() {
            assert.ok(Array.isArray(SAFE_KEYS) && SAFE_KEYS.length > 0)
            assert.ok(SAFE_KEYS.includes('n') && SAFE_KEYS.includes('ks'), 'api-ormDiag 之真實失敗情境產出 n、ks，須在白名單內')
            for (let k of SAFE_KEYS) {
                let log = mkLog()
                mkSite(log).funLog('x', { [k]: [0, 2] })
                assert.deepStrictEqual(log.warns[0].safe, { [k]: [0, 2] }, `白名單鍵 ${k} 被丟失`)
            }
            let all = {}
            for (let k of SAFE_KEYS) {
                all[k] = 7
            }
            all.errType = 'TypeError'
            all.errCode = 'C9'
            let log = mkLog()
            mkSite(log).funLog('x', all)
            assert.deepStrictEqual(log.warns[0].safe, all, '全部白名單鍵與 errType、errCode 一次送入應全保留')
            let log2 = mkLog()
            mkSite(log2).funLog('x', { errType: 'Error', errCode: 'E1', other: 1 })
            assert.deepStrictEqual(log2.warns[0].safe, { errType: 'Error', errCode: 'E1' }, 'errType、errCode 不在 SAFE_KEYS 內仍恆保留')
        })

    })


    //--------------------------------------------------------------------------
    //共用語料子集（wsemi _diagCases；規則見 wsemi R-DIAG-01 規則 12）: 伺服端轉接器適用 A 組之轉接器行為案，經本套件呼叫點（WWebApi.mjs 內該行原文）重跑。
    //排除: A07（須自訂 event 名稱，本套件用預設 'orm-diag'; getDetail 不被呼叫之性質由 wsemi 測試與 api-ormDiag 之真 w-serv-orm 鏈涵蓋）、A08（write 非函數: 本套件之 write 為固定箭頭函數）、
    //A11～A13（自帶 opt 以驗 safeKeys 之語意——給了/未給/無法使用/__proto__ 鍵; 本套件呼叫點之 opt 固定為 { safeKeys: SAFE_KEYS }，無從轉送語料之 opt；safeKeys 之語意歸 wsemi，本套件之白名單行為由 ORMDIAG-006／007 與 api-ormDiagSafeKeys 驗證）；
    //T/K/V/B/E/P/S/C/U/R/O 各組（文字遮罩、拷貝、秘密導出、摘要、對外錯誤值、出口）皆為 getDiag／maskDiag* 之案，本套件不呼叫（ORMDIAG-021 盤點鎖定）。
    //白名單: 語料 A 組之 safe 鍵名（a、b、s、self、entry、shown、k0～k2999、截斷標記）不在 SAFE_KEYS 內，經真白名單會被丟棄而使形態類案無從觀察，故呼叫點原文以「SAFE_KEYS ＋ 語料鍵名」執行；呼叫點之其餘部分（write、close、label 正規化）仍為原文。
    describe('共用語料子集（A 組轉接器案，經本套件呼叫點）', function() {
        let IDS = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A09', 'A10']
        let CORPUS_KEYS = [...SAFE_KEYS, 'a', 'b', 's', 'self', 'entry', 'shown', '[Truncated]', '[Truncated]#2', ...Array.from({ length: 3000 }, (v, i) => `k${i}`)]

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
                        genDiagFunLog: (write) => mkSite({ warn: (o) => write(o) }, CORPUS_KEYS),
                    }
                    let out = await c.call(api, ctx)
                    assert.strictEqual(diagCases.verify(c, out, ctx), null, `${id} 失敗`)
                }
                finally {
                    process.off('unhandledRejection', onUnh)
                }
            })
        })

        it('ORMDIAG-019 語料子集涵蓋 wsemi 語料中全部標 genDiagFunLog 之案，排除者僅 A07、A08、A11、A12、A13（wsemi 新增轉接器案時本案轉紅，逼迫分類）', function() {
            let all = diagCases.cases.filter((c) => c.fn === 'genDiagFunLog').map((c) => c.id).sort()
            assert.deepStrictEqual(all, ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12', 'A13'])
            assert.deepStrictEqual(all.filter((id) => !IDS.includes(id)), ['A07', 'A08', 'A11', 'A12', 'A13'])
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

        it('ORMDIAG-024 依賴下限: wsemi ≥ 1.9.33（genDiagFunLog 之 opt.safeKeys）、w-serv-orm ≥ 1.1.23（公開 SAFE_KEYS; 1.1.22 起 funLog 之 safe 只留白名單鍵、errType 只列內建類別名）', function() {
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
            assert.ok(ge(pkg.dependencies.wsemi, '1.9.33'), `wsemi 下限 ${pkg.dependencies.wsemi}`)
            assert.ok(ge(pkg.dependencies['w-serv-orm'], '1.1.23'), `w-serv-orm 下限 ${pkg.dependencies['w-serv-orm']}`)
            let v = (n) => JSON.parse(fs.readFileSync(path.join(fdRoot, 'node_modules', n, 'package.json'), 'utf8')).version
            assert.ok(ge(v('wsemi'), '1.9.33'), `已安裝 wsemi ${v('wsemi')}`)
            assert.ok(ge(v('w-serv-orm'), '1.1.23'), `已安裝 w-serv-orm ${v('w-serv-orm')}`)
        })

        //本套件對 w-serv-orm/src/ 之 import 全表（第 198 項 b-api 逐一判定; 全表與判定見 sgud/rule/rulebook_backend.md R-ORMDIAG-01〈w-serv-orm 內部檔 import 全表〉）:
        //  公開入口: WServOrm.mjs（主入口）、safeKeys.mjs（1.1.23 起公開 SAFE_KEYS）、baseline.mjs（README〈純函數子模組〉, 前後端同構）
        //  非診斷相關之既有 import（本輪不動; 不屬診斷轉接）: checkOptRemoved.mjs（WWebApi 於任何副作用前拒絕已移除之 opt, 訊息單一擁有者為 w-serv-orm; 無公開替代）、getDb.mjs／genTestData.mjs（離線工具 g_backupDb／g_initialTestData）
        //  禁止: 任何其他檔（尤其 getDiagBrief.mjs——w-serv-orm 內部診斷檔, 1.1.23 起不再提供給下游）
        let ALLOWED = {
            'w-serv-orm/src/WServOrm.mjs': '公開主入口',
            'w-serv-orm/src/safeKeys.mjs': '公開 SAFE_KEYS（1.1.23 起）',
            'w-serv-orm/src/baseline.mjs': '公開純函數子模組',
            'w-serv-orm/src/checkOptRemoved.mjs': '既有, 非診斷相關',
            'w-serv-orm/src/getDb.mjs': '既有, 離線工具',
            'w-serv-orm/src/genTestData.mjs': '既有, 離線工具',
        }

        //scanSpecs: 掃出一組檔案內所有指向 w-serv-orm 之模組指定詞（靜態 import／export from、動態 import()、require()），略過註解行
        let scanSpecs = (files) => {
            let hits = []
            let re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"](w-serv-orm(?:\/[^'"]*)?)['"]/g
            for (let f of files) {
                for (let l of readSrc(f).split(/\r?\n/)) {
                    if (/^\s*(\/\/|\*|\/\*)/.test(l)) {
                        continue
                    }
                    let m
                    re.lastIndex = 0
                    while ((m = re.exec(l)) !== null) {
                        hits.push({ spec: m[1], file: path.relative(fdRoot, f).replace(/\\/g, '/') })
                    }
                }
            }
            return hits
        }

        //scanFiles: server／src／toolg／test（略過 _tmp、pics、staLogs-golden）／srv.mjs／g_*.mjs
        let scanFiles = () => {
            let files = [...walk(path.join(fdRoot, 'server')), ...walk(path.join(fdRoot, 'src')), ...walk(path.join(fdRoot, 'toolg')), path.join(fdRoot, 'srv.mjs')]
            let walkTest = (fd) => {
                for (let f of fs.readdirSync(fd, { withFileTypes: true })) {
                    let p = path.join(fd, f.name)
                    if (f.isDirectory()) {
                        if (!['_tmp', 'pics', 'staLogs-golden'].includes(f.name)) {
                            walkTest(p)
                        }
                    }
                    else if (/\.(mjs|js)$/.test(f.name)) {
                        files.push(p)
                    }
                }
            }
            walkTest(path.join(fdRoot, 'test'))
            for (let f of fs.readdirSync(fdRoot)) {
                if (/^g_.*\.mjs$/.test(f)) {
                    files.push(path.join(fdRoot, f))
                }
            }
            return files
        }

        it('ORMDIAG-025 本套件對 w-serv-orm 之 import 只限已判定之 6 個模組（公開入口＋非診斷相關之既有者）; 不得 import 內部檔（getDiagBrief.mjs 等）或 UMD 主入口', function() {
            let hits = scanSpecs(scanFiles())
            let bad = hits.filter((h) => !Object.prototype.hasOwnProperty.call(ALLOWED, h.spec))
            assert.deepStrictEqual(bad, [], `未列入判定之 w-serv-orm import（內部檔不得 import; 確有需要須先判定並更新 ALLOWED 與帳本）: ${JSON.stringify(bad)}`)
            //盤點有效: 每個列入的模組確有人用（表不得有名無實; 用者消失時須同步刪表）
            let used = new Set(hits.map((h) => h.spec))
            assert.deepStrictEqual([...used].sort(), Object.keys(ALLOWED).sort())
        })

        it('ORMDIAG-026 SAFE_KEYS 單一來源: WWebApi.mjs 僅自 w-serv-orm/src/safeKeys.mjs 匯入一次、不另行宣告; safeKeys 選項恰一處且值為該識別字（不為字面陣列、複製或展開）', function() {
            let imports = srcWWebApi.split(/\r?\n/).filter((l) => /^\s*import\b.*\bSAFE_KEYS\b/.test(l))
            assert.deepStrictEqual(imports, ['import { SAFE_KEYS } from \'w-serv-orm/src/safeKeys.mjs\''])
            let code = codeLines.join('\n')
            assert.ok(!/\b(?:let|const|var|function|class)\s+SAFE_KEYS\b/.test(code), 'WWebApi.mjs 不得另行宣告 SAFE_KEYS')
            assert.ok(!/\bSAFE_KEYS\s*=[^=]/.test(code), 'WWebApi.mjs 不得重新指定 SAFE_KEYS')
            let opts = [...code.matchAll(/\bsafeKeys\s*:\s*([^,}\n]*)/g)].map((m) => m[1].trim())
            assert.deepStrictEqual(opts, ['SAFE_KEYS'], 'safeKeys 選項應恰一處, 值為 SAFE_KEYS 識別字')
            //本套件其餘檔案不得另有 safeKeys 白名單（不寫第二份）
            let others = []
            for (let f of [...walk(path.join(fdRoot, 'server')), ...walk(path.join(fdRoot, 'src')), ...walk(path.join(fdRoot, 'toolg')), path.join(fdRoot, 'srv.mjs')]) {
                if (path.resolve(f) === fpRepoWWebApi) {
                    continue
                }
                for (let l of readSrc(f).split(/\r?\n/)) {
                    if (!/^\s*(\/\/|\*)/.test(l) && /\bsafeKeys\b|\bSAFE_KEYS\b/.test(l)) {
                        others.push(`${path.relative(fdRoot, f).replace(/\\/g, '/')}: ${l.trim()}`)
                    }
                }
            }
            assert.deepStrictEqual(others, [])
        })
    })
})
