//srcScan: 前端原始碼(.vue 之 <script>、.js、.mjs、.html 之內嵌 <script>)之 AST 掃描輔助(排程第 206 項; 不帶 .test. 中綴、放 test/tools/, 供 unit-consoleNoValuesFront 與 unit-staLogs-timeLength 共用, 同一 helper 只定義一次)
//  - scriptOf(fp): .vue／.html 取**全部** <script> 區塊(含多個、帶屬性者; 其餘以換行補齊, 行號與原檔相同); 其他原樣
//  - templateOf(fp): .vue 之 <template> 區(其餘補齊), 供檢查範本內之 console 引用(Vue 範本之運算式)
//  - stripComments(code): 以 eslint Linter 之 AST 找出全部註解並以空白取代(保留換行), 不靠正規表示式, 字串內之 // 不誤判
//  - codeText(fp): scriptOf 後去註解之可執行碼(供「某識別字是否出現在可執行碼」之站點全集盤點)
//  - findOddConsoleRefs(code): console 之非常規引用與其他輸出／動態執行管道: 別名、解構(含 `{ console: c } = window`)、括號存取(含 window['console'])、window.console、傳遞給 .catch 等、
//    非 METHODS 之方法; 另 debugger、alert／confirm／prompt、eval、Function 建構、setTimeout／setInterval 之字串碼、onerror／errorHandler／warnHandler 之指定
//  - importClosure(entry): 靜態 import／export from 之相對路徑與 wsemi 路徑之閉包(檢查是否匯入 Node 內建模組)
//  console 呼叫站點之引數判定共用 consoleSites.mjs 之 scanCode(同一判準, 前後端同一份)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import eslint from 'eslint'
import { METHODS } from './consoleSites.mjs'


let { Linter } = eslint
let projRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')


//blocksOf: 取出 text 中 <tag ...>…</tag> 全部區塊之內容(依序), 其餘字元以換行補齊(行號與原檔相同)
function blocksOf(text, tag) {
    let re = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'gi')
    let out = ''
    let last = 0
    let m
    while ((m = re.exec(text)) !== null) {
        let i0 = m.index + m[0].length
        let i1 = text.toLowerCase().indexOf(`</${tag}>`, i0)
        let end = i1 < 0 ? text.length : i1
        out += text.slice(last, i0).replace(/[^\n]/g, '') + text.slice(i0, end)
        last = end
        re.lastIndex = end
    }
    return out + text.slice(last).replace(/[^\n]/g, '')
}


function scriptOf(fp) {
    let t = fs.readFileSync(fp, 'utf8')
    return /\.(vue|html)$/.test(fp) ? blocksOf(t, 'script') : t
}


function templateOf(fp) {
    let t = fs.readFileSync(fp, 'utf8')
    return fp.endsWith('.vue') ? blocksOf(t, 'template') : ''
}


function parse(code, rules = {}) {
    let linter = new Linter()
    let msgs = linter.verify(code, { parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules })
    let fatal = msgs.filter((m) => m.fatal)
    if (fatal.length > 0) {
        throw new Error(`parse error line ${fatal[0].line}: ${fatal[0].message}`)
    }
    return linter
}


function stripComments(code) {
    let linter = parse(code)
    let cs = linter.getSourceCode().getAllComments()
    let out = code
    for (let c of [...cs].sort((a, b) => b.range[0] - a.range[0])) {
        out = out.slice(0, c.range[0]) + out.slice(c.range[0], c.range[1]).replace(/[^\n]/g, ' ') + out.slice(c.range[1])
    }
    return out
}


let codeText = (fp) => stripComments(scriptOf(fp))


