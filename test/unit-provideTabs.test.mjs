//unit：server/provideTabs.mjs（外部應用推送 apis 至 /syncAndReplaceTabs 之 HTTP wrapper）——fetch 例外之 reject 不得帶原 message：
//其原文可能含完整網址（`Request cannot be constructed from a URL that includes credentials: <網址>`、`Failed to parse URL from <網址>`），
//而網址內有 token（w-web-sso tmp/sso-token-leak-全盤.md B-6、ADR-033）；非 2xx 維持既有 Error 訊息（ADR-029）。
//不 mock fetch：連線拒絕打 11083（無人監聽，同 unit-procProxy 之保留埠）、userinfo／無法解析由 fetch 自身拋錯；非 2xx 起真 http server 11085。
import assert from 'assert'
import http from 'http'
import provideTabs from '../server/provideTabs.mjs'


let PORT = 11085
let PORT_CLOSED = 11083
let SECRET = 'SYNTH-PROVIDE-SECRET'
let rows = [{ id: 'id-provide', name: 'n', url: 'http://x/y', method: 'get' }]

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

    before(async function() {
        srv = await new Promise((resolve, reject) => {
            let s = http.createServer((req, res) => {
                req.resume()
                req.on('end', () => {
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

})
