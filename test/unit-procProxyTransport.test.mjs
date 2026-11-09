//unit：server/procProxy.mjs 之傳輸（undici 套件）升至 8.x 後之契約釘住——起真 http／https／h2 server 直打 proxyRequest，不 mock 傳輸；
//DNS 以注入之解析函數模擬（procProxy 之 dnsLookup 接縫，只供測試）。
//依據：套件維護者 2026-11-09 裁示「請升 undici」（7.28.0 → 8.12.3；8.x 之 engines.node 為 >=22.19.0）；既有契約見 spec/流程_測試API.md 規則摘要、
//規則帳本 R-PROXYTARGET-01（位址檢查之時點、每跳、全部解析結果、不二次解析、stop 立即釋放）、sgud/exp/experience.md（改換傳輸要先量「目標端所見之請求」）。
//本檔每條斷言對應：
//- UD8-01 相依與執行環境：package.json 之 undici 為 ^8.12.3、engines.node 為 >=22.19.0，且已安裝之 undici 主版本為 8
//- UD8-02 位址檢查於「連線當下」：解析函數於建連時被呼叫（hostname 字串、options.all 為 true、callback 函式），解析未回覆前不建立 TCP 連線
//- UD8-03 全部解析結果皆檢查：任一位址不被允許即整次拒絕，目標零連線；放行表只涵蓋部分位址者亦拒絕
//- UD8-04 每跳檢查：轉址到解析結果含不被允許位址之主機名即於該跳拒絕
//- UD8-05 stop（close）立即釋放連線池：閒置之池內連線亦即關閉
//- UD8-06 傳輸固定 HTTP/1.1：對可協商 h2 之 TLS server，目標所見為 HTTP/1.1，回應之 statusText 為原因詞（h2 無原因詞）
//- UD8-07 預設 Accept-Encoding 維持改造前目標端所見之值（http 為 gzip, deflate；https 為 br, gzip, deflate，不含 zstd；自給者與 Range 不動；依每跳 scheme）
//- UD8-08 回應之 gzip／br／zstd 內容編碼照常解碼（回應格式不變）
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import http2 from 'http2'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
import procProxy from '../server/procProxy.mjs'
import createTargetPolicy from '../server/proxyTargetPolicy.mjs'
import { tlsKey, tlsCert } from './tools/tlsFixture.mjs'


let dirRepo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

//numTuple：'8.12.3' → [8, 12, 3]（只收數字段）
let numTuple = (v) => String(v).split('.').slice(0, 3).map((x) => Number(x))
let cmpTuple = (a, b) => {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) {
            return a[i] < b[i] ? -1 : 1
        }
    }
    return 0
}

