//e2e：API 編輯之多人同時編輯——草稿保護與逐列基準（原則 10；規格 C:\opensrcOper\dspec\多人同時編輯之寫入契約.md 第 8 節；rulebook_concurrency.md §3、§7.3；spec/流程_編輯API.md E2E-006～E2E-012；ADR-043）
//
//重要流程（spec bullets）：
//- E2E-006：編輯中他人更新「無關」之 API → 草稿與基準不變、無提示（P1）。
//- E2E-007：編輯中他人更新「同一筆」→ 草稿保留並提示；儲存被拒（零寫入）；按「重新載入」取最新後可存（P2、V1、V11）。
//- E2E-008：編輯中原 API 被他人刪除 → 停留原畫面（不換成另一筆）並提示；儲存得「已不存在」，不復活（P3、V6）。
//- E2E-009：編輯中於左樹搜尋 → 選取與搜尋脫鉤，不換筆、草稿保留；存檔寫回原 API（P4、A6）。
//- E2E-010：無未存修改時他人更新同一筆 → 表單自動重建；前端算之基準（經實際傳輸路徑）等於伺服端新鮮讀取所算；存檔後再開不被自己的基準誤擋（V10、規格 §8 新基準取自伺服端）。
//- E2E-011：他人改了又改回載入時之內容 → 提示撤除、草稿保留、舊基準仍可存（基準全程凍結為載入快照）。
//- E2E-012：既有列之載入資料無法自算基準（舊資料含過深巢狀值）→ 禁止存檔、不送出 saveApi（不降級為不帶基準）。
//- 另：E2E-007 核對被拒存檔實際送出之基準＝載入快照（基準凍結）；E2E-008 末段核對原列被外部匯入還原後拒收狀態解除。
//- E2E-019～E2E-022（api-run03，規格 §8「存檔成功後之新基準取自伺服端，且須立即取得」）：以 installPushHold 攔下推播使「存檔成功 → 推播未到」必然發生——
//  E2E-019：存檔成功後（推播未到）左樹立即反映、立即再開編輯再存不被自己上一次之存檔誤擋；其後抵達之同內容推播不顯示「已被更新」、不重建表單。
//  E2E-020：他人在我存檔之後改了同一列 → 我（以存檔回傳之列為基準）再存仍被拒（先動先贏不被削弱）。
//  E2E-021：刪除成功後（推播未到）該列立即自左樹移除。
//  E2E-022：新增成功後（推播未到）新列立即出現（含伺服端配的新 id），立即開編輯改名再存成功。
//  E2E-023：在我存檔之前由伺服端讀取、卻在我的回應之後才抵達之較舊整表快照，不退回我剛存的內容（左樹、再開編輯、再存皆正常）。
//
//他人（第二位使用者）以與瀏覽器同一條資料通道呼叫 kpFunExt（e2eEditHelpers.otherSave／otherDelete），後端因此推播至已開啟之頁面。
//act 走真實 user 路徑（點分頁、Pattern D 鍵盤輸入、點按鈕）；assert：UI user-facing 觀察 + DB 副作用 + pixel baseline。多語 eng/cht 皆跑。
//案例管線同 e2e-edit：同一個 it 呼叫同一條 runBaselineCase（比對與 REGEN 產製）。REGEN：`npx mocha test/e2e-concurrent.test.mjs --baseline [--grep …]`。
//
import assert from 'assert'
import path from 'path'
import { buildBaseline } from 'w-serv-orm/src/baseline.mjs'
import contract from '../src/schema/contracts/apis.mjs'
import {
    startServersOnce,
    captureStableWithBox,
    waitUntilExist,
    typeIntoInput,
    gotoApiWorkspace,
    resetToBaseSeed,
    woItems,
    launchBrowser,
    REGEN
} from './tools/e2e-setup.mjs'
import { runBaselineCase, createBaselineGate, openCasePage, itemsUnionBox } from './tools/e2eLib.mjs'
import { T, fieldRow, fieldInput, fieldTextarea, fieldRowBox, searchInput, staleBanner, waitStaleBanner, waitSaveModal, clickModalOk, dbRow, otherSave, otherDelete, otherImport, installRpcCapture, installPushHold } from './tools/e2eEditHelpers.mjs'


let FLOW = 'conc'
let LANGS = ['eng', 'cht']

//標準圖路徑：test/pics/<flow>/<flow>-<lang>-<圖鍵>.png（圖鍵＝原檔名去掉 `<flow>-<lang>-` 與 `.png`）
let pathOf = (lang, key) => path.resolve('test', 'pics', FLOW, `${FLOW}-${lang}-${key}.png`)

let NAME_A = '取得API清單' //base seed 第一筆（進站預設選取）
let NAME_B = '取得寵物清單' //另一筆（他人修改／刪除之對象）


async function openEdit(page, lang) {
    await page.getByText(T[lang].edit, { exact: true }).first().click({ timeout: 8000 })
    let nameInp = fieldInput(page, T[lang].lblName)
    await nameInp.waitFor({ state: 'visible', timeout: 8000 })
    return nameInp
}

//等左樹出現指定文字（確認推播已抵達瀏覽器之 store）
async function waitTreeText(page, text) {
    await waitUntilExist(page, `tree shows ${text}`, (s) => (document.body.innerText || '').includes(s), { timeout: 15000, arg: text })
    await page.waitForTimeout(300)
}


// ===================================================================
// 案例流程（比對端與 REGEN 產製端共用；截圖收進 shots { 圖鍵: buf }，斷言在截圖前後當場跑）
// ===================================================================

