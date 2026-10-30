//consoleSites: 掃描原始碼之 console 輸出站點，並判定每個引數是否「不輸出資料值」（ADR-057；跨套件規格〈診斷輸出與遮罩〉D2、〈輸入參數之檢測機制〉V20）。
//不帶 .test. 中綴、放 test/tools/，供 unit-consoleSites.test.mjs 與盤點腳本共用（同一 helper 只定義一次）。
//作法：以 eslint（devDependencies 已宣告）之 Linter 取得 AST（不靠正規表示式，註解、字串、樣板字串內之 "console.log" 不誤判），
//逐一檢視 console.(log|warn|error|info|debug|trace|dir|table)(…) 與 process.stdout／stderr.write(…) 之每個引數：
//- 安全：字面值；樣板字串（其 ${} 皆安全）；呼叫核可之輸出函數（maskTok、shapeOf、typeOf、payloadShape、errBrief、pickErrName、pickErrCode）；
//  X.length（筆數）；typeof X（型別）；二元 + 、條件、邏輯運算式（各分支皆安全）；清單 exempt 內之運算式原文（各條附理由，屬「刻意不套」）
//- 其餘（裸識別字、成員存取、物件／陣列字面值、其他呼叫）一律判為「可能輸出資料值」
import fs from 'fs'
import path from 'path'
import eslint from 'eslint'


let { Linter } = eslint

let METHODS = ['log', 'warn', 'error', 'info', 'debug', 'trace', 'dir', 'table']
let HELPERS = ['maskTok', 'shapeOf', 'typeOf', 'payloadShape', 'errBrief', 'pickErrName', 'pickErrCode']


//classify: 回傳 { safe, why }；exempt 為 Map(運算式原文 → 理由)，'*' 鍵表示該檔全部運算式（離線稽核工具之輸出本體）；exempt.used（Set）記錄被用到之鍵
function classify(node, sc, exempt) {
    let text = sc.getText(node)
    if (exempt.has('*')) {
        exempt.used.add('*')
        return { safe: true, why: `exempt:*(${exempt.get('*')})` }
    }
    if (exempt.has(text)) {
        exempt.used.add(text) //記錄被用到之項，供清單衛生檢查（不留未使用之豁免）
        return { safe: true, why: `exempt(${exempt.get(text)})` }
    }
    let t = node.type
    if (t === 'Literal') {
        return { safe: true, why: 'literal' }
    }
    if (t === 'TemplateLiteral') {
        for (let e of node.expressions) {
            let r = classify(e, sc, exempt)
            if (!r.safe) {
                return { safe: false, why: `template:${r.why}` }
            }
        }
        return { safe: true, why: 'template' }
    }
    if (t === 'CallExpression' && node.callee.type === 'Identifier' && HELPERS.includes(node.callee.name)) {
        return { safe: true, why: `helper:${node.callee.name}` }
    }
    if (t === 'MemberExpression' && !node.computed && node.property.name === 'length') {
        return { safe: true, why: 'count' }
    }
    if (t === 'UnaryExpression' && node.operator === 'typeof') {
        return { safe: true, why: 'typeof' }
    }
    if (t === 'BinaryExpression' && node.operator === '+') {
        let a = classify(node.left, sc, exempt)
        let b = classify(node.right, sc, exempt)
        return a.safe && b.safe ? { safe: true, why: 'concat' } : { safe: false, why: `concat:${a.safe ? b.why : a.why}` }
    }
    if (t === 'ConditionalExpression') {
        let a = classify(node.consequent, sc, exempt)
        let b = classify(node.alternate, sc, exempt)
        return a.safe && b.safe ? { safe: true, why: 'conditional' } : { safe: false, why: `conditional:${a.safe ? b.why : a.why}` }
    }
    if (t === 'LogicalExpression') {
        let a = classify(node.left, sc, exempt)
        let b = classify(node.right, sc, exempt)
        return a.safe && b.safe ? { safe: true, why: 'logical' } : { safe: false, why: `logical:${a.safe ? b.why : a.why}` }
    }
    return { safe: false, why: `${t}:${text.slice(0, 60)}` }
}


//scanCode: 回傳站點陣列 [{ line, call, args: [{ text, safe, why }], safe }]；語法錯誤即拋
function scanCode(code, exempt = new Map()) {
    exempt.used = exempt.used || new Set()
    let linter = new Linter()
    let sites = []
    linter.defineRule('collect-output', {
        create(context) {
            let sc = context.getSourceCode()
            return {
                CallExpression(node) {
                    let c = node.callee
                    let call = ''
                    if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && c.object.name === 'console' && METHODS.includes(c.property.name)) {
                        call = `console.${c.property.name}`
                    }
                    else if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'write' && c.object.type === 'MemberExpression' &&
                        c.object.object.type === 'Identifier' && c.object.object.name === 'process' && ['stdout', 'stderr'].includes(c.object.property.name)) {
                        call = `process.${c.object.property.name}.write`
                    }
                    if (call === '') {
                        return
                    }
                    let args = node.arguments.map((a) => {
                        let r = a.type === 'SpreadElement' ? { safe: false, why: 'SpreadElement' } : classify(a, sc, exempt)
                        return { text: sc.getText(a), ...r }
                    })
                    sites.push({ line: node.loc.start.line, call, args, safe: args.every((a) => a.safe) })
                },
            }
        },
    })
    let msgs = linter.verify(code, { parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules: { 'collect-output': 2 } })
    let fatal = msgs.filter((m) => m.fatal)
    if (fatal.length > 0) {
        throw new Error(`parse error line ${fatal[0].line}: ${fatal[0].message}`)
    }
    return sites
}


