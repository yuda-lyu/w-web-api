//unit-pickLoginUser：後台登入檢查（GET /api/getUserByToken）成功時回應之使用者欄位白名單與投影（A-2，任務 20261024182736，排程第 133 項 api-run01）。
//白名單單一來源為 server/pickLoginUser.mjs 之 fieldsLoginUser；投影純函數 pickLoginUser 只輸出白名單所列之自身屬性，其餘（部署方使用者物件上的 password、tokenVerify、description、isApp 等）一律不輸出。
//本檔以字面值獨立列出白名單與「永不輸出」之欄位（不由實作之常數衍生），實作若把多餘欄位加入白名單、或投影原樣回傳整個使用者物件即紅。
//白名單內容之依據：前端（src/components/Layout.vue）只用 userSelf.name、userSelf.email，w-ui-loginout 只要求回傳為非空物件；id、isAdmin 為本套件判定身分與等級之欄位；isApp 不需要（等級只看 isAdmin），故不回。
//與真實後端之整合（回應欄位恰為白名單、多餘欄位值不出現）見 api-accessMatrix。
import assert from 'assert'
import path from 'path'
import { pathToFileURL } from 'url'

//被測模組: 預設為本 repo 之 server/pickLoginUser.mjs; 環境變數 API_SERVER_MODULE（指向 WWebApi.mjs 之副本，同 test/tools/apiServerChild.mjs）存在時取同夾之副本（變異測試用，副本放 ./tmp/）
let urlMod = process.env.API_SERVER_MODULE ? pathToFileURL(path.join(path.dirname(path.resolve(process.env.API_SERVER_MODULE)), 'pickLoginUser.mjs')).href : new URL('../server/pickLoginUser.mjs', import.meta.url).href
let { fieldsLoginUser, pickLoginUser } = await import(urlMod)


//應輸出（字面值，依白名單宣告序）／永不輸出（部署方使用者物件上常見之敏感或無關欄位）
let LOGIN = ['id', 'name', 'email', 'isAdmin']
let NEVER = ['password', 'tokenVerify', 'description', 'account', 'isApp', 'from', 'redir', 'timeVerified', 'timeExpired', 'timeBlocked', 'isActive', 'isForceChangePw', 'token', 'tokens', 'userId']

let mkFull = (over = {}) => {
    let u = { id: 'u-1', name: 'n-1', email: 'e-1@example.com', isAdmin: 'y' }
    for (let k of NEVER) {
        u[k] = `SECRET-${k}`
    }
    return { ...u, ...over }
}


describe('unit-pickLoginUser (後台登入檢查回應欄位白名單與投影)', function() {

    it('L01 白名單 fieldsLoginUser 之欄位集合 ＝ 字面值 LOGIN（id、name、email、isAdmin；A-2 要求集合，不鎖鍵序）；不含任何 NEVER 欄位；無重複', function() {
        assert.deepStrictEqual([...fieldsLoginUser].sort(), [...LOGIN].sort())
        for (let k of NEVER) {
            assert.ok(!fieldsLoginUser.includes(k), `${k} 不得回應`)
        }
        assert.strictEqual(new Set(fieldsLoginUser).size, fieldsLoginUser.length)
    })

    it('L02 白名單為凍結之常數（執行期不可被其他模組 push／改寫而放寬）', function() {
        assert.ok(Object.isFrozen(fieldsLoginUser))
        assert.throws(() => {
            'use strict'
            fieldsLoginUser.push('password')
        }, TypeError)
        assert.deepStrictEqual([...fieldsLoginUser].sort(), [...LOGIN].sort())
    })

    it('L03 pickLoginUser：滿欄位使用者 → 恰為白名單欄位（鍵集合同白名單、值取自原物件）；NEVER 欄位之鍵與值皆不出現', function() {
        let o = pickLoginUser(mkFull())
        assert.deepStrictEqual(Object.keys(o).sort(), [...LOGIN].sort())
        assert.deepStrictEqual(o, { id: 'u-1', name: 'n-1', email: 'e-1@example.com', isAdmin: 'y' }) //deepStrictEqual 不比鍵序
        let text = JSON.stringify(o)
        assert.ok(!text.includes('SECRET-'), `輸出不得含敏感欄位之值（實得 ${text}）`)
        for (let k of NEVER) {
            assert.ok(!(k in o), `不得含鍵 ${k}`)
        }
    })

    it('L04 pickLoginUser：逐一把「單一禁止欄位」設為哨兵值，輸出皆不含（防日後白名單漏排除任一個）', function() {
        for (let k of NEVER) {
            let o = pickLoginUser({ id: 'u-1', name: 'n-1', email: 'e-1@example.com', isAdmin: 'n', [k]: 'SECRET-ONLY-ONE' })
            assert.deepStrictEqual(o, { id: 'u-1', name: 'n-1', email: 'e-1@example.com', isAdmin: 'n' }, k)
            assert.ok(!JSON.stringify(o).includes('SECRET-ONLY-ONE'), k)
        }
    })

    it('L05 pickLoginUser：不讀原型鏈（原型上的 id／isAdmin 不被當成自身屬性；防借原型升級為管理員之物件）', function() {
        let proto = { id: 'proto-id', name: 'proto-name', email: 'proto@example.com', isAdmin: 'y' }
        let u = Object.create(proto)
        assert.deepStrictEqual(pickLoginUser(u), {})
        u.id = 'own-id'
        assert.deepStrictEqual(pickLoginUser(u), { id: 'own-id' })
    })

    it('L06 pickLoginUser：缺欄不虛構（缺的鍵不輸出，不補空字串）；值原樣保留（不轉型）', function() {
        assert.deepStrictEqual(pickLoginUser({ id: 'a' }), { id: 'a' })
        assert.deepStrictEqual(pickLoginUser({ id: 'a', isAdmin: 'n', email: '' }), { id: 'a', email: '', isAdmin: 'n' })
    })

    it('L07 pickLoginUser：回傳新物件（修改回傳值不影響來源、之後修改來源不影響回傳值）', function() {
        let src = mkFull()
        let o = pickLoginUser(src)
        o.isAdmin = 'n'
        o.password = 'x'
        assert.strictEqual(src.isAdmin, 'y')
        assert.strictEqual(src.password, 'SECRET-password')
        let o2 = pickLoginUser(src)
        src.name = 'changed'
        assert.strictEqual(o2.name, 'n-1')
    })

    it('L08 pickLoginUser：非物件輸入（null、undefined、字串、數字、陣列）→ 空物件；來源含自身 __proto__ 鍵（JSON.parse）不污染原型', function() {
        for (let v of [null, undefined, 'x', 5, true, [], ['id']]) {
            assert.deepStrictEqual(pickLoginUser(v), {}, JSON.stringify(v))
        }
        let u = JSON.parse('{"id":"a","name":"n","email":"e","isAdmin":"y","__proto__":{"polluted":"y"}}')
        let o = pickLoginUser(u)
        assert.deepStrictEqual(o, { id: 'a', name: 'n', email: 'e', isAdmin: 'y' })
        assert.strictEqual({}.polluted, undefined)
        assert.strictEqual(o.polluted, undefined)
    })

})
