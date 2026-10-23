//unit：server/provideTabs.mjs（外部應用推送 apis 至 /syncAndReplaceTabs 之 HTTP wrapper）——fetch 例外之 reject 不得帶原 message：
//其原文可能含完整網址（`Request cannot be constructed from a URL that includes credentials: <網址>`、`Failed to parse URL from <網址>`），
//而網址內有 token（w-web-sso tmp/sso-token-leak-全盤.md B-6、ADR-033）；非 2xx 維持既有 Error 訊息（ADR-029）。
//不 mock fetch：連線拒絕打 11083（無人監聽，同 unit-procProxy 之保留埠）、userinfo／無法解析由 fetch 自身拋錯；非 2xx 起真 http server 11085。
//2026-10-23（原則 11、規格 §9、ADR-046）：外部端輔助不得送 id、須送 srcKey——缺 srcKey 於呼叫端即 reject、不送出（PROVIDE-005～008，以 11085 之請求計數與本文驗證）。
import assert from 'assert'
import http from 'http'
import provideTabs from '../server/provideTabs.mjs'


let PORT = 11085
let PORT_CLOSED = 11083
let SECRET = 'SYNTH-PROVIDE-SECRET'
let rows = [{ srcKey: 'src-provide', name: 'n', url: 'http://x/y', method: 'get' }]

//reject 值須為 Error，且 message 與 stack（console.log(err) 之輸出）皆不含合成秘密與網址
async function rejectOf(url) {
    let err = null
    await provideTabs(url, 'apis', 'g', rows).then(() => {
        throw new Error('應 reject')
    }, (e) => {
        err = e
    })
    assert.ok(err instanceof Error, `reject 值應為 Error（實得 ${String(err)}）`)
    for (let s of [String(err.message), String(err.stack)]) {
        assert.ok(!s.includes(SECRET), `不得含合成秘密（實得 ${s}）`)
        assert.ok(!s.includes('syncAndReplaceTabs'), `不得含網址（實得 ${s}）`)
    }
    assert.strictEqual(err.cause, undefined, '不得以 cause 夾帶原錯誤（console.log 會連同 cause 原文印出）')
    return err
}


