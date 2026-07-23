//e2e：API 編輯流程（新增 / 修改 / 刪除）
//
//重要流程（spec bullets）：
//- E2E-001：編輯既有 API 之名稱 → 儲存 → 左樹與右側文件反映新名稱 + DB 該筆 name 已更新。
//- E2E-002：新增 API → 填表（名稱/網址/階層）→ 儲存 → 左樹出現新節點 + DB 新增該筆。
//- E2E-003：刪除既有 API → 確認對話框點「是」→ 左樹移除該節點 + DB 移除該筆。
//
//act 走真實 user 路徑：點 mode 分頁、鍵盤輸入（typeIntoInput / Pattern D）、點按鈕、點確認對話框。
//assert：UI user-facing 觀察（樹/文件文字）+ DB 副作用 + pixel baseline。多語 eng/cht 皆跑。
//
import assert from 'assert'
import { chromium } from 'playwright'
import {
    startServersOnce,
    captureStableWithBox,
    waitMutationSettled,
    waitUntilExist,
    typeIntoInput,
    resetToBaseSeed,
    assertOrRegenBaseline,
    woItems,
    baseUrl,
    chromiumLaunchArgs,
} from './e2e-setup.mjs'


let FLOW = 'edit'
let LANGS = ['eng', 'cht']

let T = {
    eng: { edit: 'Edit', newApi: 'New API', yes: 'Yes', no: 'No', lblName: 'Name', lblUrl: 'API url', lblLevels: 'Levels', saved: 'Saved', deleted: 'Deleted', valRequired: 'This field is required' },
    cht: { edit: '編輯', newApi: '新增API', yes: '確定', no: '取消', lblName: '名稱', lblUrl: 'API網址', lblLevels: '所屬階層', saved: '已儲存', deleted: '已刪除', valRequired: '此欄位必填' },
}


//等成功 confirm modal 出現再截圖。成功訊息已由 toast 改為 $dg.showCheckYes modal（停留、需點 OK），
//因 toast 是插入後又移除的暫時 DOM、新版 chromium 在 insert/remove 後會把整頁偏移 1px（headless 偶發）；
//modal「顯示著被截」無移除殘留、byte 穩定（同 edit-004 之 WConfirm 對話框），且對齊 w-web-sso 成功 modal。
async function waitSaveModal(page, lang) {
    await waitUntilExist(page, 'save success modal', (s) => {
        return (document.body.innerText || '').includes(s)
    }, { timeout: 10000, arg: T[lang].saved })
    await page.waitForTimeout(300)
}


//以 ?lang= 指定語系載入初始畫面（對齊 w-web-sso；前端 getLang 之 URL ?lang= 最高優先）。lang 省略則預設 eng。
async function gotoReady(page, lang) {
    let q = (lang === 'cht' || lang === 'eng') ? `&lang=${lang}` : ''
    await page.goto(`${baseUrl}/?token=sys${q}`, { waitUntil: 'load', timeout: 30000 })
    await waitUntilExist(page, 'API tree rendered', () => {
        let t = document.body.innerText || ''
        return t.includes('取得API清單') && t.includes('取得寵物清單')
    }, { timeout: 25000 })
    //等指定語系 UI 套用到位（cht 看「文件」分頁、eng/預設看「Docs」）
    let marker = (lang === 'cht') ? '文件' : 'Docs'
    await waitUntilExist(page, `UI lang applied (${marker})`, (m) => (document.body.innerText || '').includes(m), { timeout: 8000, arg: marker })
    await page.waitForTimeout(300)
}

//依「label 元素」定位編輯表單某欄位列 / 其 input。
//不可用 .bk-row 的 hasText(label)：hint 說明文字可能含其他 label 字串（如 testBaseUrl 之 eng hint 含 'API url'）
//→ 'API url' 同時命中「API url」列與「測試基礎網址」列 → strict mode violation。收窄到 .bk-col-label 標籤元素才精準。
function fieldRow(page, label) {
    return page.locator('.bk-row').filter({ has: page.locator('.bk-col-label', { hasText: label }) })
}
function fieldInput(page, label) {
    return fieldRow(page, label).locator('input.bk-input')
}

async function findApiByName(name) {
    let all = await woItems.apis.select()
    return all.find((r) => r.name === name) || null
}


