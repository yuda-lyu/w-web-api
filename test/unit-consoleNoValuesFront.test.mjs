//前端瀏覽器 console 不印資料值(排程第 206 項〔api 側〕; 規則帳本 R-CONSOLE-NOVAL-01; 規格〈診斷輸出與遮罩〉D1、D2、〈輸入參數之檢測機制〉V20)
//  承 2026-10-31 api 輪(伺服端 console 不印值, R-CONSOLE-01; 當時只改伺服端、列知悉瀏覽器端 console 未動), 第 206 項補前端: src/ 下可執行之 console 呼叫(.vue 之 <script>、.js、.mjs)
//  只印固定字面值、typeof、或不含值之摘要函數, 不印權杖、使用者物件、登入回應、錯誤本體、訊息文字。
//  排程第 603 項(2026-11-24)起摘要函數一律為 wsemi 共用函數 getDiagShape／getDiagBriefErr(規格 D1 單一實作), 本地模組 src/describeShape.mjs 已刪除。
//CNVF-001 站點不變式: src/ 下(排除已由 unit-consoleSites 涵蓋之 src/schema/**)每個可執行 console 呼叫之每個引數皆不印值
//CNVF-002 站點全集: 各檔之可執行 console 呼叫數已盤點(新增站點須先判定其引數); 範圍涵蓋進入檔與全部元件; 非常規之 console 引用(別名、解構、括號存取、window.console、傳遞)全專案為 0
//CNVF-003 單一實作(D1): src/describeShape.mjs 不存在, describeShape／describeErr／safeCtl 全專案無定義與呼叫; 使用者皆自 wsemi/src 匯入 getDiagShape／getDiagBriefErr, 呼叫數已盤點; 依賴閉包不含 Node 內建模組(瀏覽器可載入)
//CNVF-004 行為(wsemi 輸出契約之釘住): 摘要不含值(以識別值植入使用者物件、授權字串、錯誤訊息逐一驗)、控制字元、有界、永不拋錯; 錯誤摘要為 { errType, errCode? } 物件(直印, 不留字串外殼)
//CNVF-005 錯誤摘要物件不得被字串化: 站點不得把 getDiagBriefErr 之結果放進樣板字串或字串串接(否則得 [object Object]), 一律作為獨立之 console 引數
//掃描以 eslint 之 AST 為準(test/tools/srcScan.mjs、consoleSites.mjs), 不靠正規表示式; .vue 取 <script> 區
//跑法: npx mocha test/unit-consoleNoValuesFront.test.mjs --timeout 60000
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { builtinModules } from 'module'
import getDiagShape from 'wsemi/src/getDiagShape.mjs'
import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'
import diagCases from 'wsemi/src/_diagCases.mjs'
import { scanCode } from './tools/consoleSites.mjs'
import { scriptOf, templateOf, codeText, findOddConsoleRefs, importClosure, projRoot } from './tools/srcScan.mjs'

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

//各檔 getDiagShape(／getDiagBriefErr( 之呼叫數(2026-11-24 盤點; 即原 describeShape(／describeErr( 之站點, 一對一取代)
const SHAPE_CALLS = {
    'src/App.vue': 3,
    'src/main.js': 2,
}
const ERR_CALLS = {
    'src/components/LayoutContentEdit.vue': 8,
    'src/components/LayoutContentStats.vue': 1,
    'src/components/LayoutContentTest.vue': 2,
    'src/components/MdPanel.vue': 1,
    'src/main.js': 1,
    'src/store/applyRows.mjs': 2,
}