//findOddConsoleRefs: 回傳 [{ line, text, kind }]; console 之合格形式只有 console.<METHODS 之一>(…) 之直接呼叫
function findOddConsoleRefs(code) {
    let linter = new Linter()
    let hits = []
    let GLOBALS = ['window', 'globalThis', 'self', 'global']
    linter.defineRule('odd-console', {
        create(context) {
            let sc = context.getSourceCode()
            let add = (node, kind) => hits.push({ line: node.loc.start.line, text: sc.lines[node.loc.start.line - 1].trim(), kind })
            return {
                Identifier(node) {
                    let p = node.parent
                    if (node.name === 'console') {
                        //console.log(...) 之 console 物件位置: MemberExpression.object 且非計算式、屬性為 METHODS 之一、且該成員運算式為呼叫之被呼叫者
                        let okCall = p && p.type === 'MemberExpression' && p.object === node && !p.computed && METHODS.includes(p.property.name) &&
                            p.parent && p.parent.type === 'CallExpression' && p.parent.callee === p
                        if (okCall) {
                            return
                        }
                        //物件屬性鍵、成員運算式之屬性名(如 foo.console、{ console: 1 })不是對 console 全域之引用——但 window.console／globalThis.console 與解構 `{ console: c } = window` 是
                        let isMemberProp = p && p.type === 'MemberExpression' && p.property === node && !p.computed
                        let isPropKey = p && p.type === 'Property' && p.key === node && !p.computed && !p.shorthand
                        if (isMemberProp && !GLOBALS.includes(sc.getText(p.object))) {
                            return
                        }
                        if (isPropKey && p.parent.type !== 'ObjectPattern') {
                            return
                        }
                        add(node, 'console')
                        return
                    }
                    //eval(...)、Function(...)／new Function(...)、alert／confirm／prompt(...)、setTimeout／setInterval 之字串碼由 CallExpression／NewExpression 判定; 此處只處理賦值型之處理器
                    if (['onerror', 'errorHandler', 'warnHandler'].includes(node.name) && p && ((p.type === 'MemberExpression' && p.property === node && !p.computed) || (p.type === 'Property' && p.key === node && !p.computed))) {
                        let host = p.type === 'MemberExpression' ? p.parent : p
                        if (host && (host.type === 'AssignmentExpression' || host.type === 'Property')) {
                            add(node, `handler:${node.name}`)
                        }
                    }
                },
                //括號存取 window['console']、globalThis["console"]
                Literal(node) {
                    let p = node.parent
                    if (node.value === 'console' && p && p.type === 'MemberExpression' && p.computed && p.property === node) {
                        add(node, 'console[computed]')
                    }
                },
                DebuggerStatement(node) {
                    add(node, 'debugger')
                },
                CallExpression(node) {
                    let c = node.callee
                    if (c.type === 'Identifier' && ['alert', 'confirm', 'prompt', 'eval', 'Function'].includes(c.name)) {
                        add(node, `call:${c.name}`)
                    }
                    if (c.type === 'MemberExpression' && !c.computed && GLOBALS.includes(sc.getText(c.object)) && ['alert', 'confirm', 'prompt', 'eval'].includes(c.property.name)) {
                        add(node, `call:${c.property.name}`)
                    }
                    if (c.type === 'Identifier' && ['setTimeout', 'setInterval'].includes(c.name) && node.arguments[0] && node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'string') {
                        add(node, `string-code:${c.name}`)
                    }
                },
                NewExpression(node) {
                    if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
                        add(node, 'new Function')
                    }
                },
            }
        },
    })
    let msgs = linter.verify(code, { parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules: { 'odd-console': 2 } })
    let fatal = msgs.filter((m) => m.fatal)
    if (fatal.length > 0) {
        throw new Error(`parse error line ${fatal[0].line}: ${fatal[0].message}`)
    }
    return hits
}


//importClosure: 自 entry 起, 追蹤 import／export from 之相對路徑(含副檔名)與 wsemi/src/*.mjs; 回傳 Set<絕對路徑>; 另給 specs(各檔之全部靜態匯入字串, 供查 Node 內建模組)
function importClosure(entry, specs = new Map()) {
    let seen = new Set()
    let stack = [path.resolve(entry)]
    let re = /(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g
    while (stack.length > 0) {
        let fp = stack.pop()
        if (seen.has(fp) || !fs.existsSync(fp)) {
            continue
        }
        seen.add(fp)
        let t = fs.readFileSync(fp, 'utf8')
        let list = []
        let m
        while ((m = re.exec(t)) !== null) {
            let spec = m[1] || m[2]
            list.push(spec)
            if (spec.startsWith('.')) {
                stack.push(path.resolve(path.dirname(fp), spec))
            }
            else if (spec.startsWith('wsemi/')) {
                stack.push(path.join(projRoot, 'node_modules', spec))
            }
        }
        specs.set(fp, list)
    }
    return seen
}


export { scriptOf, templateOf, stripComments, codeText, findOddConsoleRefs, importClosure, projRoot }