//E2E-006 真實 user path：①開 /?token=sys ②點「編輯」分頁（取得API清單）③Name 欄輸入草稿 ④（他人把「取得寵物清單」改名）⑤草稿仍在、無提示 ⑥儲存 → DB 寫入草稿且他人之改名不被覆蓋
async function runE2E006(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    let draft = `草稿-取得API清單-${lang}`
    let nameInp = await openEdit(page, lang)
    let nameRow = fieldRow(page, T[lang].lblName)

    //步驟1：Name 欄輸入草稿（未存）
    await typeIntoInput(page, nameInp, draft)
    //結果: Name 欄顯示草稿(框住 Name 欄整列)
    shots['E2E-006-1-draft'] = await captureStableWithBox(page, fieldRowBox(nameRow))

    //步驟2：他人把另一筆（取得寵物清單）改名 → 推播抵達（左樹出現新名稱）
    let otherName = `${NAME_B}-他人改`
    await otherSave(NAME_B, { name: otherName })
    await waitTreeText(page, otherName)

    //assert UI（規格 §8 草稿保護: 無關列之推播不重建編輯中之內容）
    assert.strictEqual(await nameInp.inputValue(), draft, '他人更新無關 API 後，Name 欄草稿應保留')
    assert.strictEqual(await staleBanner(page).count(), 0, '無關列之更新不應出現提示')
    //結果: 草稿仍在(框住 Name 欄整列)；左樹已含他人改名（語意斷言守）
    shots['E2E-006-2-kept'] = await captureStableWithBox(page, fieldRowBox(nameRow))

    //步驟3：儲存 → 成功；DB 寫入草稿，他人之改名不被覆蓋
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    assert.ok(await dbRow(draft), 'DB 應有草稿名之 API')
    assert.ok(!(await dbRow(NAME_A)), '原名不再存在（原地更新）')
    assert.ok(await dbRow(otherName), '他人之改名仍在（未被本次儲存覆蓋）')
    return shots
}

//E2E-007 真實 user path：①編輯分頁輸入草稿 ②（他人改同一筆之說明）③出現提示（草稿仍在）④儲存 → 被拒、零寫入 ⑤點「重新載入」→ 表單為最新 ⑥再編輯儲存 → 成功
async function runE2E007(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    let draft = `草稿-取得API清單-${lang}`
    let otherDesc = `他人改的說明-${lang}`
    let nameInp = await openEdit(page, lang)
    let nameRow = fieldRow(page, T[lang].lblName)
    let readSent = await installRpcCapture(page)
    let rowLoaded = await dbRow(NAME_A) //開啟編輯時畫面所見之列（尚無他人修改）

    //步驟1：Name 欄輸入草稿
    await typeIntoInput(page, nameInp, draft)
    //結果: Name 欄顯示草稿(框住 Name 欄整列)
    shots['E2E-007-1-draft'] = await captureStableWithBox(page, fieldRowBox(nameRow))

    //步驟2：他人更新同一筆（說明）→ 提示出現（規格 V11: 有草稿時收到推播 → 草稿與基準不變，出現提示）
    await otherSave(NAME_A, { description: otherDesc })
    await waitStaleBanner(page, T[lang].staleChanged)
    assert.strictEqual(await nameInp.inputValue(), draft, '草稿不被推播覆寫')
    assert.ok(await staleBanner(page).locator('button').count() === 1, '提示含「重新載入」鈕')
    assert.notStrictEqual(await fieldTextarea(page, T[lang].lblDescription).inputValue(), otherDesc, '表單其餘欄位亦未被推播覆寫（基準凍結）')
    //結果: 出現「資料已被他人更新」提示(框住提示整顆)
    shots['E2E-007-2-stale'] = await captureStableWithBox(page, itemsUnionBox(staleBanner(page).first(), { fit: true }))

    //步驟3：點儲存 → 被拒（零寫入）、保留草稿、提示重新載入（規格 V1）
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    let errLine = page.locator('.bk-err').filter({ hasText: T[lang].saveStale })
    await errLine.first().waitFor({ state: 'visible', timeout: 10000 })
    assert.strictEqual(await nameInp.inputValue(), draft, '儲存被拒後草稿保留')
    assert.ok(!(await page.evaluate(() => document.body.innerText || '')).includes(T[lang].saved), '被拒時不應出現「已儲存」成功 modal')
    let rowAfter = await dbRow(NAME_A)
    assert.ok(rowAfter, 'DB 仍有原名之 API（零寫入）')
    assert.strictEqual(rowAfter.description, otherDesc, 'DB 維持他人所寫之說明（未被舊畫面回寫）')
    assert.ok(!(await dbRow(draft)), '草稿名未寫入')
    //基準凍結（規格 §8 P2、V11）: 被拒的那次存檔送出之基準仍是「載入時之快照」，不是推播後之新列、也不是含草稿之表單所算
    let sent = await readSent()
    assert.strictEqual(sent.length, 1, '應擷取到 1 次 saveApi 之 RPC 本體')
    assert.deepStrictEqual(sent[0].input.__sysInputArgs__[1].baseline, buildBaseline([rowLoaded], contract), '送出之基準凍結為載入時之快照')
    assert.notDeepStrictEqual(sent[0].input.__sysInputArgs__[1].baseline, buildBaseline([{ ...rowLoaded, name: draft }], contract), '不得以含草稿之表單重算基準（否則任何草稿都不會被擋）')
    assert.notDeepStrictEqual(sent[0].input.__sysInputArgs__[1].baseline, buildBaseline([await dbRow(NAME_A)], contract), '不得以推播後之新列重算基準（否則會靜默蓋掉他人更新）')
    //結果: 儲存鈕上方出現被拒訊息(框住該行紅字)
    shots['E2E-007-3-rejected'] = await captureStableWithBox(page, itemsUnionBox(errLine.first(), { fit: true }))

    //步驟4：點提示上的「重新載入」→ 表單取最新（草稿放棄、說明為他人所寫）、提示消失
    await staleBanner(page).locator('button').first().click({ timeout: 8000 })
    await waitUntilExist(page, 'banner gone', () => !document.querySelector('.bk-stale'), { timeout: 8000 })
    assert.strictEqual(await nameInp.inputValue(), NAME_A, '重新載入後 Name 回到庫內值')
    let descArea = fieldTextarea(page, T[lang].lblDescription)
    assert.strictEqual(await descArea.inputValue(), otherDesc, '重新載入後說明為他人所寫')
    //結果: 說明欄顯示他人所寫內容(框住說明欄整列)
    shots['E2E-007-4-reloaded'] = await captureStableWithBox(page, fieldRowBox(fieldRow(page, T[lang].lblDescription)))

    //步驟5：基準已重新凍結 → 再改 Name 儲存成功
    let newName = `重載後改名-${lang}`
    await typeIntoInput(page, nameInp, newName)
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let renamed = await dbRow(newName)
    assert.ok(renamed, '重新載入後儲存成功')
    assert.strictEqual(renamed.description, otherDesc, '他人所寫之說明保留')
    //重新載入後之新基準取自「重新載入當下之 store 列」（含他人所寫之說明）
    let sent2 = await readSent()
    assert.strictEqual(sent2.length, 2)
    assert.deepStrictEqual(sent2[1].input.__sysInputArgs__[1].baseline, buildBaseline([{ ...renamed, name: NAME_A }], contract), '重新載入後重凍結為最新列之基準')
    return shots
}

