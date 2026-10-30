//api-ormDiagSafeKeys：funLog 端之第二道防線（genDiagFunLog 的 safeKeys 白名單 ＝ w-serv-orm 公開之 SAFE_KEYS；R-ORMDIAG-01，ADR-056；任務 20261030184428 第 198 項，b-api）——
//真後端（隔離子行程，埠 8574 與其餘 ormDiag 測試循序共用）＋真 srLog 檔案：funLog 收到「含白名單外之鍵」之 safe（password、token、巢狀物件）時，srLog 只落 SAFE_KEYS 內之鍵與 errType、errCode。
//規格句：「轉寫至 srLog 之 safe 只含 w-serv-orm 宣告之白名單鍵（errType、errCode 恆保留）；白名單外之鍵與其值不入日誌，亦不入 console」。
//
//為何要注入：w-serv-orm 1.1.22 起於產生端即以同一白名單過濾，真實 ORM 失敗不會產出白名單外之鍵（api-ormDiag 已涵蓋真實失敗情境之鍵不被丟失）；
//第二道防線只能以「funLog 被餵了白名單外之鍵」觀察。做法：把被測 WWebApi.mjs（預設 server/；API_SERVER_MODULE 指向變異副本時取其所在夾）複製到 test/_tmp/api-ormDiagSafeKeysProbe/，
//僅作兩處改寫——① 唯一一行 `import WServOrm from 'w-serv-orm/src/WServOrm.mjs'` 換成包裝（呼叫真 WServOrm 後，以 WWebApi 交給它的 opt.funLog 另送一筆含白名單外之鍵的 safe）；
//② 相對路徑之 import 改為指向被測夾之絕對 file URL。`let ormLog = genDiagFunLog(…)` 該行與 funLog 之建立、傳遞皆為被測原文，未改。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { startApiServer, readLogs, waitLogs } from './tools/apiHarness.mjs'


let fdTest = path.dirname(fileURLToPath(import.meta.url))
let fdRoot = path.resolve(fdTest, '..')
//被測原始碼夾: 預設為本 repo 之 server/; API_SERVER_MODULE（WWebApi.mjs 之副本，變異測試用，副本放 ./tmp/）存在時取其所在夾
let fdServer = process.env.API_SERVER_MODULE ? path.dirname(path.resolve(process.env.API_SERVER_MODULE)) : path.join(fdRoot, 'server')
let fdProbe = path.resolve(fdTest, '_tmp', 'api-ormDiagSafeKeysProbe')

let PORT = 8574
let S = null

let PW = 'PW-PROBE-SECRET-7731' //白名單外之鍵 password 的值
let TK = 'TK-PROBE-SECRET-4408' //白名單外之鍵 token 的值
let NESTED = 'NESTED-PROBE-SECRET-9152' //白名單外之巢狀物件內的值
let PROTO = 'PROTO-PROBE-SECRET-6620' //白名單外之自有 __proto__ 鍵（JSON.parse 產生）內的值

//被測 import 行（WWebApi.mjs 內恰一行）
let LINE_IMPORT = 'import WServOrm from \'w-serv-orm/src/WServOrm.mjs\''

//包裝: 呼叫真 WServOrm；其後以 WWebApi 交給它的 opt.funLog（＝ormLog.funLog，被測原文建立）另送兩筆探針
//  probe-mixed: 白名單內之鍵（n、ks）、恆保留之 errType、errCode、與白名單外之鍵（password、token、巢狀物件、自有 __proto__ 鍵）混合
//  probe-only-out: 全部為白名單外之鍵 → 只剩 errType、errCode 以外無鍵（safe 為空物件或無該鍵由 wsemi 決定，本測試只斷言不含白名單外之鍵與值）
let PROBE = `import WServOrmReal from 'w-serv-orm/src/WServOrm.mjs'
const WServOrm = (ds, WOrm, url, db, opt) => {
    let r = WServOrmReal(ds, WOrm, url, db, opt)
    opt.funLog('probe-mixed', Object.assign(JSON.parse('{"__proto__":{"leak":"${PROTO}"}}'), {
        n: 2,
        ks: [0, 1],
        password: '${PW}',
        token: '${TK}',
        sub: { password: '${NESTED}', x: 1 },
        errType: 'Error',
        errCode: 'PROBE_CODE',
    }))
    opt.funLog('probe-only-out', { password: '${PW}', token: '${TK}' })
    return r
}`

