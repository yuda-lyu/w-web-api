//api-proxyTarget：測試分頁代發請求（資料通道函數 proxyRequest）之內建目標位址政策（P1，ADR-049，R-PROXYTARGET-01）。
//使用者 2026-10-23 裁示：「api 的代發請求功能 預設拒絕內網與本機位址, 要有設定可開關可調」。
//真後端（隔離子行程：獨立 lmdb，部署方 getUserByToken／verifyClientUser 由 test/tools/apiServerChild.mjs 提供；不碰專案 ./db 與 11005），
//經真實資料通道（/api/main）直打；代發目標為本機 echo（127.0.0.1:8563，計命中數、可回 302 轉址）。三個子行程對應三種設定：
//- 預設（埠 8560）：不給任何設定 → 本機與內網目標一律拒絕（回 errReqTargetNotAllowed、echo 零命中）
//- 放行清單（埠 8561）：opt.proxyAllowList = ['127.0.0.1'] → 放行該位址；其他內網位址、轉址到未列位址仍拒絕
//- 整體開關（埠 8562）：opt.proxyAllowInternal = 'y' → 內建拒絕整體關閉
//斷言：被拒者 echo 零命中、回應只含固定 key（不回顯目標位址與憑證）、srLog 有 proxyRequest-target 且只含原因類別與跳數；放行者 echo 命中且回應為目標之內容。
import assert from 'assert'
import http from 'http'
import { startApiServer, waitLogs } from './tools/apiHarness.mjs'
import { callFun } from './tools/apiMain.mjs'


let PORT_DEF = 8560
let PORT_LST = 8561
let PORT_ALL = 8562
let PORT_ECHO = 8563
let SECRET = 'SYNTH-PROXY-SECRET-FOR-TEST'
let Sdef = null
let Slst = null
let Sall = null
let echo = null
let hits = []

let spec = (url, extra = {}) => ({ method: 'GET', url, headers: [['X-Api-Key', SECRET]], query: [['token', SECRET]], timeout: 30000, ...extra })
let go = (S, url, extra) => callFun(S.base, 'tokA', 'proxyRequest', [spec(url, extra)])
let ECHO = `http://127.0.0.1:${PORT_ECHO}`


