//unit：server/procProxy.mjs 之內建目標位址政策（P1，ADR-049，R-PROXYTARGET-01）——起真 http server 直打 proxyRequest，不 mock 傳輸；
//DNS 以注入之解析函數模擬（procProxy 之 dnsLookup 接縫，只供測試），其餘（undici 連線、guarded lookup、轉址）皆真。
//使用者 2026-10-23 裁示：「api 的代發請求功能 預設拒絕內網與本機位址, 要有設定可開關可調」。每條斷言對應：
//- P1-1 預設拒絕本機／私有／鏈路本地／未指定／IPv4 映射之 IPv6 等，依實際解析後之 IP 判斷；轉址每一跳皆檢查
//- P1-2 設定：allowInternal（整體開關）、allowList（IP／CIDR／主機名）；與 isAllowTarget 並存時兩者皆須通過（先 isAllowTarget、後內建）
//- P1-3 連線所用之位址即檢查過之位址（只解析一次、不二次解析）；被拒回固定錯誤鍵 errReqTargetNotAllowed、不回顯目標位址、記 srLog（只含原因類別與跳數）
//兩個目標 server：A＝127.0.0.1:11087、B＝127.0.0.2:11087（同埠不同 loopback 位址，使「連到哪個位址」可由命中計數觀察）。
import assert from 'assert'
import http from 'http'
import procProxy from '../server/procProxy.mjs'
import createTargetPolicy from '../server/proxyTargetPolicy.mjs'


let PORT = 11087
let hits = { a: [], b: [] } //各 server 所見之請求 { method, url, raw }
let srvs = []

function listen(host, key) {
    return new Promise((resolve, reject) => {
        let srv = http.createServer((req, res) => {
            let chunks = []
            req.on('data', (c) => chunks.push(c))
            req.on('end', () => {
                hits[key].push({ method: req.method, url: req.url, raw: Buffer.concat(chunks).toString('utf8') })
                let u = new URL(req.url, 'http://x')
                if (u.pathname === '/hang') { //收到請求後不回應（驗 close 立即終止進行中之請求）
                    return
                }
                if (u.pathname === '/redir') { //?to=<絕對網址>&code=302
                    res.writeHead(Number(u.searchParams.get('code') || 302), { Location: u.searchParams.get('to') })
                    res.end()
                    return
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: true, server: key, path: u.pathname }))
            })
        })
        srv.once('error', reject)
        srv.listen(PORT, host, () => resolve(srv))
    })
}

let A = `http://127.0.0.1:${PORT}`
let B = `http://127.0.0.2:${PORT}`
let nHits = () => hits.a.length + hits.b.length

//mkSpy：isAllowTarget 之記錄版（把收到之網址記入 seen 並回 true）
let mkSpy = (seen) => (u) => {
    seen.push(u)
    return true
}

//mkResolver：注入之 DNS 解析函數（簽章同 dns.lookup）；table 之值為位址陣列，或 (第幾次呼叫) => 位址陣列（模擬 rebinding）
function mkResolver(table) {
    let calls = []
    let resolver = (host, opts, cb) => {
        calls.push(host)
        let v = table[host.toLowerCase()]
        if (v === undefined) {
            setImmediate(() => cb(Object.assign(new Error('nf'), { code: 'ENOTFOUND' })))
            return
        }
        let list = typeof v === 'function' ? v(calls.filter((h) => h === host).length) : v
        setImmediate(() => cb(null, list.map((a) => ({ address: a, family: a.includes(':') ? 6 : 4 }))))
    }
    return { resolver, calls }
}