//listFiles: 伺服端出口所在之檔案（相對 root）：server/**、srv.mjs、g_*.mjs、toolg/**、src/schema/**（前後端共用之 schema，funTest 於伺服端執行）
function listFiles(root) {
    let r = []
    let walk = (rel) => {
        let abs = path.join(root, rel)
        if (!fs.existsSync(abs)) {
            return
        }
        for (let d of fs.readdirSync(abs, { withFileTypes: true })) {
            let relChild = `${rel}/${d.name}`
            if (d.isDirectory()) {
                walk(relChild)
            }
            else if (d.name.endsWith('.mjs')) {
                r.push(relChild)
            }
        }
    }
    walk('server')
    walk('toolg')
    walk('src/schema')
    for (let d of fs.readdirSync(root, { withFileTypes: true })) {
        if (d.isFile() && (d.name === 'srv.mjs' || (d.name.startsWith('g_') && d.name.endsWith('.mjs')))) {
            r.push(d.name)
        }
    }
    return r.sort()
}


//scanRoot: 掃 root 下全部伺服端檔案；exemptByFile 為 { 相對路徑: Map }；回傳 [{ file, line, call, args, safe }]
function scanRoot(root, exemptByFile = {}) {
    let out = []
    for (let rel of listFiles(root)) {
        let code = fs.readFileSync(path.join(root, rel), 'utf8')
        for (let s of scanCode(code, exemptByFile[rel] || new Map())) {
            out.push({ file: rel, ...s })
        }
    }
    return out
}


//EXEMPT：各檔之豁免（運算式原文 → 理由）。「刻意不套」之全部清單（單一來源；unit-consoleSites 之 SITE-005 守每項皆被用到，不留過期豁免）
let EXEMPT = {
    'server/WWebApi.mjs': new Map([
        ['from', '入口名: authToken 之 from 為套件內固定字串（main、getUserByToken、getApisList、syncAndReplaceTabs）或 w-converhp 之 apiType 路由名，非使用者輸入'],
        ['apiType', 'w-converhp 之路由名（main、upload-controller、upload-slice、download-get-filename、download-get-file、download），框架指派，非使用者輸入'],
        ['fnEntryOut', '常數 index.html（入口檔名）'],
        ['isestr(msg) && /^invalid opt\\.[A-Za-z]+$/.test(msg) ? msg : errBrief(err)', 'msg 先經 /^invalid opt\\.[A-Za-z]+$/ 限為固定詞彙（createTargetPolicy 之 throw），否則只給錯誤名稱與代碼'],
    ]),
    'server/syncApis.mjs': new Map([
        ['index', '外部匯入批次之列索引（整數）'],
        ['field', '欄位名: 來自 schema 之外部擁有欄位清單、name、url、srcKey、(row) 等固定詞彙，非請求內之值'],
        ['reason', '原因碼: type、srcKey、unicode、xss 與 checkSyncRows 之固定 reason，非請求內之值'],
    ]),
    'srv.mjs': new Map([
        ['res.status', 'SSO 回應之 HTTP 狀態碼（數字）'],
    ]),
    'g_provideApis.mjs': new Map([
        ['r', 'provideTabs 成功回應 { nAdd, nUpdate, nDel, nSame }（各項為筆數）'],
        ['err', '離線工具（操作者終端機、不建 srLog）；provideTabs 之 reject 為固定詞彙、列索引、HTTP 狀態碼、錯誤名稱與代碼（fetch 例外已淨化，ADR-033）或伺服端 err-key'],
    ]),
    'g_initialTestData.mjs': new Map([
        ['err', '離線工具（操作者終端機、不建 srLog，ADR-054 決定 5）；ORM 之外來錯誤由 w-serv-orm 1.1.22 於其站點遮罩（D3）'],
    ]),
    'g_auditExternalRows.mjs': new Map([
        ['*', '離線稽核工具: 輸出本體即列出需人工處置之列（id、name、group、筆數），操作者為資料擁有者、輸出為終端機而非被收集之診斷；唯讀、不建 srLog'],
    ]),
    'src/schema/tables/apis.mjs': new Map([
        ['keyTable', '模組常數（資料表名）'],
    ]),
}

//freshExempt: 取一份新之 EXEMPT 副本（Map 帶 used 記錄，每次掃描各自獨立）
let freshExempt = () => {
    let r = {}
    for (let [k, m] of Object.entries(EXEMPT)) {
        r[k] = new Map(m)
    }
    return r
}


export { scanCode, scanRoot, listFiles, classify, EXEMPT, freshExempt, METHODS, HELPERS }
