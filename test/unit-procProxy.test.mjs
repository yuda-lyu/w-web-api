//unit：server/procProxy.mjs（測試分頁 proxy，Node 內建 fetch）——起真 http server 直打 proxyRequest，不 mock 接縫。
//每條斷言對應 spec/流程_測試API.md「規則摘要」之契約與 ADR-029／ADR-031（請求內容原文送出、標頭表為唯一真理源、
//重複鍵不收斂、轉址逐跳檢核 isAllowTarget）。兩個 origin：主 server 11082、跨來源 server 11084；11083 保留為「無人監聽」。
import assert from 'assert'
import http from 'http'
import procProxy from '../server/procProxy.mjs'


let PORT = 11082
let PORT2 = 11084 //跨來源（origin 含 port）轉址目標
let PORT_CLOSED = 11083 //無人監聽：連線拒絕 case
let BASE = `http://127.0.0.1:${PORT}`
let BASE2 = `http://127.0.0.1:${PORT2}`
let srvs = []
let received = [] //每次請求 server 端所見 { port, method, url, headers, raw }

function makeHandler(port) {
    return (req, res) => {
        let chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
            received.push({ port, method: req.method, url: req.url, headers: req.headers, raw: Buffer.concat(chunks).toString('utf8') })
            let p = req.url
            if (p.startsWith('/json')) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': ['a=1', 'b=2'], 'X-Resp': 'yes' })
                res.end('{"ok":true,"n":1}')
            }
            else if (p.startsWith('/arr')) {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end('[{"id":1},{"id":2}]')
            }
            else if (p.startsWith('/text')) {
                res.writeHead(200, { 'Content-Type': 'text/plain' })
                res.end('not json {')
            }
            else if (p.startsWith('/e404')) {
                res.writeHead(404, { 'Content-Type': 'application/json' })
                res.end('{"err":"nf"}')
            }
            else if (p.startsWith('/slow')) {
                setTimeout(() => {
                    res.writeHead(200)
                    res.end('late')
                }, 1500)
            }
            else if (p.startsWith('/empty')) {
                res.writeHead(204)
                res.end()
            }
            //轉址 fixtures（ADR-031）
            else if (p.startsWith('/r302')) {
                res.writeHead(302, { Location: '/json' })
                res.end()
            }
            else if (p.startsWith('/rrel')) {
                res.writeHead(301, { Location: 'json' }) //相對路徑，須以當前 URL 解析
                res.end()
            }
            else if (p.startsWith('/rchain')) {
                res.writeHead(302, { Location: '/r302' }) //兩跳：/rchain → /r302 → /json
                res.end()
            }
            else if (p.startsWith('/r301p')) {
                res.writeHead(301, { Location: '/p' })
                res.end()
            }
            else if (p.startsWith('/r303p')) {
                res.writeHead(303, { Location: '/p' })
                res.end()
            }
            else if (p.startsWith('/r307p')) {
                res.writeHead(307, { Location: '/p' })
                res.end()
            }
            else if (p.startsWith('/rblock')) {
                res.writeHead(302, { Location: `${BASE}/deny` })
                res.end()
            }
            else if (p.startsWith('/rloop')) {
                res.writeHead(302, { Location: '/rloop' })
                res.end()
            }
            else if (p.startsWith('/rcross')) {
                res.writeHead(302, { Location: `${BASE2}/p` })
                res.end()
            }
            else if (p.startsWith('/rnoloc')) {
                res.writeHead(302)
                res.end('no location')
            }
            else if (p.startsWith('/rftp')) {
                res.writeHead(302, { Location: 'ftp://127.0.0.1/x' })
                res.end()
            }
            else {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end('{"echo":true}')
            }
        })
    }
}

function listen(port) {
    return new Promise((resolve, reject) => {
        let srv = http.createServer(makeHandler(port))
        srv.on('error', reject)
        srv.listen(port, '127.0.0.1', () => resolve(srv))
    })
}

async function startServers() {
    srvs = [await listen(PORT), await listen(PORT2)]
}

function stopServers() {
    return Promise.all(srvs.map((srv) => new Promise((resolve) => srv.close(() => resolve())))).then(() => {
        srvs = []
    })
}

function lastReceived() {
    return received[received.length - 1]
}

function urlsReceived() {
    return received.map((g) => g.url)
}


