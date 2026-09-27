//unit：server/maskLog.mjs——權杖／憑證寫入 console 與 srLog 前之唯一遮罩出口（M 契約；w-web-sso tmp/sso-token-leak-全盤.md〈六〉「共用契約 M」，
//四 repo 同一組測資）與錯誤名稱／代碼之形狀過濾（K 契約 helper console 之 errName／errCode 形狀）。每條斷言對應契約之一句；ADR-033。
import assert from 'assert'
import { maskTok, maskQuery, maskUrl, pickErrName, pickErrCode } from '../server/maskLog.mjs'


describe('unit-maskLog', function() {

    //M 契約測資表：逐列照抄規格〈六〉（四 repo 同一組）
    it('MASK-001 maskTok：規格〈六〉測資表 11 列逐列成立', function() {
        let rows = [
            ['', ''],
            ['abc', '(len=3)'],
            ['abcdefg', '(len=7)'],
            ['abcdefgh', 'a...h(len=8)'],
            ['token-for-app', 't...p(len=13)'],
            ['abcdefghijklmnop', 'ab...op(len=16)'],
            ['0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', '0199...4a5b(len=36)'],
            [['abcdefghijklmnop', 'x'], ['ab...op(len=16)', '(len=1)']],
            [{ a: 'SECRET' }, '(object)'],
            [12345, '(number)'],
            ['\nbcdefghijklmno\r', '?b...o?(len=16)'],
        ]
        for (let [inp, out] of rows) {
            assert.deepStrictEqual(maskTok(inp), out, `maskTok(${JSON.stringify(inp)})`)
        }
    })

    //M 契約：undefined／null → ''；k＝min(4, floor(n/8)) 之邊界（n=15→1、16→2、31→3、32→4、100→4）
    it('MASK-002 maskTok：undefined／null 與露出字數 k 之邊界', function() {
        assert.strictEqual(maskTok(undefined), '')
        assert.strictEqual(maskTok(null), '')
        assert.strictEqual(maskTok('a'), '(len=1)')
        assert.strictEqual(maskTok('abcdefghijklmno'), 'a...o(len=15)')
        let s31 = 'ABC' + 'x'.repeat(25) + 'XYZ'
        assert.strictEqual(maskTok(s31), 'ABC...XYZ(len=31)')
        let s32 = 'ABCD' + 'x'.repeat(24) + 'WXYZ'
        assert.strictEqual(maskTok(s32), 'ABCD...WXYZ(len=32)')
        let s100 = 'ABCD' + 'x'.repeat(92) + 'WXYZ'
        assert.strictEqual(maskTok(s100), 'ABCD...WXYZ(len=100)')
    })

    //M 契約：絕不輸出原值——中段不露出；其他型別只給 (typeof)；陣列逐元素（含巢狀）
    it('MASK-003 maskTok：中段不露出、其他型別只給型別、陣列逐元素', function() {
        let secret = 'SYNTH-MASK-SECRET-0123456789'
        let m = maskTok(secret)
        assert.strictEqual(m, 'SYN...789(len=28)')
        assert.ok(!m.includes('SECRET'), '中段不得露出')
        assert.strictEqual(maskTok(true), '(boolean)')
        assert.strictEqual(maskTok(() => 'SYNTH'), '(function)')
        assert.strictEqual(maskTok(Symbol('SYNTH')), '(symbol)')
        assert.strictEqual(maskTok(10n), '(bigint)')
        assert.strictEqual(maskTok(new Error('SYNTH-ERR')), '(object)')
        assert.deepStrictEqual(maskTok([['abcdefgh'], null, 7]), [['a...h(len=8)'], '', '(number)'])
    })

    //M 契約：露出字元中之控制字元 \u0000-\u001f 與 \u007f 一律換成 ?（防 log 注入）；未露出之中段不影響
    it('MASK-004 maskTok：露出字元之控制字元換成 ?', function() {
        assert.strictEqual(maskTok('\u0000\u001f' + 'x'.repeat(12) + '\u007f\u0009'), '??...??(len=16)')
        assert.strictEqual(maskTok('ab' + '\n'.repeat(12) + 'yz'), 'ab...yz(len=16)')
        assert.strictEqual(maskTok('\u0080bcdefgh'), '\u0080...h(len=8)', '\u0080 不在控制字元範圍，原樣')
    })

    //M 契約 maskQuery：淺拷貝（不動原物件）、鍵名小寫為 token 者以 maskTok 處理（含陣列值），其他鍵原樣
    it('MASK-005 maskQuery：淺拷貝、token 鍵（不分大小寫）遮罩、其他鍵原樣', function() {
        let q = { token: 'abcdefghijklmnop', keyTable: 'apis' }
        let r = maskQuery(q)
        assert.deepStrictEqual(r, { token: 'ab...op(len=16)', keyTable: 'apis' })
        assert.notStrictEqual(r, q, '須為新物件')
        assert.strictEqual(q.token, 'abcdefghijklmnop', '不得改動原物件')
        assert.deepStrictEqual(maskQuery({ Token: 'abcdefgh', TOKEN: ['abcdefghijklmnop', 'x'] }), { Token: 'a...h(len=8)', TOKEN: ['ab...op(len=16)', '(len=1)'] })
        //Hapi 之 request.query 為無原型物件
        let qn = Object.create(null)
        qn.token = 'abcdefgh'
        assert.deepStrictEqual({ ...maskQuery(qn) }, { token: 'a...h(len=8)' })
    })

    //maskQuery 之輸入非物件（規格未定義）：依 M 契約遮罩，絕不原樣輸出
    it('MASK-006 maskQuery：非物件輸入依 M 契約遮罩', function() {
        assert.strictEqual(maskQuery(undefined), '')
        assert.strictEqual(maskQuery('token=abcdefghijklmnop'), 'to...op(len=22)')
        assert.deepStrictEqual(maskQuery(['abcdefgh']), ['a...h(len=8)'])
    })

    //M 契約 maskUrl：http(s) 字串 → origin + pathname（捨棄 query、fragment、userinfo）
    it('MASK-007 maskUrl：http(s) 捨棄 userinfo／query／fragment，只留 origin + pathname', function() {
        //w-web-sso test/unit-maskLog.test.mjs MASK-008-url 之同一組測資（逐字照抄）
        assert.strictEqual(maskUrl('http://127.0.0.1:11007/?view=x&token=SECRET-TOKEN-VALUE'), 'http://127.0.0.1:11007/')
        assert.strictEqual(maskUrl('https://user:pass@example.com/a/b?k=SECRET#frag'), 'https://example.com/a/b')
        assert.strictEqual(maskUrl('not a url'), '(invalid-url)')
        assert.deepStrictEqual(maskUrl(['http://a.example.com/x?t=1', 'http://b.example.com/y?t=2']), ['http://a.example.com/x', 'http://b.example.com/y'])
        //本 repo 補充
        assert.strictEqual(maskUrl('http://user:SYNTH-PW@example.com:8080/p/a?token=SYNTH-Q#SYNTH-F'), 'http://example.com:8080/p/a')
        assert.strictEqual(maskUrl('http://127.0.0.1:11007/api/getSsoUserInfor?token=token-for-app&key=token&value=SYNTH-V'), 'http://127.0.0.1:11007/api/getSsoUserInfor')
        assert.strictEqual(maskUrl('https://example.com'), 'https://example.com/')
    })

    //M 契約 maskUrl：無法解析 → (invalid-url)；空值 → ''；陣列逐元素；其他非字串只給型別
    it('MASK-008 maskUrl：無法解析回 (invalid-url)、空值／陣列／非字串', function() {
        assert.strictEqual(maskUrl('http://[SYNTH-BAD/x?token=SYNTH-Q'), '(invalid-url)')
        assert.strictEqual(maskUrl('/relative?token=SYNTH-Q'), '(invalid-url)')
        assert.strictEqual(maskUrl('not a url SYNTH'), '(invalid-url)')
        assert.strictEqual(maskUrl(undefined), '')
        assert.strictEqual(maskUrl(null), '')
        assert.strictEqual(maskUrl(''), '')
        assert.deepStrictEqual(maskUrl(['http://x/p?token=SYNTH-Q', 'bad SYNTH']), ['http://x/p', '(invalid-url)'])
        assert.strictEqual(maskUrl(12345), '(number)')
        assert.strictEqual(maskUrl({ href: 'http://x/?token=SYNTH' }), '(object)')
    })

    //M 契約 maskUrl（同 w-web-sso src/maskUrl.mjs）：非 http(s) 只給 protocol——ftp 之 userinfo、data:／javascript: 之 pathname（內容本體）皆不輸出
    it('MASK-009 maskUrl：非 http(s) 網址只回 protocol', function() {
        assert.strictEqual(maskUrl('ftp://user:SYNTH-PW@127.0.0.1/x'), 'ftp:')
        assert.strictEqual(maskUrl('data:text/plain,SYNTH-DATA-SECRET'), 'data:')
        assert.strictEqual(maskUrl('javascript:alert("SYNTH")'), 'javascript:')
        assert.strictEqual(maskUrl('file:///C:/SYNTH/x'), 'file:')
    })

    //K 契約之形狀（同 w-web-sso src/fetchSsoMsg.mjs）：errName 只收 /^[A-Za-z]{1,40}$/、errCode 只收 /^[A-Z][A-Z0-9_]{1,40}$/
    //（先取 cause.code、無則 err.code），不合形狀回 ''；絕不取 message
    it('MASK-010 pickErrName／pickErrCode：只收名稱／代碼形狀', function() {
        assert.strictEqual(pickErrCode(Object.assign(new Error('ENOENT: no such file, open C:/SYNTH'), { code: 'ENOENT' })), 'ENOENT', '無 cause 時取 err.code')
        let refused = new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' }) })
        assert.strictEqual(pickErrName(refused), 'TypeError')
        assert.strictEqual(pickErrCode(refused), 'ECONNREFUSED')
        let timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
        assert.strictEqual(pickErrName(timeout), 'TimeoutError')
        assert.strictEqual(pickErrCode(timeout), '')
        let bad = Object.assign(new Error('x'), { name: 'SYNTH SECRET http://x', cause: { code: 'http://SYNTH' } })
        assert.strictEqual(pickErrName(bad), '')
        assert.strictEqual(pickErrCode(bad), '')
        assert.strictEqual(pickErrCode({ cause: { code: 'econnrefused' } }), '')
        assert.strictEqual(pickErrCode({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }), 'UND_ERR_CONNECT_TIMEOUT')
        for (let v of ['SYNTH-STRING', null, undefined, 123, {}]) {
            assert.strictEqual(pickErrName(v), '', `pickErrName(${String(v)})`)
            assert.strictEqual(pickErrCode(v), '', `pickErrCode(${String(v)})`)
        }
    })

})
