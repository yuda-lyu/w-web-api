//unit-externalRows：外部列受保護之共用判定（src/schema/contracts/externalRows.mjs; 前後端同一份）。
//對應規格 C:\opensrcOper\dspec\外部匯入之定義與機制.md 第 4、7 節（後台對外部列: 不可刪除、不可改身分欄與外部擁有欄位、只可改本系統擁有欄位）、
//處理原則 5「開了外部同步就以外部為主」、sgud/rule/rulebook_backend.md R-EXT-LOCK-01、spec/設計要點與取捨.md ADR-044。
//純 unit（不需 server/browser）。
import assert from 'assert'
import getLockExternalRows from '../server/getLockExternalRows.mjs'
import contract, { fieldsExternal, fieldsLocal } from '../src/schema/contracts/apis.mjs'
import { isExternalRow, normGroup, isValidGroupValue, pickLocalFields, getExternalGroups, isMixedRow, isBlockedByExternalGroup, getExternalChanged, summarizeExternal, fmtVars } from '../src/schema/contracts/externalRows.mjs'


//一列外部列（庫內原列; 每個外部擁有欄位皆有值）
let mkOld = (o = {}) => ({
    id: 'id-1',
    srcKey: 'k1',
    group: 'ext',
    isActive: 'y',
    userIdUpdate: 'u',
    timeCreate: 't0',
    timeUpdate: 't1',
    order: 3,
    name: 'n',
    description: 'd',
    url: 'http://x/a',
    method: 'get',
    version: 'v1',
    levels: 'a.b',
    keywords: 'k',
    state: 'ok',
    creator: 'c',
    dataSource: 'ds',
    mdInputParams: 'mi',
    inputExample: 'ie',
    mdOutputParams: 'mo',
    outputExample: 'oe',
    tokens: 't',
    testBaseUrl: '',
    authType: 'none',
    authConfigJson: '',
    defaultHeadersJson: '',
    defaultQueryJson: '',
    defaultBodyJson: '',
    contentType: 'application/json',
    ...o,
})