describe('unit-procProxy', function() {
    this.timeout(20000)

    let logs = []
    let srLog = { error: (o) => logs.push(o), warn: (o) => logs.push(o), info: (o) => logs.push(o) }
    let { proxyRequest } = procProxy({ srLog })

    before(async function() {
        await startServers()
    })

    after(async function() {
        await stopServers()
    })

    beforeEach(function() {
        received = []
        logs = []
    })


    //契約「請求內容原文送出」：字串 body 原封位元組送達（含非法 JSON、含前後空白），不解析、不驗證、不代換；明給之 Content-Type 保留
    it('PROXY-001 非法 JSON 字串 body 原封送達、Content-Type 保留', async function() {
        let raw = '  {"a":1,}  '
        let r = await proxyRequest({ method: 'POST', url: `${BASE}/p`, headers: { 'Content-Type': 'application/json' }, body: raw })
        assert.strictEqual(r.status, 200)
        let g = lastReceived()
        assert.strictEqual(g.raw, raw, 'server 應收到與輸入逐字相同之 body')
        assert.strictEqual(g.headers['content-type'], 'application/json')
        assert.strictEqual(g.headers['content-length'], String(Buffer.byteLength(raw)))
    })

    //契約「空白則不帶 body」：'' / undefined → 無 body、無 content-type、content-length 為 0 或不存在
    it('PROXY-002 空字串／undefined body 不帶 body', async function() {
        for (let body of ['', undefined]) {
            await proxyRequest({ method: 'POST', url: `${BASE}/p`, headers: {}, body })
            let g = lastReceived()
            assert.strictEqual(g.raw, '', `body=${JSON.stringify(body)} 時 server 應收到空 body`)
            assert.strictEqual(g.headers['content-type'], undefined, '不得補任何 Content-Type')
            assert.ok(g.headers['content-length'] === undefined || g.headers['content-length'] === '0')
        }
    })

    //契約「不補 Content-Type；標頭表為唯一真理源」：字串 body 未給 Content-Type → 不補（fetch 對字串 body 會補 text/plain，故改送位元組）
    it('PROXY-003 字串 body 未給 Content-Type 時不補', async function() {
        await proxyRequest({ method: 'POST', url: `${BASE}/p`, headers: {}, body: 'plain text body' })
        let g = lastReceived()
        assert.strictEqual(g.raw, 'plain text body')
        assert.strictEqual(g.headers['content-type'], undefined)
    })

    //向後相容（非本前端之其他呼叫端）：物件／陣列 body 以 JSON 序列化送出；無 Content-Type 補 application/json，有給則不覆蓋（物件型與鍵值對型標頭皆算「有給」）
    it('PROXY-004 物件／陣列 body 序列化送出、無 Content-Type 才補 application/json', async function() {
        await proxyRequest({ method: 'POST', url: `${BASE}/p`, headers: {}, body: { a: 1 } })
        let g1 = lastReceived()
        assert.strictEqual(g1.raw, '{"a":1}')
        assert.strictEqual(g1.headers['content-type'], 'application/json')

        await proxyRequest({ method: 'PUT', url: `${BASE}/p`, headers: { 'content-type': 'application/vnd.x+json' }, body: [1, 2] })
        let g2 = lastReceived()
        assert.strictEqual(g2.raw, '[1,2]')
        assert.strictEqual(g2.headers['content-type'], 'application/vnd.x+json', '呼叫端已給之 Content-Type 不得被覆蓋')

        await proxyRequest({ method: 'POST', url: `${BASE}/p`, headers: [['Content-Type', 'text/plain']], body: { a: 1 } })
        assert.strictEqual(lastReceived().headers['content-type'], 'text/plain', '鍵值對型標頭已給之 Content-Type 亦不得被覆蓋')
    })

    //回應契約（對齊改造前 axios 輸出形狀）：可 parse 者回物件／陣列，否則原文；status / statusText / headers / durationMs 齊備；
    //4xx 視為有回應不 reject；set-cookie 多值為陣列；204 空 body 回 ''
    it('PROXY-005 回應形狀：JSON parse／原文／狀態／標頭／耗時；4xx 不 reject；set-cookie 陣列', async function() {
        let r1 = await proxyRequest({ method: 'GET', url: `${BASE}/json` })
        assert.deepStrictEqual(r1.data, { ok: true, n: 1 })
        assert.strictEqual(r1.status, 200)
        assert.strictEqual(r1.statusText, 'OK')
        assert.strictEqual(r1.headers['x-resp'], 'yes')
        assert.deepStrictEqual(r1.headers['set-cookie'], ['a=1', 'b=2'])
        assert.ok(typeof r1.durationMs === 'number' && r1.durationMs >= 0)

        let r2 = await proxyRequest({ method: 'GET', url: `${BASE}/arr` })
        assert.deepStrictEqual(r2.data, [{ id: 1 }, { id: 2 }])

        let r3 = await proxyRequest({ method: 'GET', url: `${BASE}/text` })
        assert.strictEqual(r3.data, 'not json {')

        let r4 = await proxyRequest({ method: 'GET', url: `${BASE}/e404` })
        assert.strictEqual(r4.status, 404)
        assert.deepStrictEqual(r4.data, { err: 'nf' })

        let r5 = await proxyRequest({ method: 'GET', url: `${BASE}/empty` })
        assert.strictEqual(r5.status, 204)
        assert.strictEqual(r5.data, '')
    })

    //失敗路徑：逾時 → reject 'errProxyRequestFailed'（前端依 lang 顯示），srLog.error 記 event 與真實訊息
    it('PROXY-006 逾時 reject errProxyRequestFailed 並 log 真實訊息', async function() {
        let t0 = Date.now()
        await assert.rejects(proxyRequest({ method: 'GET', url: `${BASE}/slow`, timeout: 300 }), (e) => e === 'errProxyRequestFailed')
        assert.ok(Date.now() - t0 < 1400, '應於 timeout 附近即 reject，不等 server 回應')
        let log = logs.find((o) => o.event === 'proxyRequest-fetch')
        assert.ok(log && /timeout|abort/i.test(log.msg), `srLog.error 應含逾時訊息（實得 ${JSON.stringify(log)}）`)
        await new Promise((resolve) => setTimeout(resolve, 1300)) //等 server 端 slow 回應結束，避免影響下一 case
    })

    //失敗路徑：連線拒絕（無人監聽）→ reject 'errProxyRequestFailed'，log 含 cause
    it('PROXY-007 連線拒絕 reject errProxyRequestFailed 並 log cause', async function() {
        await assert.rejects(proxyRequest({ method: 'GET', url: `http://127.0.0.1:${PORT_CLOSED}/` }), (e) => e === 'errProxyRequestFailed')
        let log = logs.find((o) => o.event === 'proxyRequest-fetch')
        assert.ok(log && (/ECONNREFUSED/i.test(log.cause) || /ECONNREFUSED|fetch failed/i.test(log.msg)), `log 應含連線拒絕原因（實得 ${JSON.stringify(log)}）`)
    })

    //前置檢核：url 空／非 http(s)／非法 → 'errReqUrlInvalid'；isAllowTarget 回 false → 'errReqTargetNotAllowed'（皆不打網路）
    it('PROXY-008 url 檢核與 isAllowTarget', async function() {
        for (let url of ['', 'notaurl', 'ftp://x/', 'http://']) {
            await assert.rejects(proxyRequest({ url }), (e) => e === 'errReqUrlInvalid', `url=${JSON.stringify(url)}`)
        }
        let { proxyRequest: pr2 } = procProxy({ srLog, isAllowTarget: (u) => !u.includes('deny') })
        await assert.rejects(pr2({ url: `${BASE}/deny` }), (e) => e === 'errReqTargetNotAllowed')
        assert.strictEqual(received.length, 0, '檢核失敗不得打到目標')
        let r = await pr2({ url: `${BASE}/ok` })
        assert.strictEqual(r.status, 200)
    })

    //query 併入 URL（保留 url 既有 query；非 ASCII 值 percent-encoding）；標頭：剝除 host / content-length / hop-by-hop，其餘原樣轉送
    it('PROXY-009 query 併入與標頭剝除規則', async function() {
        await proxyRequest({
            method: 'POST',
            url: `${BASE}/q?keep=1`,
            query: { k: '中文 值', n: 2 },
            headers: { 'Host': 'evil.example', 'Content-Length': '999', 'Connection': 'close', 'Keep-Alive': 'timeout=5', 'Transfer-Encoding': 'chunked', 'X-Custom': 'v1', 'Cookie': 'a=1' },
            body: 'xx',
        })
        let g = lastReceived()
        assert.strictEqual(g.url, '/q?keep=1&k=%E4%B8%AD%E6%96%87+%E5%80%BC&n=2')
        assert.strictEqual(g.headers['host'], `127.0.0.1:${PORT}`, 'Host 由連線層決定')
        assert.strictEqual(g.headers['content-length'], '2', 'Content-Length 由實際 body 決定')
        assert.strictEqual(g.headers['transfer-encoding'], undefined)
        assert.strictEqual(g.headers['keep-alive'], undefined)
        assert.strictEqual(g.headers['x-custom'], 'v1', '自訂標頭原樣轉送')
        assert.strictEqual(g.headers['cookie'], 'a=1')
    })

    //GET / HEAD 不帶 body（fetch 對 GET/HEAD 帶 body 會拋錯，proxy 須先剝）
    it('PROXY-010 GET/HEAD 給了 body 亦不送且不拋錯', async function() {
        let r = await proxyRequest({ method: 'GET', url: `${BASE}/json`, body: '{"x":1}' })
        assert.strictEqual(r.status, 200)
        assert.strictEqual(lastReceived().raw, '')
        let r2 = await proxyRequest({ method: 'HEAD', url: `${BASE}/json`, body: 'x' })
        assert.strictEqual(r2.status, 200)
        assert.strictEqual(lastReceived().method, 'HEAD')
    })

    //ADR-031「重複鍵不收斂」：有序鍵值對之 query 逐對 append（?id=1&id=2）；重複標頭依 Fetch 標準合併（', '；cookie 為 '; '）；
    //物件型 query 值為陣列＝同鍵多值（向後相容）；非法標頭名 → errProxyRequestFailed 並 log（不外洩 TypeError）
    it('PROXY-011 重複鍵：query 各自 append、標頭合併、cookie 以 ; 合併', async function() {
        await proxyRequest({
            method: 'POST',
            url: `${BASE}/q`,
            query: [['id', '1'], ['id', '2'], ['k', 'v']],
            headers: [['X-Dup', 'a'], ['X-Dup', 'b'], ['Cookie', 'a=1'], ['Cookie', 'b=2'], ['X-One', '1']],
            body: 'x',
        })
        let g = lastReceived()
        assert.strictEqual(g.url, '/q?id=1&id=2&k=v', '重複 query 鍵各自送達')
        assert.strictEqual(g.headers['x-dup'], 'a, b', '重複標頭依 Fetch 標準以 ", " 合併')
        assert.strictEqual(g.headers['cookie'], 'a=1; b=2', 'cookie 以 "; " 合併')
        assert.strictEqual(g.headers['x-one'], '1')

        await proxyRequest({ url: `${BASE}/q`, query: { id: ['1', '2'], n: 3 } })
        assert.strictEqual(lastReceived().url, '/q?id=1&id=2&n=3', '物件型 query 之陣列值為同鍵多值')

        await assert.rejects(proxyRequest({ url: `${BASE}/p`, headers: [['Bad Name', 'x']] }), (e) => e === 'errProxyRequestFailed')
        assert.ok(logs.some((o) => o.event === 'proxyRequest-headers'), '非法標頭名應 log proxyRequest-headers')
    })

    //ADR-031「轉址手動跟隨」：302 → 最終回應；相對 Location 以當前 URL 解析；多跳；3xx 無 Location 視為最終回應（原樣回 3xx）
    it('PROXY-012 轉址跟隨：絕對／相對 Location、多跳、無 Location 之 3xx 原樣回傳', async function() {
        let r1 = await proxyRequest({ url: `${BASE}/r302` })
        assert.strictEqual(r1.status, 200)
        assert.deepStrictEqual(r1.data, { ok: true, n: 1 })
        assert.deepStrictEqual(urlsReceived(), ['/r302', '/json'])

        received = []
        let r2 = await proxyRequest({ url: `${BASE}/rrel` })
        assert.strictEqual(r2.status, 200)
        assert.deepStrictEqual(urlsReceived(), ['/rrel', '/json'], '相對 Location 應以當前 URL 解析')

        received = []
        let r3 = await proxyRequest({ url: `${BASE}/rchain` })
        assert.strictEqual(r3.status, 200)
        assert.deepStrictEqual(urlsReceived(), ['/rchain', '/r302', '/json'])

        received = []
        let r4 = await proxyRequest({ url: `${BASE}/rnoloc` })
        assert.strictEqual(r4.status, 302, '無 Location 之 3xx 視為最終回應')
        assert.strictEqual(r4.data, 'no location')
        assert.deepStrictEqual(urlsReceived(), ['/rnoloc'])
    })

    //ADR-031：方法／body 改寫依 Fetch 標準 §4.4——301/302 之 POST 與 303 改 GET 並丟 body 與 content-* 標頭；307 保留方法與 body
    it('PROXY-013 轉址之方法／body 改寫：301/302/303 → GET 無 body；307 保留 POST 與 body', async function() {
        for (let p of ['/r301p', '/r303p']) {
            received = []
            let r = await proxyRequest({ method: 'POST', url: `${BASE}${p}`, headers: { 'Content-Type': 'text/plain', 'X-Keep': 'k' }, body: 'BODY' })
            assert.strictEqual(r.status, 200)
            let g = lastReceived()
            assert.strictEqual(g.url, '/p')
            assert.strictEqual(g.method, 'GET', `${p} 後應改為 GET`)
            assert.strictEqual(g.raw, '', `${p} 後不得再帶 body`)
            assert.strictEqual(g.headers['content-type'], undefined, `${p} 後應移除 content-type`)
            assert.strictEqual(g.headers['x-keep'], 'k', '其他標頭保留')
        }
        received = []
        let r = await proxyRequest({ method: 'POST', url: `${BASE}/r307p`, headers: { 'Content-Type': 'text/plain' }, body: 'BODY' })
        assert.strictEqual(r.status, 200)
        let g = lastReceived()
        assert.strictEqual(g.method, 'POST', '307 應保留方法')
        assert.strictEqual(g.raw, 'BODY', '307 應保留 body')
        assert.strictEqual(g.headers['content-type'], 'text/plain')
    })

    //ADR-031「每一跳重新檢核 isAllowTarget」：合法首跳 302 到不允許之位址 → reject errReqTargetNotAllowed、不允許之位址不得被打到、log 帶 err-key
    it('PROXY-014 轉址逐跳檢核 isAllowTarget：合法首跳轉到不允許位址即拒絕', async function() {
        let { proxyRequest: pr2 } = procProxy({ srLog, isAllowTarget: (u) => !u.includes('deny') })
        await assert.rejects(pr2({ url: `${BASE}/rblock` }), (e) => e === 'errReqTargetNotAllowed')
        assert.deepStrictEqual(urlsReceived(), ['/rblock'], '不允許之轉址目標不得被打到')
        let log = logs.find((o) => o.event === 'proxyRequest-redirect')
        assert.ok(log && log.err === 'errReqTargetNotAllowed' && /deny/.test(log.msg), `應 log 轉址拒絕細節（實得 ${JSON.stringify(log)}）`)
    })

    //ADR-031：跳數上限 20（同瀏覽器／undici）→ errProxyRequestFailed 並 log；非 http(s) 之 Location → errProxyRequestFailed
    it('PROXY-015 轉址上限與非 http(s) Location', async function() {
        await assert.rejects(proxyRequest({ url: `${BASE}/rloop` }), (e) => e === 'errProxyRequestFailed')
        assert.strictEqual(received.length, 21, '首跳 + 20 跳後即停止（不無限跟隨）')
        let log = logs.find((o) => o.event === 'proxyRequest-redirect')
        assert.ok(log && /too many redirects/.test(log.msg), `應 log 跳數超限（實得 ${JSON.stringify(log)}）`)

        received = []
        logs = []
        await assert.rejects(proxyRequest({ url: `${BASE}/rftp` }), (e) => e === 'errProxyRequestFailed')
        assert.deepStrictEqual(urlsReceived(), ['/rftp'])
        assert.ok(logs.some((o) => o.event === 'proxyRequest-redirect' && /unsupported redirect protocol/.test(o.msg)))
    })

    //ADR-031：跨來源（origin 含 port）轉址剝除 Authorization（Fetch 標準）；同來源保留
    it('PROXY-016 跨來源轉址剝除 Authorization、同來源保留', async function() {
        let r = await proxyRequest({ url: `${BASE}/rcross`, headers: { 'Authorization': 'Bearer t', 'X-Custom': 'v' } })
        assert.strictEqual(r.status, 200)
        let g = lastReceived()
        assert.strictEqual(g.port, PORT2, '應打到跨來源目標')
        assert.strictEqual(g.headers['authorization'], undefined, '跨來源轉址不得帶 Authorization')
        assert.strictEqual(g.headers['x-custom'], 'v', '其他標頭保留')

        received = []
        await proxyRequest({ url: `${BASE}/r302`, headers: { Authorization: 'Bearer t' } })
        assert.strictEqual(lastReceived().headers['authorization'], 'Bearer t', '同來源轉址保留 Authorization')
    })

})