describe('unit-procProxyTarget（代發請求之內建目標位址政策）', function() {
    this.timeout(30000)

    let logs = []
    let srLog = { error: (o) => logs.push(o), warn: (o) => logs.push(o), info: (o) => logs.push(o) }
    let closers = []

    //mk：建立 procProxy（政策由 popt 給；預設即「未設任何放行」之預設政策）
    let mk = (popt = {}, policyOpt = undefined) => {
        let p = procProxy({ srLog, ...(policyOpt === undefined ? {} : { targetPolicy: createTargetPolicy(policyOpt) }), ...popt })
        closers.push(p.close)
        return p
    }

    before(async function() {
        srvs = [await listen('127.0.0.1', 'a'), await listen('127.0.0.2', 'b')]
    })

    after(async function() {
        for (let c of closers) {
            await c()
        }
        await Promise.all(srvs.map((s) => new Promise((resolve) => {
            s.close(() => resolve())
            s.closeAllConnections() ///hang 之連線不會自行結束
        })))
    })

    beforeEach(function() {
        hits = { a: [], b: [] }
        logs = []
    })


    describe('P1-1 預設拒絕：IP 字面值與 localhost 名稱（連線前即拒絕，不送出）', function() {
        let denied = [
            ['127.0.0.1（本機 loopback，實際有 server 監聽）', `${A}/x`, 'internalAddress'],
            ['127.0.0.2', `${B}/x`, 'internalAddress'],
            ['127.1（縮寫）', `http://127.1:${PORT}/x`, 'internalAddress'],
            ['2130706433（十進位整數）', `http://2130706433:${PORT}/x`, 'internalAddress'],
            ['0x7f.0.0.1（十六進位）', `http://0x7f.0.0.1:${PORT}/x`, 'internalAddress'],
            ['[::1]', `http://[::1]:${PORT}/x`, 'internalAddress'],
            ['[::ffff:127.0.0.1]（IPv4 映射）', `http://[::ffff:127.0.0.1]:${PORT}/x`, 'internalAddress'],
            ['[::ffff:7f00:1]（IPv4 映射十六進位）', `http://[::ffff:7f00:1]:${PORT}/x`, 'internalAddress'],
            ['0.0.0.0（未指定位址）', `http://0.0.0.0:${PORT}/x`, 'internalAddress'],
            ['[::]（IPv6 未指定位址）', `http://[::]:${PORT}/x`, 'internalAddress'],
            ['10.0.0.1（私有）', 'http://10.0.0.1/x', 'internalAddress'],
            ['172.16.0.1（私有）', 'http://172.16.0.1:8080/x', 'internalAddress'],
            ['192.168.1.1（私有）', 'http://192.168.1.1/x', 'internalAddress'],
            ['169.254.169.254（鏈路本地／雲端中繼資料）', 'http://169.254.169.254/latest/meta-data/', 'internalAddress'],
            ['100.64.0.1（CGNAT）', 'http://100.64.0.1/x', 'internalAddress'],
            ['[fe80::1]（鏈路本地）', 'http://[fe80::1]/x', 'internalAddress'],
            ['[fd00::1]（ULA）', 'http://[fd00::1]/x', 'internalAddress'],
            ['https://127.0.0.1（https 亦然）', `https://127.0.0.1:${PORT}/x`, 'internalAddress'],
            ['localhost（名稱）', `http://localhost:${PORT}/x`, 'internalName'],
            ['LOCALHOST（大小寫）', `http://LOCALHOST:${PORT}/x`, 'internalName'],
            ['localhost.（尾端點）', `http://localhost.:${PORT}/x`, 'internalName'],
            ['foo.localhost（子網域）', `http://foo.localhost:${PORT}/x`, 'internalName'],
            ['localhost..（多重尾端點，URL 不去除）', `http://localhost..:${PORT}/x`, 'internalName'],
            ['a.localhost..（子網域加多重尾端點）', `http://a.localhost..:${PORT}/x`, 'internalName'],
            ['127.0.0.1..（字面值加多重尾端點，URL 不視為 IP）', `http://127.0.0.1..:${PORT}/x`, 'internalAddress'],
        ]
        for (let [name, url, reason] of denied) {
            it(`${name} → errReqTargetNotAllowed、不連線、srLog 只含原因類別與跳數`, async function() {
                let { proxyRequest } = mk()
                let SECRET = 'SYNTH-TARGET-SECRET'
                await assert.rejects(proxyRequest({ url: `${url}?token=${SECRET}`, headers: [['X-Api-Key', SECRET]] }), (e) => e === 'errReqTargetNotAllowed')
                assert.strictEqual(nHits(), 0, '被拒不得連到目標')
                assert.deepStrictEqual(logs, [{ event: 'proxyRequest-target', err: 'errReqTargetNotAllowed', reason, hop: 0 }])
                let text = JSON.stringify(logs)
                assert.ok(!text.includes(SECRET), 'srLog 不得含憑證')
                assert.ok(!/127|localhost|LOCALHOST|10\.0|172\.16|192\.168|169\.254|100\.64|fe80|fd00|2130706433|0x7f|\[::/.test(text), `srLog 不得含目標位址（實得 ${text}）`)
            })
        }

        it('回前端之拒絕值恰為固定字串 errReqTargetNotAllowed（不是 Error 物件、不夾位址）', async function() {
            let { proxyRequest } = mk()
            let v = null
            try {
                await proxyRequest({ url: `${A}/x` })
            }
            catch (e) {
                v = e
            }
            assert.strictEqual(v, 'errReqTargetNotAllowed')
            assert.strictEqual(typeof v, 'string')
        })

        it('公開位址之 IP 字面值不被內建拒絕攔下（連線嘗試以不可路由之逾時／拒絕收場，key 為 errProxyRequestFailed 而非 errReqTargetNotAllowed）', async function() {
            //93.184.216.34 為公開位址；以極短 timeout 使連線嘗試立即逾時，只驗「未被內建拒絕」（不依賴外網）
            let { proxyRequest } = mk()
            await assert.rejects(proxyRequest({ url: 'http://93.184.216.34:81/x', timeout: 50 }), (e) => e === 'errProxyRequestFailed')
            assert.ok(!logs.some((l) => l.event === 'proxyRequest-target'), '公開位址不得有 proxyRequest-target 之拒絕記錄')
        })
    })


    describe('P1-2 設定：整體開關與放行清單', function() {

        it('allowInternal=true → 本機目標可達（hits 1）；所有被預設拒絕之字面值皆不再被內建拒絕', async function() {
            let { proxyRequest } = mk({}, { allowInternal: true })
            let r = await proxyRequest({ url: `${A}/open` })
            assert.strictEqual(r.status, 200)
            assert.strictEqual(r.data.server, 'a')
            let r2 = await proxyRequest({ url: `${B}/open` })
            assert.strictEqual(r2.data.server, 'b')
            assert.strictEqual(hits.a.length, 1)
            assert.strictEqual(hits.b.length, 1)
            assert.ok(!logs.some((l) => l.event === 'proxyRequest-target'))
        })

        it('allowList 之 IP：只放行所列位址（127.0.0.1 放行、127.0.0.2 仍拒絕）', async function() {
            let { proxyRequest } = mk({}, { allowList: ['127.0.0.1'] })
            let r = await proxyRequest({ url: `${A}/lst` })
            assert.strictEqual(r.data.server, 'a')
            await assert.rejects(proxyRequest({ url: `${B}/lst` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(hits.b.length, 0, '未列之位址不得連線')
        })

        it('allowList 之 CIDR：127.0.0.0/8 涵蓋 A 與 B；10.0.0.0/8 不涵蓋 127.*', async function() {
            let wide = mk({}, { allowList: ['127.0.0.0/8'] })
            assert.strictEqual((await wide.proxyRequest({ url: `${A}/c` })).data.server, 'a')
            assert.strictEqual((await wide.proxyRequest({ url: `${B}/c` })).data.server, 'b')
            let other = mk({}, { allowList: ['10.0.0.0/8', '192.168.0.0/16'] })
            hits = { a: [], b: [] }
            await assert.rejects(other.proxyRequest({ url: `${A}/c` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(nHits(), 0)
        })

        it('allowList 之 IPv4 項涵蓋其 IPv4 映射之 IPv6 字面值（[::ffff:127.0.0.1] 連到 127.0.0.1）', async function() {
            let { proxyRequest } = mk({}, { allowList: ['127.0.0.1'] })
            let r = await proxyRequest({ url: `http://[::ffff:127.0.0.1]:${PORT}/m` })
            assert.strictEqual(r.status, 200)
            assert.strictEqual(hits.a.length, 1)
        })

        it('allowList 之主機名 localhost：localhost 名稱放行（名稱放行不涵蓋 IP 字面值）', async function() {
            let { proxyRequest } = mk({}, { allowList: ['localhost'] })
            let r = await proxyRequest({ url: `http://localhost:${PORT}/n` })
            assert.strictEqual(r.status, 200, 'localhost 之解析結果（::1／127.0.0.1）皆不檢查，連到有監聽者')
            assert.strictEqual(hits.a.length, 1)
            await assert.rejects(proxyRequest({ url: `${B}/n` }), (e) => e === 'errReqTargetNotAllowed', '名稱放行不涵蓋 127.0.0.2')
        })

        it('預設（未給任何放行）＝拒絕：與 allowList 為空陣列、allowInternal 為 false 相同', async function() {
            for (let policyOpt of [undefined, {}, { allowList: [] }, { allowInternal: false }, { allowInternal: 'n', allowList: undefined }]) {
                let { proxyRequest } = mk({}, policyOpt)
                await assert.rejects(proxyRequest({ url: `${A}/d` }), (e) => e === 'errReqTargetNotAllowed', JSON.stringify(policyOpt))
            }
            assert.strictEqual(nHits(), 0)
        })
    })


    describe('P1-3 主機名：解析後之位址判斷，連線所用之位址即檢查過之位址', function() {

        it('主機名解析到本機 → 拒絕（resolvedInternal）、不連線；解析恰 1 次；srLog 不含主機名與位址', async function() {
            let { resolver, calls } = mkResolver({ 'evil.test': ['127.0.0.1'] })
            let { proxyRequest } = mk({ dnsLookup: resolver })
            await assert.rejects(proxyRequest({ url: `http://evil.test:${PORT}/h?token=SYNTH-TARGET-SECRET` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(nHits(), 0)
            assert.deepStrictEqual(calls, ['evil.test'])
            assert.deepStrictEqual(logs, [{ event: 'proxyRequest-target', err: 'errReqTargetNotAllowed', reason: 'resolvedInternal', hop: 0 }])
            assert.ok(!/evil|127|SYNTH/.test(JSON.stringify(logs)))
        })

        it('主機名解析到各類內網位址（私有、鏈路本地、IPv6 loopback、IPv4 映射）皆拒絕；https 亦然（TLS 之前即拒絕）', async function() {
            let { resolver } = mkResolver({
                'p10.test': ['10.1.2.3'], 'meta.test': ['169.254.169.254'], 'v6.test': ['::1'], 'map.test': ['::ffff:10.0.0.1'], 'z.test': ['0.0.0.0'],
            })
            let { proxyRequest } = mk({ dnsLookup: resolver })
            for (let h of ['p10.test', 'meta.test', 'v6.test', 'map.test', 'z.test']) {
                for (let scheme of ['http', 'https']) {
                    await assert.rejects(proxyRequest({ url: `${scheme}://${h}:${PORT}/h` }), (e) => e === 'errReqTargetNotAllowed', `${scheme}://${h}`)
                }
            }
            assert.strictEqual(nHits(), 0)
        })

        it('主機名解析到「公開＋內網」混合 → 整次拒絕（任一位址不被允許即拒絕，不挑公開者連）', async function() {
            let { resolver } = mkResolver({ 'mix.test': ['93.184.216.34', '127.0.0.1'], 'mix2.test': ['127.0.0.1', '93.184.216.34'] })
            let { proxyRequest } = mk({ dnsLookup: resolver })
            for (let h of ['mix.test', 'mix2.test']) {
                await assert.rejects(proxyRequest({ url: `http://${h}:${PORT}/h` }), (e) => e === 'errReqTargetNotAllowed', h)
            }
            assert.strictEqual(nHits(), 0)
        })

        it('連線所用之位址即檢查過之位址：解析只呼叫 1 次，請求送到該次解析所回之位址（A），之後即使 DNS 換答案（B）也不被用到', async function() {
            //rebinding：第 1 次解析回 127.0.0.1（allowList 放行）、其後回 127.0.0.2（不放行）。若實作「先檢查、再另行解析連線」，連線會去 B 或解析失敗
            let { resolver, calls } = mkResolver({ 'rebind.test': (n) => (n === 1 ? ['127.0.0.1'] : ['127.0.0.2']) })
            let { proxyRequest } = mk({ dnsLookup: resolver }, { allowList: ['127.0.0.1'] })
            let r = await proxyRequest({ url: `http://rebind.test:${PORT}/pin` })
            assert.strictEqual(r.status, 200)
            assert.strictEqual(r.data.server, 'a', '請求應送到檢查過之 127.0.0.1')
            assert.strictEqual(hits.a.length, 1)
            assert.strictEqual(hits.b.length, 0, '換答案後之 127.0.0.2 不得被連')
            assert.strictEqual(calls.length, 1, '解析只做 1 次（不二次解析）')
        })

        it('連線池：重用已建立之連線時不再解析（連線之位址為建立當時檢查過者）；關閉連線池後重連須重新解析並重新檢查（DNS 已換成未放行之位址即拒絕）', async function() {
            let { resolver, calls } = mkResolver({ 'pool.test': (n) => (n === 1 ? ['127.0.0.1'] : ['127.0.0.2']) })
            let p = mk({ dnsLookup: resolver }, { allowList: ['127.0.0.1'] })
            let r1 = await p.proxyRequest({ url: `http://pool.test:${PORT}/p1` })
            assert.strictEqual(r1.data.server, 'a')
            await new Promise((resolve) => setTimeout(resolve, 200)) //讓第 1 條連線回到連線池之閒置狀態（緊接著發送時 undici 可能尚未釋放而另建連線）
            let r2 = await p.proxyRequest({ url: `http://pool.test:${PORT}/p2` })
            assert.strictEqual(r2.data.server, 'a', '第 2 次重用同一連線（仍是第 1 次檢查過之 127.0.0.1）')
            assert.strictEqual(calls.length, 1, '重用連線不再解析')
            assert.strictEqual(hits.b.length, 0)
            await p.close() //關閉連線池 → 之後須重連
            await assert.rejects(p.proxyRequest({ url: `http://pool.test:${PORT}/p3` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(calls.length, 2, '重連時重新解析')
            assert.strictEqual(hits.b.length, 0, '換成未放行位址後不得連線')
        })

        it('主機名之解析結果可連而政策放行（只列主機名）：連到解析所回之位址（B），不檢查其為內網', async function() {
            let { resolver, calls } = mkResolver({ 'pin.test': ['127.0.0.2'] })
            let { proxyRequest } = mk({ dnsLookup: resolver }, { allowList: ['pin.test'] })
            let r = await proxyRequest({ url: `http://pin.test:${PORT}/by-host` })
            assert.strictEqual(r.data.server, 'b')
            assert.strictEqual(hits.b.length, 1)
            assert.strictEqual(calls.length, 1)
        })

        it('主機名之解析結果在 allowList 之 IP 內 → 放行並連到該位址；不在內 → 拒絕', async function() {
            let { resolver } = mkResolver({ 'in.test': ['127.0.0.1'], 'out.test': ['127.0.0.2'] })
            let { proxyRequest } = mk({ dnsLookup: resolver }, { allowList: ['127.0.0.1'] })
            assert.strictEqual((await proxyRequest({ url: `http://in.test:${PORT}/x` })).data.server, 'a')
            await assert.rejects(proxyRequest({ url: `http://out.test:${PORT}/x` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(hits.b.length, 0)
        })

        it('解析失敗（ENOTFOUND）→ errProxyRequestFailed（非位址拒絕），srLog 為 proxyRequest-fetch', async function() {
            let { resolver } = mkResolver({})
            let { proxyRequest } = mk({ dnsLookup: resolver })
            await assert.rejects(proxyRequest({ url: `http://nohost.test:${PORT}/x` }), (e) => e === 'errProxyRequestFailed')
            assert.strictEqual(logs.length, 1)
            assert.strictEqual(logs[0].event, 'proxyRequest-fetch')
        })

        it('預設解析器（dns.lookup）：真實 localhost 名稱於連線前即拒絕，無需解析', async function() {
            let { proxyRequest } = mk()
            await assert.rejects(proxyRequest({ url: `http://localhost:${PORT}/x` }), (e) => e === 'errReqTargetNotAllowed')
        })
    })


    describe('P1-1 轉址每一跳皆檢查', function() {
        let redirTo = (to, code = 302) => `${A}/redir?code=${code}&to=${encodeURIComponent(to)}`

        it('首跳放行（A）、轉址到 B（127.0.0.2，未放行）→ errReqTargetNotAllowed；B 零命中；srLog 為 hop 1 之原因類別（不含網址）', async function() {
            let { proxyRequest } = mk({}, { allowList: ['127.0.0.1'] })
            await assert.rejects(proxyRequest({ url: redirTo(`${B}/landing?token=SYNTH-REDIR-SECRET`) }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(hits.a.length, 1, '首跳已送出')
            assert.strictEqual(hits.b.length, 0, '轉址目標不得被連')
            assert.deepStrictEqual(logs, [{ event: 'proxyRequest-target', err: 'errReqTargetNotAllowed', reason: 'internalAddress', hop: 1 }])
            assert.ok(!/SYNTH|127\.0\.0\.2/.test(JSON.stringify(logs)))
        })

        it('轉址到 localhost 名稱、[::1]、IPv4 映射、私有位址、雲端中繼資料位址 → 皆拒絕（hop 1）', async function() {
            let { proxyRequest } = mk({}, { allowList: ['127.0.0.1'] })
            for (let to of [`http://localhost:${PORT}/x`, `http://[::1]:${PORT}/x`, `http://[::ffff:127.0.0.2]:${PORT}/x`, 'http://10.0.0.1/x', 'http://169.254.169.254/latest/meta-data/', `http://0.0.0.0:${PORT}/x`]) {
                logs = []
                await assert.rejects(proxyRequest({ url: redirTo(to) }), (e) => e === 'errReqTargetNotAllowed', to)
                assert.strictEqual(logs.length, 1, to)
                assert.strictEqual(logs[0].event, 'proxyRequest-target', to)
                assert.strictEqual(logs[0].hop, 1, to)
            }
            assert.strictEqual(hits.b.length, 0)
        })

        it('轉址到解析為內網之主機名 → 拒絕（resolvedInternal，hop 1）；解析 1 次', async function() {
            let { resolver, calls } = mkResolver({ 'next.test': ['127.0.0.2'] })
            let { proxyRequest } = mk({ dnsLookup: resolver }, { allowList: ['127.0.0.1'] })
            await assert.rejects(proxyRequest({ url: redirTo(`http://next.test:${PORT}/x`) }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(hits.b.length, 0)
            assert.deepStrictEqual(calls, ['next.test'])
            assert.deepStrictEqual(logs, [{ event: 'proxyRequest-target', err: 'errReqTargetNotAllowed', reason: 'resolvedInternal', hop: 1 }])
        })

        it('多跳：放行 → 放行 → 內網，於第 3 個目標（hop 2）拒絕；POST 之 307 亦於送出 body 前拒絕', async function() {
            let { proxyRequest } = mk({}, { allowList: ['127.0.0.1'] })
            let hop2 = `${A}/redir?code=302&to=${encodeURIComponent(`${B}/z`)}`
            await assert.rejects(proxyRequest({ url: redirTo(hop2) }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(hits.a.length, 2)
            assert.strictEqual(hits.b.length, 0)
            assert.strictEqual(logs[0].hop, 2)
            hits = { a: [], b: [] }
            await assert.rejects(proxyRequest({ method: 'POST', body: '{"secret":"SYNTH-BODY"}', url: redirTo(`${B}/post`, 307) }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(hits.b.length, 0, 'POST body 不得送到被拒之轉址目標')
        })

        it('五種轉址狀態碼（301／302／303／307／308）× 目標未放行 → 皆於該跳拒絕；目標零命中；方法為 POST 時 body 不送到被拒目標', async function() {
            let { proxyRequest } = mk({}, { allowList: ['127.0.0.1'] })
            for (let code of [301, 302, 303, 307, 308]) {
                for (let method of ['GET', 'POST']) {
                    hits = { a: [], b: [] }
                    logs = []
                    await assert.rejects(proxyRequest({ method, body: method === 'POST' ? '{"k":1}' : undefined, url: redirTo(`${B}/c${code}`, code) }), (e) => e === 'errReqTargetNotAllowed', `${code} ${method}`)
                    assert.strictEqual(hits.a.length, 1, `${code} ${method}：只有首跳送出`)
                    assert.strictEqual(hits.b.length, 0, `${code} ${method}：被拒目標零命中`)
                    assert.strictEqual(logs[0].hop, 1, `${code} ${method}`)
                }
            }
        })

        it('相對 Location（以 / 開頭、相對路徑）解析為同來源之放行位址 → 跟隨；解析為被拒位址者（//127.0.0.2:port/ 協定相對）→ 拒絕', async function() {
            let { proxyRequest } = mk({}, { allowList: ['127.0.0.1'] })
            let r = await proxyRequest({ url: `${A}/redir?code=302&to=${encodeURIComponent('/rel-final')}` })
            assert.strictEqual(r.status, 200)
            assert.strictEqual(r.data.path, '/rel-final')
            hits = { a: [], b: [] }
            await assert.rejects(proxyRequest({ url: `${A}/redir?code=302&to=${encodeURIComponent(`//127.0.0.2:${PORT}/proto-rel`)}` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(hits.b.length, 0)
        })

        it('對照：轉址目標在放行範圍內 → 照常跟隨並回最終回應', async function() {
            let { proxyRequest } = mk({}, { allowList: ['127.0.0.0/8'] })
            let r = await proxyRequest({ url: redirTo(`${B}/ok`) })
            assert.strictEqual(r.status, 200)
            assert.strictEqual(r.data.server, 'b')
            assert.strictEqual(hits.a.length, 1)
            assert.strictEqual(hits.b.length, 1)
            assert.ok(!logs.some((l) => l.event === 'proxyRequest-target'))
        })
    })


    describe('P1-2 與 isAllowTarget 並存：兩者皆須通過，先 isAllowTarget、後內建', function() {

        it('isAllowTarget 回 true 不能放寬內建拒絕（預設政策仍拒絕本機）；isAllowTarget 先被呼叫', async function() {
            let seen = []
            let { proxyRequest } = mk({ isAllowTarget: mkSpy(seen) })
            await assert.rejects(proxyRequest({ url: `${A}/both` }), (e) => e === 'errReqTargetNotAllowed')
            assert.deepStrictEqual(seen, [`${A}/both`], 'isAllowTarget 收到首跳網址一次（內網目標亦先經部署方檢核）')
            assert.strictEqual(nHits(), 0)
            assert.strictEqual(logs.filter((l) => l.event === 'proxyRequest-target').length, 1, '拒絕出自內建政策')
        })

        it('allowList 放行不繞過 isAllowTarget：isAllowTarget 回 false 仍拒絕；srLog 記 reason 為 isAllowTarget（首跳拒絕與內建拒絕同一事件，不含網址）', async function() {
            let { proxyRequest } = mk({ isAllowTarget: () => false }, { allowList: ['127.0.0.1'] })
            await assert.rejects(proxyRequest({ url: `${A}/both?token=SYNTH-HOOK-SECRET` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(nHits(), 0)
            assert.deepStrictEqual(logs, [{ event: 'proxyRequest-target', err: 'errReqTargetNotAllowed', reason: 'isAllowTarget', hop: 0 }])
        })

        it('isAllowTarget 回 false 時不做內建檢查之解析（先 isAllowTarget，其後才解析）', async function() {
            let { resolver, calls } = mkResolver({ 'deny.test': ['127.0.0.1'] })
            let { proxyRequest } = mk({ dnsLookup: resolver, isAllowTarget: () => false }, { allowList: ['127.0.0.1'] })
            await assert.rejects(proxyRequest({ url: `http://deny.test:${PORT}/x` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(calls.length, 0, 'isAllowTarget 已拒絕，不應再解析主機名')
        })

        it('isAllowTarget 收到之網址即實際送出之網址（含 query 列併入後、經 URL 正規化）：依 query 內容拒絕之鉤子有效', async function() {
            let seen = []
            let hook = (u) => {
                seen.push(u)
                return !new URL(u).searchParams.has('admin')
            }
            let { proxyRequest } = mk({ isAllowTarget: hook }, { allowList: ['127.0.0.1'] })
            await assert.rejects(proxyRequest({ url: `${A}/open`, query: [['admin', '1']] }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(nHits(), 0, '鉤子依 query 拒絕者不得送出')
            assert.strictEqual(seen[0], `${A}/open?admin=1`, '鉤子收到併入 query 後之完整網址')
            let r = await proxyRequest({ url: `${A}/open`, query: [['x', '1']] })
            assert.strictEqual(r.status, 200)
            assert.strictEqual(hits.a[0].url, '/open?x=1')
        })

        it('isAllowTarget 為非同步函數：Promise 解析為 false 同樣拒絕（首跳與轉址跳）；解析為 true 放行', async function() {
            let denyAll = mk({ isAllowTarget: async () => false }, { allowList: ['127.0.0.1'] })
            await assert.rejects(denyAll.proxyRequest({ url: `${A}/async` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(nHits(), 0)
            let denyHop = mk({ isAllowTarget: async (u) => !u.includes('/hop') }, { allowList: ['127.0.0.1'] })
            await assert.rejects(denyHop.proxyRequest({ url: `${A}/redir?code=302&to=${encodeURIComponent(`${A}/hop`)}` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(hits.a.length, 1, '只有首跳送出，轉址跳之非同步拒絕生效')
            hits = { a: [], b: [] }
            let allow = mk({ isAllowTarget: async () => true }, { allowList: ['127.0.0.1'] })
            assert.strictEqual((await allow.proxyRequest({ url: `${A}/async-ok` })).status, 200)
        })

        it('isAllowTarget 拋錯或 reject（首跳與轉址跳）→ 視同拒絕（fail-closed）：回固定鍵，不外洩鉤子拋出之內容與網址，不送出', async function() {
            let SECRET = 'SYNTH-HOOK-THROW-SECRET'
            let mkHook = (mode) => (u) => {
                if (mode === 'throw') {
                    throw new Error(`${SECRET} ${u}`)
                }
                if (mode === 'throwStr') {
                    throw `${SECRET} ${u}` //eslint-disable-line no-throw-literal
                }
                return Promise.reject(new Error(`${SECRET} ${u}`))
            }
            for (let mode of ['throw', 'throwStr', 'reject']) {
                logs = []
                let { proxyRequest } = mk({ isAllowTarget: mkHook(mode) }, { allowList: ['127.0.0.1'] })
                let v = null
                try {
                    await proxyRequest({ url: `${A}/hook-${mode}` })
                }
                catch (e) {
                    v = e
                }
                assert.strictEqual(v, 'errReqTargetNotAllowed', mode)
                assert.strictEqual(nHits(), 0, `${mode} 不得送出`)
                assert.deepStrictEqual(logs, [{ event: 'proxyRequest-target', err: 'errReqTargetNotAllowed', reason: 'isAllowTarget', hop: 0 }], mode)
                assert.ok(!JSON.stringify(logs).includes(SECRET), mode)
            }
            //轉址跳之鉤子拋錯：首跳放行、轉址跳拋錯 → 固定鍵、只首跳送出
            logs = []
            let throwOnHop = (u) => {
                if (u.includes('/hop')) {
                    throw new Error(`${SECRET} ${u}`)
                }
                return true
            }
            let { proxyRequest } = mk({ isAllowTarget: throwOnHop }, { allowList: ['127.0.0.1'] })
            await assert.rejects(proxyRequest({ url: `${A}/redir?code=302&to=${encodeURIComponent(`${A}/hop`)}` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(hits.a.length, 1)
            assert.ok(!JSON.stringify(logs).includes(SECRET), '轉址跳之 log 不含鉤子拋出之內容')
        })

        it('兩者皆通過 → 放行並連線', async function() {
            let seen = []
            let { proxyRequest } = mk({ isAllowTarget: mkSpy(seen) }, { allowList: ['127.0.0.1'] })
            let r = await proxyRequest({ url: `${A}/pass` })
            assert.strictEqual(r.status, 200)
            assert.strictEqual(seen.length, 1)
            assert.strictEqual(hits.a.length, 1)
        })

        it('轉址每一跳皆先呼叫 isAllowTarget、再做內建檢查：被內建拒絕之轉址目標亦先經 isAllowTarget', async function() {
            let seen = []
            let { proxyRequest } = mk({ isAllowTarget: mkSpy(seen) }, { allowList: ['127.0.0.1'] })
            let to = `${B}/hop`
            await assert.rejects(proxyRequest({ url: `${A}/redir?code=302&to=${encodeURIComponent(to)}` }), (e) => e === 'errReqTargetNotAllowed')
            assert.strictEqual(seen.length, 2, 'isAllowTarget 對首跳與轉址跳各一次')
            assert.strictEqual(seen[1], to)
            assert.strictEqual(hits.b.length, 0)
            assert.strictEqual(logs.filter((l) => l.event === 'proxyRequest-target')[0].hop, 1)
        })
    })


    describe('close（釋放連線池）', function() {
        it('close 立即終止進行中之請求（不等其逾時；呼叫端可給較長之 timeout，stop 不應被拖住）：請求以 errProxyRequestFailed 結束、close 於 3 秒內回傳', async function() {
            this.timeout(20000)
            let p = mk({}, { allowList: ['127.0.0.1'] })
            let pm = p.proxyRequest({ url: `${A}/hang`, timeout: 600000 }).then(() => 'resolved', (e) => e)
            let t0 = Date.now()
            while (hits.a.length === 0 && Date.now() - t0 < 5000) {
                await new Promise((resolve) => setTimeout(resolve, 20))
            }
            assert.strictEqual(hits.a.length, 1, '請求已送達目標（進行中）')
            let t1 = Date.now()
            await p.close()
            assert.ok(Date.now() - t1 < 3000, `close 應立即回傳（實得 ${Date.now() - t1}ms）`)
            assert.strictEqual(await pm, 'errProxyRequestFailed', '進行中之請求被終止，回固定鍵')
        })

        it('close 後可再發請求（連線池依需要重建）；重複 close 不拋錯', async function() {
            let p = mk({}, { allowList: ['127.0.0.1'] })
            assert.strictEqual((await p.proxyRequest({ url: `${A}/c1` })).status, 200)
            await p.close()
            await p.close()
            assert.strictEqual((await p.proxyRequest({ url: `${A}/c2` })).status, 200)
        })
    })
})