describe('unit-externalRows (外部列受保護之共用判定)', function() {

    describe('isExternalRow（srcKey 為非空字串者為外部列）', function() {

        it('srcKey 非空字串 → true', function() {
            assert.strictEqual(isExternalRow({ id: '1', srcKey: 'k' }), true)
            assert.strictEqual(isExternalRow({ id: '1', srcKey: ' ' }), true, '單純空白字串亦非空（與匯入端 isestr 一致）')
        })

        it('srcKey 空字串、缺欄、null、數字、物件、陣列 → false（後台列；預設拒絕之反面: 無法證明為外部列者不鎖）', function() {
            for (let v of ['', undefined, null, 0, 1, true, {}, [], ['k']]) {
                assert.strictEqual(isExternalRow({ id: '1', srcKey: v }), false, `srcKey=${JSON.stringify(v)}`)
            }
            assert.strictEqual(isExternalRow({ id: '1' }), false)
        })

        it('非物件 → false；繼承來的 srcKey（原型）不算', function() {
            for (let v of [null, undefined, 'str', 1, true]) {
                assert.strictEqual(isExternalRow(v), false)
            }
            let o = Object.create({ srcKey: 'k' })
            assert.strictEqual(isExternalRow(o), false, 'R-KEY-01: 只認自有屬性')
        })

    })

    describe('normGroup（寫入庫內後之 group）', function() {

        it('字串套 clearXSS + toWellFormed；非字串為空字串', function() {
            assert.strictEqual(normGroup('ext'), 'ext')
            assert.strictEqual(normGroup('ext<script>alert(1)</script>'), 'ext&lt;script>alert(1)&lt;/script>', '與 ORM 寫入時相同之清理')
            assert.strictEqual(normGroup('a\ud800b'), 'a\ufffdb', '孤立代理字元正規化（與匯入端一致）')
            for (let v of [undefined, null, 1, true, {}, []]) {
                assert.strictEqual(normGroup(v), '')
            }
        })

    })

    describe('getExternalGroups / isMixedRow（外部管理之 group 與混雜列）', function() {

        let rows = [
            { id: '1', group: 'ext', srcKey: 'k1' }, //外部列
            { id: '2', group: 'ext', srcKey: '' }, //混雜列（外部管理 group 內之後台列）
            { id: '3', group: 'ext', srcKey: 'k3' },
            { id: '4', group: 'loc', srcKey: '' }, //後台 group
            { id: '5', group: '', srcKey: '' }, //無 group
            { id: '6', group: 'only-local-mix', srcKey: '' },
            { id: '7', group: 'other', srcKey: 'k7' },
        ]

        it('getExternalGroups: 只含「內有外部列」之 group（非空）', function() {
            let st = getExternalGroups(rows)
            assert.deepStrictEqual([...st].sort(), ['ext', 'other'])
        })

        it('getExternalGroups: 非陣列、空陣列、元素非物件 → 空集合；外部列 group 為空/非字串者不計', function() {
            assert.strictEqual(getExternalGroups(null).size, 0)
            assert.strictEqual(getExternalGroups([]).size, 0)
            assert.strictEqual(getExternalGroups([null, 1, 'x']).size, 0)
            assert.strictEqual(getExternalGroups([{ id: '1', group: '', srcKey: 'k' }, { id: '2', group: 5, srcKey: 'k' }]).size, 0)
        })

        it('isMixedRow: 後台列且 group 為外部管理者才是混雜列；外部列、後台 group、無 group 皆否', function() {
            let st = getExternalGroups(rows)
            let r = Object.fromEntries(rows.map((v) => [v.id, isMixedRow(v, st)]))
            assert.deepStrictEqual(r, { 1: false, 2: true, 3: false, 4: false, 5: false, 6: false, 7: false })
        })

        it('isMixedRow: groups 非 Set → false（不拋錯）', function() {
            assert.strictEqual(isMixedRow({ id: '2', group: 'ext', srcKey: '' }, null), false)
            assert.strictEqual(isMixedRow({ id: '2', group: 'ext', srcKey: '' }, ['ext']), false)
        })

    })

    describe('isBlockedByExternalGroup（外部管理之 group 不得新增列、不得改入）', function() {

        let st = new Set(['ext'])

        it('新增列（old=null）: group 為外部管理 group → 被攔；其他 group、空 group、缺欄 → 不攔', function() {
            assert.strictEqual(isBlockedByExternalGroup(null, 'ext', st), true)
            assert.strictEqual(isBlockedByExternalGroup(null, 'loc', st), false)
            assert.strictEqual(isBlockedByExternalGroup(null, '', st), false)
            assert.strictEqual(isBlockedByExternalGroup(null, undefined, st), false)
            assert.strictEqual(isBlockedByExternalGroup(undefined, 'ext', st), true, 'old 未給視同新增')
        })

        it('後台列改入: group 由 loc 改成 ext → 被攔；改成其他非外部 group → 不攔', function() {
            assert.strictEqual(isBlockedByExternalGroup({ id: '1', group: 'loc', srcKey: '' }, 'ext', st), true)
            assert.strictEqual(isBlockedByExternalGroup({ id: '1', group: 'loc', srcKey: '' }, 'loc2', st), false)
        })

        it('混雜列（原就在 ext 內）group 未改 → 不攔（其他欄位仍可改）；改到另一外部 group → 被攔', function() {
            assert.strictEqual(isBlockedByExternalGroup({ id: '2', group: 'ext', srcKey: '' }, 'ext', st), false)
            let st2 = new Set(['ext', 'ext2'])
            assert.strictEqual(isBlockedByExternalGroup({ id: '2', group: 'ext', srcKey: '' }, 'ext2', st2), true)
        })

        it('比對用寫入後之值: 含標記之 group 先正規化再比', function() {
            let st3 = new Set(['ext&lt;script>x'])
            assert.strictEqual(isBlockedByExternalGroup(null, 'ext<script>x', st3), true)
        })

        it('groups 非 Set → 不攔（無從判定時不誤擋；伺服端以新鮮讀取建 Set，不會傳入非 Set）', function() {
            assert.strictEqual(isBlockedByExternalGroup(null, 'ext', null), false)
        })

    })

    describe('getExternalChanged（外部列被改之欄位: 外部擁有欄位與身分欄）', function() {

        it('契約: 外部擁有欄位 16 個、本系統擁有欄位 8 個(含 tokens)，互不重疊且合為契約 fields（本檔以此窮盡欄位）', function() {
            assert.strictEqual(fieldsExternal.length, 16)
            assert.strictEqual(fieldsLocal.length, 8)
            assert.deepStrictEqual(fieldsExternal.filter((f) => fieldsLocal.includes(f)), [])
            assert.deepStrictEqual([...fieldsExternal, ...fieldsLocal].sort(), [...contract.fields].sort(), 'fields = 外部擁有 + 本系統擁有（本系統擁有含 tokens）')
        })

        it('逐一改動每個外部擁有欄位（含 group）→ 各被偵測（窮盡 fieldsExternal）', function() {
            let old = mkOld()
            for (let f of fieldsExternal) {
                let o = { id: old.id, [f]: f === 'order' ? 99 : `changed-${f}` }
                assert.deepStrictEqual(getExternalChanged(old, o), [f], `改 ${f}`)
            }
        })

        it('逐一改動每個本系統擁有欄位（含 tokens）→ 皆不算改（後台可改）', function() {
            let old = mkOld()
            for (let f of fieldsLocal) {
                let o = { id: old.id, [f]: `changed-${f}` }
                assert.deepStrictEqual(getExternalChanged(old, o), [], `改 ${f}`)
            }
        })

        it('原樣送回（整列回聲，如編輯表單）→ 未改', function() {
            let old = mkOld()
            let o = {}
            for (let f of contract.fields) {
                o[f] = old[f]
            }
            assert.deepStrictEqual(getExternalChanged(old, o, { ...old }), [])
        })

        it('缺欄不比（客戶端沒帶的欄位不算改）；缺欄/null/空字串視為同一', function() {
            let old = mkOld({ description: '', levels: undefined })
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1' }), [])
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1', description: null, levels: '' }), [])
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1', description: 'x' }), ['description'])
        })

        it('數字與其字串形式視為同一（order 為 INTEGER，畫面與庫內型別可能不同）；不同數值才算改', function() {
            let old = mkOld({ order: 3 })
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1', order: '3' }), [])
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1', order: 4 }), ['order'])
            assert.deepStrictEqual(getExternalChanged(mkOld({ order: '' }), { id: 'id-1', order: 0 }), ['order'], `''（外部未給）與 0 不同`)
        })

        it('身分欄 srcKey: 客戶端明確帶來「非空且與庫內不同」之值 → 算改；相同、空值（缺欄／null／空字串：持舊畫面之整列回聲）或未帶 → 不算', function() {
            let old = mkOld()
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1' }, { srcKey: 'forged' }), ['srcKey'])
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1' }, { srcKey: 123 }), ['srcKey'], '非字串之非空值亦算')
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1' }, { srcKey: '' }), [], '空字串: 列於載入後才被匯入補上 srcKey 時之舊回聲，不算（api-concurrency V5）')
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1' }, { srcKey: null }), [])
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1' }, { srcKey: undefined }), [])
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1' }, { srcKey: 'k1' }), [])
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1' }, { name: 'x' }), [])
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1' }, null), [])
        })

        it('多欄同改 → 全列出（順序依 fieldsExternal）', function() {
            let old = mkOld()
            assert.deepStrictEqual(getExternalChanged(old, { id: 'id-1', url: 'u2', name: 'n2' }, { srcKey: 'x' }), ['name', 'url', 'srcKey'])
        })

    })

    describe('getLockExternalRows（opt.lockExternalRows 解析；預設拒絕）', function() {

        it(`僅 'n' 與 false 關閉；未給、'y'、true、大寫 'N'、0、null、空字串、其他字串、物件一律開啟`, function() {
            assert.strictEqual(getLockExternalRows('n'), false)
            assert.strictEqual(getLockExternalRows(false), false)
            for (let v of [undefined, 'y', true, 'N', 'no', 'false', 0, null, '', 1, {}, []]) {
                assert.strictEqual(getLockExternalRows(v), true, `v=${JSON.stringify(v)}`)
            }
        })

    })

    describe('summarizeExternal（升版稽核: g_auditExternalRows.mjs）', function() {

        it('回傳外部列總數、各外部管理 group 之外部列數與混雜列數（依 group 排序）、混雜列清單；後台 group 與無 group 之列不計', function() {
            let rows = [
                { id: '1', name: 'a', group: 'zz', srcKey: 'k1' },
                { id: '2', name: 'b', group: 'zz', srcKey: '' },
                { id: '3', name: 'c', group: 'zz', srcKey: '' },
                { id: '4', name: 'd', group: 'aa', srcKey: 'k4' },
                { id: '5', name: 'e', group: 'aa', srcKey: 'k5' },
                { id: '6', name: 'f', group: 'loc', srcKey: '' },
                { id: '7', name: 'g', group: '', srcKey: '' },
                { id: '8', name: 'h', group: ['zz'], srcKey: '' },
                { id: '9', name: 'i', group: 7, srcKey: '' },
                { id: '10', name: 'j', group: null, srcKey: '' },
            ]
            assert.deepStrictEqual(summarizeExternal(rows), {
                nExternal: 3,
                groups: [{ group: 'aa', nExternal: 2, nMixed: 0 }, { group: 'zz', nExternal: 1, nMixed: 2 }],
                mixed: [{ id: '2', name: 'b', group: 'zz' }, { id: '3', name: 'c', group: 'zz' }],
                badGroup: [{ id: '8', name: 'h', type: 'array' }, { id: '9', name: 'i', type: 'number' }],
            })
        })

        it('空表、非陣列 → 全為 0／空', function() {
            for (let v of [[], null, undefined, 'x']) {
                assert.deepStrictEqual(summarizeExternal(v), { nExternal: 0, groups: [], mixed: [], badGroup: [] })
            }
        })

        it('isValidGroupValue（外審 #1、#2）: 缺欄、null、合法字串通過；陣列、物件、數字、布林、含孤立代理字元之字串不通過', function() {
            for (let v of [undefined, null, '', 'ext', '中文', 'a�b']) {
                assert.strictEqual(isValidGroupValue(v), true, JSON.stringify(v))
            }
            for (let v of [['ext'], {}, 7, 0, true, false, 'a\ud800b', '\udc00']) {
                assert.strictEqual(isValidGroupValue(v), false, JSON.stringify(v))
            }
        })

        it('pickLocalFields（外審 #3）: 只取 id 與本系統擁有欄位（有帶者），外部擁有欄位與伺服器專有欄位不取', function() {
            let w = pickLocalFields(mkOld({ tokens: 'tt' }))
            assert.deepStrictEqual(Object.keys(w).sort(), ['id', ...fieldsLocal].sort())
            assert.strictEqual(w.tokens, 'tt')
            assert.deepStrictEqual(pickLocalFields({ name: 'x', version: 7 }), {}, '無 id、無本系統欄位 → 空物件')
            assert.deepStrictEqual(pickLocalFields({ id: 'a', tokens: 't', srcKey: 'k', group: 'g' }), { id: 'a', tokens: 't' })
        })

    })

    describe('語系鍵（server/procLang.mjs: eng 與 cht 皆有、佔位符一致）', function() {

        let KEYS = ['saveExternalRowChanged', 'deleteExternalRowDenied', 'saveExternalGroupDenied', 'externalRowLocked', 'externalRowNotice', 'externalRowDeleteTip', 'externalGroupNoAdd', 'externalGroupMixedTip', 'externalGroupMixedNotice']

        it('每個鍵 eng／cht 皆為非空字串，且 {佔位符} 集合相同', async function() {
            let procLang = (await import('../server/procLang.mjs')).default
            let kp = procLang({ kpLangExt: {}, webName: { eng: 'a', cht: 'a' }, webDescription: { eng: 'a', cht: 'a' } })
            let ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
            for (let k of KEYS) {
                assert.ok(typeof kp.eng[k] === 'string' && kp.eng[k] !== '', `eng.${k}`)
                assert.ok(typeof kp.cht[k] === 'string' && kp.cht[k] !== '', `cht.${k}`)
                assert.strictEqual(ph(kp.eng[k]), ph(kp.cht[k]), `${k} 佔位符一致`)
            }
            assert.strictEqual(ph(kp.eng.externalRowLocked), 'group')
            assert.strictEqual(ph(kp.eng.externalRowDeleteTip), '')
        })

    })

    describe('fmtVars（語系範本代入）', function() {

        it('單趟代入: 值內之 {group} 字樣不再解析；未給之佔位符原樣保留', function() {
            assert.strictEqual(fmtVars('G "{group}" {x}', { group: '{group}' }), 'G "{group}" {x}')
            assert.strictEqual(fmtVars('G "{group}"', { group: 'a$&b' }), 'G "a$&b"')
            assert.strictEqual(fmtVars('{n}', { n: 3 }), '3')
        })

    })

})
