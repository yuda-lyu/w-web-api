//unit-consoleSites：console 輸出站點之全集不變式（ADR-057，取代 ADR-033／048 之「console 印使用者物件，記錄不修」）。
//規格依據：C:\opensrcOper\dspec\診斷輸出與遮罩.md D2「預設不輸出資料值」（使用者 2026-10-29 裁示）、輸入參數之檢測機制.md §6 V20「訊息與 throw 前之 console 皆不含輸入值」。
//範圍：伺服端出口——server/**、srv.mjs、g_*.mjs、toolg/**、src/schema/**（前後端共用之 schema，funTest 於伺服端執行）；瀏覽器端 src/ 其餘檔案與 test/ 不在此（見 sgud/rule/rulebook_backend.md R-CONSOLE-01〈站點全集〉）。
//作法：掃描器（test/tools/consoleSites.mjs，以 eslint 之 AST）逐一檢視每個 console 站點之每個引數，只准：字面值、樣板字串（其 ${} 皆安全）、
//核可之輸出函數（maskTok／shapeOf／typeOf／payloadShape／errBrief／pickErrName／pickErrCode）、筆數（.length）、typeof，或 test/tools/consoleSites.mjs 之 EXEMPT 清單所列（刻意不套，各附理由）；
//其餘（裸識別字、成員存取、物件字面值等）一律判為「可能輸出資料值」而失敗。新增站點若直接印變數，此檔轉紅，須改印形狀或列入 EXEMPT（附理由）。
//環境變數 CONSOLE_SITES_ROOT 可指向另一份原始碼樹（修前紅對 HEAD 副本、變異測試對變異副本重跑同一檔，副本放 ./tmp/）。
//動態觸發（以含識別值之測資實際走各站點）見 test/api-logLeak.test.mjs；本檔補足其無法由外部觸發之站點（防禦性分支、建構期內部失敗）。
import assert from 'assert'
import path from 'path'
import { fileURLToPath } from 'url'
import { scanCode, scanRoot, freshExempt } from './tools/consoleSites.mjs'


let fdTest = path.dirname(fileURLToPath(import.meta.url))
let ROOT = process.env.CONSOLE_SITES_ROOT ? path.resolve(process.env.CONSOLE_SITES_ROOT) : path.resolve(fdTest, '..')