describe('api-proxyTarget (代發請求之內建目標位址政策: 預設拒絕內網與本機、可開關可調)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        echo = http.createServer((req, res) => {
            let chunks = []
            req.on('data', (c) => chunks.push(c))
            req.on('end', () => {
                hits.push({ method: req.method, url: req.url, headers: req.headers, raw: Buffer.concat(chunks).toString('utf8') })
                let u = new URL(req.url, 'http://x')
                if (u.pathname === '/redir') {
                    res.writeHead(302, { Location: u.searchParams.get('to') })
                    res.end()
                    return
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ echo: true, path: u.pathname }))
            })
        })
        await new Promise((resolve, reject) => {
            echo.once('error', reject)
            echo.listen(PORT_ECHO, '127.0.0.1', resolve)
        })
        Sdef = await startApiServer({ name: 'api-proxyTarget-def', port: PORT_DEF })
        Slst = await startApiServer({ name: 'api-proxyTarget-lst', port: PORT_LST, opt: { proxyAllowList: ['127.0.0.1'] } })
        Sall = await startApiServer({ name: 'api-proxyTarget-all', port: PORT_ALL, opt: { proxyAllowInternal: 'y' } })
    })

    after(async function() {
        this.timeout(60000)
        for (let S of [Sdef, Slst, Sall]) {
            if (S) {
                await S.stop()
            }
        }
        if (echo) {
            await new Promise((resolve) => echo.close(() => resolve()))
        }
    })

    beforeEach(function() {
        hits = []
    })


    describe('預設（不給設定）：內網與本機目標一律拒絕', function() {
        let denied = [
            ['127.0.0.1（本機，echo 有監聽）', `${ECHO}/a`],
            ['localhost 名稱', `http://localhost:${PORT_ECHO}/a`],
            ['[::1]', `http://[::1]:${PORT_ECHO}/a`],
            ['127.1 縮寫', `http://127.1:${PORT_ECHO}/a`],
            ['[::ffff:127.0.0.1] IPv4 映射', `http://[::ffff:127.0.0.1]:${PORT_ECHO}/a`],
            ['0.0.0.0 未指定位址', `http://0.0.0.0:${PORT_ECHO}/a`],
            ['10.0.0.1 私有', 'http://10.0.0.1/a'],
            ['192.168.1.1 私有', 'http://192.168.1.1/a'],
            ['169.254.169.254 雲端中繼資料', 'http://169.254.169.254/latest/meta-data/'],
        ]
        for (let [name, url] of denied) {
            it(`${name} → state error、msg 恆為 errReqTargetNotAllowed、echo 零命中、回應不含目標位址與憑證`, async function() {
                let r = await go(Sdef, url)
                assert.strictEqual(r.ok, false)
                assert.strictEqual(r.state, 'error')
                assert.strictEqual(r.msg, 'errReqTargetNotAllowed')
                assert.strictEqual(hits.length, 0, '被拒不得連到目標')
                let text = JSON.stringify(r.data)
                assert.ok(!text.includes(SECRET), '回應不得含憑證')
                assert.ok(!/127\.|localhost|::1|10\.0|192\.168|169\.254|0\.0\.0\.0/.test(text), `回應不得含目標位址（實得 ${text}）`)
            })
        }

        it('公開位址不被內建拒絕攔下（以極短 timeout 使連線立即失敗：errProxyRequestFailed，而非 errReqTargetNotAllowed）', async function() {
            let r = await go(Sdef, 'http://93.184.216.34:81/a', { timeout: 50 })
            assert.strictEqual(r.msg, 'errProxyRequestFailed')
        })

        it('srLog：被拒各筆為 proxyRequest-target（reason 為原因類別、hop 為跳數），不含目標位址、主機名與憑證', async function() {
            let want = denied.length
            let lines = await waitLogs(Sdef.cwd, (ls) => ls.filter((l) => l.includes('"event":"proxyRequest-target"')).length >= want)
            let text = lines.join('\n')
            assert.ok(!text.includes(SECRET), 'srLog 不得含憑證')
            let recs = lines.map((l) => JSON.parse(l)).filter((o) => o.event === 'proxyRequest-target')
            assert.strictEqual(recs.length, want, `每個被拒之目標各一筆（實得 ${recs.length}）`)
            for (let o of recs) {
                assert.strictEqual(o.level, 50)
                assert.strictEqual(o.err, 'errReqTargetNotAllowed')
                assert.ok(['internalAddress', 'internalName'].includes(o.reason), `reason 為原因類別（實得 ${o.reason}）`)
                assert.strictEqual(o.hop, 0)
                assert.deepStrictEqual(Object.keys(o).sort(), ['err', 'event', 'hop', 'hostname', 'level', 'pid', 'reason', 'time'], 'srLog 欄位為白名單')
            }
            assert.deepStrictEqual(recs.map((o) => o.reason).sort(), ['internalAddress', 'internalAddress', 'internalAddress', 'internalAddress', 'internalAddress', 'internalAddress', 'internalAddress', 'internalAddress', 'internalName'])
            //kpFunExt 邊界亦記 error（供統計）：err 為同一 key
            let ke = lines.map((l) => JSON.parse(l)).filter((o) => o.event === 'kpfun-proxyRequest' && o.level === 50 && o.err === 'errReqTargetNotAllowed')
            assert.strictEqual(ke.length, want, `kpFunExt 邊界之 error 記錄（err 為同一 key）筆數（實得 ${ke.length}）`)
        })
    })


    describe('放行清單 proxyAllowList = [\'127.0.0.1\']：只放行所列', function() {

        it('127.0.0.1 目標 → 命中一次、回目標之內容；請求之標頭與 query 照送', async function() {
            let r = await go(Slst, `${ECHO}/ok`)
            assert.strictEqual(r.ok, true, JSON.stringify(r.data))
            assert.strictEqual(r.msg.status, 200)
            assert.deepStrictEqual(r.msg.data, { echo: true, path: '/ok' })
            assert.strictEqual(hits.length, 1)
            assert.strictEqual(hits[0].url, `/ok?token=${SECRET}`)
            assert.strictEqual(hits[0].headers['x-api-key'], SECRET, '指定之標頭照送')
            assert.strictEqual(hits[0].headers['user-agent'], 'node', '預設 User-Agent 維持改造前（Node 內建 fetch）之 node')
        })

        it('未列之內網位址仍拒絕：127.0.0.2、10.0.0.1、[::1]、localhost 名稱', async function() {
            for (let url of [`http://127.0.0.2:${PORT_ECHO}/a`, 'http://10.0.0.1/a', `http://[::1]:${PORT_ECHO}/a`, `http://localhost:${PORT_ECHO}/a`]) {
                let r = await go(Slst, url)
                assert.strictEqual(r.msg, 'errReqTargetNotAllowed', url)
            }
            assert.strictEqual(hits.length, 0)
        })

        it('首跳放行、轉址到未列之位址 → 拒絕（每一跳皆檢查），回 errReqTargetNotAllowed', async function() {
            let r = await go(Slst, `${ECHO}/redir?to=${encodeURIComponent(`http://127.0.0.2:${PORT_ECHO}/landing`)}`)
            assert.strictEqual(r.msg, 'errReqTargetNotAllowed')
            assert.strictEqual(hits.length, 1, '只有首跳送出')
        })

        it('對照：轉址到同為放行之位址 → 跟隨並回最終回應', async function() {
            let r = await go(Slst, `${ECHO}/redir?to=${encodeURIComponent(`${ECHO}/final`)}`)
            assert.strictEqual(r.ok, true)
            assert.deepStrictEqual(r.msg.data, { echo: true, path: '/final' })
            assert.strictEqual(hits.length, 2)
        })
    })


    describe('整體開關 proxyAllowInternal = \'y\'：內建拒絕關閉', function() {

        it('本機目標 → 命中；內網位址不再被內建拒絕（連線失敗為 errProxyRequestFailed，非 errReqTargetNotAllowed）', async function() {
            let r = await go(Sall, `${ECHO}/open`)
            assert.strictEqual(r.ok, true)
            assert.strictEqual(hits.length, 1)
            let r2 = await go(Sall, 'http://10.255.255.1/a', { timeout: 100 })
            assert.strictEqual(r2.msg, 'errProxyRequestFailed')
        })

        it('轉址到本機 → 跟隨', async function() {
            let r = await go(Sall, `${ECHO}/redir?to=${encodeURIComponent(`http://[::ffff:127.0.0.1]:${PORT_ECHO}/final`)}`)
            assert.strictEqual(r.ok, true, JSON.stringify(r.data))
            assert.strictEqual(hits.length, 2)
        })
    })
})
