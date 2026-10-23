//e2e：API 編輯之外部列受保護（原則 5「開了外部同步就以外部為主」；規格 C:\opensrcOper\dspec\外部匯入之定義與機制.md 第 4、7 節；rulebook_backend.md R-EXT-LOCK-01；spec/流程_編輯API.md E2E-013～E2E-018；ADR-044）
//
//重要流程（spec bullets）：
//- E2E-013：外部列（srcKey 非空）——樹狀清單列旁顯示鎖頭；編輯頁上方顯示唯讀說明；群組與外部來源提供之欄位唯讀（鍵盤輸入無效）、權杖與測試設定可編輯並儲存成功（外部擁有欄位／srcKey／group 不變）；刪除鈕停用且停留顯示說明。
//- E2E-014：外部管理之 group——新增 API 或把既有 API 改入該 group：群組欄即時提示，儲存被擋（不送出、DB 不新增）；改用其他 group 即可儲存。
//- E2E-015：混雜列（外部管理 group 內 srcKey 為空之後台列）——樹狀清單列旁顯示警告（下次匯入會被移除）、編輯頁上方顯示警告；不鎖（欄位可編輯、可儲存、可刪除）。
//- E2E-016：lockExternalRows:'n'（後端以設定檔重啟）——回到升版前行為：無鎖頭與說明、欄位可編輯、可儲存、可在外部管理 group 新增。
//- E2E-017：編輯中之後台列被匯入「只補 srcKey」（內容相同、摘要不變）——畫面轉為外部列、草稿保留，權杖仍可儲存（舊畫面之空 srcKey 回聲不被誤拒）。
//- E2E-018：同上但草稿含外部擁有欄位之修改——儲存被拒並出現「已被他人更新」提示與重新載入鈕，重新載入後可存。
//
//前置（直接寫 DB，E2E-012 同例；非 UI 可造成）：base seed 之「取得API清單」改為外部列（group ext-demo、srcKey ext-key-1），「取得寵物清單」為同 group 之混雜列（srcKey 空）。
//act 走真實 user 路徑（搜尋、點樹、點分頁、Pattern D 鍵盤輸入、點按鈕、真滑鼠停留）；assert：UI user-facing 觀察 + DB 副作用 + pixel baseline。多語 eng/cht 皆跑。
//案例管線同 e2e-concurrent：同一個 it 呼叫同一條 runBaselineCase（比對與 REGEN 產製）。REGEN：`npx mocha test/e2e-external.test.mjs --baseline [--grep …]`。
//
import assert from 'assert'
import path from 'path'
import {
    startServersOnce,
    captureStableWithBox,
    waitUntilExist,
    typeIntoInput,
    gotoApiWorkspace,
    treePanel,
    resetToBaseSeed,
    woItems,
    launchBrowser,
    genTempSettings,
    restartBackend,
    REGEN
} from './tools/e2e-setup.mjs'
import { runBaselineCase, createBaselineGate, openCasePage, itemsUnionBox } from './tools/e2eLib.mjs'
import { T, fieldRowBox, searchInput, waitSaveModal, clickModalOk, dbRow, otherImport, installRpcCapture } from './tools/e2eEditHelpers.mjs'
import { fieldsExternal } from '../src/schema/contracts/apis.mjs'


let FLOW = 'ext'
let LANGS = ['eng', 'cht']

let pathOf = (lang, key) => path.resolve('test', 'pics', FLOW, `${FLOW}-${lang}-${key}.png`)

let NAME_A = '取得API清單' //前置後為外部列（進站預設選取）
let NAME_B = '取得寵物清單' //前置後為混雜列
let NAME_C = '取得貓咪清單' //後台列（改入外部 group 之對象）
let GROUP = 'ext-demo'
let SRC_KEY = 'ext-key-1'