describe('unit-consoleNoValuesFront (前端 console 不印資料值, 排程第 206／603 項〔api 側〕)', function() {

    it('CNVF-001 前端專用之 src 檔: 每個可執行 console 呼叫之每個引數皆為固定字面值／typeof／getDiagShape／getDiagBriefErr(修前 2026-11-23 於 21 個站點中 20 個含未遮罩之引數〔共 21 個引數〕: 登入成功之使用者物件、登入失敗回應、網址、錯誤本體、$alert 訊息等; 2026-11-24 起本地摘要函數 describeShape／describeErr 不再核可)', function() {
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
                '            console.log(\'ok\', getDiagShape(user), getDiagBriefErr(err))',
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
            A.ok(!codeText(fpVue).includes('註解內不算') && codeText(fpVue).includes('getDiagShape(user)'))
        }
        finally {
            fs.rmSync(fd, { recursive: true, force: true })
        }
    })

    it('CNVF-003 D1 單一實作: src/describeShape.mjs 已刪除, 全專案無 describeShape／describeErr／safeCtl 之定義或呼叫; 使用 getDiagShape／getDiagBriefErr 之檔皆自 wsemi/src 匯入且呼叫數與盤點相同; 依賴閉包不含 Node 內建模組', function() {
        A.ok(!fs.existsSync(path.join(projRoot, 'src', 'describeShape.mjs')), '本地模組 src/describeShape.mjs 須已刪除(規格 D1 單一實作: 改用 wsemi 共用函數)')
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
        scanFiles.push(path.join(projRoot, 'srv.mjs'))
        let oldNames = []
        let shapeGot = {}
        let errGot = {}
        for (let fp of scanFiles) {
            let code = codeText(fp)
            if (/\b(?:describeShape|describeErr|safeCtl)\b/.test(code)) {
                oldNames.push(rel(fp))
            }
            let nShape = (code.match(/\bgetDiagShape\(/g) || []).length
            let nErr = (code.match(/\bgetDiagBriefErr\(/g) || []).length
            if (rel(fp).startsWith('src/') && nShape > 0) {
                shapeGot[rel(fp)] = nShape
                A.ok(/^import getDiagShape from 'wsemi\/src\/getDiagShape\.mjs'\r?$/m.test(code), `${rel(fp)} 使用 getDiagShape( 但未自 wsemi/src/getDiagShape.mjs 匯入(不得自行定義或另匯他處)`)
            }
            if (rel(fp).startsWith('src/') && nErr > 0) {
                errGot[rel(fp)] = nErr
                A.ok(/^import getDiagBriefErr from 'wsemi\/src\/getDiagBriefErr\.mjs'\r?$/m.test(code), `${rel(fp)} 使用 getDiagBriefErr( 但未自 wsemi/src/getDiagBriefErr.mjs 匯入(不得自行定義或另匯他處)`)
            }
        }
        A.deepEqual(oldNames, [], `describeShape／describeErr／safeCtl 已由 wsemi 共用函數取代, 不得再出現: ${oldNames}`)
        A.deepEqual(shapeGot, SHAPE_CALLS, '前端各檔 getDiagShape( 呼叫數與盤點不符')
        A.deepEqual(errGot, ERR_CALLS, '前端各檔 getDiagBriefErr( 呼叫數與盤點不符')
        //閉包: 前端使用之 wsemi 診斷函數及其私有依賴; 不得靜態匯入 Node 內建模組(webpack 5 不自動填補)
        let builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])
        for (let name of ['getDiagShape', 'getDiagBriefErr']) {
            let specs = new Map()
            let all = importClosure(path.join(projRoot, 'node_modules', 'wsemi', 'src', `${name}.mjs`), specs)
            A.ok(all.size >= 2, `${name} 閉包應至少含 2 檔(本身與私有依賴), 實得 ${all.size}`)
            let hits = []
            for (let [fp, list] of specs) {
                for (let s of list) {
                    if (builtins.has(s)) {
                        hits.push(`${rel(fp)} 匯入 ${s}`)
                    }
                }
            }
            A.deepEqual(hits, [], `前端用之 ${name} 閉包不得靜態匯入 Node 內建模組: ${hits}`)
        }
    })

    it('CNVF-004 摘要不含值(wsemi 輸出契約): 使用者物件、回應、網址、錯誤訊息之識別值皆不出現; 輸出有界; 控制字元; 永不拋錯', function() {
        const SEC = 'ZZ-secret-front-5521'
        //登入成功之使用者物件(App.vue)與登入失敗回應: 只列鍵名
        let user = { id: SEC, name: SEC, email: `${SEC}@example.com`, isAdmin: 'y' }
        A.equal(getDiagShape(user), '(keys: id,name,email,isAdmin)')
        A.ok(!getDiagShape(user).includes(SEC))
        //網址、訊息文字(App.vue urlRedirect、main.js $alert): 只標型別
        A.equal(getDiagShape(`https://x.example/?token=${SEC}`), '(string)')
        A.equal(getDiagShape(''), '(string, empty)')
        A.equal(getDiagShape(undefined), '(undefined)')
        A.equal(getDiagShape(null), '(null)')
        A.equal(getDiagShape(5), '(number)')
        //陣列: 只標筆數
        A.equal(getDiagShape([{ data: { id: SEC } }, { data: { id: SEC } }]), '(array, length=2)')
        //錯誤: 伺服端回傳之語系鍵(字串)、Error 本體、帶 code 之錯誤、含識別值之訊息; 摘要為 { errType, errCode? } 物件(直印), 不含訊息文字
        for (let e of [SEC, new Error(SEC), Object.assign(new Error(SEC), { code: 'ENOENT' }), { message: SEC }, { err: SEC }]) {
            let s = JSON.stringify(getDiagBriefErr(e))
            A.ok(!s.includes(SEC), `getDiagBriefErr 不得含識別值, 實得 ${s}`)
        }
        A.deepEqual(getDiagBriefErr(SEC), { errType: 'string' })
        A.deepEqual(getDiagBriefErr(new Error(SEC)), { errType: 'Error' })
        A.deepEqual(getDiagBriefErr(Object.assign(new Error(SEC), { code: 'ENOENT' })), { errType: 'Error', errCode: 'ENOENT' })
        //控制字元: C0、DEL、C1(U+0085)、行／段分隔(U+2028、U+2029)、雙向文字控制(U+202E)皆換成 '?', 不可偽造 log 行或改變顯示順序; 格式字元(零寬、BOM)亦換
        let ctl = {}
        for (let [k, x] of [['a', 0x2028], ['c', 0x202e], ['e', 0x85], ['g', 0x2029], ['i', 7], ['k', 0x7f], ['m', 0x2067], ['o', 0x200b], ['q', 0xfeff]]) {
            ctl[`${k}${String.fromCharCode(x)}z`] = 1 //以 fromCharCode 組成, 原始碼不含字面控制字元
        }
        A.equal(getDiagShape(ctl), '(keys: a?z,c?z,e?z,g?z,i?z,k?z,m?z,o?z,q?z)')
        //一般文字(含中文與全形標點)不受影響
        A.equal(getDiagShape({ '名稱': 1, 'user-id': 2 }), '(keys: 名稱,user-id)')
        //有界(至多 20 個鍵、單鍵至多 32 字)與不拋錯
        let huge = {}
        for (let i = 0; i < 3000; i++) {
            huge[`k${i}${SEC}`] = 1
        }
        A.ok(getDiagShape(huge).length < 1500)
        A.ok(getDiagShape(huge).endsWith(',...+2980)'))
        A.ok(getDiagShape({ [`${'x'.repeat(50)}`]: 1 }).includes(`${'x'.repeat(32)}...`))
        let evil = new Proxy({}, {
            ownKeys: () => {
                throw new Error(SEC)
            },
        })
        A.doesNotThrow(() => getDiagShape(evil))
        A.ok(!getDiagShape(evil).includes(SEC))
        A.doesNotThrow(() => getDiagBriefErr(evil))
        //陣列之 length 以 Proxy 陷阱回字串(敵意物件)亦不印值
        let evilArr = new Proxy([1, 2], {
            get: (t, k) => (k === 'length' ? SEC : t[k]),
        })
        A.ok(!getDiagShape(evilArr).includes(SEC), `陣列 length 為非整數時不得印出其值, 實得 ${getDiagShape(evilArr)}`)
        A.equal(getDiagShape([]), '(array, length=0)')
    })

    //接線案: 錯誤摘要之輸出完全取自 wsemi getDiagBriefErr(單一實作, 規格 D1)——以共用語料 C01～C03 之輸入驗證(代碼白名單: 內建代碼收、整數與不合形狀之字串不收)
    it('CNVF-004c getDiagBriefErr 代碼白名單: 內建代碼(ECONNREFUSED、EAI_AGAIN、E2BIG)收; 整數 12345、E123456789、EMP04、ERR_ACCOUNT_ALICE01 不收(共用語料 C01～C03)', function() {
        for (let id of ['C01', 'C02', 'C03']) {
            A.ok(diagCases.cases.find((c) => c.id === id && c.fn === 'getDiagBriefErr'), `共用語料缺 ${id}(wsemi 語料已變動, 須重新核對適用子集)`)
        }
        for (let c of ['ECONNREFUSED', 'EAI_AGAIN', 'E2BIG']) {
            let e = Object.assign(new Error('x'), { code: c })
            A.deepEqual(getDiagBriefErr(e), { errType: 'Error', errCode: c })
        }
        for (let c of [12345, 'E123456789', 'EMP04', 'ERR_ACCOUNT_ALICE01']) {
            let e = Object.assign(new Error('x'), { code: c })
            A.deepEqual(getDiagBriefErr(e), { errType: 'Error' }, `代碼 ${c} 不得出現在摘要`)
        }
    })

    //站點不得把錯誤摘要物件字串化: 樣板字串內插或字串串接會得 [object Object]（tws2 之陷阱）; 一律作獨立 console 引數, 於瀏覽器 console 以物件顯示
    it('CNVF-005 getDiagBriefErr 之結果不得內插樣板字串、不得字串串接、不得 String()／JSON.stringify() 包裹(站點一律作獨立引數)', function() {
        let bad = []
        for (let fp of frontFiles()) {
            let code = codeText(fp)
            for (let [i, l] of code.split(/\r?\n/).entries()) {
                if (!/getDiagBriefErr\(/.test(l)) {
                    continue
                }
                if (/\$\{[^}]*getDiagBriefErr\(/.test(l) || /[+]\s*getDiagBriefErr\(/.test(l) || /getDiagBriefErr\([^)]*\)\s*[+]/.test(l) || /(?:String|JSON\.stringify)\(\s*getDiagBriefErr\(/.test(l)) {
                    bad.push(`${rel(fp)}:${i + 1}: ${l.trim().slice(0, 100)}`)
                }
            }
        }
        A.deepEqual(bad, [], `getDiagBriefErr 之結果被字串化:\n${bad.join('\n')}`)
        //負向自測: 偵測式本身須分得出不合格寫法(防此條空轉)
        let D = '$' //樣板字串之 ${ 以串接組出(專案 eslint 禁字串內含 ${ )
        let samples = ['`err[' + D + '{getDiagBriefErr(e)}]`', '\'x\' + getDiagBriefErr(e)', 'getDiagBriefErr(e) + 1', 'String(getDiagBriefErr(e))']
        for (let l of samples) {
            let hit = /\$\{[^}]*getDiagBriefErr\(/.test(l) || /[+]\s*getDiagBriefErr\(/.test(l) || /getDiagBriefErr\([^)]*\)\s*[+]/.test(l) || /(?:String|JSON\.stringify)\(\s*getDiagBriefErr\(/.test(l)
            A.ok(hit, `偵測式應判為不合格: ${l}`)
        }
    })
})