//waitFor：輪詢可觀察條件（非固定延時），逾時即失敗
async function waitFor(cond, msg, ms = 5000) {
    let t0 = Date.now()
    while (!cond()) {
        if (Date.now() - t0 > ms) {
            throw new Error(`逾時：${msg}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}

//startServer：kind 為 http／https／h2（h2 為可協商 h2 之 TLS server，allowHTTP1:true）。回傳 { host, port, origin, seen, conns, sockets, close }
//seen：各請求之 { path, httpVersion, ae（accept-encoding）, ua, range }；conns：已建立之 TCP 連線數；sockets：所有連線之 socket
async function startServer(kind, host = '127.0.0.1') {
    let seen = []
    let sockets = []
    let handler = (req, res) => {
        req.resume()
        req.on('end', () => {
            let u = new URL(req.url, 'http://x')
            seen.push({ path: u.pathname, httpVersion: req.httpVersion, ae: req.headers['accept-encoding'], ua: req.headers['user-agent'], range: req.headers.range })
            if (u.pathname === '/redir') { //?to=<絕對網址>
                res.writeHead(302, { Location: u.searchParams.get('to') })
                res.end()
                return
            }
            if (u.pathname === '/enc') { //?c=gzip|br|zstd：回壓縮後之 JSON（不論請求之 accept-encoding）
                let body = Buffer.from(JSON.stringify({ hello: '世界', coding: u.searchParams.get('c') }))
                let c = u.searchParams.get('c')
                let zipped = c === 'gzip' ? zlib.gzipSync(body) : (c === 'br' ? zlib.brotliCompressSync(body) : zlib.zstdCompressSync(body))
                res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': c })
                res.end(zipped)
                return
            }
            if (u.pathname === '/teapot') { //自訂原因詞：HTTP/1.1 才帶（h2 無原因詞）
                if (req.httpVersion === '1.1') {
                    res.writeHead(418, 'Custom Reason', { 'content-type': 'application/json' })
                }
                else {
                    res.writeHead(418, { 'content-type': 'application/json' })
                }
                res.end(JSON.stringify({ ok: true }))
                return
            }
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: true, path: u.pathname }))
        })
    }
    let srv
    let state = { conns: 0 }
    let onConn = (sock) => {
        state.conns += 1
        sockets.push(sock)
    }
    if (kind === 'http') {
        srv = http.createServer(handler)
        srv.on('connection', onConn)
    }
    else if (kind === 'https') {
        srv = https.createServer({ key: tlsKey, cert: tlsCert }, handler)
        srv.on('connection', onConn)
    }
    else {
        srv = http2.createSecureServer({ key: tlsKey, cert: tlsCert, allowHTTP1: true }, handler)
        srv.on('connection', onConn)
    }
    let port = await new Promise((resolve, reject) => {
        srv.once('error', reject)
        srv.listen(0, host, () => resolve(srv.address().port))
    })
    let scheme = kind === 'http' ? 'http' : 'https'
    return {
        host,
        port,
        origin: `${scheme}://${host}:${port}`,
        seen,
        get conns() {
            return state.conns
        },
        sockets,
        close: () => new Promise((resolve) => {
            srv.close(() => resolve())
            srv.closeAllConnections?.()
            for (let s of sockets) {
                s.destroy()
            }
        }),
    }
}

//mkResolver：注入之 DNS 解析函數（簽章同 dns.lookup）；table 之值為位址陣列。calls 記錄收到之 { host, opts }；
//hold 為 true 時不回覆，改把回覆動作存入 released（測試於觀察後再放行）
function mkResolver(table, { hold = false } = {}) {
    let calls = []
    let released = []
    let resolver = (host, opts, cb) => {
        calls.push({ host, opts, cbType: typeof cb })
        let list = table[host.toLowerCase()]
        let reply = () => {
            if (list === undefined) {
                cb(Object.assign(new Error('nf'), { code: 'ENOTFOUND' }))
                return
            }
            cb(null, list.map((a) => ({ address: a, family: a.includes(':') ? 6 : 4 })))
        }
        if (hold) {
            released.push(reply)
            return
        }
        setImmediate(reply)
    }
    return { resolver, calls, released }
}


describe('unit-procProxyTransport（代發傳輸 undici 8.x 之契約釘住）', function() {
    this.timeout(30000)

    let logs = []
    let srLog = { error: (o) => logs.push(o), warn: (o) => logs.push(o), info: (o) => logs.push(o) }
    let closers = []
    let servers = []
    let tlsRejectBak

    let mk = (popt = {}, policyOpt = { allowList: ['127.0.0.1'] }) => {
        let p = procProxy({ srLog, targetPolicy: createTargetPolicy(policyOpt), ...popt })
        closers.push(p.close)
        return p
    }
    let srv = async (kind, host) => {
        let s = await startServer(kind, host)
        servers.push(s)
        return s
    }

    before(function() {
        //本檔之 https／h2 server 用自簽憑證（test/tools/tlsFixture.mjs）：暫關憑證驗證，after 還原
        tlsRejectBak = process.env.NODE_TLS_REJECT_UNAUTHORIZED
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    })

    after(async function() {
        if (tlsRejectBak === undefined) {
            delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
        }
        else {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = tlsRejectBak
        }
        for (let c of closers) {
            await c()
        }
        for (let s of servers) {
            await s.close()
        }
    })

    beforeEach(function() {
        logs = []
    })


    describe('UD8-01 相依與執行環境', function() {
        it('package.json：dependencies.undici 為 ^8.12.3、engines.node 為 >=22.19.0；已安裝之 undici 主版本為 8 且不低於 8.12.3；執行之 Node 符合 engines', function() {
            let pkg = JSON.parse(fs.readFileSync(path.join(dirRepo, 'package.json'), 'utf8'))
            assert.strictEqual(pkg.dependencies.undici, '^8.12.3')
            assert.strictEqual(pkg.engines.node, '>=22.19.0')
            let inst = JSON.parse(fs.readFileSync(path.join(dirRepo, 'node_modules', 'undici', 'package.json'), 'utf8'))
            assert.strictEqual(numTuple(inst.version)[0], 8, `已安裝 ${inst.version}`)
            assert.ok(cmpTuple(numTuple(inst.version), [8, 12, 3]) >= 0, `已安裝 ${inst.version}`)
            assert.ok(cmpTuple(numTuple(process.versions.node), [22, 19, 0]) >= 0, `Node ${process.versions.node}`)
        })
    })


    describe('UD8-02 位址檢查於連線當下', function() {
        it('解析函數於建連時才被呼叫（呼叫形狀：hostname 字串、options.all 為 true、callback 函式）；解析未回覆前目標無任何 TCP 連線，回覆後才連到所回之位址', async function() {
            let a = await srv('http')
            let { resolver, calls, released } = mkResolver({ 'held.test': ['127.0.0.1'] }, { hold: true })
            let { proxyRequest } = mk({ dnsLookup: resolver })
            let pm = proxyRequest({ url: `http://held.test:${a.port}/x` })
            await waitFor(() => released.length === 1, '解析函數應於建連時被呼叫')
            await new Promise((resolve) => setTimeout(resolve, 150)) //否定斷言之短暫觀察窗：解析未回覆，不得已有連線
            assert.strictEqual(a.conns, 0, '解析未回覆前不得建立 TCP 連線')
            assert.strictEqual(calls.length, 1)
            assert.strictEqual(calls[0].host, 'held.test')
            assert.strictEqual(calls[0].cbType, 'function')
            assert.strictEqual(calls[0].opts.all, true, 'options.all 應為 true（檢查全部結果之前提）')
            released[0]()
            let r = await pm
            assert.strictEqual(r.status, 200)
            assert.strictEqual(a.conns, 1)
            assert.strictEqual(calls.length, 1, '只解析 1 次')
        })

        it('解析失敗（解析函數回錯誤）→ 不建立連線、回 errProxyRequestFailed（非位址拒絕）', async function() {
            let a = await srv('http')
            let { resolver } = mkResolver({})
            let { proxyRequest } = mk({ dnsLookup: resolver })
            await assert.rejects(proxyRequest({ url: `http://none.test:${a.port}/x` }), (e) => e === 'errProxyRequestFailed')
            assert.strictEqual(a.conns, 0)
        })
    })


    describe('UD8-03 全部解析結果皆檢查（任一位址不被允許即整次拒絕）', function() {
        let denyCases = [
            ['三筆答案、不被允許者在最後（公開、公開、10.0.0.5）', ['93.184.216.34', '93.184.216.35', '10.0.0.5'], { allowList: ['127.0.0.1'] }],
            ['IPv6 公開位址＋IPv4 本機', ['2606:2800:220:1:248:1893:25c8:1946', '127.0.0.1'], { allowList: [] }],
            ['IPv4 映射之本機在首位、公開在次', ['::ffff:127.0.0.1', '93.184.216.34'], { allowList: [] }],
            ['公開＋IPv6 loopback', ['93.184.216.34', '::1'], { allowList: [] }],
            ['公開＋雲端中繼資料位址', ['93.184.216.34', '169.254.169.254'], { allowList: [] }],
            ['放行表只涵蓋部分位址（127.0.0.1 放行、127.0.0.2 未放行）', ['127.0.0.1', '127.0.0.2'], { allowList: ['127.0.0.1'] }],
            ['放行表只涵蓋公開位址，另含私有位址', ['93.184.216.34', '10.0.0.5'], { allowList: ['93.184.216.34'] }],
        ]
        for (let [name, answers, policyOpt] of denyCases) {
            it(`${name} → errReqTargetNotAllowed、目標零連線、srLog 為 resolvedInternal（不含位址）`, async function() {
                let a = await srv('http')
                let b = await srv('http', '127.0.0.2')
                let { resolver, calls } = mkResolver({ 'multi.test': answers })
                let { proxyRequest } = mk({ dnsLookup: resolver }, policyOpt)
                await assert.rejects(proxyRequest({ url: `http://multi.test:${a.port}/x?token=SYNTH-MULTI-SECRET` }), (e) => e === 'errReqTargetNotAllowed')
                assert.strictEqual(a.conns + b.conns, 0, '被拒不得建立任何連線')
                assert.strictEqual(calls.length, 1, '解析 1 次')
                assert.deepStrictEqual(logs, [{ event: 'proxyRequest-target', err: 'errReqTargetNotAllowed', reason: 'resolvedInternal', hop: 0 }])
                assert.ok(!/SYNTH|multi\.test|127\.|10\.0|169\.254|93\.184/.test(JSON.stringify(logs)), 'srLog 不得含位址、主機名與憑證')
            })
        }

        it('對照：全部答案皆在放行範圍（127.0.0.1、127.0.0.2）→ 放行並連線', async function() {
            let a = await srv('http')
            let b = await srv('http', '127.0.0.2')
            let { resolver, calls } = mkResolver({ 'allok.test': ['127.0.0.1', '127.0.0.2'] })
            let { proxyRequest } = mk({ dnsLookup: resolver }, { allowList: ['127.0.0.0/8'] })
            let r = await proxyRequest({ url: `http://allok.test:${a.port}/ok` })
            assert.strictEqual(r.status, 200)
            assert.ok(a.conns + b.conns >= 1)
            assert.strictEqual(calls.length, 1)
            assert.ok(!logs.some((l) => l.event === 'proxyRequest-target'))
        })
    })


    describe('UD8-04 每跳檢查', function() {
        it('首跳放行（IP 字面值）、轉址到解析結果含不被允許位址之主機名 → 於 hop 1 拒絕；該目標零連線；srLog 只含原因類別與跳數', async function() {
            let a = await srv('http')
            let b = await srv('http', '127.0.0.2')
            let { resolver, calls } = mkResolver({ 'next-mixed.test': ['127.0.0.1', '127.0.0.2'] })
            let { proxyRequest } = mk({ dnsLookup: resolver }, { allowList: ['127.0.0.1'] })
            let to = `http://next-mixed.test:${b.port}/landing?token=SYNTH-HOP-SECRET`
            await assert.rejects(proxyRequest({ url: `${a.origin}/redir?to=${encodeURIComponent(to)}` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(a.seen.length, 1, '首跳已送出')
            assert.strictEqual(a.conns, 1)
            assert.strictEqual(b.conns, 0, '轉址目標不得被連')
            assert.deepStrictEqual(calls.map((c) => c.host), ['next-mixed.test'])
            assert.deepStrictEqual(logs, [{ event: 'proxyRequest-target', err: 'errReqTargetNotAllowed', reason: 'resolvedInternal', hop: 1 }])
            assert.ok(!/SYNTH|next-mixed|127\./.test(JSON.stringify(logs)))
        })

        it('首跳為主機名（解析放行）→ 轉址到另一主機名解析為未放行位址 → 於 hop 1 拒絕（兩次連線各自經解析與檢查）', async function() {
            let a = await srv('http')
            let b = await srv('http', '127.0.0.2')
            let { resolver, calls } = mkResolver({ 'first.test': ['127.0.0.1'], 'second.test': ['127.0.0.2'] })
            let { proxyRequest } = mk({ dnsLookup: resolver }, { allowList: ['127.0.0.1'] })
            let to = `http://second.test:${b.port}/x`
            await assert.rejects(proxyRequest({ url: `http://first.test:${a.port}/redir?to=${encodeURIComponent(to)}` }), (e) => e === 'errReqTargetNotAllowed')
            assert.deepStrictEqual(calls.map((c) => c.host), ['first.test', 'second.test'])
            assert.strictEqual(b.conns, 0)
            assert.strictEqual(logs[0].hop, 1)
            assert.strictEqual(logs[0].reason, 'resolvedInternal')
        })
    })


    describe('UD8-05 stop（close）立即釋放連線池', function() {
        it('請求完成後連線留在池內（閒置）；close 後該連線立即關閉（伺服端見到連線結束），不等閒置逾時', async function() {
            let a = await srv('http')
            let p = mk()
            assert.strictEqual((await p.proxyRequest({ url: `${a.origin}/idle` })).status, 200)
            assert.strictEqual(a.conns, 1)
            let sock = a.sockets[0]
            assert.strictEqual(sock.destroyed, false, 'close 前連線仍在池內')
            let closed = new Promise((resolve) => sock.once('close', resolve))
            let t0 = Date.now()
            await p.close()
            await closed
            assert.ok(Date.now() - t0 < 1500, `close 後連線應立即結束（實得 ${Date.now() - t0}ms；undici 閒置逾時為數秒）`)
        })

        it('close 後再發請求 → 重建連線池並重新建連（連線數 +1）', async function() {
            let a = await srv('http')
            let p = mk()
            await p.proxyRequest({ url: `${a.origin}/c1` })
            await p.close()
            await p.proxyRequest({ url: `${a.origin}/c2` })
            assert.strictEqual(a.conns, 2)
        })
    })


    describe('UD8-06 傳輸固定 HTTP/1.1（8.x 對 TLS 預設協商 h2）', function() {
        it('可協商 h2 之 TLS server：目標所見為 HTTP/1.1；回應 statusText 為原因詞（Custom Reason）、4xx 照常回應；標頭含 HTTP/1.1 之 connection／連線層欄位', async function() {
            let t = await srv('h2')
            let { proxyRequest } = mk()
            let r = await proxyRequest({ url: `${t.origin}/teapot` })
            assert.strictEqual(t.seen[0].httpVersion, '1.1', '目標所見之協定版本')
            assert.strictEqual(r.status, 418)
            assert.strictEqual(r.statusText, 'Custom Reason', 'h2 無原因詞，statusText 會變空字串')
            assert.deepStrictEqual(r.data, { ok: true })
            assert.ok('connection' in r.headers || 'transfer-encoding' in r.headers || 'content-length' in r.headers, 'HTTP/1.1 之連線層欄位仍在回應標頭')
        })

        it('HTTP/1.1 之 https server：照常連線與回應（statusText 為 OK）', async function() {
            let t = await srv('https')
            let { proxyRequest } = mk()
            let r = await proxyRequest({ url: `${t.origin}/plain` })
            assert.strictEqual(r.status, 200)
            assert.strictEqual(r.statusText, 'OK')
            assert.strictEqual(t.seen[0].httpVersion, '1.1')
        })

        it('https 之主機名經 guarded lookup：解析到未放行位址 → 拒絕（TLS 之前即拒絕，目標零連線）；放行者連線成功', async function() {
            let t = await srv('https')
            let { resolver, calls } = mkResolver({ 'tls-bad.test': ['127.0.0.2'], 'tls-ok.test': ['127.0.0.1'] })
            let { proxyRequest } = mk({ dnsLookup: resolver }, { allowList: ['127.0.0.1'] })
            await assert.rejects(proxyRequest({ url: `https://tls-bad.test:${t.port}/x` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(t.conns, 0)
            let r = await proxyRequest({ url: `https://tls-ok.test:${t.port}/x` })
            assert.strictEqual(r.status, 200)
            assert.deepStrictEqual(calls.map((c) => c.host), ['tls-bad.test', 'tls-ok.test'])
        })
    })


    describe('UD8-07 預設 Accept-Encoding 維持改造前目標端所見之值', function() {
        it('http 目標：gzip, deflate；預設 user-agent 仍為 node', async function() {
            let a = await srv('http')
            let { proxyRequest } = mk()
            await proxyRequest({ url: `${a.origin}/ae` })
            assert.strictEqual(a.seen[0].ae, 'gzip, deflate')
            assert.strictEqual(a.seen[0].ua, 'node')
        })

        it('https 目標：br, gzip, deflate（不含 zstd）；預設 user-agent 仍為 node', async function() {
            let t = await srv('https')
            let { proxyRequest } = mk()
            await proxyRequest({ url: `${t.origin}/ae` })
            assert.strictEqual(t.seen[0].ae, 'br, gzip, deflate')
            assert.strictEqual(t.seen[0].ua, 'node')
        })

        it('使用者自給 accept-encoding（任意大小寫之鍵）→ 原樣送出，不補不改（http 與 https）', async function() {
            let a = await srv('http')
            let t = await srv('https')
            let { proxyRequest } = mk()
            for (let [key, value] of [['Accept-Encoding', 'identity'], ['accept-encoding', 'br, gzip, deflate, zstd'], ['ACCEPT-ENCODING', 'gzip']]) {
                for (let s of [a, t]) {
                    s.seen.length = 0
                    await proxyRequest({ url: `${s.origin}/own`, headers: [[key, value]] })
                    assert.strictEqual(s.seen[0].ae, value, `${key}: ${value} @ ${s.origin}`)
                }
            }
        })

        it('使用者給 Range 且未給 accept-encoding → 目標所見為 identity（undici 依 Fetch 標準補，同 7.x）；Range 原樣', async function() {
            let a = await srv('http')
            let t = await srv('https')
            let { proxyRequest } = mk()
            for (let s of [a, t]) {
                await proxyRequest({ url: `${s.origin}/range`, headers: [['Range', 'bytes=0-3']] })
                assert.strictEqual(s.seen[0].ae, 'identity', s.origin)
                assert.strictEqual(s.seen[0].range, 'bytes=0-3', s.origin)
            }
        })

        it('依每跳之 scheme：https → http 之第 2 跳為 gzip, deflate；http → https 之第 2 跳為 br, gzip, deflate', async function() {
            let a = await srv('http')
            let t = await srv('https')
            let { proxyRequest } = mk()
            await proxyRequest({ url: `${t.origin}/redir?to=${encodeURIComponent(`${a.origin}/landing`)}` })
            assert.strictEqual(t.seen[0].ae, 'br, gzip, deflate', 'https 首跳')
            assert.strictEqual(a.seen[0].ae, 'gzip, deflate', 'http 第 2 跳')
            a.seen.length = 0
            t.seen.length = 0
            await proxyRequest({ url: `${a.origin}/redir?to=${encodeURIComponent(`${t.origin}/landing`)}` })
            assert.strictEqual(a.seen[0].ae, 'gzip, deflate', 'http 首跳')
            assert.strictEqual(t.seen[0].ae, 'br, gzip, deflate', 'https 第 2 跳')
        })

        it('補預設值不外洩至呼叫端之 headers：同一份輸入重複呼叫，目標所見每次相同；使用者之 headers 陣列不被改動', async function() {
            let t = await srv('https')
            let { proxyRequest } = mk()
            let headers = [['X-Probe', '1']]
            await proxyRequest({ url: `${t.origin}/r1`, headers })
            await proxyRequest({ url: `${t.origin}/r2`, headers })
            assert.deepStrictEqual(headers, [['X-Probe', '1']])
            assert.deepStrictEqual(t.seen.map((x) => x.ae), ['br, gzip, deflate', 'br, gzip, deflate'])
        })
    })


    describe('UD8-08 回應之內容編碼照常解碼（回應格式不變）', function() {
        for (let c of ['gzip', 'br', 'zstd']) {
            for (let kind of ['http', 'https']) {
                it(`${kind} 回應 content-encoding: ${c} → data 為解碼後之 JSON 物件，標頭保留 content-encoding`, async function() {
                    let s = await srv(kind)
                    let { proxyRequest } = mk()
                    let r = await proxyRequest({ url: `${s.origin}/enc?c=${c}` })
                    assert.strictEqual(r.status, 200)
                    assert.deepStrictEqual(r.data, { hello: '世界', coding: c })
                    assert.strictEqual(r.headers['content-encoding'], c)
                })
            }
        }
    })
})
