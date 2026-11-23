//前端瀏覽器 console 不印資料值(排程第 206 項〔api 側〕; 規則帳本 R-CONSOLE-NOVAL-01; 規格〈診斷輸出與遮罩〉D2、〈輸入參數之檢測機制〉V20)
//  承 2026-10-31 api 輪(伺服端 console 不印值, R-CONSOLE-01; 當時只改伺服端、列知悉瀏覽器端 console 未動), 本輪補前端: src/ 下可執行之 console 呼叫(.vue 之 <script>、.js、.mjs)
//  只印固定字面值、typeof、或不含值之摘要函數(describeShape／describeErr), 不印權杖、使用者物件、登入回應、錯誤本體、訊息文字。
//CNVF-001 站點不變式: src/ 下(排除已由 unit-consoleSites 涵蓋之 src/schema/**)每個可執行 console 呼叫之每個引數皆不印值
//CNVF-002 站點全集: 各檔之可執行 console 呼叫數已盤點(新增站點須先判定其引數); 範圍涵蓋進入檔與全部元件; 非常規之 console 引用(別名、解構、括號存取、window.console、傳遞)全專案為 0
//CNVF-003 單一實作: describeShape／describeErr 只定義於 src/describeShape.mjs(暫行單一模組, 日後由 wsemi 共用函數取代, 排程第 603 項); 使用者皆自該模組匯入; 其依賴閉包不含 Node 內建模組(瀏覽器可載入)
//CNVF-004 行為: 摘要不含值(以識別值植入使用者物件、授權字串、錯誤訊息逐一驗)、控制字元、有界、永不拋錯; describeErr 經 wsemi getDiagBriefErr 之接線(共用語料 C01～C03 之輸入)
//掃描以 eslint 之 AST 為準(test/tools/srcScan.mjs、consoleSites.mjs), 不靠正規表示式; .vue 取 <script> 區
//跑法: npx mocha test/unit-consoleNoValuesFront.test.mjs --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { builtinModules } from 'module'
import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'
import diagCases from 'wsemi/src/_diagCases.mjs'
import { scanCode } from './tools/consoleSites.mjs'
import { scriptOf, templateOf, codeText, findOddConsoleRefs, importClosure, projRoot } from './tools/srcScan.mjs'
import { describeShape, describeErr, safeCtl } from '../src/describeShape.mjs'

const A = assert.strict
const rel = (fp) => path.relative(projRoot, fp).replace(/\\/g, '/')

//src/ 下全部可執行檔(.vue、.js、.mjs)
function walkSrc() {
    let out = []
    let walk = (d) => {
        for (let n of fs.readdirSync(d, { withFileTypes: true })) {
            let fp = path.join(d, n.name)
            if (n.isDirectory()) {
                walk(fp)
            }
            else if (/\.(vue|js|mjs)$/.test(n.name)) {
                out.push(fp)
            }
        }
    }
    walk(path.join(projRoot, 'src'))
    return out.sort()
}

//前端專用 = src/ 下除 src/schema/**(前後端共用, funTest 於伺服端執行, 其 console 站點由 unit-consoleSites 之 SITE-002／003 涵蓋)
const frontFiles = () => walkSrc().filter((fp) => !rel(fp).startsWith('src/schema/'))

//各檔可執行 console 呼叫之站點數(2026-11-23 盤點; 前端專用之 src 檔)——新增站點須先判定其引數是否印值, 再更新本表
const SITES = {
    'src/App.vue': 5,
    'src/main.js': 2,
    'src/components/LayoutContentEdit.vue': 8,
    'src/components/LayoutContentStats.vue': 1,
    'src/components/LayoutContentTest.vue': 2,
    'src/components/MdPanel.vue': 1,
    'src/store/applyRows.mjs': 2,
}