//mkProbe: 由被測 WWebApi.mjs 產生探針副本，回傳副本路徑
let mkProbe = () => {
    let src = fs.readFileSync(path.join(fdServer, 'WWebApi.mjs'), 'utf8')
    assert.strictEqual(src.split(LINE_IMPORT).length - 1, 1, `被測 WWebApi.mjs 應恰有 1 行 ${LINE_IMPORT}`)
    let out = src.replace(LINE_IMPORT, () => PROBE)
    //相對路徑之 import（from './x.mjs'、from '../src/…'）改為被測夾之絕對 file URL
    out = out.replace(/(\bfrom\s+')(\.{1,2}\/[^']+)(')/g, (m, a, spec, c) => a + pathToFileURL(path.resolve(fdServer, spec)).href + c)
    fs.rmSync(fdProbe, { recursive: true, force: true })
    fs.mkdirSync(fdProbe, { recursive: true })
    let fp = path.join(fdProbe, 'WWebApi.mjs')
    fs.writeFileSync(fp, out, 'utf8')
    return fp
}

let isDiag = (l) => l.includes('"event":"orm-diag"')
let diagOf = (lines) => lines.filter(isDiag).map((l) => JSON.parse(l))


describe('api-ormDiagSafeKeys (funLog → srLog 之 safe 只留 SAFE_KEYS 與 errType、errCode: 白名單外之鍵與值不入日誌、console)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        let fp = mkProbe()
        S = await startApiServer({ name: 'api-ormDiagSafeKeys', port: PORT, pipeOut: true, env: { API_SERVER_MODULE: fp } })
    })

    after(async function() {
        this.timeout(30000)
        if (S) {
            await S.stop()
        }
        fs.rmSync(fdProbe, { recursive: true, force: true })
    })

    it('ORMDIAG-SK-001 探針副本確為被測原文（僅 import 行與相對路徑改寫）：ormLog 建立行逐字相同', function() {
        let src = fs.readFileSync(path.join(fdServer, 'WWebApi.mjs'), 'utf8')
        let probe = fs.readFileSync(path.join(fdProbe, 'WWebApi.mjs'), 'utf8')
        let pick = (s) => s.split(/\r?\n/).filter((l) => /^\s*let ormLog = /.test(l))
        assert.strictEqual(pick(src).length, 1)
        assert.deepStrictEqual(pick(probe), pick(src), '探針副本不得改動 ormLog 之建立行')
        assert.ok(probe.includes('WServOrmReal'), '探針已植入')
    })

    it('ORMDIAG-SK-002 funLog 收到含白名單外之鍵（password、token、巢狀物件、自有 __proto__ 鍵）的 safe → srLog 之 orm-diag 只有白名單內之鍵與 errType、errCode；原值不在任何日誌行，亦不在 console', async function() {
        let lines = await waitLogs(S.cwd, (ls) => diagOf(ls).some((d) => d.label === 'probe-only-out'))
        let diags = diagOf(lines)
        let mixed = diags.filter((d) => d.label === 'probe-mixed')
        assert.strictEqual(mixed.length, 1, `probe-mixed 應恰 1 筆（實得 ${mixed.length}）`)
        //規格句: safe 只含 SAFE_KEYS 內之鍵與 errType、errCode（白名單內之值原樣保留）
        assert.deepStrictEqual(mixed[0].safe, { n: 2, ks: [0, 1], errType: 'Error', errCode: 'PROBE_CODE' })
        assert.strictEqual(mixed[0].level, 40, 'warn')

        let only = diags.filter((d) => d.label === 'probe-only-out')
        assert.strictEqual(only.length, 1)
        for (let k of Object.keys(only[0].safe || {})) {
            assert.ok(['errType', 'errCode'].includes(k), `全為白名單外之鍵時只允許 errType、errCode（實得 ${k}）`)
        }

        //原值不入任何日誌行（含非 orm-diag 行）、不入 console
        let all = lines.join('\n')
        let out = S.getOut()
        for (let v of [PW, TK, NESTED, PROTO]) {
            assert.ok(!all.includes(v), `srLog 不得含白名單外之值 ${v}`)
            assert.ok(!out.includes(v), `console 不得含白名單外之值 ${v}`)
        }
        for (let k of ['"password"', '"token"', '"sub"', '"leak"']) {
            assert.ok(!diagOf(lines).some((d) => JSON.stringify(d).includes(k)), `orm-diag 不得含白名單外之鍵名 ${k}`)
        }
    })

    it('ORMDIAG-SK-003 其餘 srLog 行未受影響：探針之外，啟動期無額外 orm-diag（不增噪音）', function() {
        let labels = diagOf(readLogs(S.cwd)).map((d) => d.label).sort()
        assert.deepStrictEqual(labels, ['probe-mixed', 'probe-only-out'])
    })
})
