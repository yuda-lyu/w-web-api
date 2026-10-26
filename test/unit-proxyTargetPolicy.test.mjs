//unit：server/proxyTargetPolicy.mjs（測試分頁代發請求之目標位址政策；P1，ADR-049，R-PROXYTARGET-01）——純函數，不起 server。
//使用者 2026-10-23 裁示：「api 的代發請求功能 預設拒絕內網與本機位址, 要有設定可開關可調」。
//每條斷言對應：
//- P1-1 預設拒絕之範圍：loopback（含 localhost 名稱）、私有網段、鏈路本地、未指定位址、IPv4 映射之 IPv6 等；公開位址不誤擋；各網段邊界（首尾、緊鄰外側）
//- P1-2 設定：整體開關（allowInternal）、調整（allowList：IP／CIDR／主機名）；預設值為拒絕；設定不合法即拋錯（不退回預設）
//- P1-3 連線所用之位址即檢查過之位址：guarded lookup 解析一次、檢查全部結果、任一不被允許即整次拒絕、通過者原組交回
import assert from 'assert'
import { isInternalAddress, parseAllowInternal, createTargetPolicy, createGuardedLookup, isBlockedTargetError } from '../server/proxyTargetPolicy.mjs'


describe('unit-proxyTargetPolicy', function() {

    describe('isInternalAddress（P1-1：內建拒絕之範圍，含各網段邊界）', function() {

        //IPv4：[位址, 預期是否為非公開]。邊界取「網段首、網段尾、緊鄰外側」
        let v4 = [
            //本網路 0.0.0.0/8（含未指定位址）
            ['0.0.0.0', true], ['0.255.255.255', true], ['1.0.0.0', false],
            //私有 10/8
            ['9.255.255.255', false], ['10.0.0.0', true], ['10.255.255.255', true], ['11.0.0.0', false],
            //CGNAT 100.64/10
            ['100.63.255.255', false], ['100.64.0.0', true], ['100.100.100.200', true], ['100.127.255.255', true], ['100.128.0.0', false],
            //loopback 127/8
            ['126.255.255.255', false], ['127.0.0.0', true], ['127.0.0.1', true], ['127.255.255.255', true], ['128.0.0.0', false],
            //鏈路本地 169.254/16（含雲端中繼資料位址）
            ['169.253.255.255', false], ['169.254.0.0', true], ['169.254.169.254', true], ['169.254.255.255', true], ['169.255.0.0', false],
            //私有 172.16/12
            ['172.15.255.255', false], ['172.16.0.0', true], ['172.31.255.255', true], ['172.32.0.0', false],
            //IETF 協定保留 192.0.0/24、文件 192.0.2/24
            ['191.255.255.255', false], ['192.0.0.0', true], ['192.0.0.255', true], ['192.0.1.0', false], ['192.0.1.255', false], ['192.0.2.0', true], ['192.0.2.255', true], ['192.0.3.0', false],
            //私有 192.168/16
            ['192.167.255.255', false], ['192.168.0.0', true], ['192.168.255.255', true], ['192.169.0.0', false],
            //效能測試 198.18/15、文件 198.51.100/24、203.0.113/24
            ['198.17.255.255', false], ['198.18.0.0', true], ['198.19.255.255', true], ['198.20.0.0', false],
            ['198.51.99.255', false], ['198.51.100.0', true], ['198.51.100.255', true], ['198.51.101.0', false],
            ['203.0.112.255', false], ['203.0.113.0', true], ['203.0.113.255', true], ['203.0.114.0', false],
            //多播與保留 224/4、240/4（含廣播）
            ['223.255.255.255', false], ['224.0.0.0', true], ['239.255.255.255', true], ['240.0.0.0', true], ['255.255.255.255', true],
            //一般公開位址
            ['8.8.8.8', false], ['1.1.1.1', false], ['93.184.216.34', false], ['142.250.196.110', false],
        ]
        for (let [addr, expected] of v4) {
            it(`IPv4 ${addr} → ${expected ? '非公開（拒絕）' : '公開（放行）'}`, function() {
                assert.strictEqual(isInternalAddress(addr), expected)
            })
        }

        //IPv6：非全域單播（2000::/3 以外）一律非公開；IPv4 映射／NAT64／6to4 依內嵌之 IPv4 判斷
        let v6 = [
            ['::', true], //未指定
            ['::1', true], //loopback
            ['0:0:0:0:0:0:0:1', true], //loopback 全寫
            ['::2', true], //IPv4 相容 ::/96（已棄用）
            ['::127.0.0.1', true], //IPv4 相容之點分寫法（內嵌 loopback）
            ['::8.8.8.8', true], //IPv4 相容內嵌公開位址亦拒絕（整段 ::/96 非全域單播）
            ['::ffff:127.0.0.1', true], //IPv4 映射（點分）
            ['::ffff:7f00:1', true], //IPv4 映射（十六進位寫法，同 127.0.0.1）
            ['::ffff:10.1.2.3', true],
            ['::ffff:169.254.169.254', true],
            ['::ffff:0.0.0.0', true],
            ['::ffff:8.8.8.8', false], //映射之公開位址不誤擋
            ['::ffff:808:808', false],
            ['64:ff9b::7f00:1', true], //NAT64 內嵌 127.0.0.1
            ['64:ff9b::a00:1', true], //NAT64 內嵌 10.0.0.1
            ['64:ff9b::808:808', false], //NAT64 內嵌公開位址 8.8.8.8
            ['64:ff9b:1::1', true], //本地用 NAT64
            ['2002:7f00:1::', true], //6to4 內嵌 127.0.0.1
            ['2002:a00:1::1', true], //6to4 內嵌 10.0.0.1
            ['2002:808:808::', false], //6to4 內嵌公開位址 8.8.8.8
            ['fc00::1', true], ['fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', true], //ULA fc00::/7
            ['fe00::1', true], //ULA 外側但非全域單播
            ['fe80::1', true], ['febf::1', true], //鏈路本地 fe80::/10
            ['fec0::1', true], //site-local（已棄用）
            ['ff02::1', true], ['ff00::', true], //多播
            ['2001::1', true], ['2001:1ff::1', true], //IETF 協定保留 2001::/23（含 Teredo）
            ['2001:200::1', false], //2001::/23 之外
            ['2001:db8::1', true], //文件
            ['3fff::1', true], ['3fff:fff:ffff::1', true], //文件 3fff::/20
            ['3fff:1000::1', false], //3fff::/20 之外
            ['1000::1', true], //2000::/3 之外
            //各前綴之四邊界(前一個、首、末、後一個)與映射／內嵌 IPv4 之交叉
            ['1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', true], ['2000::', false], ['3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', false], ['4000::', true], //2000::/3
            ['2001:db7:ffff:ffff:ffff:ffff:ffff:ffff', false], ['2001:db8::', true], ['2001:db8:ffff:ffff:ffff:ffff:ffff:ffff', true], ['2001:db9::', false], //2001:db8::/32
            ['2000:ffff:ffff:ffff:ffff:ffff:ffff:ffff', false], ['2001::', true], ['2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff', true], //2001::/23 首末
            ['3ffe:ffff::1', false], ['3fff::', true], ['3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff', true], //3fff::/20 首末與其前
            ['::ffff:192.168.1.1', true], ['::ffff:100.64.0.1', true], ['::ffff:172.16.0.1', true], ['::ffff:1.1.1.1', false], //映射 × 各拒絕網段
            ['64:ff9b::c0a8:101', true], ['64:ff9b::a9fe:a9fe', true], ['64:ff9b::101:101', false], //NAT64 × 192.168.1.1／169.254.169.254／1.1.1.1
            ['2002:c0a8:101::', true], ['2002:a9fe:a9fe::', true], ['2002:101:101::', false], //6to4 × 192.168.1.1／169.254.169.254／1.1.1.1
            ['2606:4700:4700::1111', false], ['2001:4860:4860::8888', false], ['2a00:1450:4001:81b::200e', false], //公開位址
            ['[::1]', true], //含方括號
            ['fe80::1%eth0', true], //含 zone id
        ]
        for (let [addr, expected] of v6) {
            it(`IPv6 ${addr} → ${expected ? '非公開（拒絕）' : '公開（放行）'}`, function() {
                assert.strictEqual(isInternalAddress(addr), expected)
            })
        }

        it('無法解析為 IP 者 → 非公開（預設拒絕）', function() {
            for (let v of ['', 'localhost', 'example.com', '1.2.3', '1.2.3.4.5', '256.1.1.1', '::g', '1::2::3', null, undefined, 12, {}]) {
                assert.strictEqual(isInternalAddress(v), true, `${JSON.stringify(v)} 應視為非公開`)
            }
        })
    })

    describe('parseAllowInternal（P1-2：整體開關之值）', function() {
        it('未給／null／\'n\'／false → 拒絕（預設）；\'y\'／true → 允許', function() {
            assert.strictEqual(parseAllowInternal(undefined), false)
            assert.strictEqual(parseAllowInternal(null), false)
            assert.strictEqual(parseAllowInternal('n'), false)
            assert.strictEqual(parseAllowInternal(false), false)
            assert.strictEqual(parseAllowInternal('y'), true)
            assert.strictEqual(parseAllowInternal(true), true)
        })
        it('其他值（\'Y\'、\'yes\'、1、0、\'\'、[]、{}）→ 拋 invalid opt.proxyAllowInternal（不靜默當成預設或允許）', function() {
            for (let v of ['Y', 'N', 'yes', 'no', 1, 0, '', [], {}, 'true']) {
                assert.throws(() => parseAllowInternal(v), (e) => e.message === 'invalid opt.proxyAllowInternal', `${JSON.stringify(v)} 應拋錯`)
            }
        })
    })

    describe('createTargetPolicy（P1-2：預設拒絕、可開關、可調整）', function() {

        it('預設（未給設定）→ 內網與本機位址不被允許、公開位址允許；allowInternal 為 false', function() {
            let p = createTargetPolicy()
            assert.strictEqual(p.allowInternal, false)
            assert.strictEqual(p.isAddressAllowed('127.0.0.1'), false)
            assert.strictEqual(p.isAddressAllowed('::1'), false)
            assert.strictEqual(p.isAddressAllowed('10.0.0.1'), false)
            assert.strictEqual(p.isAddressAllowed('8.8.8.8'), true)
            assert.strictEqual(p.isAddressAllowed('not-an-ip'), false, '無法解析之位址不允許')
            let q = createTargetPolicy({})
            assert.strictEqual(q.isAddressAllowed('192.168.1.1'), false)
        })

        it('allowInternal=true → 任何位址允許、checkUrl 不拒絕（整體關閉）', function() {
            let p = createTargetPolicy({ allowInternal: true })
            assert.strictEqual(p.allowInternal, true)
            for (let a of ['127.0.0.1', '::1', '10.0.0.1', '169.254.169.254', '0.0.0.0', '::ffff:127.0.0.1']) {
                assert.strictEqual(p.isAddressAllowed(a), true, a)
            }
            for (let u of ['http://127.0.0.1/', 'http://localhost/', 'http://[::1]/', 'http://10.0.0.1/']) {
                assert.strictEqual(p.checkUrl(new URL(u)), null, u)
            }
        })

        it('allowList 之 IP／CIDR：只放行所涵蓋之內網位址；邊界外仍拒絕；公開位址不受影響', function() {
            let p = createTargetPolicy({ allowList: ['127.0.0.1', '10.0.0.0/8', '192.168.1.0/24', 'fd00::/8', '::1'] })
            for (let a of ['127.0.0.1', '10.0.0.0', '10.255.255.255', '192.168.1.0', '192.168.1.255', 'fd00::1', 'fdff::1', '::1', '8.8.8.8']) {
                assert.strictEqual(p.isAddressAllowed(a), true, `${a} 應允許`)
            }
            for (let a of ['127.0.0.2', '192.168.0.255', '192.168.2.0', 'fc00::1', 'fe00::1', '172.16.0.1', '169.254.169.254', '0.0.0.0']) {
                assert.strictEqual(p.isAddressAllowed(a), false, `${a} 應仍拒絕`)
            }
        })

        it('allowList 之 IPv4 項亦涵蓋其 IPv4 映射之 IPv6 寫法；IPv6 項不涵蓋 IPv4', function() {
            let p = createTargetPolicy({ allowList: ['127.0.0.1'] })
            assert.strictEqual(p.isAddressAllowed('::ffff:127.0.0.1'), true)
            assert.strictEqual(p.isAddressAllowed('::ffff:7f00:1'), true)
            assert.strictEqual(p.isAddressAllowed('::ffff:127.0.0.2'), false)
            assert.strictEqual(p.isAddressAllowed('::1'), false, 'IPv4 項不涵蓋 IPv6 loopback')
            let q = createTargetPolicy({ allowList: ['::1'] })
            assert.strictEqual(q.isAddressAllowed('::1'), true)
            assert.strictEqual(q.isAddressAllowed('127.0.0.1'), false, 'IPv6 項不涵蓋 IPv4 loopback')
        })

        it('allowList 之 /0、/32、/128 邊界：/32 與 /128 即單一位址；/0 涵蓋同族全部（系統管理者之明確決定）', function() {
            let p = createTargetPolicy({ allowList: ['10.1.2.3/32', 'fd00::5/128'] })
            assert.strictEqual(p.isAddressAllowed('10.1.2.3'), true)
            assert.strictEqual(p.isAddressAllowed('10.1.2.4'), false)
            assert.strictEqual(p.isAddressAllowed('fd00::5'), true)
            assert.strictEqual(p.isAddressAllowed('fd00::6'), false)
            let q = createTargetPolicy({ allowList: ['0.0.0.0/0'] })
            assert.strictEqual(q.isAddressAllowed('10.9.9.9'), true)
            assert.strictEqual(q.isAddressAllowed('::1'), false, '/0 只涵蓋 IPv4')
        })

        it('allowList 之 CIDR 交叉：IPv6 /0 只涵蓋 IPv6；含非零主機位元之 CIDR 依前綴比對；映射寫法之 IPv6 CIDR 只涵蓋映射形式（不涵蓋純 IPv4）', function() {
            let p6 = createTargetPolicy({ allowList: ['::/0'] })
            assert.strictEqual(p6.isAddressAllowed('::1'), true)
            assert.strictEqual(p6.isAddressAllowed('fc00::1'), true)
            assert.strictEqual(p6.isAddressAllowed('10.0.0.1'), false, 'IPv6 /0 不涵蓋 IPv4')
            let nz = createTargetPolicy({ allowList: ['10.1.2.3/8'] })
            assert.strictEqual(nz.isAddressAllowed('10.9.9.9'), true, '前綴比對，主機位元不影響')
            assert.strictEqual(nz.isAddressAllowed('192.168.0.1'), false)
            let mp = createTargetPolicy({ allowList: ['::ffff:10.0.0.0/104'] })
            assert.strictEqual(mp.isAddressAllowed('::ffff:10.1.2.3'), true)
            assert.strictEqual(mp.isAddressAllowed('::ffff:11.0.0.1'), true, '映射之公開位址本就不拒絕')
            assert.strictEqual(mp.isAddressAllowed('::ffff:192.168.0.1'), false)
            assert.strictEqual(mp.isAddressAllowed('10.1.2.3'), false, '純 IPv4 不被 IPv6 項涵蓋')
        })

        it('allowInternal=true 時 allowList 之不合法項仍拋錯（設定檢核不因開關而略過）', function() {
            assert.throws(() => createTargetPolicy({ allowInternal: true, allowList: ['bad host'] }), (e) => e.message === 'invalid opt.proxyAllowList')
            assert.throws(() => createTargetPolicy({ allowInternal: 'y', allowList: 'x' }), (e) => e.message === 'invalid opt.proxyAllowList')
        })

        it('allowList 之主機名：不分大小寫、容許尾端 .；isHostExempt 只認所列之主機（不含子網域）', function() {
            let p = createTargetPolicy({ allowList: ['Api.Internal', 'db.corp.local.'] })
            assert.strictEqual(p.isHostExempt('api.internal'), true)
            assert.strictEqual(p.isHostExempt('API.INTERNAL'), true)
            assert.strictEqual(p.isHostExempt('api.internal.'), true)
            assert.strictEqual(p.isHostExempt('db.corp.local'), true)
            assert.strictEqual(p.isHostExempt('x.api.internal'), false, '不含子網域')
            assert.strictEqual(p.isHostExempt('internal'), false)
            assert.strictEqual(p.isHostExempt(''), false)
            assert.strictEqual(p.isHostExempt(undefined), false)
        })

        it('checkUrl：IP 字面值依 isAddressAllowed；localhost 名稱（含 *.localhost、大小寫、尾端 .）拒絕；一般主機名通過（待連線當下由 guarded lookup 檢查）', function() {
            let p = createTargetPolicy()
            let deny = [
                'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f.0.0.1/', 'http://0177.0.0.1/', 'http://127.0.0.1./',
                'http://[::1]/', 'http://[0:0:0:0:0:0:0:1]/', 'http://[::]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://0.0.0.0/', 'http://0/',
                'http://10.0.0.1/', 'http://172.16.5.5:8080/x', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1/',
                'http://[fe80::1]/', 'http://[fd12:3456::1]/', 'https://[64:ff9b::7f00:1]/',
                'http://localhost/', 'http://LOCALHOST:11005/', 'http://localhost./', 'http://foo.localhost/', 'http://a.b.localhost:80/',
                'http://localhost../', 'http://localhost.../', 'http://a.localhost../', 'http://127.0.0.1../', 'http://[::127.0.0.1]/', //多重尾端點（WHATWG URL 不去除）與 IPv4 相容之點分寫法
                'http://0x7f000001/', 'http://0x7f.1/', 'http://0177.0.0.01/', 'http://%31%32%37.0.0.1/', //完整十六進位整數、混合進位、八進位、百分比編碼主機
                'http://user:pw@127.0.0.1/', 'http://127.0.0.1:65535/', 'http://[::FFFF:7F00:1]/', 'http://[0:0:0:0:0:ffff:7f00:1]/', //userinfo、埠、IPv6 大小寫與全寫
                'http://[::ffff:192.168.1.1]/', 'http://[64:ff9b::c0a8:101]/', 'http://[2002:c0a8:101::]/', 'http://[fc00::1]:8080/x', //映射、NAT64、6to4 內嵌私有位址
            ]
            for (let u of deny) {
                assert.ok(p.checkUrl(new URL(u)) !== null, `${u} 應拒絕`)
            }
            assert.strictEqual(p.checkUrl(new URL('http://127.0.0.1/')), 'internalAddress')
            assert.strictEqual(p.checkUrl(new URL('http://[::1]/')), 'internalAddress')
            assert.strictEqual(p.checkUrl(new URL('http://localhost/')), 'internalName')
            let pass = ['http://8.8.8.8/', 'https://[2606:4700:4700::1111]/', 'http://example.com/', 'http://localhost.example.com/', 'http://mylocalhost/', 'http://intranet/']
            for (let u of pass) {
                assert.strictEqual(p.checkUrl(new URL(u)), null, `${u} 應通過`)
            }
        })

        it('checkUrl 與 allowList：所列之 IP／CIDR 放行字面值；localhost 名稱須列主機名 localhost 本身（列 127.0.0.1 不涵蓋名稱）', function() {
            let p = createTargetPolicy({ allowList: ['127.0.0.1', '10.0.0.0/8'] })
            assert.strictEqual(p.checkUrl(new URL('http://127.0.0.1:8080/')), null)
            assert.strictEqual(p.checkUrl(new URL('http://10.2.3.4/')), null)
            assert.strictEqual(p.checkUrl(new URL('http://127.0.0.2/')), 'internalAddress')
            assert.strictEqual(p.checkUrl(new URL('http://[::1]/')), 'internalAddress')
            assert.strictEqual(p.checkUrl(new URL('http://localhost/')), 'internalName')
            let q = createTargetPolicy({ allowList: ['localhost'] })
            assert.strictEqual(q.checkUrl(new URL('http://localhost:8080/')), null)
            assert.strictEqual(q.checkUrl(new URL('http://LOCALHOST/')), null)
            assert.strictEqual(q.checkUrl(new URL('http://foo.localhost/')), 'internalName', '只列 localhost 不涵蓋子網域')
            assert.strictEqual(q.checkUrl(new URL('http://127.0.0.1/')), 'internalAddress', '列名稱不涵蓋 IP 字面值')
        })

        it('allowList 不合法 → 拋 invalid opt.proxyAllowList（非陣列、非字串項、格式錯誤、CIDR 長度越界、含 port／scheme／萬用字元／空白內）', function() {
            let badLists = [
                'localhost', 123, {}, true, //非陣列
                [1], [null], [undefined], [{}], [[]], [''], ['   '], //非字串或空
                ['10.0.0.0/33'], ['10.0.0.0/-1'], ['10.0.0.0/'], ['10.0.0.0/abc'], ['10.0.0.0/8/8'], ['::1/129'], ['::1/1000'], //CIDR
                ['10.0.0.256'], ['10.0.0'], ['1.2.3.4.5'], ['300.1.1.1'], //IP 形狀
                ['127.0.0.1:8080'], ['localhost:8080'], ['http://localhost'], ['a/b'], ['*.corp.local'], ['*'], ['a b'], ['host_name!'], ['-a.com'], ['a-.com'], ['a..com'], ['.a.com'], //主機名形狀
                ['[::1]'], ['[::1]/64'], ['fe80::1%eth0'], //括號與 zone id
                ['0x7f000001'], ['1.2.3.0x4'], ['example.0x1'], ['example.123'], ['0x7f.1'], //末段為數字或十六進位之寫法：URL 會把它當 IPv4（或視為無效主機），不是主機名，列了也永不命中，故拒絕
                ['127.0.0.1', 'bad host'], //其中一項不合法即整份拒絕
            ]
            for (let l of badLists) {
                assert.throws(() => createTargetPolicy({ allowList: l }), (e) => e.message === 'invalid opt.proxyAllowList', `${JSON.stringify(l)} 應拋錯`)
            }
        })

        it('allowList 未給／null／[] → 通過（無放寬）', function() {
            for (let l of [undefined, null, []]) {
                let p = createTargetPolicy({ allowList: l })
                assert.strictEqual(p.isAddressAllowed('127.0.0.1'), false)
            }
        })

        it('allowInternal 不合法 → 拋 invalid opt.proxyAllowInternal（先於 allowList 檢查）', function() {
            assert.throws(() => createTargetPolicy({ allowInternal: 'maybe', allowList: ['bad host'] }), (e) => e.message === 'invalid opt.proxyAllowInternal')
        })
    })

    describe('createGuardedLookup（P1-3：連線所用之位址即檢查過之位址）', function() {

        //fake 解析器：依主機名回固定結果並計次
        let mkResolver = (table) => {
            let calls = []
            let resolver = (host, opts, cb) => {
                calls.push({ host, opts })
                let v = table[host.toLowerCase()] //DNS 主機名不分大小寫
                if (v instanceof Error) {
                    setImmediate(() => cb(v))
                    return
                }
                if (v === undefined) {
                    setImmediate(() => cb(Object.assign(new Error('nf'), { code: 'ENOTFOUND' })))
                    return
                }
                let list = typeof v === 'function' ? v(calls.length) : v
                setImmediate(() => cb(null, list.map((a) => ({ address: a, family: a.includes(':') ? 6 : 4 }))))
            }
            return { resolver, calls }
        }
        let run = (lookup, host, options) => new Promise((resolve) => {
            let cb = (err, a, f) => resolve({ err, a, f })
            if (options === undefined) {
                lookup(host, cb)
            }
            else {
                lookup(host, options, cb)
            }
        })

        it('解析結果皆為公開位址 → 原組交回（all:true 回陣列；未給 all 回第一筆之 address 與 family）；解析器恰被呼叫 1 次且帶 all:true', async function() {
            let { resolver, calls } = mkResolver({ 'pub.test': ['93.184.216.34', '2606:4700::1111'] })
            let lookup = createGuardedLookup(createTargetPolicy(), resolver)
            let r1 = await run(lookup, 'pub.test', { all: true })
            assert.strictEqual(r1.err, null)
            assert.deepStrictEqual(r1.a, [{ address: '93.184.216.34', family: 4 }, { address: '2606:4700::1111', family: 6 }])
            let r2 = await run(lookup, 'pub.test', {})
            assert.strictEqual(r2.a, '93.184.216.34')
            assert.strictEqual(r2.f, 4)
            let r3 = await run(lookup, 'pub.test')
            assert.strictEqual(r3.a, '93.184.216.34', '省略 options 之呼叫形式')
            assert.strictEqual(calls.length, 3, '每次連線解析一次、不重複解析')
            assert.ok(calls.every((c) => c.opts.all === true), '解析器一律以 all:true 取全部結果供檢查')
        })

        it('任一解析結果為內網或本機 → 整次拒絕（帶被拒標記，不交回任何位址）；混合（公開＋內網）亦拒絕', async function() {
            let { resolver } = mkResolver({
                'lo.test': ['127.0.0.1'],
                'lo6.test': ['::1'],
                'mapped.test': ['::ffff:10.0.0.1'],
                'mix.test': ['93.184.216.34', '10.0.0.1'],
                'mix2.test': ['10.0.0.1', '93.184.216.34'],
                'meta.test': ['169.254.169.254'],
            })
            let lookup = createGuardedLookup(createTargetPolicy(), resolver)
            for (let h of ['lo.test', 'lo6.test', 'mapped.test', 'mix.test', 'mix2.test', 'meta.test']) {
                for (let options of [{ all: true }, {}]) {
                    let r = await run(lookup, h, options)
                    assert.ok(r.err instanceof Error, `${h} ${JSON.stringify(options)} 應拒絕`)
                    assert.strictEqual(r.a, undefined, `${h} 被拒不得交回位址`)
                    assert.strictEqual(isBlockedTargetError(r.err), true, `${h} 之錯誤應帶被拒標記`)
                    assert.strictEqual(r.err.code, 'ETARGETBLOCKED')
                    assert.ok(!/test|127|10\.|169/.test(r.err.message), `錯誤訊息不得含主機名或位址（實得「${r.err.message}」）`)
                }
            }
        })

        it('解析器之錯誤（ENOTFOUND 等）原樣回傳、不帶被拒標記；解析結果為空 → ENOTFOUND', async function() {
            let { resolver } = mkResolver({ 'empty.test': [], 'err.test': Object.assign(new Error('boom'), { code: 'EAI_AGAIN' }) })
            let lookup = createGuardedLookup(createTargetPolicy(), resolver)
            let r1 = await run(lookup, 'nf.test', { all: true })
            assert.strictEqual(r1.err.code, 'ENOTFOUND')
            assert.strictEqual(isBlockedTargetError(r1.err), false)
            let r2 = await run(lookup, 'err.test', { all: true })
            assert.strictEqual(r2.err.code, 'EAI_AGAIN')
            assert.strictEqual(isBlockedTargetError(r2.err), false)
            let r3 = await run(lookup, 'empty.test', { all: true })
            assert.strictEqual(r3.err.code, 'ENOTFOUND')
            assert.strictEqual(isBlockedTargetError(r3.err), false)
        })

        it('allowList 之 IP 涵蓋全部解析結果 → 通過；有一個不涵蓋 → 拒絕', async function() {
            let { resolver } = mkResolver({ 'a.test': ['127.0.0.1'], 'b.test': ['127.0.0.1', '127.0.0.2'] })
            let lookup = createGuardedLookup(createTargetPolicy({ allowList: ['127.0.0.1'] }), resolver)
            assert.deepStrictEqual((await run(lookup, 'a.test', { all: true })).a, [{ address: '127.0.0.1', family: 4 }])
            assert.strictEqual(isBlockedTargetError((await run(lookup, 'b.test', { all: true })).err), true)
        })

        it('allowList 之主機名：該主機之解析結果不檢查（含內網）；其他主機仍檢查', async function() {
            let { resolver } = mkResolver({ 'ok.internal': ['10.0.0.9', '169.254.169.254'], 'other.internal': ['10.0.0.9'] })
            let lookup = createGuardedLookup(createTargetPolicy({ allowList: ['ok.internal'] }), resolver)
            assert.strictEqual((await run(lookup, 'ok.internal', { all: true })).err, null)
            assert.strictEqual((await run(lookup, 'OK.Internal', { all: true })).err, null, '主機名不分大小寫')
            assert.strictEqual(isBlockedTargetError((await run(lookup, 'other.internal', { all: true })).err), true)
        })

        it('雙族混合：公開 IPv4＋內網 IPv6、內網 IPv6＋公開 IPv4、公開 IPv6＋內網 IPv4、內網 IPv4＋公開 IPv6 → 皆整次拒絕', async function() {
            let { resolver } = mkResolver({
                'a.test': ['93.184.216.34', '::1'],
                'b.test': ['fd00::1', '93.184.216.34'],
                'c.test': ['2606:4700::1111', '10.0.0.1'],
                'd.test': ['10.0.0.1', '2606:4700::1111'],
            })
            let lookup = createGuardedLookup(createTargetPolicy(), resolver)
            for (let h of ['a.test', 'b.test', 'c.test', 'd.test']) {
                for (let options of [{ all: true }, {}, { family: 0, hints: 0, all: true }]) {
                    let r = await run(lookup, h, options)
                    assert.strictEqual(isBlockedTargetError(r.err), true, `${h} ${JSON.stringify(options)}`)
                    assert.strictEqual(r.a, undefined)
                }
            }
        })

        it('options 之形式：給 family／hints 者原樣傳給解析器並加 all:true；數字形式（舊式 family）正規化為 { family }；未給 options 與函數形式皆可', async function() {
            let { resolver, calls } = mkResolver({ 'pub.test': ['93.184.216.34'] })
            let lookup = createGuardedLookup(createTargetPolicy(), resolver)
            await run(lookup, 'pub.test', { family: 4, hints: 1024, all: true })
            await run(lookup, 'pub.test', 6)
            await run(lookup, 'pub.test', 4)
            await run(lookup, 'pub.test', 0)
            await run(lookup, 'pub.test')
            assert.deepStrictEqual(calls.map((c) => c.opts), [
                { family: 4, hints: 1024, all: true },
                { family: 6, all: true },
                { family: 4, all: true },
                { family: 0, all: true },
                { all: true },
            ])
        })

        it('allowInternal=true → 不檢查任何解析結果', async function() {
            let { resolver } = mkResolver({ 'lo.test': ['127.0.0.1'], 'meta.test': ['169.254.169.254'] })
            let lookup = createGuardedLookup(createTargetPolicy({ allowInternal: true }), resolver)
            assert.strictEqual((await run(lookup, 'lo.test', { all: true })).err, null)
            assert.strictEqual((await run(lookup, 'meta.test', { all: true })).err, null)
        })

        it('預設解析器為 dns.lookup：localhost 解析到 loopback 而被拒（真解析）', async function() {
            let lookup = createGuardedLookup(createTargetPolicy())
            let r = await run(lookup, 'localhost', { all: true })
            assert.strictEqual(isBlockedTargetError(r.err), true, `localhost 之解析結果為 loopback，應被拒（實得 ${r.err && r.err.code}）`)
        })

        it('isBlockedTargetError：沿 cause 鏈辨識（最多數層）；非標記錯誤、null、undefined 為 false', function() {
            let { resolver } = mkResolver({ 'lo.test': ['127.0.0.1'] })
            let lookup = createGuardedLookup(createTargetPolicy(), resolver)
            return run(lookup, 'lo.test', { all: true }).then((r) => {
                let wrapped = new TypeError('fetch failed', { cause: r.err })
                assert.strictEqual(isBlockedTargetError(wrapped), true)
                let wrapped2 = new Error('outer', { cause: wrapped })
                assert.strictEqual(isBlockedTargetError(wrapped2), true)
                assert.strictEqual(isBlockedTargetError(new Error('x')), false)
                assert.strictEqual(isBlockedTargetError(new TypeError('fetch failed', { cause: Object.assign(new Error('c'), { code: 'ECONNREFUSED' }) })), false)
                //較深之 cause 鏈（超過原先之 6 層上限）與 AggregateError（autoSelectFamily 多位址連線失敗時之形狀）、循環 cause 不致無窮迴圈
                let deep = r.err
                for (let i = 0; i < 15; i++) {
                    deep = new Error(`wrap${i}`, { cause: deep })
                }
                assert.strictEqual(isBlockedTargetError(deep), true, '15 層 cause 內之被拒標記仍應辨識')
                assert.strictEqual(isBlockedTargetError(new AggregateError([new Error('x'), new Error('y', { cause: r.err })], 'multi')), true, 'AggregateError.errors 內之被拒標記')
                let loop = new Error('loop')
                loop.cause = loop
                assert.strictEqual(isBlockedTargetError(loop), false, '循環 cause 回 false 而不卡住')
                assert.strictEqual(isBlockedTargetError(null), false)
                assert.strictEqual(isBlockedTargetError(undefined), false)
                assert.strictEqual(isBlockedTargetError('ETARGETBLOCKED'), false)
            })
        })
    })
})