describe('unit-consoleNoValuesFront (前端 console 不印資料值, 排程第 206 項〔api 側〕)', function() {

    it('CNVF-001 前端專用之 src 檔: 每個可執行 console 呼叫之每個引數皆為固定字面值／typeof／describeShape／describeErr(修前 2026-11-23 於 21 個站點中 20 個含未遮罩之引數〔共 21 個引數〕: 登入成功之使用者物件、登入失敗回應、網址、錯誤本體、$alert 訊息等)', function() {
        let bad = []
        for (let fp of frontFiles()) {
            for (let s of scanCode(scriptOf(fp))) {
                for (let a of s.args.filter((x) => !x.safe)) {
                    bad.push(`${rel(fp)}:${s.line} ${s.call}(…${a.text.slice(0, 60)}…) [${a.why}]`)
                }
            }
        }
        A.deepEqual(bad, [], `前端 console 站點印出可能含資料值之引數 ${bad.length} 處:\n${bad.join('\n')}`)
    })

    it('CNVF-002 站點全集: 各檔之可執行 console 呼叫數與已盤點者相同(共 21 處); 範圍涵蓋進入檔與全部元件', function() {
        let got = {}
        for (let fp of frontFiles()) {
            let n = scanCode(scriptOf(fp)).length
            if (n > 0) {
                got[rel(fp)] = n
            }
        }
        A.deepEqual(got, SITES, '各檔站點數與盤點不符(新增或移除站點須先判定引數是否印值, 再更新 SITES)')
        A.equal(Object.values(SITES).reduce((a, b) => a + b, 0), 21)
        let rels = frontFiles().map(rel)
        for (let f of ['src/App.vue', 'src/main.js', 'src/components/LayoutContentEdit.vue', 'src/components/LayoutContentStats.vue', 'src/store/applyRows.mjs']) {
            A.ok(rels.includes(f), `掃描範圍缺 ${f}`)
        }
        A.ok(frontFiles().some((fp) => fp.endsWith('.vue')) && frontFiles().some((fp) => fp.endsWith('.mjs')), '掃描器未空轉: 至少掃到 .vue 與 .mjs')
        //src/ 以外之前端出口(public/ 之內嵌 <script>、vue.config.js、babel.config.js): 無 console 站點、無非常規輸出管道(同一 AST 掃描)
        for (let fp of [path.join(projRoot, 'vue.config.js'), path.join(projRoot, 'babel.config.js'), path.join(projRoot, 'public', 'index.html')]) {
            A.deepEqual(scanCode(scriptOf(fp)).map((s) => s.line), [], `${rel(fp)} 不得有 console 站點`)
            A.deepEqual(findOddConsoleRefs(scriptOf(fp)).map((h) => `${h.line}:${h.kind}`), [], `${rel(fp)} 不得有非常規輸出管道`)
        }
        //Vue 範本內之運算式(@click="console.log(…)" 等)不得引用 console(Vue 2 範本之全域白名單不含 console, 但仍防呆)
        for (let fp of frontFiles().filter((f) => f.endsWith('.vue'))) {
            A.ok(!/\bconsole\b/.test(templateOf(fp)), `${rel(fp)} 之 <template> 不得引用 console`)
        }
    })

    it('CNVF-002b console 之引用皆為 console.(log|warn|error|info|debug|…)( 之直接呼叫: src/ 全部(含 src/schema)無別名、解構、括號存取、window.console、`.catch(console.log)` 式傳遞; 無 debugger、alert／confirm／prompt、eval／Function 建構／字串碼計時器、onerror／errorHandler／warnHandler 之指定', function() {
        let bad = []
        for (let fp of walkSrc()) {
            for (let h of findOddConsoleRefs(scriptOf(fp))) {
                bad.push(`${rel(fp)}:${h.line}: [${h.kind}] ${h.text}`)
            }
        }
        A.deepEqual(bad, [], `console 之非常規引用(CNVF-001 之掃描器不涵蓋)${bad.length} 處, 須先改為常規形式或擴充掃描器:\n${bad.join('\n')}`)
    })

    it('CNVF-002c 掃描器自測: 對 .vue 之 <script> 區與各種盲點寫法確實回報(防掃描器空轉)', function() {
        let fd = path.join(projRoot, 'test', '_tmp', 'consoleNoValuesFront-scan')
        let fpVue = path.join(fd, 'Sample.vue')
        let fpJs = path.join(fd, 'sample.mjs')
        fs.mkdirSync(fd, { recursive: true })
        try {
            let linesVue = [
                '<template><div @click="console.log(user)"></div></template>',
                '<script>',
                'export default {',
                '    methods: {',
                '        f: function() {',
                '            console.log(\'user\', user)',
                '            console.log(\'ok\', describeShape(user), describeErr(err))',
                '            // console.log(\'註解內不算\', user)',
                '        },',
                '    },',
                '}',
                '</script>',
                '<style>.a { color: red }</style>',
                '<script lang="js">',
                'console.log(\'second\', user)',
                '</script>',
            ]
            fs.writeFileSync(fpVue, linesVue.join('\n'), 'utf8')
            //第 1 別名、2 解構、3 括號存取、4 傳遞、5 window.console、6 globalThis.console、7 window['console']、8 解構 { console: c } = window、9 debugger、10 alert、11 eval、12 new Function、
            //13 setTimeout 字串碼、14 window.onerror 指定、15 Vue.config.errorHandler 指定 皆為盲點寫法; 第 16 行（固定字面值）與第 17 行（物件屬性名 console）合格
            let linesJs = [
                'let c = console',
                'let { log } = console',
                'console[\'log\'](x)',
                'p.catch(console.log)',
                'window.console.log(x)',
                'globalThis.console.log(x)',
                'window[\'console\'].log(x)',
                'let { console: c8 } = window',
                'debugger',
                'alert(1)',
                'eval(\'1\')',
                'let f = new Function(\'return 1\')',
                'setTimeout(\'x()\', 1)',
                'window.onerror = () => {}',
                'Vue.config.errorHandler = () => {}',
                'console.log(\'固定字面值\')',
                'let o = { console: 1 }; o.console = 2',
            ]
            fs.writeFileSync(fpJs, linesJs.join('\n'), 'utf8')
            let v = scanCode(scriptOf(fpVue)).filter((s) => !s.safe)
            A.deepEqual(v.map((s) => s.line), [6, 15], `.vue 之 <script> 內 console.log('user', user) 須被回報(第 6 行; 註解內者不算), 第二個 <script> 區塊(第 15 行)亦須被掃描, 實得 ${JSON.stringify(v.map((s) => s.line))}`)
            let o = findOddConsoleRefs(scriptOf(fpJs))
            A.deepEqual([...new Set(o.map((x) => x.line))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], `非常規引用須回報第 1～15 行(第 16、17 行合格), 實得 ${JSON.stringify(o)}`)
            //範本內之 console 引用: templateOf 取 <template> 區(行號同原檔)
            A.ok(/\bconsole\b/.test(templateOf(fpVue)) && !/\bconsole\b/.test(templateOf(fpJs)), '.vue 之 <template> 內之 console 引用須可被偵測')
            //帶區塊註解於同行之呼叫: AST 以呼叫本身判定, 不受行首註解影響
            let blk = scanCode('/* x */ console.log(user)')
            A.equal(blk.length, 1)
            A.equal(blk[0].safe, false)
            //codeText 去註解: 註解內之文字不算可執行碼, 可執行碼之文字保留
            A.ok(!codeText(fpVue).includes('註解內不算') && codeText(fpVue).includes('describeShape(user)'))
        }
        finally {
            fs.rmSync(fd, { recursive: true, force: true })
        }
    })

    it('CNVF-003 describeShape／describeErr 單一實作(src/describeShape.mjs): 全專案無第二份定義; 使用者皆自該模組匯入; 依賴閉包不含 Node 內建模組', function() {
        //定義處: server/、src/、srv.mjs、g_*.mjs、toolg/ 之可執行碼中, function describeShape／describeErr／safeCtl 之定義只在 src/describeShape.mjs
        let defs = []
        let users = []
        let scanFiles = [...walkSrc()]
        let walkDir = (d) => {
            for (let n of fs.readdirSync(d, { withFileTypes: true })) {
                let fp = path.join(d, n.name)
                if (n.isDirectory()) {
                    walkDir(fp)
                }
                else if (n.name.endsWith('.mjs')) {
                    scanFiles.push(fp)
                }
            }
        }
        walkDir(path.join(projRoot, 'server'))
        for (let fp of scanFiles) {
            let code = codeText(fp)
            if (/\b(?:function\s+(?:describeShape|describeErr|safeCtl)\b|(?:let|const|var)\s+(?:describeShape|describeErr|safeCtl)\s*=)/.test(code)) {
                defs.push(rel(fp))
            }
            for (let name of ['describeShape', 'describeErr']) {
                if (new RegExp(`\\b${name}\\(`).test(code) && rel(fp) !== 'src/describeShape.mjs') {
                    users.push([rel(fp), name, new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'(?:\\.{1,2}/)+describeShape\\.mjs'`).test(code)])
                }
            }
        }
        A.deepEqual(defs, ['src/describeShape.mjs'], `describeShape／describeErr／safeCtl 只許定義於 src/describeShape.mjs(規格 D1 單一實作), 實得 ${defs}`)
        A.ok(users.length >= 7, `使用者(.vue／.mjs 之呼叫處)至少 7 處, 實得 ${users.length}`)
        for (let [f, name, ok] of users) {
            A.ok(ok, `${f} 使用 ${name}( 但未自 describeShape.mjs 匯入(不得自行定義或另匯他處)`)
        }
        //閉包: src/describeShape.mjs → wsemi 之 isarr、getDiagBriefErr(再往下私有依賴); 不得靜態匯入 Node 內建模組(webpack 5 不自動填補)
        let builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])
        let specs = new Map()
        let all = importClosure(path.join(projRoot, 'src', 'describeShape.mjs'), specs)
        A.ok(all.size >= 4, `閉包應至少含 4 檔(describeShape、isarr、getDiagBriefErr 及其私有依賴), 實得 ${all.size}`)
        let hits = []
        for (let [fp, list] of specs) {
            for (let s of list) {
                if (builtins.has(s)) {
                    hits.push(`${rel(fp)} 匯入 ${s}`)
                }
            }
        }
        A.deepEqual(hits, [], `前端用之摘要函數閉包不得靜態匯入 Node 內建模組: ${hits}`)
    })

    it('CNVF-004 摘要不含值: 使用者物件、回應、網址、錯誤訊息之識別值皆不出現; 輸出有界; 控制字元; 永不拋錯', function() {
        const SEC = 'ZZ-secret-front-5521'
        //登入成功之使用者物件(App.vue)與登入失敗回應: 只列鍵名
        let user = { id: SEC, name: SEC, email: `${SEC}@example.com`, isAdmin: 'y' }
        A.equal(describeShape(user), '(keys: id,name,email,isAdmin)')
        A.ok(!describeShape(user).includes(SEC))
        //網址、訊息文字(App.vue urlRedirect、main.js $alert): 只標型別
        A.equal(describeShape(`https://x.example/?token=${SEC}`), '(typeof string)')
        A.equal(describeShape(''), '(typeof string, empty)')
        A.equal(describeShape(undefined), '(undefined)')
        A.equal(describeShape(null), '(null)')
        A.equal(describeShape(5), '(typeof number)')
        //陣列: 只標筆數
        A.equal(describeShape([{ data: { id: SEC } }, { data: { id: SEC } }]), '(array, length=2)')
        //錯誤: 伺服端回傳之語系鍵(字串)、Error 本體、帶 code 之錯誤、含識別值之訊息
        for (let e of [SEC, new Error(SEC), Object.assign(new Error(SEC), { code: 'ENOENT' }), { message: SEC }, { err: SEC }]) {
            let s = describeErr(e)
            A.ok(!s.includes(SEC), `describeErr 不得含識別值, 實得 ${s}`)
        }
        A.equal(describeErr(SEC), '(string)')
        A.equal(describeErr(new Error(SEC)), '(Error)')
        A.equal(describeErr(Object.assign(new Error(SEC), { code: 'ENOENT' })), '(Error ENOENT)')
        //控制字元: C0、DEL、C1(U+0085)、行／段分隔(U+2028、U+2029)、雙向文字控制(U+202E)皆換成 '?', 不可偽造 log 行或改變顯示順序
        let ctl = {}
        for (let [k, x] of [['a', 0x2028], ['c', 0x202e], ['e', 0x85], ['g', 0x2029], ['i', 7], ['k', 0x7f], ['m', 0x2067]]) {
            ctl[`${k}${String.fromCharCode(x)}z`] = 1 //以 fromCharCode 組成, 原始碼不含字面控制字元
        }
        A.equal(describeShape(ctl), '(keys: a?z,c?z,e?z,g?z,i?z,k?z,m?z)')
        A.equal(safeCtl(`a${String.fromCharCode(10)}b${String.fromCharCode(13)}c`), 'a?b?c')
        //一般文字(含中文與全形標點)不受影響
        A.equal(describeShape({ '名稱': 1, 'user-id': 2 }), '(keys: 名稱,user-id)')
        //有界(至多 20 個鍵、單鍵至多 40 字)與不拋錯
        let huge = {}
        for (let i = 0; i < 3000; i++) {
            huge[`k${i}${SEC}`] = 1
        }
        A.ok(describeShape(huge).length < 1500)
        A.ok(describeShape(huge).endsWith(',...+2980)'))
        A.ok(describeShape({ [`${'x'.repeat(50)}`]: 1 }).includes(`${'x'.repeat(40)}...`))
        let evil = new Proxy({}, {
            ownKeys: () => {
                throw new Error(SEC)
            },
        })
        A.doesNotThrow(() => describeShape(evil))
        A.ok(!describeShape(evil).includes(SEC))
        A.doesNotThrow(() => describeErr(evil))
        //陣列之 length 以 Proxy 陷阱回字串(敵意物件)亦不印值: 只印整數筆數, 否則 '?'
        let evilArr = new Proxy([1, 2], {
            get: (t, k) => (k === 'length' ? SEC : t[k]),
        })
        A.ok(!describeShape(evilArr).includes(SEC), `陣列 length 為非整數時不得印出其值, 實得 ${describeShape(evilArr)}`)
        A.equal(describeShape([]), '(array, length=0)')
    })

    //接線案: describeErr 之輸出完全取自 wsemi getDiagBriefErr(單一實作, 規格 D1)——以共用語料 C01～C03 之輸入驗證(代碼白名單: 內建代碼收、整數與不合形狀之字串不收)
    it('CNVF-004c describeErr 經 wsemi getDiagBriefErr: 內建代碼(ECONNREFUSED、EAI_AGAIN、E2BIG)收; 整數 12345、E123456789、EMP04、ERR_ACCOUNT_ALICE01 不收(共用語料 C01～C03); 輸出等於依其結果組成之格式', function() {
        for (let id of ['C01', 'C02', 'C03']) {
            A.ok(diagCases.cases.find((c) => c.id === id && c.fn === 'getDiagBriefErr'), `共用語料缺 ${id}(wsemi 語料已變動, 須重新核對適用子集)`)
        }
        let fmt = (e) => {
            let b = getDiagBriefErr(e)
            return b.errCode === undefined ? `(${b.errType})` : `(${b.errType} ${b.errCode})`
        }
        for (let c of ['ECONNREFUSED', 'EAI_AGAIN', 'E2BIG']) {
            let e = Object.assign(new Error('x'), { code: c })
            A.equal(describeErr(e), `(Error ${c})`)
            A.equal(describeErr(e), fmt(e))
        }
        for (let c of [12345, 'E123456789', 'EMP04', 'ERR_ACCOUNT_ALICE01']) {
            let e = Object.assign(new Error('x'), { code: c })
            A.equal(describeErr(e), '(Error)', `代碼 ${c} 不得出現在摘要`)
            A.equal(describeErr(e), fmt(e))
        }
    })
})