describe('e2e-edit (API 編輯)', function() {
    this.timeout(240000)

    let browser = null
    let ctx = null
    let page = null

    before(async function() {
        this.timeout(180000)
        await startServersOnce()
    })

    beforeEach(async function() {
        this.timeout(180000)
        //每個 case 從相同 base seed 起跑（hermetic）
        await resetToBaseSeed()
        //每 case 全新 browser（對齊 SSO eye-toggle E2E-017/018 之 per-case fresh）：避免共用 browser 跨 case
        //累積的 glyph atlas / raster 狀態，在 WTree 內容剛好 6px 溢出的虛擬渲染邊界偶發整棵樹 ~6px 位移。
        //chromiumLaunchArgs=確定性渲染組（關 GPU/subpixel 字形 AA），消 eng 截圖 byte 不穩。
        browser = await chromium.launch({ headless: true, args: chromiumLaunchArgs })
        ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        page = await ctx.newPage()
    })

    afterEach(async function() {
        if (browser) {
            await browser.close()
            browser = null
        }
    })

    after(async function() {
        //還原 base seed 供非 e2e 時段使用
        await resetToBaseSeed()
    })

    for (let lang of LANGS) {

        it(`E2E-001 [${lang}] 編輯既有 API 改名後儲存`, async function() {
            await gotoReady(page, lang)

            let newName = `取得API清單-改-${lang}`

            //act 多步驟 + 每步紅框出圖（讓讀者看到：編輯哪裡 → 從什麼改成什麼 → 結果）
            let nameRow = fieldRow(page, T[lang].lblName)

            //步驟1：點「編輯」分頁，Name 欄顯示原值「取得API清單」→ 紅框標 Name 欄
            await page.getByText(T[lang].edit, { exact: true }).first().click({ timeout: 8000 })
            let nameInp = fieldInput(page, T[lang].lblName)
            await nameInp.waitFor({ state: 'visible', timeout: 8000 })
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-001-1-name-old.png`, await captureStableWithBox(page, nameRow))

            //步驟2：Name 欄輸入新名稱（存檔前）→ 紅框標 Name 欄（顯示新值，從什麼變成什麼）
            await typeIntoInput(page, nameInp, newName)
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-001-2-name-new.png`, await captureStableWithBox(page, nameRow))

            //步驟3：點儲存
            await page.locator('button.btn-save').first().click({ timeout: 8000 })

            //等 UI 反映（儲存後回 docs，樹/文件出現新名稱）
            await waitUntilExist(page, 'renamed in UI', (nm) => (document.body.innerText || '').includes(nm), { timeout: 12000, arg: newName })

            //assert UI（user-facing）
            let txt = await page.evaluate(() => document.body.innerText || '')
            assert.ok(txt.includes(newName), `畫面應顯示新名稱「${newName}」`)

            //assert DB 副作用（補強）：改名後的筆存在、舊名不存在（確為原地更新非新增）
            //註：funTest 種子 id 為隨機（apis.mjs funTest 內 v.id=item.id 已註解），故以 name 驗證
            let renamed = await findApiByName(newName)
            assert.ok(renamed, `DB 應有改名後的 API「${newName}」`)
            let oldOne = await findApiByName('取得API清單')
            assert.ok(!oldOne, '舊名稱「取得API清單」不應再存在（確為原地更新）')

            //步驟3 出圖：改名後 docs 標頭（新名稱已反映）→ 紅框標標頭（結果）
            await waitSaveModal(page, lang)
            await waitMutationSettled(page)
            let buf = await captureStableWithBox(page, ['.op-title', '.op-path', '.op-desc'])
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-001-3-renamed.png`, buf)
        })

        it(`E2E-002 [${lang}] 新增 API 填表後儲存`, async function() {
            await gotoReady(page, lang)

            let newName = `E2E新增API-${lang}`
            let newUrl = 'http://localhost:11005/e2eAdd'
            let newLevels = 'E2E分類'

            //act 多步驟 + 每步紅框出圖
            let fillRows = [
                fieldRow(page, T[lang].lblName),
                fieldRow(page, T[lang].lblUrl),
                fieldRow(page, T[lang].lblLevels),
            ]

            //步驟1：點「新增API」開空白表單 → 紅框標 Name/url/Levels 三欄（填寫前空白）
            await page.getByText(T[lang].newApi, { exact: false }).first().click({ timeout: 8000 })
            let nameInp = fieldInput(page, T[lang].lblName)
            await nameInp.waitFor({ state: 'visible', timeout: 8000 })
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-002-1-form-empty.png`, await captureStableWithBox(page, fillRows))

            //步驟2：填入 Name/url/Levels（存檔前）→ 紅框標同三欄（顯示已填內容）
            await typeIntoInput(page, nameInp, newName)
            await typeIntoInput(page, fieldInput(page, T[lang].lblUrl), newUrl)
            await typeIntoInput(page, fieldInput(page, T[lang].lblLevels), newLevels)
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-002-2-filled.png`, await captureStableWithBox(page, fillRows))

            //步驟3：點儲存
            await page.locator('button.btn-save').first().click({ timeout: 8000 })

            //等 UI 反映（樹出現新節點）
            await waitUntilExist(page, 'new api in tree', (nm) => (document.body.innerText || '').includes(nm), { timeout: 12000, arg: newName })

            //assert UI
            let txt = await page.evaluate(() => document.body.innerText || '')
            assert.ok(txt.includes(newName), `左樹應出現新節點「${newName}」`)
            assert.ok(txt.includes(newLevels), `左樹應出現新階層「${newLevels}」`)

            //assert DB
            let row = await findApiByName(newName)
            assert.ok(row, 'DB 應新增該筆 API')
            assert.strictEqual(row.url, newUrl, 'DB 新筆 url 應正確')
            assert.strictEqual(row.method, 'get', 'DB 新筆 method 應為預設 get')

            //步驟3 出圖：儲存成功 modal → 紅框標 modal（結果；新節點在樹 fold 以下，由上方語意斷言守）
            await waitSaveModal(page, lang)
            await waitMutationSettled(page)
            let buf = await captureStableWithBox(page, 'div[style*="overscroll-behavior"] div[tabindex="0"] > div')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-002-3-saved.png`, buf)
        })

        it(`E2E-003 [${lang}] 刪除既有 API 含確認對話框`, async function() {
            await gotoReady(page, lang)

            //刪除前 base 筆數（供總數減一斷言）
            let baseCount = (await woItems.apis.select()).length

            //預設選取第一筆「取得API清單」
            //act 多步驟 + 每步紅框出圖
            //步驟1：點「編輯」分頁 → 紅框標「刪除」鈕（從哪裡刪）
            await page.getByText(T[lang].edit, { exact: true }).first().click({ timeout: 8000 })
            await page.locator('button.btn-delete').waitFor({ state: 'visible', timeout: 8000 })
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-003-1-delete-btn.png`, await captureStableWithBox(page, 'button.btn-delete'))

            //步驟2：點「刪除」→ 確認對話框出現 → 紅框標對話框
            await page.locator('button.btn-delete').first().click({ timeout: 8000 })
            await waitUntilExist(page, 'confirm dialog', (yes) => (document.body.innerText || '').includes(yes), { timeout: 8000, arg: T[lang].yes })
            let bufDlg = await captureStableWithBox(page, 'div[style*="overscroll-behavior"] div[tabindex="0"] > div')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-003-2-confirm.png`, bufDlg)

            //步驟3：點「是」確認刪除
            await page.getByText(T[lang].yes, { exact: true }).first().click({ timeout: 8000 })

            //等 UI 反映（該節點從樹消失）
            await waitUntilExist(page, 'api removed from tree', () => !(document.body.innerText || '').includes('取得API清單'), { timeout: 12000 })

            //assert UI
            let txt = await page.evaluate(() => document.body.innerText || '')
            assert.ok(!txt.includes('取得API清單'), '左樹不應再有「取得API清單」')
            assert.ok(txt.includes('取得寵物清單'), '其他 API 應仍在')

            //assert DB：被刪除的「取得API清單」不應再存在，且總數減一
            let gone = await findApiByName('取得API清單')
            assert.ok(!gone, 'DB 不應再有「取得API清單」')
            let all = await woItems.apis.select()
            assert.strictEqual(all.length, baseCount - 1, `API 總數應由 ${baseCount} 減為 ${baseCount - 1}`)

            //步驟3 出圖：刪除後左樹（該節點已消失）→ 紅框標左樹（結果；等「已刪除」modal 穩定顯示，與 E2E-001 一致）
            await waitUntilExist(page, 'deleted modal', (s) => (document.body.innerText || '').includes(s), { timeout: 10000, arg: T[lang].deleted })
            await waitMutationSettled(page)
            let buf = await captureStableWithBox(page, 'div[style*="border-right"]')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-003-3-deleted.png`, buf)
        })

        //E2E-004：新增表單名稱留空 → 同步檢測攔截 inline 必填紅字、不打 API、DB 不新增（錯誤處理分層之同步檢測層）
        it(`E2E-004 [${lang}] 名稱留空儲存顯示必填錯誤、不送出`, async function() {
            await gotoReady(page, lang)

            let baseCount = (await woItems.apis.select()).length

            //act 多階段：開空白表單 → (階段1 名稱空白態) → 點儲存 → (階段2 錯誤態)
            await page.getByText(T[lang].newApi, { exact: false }).first().click({ timeout: 8000 })
            let nameRow = fieldRow(page, T[lang].lblName)
            await fieldInput(page, T[lang].lblName).waitFor({ state: 'visible', timeout: 8000 })

            //階段1：名稱欄空白（按儲存前、尚無紅字）→ 紅框標名稱欄
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-004-1-name-empty.png`, await captureStableWithBox(page, nameRow))

            //act：點儲存（名稱空 → 同步檢測攔截）
            await page.locator('button.btn-save').first().click({ timeout: 8000 })

            //等名稱欄 inline 必填紅字出現（同步檢測攔截、未開 loading 未打 API）
            await waitUntilExist(page, 'name required inline error', (msg) => {
                let errs = Array.from(document.querySelectorAll('.bk-err')).map((e) => (e.innerText || '').trim())
                return errs.includes(msg)
            }, { timeout: 8000, arg: T[lang].valRequired })

            //assert 語意：名稱欄下 inline 紅字 = 必填訊息；無成功 modal；DB 未新增
            let errTexts = await page.evaluate(() => Array.from(document.querySelectorAll('.bk-err')).map((e) => (e.innerText || '').trim()))
            assert.ok(errTexts.includes(T[lang].valRequired), `名稱欄應顯示必填紅字「${T[lang].valRequired}」（實得 ${JSON.stringify(errTexts)}）`)
            let txt = await page.evaluate(() => document.body.innerText || '')
            assert.ok(!txt.includes(T[lang].saved), '不應出現「已儲存」成功 modal（未打 API）')
            let afterCount = (await woItems.apis.select()).length
            assert.strictEqual(afterCount, baseCount, `DB apis 筆數應不變（${baseCount}），未新增`)

            //階段2：名稱欄出現 inline 必填紅字（按儲存後）→ 紅框標名稱欄
            let buf = await captureStableWithBox(page, nameRow)
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-004-2-name-required.png`, buf)
        })

        //E2E-005：刪除確認點「取消」→ reject 'close' 靜默忽略、不刪（DB 不變、左樹仍在）。對話框共用 E2E-003-2-confirm baseline
        it(`E2E-005 [${lang}] 刪除確認點取消，靜默不刪`, async function() {
            await gotoReady(page, lang)

            let baseCount = (await woItems.apis.select()).length

            //act：編輯分頁 → 點刪除 → 出現確認對話框
            await page.getByText(T[lang].edit, { exact: true }).first().click({ timeout: 8000 })
            await page.locator('button.btn-delete').waitFor({ state: 'visible', timeout: 8000 })
            await page.locator('button.btn-delete').first().click({ timeout: 8000 })
            await waitUntilExist(page, 'confirm dialog', (yes) => (document.body.innerText || '').includes(yes), { timeout: 8000, arg: T[lang].yes })

            //視覺：確認對話框與 E2E-003 共用同一 baseline（同一 WConfirm 面板），不另存圖
            let bufDlg = await captureStableWithBox(page, 'div[style*="overscroll-behavior"] div[tabindex="0"] > div')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-003-2-confirm.png`, bufDlg)

            //act：點對話框的「No／取消」取消刪除。
            //須限定在 modal 容器內：編輯表單底部本身也有「取消」鈕（btn-cancel），cht 下 no 與 cancel i18n 同為「取消」，
            //不 scope 會撞到表單那顆（在 modal 遮罩下被攔截 click）。eng 因對話框「No」≠ 表單「Cancel」才僥倖未撞。
            await page.locator('div[style*="overscroll-behavior"]').getByText(T[lang].no, { exact: true }).first().click({ timeout: 8000 })
            //等對話框關閉（Yes/確定 文字消失）
            await waitUntilExist(page, 'confirm dialog closed', (yes) => !(document.body.innerText || '').includes(yes), { timeout: 8000, arg: T[lang].yes })

            //assert 語意：左樹仍有該 API；DB 未刪；無成功 modal
            let txt = await page.evaluate(() => document.body.innerText || '')
            assert.ok(txt.includes('取得API清單'), '取消後左樹仍應含「取得API清單」')
            assert.ok(!txt.includes(T[lang].deleted), '不應出現「已刪除」成功 modal（已取消）')
            let afterCount = (await woItems.apis.select()).length
            assert.strictEqual(afterCount, baseCount, `DB apis 筆數應不變（${baseCount}），未刪除`)
        })

    }

})