//E2E-008 真實 user path：①編輯分頁輸入草稿 ②（他人刪除此 API）③停留原畫面並提示「已被刪除」④儲存 → 已不存在、不復活
async function runE2E008(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    let draft = `草稿-取得API清單-${lang}`
    let nameInp = await openEdit(page, lang)
    let nameRow = fieldRow(page, T[lang].lblName)

    //步驟1：Name 欄輸入草稿
    await typeIntoInput(page, nameInp, draft)
    //結果: Name 欄顯示草稿(框住 Name 欄整列)
    shots['E2E-008-1-draft'] = await captureStableWithBox(page, fieldRowBox(nameRow))

    //步驟2：他人刪除此 API → 停留原畫面（不換成列表第一筆）並提示（規格 §8: 單筆編輯器之原列被刪）
    let rowOrig = await otherDelete(NAME_A)
    await waitStaleBanner(page, T[lang].staleDeleted)
    assert.strictEqual(await nameInp.inputValue(), draft, '原列被刪後仍停留原畫面，草稿保留（不得換成另一筆）')
    assert.strictEqual(await staleBanner(page).locator('button').count(), 0, '已刪除者無法重新載入（不顯示重新載入鈕）')
    //結果: 出現「此 API 已被他人刪除」提示(框住提示整顆)
    shots['E2E-008-2-deleted'] = await captureStableWithBox(page, itemsUnionBox(staleBanner(page).first(), { fit: true }))

    //步驟3：點儲存 → 回「已不存在」，該列不復活（規格 V6）
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await page.locator('.bk-err').filter({ hasText: T[lang].notFound }).first().waitFor({ state: 'visible', timeout: 10000 })
    assert.strictEqual(await nameInp.inputValue(), draft, '被拒後草稿仍保留')
    assert.ok(!(await dbRow(NAME_A)) && !(await dbRow(draft)), 'DB 無原列、無草稿名（已刪之列不復活）')

    //步驟4（外審 sol#13；無標準圖）：外部匯入把該 API 還原（以 id 代替來源鍵，同一 id 重新出現）→ 不再視為已刪除：
    //提示改為「已被他人更新」並可重新載入（先前「已不存在」之拒收狀態一併解除）、草稿仍保留；重新載入後取還原之列
    await otherImport('restored-e2e', [{ id: rowOrig.id, name: rowOrig.name, url: rowOrig.url, method: rowOrig.method }]) //專用範圍: 匯入為該範圍之完整清單, 不動其他群組之列
    await waitStaleBanner(page, T[lang].staleChanged)
    assert.strictEqual(await staleBanner(page).locator('button').count(), 1, '列重新出現後可重新載入（不再卡在已刪除）')
    assert.strictEqual(await nameInp.inputValue(), draft, '草稿仍保留')
    await staleBanner(page).locator('button').first().click({ timeout: 8000 })
    await waitUntilExist(page, 'banner gone', () => !document.querySelector('.bk-stale'), { timeout: 8000 })
    assert.strictEqual(await nameInp.inputValue(), NAME_A, '重新載入後取得還原之列')
    return shots
}

//E2E-009 真實 user path：①編輯分頁輸入草稿 ②於左樹搜尋框輸入 cats ③左樹只剩貓咪、編輯中之內容不變 ④儲存 → 寫回原 API
async function runE2E009(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    let draft = `草稿-取得API清單-${lang}`
    let nameInp = await openEdit(page, lang)
    let nameRow = fieldRow(page, T[lang].lblName)
    await typeIntoInput(page, nameInp, draft)

    //步驟1：於搜尋框輸入 cats（選取與搜尋脫鉤，P4、A6）
    await typeIntoInput(page, searchInput(page, lang), 'cats')
    await waitUntilExist(page, 'tree filtered', () => !(document.body.innerText || '').includes('取得寵物清單'), { timeout: 10000 })
    assert.strictEqual(await nameInp.inputValue(), draft, '搜尋過濾後編輯中之內容不變（不換成搜尋結果第一筆）')
    assert.strictEqual(await staleBanner(page).count(), 0, '搜尋不觸發任何提示')
    //結果: 左樹已過濾，Name 欄仍為草稿(框住 Name 欄整列)
    shots['E2E-009-1-search-kept'] = await captureStableWithBox(page, fieldRowBox(nameRow))

    //步驟2：儲存 → 寫回原 API（取得API清單），貓咪 API 不受影響
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    assert.ok(await dbRow(draft), 'DB 應有草稿名之 API（寫回原 API）')
    assert.ok(!(await dbRow(NAME_A)), '原名不再存在')
    let cats = (await woItems.apis.select()).filter((r) => r.keywords === 'pets;cats')
    assert.strictEqual(cats.length, 4, '貓咪 API 4 筆不受影響')
    assert.ok(cats.every((r) => r.name !== draft))
    return shots
}