//畫面文字（逐字取自 server/procLang.mjs; {group}＝ext-demo）
let L = {
    eng: {
        newApi: 'New API',
        confirmDel: 'Are you sure you want to delete this API?',
        lbl: { name: 'Name', description: 'Description', url: 'API url', method: 'Method', version: 'Version', group: 'Group', levels: 'Levels', keywords: 'Keywords', state: 'State', order: 'Order', tokens: 'Tokens', testBaseUrl: 'Test base URL', contentType: 'Content type', mdInput: 'Input', inputExample: 'Input example', mdOutput: 'Output', outputExample: 'Output example' },
        notice: 'is imported from external source "ext-demo"',
        lockTip: 'Imported from external source "ext-demo". Read-only here.',
        delTip: 'Imported from an external source, so it cannot be deleted here.',
        groupNoAdd: 'Group "ext-demo" is managed by an external source. APIs cannot be added to it or moved into it here.',
        saveDenied: 'Not saved: this group is managed by an external source',
        rejectChanged: 'Not saved: this API is imported from an external source',
        mixedNotice: 'Group "ext-demo" is managed by an external source and this API has no source key',
        mixedTip: 'Group "ext-demo" is managed by an external source and this API has no source key, so the next import removes it',
    },
    cht: {
        newApi: '新增API',
        confirmDel: '確定要刪除此API？',
        lbl: { name: '名稱', description: '說明', url: 'API網址', method: '方法', version: '版本', group: '群組', levels: '所屬階層', keywords: '關鍵字', state: '狀態', order: '順序', tokens: '授權金鑰', testBaseUrl: '測試基底網址', contentType: '內容類型', mdInput: '輸入參數資訊或結構', inputExample: '輸入範例', mdOutput: '回傳數據結構', outputExample: '回傳數據範例' },
        notice: '由外部來源「ext-demo」匯入',
        lockTip: '由外部來源「ext-demo」匯入，於此為唯讀。',
        delTip: '由外部來源匯入，不可在此刪除。',
        groupNoAdd: '群組「ext-demo」由外部來源管理，不可在此新增 API 或把 API 改入。',
        saveDenied: '未儲存：此群組由外部來源管理',
        rejectChanged: '未儲存：此 API 由外部來源匯入',
        mixedNotice: '群組「ext-demo」由外部來源管理，而此 API 無來源鍵',
        mixedTip: '群組「ext-demo」由外部來源管理，而此 API 無來源鍵，下次匯入若未以其 id 列入，它會被移除',
    },
}