describe('unit-consoleSites (console 輸出站點全集：只准形狀、型別、固定詞彙，不輸出資料值)', function() {
    this.timeout(120000)

    //spec D2：掃描器本身須分得出「印值」與「印形狀」（變異：把掃描器放寬，這條轉紅）
    it('SITE-001 掃描器自檢：印值之寫法判為不安全，印形狀／型別／固定詞彙判為安全', function() {
        let D = '$' //樣板字串之 ${ 以串接組出（專案 eslint 禁字串內含 ${ ）
        let bad = [
            `console.log('user', user)`,
            `console.log('payload', req.payload)`,
            `console.log('x', { id: user.id })`,
            'console.log(`email[' + D + '{user.email}]`)',
            `console.log('keyTable', keyTable)`,
            `console.log(err)`,
            `console.log('a', 'b' + user.name)`,
            `console.log(...args)`,
            `console.error('q', req.query)`,
            `process.stdout.write(String(user))`,
            `console.log(isOk ? 'ok' : user)`,
            `console.log(a && user)`,
            `console.log(typeof user, user.length > 1, !user)`,
        ]
        for (let code of bad) {
            let sites = scanCode(code)
            assert.strictEqual(sites.length, 1, `應掃到 1 個站點: ${code}`)
            assert.strictEqual(sites[0].safe, false, `應判為不安全: ${code}`)
        }
        let good = [
            `console.log('user', shapeOf(user))`,
            `console.log('invalid url', typeOf(url))`,
            `console.log('token', maskTok(token))`,
            `console.log(errBrief(err))`,
            `console.log('SSO error', pickErrName(err), pickErrCode(err))`,
            `console.log('rows', rs.length)`,
            'console.log(`rows[' + D + '{rows.length}] invalid`)',
            `console.log('a' + 'b')`,
            `console.log(isOk ? 'ok' : shapeOf(user))`,
            `console.log('payload', payloadShape(payload))`,
            'console.log(\'state\', `(' + D + '{typeof state})`)',
            `// console.log('user', user)\nlet s = "console.log(user)"`,
        ]
        for (let code of good) {
            let sites = scanCode(code)
            let isComment = code.startsWith('//')
            assert.strictEqual(sites.length, isComment ? 0 : 1, `註解與字串內之 console 不算站點: ${code}`)
            assert.ok(sites.every((s) => s.safe), `應判為安全: ${code}`)
        }
    })

    //spec D2、V20：全部伺服端站點之每個引數皆不輸出資料值
    it('SITE-002 伺服端全部 console 站點：每個引數皆安全（無裸變數、使用者物件、請求本體、查詢參數、外來錯誤原文）', function() {
        let sites = scanRoot(ROOT, freshExempt())
        let unsafe = sites.filter((s) => !s.safe)
        let msg = unsafe.map((s) => `${s.file}:${s.line} ${s.call}(${s.args.filter((a) => !a.safe).map((a) => `${a.text} ← ${a.why}`).join(' | ')})`).join('\n')
        assert.strictEqual(unsafe.length, 0, `以下站點可能輸出資料值（改印 shapeOf／typeOf／固定詞彙，或列入 EXEMPT 並附理由）:\n${msg}`)
    })

    //掃描器須真的掃到站點（防掃描器空轉而恆綠）：下限取自盤點（2026-10-31：WWebApi.mjs 70 站、syncApis 2、srv 7、g_auditExternalRows 8、g_initialTestData 2、g_provideApis 3、
    //src/schema/tables/apis.mjs 1，合計 93 站）。站點被刪除或改寫為非 console 輸出時此條轉紅，提醒同步更新盤點（sgud/rule/rulebook_backend.md R-CONSOLE-01）
    it('SITE-003 掃描涵蓋面：伺服端檔案皆被掃描，站點數不低於盤點下限', function() {
        let sites = scanRoot(ROOT, freshExempt())
        let by = {}
        for (let s of sites) {
            by[s.file] = (by[s.file] || 0) + 1
        }
        let floor = { 'server/WWebApi.mjs': 70, 'server/syncApis.mjs': 2, 'srv.mjs': 7, 'g_auditExternalRows.mjs': 8, 'g_initialTestData.mjs': 2, 'g_provideApis.mjs': 3, 'src/schema/tables/apis.mjs': 1 }
        for (let [f, n] of Object.entries(floor)) {
            assert.ok((by[f] || 0) >= n, `${f} 站點 ${by[f] || 0}（盤點 ${n}）`)
        }
        assert.ok(sites.length >= 93, `全伺服端站點 ${sites.length}（盤點 93）`)
    })

    //spec D2：認證階段（checkUser、授權拒絕、userId 無效）印使用者物件之站點全數改印 shapeOf；請求本體改印 payloadShape；查詢參數改印 shapeOf
    it('SITE-004 認證與請求驗證站點：印 user／query／payload 之引數一律經形狀函數', function() {
        let sites = scanRoot(ROOT, freshExempt()).filter((s) => s.file === 'server/WWebApi.mjs')
        let withLabel = (label) => sites.filter((s) => s.args.length >= 2 && s.args[0].text === `'${label}'`)
        let users = withLabel('user')
        assert.ok(users.length >= 7, `'user' 站點 ${users.length}（checkUser 4、getAndVerifyClientUser 1、getAndVerifyAppUser 1、userId 無效 1）`)
        for (let s of users) {
            assert.strictEqual(s.args[1].text.startsWith('shapeOf('), true, `${s.file}:${s.line} 'user' 須印 shapeOf（實為 ${s.args[1].text}）`)
        }
        let queries = withLabel('req.query')
        assert.ok(queries.length >= 4, `'req.query' 站點 ${queries.length}`)
        for (let s of queries) {
            assert.strictEqual(s.args[1].text.startsWith('shapeOf('), true, `${s.file}:${s.line} 'req.query' 須印 shapeOf（實為 ${s.args[1].text}）`)
        }
        for (let s of [...withLabel('payload'), ...withLabel('inp')]) {
            assert.strictEqual(s.args[1].text.startsWith('payloadShape('), true, `${s.file}:${s.line} 須印 payloadShape（實為 ${s.args[1].text}）`)
        }
    })

    //豁免清單衛生：每個豁免項都在對應檔案之站點被用到，且對應檔案存在（不留過期豁免——過期豁免會悄悄放行日後新增之同名裸變數）
    it('SITE-005 EXEMPT 清單無過期項：每項皆被實際用到', function() {
        let ex = freshExempt()
        scanRoot(ROOT, ex)
        for (let [file, m] of Object.entries(ex)) {
            for (let k of m.keys()) {
                assert.ok(m.used && m.used.has(k), `${file} 之豁免「${k}」未被任何 console 站點用到（過期，請移除）`)
            }
        }
    })

})