//E2E-010 真實 user path：①編輯分頁（無草稿）②（他人改同一筆之說明）③表單自動重建為最新 ④Name 輸入含特殊字元 → 儲存（取 RPC 本體驗基準）→ 再開編輯 → 不改直接儲存不被誤拒
async function runE2E010(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    let otherDesc = `他人改的說明-${lang}`
    let nameInp = await openEdit(page, lang)

    //擷取瀏覽器送出之 saveApi RPC 本體（經實際傳輸路徑之基準; 作法見 e2eEditHelpers.installRpcCapture）
    let readSent = await installRpcCapture(page)
    let seen = 'XHR 本體'

    //步驟1：他人更新同一筆之說明；本頁無未存修改 → 表單照舊重建為最新（不出現提示）
    await otherSave(NAME_A, { description: otherDesc })
    await waitUntilExist(page, 'form refreshed', (s) => {
        let ta = document.querySelector('.bk-row textarea.bk-textarea')
        return !!ta && ta.value === s
    }, { timeout: 15000, arg: otherDesc })
    assert.strictEqual(await staleBanner(page).count(), 0, '無未存修改時不應出現提示')

    //步驟2：Name 輸入含特殊字元（伺服器寫入時 clearXSS 會改寫 a<b → a&lt;b）→ 儲存
    let special = `特殊字元a<b-${lang}`
    await typeIntoInput(page, nameInp, special)
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let sent = await readSent()
    assert.strictEqual(sent.length, 1, `應擷取到 1 次 saveApi 之 RPC 本體（${seen}）`)
    let stored = (await woItems.apis.select()).find((r) => r.name === `特殊字元a&lt;b-${lang}`)
    assert.ok(stored, 'DB 以 clearXSS 改寫後之名稱存放')

    //V10：瀏覽器自算並送出之基準 ＝ 伺服端對「儲存前」之庫內列所算（此處以 DB 還原儲存前之列: 他人改說明後的原列）
    let before = { ...stored, name: NAME_A }
    let args = sent[0].input.__sysInputArgs__
    assert.deepStrictEqual(args[1].baseline, buildBaseline([before], contract), '前端算之基準（經實際傳輸路徑與瀏覽器 bundle）應等於伺服端以庫內列所算')

    //步驟3：再開「編輯」（新基準取自伺服端存檔後之 store 列）→ 不改、直接儲存 → 不被自己的基準誤拒（規格 §8: 不得以送出值當新基準）
    await waitTreeText(page, `特殊字元a&lt;b-${lang}`)
    let nameInp2 = await openEdit(page, lang)
    assert.strictEqual(await nameInp2.inputValue(), `特殊字元a&lt;b-${lang}`, '再開編輯顯示伺服端存放之名稱')
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    assert.strictEqual(await staleBanner(page).count(), 0)
    await clickModalOk(page, lang, T[lang].saved)
    sent = await readSent()
    assert.strictEqual(sent.length, 2, `第二次儲存應再擷取到 1 次（${seen}）`)
    assert.deepStrictEqual(sent[1].input.__sysInputArgs__[1].baseline, buildBaseline([stored], contract), '第二次之基準取自伺服端存放之列')
    return shots
}

