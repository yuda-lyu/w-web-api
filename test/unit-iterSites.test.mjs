//unit：R-OBJ-ITER-01／R-KEY-01 站點守門（CLAUDE_rulebook.md〈迭代使用端傳入之物件與使用端字串鍵〉站點全集之可執行版）
//  - 已套站點不再出現列舉之寫法；
//  - 統計頁（LayoutContentStats.vue）以 `data.${事件名}` 字串取值：事件名含 `.` 或 `[` 時被 lodash 當路徑而恆得 0。事件名皆為程式碼常數，
//    本檔守門其字面值不含 `.`、`[`（新增事件名須同守此限制，或改以陣列路徑取值）。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'


let __dirname = path.dirname(fileURLToPath(import.meta.url))
let root = path.resolve(__dirname, '..')
let read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
let listMjs = (rel) => fs.readdirSync(path.join(root, rel), { recursive: true }).filter((f) => f.endsWith('.mjs')).map((f) => path.join(rel, f))


describe('unit-iterSites (R-OBJ-ITER-01 / R-KEY-01 站點守門)', function() {

    it('SITE-API-001 syncAndReplaceTabs 之 base64 還原不以 lodash each 走訪列物件', function() {
        let src = read('server/WWebApi.mjs')
        assert.ok(!/\beach\(\s*row\s*,/.test(src), '不得 each(row, …)')
        assert.ok(/for \(let k of Object\.keys\(row\)\)/.test(src), '應以 Object.keys(row) 走訪')
    })

    it('SITE-API-002 測試分頁預設 JSON 預填不以 lodash each 走訪（改經 mShare.jsonToKvPairs）', function() {
        let src = read('src/components/LayoutContentTest.vue')
        assert.ok(!/\beach\(\s*obj\s*,/.test(src), '不得 each(obj, …)')
        assert.ok(/jsonToKvPairs\(/.test(src))
    })

    it('SITE-API-003 左側 API 樹之節點路徑經 apiTreePath，不再以字串 levels.name 組路徑交給 lodash', function() {
        let src = read('src/components/LayoutContent.vue')
        assert.ok(!/`\$\{v\.levels\}\.\$\{v\.name\}`/.test(src))
        assert.ok(/apiTreePath\(\s*v\.levels\s*,\s*v\.name\s*\)/.test(src))
        assert.ok(/apiTreeSet\(\s*tr\s*,/.test(src), '應經 apiTreeSet 寫入樹物件')
        assert.ok(!/\bset\(\s*tr\s*,/.test(src), '不得 set(tr, …)')
    })

    it('SITE-API-004 統計事件名（log 之 event）不含 . 與 [，且不為保留字 count 或原型鍵名（統計頁以 data.<事件名> 字串取值；staLogsCore 以事件名為鍵）', function() {
        //事件名來源: ①event: '字面值' ②event: `樣板字串`(內插部分以 X 代入) ③wrapRouteErrLog('名稱')(事件名即名稱) ④wrapErrLog('名稱')(事件名為 'kpfun-' + 名稱)
        let reserved = new Set(['count', 'length', 'constructor', '__proto__', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'])
        let names = []
        for (let rel of listMjs('server')) {
            let src = fs.readFileSync(path.join(root, rel), 'utf8')
            for (let m of src.matchAll(/event:\s*['"]([^'"]*)['"]/g)) {
                names.push([rel, m[1]])
            }
            for (let m of src.matchAll(/event:\s*`([^`]*)`/g)) {
                names.push([rel, m[1].replace(/\$\{[^}]*\}/g, 'X')])
            }
            for (let m of src.matchAll(/wrapRouteErrLog\(\s*['"]([^'"]*)['"]/g)) {
                names.push([rel, m[1]])
            }
            for (let m of src.matchAll(/(?<![\w.])wrapErrLog\(\s*['"]([^'"]*)['"]/g)) {
                names.push([rel, 'kpfun-' + m[1]])
            }
        }
        assert.ok(names.length >= 25, `應掃到既有之事件名（實得 ${names.length}）`)
        let bad = names.filter(([, nm]) => /[.[\]]/.test(nm) || reserved.has(nm)).map(([rel, nm]) => `${rel}: ${nm}`)
        assert.deepStrictEqual(bad, [])
    })

})
