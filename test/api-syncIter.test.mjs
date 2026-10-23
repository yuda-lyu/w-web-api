//api-syncIter：POST /syncAndReplaceTabs?keyTable=apis 之 base64 自動還原——列物件含數字 length 欄位（R-OBJ-ITER-01）
//
// 依據：CLAUDE_rulebook.md「R-OBJ-ITER-01」；外部同步契約（ADR-031）：rows 內以 `base64:` 為前綴之字串欄位於寫入前還原為原字串。
//   - 列物件由外部應用送入（已授權之呼叫者），欄位名可為任意字串，含 `length`；
//   - 修改前還原以 lodash each 走訪列物件：具非負整數 length 之物件改走索引 0..length-1，真實欄位被略過（base64 還原靜默失效，
//     字面 `base64:SGVsbG8=` 原樣入庫）；length 極大時（2^32-1）單一同步 each 空轉數十秒，阻塞事件迴圈（整個後端停擺）。
// 作法：每案經真實 HTTP（token=sys 開發捷徑，同 api-http）；以 woItems 直讀庫內列驗證儲存值；
//   length 極大之案放最後、用戶端 8 秒中止，且 after 以全新後端取代（修改前該案使後端空轉，勿影響他檔）。

import assert from 'assert'
import { restartBackend, baseUrl, resetToBaseSeed, woItems } from './tools/e2e-setup.mjs'


let GROUP = 'api-sync-iter'
let url = `${baseUrl}/syncAndReplaceTabs?token=sys&keyTable=apis`


async function post(rows, ms = 15000) {
    let res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ group: GROUP, rows }),
        signal: AbortSignal.timeout(ms),
    })
    return await res.json()
}


async function rowsOf() {
    return (await woItems.apis.select({})).filter((r) => r.group === GROUP)
}


let b64 = (s) => 'base64:' + Buffer.from(s, 'utf8').toString('base64')


describe('api-syncIter (syncAndReplaceTabs 之 base64 還原 × 列物件含 length 欄位, R-OBJ-ITER-01)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        await restartBackend('./settings.json') //全新後端（不經 startServersOnce 之 build）
    })

    beforeEach(async function() {
        this.timeout(30000)
        await resetToBaseSeed()
    })

    after(async function() {
        this.timeout(120000)
        await restartBackend('./settings.json') //取代可能被空轉佔住之後端
        await resetToBaseSeed()
    })

    //srcKey 必填（2026-10-23，原則 11、ADR-046：不提供以 id 代替或「無鍵列每次新增」之相容）；本檔驗 base64 還原與 length 欄位，列間以 srcKey 區分
    let mk = (extra = {}) => ({ srcKey: 'si-1', name: b64('Hello'), url: b64('http://x/y'), method: 'get', levels: 'API', ...extra })

    it('AI-001 對照：無 length 欄位——name／url 之 base64 前綴字串皆還原', async function() {
        let r = await post([mk()])
        assert.strictEqual(r.state, 'success', JSON.stringify(r))
        let rs = await rowsOf()
        assert.strictEqual(rs.length, 1)
        assert.strictEqual(rs[0].name, 'Hello')
        assert.strictEqual(rs[0].url, 'http://x/y')
    })

    it('AI-002 列含 length: 0／1／3：還原照常（修改前 length: 0 不走訪任何欄位、1／3 只走索引，字面 base64: 原樣入庫）；length 為一般欄位，不入庫', async function() {
        for (let len of [0, 1, 3, -1, 1.5, '3', null]) {
            let r = await post([mk({ length: len })])
            assert.strictEqual(r.state, 'success', `length ${len}: ${JSON.stringify(r)}`)
            let rs = await rowsOf()
            assert.strictEqual(rs.length, 1, `length ${len}`)
            assert.strictEqual(rs[0].name, 'Hello', `length ${len}: name 應還原`)
            assert.strictEqual(rs[0].url, 'http://x/y', `length ${len}: url 應還原`)
            assert.ok(!('length' in rs[0]), `length ${len}: schema 無 length 欄，不入庫`)
        }
    })

    it('AI-003 同批多列：第一列含 length、第二列無——兩列皆還原', async function() {
        let r = await post([mk({ length: 2, name: b64('One') }), mk({ srcKey: 'si-2', name: b64('Two') })])
        assert.strictEqual(r.state, 'success', JSON.stringify(r))
        let names = (await rowsOf()).map((x) => x.name).sort()
        assert.deepStrictEqual(names, ['One', 'Two'])
    })

    it('AI-004 欄位值非 base64: 前綴者原樣；前綴為大小寫不同者不還原（既有語意不變）', async function() {
        let r = await post([mk({ name: 'plain', url: 'http://x/y', length: 1 }), mk({ srcKey: 'si-2', name: 'BASE64:SGVsbG8=', url: 'http://x/z', length: 1 })])
        assert.strictEqual(r.state, 'success', JSON.stringify(r))
        let names = (await rowsOf()).map((x) => x.name).sort()
        assert.deepStrictEqual(names, ['BASE64:SGVsbG8=', 'plain'])
    })

    it('AI-005 列含 length: 2^32-1：8 秒內回應且還原（修改前單一 each 空轉數十秒阻塞後端）', async function() {
        let t0 = Date.now()
        let r = await post([mk({ length: 4294967295 })], 8000)
        assert.ok(Date.now() - t0 < 8000)
        assert.strictEqual(r.state, 'success', JSON.stringify(r))
        let rs = await rowsOf()
        assert.strictEqual(rs.length, 1)
        assert.strictEqual(rs[0].name, 'Hello')
    })

})