describe('unit-provideTabs', function() {
    this.timeout(20000)

    let srv = null
    let bodies = [] //伺服器收到之請求本文（JSON 解析後）

    before(async function() {
        srv = await new Promise((resolve, reject) => {
            let s = http.createServer((req, res) => {
                let chunks = []
                req.on('data', (c) => chunks.push(c))
                req.on('end', () => {
                    try {
                        bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
                    }
                    catch (e) {
                        bodies.push(null)
                    }
                    res.writeHead(500, { 'Content-Type': 'application/json' })
                    res.end('{"err":"x"}')
                })
            })
            s.on('error', reject)
            s.listen(PORT, '127.0.0.1', () => resolve(s))
        })
    })

    after(async function() {
        await new Promise((resolve) => srv.close(() => resolve()))
    })

    //fetch 例外：連線拒絕 → Error('Request failed: TypeError ECONNREFUSED')（err.name＋cause.code，不帶原 message）
    it('PROVIDE-001 連線拒絕：reject 之 Error 只含名稱與代碼、不含網址與 token', async function() {
        let err = await rejectOf(`http://127.0.0.1:${PORT_CLOSED}/syncAndReplaceTabs?token=${SECRET}&keyTable=apis`)
        assert.strictEqual(err.message, 'Request failed: TypeError ECONNREFUSED')
    })

    //fetch 例外：網址含 userinfo → fetch 之 TypeError 原文為含帳密之完整網址；無 cause.code
    it('PROVIDE-002 網址含 userinfo：reject 之 Error 不含帳密與網址', async function() {
        let err = await rejectOf(`http://user:${SECRET}-PW@127.0.0.1:${PORT_CLOSED}/syncAndReplaceTabs?token=${SECRET}&keyTable=apis`)
        assert.strictEqual(err.message, 'Request failed: TypeError')
    })

    //fetch 例外：網址無法解析 → fetch 之 TypeError 原文為完整網址；cause.code 為 ERR_INVALID_URL
    it('PROVIDE-003 網址無法解析：reject 之 Error 不含網址', async function() {
        let err = await rejectOf(`http://[${SECRET}/syncAndReplaceTabs?token=${SECRET}&keyTable=apis`)
        assert.strictEqual(err.message, 'Request failed: TypeError ERR_INVALID_URL')
    })

    //非 2xx：維持既有 Error 訊息（同 axios 格式，ADR-029）
    it('PROVIDE-004 非 2xx：reject Error 訊息維持 Request failed with status code N', async function() {
        let err = await rejectOf(`http://127.0.0.1:${PORT}/syncAndReplaceTabs?token=${SECRET}&keyTable=apis`)
        assert.strictEqual(err.message, 'Request failed with status code 500')
    })

    //srcKey 必填（規格 §9：不提供呼叫端相容；缺則於呼叫端即報錯、不送出）
    let urlOk = () => `http://127.0.0.1:${PORT}/syncAndReplaceTabs?token=${SECRET}&keyTable=apis`
    let rejectOfRows = async (rowsIn) => {
        bodies.length = 0
        let err = null
        await provideTabs(urlOk(), 'apis', 'g', rowsIn).then(() => {
            throw new Error('應 reject')
        }, (e) => {
            err = e
        })
        assert.ok(err instanceof Error, `reject 值應為 Error（實得 ${String(err)}）`)
        assert.strictEqual(bodies.length, 0, '缺 srcKey 不得送出任何請求')
        for (let s of [String(err.message), String(err.stack)]) {
            assert.ok(!s.includes(SECRET) && !s.includes('syncAndReplaceTabs'), '錯誤不含網址與 token')
        }
        return err
    }

    it('PROVIDE-005 缺 srcKey（無該欄）→ 呼叫端即 reject、不送出；錯誤只含列索引、不含欄位值', async function() {
        let err = await rejectOfRows([{ name: 'SECRET-NAME', url: 'http://x/y' }])
        assert.strictEqual(err.message, 'invalid rows[0]: srcKey is required (non-empty string)')
        assert.ok(!err.message.includes('SECRET-NAME'))
    })

    it('PROVIDE-006 只送 id 而無 srcKey（不得以 id 代替）→ reject、不送出；srcKey 為空字串或非字串亦然', async function() {
        let err = await rejectOfRows([{ id: 'SECRET-ID', name: 'n', url: 'http://x/y' }])
        assert.strictEqual(err.message, 'invalid rows[0]: srcKey is required (non-empty string)')
        assert.ok(!err.message.includes('SECRET-ID'))
        for (let v of ['', null, 5, {}, ['a']]) {
            await rejectOfRows([{ srcKey: v, name: 'n', url: 'http://x/y' }])
        }
    })

    it('PROVIDE-007 混批：任一列缺 srcKey → 整批不送出（錯誤指出該列索引）；rows 非陣列、列非物件亦 reject', async function() {
        let err = await rejectOfRows([...rows, { name: 'n2', url: 'http://x/z' }])
        assert.strictEqual(err.message, 'invalid rows[1]: srcKey is required (non-empty string)')
        await rejectOfRows('x')
        await rejectOfRows(null)
        await rejectOfRows([null])
        await rejectOfRows([...rows, 5])
    })

    it('PROVIDE-008 帶 srcKey 者照常送出，且只送 srcKey 與白名單內之欄位——不送 id（外部不得指定內部 id）、不送本系統擁有欄位；srcKey 為 base64: 前綴者原樣送出（由伺服器還原）', async function() {
        bodies.length = 0
        let err = null
        await provideTabs(urlOk(), 'apis', 'g', [{ srcKey: 'k1', id: 'SECRET-ID', name: 'n', url: 'http://x/y', method: 'get', tokens: 'T', authType: 'bearer' }, { srcKey: 'base64:azI=', name: 'n2', url: 'http://x/z' }]).then(() => {
            throw new Error('應 reject（測試伺服器回 500）')
        }, (e) => {
            err = e
        })
        assert.strictEqual(err.message, 'Request failed with status code 500', '請求已送出（伺服器回 500）')
        assert.strictEqual(bodies.length, 1)
        assert.strictEqual(bodies[0].group, 'g')
        assert.deepStrictEqual(bodies[0].rows[0], { srcKey: 'k1', name: 'n', url: 'http://x/y', method: 'get' })
        assert.ok(!('id' in bodies[0].rows[0]) && !('id' in bodies[0].rows[1]), '不送 id')
        assert.strictEqual(bodies[0].rows[1].srcKey, 'base64:azI=')
        assert.ok(!JSON.stringify(bodies[0]).includes('SECRET-ID'))
    })

})