//依 label 全字比對定位編輯表單某欄位列（label 後可接必填星號與鎖頭圖示；不可用子字串: 「Input」會同時命中「Input example」）
let rowOf = (page, label) => page.locator('.bk-row').filter({ has: page.locator('.bk-col-label', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?$`) }) })
let ctlOf = (page, label) => rowOf(page, label).locator('input.bk-input, textarea.bk-textarea').first()

//前置: 直接寫 DB（見檔頭）
async function prepareExt() {
    await resetToBaseSeed()
    let a = await dbRow(NAME_A)
    let b = await dbRow(NAME_B)
    await woItems.apis.save([{ id: a.id, group: GROUP, srcKey: SRC_KEY }, { id: b.id, group: GROUP }])
}

//停留顯示之提示框文字（WTooltip 掛 body 之 .WPopperFix）: 真滑鼠移到目標中心（L2）→ 等提示框出現 → 讀全文 → 移開並等其消失
async function hoverTipText(page, target) {
    let box = await target.boundingBox()
    assert.ok(box, 'hover 目標須在畫面內')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
    let tip = page.locator('.WPopperFix:visible')
    await tip.first().waitFor({ state: 'visible', timeout: 8000 })
    await page.waitForTimeout(300)
    let txt = (await tip.allInnerTexts()).join('\n')
    await page.mouse.move(0, 0, { steps: 4 })
    await waitUntilExist(page, 'tooltip hidden', () => ![...document.querySelectorAll('.WPopperFix')].some((e) => getComputedStyle(e).display !== 'none'), { timeout: 8000 })
    return txt
}

async function openEdit(page, lang) {
    await page.getByText(T[lang].edit, { exact: true }).first().click({ timeout: 8000 })
    await ctlOf(page, L[lang].lbl.name).waitFor({ state: 'visible', timeout: 8000 })
}

//以搜尋把目標帶進視野後點樹狀清單列（使用者路徑: 搜尋 → 點列）
async function pickByName(page, lang, name) {
    await typeIntoInput(page, searchInput(page, lang), name)
    await page.getByText(name, { exact: true }).first().click({ timeout: 8000 })
    await page.waitForTimeout(300)
}

//樹狀清單中含指定標記之列（列為 inline style cursor:pointer 之 flex 容器）
let treeRowWith = (page, kind) => treePanel(page).locator('div[style*="cursor: pointer"]').filter({ has: page.locator(`[data-ext-mark="${kind}"]`) })


// ===================================================================
// 案例流程（比對端與 REGEN 產製端共用；截圖收進 shots { 圖鍵: buf }，斷言在截圖前後當場跑）
// ===================================================================

//E2E-013 真實 user path：①開 /?token=sys（進站選取「取得API清單」＝外部列）②樹狀清單列旁有鎖頭，停留顯示說明 ③點「編輯」分頁：上方出現唯讀說明、欄位唯讀 ④鍵盤輸入名稱欄無效
//⑤刪除鈕停用、停留顯示說明 ⑥於權杖欄輸入並儲存 → 成功，外部擁有欄位不變
async function runE2E013(page, lang) {
    let shots = {}
    let t = L[lang]
    await gotoApiWorkspace(page, lang)
    let before = await dbRow(NAME_A)
    assert.strictEqual(before.srcKey, SRC_KEY)

    //步驟1：樹狀清單——只有外部列有鎖頭（混雜列另有警告，見 E2E-015）；停留顯示說明
    await treeRowWith(page, 'lock').first().waitFor({ state: 'visible', timeout: 10000 })
    assert.strictEqual(await treePanel(page).locator('[data-ext-mark="lock"]').count(), 1, '只有外部列（1 列）顯示鎖頭')
    assert.ok((await hoverTipText(page, treePanel(page).locator('[data-ext-mark="lock"]').first())).includes(t.lockTip), '鎖頭停留顯示「由外部來源匯入，於此為唯讀」')
    //結果: 外部列旁出現鎖頭(框住該樹狀清單列)
    shots['E2E-013-1-tree-lock'] = await captureStableWithBox(page, itemsUnionBox(treeRowWith(page, 'lock').first(), { fit: true }))

    //步驟2：點「編輯」分頁 → 上方出現唯讀說明
    await openEdit(page, lang)
    let banner = page.locator('.bk-ext:not(.bk-ext-warn)')
    await banner.first().waitFor({ state: 'visible', timeout: 8000 })
    assert.ok((await banner.first().innerText()).includes(t.notice), '說明含來源 group')
    assert.strictEqual(await page.locator('.bk-ext-warn').count(), 0, '外部列不顯示混雜警告')
    //結果: 編輯頁上方出現唯讀說明(框住說明整顆)
    shots['E2E-013-2-notice'] = await captureStableWithBox(page, itemsUnionBox(banner.first(), { fit: true }))

    //assert: 群組與外部來源提供之欄位唯讀（13 個輸入框＋方法唯讀框）；權杖與測試設定可編輯
    let lb = t.lbl
    for (let key of ['name', 'description', 'url', 'version', 'group', 'levels', 'keywords', 'state', 'order', 'mdInput', 'inputExample', 'mdOutput', 'outputExample']) {
        let ro = await ctlOf(page, lb[key]).getAttribute('readonly')
        assert.notStrictEqual(ro, null, `${lb[key]} 欄應為唯讀`)
        assert.strictEqual(await rowOf(page, lb[key]).locator('[data-ext-mark="lock"]').count(), 1, `${lb[key]} 欄標籤旁有鎖頭`)
    }
    assert.strictEqual((await page.locator('[data-ro-field="method"]').innerText()).trim(), (before.method || '').toUpperCase(), '方法以唯讀框顯示')
    assert.strictEqual(await rowOf(page, lb.method).locator('[data-ext-mark="lock"]').count(), 1)
    for (let key of ['tokens', 'testBaseUrl', 'contentType']) {
        assert.strictEqual(await ctlOf(page, lb[key]).getAttribute('readonly'), null, `${lb[key]} 欄可編輯`)
        assert.strictEqual(await rowOf(page, lb[key]).locator('[data-ext-mark="lock"]').count(), 0, `${lb[key]} 欄無鎖頭`)
    }
    //欄位標籤旁鎖頭停留顯示說明
    assert.ok((await hoverTipText(page, rowOf(page, lb.name).locator('[data-ext-mark="lock"]').first())).includes(t.lockTip))

    //步驟3：鍵盤輸入唯讀欄位無效（L1 真鍵盤；不使用 fill）
    let nameCtl = ctlOf(page, lb.name)
    await nameCtl.click()
    await page.keyboard.type('zzz-typed')
    assert.strictEqual(await nameCtl.inputValue(), NAME_A, '唯讀欄位鍵盤輸入無效')
    //結果: 名稱欄仍為原值且為唯讀樣式(框住名稱欄整列)
    shots['E2E-013-3-readonly'] = await captureStableWithBox(page, fieldRowBox(rowOf(page, lb.name)))

    //步驟4：刪除鈕停用，停留顯示說明；點擊無反應（不開確認框）
    let delBtn = page.locator('button[data-delete-locked="y"]')
    await delBtn.scrollIntoViewIfNeeded()
    assert.ok(await delBtn.isDisabled(), '刪除鈕停用')
    assert.strictEqual(await page.locator('button.btn-delete:not([disabled])').count(), 0, '無可用之刪除鈕')
    assert.ok((await hoverTipText(page, delBtn)).includes(t.delTip), '刪除鈕停留顯示「由外部來源匯入，不可在此刪除」')
    let box = await delBtn.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(500)
    assert.ok(!(await page.evaluate(() => document.body.innerText || '')).includes(t.confirmDel), '點擊停用之刪除鈕不開確認框')
    assert.ok(await dbRow(NAME_A), '點擊停用之刪除鈕後 DB 仍有該列')
    //結果: 刪除鈕呈停用外觀(框住刪除鈕)
    shots['E2E-013-4-delete-off'] = await captureStableWithBox(page, itemsUnionBox(delBtn, { fit: true }))

    //步驟5：權杖欄輸入 → 儲存 → 成功；外部擁有欄位／srcKey／group 不變，權杖寫入
    await typeIntoInput(page, ctlOf(page, lb.tokens), 'tok-ext-1')
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let after = await dbRow(NAME_A)
    assert.strictEqual(after.tokens, 'tok-ext-1', '權杖（本系統擁有欄位）已儲存')
    for (let f of ['name', 'description', 'url', 'method', 'version', 'group', 'levels', 'keywords', 'state', 'order', 'creator', 'dataSource', 'mdInputParams', 'inputExample', 'mdOutputParams', 'outputExample', 'srcKey', 'id']) {
        assert.deepStrictEqual(after[f], before[f], `${f} 不變`)
    }
    return shots
}

//E2E-014 真實 user path：①點「新增API」②填名稱、網址 ③群組欄輸入外部管理之 group → 群組欄下方即時提示 ④點儲存 → 被擋（不送出，DB 不新增）⑤群組改為其他值 → 提示消失，儲存成功
//⑥（既有 API 改入）搜尋並點「取得貓咪清單」→ 編輯 → 群組改成外部管理之 group → 提示、儲存被擋，DB 不變
async function runE2E014(page, lang) {
    let shots = {}
    let t = L[lang]
    let lb = t.lbl
    await gotoApiWorkspace(page, lang)
    let newName = `E2E新增-${lang}`
    let n0 = (await woItems.apis.select()).length

    //步驟1：新增 API 並於群組欄輸入外部管理之 group
    await page.getByText(t.newApi, { exact: false }).first().click({ timeout: 8000 })
    await ctlOf(page, lb.name).waitFor({ state: 'visible', timeout: 8000 })
    await typeIntoInput(page, ctlOf(page, lb.name), newName)
    await typeIntoInput(page, ctlOf(page, lb.url), 'http://localhost:11005/e2eExt')
    await typeIntoInput(page, ctlOf(page, lb.group), GROUP)
    let hint = rowOf(page, lb.group).locator('.bk-err').filter({ hasText: t.groupNoAdd })
    await hint.first().waitFor({ state: 'visible', timeout: 8000 })
    //結果: 群組欄下方出現即時提示(框住群組欄整列，含提示)
    shots['E2E-014-1-group-hint'] = await captureStableWithBox(page, fieldRowBox(rowOf(page, lb.group)))

    //步驟2：點儲存 → 被擋（不送出請求、不出現成功訊息、DB 不新增）
    let readSent = await installRpcCapture(page)
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    let errSave = page.locator('.bk-err').filter({ hasText: t.saveDenied })
    await errSave.first().waitFor({ state: 'visible', timeout: 8000 })
    await page.waitForTimeout(500)
    assert.strictEqual((await readSent()).length, 0, '前端已知該 group 為外部管理，不送出 saveApi')
    assert.ok(!(await page.evaluate(() => document.body.innerText || '')).includes(T[lang].saved), '被擋時不應出現「已儲存」')
    assert.strictEqual((await woItems.apis.select()).length, n0, 'DB 筆數不變（零寫入）')
    assert.ok(!(await dbRow(newName)), 'DB 無該新增列')
    //結果: 儲存鈕上方出現被擋訊息(框住該行紅字)
    shots['E2E-014-2-blocked'] = await captureStableWithBox(page, itemsUnionBox(errSave.first(), { fit: true }))

    //步驟3：群組改為其他值 → 提示消失 → 儲存成功
    await typeIntoInput(page, ctlOf(page, lb.group), 'ext-free')
    await waitUntilExist(page, 'hint gone', () => !document.querySelector('.bk-col-field .bk-err'), { timeout: 8000 })
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let saved = await dbRow(newName)
    assert.ok(saved, '改用其他群組後儲存成功')
    assert.strictEqual(saved.group, 'ext-free')
    assert.strictEqual(saved.srcKey, '', '後台新增之列 srcKey 為空')

    //步驟4：既有 API 改入外部管理 group（搜尋 → 點列 → 編輯 → 改群組）→ 提示、儲存被擋
    let rowC = await dbRow(NAME_C)
    await pickByName(page, lang, NAME_C)
    await openEdit(page, lang)
    await typeIntoInput(page, ctlOf(page, lb.group), GROUP)
    await rowOf(page, lb.group).locator('.bk-err').filter({ hasText: t.groupNoAdd }).first().waitFor({ state: 'visible', timeout: 8000 })
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await page.locator('.bk-err').filter({ hasText: t.saveDenied }).first().waitFor({ state: 'visible', timeout: 8000 })
    assert.deepStrictEqual((await dbRow(NAME_C)).group, rowC.group, '既有 API 之群組未被改入')
    return shots
}

//E2E-015 真實 user path：①搜尋並點「取得寵物清單」（外部管理 group 內無來源鍵之混雜列）②樹狀清單列旁有警告，停留顯示「下次匯入會被移除」③點「編輯」分頁：上方警告、欄位可編輯、刪除鈕可用 ④修改說明並儲存 → 成功
async function runE2E015(page, lang) {
    let shots = {}
    let t = L[lang]
    let lb = t.lbl
    await gotoApiWorkspace(page, lang)
    await pickByName(page, lang, NAME_B)

    //步驟1：樹狀清單——混雜列旁有警告
    await treeRowWith(page, 'warn').first().waitFor({ state: 'visible', timeout: 10000 })
    assert.strictEqual(await treePanel(page).locator('[data-ext-mark="warn"]').count(), 1)
    assert.ok((await hoverTipText(page, treePanel(page).locator('[data-ext-mark="warn"]').first())).includes(t.mixedTip), '警告停留顯示下次匯入之行為')
    //結果: 混雜列旁出現警告(框住該樹狀清單列)
    shots['E2E-015-1-tree-warn'] = await captureStableWithBox(page, itemsUnionBox(treeRowWith(page, 'warn').first(), { fit: true }))

    //步驟2：點「編輯」分頁 → 上方警告；不鎖
    await openEdit(page, lang)
    let banner = page.locator('.bk-ext-warn')
    await banner.first().waitFor({ state: 'visible', timeout: 8000 })
    assert.ok((await banner.first().innerText()).includes(t.mixedNotice))
    assert.strictEqual(await page.locator('.bk-ext:not(.bk-ext-warn)').count(), 0, '混雜列不顯示唯讀說明')
    assert.strictEqual(await page.locator('input[readonly], textarea[readonly]').count(), 0, '混雜列欄位皆可編輯')
    assert.strictEqual(await page.locator('[data-ro-field="method"]').count(), 0)
    assert.strictEqual(await page.locator('button[data-delete-locked]').count(), 0, '刪除鈕可用')
    assert.strictEqual(await page.locator('button.btn-delete:not([disabled])').count(), 1)
    //結果: 編輯頁上方出現警告(框住警告整顆)
    shots['E2E-015-2-notice'] = await captureStableWithBox(page, itemsUnionBox(banner.first(), { fit: true }))

    //步驟3：改說明並儲存 → 成功（群組不變）
    let rowB = await dbRow(NAME_B)
    let newDesc = `混雜列說明-${lang}`
    await typeIntoInput(page, ctlOf(page, lb.description), newDesc)
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let saved = await dbRow(NAME_B)
    assert.strictEqual(saved.description, newDesc)
    assert.strictEqual(saved.group, rowB.group, '群組不變')
    assert.strictEqual(saved.srcKey, '')
    return shots
}

//E2E-016 真實 user path（後端以 lockExternalRows:'n' 重啟）：①開 /?token=sys（進站選取「取得API清單」，DB 仍為外部列）②樹狀清單無鎖頭／警告 ③「編輯」分頁無說明、欄位可編輯 ④改名稱並儲存 → 成功 ⑤新增 API 於 ext-demo → 成功
async function runE2E016(page, lang) {
    let shots = {}
    let t = L[lang]
    let lb = t.lbl
    await gotoApiWorkspace(page, lang)
    assert.strictEqual((await dbRow(NAME_A)).srcKey, SRC_KEY, '前置: 仍為外部列')

    //步驟1：樹狀清單無任何外部標記
    assert.strictEqual(await page.locator('[data-ext-mark]').count(), 0, `lockExternalRows:'n' 時不顯示鎖頭與警告`)

    //步驟2：點「編輯」分頁 → 無說明、欄位可編輯、刪除鈕可用
    await openEdit(page, lang)
    assert.strictEqual(await page.locator('.bk-ext').count(), 0)
    assert.strictEqual(await page.locator('input[readonly], textarea[readonly]').count(), 0)
    assert.strictEqual(await page.locator('button[data-delete-locked]').count(), 0)
    assert.strictEqual(await page.locator('button.btn-delete:not([disabled])').count(), 1)
    //結果: 名稱欄呈可編輯樣式、無鎖頭(框住名稱欄整列)
    shots['E2E-016-1-editable'] = await captureStableWithBox(page, fieldRowBox(rowOf(page, lb.name)))

    //步驟3：改名稱並儲存 → 成功（升版前行為: 外部列後台可改）
    let renamed = `n模式改名-${lang}`
    await typeIntoInput(page, ctlOf(page, lb.name), renamed)
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    assert.ok(await dbRow(renamed), 'n 模式下外部列名稱可由後台改')

    //步驟4：新增 API 於外部管理 group → 成功（不被擋）
    let newName = `n模式新增-${lang}`
    await page.getByText(t.newApi, { exact: false }).first().click({ timeout: 8000 })
    await ctlOf(page, lb.name).waitFor({ state: 'visible', timeout: 8000 })
    await typeIntoInput(page, ctlOf(page, lb.name), newName)
    await typeIntoInput(page, ctlOf(page, lb.url), 'http://localhost:11005/e2eN')
    await typeIntoInput(page, ctlOf(page, lb.group), GROUP)
    assert.strictEqual(await rowOf(page, lb.group).locator('.bk-err').count(), 0, 'n 模式不顯示群組提示')
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    assert.strictEqual((await dbRow(newName)).group, GROUP)
    return shots
}

//E2E-017 前置（在 prepareExt 之上）: 「取得貓咪清單」為後台列（srcKey 空）、group 改為專用之 promo-group（匯入該 group 不動其他列）
async function prepareExtPromo() {
    await prepareExt()
    let c = await dbRow(NAME_C)
    await woItems.apis.save([{ id: c.id, group: 'promo-group' }])
}

//E2E-017 真實 user path：①搜尋並點「取得貓咪清單」（後台列，可編輯）→ 點「編輯」分頁 → 於權杖欄輸入（未存）②（外部應用以等於該列 id 之 srcKey、外部欄位完全相同地匯入＝一次性遷移〔I15〕：只補 srcKey，推播之列摘要不變）
//③畫面轉為外部列（上方出現唯讀說明、欄位轉唯讀），權杖草稿保留 ④點儲存 → 成功（本系統擁有欄位可存；舊畫面之空 srcKey 不被誤判為改身分欄）
async function runE2E017(page, lang) {
    let shots = {}
    let t = L[lang]
    let lb = t.lbl
    await gotoApiWorkspace(page, lang)
    let rowC = await dbRow(NAME_C)
    assert.strictEqual(rowC.srcKey, '', '前置: 後台列')
    await pickByName(page, lang, NAME_C)
    await openEdit(page, lang)
    assert.strictEqual(await page.locator('.bk-ext').count(), 0, '編輯當下為後台列: 無說明')
    await typeIntoInput(page, ctlOf(page, lb.tokens), 'tok-promo')

    //步驟2：外部應用匯入（srcKey 等於該列既有之 id＝一次性遷移，外部欄位與庫內完全相同；不得帶 id）→ 該列補 srcKey = id
    let batch = { srcKey: rowC.id }
    for (let f of fieldsExternal) {
        if (f !== 'group') {
            batch[f] = rowC[f]
        }
    }
    let r = await otherImport('promo-group', [batch])
    assert.strictEqual(r.nUpdate, 0, '外部欄位相同: 只補 srcKey，不算修改')
    assert.strictEqual((await dbRow(NAME_C)).srcKey, rowC.id)

    //步驟3：畫面轉為外部列（store 推播更新 item）；摘要不變 → 不出現「已被他人更新」提示；權杖草稿保留
    await page.locator('.bk-ext:not(.bk-ext-warn)').first().waitFor({ state: 'visible', timeout: 15000 })
    assert.notStrictEqual(await ctlOf(page, lb.name).getAttribute('readonly'), null, '名稱欄轉為唯讀')
    assert.strictEqual(await page.locator('.bk-stale').count(), 0, '摘要未變: 不出現「已被他人更新」提示')
    assert.strictEqual(await ctlOf(page, lb.tokens).inputValue(), 'tok-promo', '權杖草稿保留')

    //步驟4：點儲存 → 成功（表單帶載入當時之空 srcKey，不得被誤判為改身分欄）
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let saved = await dbRow(NAME_C)
    assert.strictEqual(saved.tokens, 'tok-promo', '權杖已儲存')
    assert.strictEqual(saved.srcKey, rowC.id, 'srcKey 仍為匯入補上之值')
    for (let f of fieldsExternal) {
        assert.deepStrictEqual(saved[f], f === 'group' ? 'promo-group' : rowC[f], `${f} 不變`)
    }
    return shots
}

//E2E-018 真實 user path：①搜尋並點「取得貓咪清單」（後台列）→「編輯」分頁 → 於說明欄輸入草稿（外部擁有欄位，後台列時可改；未存）②（外部應用只補 srcKey 地匯入）③畫面轉為外部列，說明欄轉唯讀但保留草稿
//④點儲存 → 被拒（草稿含外部擁有欄位之修改）：出現被拒訊息與「已被他人更新」提示＋重新載入鈕，DB 說明不變 ⑤點重新載入 → 表單為庫內值、提示消失 ⑥於權杖欄輸入並儲存 → 成功
async function runE2E018(page, lang) {
    let shots = {}
    let t = L[lang]
    let lb = t.lbl
    await gotoApiWorkspace(page, lang)
    let rowC = await dbRow(NAME_C)
    await pickByName(page, lang, NAME_C)
    await openEdit(page, lang)
    await typeIntoInput(page, ctlOf(page, lb.description), 'draft-before-promotion')

    //步驟2：外部應用匯入（srcKey 等於該列既有之 id＝一次性遷移、外部欄位與庫內相同；不得帶 id）→ 補 srcKey
    let batch = { srcKey: rowC.id }
    for (let f of fieldsExternal) {
        if (f !== 'group') {
            batch[f] = rowC[f]
        }
    }
    await otherImport('promo-group', [batch])
    await page.locator('.bk-ext:not(.bk-ext-warn)').first().waitFor({ state: 'visible', timeout: 15000 })
    assert.notStrictEqual(await ctlOf(page, lb.description).getAttribute('readonly'), null, '說明欄轉為唯讀')
    assert.strictEqual(await ctlOf(page, lb.description).inputValue(), 'draft-before-promotion', '草稿保留')

    //步驟3：點儲存 → 被拒（零寫入）：被拒訊息＋提示與重新載入鈕
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await page.locator('.bk-err').filter({ hasText: t.rejectChanged }).first().waitFor({ state: 'visible', timeout: 10000 })
    await page.locator('.bk-stale button').first().waitFor({ state: 'visible', timeout: 10000 })
    assert.strictEqual((await dbRow(NAME_C)).description, rowC.description, '零寫入: 庫內說明不變')

    //步驟4：點重新載入 → 表單取庫內值、提示消失
    await page.locator('.bk-stale button').first().click({ timeout: 8000 })
    await waitUntilExist(page, 'banner gone', () => !document.querySelector('.bk-stale'), { timeout: 8000 })
    assert.strictEqual(await ctlOf(page, lb.description).inputValue(), rowC.description, '重新載入後為庫內值')

    //步驟5：權杖欄輸入並儲存 → 成功
    await typeIntoInput(page, ctlOf(page, lb.tokens), 'tok-after-reload')
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let saved = await dbRow(NAME_C)
    assert.strictEqual(saved.tokens, 'tok-after-reload')
    assert.strictEqual(saved.description, rowC.description)
    return shots
}


// ===================================================================
// 案例宣告與案例管線（比對端與 REGEN 產製端共用）
// ===================================================================

let casesY = [
    {
        name: 'E2E-013-external-row',
        title: (lang) => `E2E-013 [${lang}] 外部列: 鎖頭、唯讀欄位、刪除鈕停用，權杖可存`,
        run: runE2E013,
        stages: ['E2E-013-1-tree-lock', 'E2E-013-2-notice', 'E2E-013-3-readonly', 'E2E-013-4-delete-off'],
    },
    {
        name: 'E2E-014-external-group',
        title: (lang) => `E2E-014 [${lang}] 外部管理 group: 新增與改入被擋，改用其他 group 可存`,
        run: runE2E014,
        stages: ['E2E-014-1-group-hint', 'E2E-014-2-blocked'],
    },
    {
        name: 'E2E-015-mixed-row',
        title: (lang) => `E2E-015 [${lang}] 混雜列: 警告下次匯入會移除，但不鎖`,
        run: runE2E015,
        stages: ['E2E-015-1-tree-warn', 'E2E-015-2-notice'],
    },
    {
        name: 'E2E-017-promoted-while-editing',
        title: (lang) => `E2E-017 [${lang}] 編輯中被匯入補上來源鍵，權杖仍可儲存`,
        run: runE2E017,
        stages: [],
        allowEmpty: true, //無獨特視覺終態(成功 modal 與 E2E-001 同款、唯讀說明見 E2E-013)，以語意斷言守
        prepare: prepareExtPromo,
    },
    {
        name: 'E2E-018-promoted-with-draft',
        title: (lang) => `E2E-018 [${lang}] 編輯中被匯入補上來源鍵且草稿含外部欄位修改，被拒並可重新載入`,
        run: runE2E018,
        stages: [],
        allowEmpty: true, //以語意斷言守(被拒訊息、提示與重新載入鈕之標準圖樣式同 E2E-007)
        prepare: prepareExtPromo,
    },
]
let casesN = [
    {
        name: 'E2E-016-unlocked',
        title: (lang) => `E2E-016 [${lang}] lockExternalRows:'n' 回到升版前行為`,
        run: runE2E016,
        stages: ['E2E-016-1-editable'],
    },
]

let gate = REGEN ? createBaselineGate({ langs: LANGS, cases: [...casesY, ...casesN] }) : null
if (gate) {
    after(function() {
        gate.finalize()
    })
}

//單一案例管線（比對端與 REGEN 產製端同一條）：prepare（DB 重置為 base seed + 前置）→ 全新 browser（1440×900）→ run → 全部斷言通過後才寫檔／比對 → finally 關 browser
async function runCase(lang, c) {
    return await runBaselineCase({
        mode: REGEN ? 'regen' : 'compare',
        lang,
        name: c.name,
        run: c.run,
        stages: c.stages,
        compareOnly: !!c.compareOnly,
        allowEmpty: !!c.allowEmpty,
        launch: launchBrowser,
        openPage: (browser) => openCasePage(browser, { contextOptions: { viewport: { width: 1440, height: 900 } } }),
        prepare: c.prepare || prepareExt,
        pathOf,
        labelOf: (lg, key) => `${FLOW}-${lg}-${key}`,
        gate,
    })
}


describe('e2e-external (API 編輯: 外部列受保護)', function() {
    this.timeout(240000)

    before(async function() {
        this.timeout(180000)
        await startServersOnce()
    })

    after(async function() {
        await resetToBaseSeed() //還原 base seed 供非 e2e 時段使用
    })

    for (let lang of LANGS) {
        for (let c of casesY) {
            it(c.title(lang), async function() {
                await runCase(lang, c)
            })
        }
    }

    describe(`lockExternalRows:'n'（後端以臨時設定檔重啟，結束後還原預設）`, function() {
        this.timeout(240000)

        before(async function() {
            this.timeout(180000)
            await restartBackend(genTempSettings({ lockExternalRows: 'n' }))
        })

        after(async function() {
            this.timeout(180000)
            await restartBackend('./settings.json') //還原預設設定之後端
        })

        for (let lang of LANGS) {
            for (let c of casesN) {
                it(c.title(lang), async function() {
                    await runCase(lang, c)
                })
            }
        }

    })

})
