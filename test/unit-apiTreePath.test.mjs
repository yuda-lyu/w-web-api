//unit：src/plugins/mShare.mjs 之 apiTreePath（左側 API 樹之節點路徑；R-KEY-01：使用端給定之 name 不得當 lodash 路徑）
//規則：levels 以 `.` 分層（設計），name 為葉名、整段視為單一層級；改造前（LayoutContent.vue genTree 以 `${levels}.${name}` 交給 lodash get／set）
//name 內之 `.`／`[` 被解析為路徑：多出中間層，且葉（值為 id 字串）遇後來之 `a.b` 時被 set 換成物件，先前之 API 自樹上消失。
import assert from 'assert'
import get from 'lodash-es/get.js'
import set from 'lodash-es/set.js'
import toPath from 'lodash-es/toPath.js'
import isobj from 'wsemi/src/isobj.mjs'
import convertToTree from 'wsemi/src/convertToTree.mjs'
import { apiTreePath, apiTreeSet } from '../src/plugins/mShare.mjs'


//buildTr：與 genTree 相同之建樹（葉為 id）；mkPath 為節點路徑函數
function buildTr(apis, mkPath) {
    let tr = {}
    for (let v of apis) {
        let levels = mkPath(v)
        if (!isobj(get(tr, levels))) {
            set(tr, levels, v.id)
        }
    }
    return tr
}


//buildTrNew：現行建樹(genTree 所用): apiTreePath + apiTreeSet
function buildTrNew(apis) {
    let tr = {}
    for (let v of apis) {
        apiTreeSet(tr, apiTreePath(v.levels, v.name), v.id)
    }
    return tr
}


let oldPath = (v) => `${v.levels}.${v.name}` //改造前


describe('unit-apiTreePath', function() {

    it('TP-001 levels 依 . 分層、name 為單一葉名', function() {
        assert.deepStrictEqual(apiTreePath('API', '取得API清單'), ['API', '取得API清單'])
        assert.deepStrictEqual(apiTreePath('寵物.狗狗', 'n1'), ['寵物', '狗狗', 'n1'])
        assert.deepStrictEqual(apiTreePath('A.B.C', 'n'), ['A', 'B', 'C', 'n'])
    })

    it('TP-002 name 含 . 或 [：整段為單一葉名（改造前被拆成多層／索引）', function() {
        assert.deepStrictEqual(apiTreePath('API', 'v1.0 list'), ['API', 'v1.0 list'])
        assert.deepStrictEqual(apiTreePath('API', 'x[0]'), ['API', 'x[0]'])
        assert.deepStrictEqual(apiTreePath('寵物.狗狗', 'a.b.c'), ['寵物', '狗狗', 'a.b.c'])
    })

    it('TP-003 一般資料（name 不含 . 與 [）：建出之樹與改造前相同（含 seed 風格之多層 levels）', function() {
        let apis = [
            { id: 'i1', levels: 'API', name: '取得API清單' },
            { id: 'i2', levels: '寵物', name: '狗狗清單' },
            { id: 'i3', levels: '寵物.狗狗', name: '黃金獵犬' },
            { id: 'i4', levels: '寵物.貓咪', name: '波斯貓' },
            { id: 'i5', levels: '交通工具.汽車', name: '轎車' },
        ]
        assert.deepStrictEqual(buildTrNew(apis), buildTr(apis, oldPath))
    })

    it('TP-003b levels 為空字串、含 [ 或不存在: 路徑與改造前(字串路徑解析)逐一相同(name 不含 . 與 [ 時)', function() {
        for (let levels of ['', 'A', 'A.B', 'A[0]', 'A.B[1].C', undefined, null, 5]) {
            for (let name of ['n', '', '取得API清單', 'x y']) {
                assert.deepStrictEqual(apiTreePath(levels, name), toPath(`${levels}.${name}`), `levels=${String(levels)} name=${name}`)
            }
        }
    })

    it('TP-004 name 為 a 與 a.b 並存：兩個 API 皆在樹上（改造前 a 被換成 { b } 而消失）', function() {
        let apis = [
            { id: 'i1', levels: 'API', name: 'a' },
            { id: 'i2', levels: 'API', name: 'a.b' },
        ]
        assert.deepStrictEqual(buildTrNew(apis), { API: { 'a': 'i1', 'a.b': 'i2' } })
        //缺陷事實（修改前）
        assert.deepStrictEqual(buildTr(apis, oldPath), { API: { a: { b: 'i2' } } })
    })

    it('TP-005 levels 為空字串且另有 levels 為其名稱之群組: 兩筆皆在樹上，樹與改造前相同(空階層為名稱空字串之群組)', function() {
        let apis = [
            { id: 'i1', levels: '', name: 'API' },
            { id: 'i2', levels: 'API', name: 'list' },
        ]
        let t = buildTrNew(apis)
        assert.deepStrictEqual(t, buildTr(apis, oldPath))
        assert.deepStrictEqual(JSON.parse(JSON.stringify(t)), { '': { 'API': 'i1' }, 'API': { 'list': 'i2' } })
    })

    it('TP-006 name／levels 為原型鍵名(__proto__、constructor、toString、hasOwnProperty): 皆為樹上自有節點，不因繼承值被當成既有群組而消失', function() {
        let apis = [
            { id: 'i0', levels: 'API', name: 'ok' },
            { id: 'i1', levels: 'API', name: '__proto__' },
            { id: 'i2', levels: 'API', name: 'constructor' },
            { id: 'i3', levels: 'API', name: 'toString' },
            { id: 'i4', levels: 'API', name: 'hasOwnProperty' },
            { id: 'i5', levels: '__proto__', name: 'inner' },
        ]
        let t = buildTrNew(apis)
        let leaf = (o, k) => Object.getOwnPropertyDescriptor(o, k).value
        assert.deepStrictEqual(Object.keys(t.API), ['ok', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])
        assert.strictEqual(leaf(t.API, '__proto__'), 'i1')
        assert.strictEqual(leaf(t.API, 'constructor'), 'i2')
        assert.strictEqual(leaf(t.API, 'toString'), 'i3')
        assert.strictEqual(leaf(t.API, 'hasOwnProperty'), 'i4')
        assert.strictEqual(leaf(leaf(t, '__proto__'), 'inner'), 'i5')
        assert.strictEqual(Object.getPrototypeOf(t), Object.prototype, '樹物件本身之原型不得被改寫')
        //與 genTree 下一步相同: convertToTree 後每個 API 皆有葉節點(text 為 id)
        let ids = []
        let walk = (ns) => {
            for (let n of ns) {
                if (n.type === 'node') {
                    ids.push(n.text)
                }
                if (Array.isArray(n.children)) {
                    walk(n.children)
                }
            }
        }
        walk(convertToTree(t, { bindRoot: 'ROOT' }))
        assert.deepStrictEqual(ids.sort(), ['i0', 'i1', 'i2', 'i3', 'i4', 'i5'])
        //缺陷事實(修改前): 名稱為 __proto__（繼承值被當成既有群組）與 constructor（lodash set 拒寫不安全鍵）之 API 不進樹
        let old = buildTr(apis.slice(0, 5), oldPath)
        assert.deepStrictEqual(Object.keys(old.API), ['ok', 'toString', 'hasOwnProperty'])
    })

})
