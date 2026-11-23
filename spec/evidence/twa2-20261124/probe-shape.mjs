//探測: 同一組輸入跑 HEAD 本地實作(前端 describeShape／describeErr、伺服端 shapeOf／errBrief／typeOf／payloadShape)與 wsemi getDiagShape／getDiagBriefErr, 產「輸出字樣改變表」
//HEAD 實作取自鏡像根(git archive HEAD); typeOf、payloadShape 為 WWebApi.mjs 之閉包, 於此逐字照抄 HEAD 原文
//用法: node tmp/twa2/probe-shape.mjs  → 印表並寫 tmp/twa2/shape-diff.json
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import getDiagShape from 'wsemi/src/getDiagShape.mjs'
import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'

let pre = path.resolve('tmp/twa2/pre')
let { describeShape, describeErr } = await import(pathToFileURL(path.join(pre, 'src', 'describeShape.mjs')).href)
let { shapeOf, errBrief, pickErrName, pickErrCode } = await import(pathToFileURL(path.join(pre, 'server', 'maskLog.mjs')).href)
let typeOf = (v) => `(${typeof v})`
let payloadShape = (v) => {
    if (!iseobj(v)) {
        return `(${typeof v})`
    }
    return { keys: Object.keys(v), rows: isarr(v.rows) ? v.rows.length : `(${typeof v.rows})` }
}

let safe = (f, v) => {
    try {
        let r = f(v)
        return typeof r === 'string' ? r : JSON.stringify(r)
    }
    catch (err) {
        return `THROW ${err && err.name}`
    }
}

class Foo {
    constructor() {
        this.a = 1
        this.b = 2
    }
}
let nullProto = Object.create(null)
nullProto.x = 1
let circ = { a: 1 }
circ.self = circ
let many = {}
for (let i = 0; i < 25; i++) {
    many[`f${i}`] = 1
}
let revoked = Proxy.revocable({}, {})
revoked.revoke()
let evilProxy = new Proxy({}, { ownKeys: () => { throw new Error('x') } })
let ctlKeys = { ['a\nb']: 1, ['c​d']: 2, ['e­f']: 3 }
let refused = new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) })

let shapeInputs = {
    'string': 'abc', 'empty string': '', 'number': 5, 'NaN': NaN, 'boolean': true, 'function': () => 1, 'bigint': 10n, 'symbol': Symbol('s'),
    'null': null, 'undefined': undefined, 'array(2)': [1, 2], 'empty array': [], 'empty object': {}, 'object {a,b}': { a: 1, b: 2 }, 'class instance': new Foo(), 'null-prototype': nullProto,
    'circular': circ, '25 keys': many, 'key 35 chars': { ['k'.repeat(35)]: 1 }, 'key 60 chars': { ['k'.repeat(60)]: 1 }, 'ctl/format keys(LF, U+200B, U+00AD)': ctlKeys,
    'proxy(ownKeys throws)': evilProxy, 'revoked proxy': revoked.proxy, 'Map': new Map([[1, 2]]), 'Set': new Set([1]), 'Uint8Array(4)': new Uint8Array(4), 'Date': new Date(0), 'RegExp': /x/,
    'Promise': Promise.resolve(1), 'Error object': new Error('m'), 'boxed String': new String('s'),
}
let errInputs = {
    'Error': new Error('m'), 'TypeError': new TypeError('m'), 'Error code ENOENT': Object.assign(new Error('m'), { code: 'ENOENT' }), 'string(語系鍵)': 'errXxx', 'null': null, 'undefined': undefined,
    '{message}': { message: 'm' }, 'number': 1, 'custom name MyCustomError': Object.assign(new Error('m'), { name: 'MyCustomError' }), 'code ERR_X(不在白名單)': Object.assign(new Error('m'), { code: 'ERR_X' }),
    'fetch refused(cause.code)': refused, 'DOMException TimeoutError': new DOMException('t', 'TimeoutError'), 'Proxy': new Proxy({}, {}), 'revoked proxy': revoked.proxy,
}

let rows = []
for (let [k, v] of Object.entries(shapeInputs)) {
    rows.push({
        kind: 'shape', input: k,
        frontOld: safe(describeShape, v), serverOldShapeOf: safe(shapeOf, v), serverOldTypeOf: safe(typeOf, v),
        wsemi: safe(getDiagShape, v), wsemiKeysFalse: safe((x) => getDiagShape(x, { keys: false }), v),
    })
}
for (let [k, v] of Object.entries(errInputs)) {
    rows.push({
        kind: 'err', input: k,
        frontOld: safe(describeErr, v), serverOldErrBrief: safe(errBrief, v), serverOldPick: `${safe(pickErrName, v)}|${safe(pickErrCode, v)}`,
        wsemi: safe(getDiagBriefErr, v), wsemiNestedCause: safe((x) => getDiagBriefErr(x, { nested: ['cause'] }), v),
    })
}
//payloadShape(請求本體) 舊 → 新(getDiagShape(本體) ＋ 'rows' ＋ getDiagShape(rows))
let pl = {
    'string': 'abc', '{}': {}, '{group:{v},rows:[x]}': { group: { v: 'S' }, rows: [{ name: 'S' }] }, '{group:"g",rows:"S"}': { group: 'g', rows: 'S' }, '{group:"g",rows:[]}': { group: 'g', rows: [] },
    '31 keys': Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, 1])), 'key with LF': { ['a\nb']: 1, rows: [1] },
}
for (let [k, v] of Object.entries(pl)) {
    rows.push({
        kind: 'payload', input: k,
        old: safe(payloadShape, v),
        wsemi: `${getDiagShape(v)} rows ${getDiagShape(v === null || typeof v !== 'object' ? undefined : v.rows)}`,
    })
}
fs.writeFileSync(path.resolve('tmp/twa2/shape-diff.json'), JSON.stringify(rows, null, 1))
let nSame = 0
for (let r of rows) {
    let cols = Object.entries(r).filter(([k]) => k !== 'kind' && k !== 'input').map(([k, v]) => `${k}=${v}`).join(' ; ')
    console.log(`${r.kind.padEnd(7)} ${r.input.padEnd(40)} ${cols}`)
    if (r.kind === 'shape' && r.frontOld === r.wsemi && r.serverOldShapeOf === r.wsemi) {
        nSame++
    }
}
console.log(`rows=${rows.length} (shape 全相同: ${nSame})`)