//E2E-011 真實 user path：①編輯分頁輸入草稿 ②（他人改同一筆之說明）③出現提示 ④（他人又把說明改回原內容）⑤提示消失、草稿仍在 ⑥儲存 → 成功（載入時之基準仍有效）
async function runE2E011(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    let draft = `草稿-取得API清單-${lang}`
    let otherDesc = `他人改的說明-${lang}`
    let nameInp = await openEdit(page, lang)
    let nameRow = fieldRow(page, T[lang].lblName)
    let readSent = await installRpcCapture(page)
    let rowLoaded = await dbRow(NAME_A)

    //步驟1：Name 欄輸入草稿；他人更新同一筆之說明 → 出現提示
    await typeIntoInput(page, nameInp, draft)
    await otherSave(NAME_A, { description: otherDesc })
    await waitStaleBanner(page, T[lang].staleChanged)
    //結果: 出現「資料已被他人更新」提示(框住提示整顆)
    shots['E2E-011-1-stale'] = await captureStableWithBox(page, itemsUnionBox(staleBanner(page).first(), { fit: true }))

    //步驟2：他人把說明改回原內容 → 該列與載入時之基準相同，提示撤除；草稿保留（規格 §8: 內容回到基準＝無衝突）
    await otherSave(NAME_A, { description: rowLoaded.description })
    await waitUntilExist(page, 'banner gone', () => !document.querySelector('.bk-stale'), { timeout: 15000 })
    assert.strictEqual(await nameInp.inputValue(), draft, '提示撤除後草稿仍保留')
    //結果: 提示消失，Name 欄仍為草稿(框住 Name 欄整列)
    shots['E2E-011-2-cleared'] = await captureStableWithBox(page, fieldRowBox(nameRow))

    //步驟3：儲存 → 成功（基準凍結為載入時之快照，與庫內現況相同）；DB 寫入草稿且說明維持原內容
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitSaveModal(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let saved = await dbRow(draft)
    assert.ok(saved, '儲存成功，DB 有草稿名之 API')
    assert.strictEqual(saved.description, rowLoaded.description, '說明維持（他人改回之內容）')
    let sent = await readSent()
    assert.strictEqual(sent.length, 1)
    assert.deepStrictEqual(sent[0].input.__sysInputArgs__[1].baseline, buildBaseline([rowLoaded], contract), '送出之基準仍是載入時之快照')
    return shots
}

//E2E-012 真實 user path：①（舊資料: 某 API 的欄位含無法摘要之值）②編輯分頁輸入草稿 ③儲存 → 禁止（提示無法建立存檔基準），不降級為不帶基準存檔、不送出請求
async function runE2E012(page, lang) {
    let shots = {}
    //前置: 舊資料——取得API清單的 dataSource 欄含 120 層巢狀物件（現行匯入已拒收此型別；舊版匯入曾可寫入），摘要時拋錯（過深）。直接寫 DB（非 UI 可造成）
    let row = await dbRow(NAME_A)
    let deep = { v: 1 }
    for (let k = 0; k < 120; k++) {
        deep = { v: deep }
    }
    await woItems.apis.save([{ id: row.id, dataSource: deep }])
    await gotoApiWorkspace(page, lang)
    let nameInp = await openEdit(page, lang)
    let readSent = await installRpcCapture(page)

    //步驟1：Name 欄輸入草稿 → 儲存
    let draft = `草稿-取得API清單-${lang}`
    await typeIntoInput(page, nameInp, draft)
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    let errLine = page.locator('.bk-err').filter({ hasText: T[lang].baselineBroken })
    await errLine.first().waitFor({ state: 'visible', timeout: 10000 })

    //assert: 不送出任何 saveApi（不降級為不帶基準存檔）、不出現成功 modal、DB 零寫入、草稿保留
    assert.strictEqual((await readSent()).length, 0, '無法建立基準時不得送出 saveApi')
    assert.ok(!(await page.evaluate(() => document.body.innerText || '')).includes(T[lang].saved), '不應出現「已儲存」')
    assert.strictEqual(await nameInp.inputValue(), draft, '草稿保留')
    assert.ok(await dbRow(NAME_A), 'DB 仍有原名之 API')
    assert.ok(!(await dbRow(draft)), '草稿名未寫入')
    //結果: 儲存鈕上方出現「無法建立存檔基準」訊息(框住該行紅字)
    shots['E2E-012-1-broken'] = await captureStableWithBox(page, itemsUnionBox(errLine.first(), { fit: true }))
    return shots
}


//---- E2E-019～E2E-022（api-run03）：存檔／刪除成功後之新基準與畫面取自伺服端回傳，須立即取得（規格 §8）----
//共同前置: installPushHold 攔下推播（模擬推播／輪詢延遲）。攔下期間 store 只會因「存檔／刪除成功之回傳」而變，故畫面或基準若反映了存檔結果，必來自回傳而非推播。
//無標準圖：成功 modal 與 E2E-001 同款、其餘畫面與既有圖相同（同 E2E-010，§7.8 ①），以語意斷言守。

//存檔並等結果: 成功 → 成功 modal 出現；被拒 → 拋錯（附拒收訊息，免得逾時訊息看不出原因）
async function clickSaveExpectOk(page, lang) {
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    await waitUntilExist(page, 'save result', (s) => !!document.querySelector('.bk-err') || (document.body.innerText || '').includes(s), { timeout: 10000, arg: T[lang].saved })
    let err = page.locator('.bk-err')
    if (await err.count() > 0) {
        throw new Error(`存檔被拒（預期成功）: ${await err.first().innerText()}`)
    }
    await page.waitForTimeout(300)
}

//等被攔下之推播已產生且為整表最新（其中有 name 為指定值之列）
async function waitHeldPushWithName(page, name) {
    await waitUntilExist(page, 'held push with latest', (s) => {
        let q = window.__pushHold.queue
        let last = q[q.length - 1]
        return !!last && Array.isArray(last.data) && last.data.some((r) => r.name === s)
    }, { timeout: 20000, arg: name })
}

//放行一筆被攔下之推播（預設最新一筆; opt.index 指定第幾筆）：commit 為同步, 回傳時 store 已更新; 再給 Vue 一輪重繪（前端同步重繪後之短暫 settle）
async function releaseHeldPush(page, hold, opt = {}) {
    let rel = await hold.release(opt)
    await page.waitForTimeout(500)
    return rel
}

//E2E-019 真實 user path：①編輯分頁改名（含 a<b）→ 儲存 → 關成功 modal ②（推播未到）左樹已反映伺服端存放之名稱 ③立即再開編輯，Name 欄為伺服端存放值 ④再改名 → 儲存 → 成功（不被自己上一次之存檔誤擋）
//⑤（被攔下之最新推播產生後）再開編輯並輸入草稿 ⑥放行推播 → 無「已被更新」提示、草稿不被重建 ⑦儲存草稿 → 成功
async function runE2E019(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    let nameInp = await openEdit(page, lang)
    let readSent = await installRpcCapture(page)
    let hold = await installPushHold(page)

    //步驟1：Name 欄輸入含特殊字元之名稱（伺服器寫入時 clearXSS 改寫 a<b → a&lt;b）→ 儲存
    let name1 = `存檔後a<b-${lang}`
    let name1Stored = `存檔後a&lt;b-${lang}`
    await typeIntoInput(page, nameInp, name1)
    await clickSaveExpectOk(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let row1 = await dbRow(name1Stored)
    assert.ok(row1, 'DB 以 clearXSS 改寫後之名稱存放')

    //assert UI（規格 §8: 存檔成功後立即以伺服端回傳之列更新畫面）：推播被攔下，左樹仍已顯示伺服端存放之名稱
    await waitTreeText(page, name1Stored)

    //步驟2：立即再開編輯（推播未到）→ Name 欄為伺服端存放值（不是存檔前之舊名、不是送出之 a<b）
    let nameInp2 = await openEdit(page, lang)
    assert.strictEqual(await nameInp2.inputValue(), name1Stored, '再開編輯顯示伺服端存放之名稱')

    //步驟3：再改名 → 儲存 → 成功（先前：被自己上一次之存檔誤判為已被他人更新而拒收）
    let name2 = `再存-${lang}`
    await typeIntoInput(page, nameInp2, name2)
    await clickSaveExpectOk(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    assert.ok(await dbRow(name2), '第二次存檔寫入')
    assert.ok(!(await dbRow(name1Stored)), '原地更新')
    let sent = await readSent()
    assert.strictEqual(sent.length, 2, '共送出 2 次 saveApi')
    //第 2 次之基準＝第 1 次存檔後伺服端存放之列所算；不得是第 1 次送出之值（a<b）所算（規格 §8: 不得以自己送出之值當新基準）
    assert.deepStrictEqual(sent[1].input.__sysInputArgs__[1].baseline, buildBaseline([row1], contract), '第 2 次之基準取自第 1 次存檔後伺服端存放之列')
    assert.notDeepStrictEqual(sent[1].input.__sysInputArgs__[1].baseline, buildBaseline([{ ...row1, name: name1 }], contract), '不得以第 1 次送出之值算基準')

    //步驟4：等被攔下之推播產生（內容為第 2 次存檔後之列），再開編輯並輸入草稿
    await waitHeldPushWithName(page, name2)
    let nameInp3 = await openEdit(page, lang)
    assert.strictEqual(await nameInp3.inputValue(), name2)
    let draft = `草稿-三-${lang}`
    await typeIntoInput(page, nameInp3, draft)

    //步驟5：放行推播（同內容）→ 該列摘要與基準相同：不顯示「已被更新」、不重建表單（草稿仍在）
    await releaseHeldPush(page, hold)
    assert.strictEqual(await staleBanner(page).count(), 0, '同內容推播不應被當成他人更新')
    assert.strictEqual(await nameInp3.inputValue(), draft, '草稿不被推播重建')

    //步驟6：儲存草稿 → 成功
    await clickSaveExpectOk(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    assert.ok(await dbRow(draft), '草稿寫入')
    return shots
}

//E2E-020 真實 user path：①改名 → 儲存 → 關 modal ②立即再開編輯（推播未到）③（他人在我存檔之後改了同一列之說明，其推播同樣未到）④我改名 → 儲存 → 仍被拒（零寫入）
async function runE2E020(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    let nameInp = await openEdit(page, lang)
    let readSent = await installRpcCapture(page)
    await installPushHold(page)

    //步驟1：改名 → 儲存
    let name1 = `我先存-${lang}`
    await typeIntoInput(page, nameInp, name1)
    await clickSaveExpectOk(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let row1 = await dbRow(name1)
    assert.ok(row1)
    await waitTreeText(page, name1)

    //步驟2：立即再開編輯（推播未到；基準取自存檔回傳之列）
    let nameInp2 = await openEdit(page, lang)
    assert.strictEqual(await nameInp2.inputValue(), name1)

    //步驟3：他人在我存檔之後改了同一列（不帶基準＝看著最新資料改）；推播被攔下，我的畫面不知情
    let otherDesc = `他人在我之後改的說明-${lang}`
    await otherSave(name1, { description: otherDesc })

    //步驟4：我改名 → 儲存 → 仍被拒（先動先贏不被削弱；規格 V1）
    let draft = `我的第二次-${lang}`
    await typeIntoInput(page, nameInp2, draft)
    await page.locator('button.btn-save').first().click({ timeout: 8000 })
    let errLine = page.locator('.bk-err').filter({ hasText: T[lang].saveStale })
    await errLine.first().waitFor({ state: 'visible', timeout: 10000 })
    assert.ok(!(await page.evaluate(() => document.body.innerText || '')).includes(T[lang].saved), '被拒時不應出現成功 modal')
    assert.strictEqual(await nameInp2.inputValue(), draft, '被拒後草稿保留')
    let rowAfter = await dbRow(name1)
    assert.ok(rowAfter, 'DB 仍有原名之 API（零寫入）')
    assert.strictEqual(rowAfter.description, otherDesc, 'DB 維持他人所寫之說明')
    assert.ok(!(await dbRow(draft)), '第二次存檔未寫入')
    let sent = await readSent()
    assert.strictEqual(sent.length, 2)
    assert.deepStrictEqual(sent[1].input.__sysInputArgs__[1].baseline, buildBaseline([row1], contract), '送出之基準取自存檔回傳之列（他人其後之更新不在其中，故被拒）')
    return shots
}

//E2E-021 真實 user path：①編輯分頁 ②點刪除 → 確認「是」→ 關成功 modal ③（推播未到）左樹立即不含該列 ④（被攔下之推播產生後放行）再開編輯，無提示
async function runE2E021(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    await openEdit(page, lang)
    let hold = await installPushHold(page)
    assert.ok((await page.evaluate(() => document.body.innerText || '')).includes(NAME_A), '刪除前左樹有該列')

    //步驟1：點「刪除」→ 確認 → 成功 modal → 關閉
    await page.locator('button.btn-delete').first().click({ timeout: 8000 })
    await waitUntilExist(page, 'confirm dialog', (yes) => (document.body.innerText || '').includes(yes), { timeout: 8000, arg: T[lang].yes })
    await page.getByText(T[lang].yes, { exact: true }).first().click({ timeout: 8000 })
    await waitUntilExist(page, 'deleted modal', (s) => (document.body.innerText || '').includes(s), { timeout: 10000, arg: T[lang].deleted })
    await clickModalOk(page, lang, T[lang].deleted)
    assert.ok(!(await dbRow(NAME_A)), 'DB 已刪除')

    //步驟2：assert UI（規格 §8: 刪除成功後立即自畫面移除）：推播被攔下，左樹仍已不含該列，且改選其他列
    await waitUntilExist(page, 'api removed from tree', (s) => !(document.body.innerText || '').includes(s), { timeout: 12000, arg: NAME_A })
    assert.ok((await page.evaluate(() => document.body.innerText || '')).includes(NAME_B), '其他 API 仍在')

    //步驟3：被攔下之推播產生後放行（內容為已無該列之整表）→ 再開編輯：無「已被刪除／更新」提示
    await waitUntilExist(page, 'held push without deleted row', (s) => {
        let q = window.__pushHold.queue
        let last = q[q.length - 1]
        return !!last && Array.isArray(last.data) && !last.data.some((r) => r.name === s)
    }, { timeout: 20000, arg: NAME_A })
    await releaseHeldPush(page, hold)
    await openEdit(page, lang)
    assert.strictEqual(await staleBanner(page).count(), 0, '放行推播後不應有任何「已被他人更新／刪除」提示')
    return shots
}

//E2E-022 真實 user path：①點「新增API」填名稱／網址／階層 → 儲存 → 關 modal ②（推播未到）左樹立即出現新列 ③搜尋該名稱選取該列 ④再開編輯 → 改名 → 儲存 → 成功
async function runE2E022(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    let readSent = await installRpcCapture(page)
    await installPushHold(page)

    //步驟1：新增（同 E2E-002 之填表）
    let newName = `新增後立即編-${lang}`
    await page.getByText(T[lang].newApi, { exact: false }).first().click({ timeout: 8000 })
    let nameInp = fieldInput(page, T[lang].lblName)
    await nameInp.waitFor({ state: 'visible', timeout: 8000 })
    await typeIntoInput(page, nameInp, newName)
    await typeIntoInput(page, fieldInput(page, T[lang].lblUrl), 'http://localhost:11005/e2eNew')
    await typeIntoInput(page, fieldInput(page, T[lang].lblLevels), 'E2E新增分類')
    await clickSaveExpectOk(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let rowNew = await dbRow(newName)
    assert.ok(rowNew, 'DB 新增該筆')

    //步驟2：assert UI（規格 §8: 新增時回傳含伺服端配的新 id 之列，立即入 store）：推播被攔下，左樹仍已出現新列
    await waitTreeText(page, newName)

    //步驟3：搜尋該名稱 → 非編輯模式之選取隨搜尋結果轉移，選到新列
    await typeIntoInput(page, searchInput(page, lang), newName)

    //步驟4：再開編輯 → Name 欄為新列 → 改名 → 儲存 → 成功（基準取自回傳之列，含新 id）
    let nameInp2 = await openEdit(page, lang)
    assert.strictEqual(await nameInp2.inputValue(), newName, '再開編輯顯示新列')
    let name2 = `${newName}-改`
    await typeIntoInput(page, nameInp2, name2)
    await clickSaveExpectOk(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let rowAfter = await dbRow(name2)
    assert.ok(rowAfter, '改名寫入')
    assert.strictEqual(rowAfter.id, rowNew.id, '原地更新同一 id（非再新增一列）')
    assert.ok(!(await dbRow(newName)))
    let sent = await readSent()
    assert.strictEqual(sent.length, 2)
    assert.strictEqual(sent[0].input.__sysInputArgs__.length, 1, '新增不帶基準')
    assert.deepStrictEqual(sent[1].input.__sysInputArgs__[1].baseline, buildBaseline([rowNew], contract), '修改之基準取自回傳之新列（含新 id）')
    return shots
}

//E2E-023 真實 user path：①（他人改了另一筆，其推播載有「我要編輯的那筆之舊內容」，被攔下＝在我存檔之前由伺服端讀取之舊快照）②編輯改名 → 儲存 → 關 modal
//③（舊快照在我的回應之後才抵達）左樹仍顯示我存檔後的名稱，不退回舊名 ④立即再開編輯 → Name 欄為存檔後的名稱 → 再改名 → 儲存 → 成功
async function runE2E023(page, lang) {
    let shots = {}
    await gotoApiWorkspace(page, lang)
    let nameInp = await openEdit(page, lang)
    let readSent = await installRpcCapture(page)
    let hold = await installPushHold(page)

    //步驟1：他人改了「另一筆」之說明 → 推播產生並被攔下；其整表快照中，我要編輯的那筆仍是舊內容（在我存檔之前讀取）
    await otherSave(NAME_B, { description: `他人改的說明-${lang}` })
    await waitUntilExist(page, 'stale snapshot held', (s) => {
        let q = window.__pushHold.queue
        return q.length >= 1 && Array.isArray(q[0].data) && q[0].data.some((r) => r.name === s)
    }, { timeout: 20000, arg: NAME_A })

    //步驟2：改名 → 儲存 → 關成功 modal
    let name1 = `我先存-${lang}`
    await typeIntoInput(page, nameInp, name1)
    await clickSaveExpectOk(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    let row1 = await dbRow(name1)
    assert.ok(row1)
    await waitTreeText(page, name1)

    //步驟3：舊快照此時才抵達（在我的回應之後）→ 我剛存的列不被退回舊名（規格 §8: 存檔成功後之新基準須立即取得並維持）
    let heldMine = await hold.heldRowOf(row1.id)
    console.log('E2E-023 diag held entries for my row:', JSON.stringify(heldMine), 'saved timeUpdate:', row1.timeUpdate)
    assert.ok(heldMine[0] && heldMine[0].name === NAME_A, `被攔下的第一筆快照中我的列仍是舊名（前提; 實得 ${JSON.stringify(heldMine)}）`)
    let rel = await releaseHeldPush(page, hold, { index: 0 })
    //store 層（取放行當下之原子結果: 放行後真實推播會陸續抵達而把 store 蓋回，事後再讀可能讀到已被蓋回之內容而假通過）：我剛存的列仍是存檔後的名稱，舊名未回來
    assert.ok(Array.isArray(rel.names) && rel.names.includes(name1), `舊快照抵達當下 store 中該列仍為存檔後的名稱（store 名稱: ${JSON.stringify(rel.names)}）`)
    assert.ok(!rel.names.includes(NAME_A), '舊快照抵達當下 store 中不退回舊名')
    //畫面層（等重繪與後續真實推播後）
    await page.waitForTimeout(1000)
    //（以整段文字相符找名稱節點: 舊名「取得API清單」亦出現在該 API 的說明文字「…取得API清單資訊」中，不能以子字串判斷）
    assert.ok(await page.getByText(name1, { exact: true }).count() >= 1, '舊快照抵達後左樹仍顯示存檔後的名稱')
    assert.strictEqual(await page.getByText(NAME_A, { exact: true }).count(), 0, '不退回舊名（畫面上不存在名稱為舊名之節點）')

    //步驟4：立即再開編輯 → Name 欄為存檔後的名稱 → 再改名 → 儲存 → 成功（基準取自回傳之列，不被舊快照污染）
    let nameInp2 = await openEdit(page, lang)
    assert.strictEqual(await nameInp2.inputValue(), name1, '再開編輯顯示存檔後的名稱')
    let name2 = `再存-${lang}`
    await typeIntoInput(page, nameInp2, name2)
    await clickSaveExpectOk(page, lang)
    await clickModalOk(page, lang, T[lang].saved)
    assert.ok(await dbRow(name2), '第二次存檔寫入')
    assert.strictEqual(await staleBanner(page).count(), 0)
    let sent = await readSent()
    assert.strictEqual(sent.length, 2)
    assert.deepStrictEqual(sent[1].input.__sysInputArgs__[1].baseline, buildBaseline([row1], contract), '第 2 次之基準取自第 1 次存檔後伺服端存放之列')
    return shots
}


// ===================================================================
// 案例宣告與案例管線（比對端與 REGEN 產製端共用）
// ===================================================================

//E2E-010 無標準圖（成功 modal 與 E2E-001 同款、共用其圖；本案以語意斷言守基準與重建行為），stages 為空
let cases = [
    {
        name: 'E2E-006-unrelated',
        title: (lang) => `E2E-006 [${lang}] 編輯中他人更新無關 API，草稿保留`,
        run: runE2E006,
        stages: ['E2E-006-1-draft', 'E2E-006-2-kept'],
    },
    {
        name: 'E2E-007-stale',
        title: (lang) => `E2E-007 [${lang}] 編輯中他人更新同一筆，提示並拒收舊畫面存檔`,
        run: runE2E007,
        stages: ['E2E-007-1-draft', 'E2E-007-2-stale', 'E2E-007-3-rejected', 'E2E-007-4-reloaded'],
    },
    {
        name: 'E2E-008-deleted',
        title: (lang) => `E2E-008 [${lang}] 編輯中原 API 被他人刪除，停留並提示`,
        run: runE2E008,
        stages: ['E2E-008-1-draft', 'E2E-008-2-deleted'],
    },
    {
        name: 'E2E-009-search',
        title: (lang) => `E2E-009 [${lang}] 編輯中搜尋，不換筆且草稿保留`,
        run: runE2E009,
        stages: ['E2E-009-1-search-kept'],
    },
    {
        name: 'E2E-010-baseline',
        title: (lang) => `E2E-010 [${lang}] 無草稿時自動重建，基準取自伺服端`,
        run: runE2E010,
        stages: [],
        allowEmpty: true, //無獨特視覺終態(成功 modal 共用 E2E-001 之圖)，以語意斷言守
    },
    {
        name: 'E2E-011-reverted',
        title: (lang) => `E2E-011 [${lang}] 他人改了又改回，提示撤除且舊基準仍可存`,
        run: runE2E011,
        stages: ['E2E-011-1-stale', 'E2E-011-2-cleared'],
    },
    {
        name: 'E2E-012-broken',
        title: (lang) => `E2E-012 [${lang}] 舊資料無法建立基準，禁止存檔而不降級`,
        run: runE2E012,
        stages: ['E2E-012-1-broken'],
    },
    {
        name: 'E2E-019-reedit',
        title: (lang) => `E2E-019 [${lang}] 存檔成功後（推播未到）立即再編輯再存，不被自己上一次之存檔誤擋`,
        run: runE2E019,
        stages: [],
        allowEmpty: true, //無獨特視覺終態(成功 modal 共用 E2E-001 之圖)，以語意斷言守
    },
    {
        name: 'E2E-020-others-after',
        title: (lang) => `E2E-020 [${lang}] 他人在我存檔之後改了同一列，我再存仍被拒`,
        run: runE2E020,
        stages: [],
        allowEmpty: true, //被拒訊息與 E2E-007-3 同款，以語意斷言守
    },
    {
        name: 'E2E-021-delete-now',
        title: (lang) => `E2E-021 [${lang}] 刪除成功後（推播未到）該列立即自左樹移除`,
        run: runE2E021,
        stages: [],
        allowEmpty: true, //畫面終態同 E2E-003-3，以語意斷言守
    },
    {
        name: 'E2E-022-add-now',
        title: (lang) => `E2E-022 [${lang}] 新增成功後（推播未到）新列立即出現並可立即編輯再存`,
        run: runE2E022,
        stages: [],
        allowEmpty: true, //畫面終態同 E2E-002-3，以語意斷言守
    },
    {
        name: 'E2E-023-stale-snapshot',
        title: (lang) => `E2E-023 [${lang}] 儲存成功後晚到之較舊推播不退回我剛存的內容`,
        run: runE2E023,
        stages: [],
        allowEmpty: true, //畫面終態同 E2E-001-3，以語意斷言守
    },
]

let gate = REGEN ? createBaselineGate({ langs: LANGS, cases }) : null
if (gate) {
    after(function() {
        gate.finalize()
    })
}

//單一案例管線（比對端與 REGEN 產製端同一條）：prepare（DB 重置為 base seed）→ 全新 browser（1440×900）→ run → 全部斷言通過後才寫檔／比對 → finally 關 browser
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
        prepare: async () => {
            await resetToBaseSeed()
        },
        pathOf,
        labelOf: (lg, key) => `${FLOW}-${lg}-${key}`,
        gate,
    })
}


describe('e2e-concurrent (API 編輯: 多人同時編輯之草稿保護)', function() {
    this.timeout(240000)

    before(async function() {
        this.timeout(180000)
        await startServersOnce()
    })

    after(async function() {
        await resetToBaseSeed() //還原 base seed 供非 e2e 時段使用
    })

    for (let lang of LANGS) {
        for (let c of cases) {
            it(c.title(lang), async function() {
                await runCase(lang, c)
            })
        }
    }

})
