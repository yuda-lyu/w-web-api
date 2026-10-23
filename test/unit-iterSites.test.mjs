//unit：R-OBJ-ITER-01／R-KEY-01 站點守門（CLAUDE_rulebook.md〈迭代使用端傳入之物件與使用端字串鍵〉站點全集之可執行版）
//  - 已套站點不再出現列舉之寫法；
//  - 統計頁（LayoutContentStats.vue）取時間桶 data 內事件名之值：改造前以 `data.${事件名}` 字串交 lodash get（事件名含 `.` 或 `[` 時被當路徑而恆得 0），
//    現經 mShare.getFreqVal 以自有屬性取值（SITE-API-005），事件名不再受 `.`、`[` 限制；事件名仍不得為保留字 count 或原型鍵名（統計頁與 staLogsCore 以事件名為物件鍵，SITE-API-004）。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'


let __dirname = path.dirname(fileURLToPath(import.meta.url))
let root = path.resolve(__dirname, '..')
let read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
let listMjs = (rel) => fs.readdirSync(path.join(root, rel), { recursive: true }).filter((f) => f.endsWith('.mjs')).map((f) => path.join(rel, f))


describe('unit-iterSites (R-OBJ-ITER-01 / R-KEY-01 站點守門)', function() {

    //2026-10-23（ADR-043）: 外部匯入移至 server/syncApis.mjs 並改為差異同步；base64 還原不再走訪列物件之全部鍵，
    //而是只以自有屬性（hasOwnProperty）逐一讀取契約列舉之欄位（fieldsExternal）與 srcKey／id——列物件之任意欄位名（含數字 length）不被走訪，也不被複製進庫
    it('SITE-API-001 syncAndReplaceTabs 之 base64 還原不以 lodash each 或 for-in 走訪列物件，只以自有屬性讀取列舉之欄位', function() {
        let src = read('server/syncApis.mjs')
        assert.ok(!/\beach\(\s*(row|raw)\s*,/.test(src), '不得 each(row, …)')
        assert.ok(!/for \(let \w+ in /.test(src), '不得 for-in 走訪')
        assert.ok(/Object\.prototype\.hasOwnProperty\.call\(o, k\)/.test(src), '應以自有屬性讀取（own）')
        assert.ok(/for \(let f of fieldsExternal\)/.test(src), '只讀契約列舉之外部擁有欄位')
        let wwa = read('server/WWebApi.mjs')
        assert.ok(!/\beach\(\s*row\s*,/.test(wwa) && !/base64:/.test(wwa), 'WWebApi 不再有列物件走訪與 base64 還原（已移至 syncApis）')
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

    it('SITE-API-004 統計事件名（log 之 event）不為保留字 count 或原型鍵名（統計頁與 staLogsCore 以事件名為物件鍵）', function() {
        //事件名來源: ①event: '字面值' ②event: `樣板字串`(內插部分以 X 代入) ③wrapRouteErrLog('名稱')(事件名即名稱) ④wrapErrLog('名稱')(事件名為 'kpfun-' + 名稱)
        //保留集合: Object.prototype 之全部自有名稱（constructor、toString、__proto__、isPrototypeOf、__defineGetter__ …）加統計保留字與常見陷阱名
        let reserved = new Set([...Object.getOwnPropertyNames(Object.prototype), 'count', 'length', 'prototype'])
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
        let bad = names.filter(([, nm]) => reserved.has(nm)).map(([rel, nm]) => `${rel}: ${nm}`)
        assert.deepStrictEqual(bad, [])
    })

    it('SITE-API-005 統計頁（LayoutContentStats.vue）取 data 內事件名之值經 mShare.getFreqVal，不以 data.<事件名> 路徑字串交給 lodash', function() {
        let src = read('src/components/LayoutContentStats.vue')
        //src/ 全目錄（.vue 與 .mjs／.js）皆不得以樣板字串 `data.${…}` 組 lodash 路徑
        let files = fs.readdirSync(path.join(root, 'src'), { recursive: true }).filter((f) => /\.(vue|mjs|js)$/.test(f)).map((f) => path.join('src', f))
        //註解不計（說明文字會提及改造前的寫法）
        let stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        let bad = files.filter((f) => /`data\.\$\{/.test(stripComments(read(f))))
        assert.deepStrictEqual(bad, [], '不得以樣板字串 data.<事件名> 組路徑字串')
        //三處取值各自傳入正確的鍵：重採樣加總（k）、圖表系列（valueKey）、事件統計表（ev）；各恰一處
        assert.strictEqual((src.match(/vo\.\$s\.getFreqVal\(item, k\)/g) || []).length, 1, '重採樣加總應取 k')
        assert.strictEqual((src.match(/vo\.\$s\.getFreqVal\(item, valueKey\)/g) || []).length, 1, '圖表系列應取 valueKey')
        assert.strictEqual((src.match(/vo\.\$s\.getFreqVal\(item, ev\)/g) || []).length, 1, '事件統計表應取 ev')
        assert.ok(/function getFreqVal\(/.test(read('src/plugins/mShare.mjs')))
        //元件以 vo.$s 取用：main.js 須以命名空間匯入 mShare 並掛為 Vue.prototype.$s（否則統計頁於執行期拋 undefined）
        let main = read('src/main.js')
        assert.ok(/import \* as s from '\.\/plugins\/mShare\.mjs'/.test(main) && /Vue\.prototype\.\$s = s/.test(main), 'main.js 應註冊 $s = mShare')
    })

})
