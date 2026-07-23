//e2e：API 展示流程
//
//重要流程（spec bullets，見 spec/流程_展示API文件.md）：
//- E2E-001：登入後左側顯示 API 樹狀清單、右側顯示第一筆 API 文件（Docs 分頁）。
//- E2E-002：左樹分類階層巢狀正確 + 各葉節點方法 badge（GET/POST/PUT/DEL）。
//- E2E-003：左樹搜尋過濾（輸入 cats 只剩貓咪、清空還原）。
//- E2E-004：點選樹節點（POST「新增狗狗資訊」）切換右側文件。
//- E2E-005：docs 標頭 + metadata pills（含 keywords 分號切多 chip）正確。
//- E2E-006：輸入/輸出參數表格 + 請求 cURL / 回應 JSON 程式碼區正確。
//- E2E-007：Docs/Edit/Test 分頁預設 Docs active、切 Test、切回 Docs。
//- E2E-008：語系切換 eng↔cht 即時重渲染（單輪涵蓋）。
//- E2E-009：左側抽屜顯隱（收合→展開）。
//
//act 走真實 user 路徑：瀏覽器導頁（攜 ?token=sys）→ 等資料同步渲染 → 鍵盤輸入（typeIntoInput
///Pattern D，搜尋框為 v-model）、滑鼠點擊（getByText / 樹節點 / 分頁 / 抽屜鈕 / 語系選單）。
//assert：tree/docs 之 user-facing 文字（innerText）+ input value + DOM 存在性 + pixel baseline。
//雙語 eng/cht 皆跑（E2E-008 語系切換本身單輪）。
//
import assert from 'assert'
import { chromium } from 'playwright'
import {
    startServersOnce,
    captureStable,
    captureStableWithBox,
    waitUntilExist,
    typeIntoInput,
    resetToBaseSeed,
    assertOrRegenBaseline,
    baseUrl,
    chromiumLaunchArgs,
} from './e2e-setup.mjs'


let FLOW = 'display'
let LANGS = ['eng', 'cht']

//各語系要驗的 user-facing 文字（i18n，逐字對應 server/procLang.mjs）
let T = {
    eng: {
        docs: 'Docs', edit: 'Edit', test: 'Test', newApi: 'New API',
        searchPh: 'Search API...',
        levels: 'Levels', keywords: 'Keywords', creator: 'Creator', dataSource: 'Source',
        docInput: 'Input', docOutputFields: 'Output fields', docRequest: 'Request', resTitle: 'Response',
    },
    cht: {
        docs: '文件', edit: '編輯', test: '測試', newApi: '新增API',
        searchPh: '搜尋API...',
        levels: '所屬階層', keywords: '關鍵字', creator: 'API創建者', dataSource: '資料提供者',
        docInput: '輸入參數', docOutputFields: '回傳欄位', docRequest: '請求', resTitle: '回應',
    },
}

//抽屜顯隱鈕 selector（E2E-009）：
//Layout.vue 那顆 toolbar 漢堡鈕為 v-if="false"（停用）；真正可用的是 LayoutContent.vue 內
//WDrawer slot 的兩顆 WButtonCircle——drawer 開時於 drawer 右上顯示「收合」鈕(mdiArrowLeft)、
//drawer 關時於 content 左上顯示「展開」鈕(mdiArrowRight)，同時間只有一顆存在。
//WButtonCircle 無 data-* / aria-label，tooltip 文字(menuTreeHide/Show)由 WTooltip 延後渲染、
//預設不在 DOM（實測 getByText('Hide API list') timeout、tooltip 文字節點數=0），故無法用語意文字定位。
//退而求其次以「圖標 SVG path = mdiArrowLeft/Right 的最近 tabindex=0 可點祖先」定位——path 為該鈕專屬
//唯一標記（實測全頁僅此鈕用這兩條 path），比座標穩定。已驗證：點收合鈕後搜尋框 x<0 不可見、出現
//展開鈕(ARROW_RIGHT)；點展開鈕後搜尋框恢復可見。此為窮盡語意 selector 後的結構定位（已於註解說明試過項目）。
let ARROW_LEFT = 'M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z'
let ARROW_RIGHT = 'M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z'
function drawerCollapseBtn(page) {
    return page.locator(`div[tabindex="0"]:has(svg path[d="${ARROW_LEFT}"])`)
}
function drawerExpandBtn(page) {
    return page.locator(`div[tabindex="0"]:has(svg path[d="${ARROW_RIGHT}"])`)
}

function searchInput(page) {
    return page.locator('input[placeholder]').first()
}


//導頁 + 等 app 就緒。marker 用「取得寵物清單」（只出現在左側 tree，非預設選取的 docs 名稱），
//確保等到「tree 已完整渲染」而非僅 docs 面板（docs 顯示第一筆「取得API清單」會過早滿足）。
//以 ?lang= 指定語系載入初始畫面（對齊 w-web-sso：前端 getLang 之 URL ?lang= 為最高優先）。
//lang 省略時不帶 ?lang=（預設 eng）。載入後等該語系 UI 實際套用到位（getWebInfor 回來後 setLang 依 URL 重渲染）。
async function gotoReady(page, lang) {
    let q = (lang === 'cht' || lang === 'eng') ? `&lang=${lang}` : ''
    await page.goto(`${baseUrl}/?token=sys${q}`, { waitUntil: 'load', timeout: 30000 })
    await waitUntilExist(page, 'API tree rendered', () => {
        let t = document.body.innerText || ''
        return t.includes('取得API清單') && t.includes('取得寵物清單')
    }, { timeout: 25000 })
    //等指定語系 UI 套用：cht 看「文件」分頁、eng（或預設）看「Docs」
    let marker = (lang === 'cht') ? '文件' : 'Docs'
    await waitUntilExist(page, `UI lang applied (${marker})`, (m) => (document.body.innerText || '').includes(m), { timeout: 8000, arg: marker })
    await page.waitForTimeout(300)
}



//取左側樹（WDrawer drawer slot）的純文字。scope 到 drawer 容器（border-right 的那個 div），
//避免把右側 docs 區的文字 / method badge 一併撈進來造成誤判。
async function getTreeText(page) {
    return await page.evaluate(() => {
        let inp = document.querySelector('input[placeholder]')
        let drawerRoot = inp ? inp.closest('div[style*="border-right"]') : null
        return drawerRoot ? (drawerRoot.innerText || '') : ''
    })
}

//取左側樹內出現過的方法 badge 文字集合（.w-mb，scope 到 drawer）。
async function getTreeBadgeSet(page) {
    return await page.evaluate(() => {
        let inp = document.querySelector('input[placeholder]')
        let drawerRoot = inp ? inp.closest('div[style*="border-right"]') : null
        if (!drawerRoot) {
            return []
        }
        let bs = Array.from(drawerRoot.querySelectorAll('.w-mb')).map((e) => (e.innerText || '').trim())
        return Array.from(new Set(bs))
    })
}


describe('e2e-display (API 展示)', function() {
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

        //E2E-001 真實 user path：①開 /?token=sys 自動登入 ②等樹渲染 ③(cht)點語系選單切中文
        //④看左樹多筆 API + 右側第一筆 docs ⑤無輸入 ⑥純展示無 DB 副作用。
        it(`E2E-001 [${lang}] 載入顯示 API 樹與第一筆文件`, async function() {

            //act：導頁就緒（cht 再切語系）
            await gotoReady(page, lang)

            //assert（user-facing 觀察）：
            let txt = await page.evaluate(() => document.body.innerText || '')
            //樹含多筆 seeded API（資料正確同步）——spec E2E-001 驗證1「左樹含上述兩筆」
            assert.ok(txt.includes('取得API清單'), 'tree 應含「取得API清單」')
            assert.ok(txt.includes('取得寵物清單'), 'tree 應含「取得寵物清單」')
            //docs 顯示第一筆 API 的 url——spec「docs 顯示第一筆 url」
            assert.ok(txt.includes('http://localhost:11005/getAPIsList'), 'docs 應顯示第一筆 API url')
            //mode 分頁三個按目前語系顯示——spec「三分頁顯示當前語系之 Docs/Edit/Test」
            assert.ok(txt.includes(T[lang].docs), `mode tab 應顯示「${T[lang].docs}」`)
            assert.ok(txt.includes(T[lang].edit), `mode tab 應顯示「${T[lang].edit}」`)
            assert.ok(txt.includes(T[lang].test), `mode tab 應顯示「${T[lang].test}」`)

            //pixel baseline（補強層）——spec 驗證2：整體載入就緒基準，全頁乾淨截圖、不畫紅框
            //（本案無單一聚焦區、整頁皆主體；全框＝無標註意義，故不框，留作整體基準）
            let buf = await captureStable(page)
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-001-docs-list.png`, buf)

        })

        //E2E-002 真實 user path：①開 /?token=sys ②等樹渲染 ③(cht)切語系 ④看左樹分類巢狀 + 葉節點 badge
        //⑤無輸入 ⑥純展示。獨立產製 E2E-002-tree.png（紅框標注左樹區）。
        it(`E2E-002 [${lang}] 左樹分類階層與方法 badge`, async function() {

            //act：載入頁面（同 E2E-001 起點，不再額外互動）
            await gotoReady(page, lang)

            //assert（user-facing 觀察，scope 到左側樹避免撈到右側 docs）：
            let tree = await getTreeText(page)
            //spec 驗證1：左樹含分類標題且巢狀歸屬正確（寵物 ＞ 狗狗/貓咪、交通工具 ＞ 汽車）
            assert.ok(tree.includes('寵物'), '左樹應含分類「寵物」')
            assert.ok(tree.includes('狗狗'), '左樹應含分類「狗狗」')
            assert.ok(tree.includes('貓咪'), '左樹應含分類「貓咪」')
            assert.ok(tree.includes('交通工具'), '左樹應含分類「交通工具」')
            assert.ok(tree.includes('汽車'), '左樹應含分類「汽車」')
            //巢狀順序：寵物 早於 狗狗 早於 貓咪；交通工具 早於 汽車（父分類在子分類之前出現）
            assert.ok(tree.indexOf('寵物') < tree.indexOf('狗狗'), '「寵物」應在「狗狗」之前（父在子前）')
            assert.ok(tree.indexOf('狗狗') < tree.indexOf('貓咪'), '「狗狗」應在「貓咪」之前')
            assert.ok(tree.indexOf('交通工具') < tree.indexOf('汽車'), '「交通工具」應在「汽車」之前')
            //spec 驗證1：狗狗分類含 POST/PUT/DEL 三筆葉節點
            assert.ok(tree.includes('新增狗狗資訊'), '左樹應含 POST 筆「新增狗狗資訊」')
            assert.ok(tree.includes('變更狗狗資訊'), '左樹應含 PUT 筆「變更狗狗資訊」')
            assert.ok(tree.includes('刪除狗狗資訊'), '左樹應含 DEL 筆「刪除狗狗資訊」')
            //spec 驗證1：各方法 badge 文字皆出現於樹（GET/POST/PUT/DEL）
            let badges = await getTreeBadgeSet(page)
            for (let m of ['GET', 'POST', 'PUT', 'DEL']) {
                assert.ok(badges.includes(m), `左樹方法 badge 應含「${m}」（實得 ${JSON.stringify(badges)}）`)
            }

            //spec 驗證2：整張全頁截圖，紅框標注本 case 驗的左樹區（分類階層 + 方法 badge）
            let bufTree = await captureStableWithBox(page, 'div[style*="border-right"]')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-002-tree.png`, bufTree)

        })

        //E2E-003 真實 user path：①開 /?token=sys ②等樹渲染 ③(cht)切語系 ④於搜尋框鍵入 cats
        //⑤看左樹只剩貓咪 ⑥清空還原。搜尋框為 v-model → 用 typeIntoInput(Pattern D)。
        it(`E2E-003 [${lang}] 左樹搜尋過濾`, async function() {

            await gotoReady(page, lang)

            //act：於搜尋框 typeIntoInput 'cats'（真鍵盤輸入路徑）
            let sInp = searchInput(page)
            assert.strictEqual(await sInp.getAttribute('placeholder'), T[lang].searchPh, `搜尋框 placeholder 應為「${T[lang].searchPh}」`)
            await typeIntoInput(page, sInp, 'cats')
            //等樹過濾完成（「取得API清單」消失）
            await waitUntilExist(page, 'tree filtered to cats', () => {
                let inp = document.querySelector('input[placeholder]')
                let drawerRoot = inp ? inp.closest('div[style*="border-right"]') : null
                let t = drawerRoot ? (drawerRoot.innerText || '') : ''
                return t.includes('取得貓咪清單') && !t.includes('取得API清單')
            }, { timeout: 8000 })

            //assert UI（spec 驗證1：輸入後左樹只含貓咪 API、不含取得API清單）
            let filtered = await getTreeText(page)
            assert.ok(filtered.includes('取得貓咪清單'), '過濾後左樹應含「取得貓咪清單」')
            assert.ok(!filtered.includes('取得API清單'), '過濾後左樹不應含「取得API清單」')
            assert.ok(!filtered.includes('取得狗狗清單'), '過濾後左樹不應含「取得狗狗清單」')

            //pixel baseline（過濾態）——spec 驗證2：紅框聚焦「搜尋框」（本案主體為搜尋動作；框整個樹會失去標註意義）
            let bufFiltered = await captureStableWithBox(page, 'input[placeholder]')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-003-search-filtered.png`, bufFiltered)

            //act：清空搜尋框（select-all 一次刪除；逐字 Backspace 在 v-model 會逐字 re-render、偶發掉焦點殘字 → restore 逾時 flake）
            await sInp.click()
            await page.keyboard.press('Control+a')
            await page.keyboard.press('Backspace')
            //等還原（取得API清單 回來）
            await waitUntilExist(page, 'tree restored', () => {
                let inp = document.querySelector('input[placeholder]')
                let drawerRoot = inp ? inp.closest('div[style*="border-right"]') : null
                let t = drawerRoot ? (drawerRoot.innerText || '') : ''
                return t.includes('取得API清單') && t.includes('取得寵物清單')
            }, { timeout: 12000 })

            //assert UI（spec 驗證1：清空後恢復含取得API清單與取得寵物清單）
            let restored = await getTreeText(page)
            assert.ok(restored.includes('取得API清單'), '清空後左樹應恢復「取得API清單」')
            assert.ok(restored.includes('取得寵物清單'), '清空後左樹應恢復「取得寵物清單」')

        })

        //E2E-004 真實 user path：①開 /?token=sys ②等樹渲染 ③(cht)切語系 ④點左樹「新增狗狗資訊」節點
        //⑤看右側 docs 標頭更新為該 POST 筆 ⑥純讀取。
        it(`E2E-004 [${lang}] 點選樹節點切換右側文件`, async function() {

            await gotoReady(page, lang)

            //act：於左樹點「新增狗狗資訊」葉節點（真滑鼠點擊 @click=ckItem）
            await page.getByText('新增狗狗資訊', { exact: true }).first().click({ timeout: 8000 })
            //等右側標頭更新為該筆
            await waitUntilExist(page, 'docs header updated to addDog', () => {
                let op = document.querySelector('.op-title')
                let opPath = document.querySelector('.op-path')
                return op && (op.innerText || '').trim() === '新增狗狗資訊'
                    && opPath && (opPath.innerText || '').includes('addDog')
            }, { timeout: 8000 })

            //assert UI（spec 驗證1）
            let info = await page.evaluate(() => ({
                opTitle: (document.querySelector('.op-title')?.innerText || '').trim(),
                opPath: (document.querySelector('.op-path')?.innerText || '').trim(),
                //op header 內第一個 method badge（標頭緊接 op-title 之前）
                headBadge: (document.querySelector('.op-path .w-mb')?.innerText || '').trim(),
            }))
            assert.strictEqual(info.opTitle, '新增狗狗資訊', 'docs 標頭 op-title 應為「新增狗狗資訊」')
            assert.ok(info.opPath.includes('addDog'), 'docs 標頭 op-path url 應含「addDog」')
            assert.ok(info.opPath.includes('POST'), 'docs 標頭 op-path 方法 badge 應為 POST')
            assert.strictEqual(info.headBadge, 'POST', 'op-path method badge 文字應為 POST')
            //不再顯示第一筆「取得API清單」之 url（spec：不再顯示第一筆 url）
            let opPathTxt = info.opPath
            assert.ok(!opPathTxt.includes('getAPIsList'), 'op-path 不應再顯示第一筆「取得API清單」之 url')

            //pixel baseline（切換後該 POST 筆 docs）——spec 驗證2：紅框標注切換後的 docs 標頭
            let buf = await captureStableWithBox(page, ['.op-title', '.op-path', '.op-desc'])
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-004-selected-post-doc.png`, buf)

        })

        //E2E-005 真實 user path：①開 /?token=sys ②等樹渲染 ③(cht)切語系 ④看右側預設第一筆 docs 標頭 + pills
        //⑤無輸入 ⑥純展示。獨立產製 E2E-005-header.png（標頭）與 E2E-005-pills.png（pills）。
        it(`E2E-005 [${lang}] 文件標頭與 metadata pills`, async function() {

            await gotoReady(page, lang)

            //assert（預設第一筆「取得API清單」）：
            let info = await page.evaluate(() => ({
                opTitle: (document.querySelector('.op-title')?.innerText || '').trim(),
                opPath: (document.querySelector('.op-path')?.innerText || '').trim(),
                opDesc: (document.querySelector('.op-desc')?.innerText || '').trim(),
                pills: (document.querySelector('.pills')?.innerText || '').trim(),
                kwChips: Array.from(document.querySelectorAll('.kw-chip')).map((e) => (e.innerText || '').trim()),
            }))
            //spec 驗證1：標頭 name/url/description
            assert.strictEqual(info.opTitle, '取得API清單', '標頭 name 應為「取得API清單」')
            assert.ok(info.opPath.includes('getAPIsList'), '標頭 url 應含「getAPIsList」')
            assert.strictEqual(info.opDesc, 'API管理中心取得API清單資訊', '標頭 description 應為對應文字')
            //spec 驗證1：pills 顯示 version/levels/state/creator/dataSource（標籤依語系；值為資料不翻譯）
            assert.ok(info.pills.includes('v1'), 'pills 應含 version「v1」')
            assert.ok(info.pills.includes(T[lang].levels), `pills 應含 levels 標籤「${T[lang].levels}」`)
            assert.ok(info.pills.includes('API'), 'pills 應含 levels 值「API」')
            assert.ok(info.pills.includes('ok'), 'pills 應含 state「ok」')
            assert.ok(info.pills.includes(T[lang].creator), `pills 應含 creator 標籤「${T[lang].creator}」`)
            assert.ok(info.pills.includes('apis-system'), 'pills 應含 creator 值「apis-system」')
            assert.ok(info.pills.includes(T[lang].dataSource), `pills 應含 dataSource 標籤「${T[lang].dataSource}」`)
            assert.ok(info.pills.includes('apis-data'), 'pills 應含 dataSource 值「apis-data」')
            //spec 驗證1：keywords 分號切為兩個 chip「API」「center」
            assert.ok(info.pills.includes(T[lang].keywords), `pills 應含 keywords 標籤「${T[lang].keywords}」`)
            assert.deepStrictEqual(info.kwChips, ['API', 'center'], 'keywords 應切為兩個 chip：API、center')

            //spec 驗證2：整張全頁截圖，紅框標注本 case 驗的區塊（標頭、pills 各一張）
            let bufHeader = await captureStableWithBox(page, ['.op-title', '.op-path', '.op-desc'])
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-005-header.png`, bufHeader)
            let bufPills = await captureStableWithBox(page, '.pills')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-005-pills.png`, bufPills)

        })

        //E2E-006 真實 user path：①開 /?token=sys ②等樹渲染 ③(cht)切語系 ④看右側預設第一筆 docs 主體三區
        //（輸入參數表 / 輸出欄位表 / 請求 cURL / 回應 JSON）⑤無輸入 ⑥純展示。獨立產製四張 baseline：
        //E2E-006-input.png / E2E-006-output.png / E2E-006-request.png / E2E-006-response.png。
        it(`E2E-006 [${lang}] 輸入/輸出參數與請求/回應程式碼區`, async function() {

            await gotoReady(page, lang)

            //等 docs 參數區（.dsec-h 標題）與程式碼 rail（cURL/回應 pre）渲染完成再斷言（偵測-driven）
            await waitUntilExist(page, 'docs 參數/程式碼區渲染', (t) => {
                //.dsec-h 有 CSS text-transform:uppercase（eng innerText 回大寫如 INPUT），故大小寫不敏感比對
                let dsec = Array.from(document.querySelectorAll('.dsec-h')).map((e) => (e.innerText || '').trim().toUpperCase())
                let pre = document.querySelectorAll('.rail .card pre.code')
                return dsec.includes(t.toUpperCase()) && pre.length >= 2
            }, { timeout: 8000, arg: T[lang].docInput })

            //assert（預設第一筆「取得API清單」）：
            let info = await page.evaluate(() => {
                let pres = Array.from(document.querySelectorAll('.rail .card pre.code'))
                return {
                    dsecH: Array.from(document.querySelectorAll('.dsec-h')).map((e) => (e.innerText || '').trim()),
                    //docInput 區（左欄第一個 .doc-md）的表格文字
                    docMd: Array.from(document.querySelectorAll('.doc-md')).map((e) => (e.innerText || '').trim()),
                    cardLab: Array.from(document.querySelectorAll('.card-h .lab')).map((e) => (e.innerText || '').trim()),
                    resStatus: (document.querySelector('.card-h .st')?.innerText || '').trim(),
                    curl: pres.length > 0 ? (pres[0].innerText || '').trim() : '',
                    resBody: pres.length > 1 ? (pres[1].innerText || '').trim() : '',
                }
            })
            //spec 驗證1：docInput / docOutputFields 區標題（依語系）。.dsec-h 有 CSS text-transform:uppercase
            //（eng innerText 回大寫 INPUT/OUTPUT FIELDS），cht 中文無大小寫，故統一大小寫不敏感比對。
            let dsecU = info.dsecH.map((s) => s.toUpperCase())
            assert.ok(dsecU.includes(T[lang].docInput.toUpperCase()), `應有區段標題「${T[lang].docInput}」（docInput）`)
            assert.ok(dsecU.includes(T[lang].docOutputFields.toUpperCase()), `應有區段標題「${T[lang].docOutputFields}」（docOutputFields）`)
            //spec 驗證1：輸入參數表格出現 token / paramA 等列（doc-md 表格文字）
            let allDocMd = info.docMd.join('\n')
            assert.ok(allDocMd.includes('token'), '輸入/輸出參數表應出現「token」列')
            assert.ok(allDocMd.includes('paramA'), '輸入/輸出參數表應出現「paramA」列')
            //spec 驗證1：請求區出現 cURL 字串（含 -X GET 與 getAPIsList）
            assert.ok(info.cardLab.includes(T[lang].docRequest), `應有請求區標題「${T[lang].docRequest}」`)
            assert.ok(info.curl.includes('-X GET'), 'cURL 應含「-X GET」')
            assert.ok(info.curl.includes('getAPIsList'), 'cURL 應含「getAPIsList」')
            //spec 驗證1：回應區標題「200 OK」與 JSON 內容（含 weight / color）
            assert.ok(info.cardLab.includes(T[lang].resTitle), `應有回應區標題「${T[lang].resTitle}」`)
            assert.strictEqual(info.resStatus, '200 OK', '回應區應顯示「200 OK」')
            assert.ok(info.resBody.includes('weight'), '回應 JSON 應含「weight」')
            assert.ok(info.resBody.includes('color'), '回應 JSON 應含「color」')

            //spec 驗證2：整張全頁截圖，紅框標注本 case 驗的區塊（輸入/輸出/請求/回應各一張）
            //輸出欄位與回應在 fold 以下，captureStableWithBox 內先 scrollIntoView 捲到再框、再截整頁。
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-006-input.png`, await captureStableWithBox(page, '.split .dsec:nth-of-type(1)'))
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-006-output.png`, await captureStableWithBox(page, '.split .dsec:nth-of-type(2)'))
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-006-request.png`, await captureStableWithBox(page, '.rail .card:nth-of-type(1)'))
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-006-response.png`, await captureStableWithBox(page, '.rail .card:nth-of-type(2)'))

        })

        //E2E-007 真實 user path：①開 /?token=sys ②等樹渲染 ③(cht)切語系 ④看預設 Docs active
        //⑤點 Test 分頁→docs 標頭消失 ⑥點 Docs 分頁→docs 標頭回來。純分頁切換互動，不另產 baseline。
        it(`E2E-007 [${lang}] Docs/Edit/Test 分頁預設與切換`, async function() {

            await gotoReady(page, lang)

            //assert：三分頁皆存在、預設 Docs active（docs 標頭 op-title 可見）——spec 驗證1
            let segInit = await page.evaluate(() => ({
                segBtns: Array.from(document.querySelectorAll('.w-seg-btn')).map((e) => ({ t: (e.innerText || '').trim(), on: e.className.includes('on') })),
                opTitle: document.querySelector('.op-title') ? (document.querySelector('.op-title').innerText || '').trim() : null,
            }))
            let segTexts = segInit.segBtns.map((s) => s.t)
            assert.ok(segTexts.includes(T[lang].docs), `分頁應含「${T[lang].docs}」`)
            assert.ok(segTexts.includes(T[lang].edit), `分頁應含「${T[lang].edit}」`)
            assert.ok(segTexts.includes(T[lang].test), `分頁應含「${T[lang].test}」`)
            let docsBtn = segInit.segBtns.find((s) => s.t === T[lang].docs)
            assert.ok(docsBtn && docsBtn.on, 'Docs 分頁載入時應為 active')
            assert.ok(segInit.opTitle, '載入時 docs 標頭 op-title 應可見')

            //act：點「Test」分頁
            await page.getByText(T[lang].test, { exact: true }).first().click({ timeout: 8000 })
            //等 docs 標頭消失（切離 docs）——spec 驗證1
            await waitUntilExist(page, 'docs header gone after Test', () => !document.querySelector('.op-title'), { timeout: 8000 })
            let opAfterTest = await page.evaluate(() => document.querySelector('.op-title') ? 'present' : 'absent')
            assert.strictEqual(opAfterTest, 'absent', '點 Test 後 docs 標頭應不再顯示')

            //act：點回「Docs」分頁
            await page.getByText(T[lang].docs, { exact: true }).first().click({ timeout: 8000 })
            //等 docs 標頭重新顯示——spec 驗證1
            await waitUntilExist(page, 'docs header back after Docs', () => !!document.querySelector('.op-title'), { timeout: 8000 })
            let opAfterDocs = await page.evaluate(() => document.querySelector('.op-title') ? (document.querySelector('.op-title').innerText || '').trim() : 'absent')
            assert.strictEqual(opAfterDocs, '取得API清單', '點 Docs 後 docs 標頭應重新顯示第一筆')

            //spec 驗證2：不另產 baseline（docs 態已由 E2E-001 守）。

        })

    }

    //E2E-008 語系切換本身為單輪涵蓋（spec：本 case 即雙語切換，單輪），不放進 LANGS 迴圈。
    //真實 user path：①開 /?token=sys（預設 eng）②等樹渲染 ③看分頁為英文 ④點語系選單切「中文」
    //⑤看分頁/pills 轉中文 ⑥再切「English」看恢復英文。不另產 baseline。
    it('E2E-008 語系切換即時重渲染（單輪）', async function() {

        await gotoReady(page)

        //assert：eng 時分頁顯示 Docs/Edit/Test、pills 標籤為英文——spec 驗證1
        let engInfo = await page.evaluate(() => ({
            seg: Array.from(document.querySelectorAll('.w-seg-btn')).map((e) => (e.innerText || '').trim()),
            pills: (document.querySelector('.pills')?.innerText || '').trim(),
        }))
        assert.ok(engInfo.seg.includes('Docs') && engInfo.seg.includes('Edit') && engInfo.seg.includes('Test'), 'eng 分頁應為 Docs/Edit/Test')
        assert.ok(engInfo.pills.includes('Levels'), 'eng pills 應含英文標籤「Levels」')

        //act：點語系選單切「中文」
        await page.getByText('English', { exact: true }).first().click({ timeout: 8000 })
        await page.waitForTimeout(400)
        await page.getByText('中文', { exact: true }).first().click({ timeout: 8000 })
        await waitUntilExist(page, 'cht tabs', () => {
            let seg = Array.from(document.querySelectorAll('.w-seg-btn')).map((e) => (e.innerText || '').trim())
            return seg.includes('文件')
        }, { timeout: 8000 })

        //assert：切 cht 後分頁顯示 文件/編輯/測試、pills 標籤轉中文——spec 驗證1
        let chtInfo = await page.evaluate(() => ({
            seg: Array.from(document.querySelectorAll('.w-seg-btn')).map((e) => (e.innerText || '').trim()),
            pills: (document.querySelector('.pills')?.innerText || '').trim(),
        }))
        assert.ok(chtInfo.seg.includes('文件') && chtInfo.seg.includes('編輯') && chtInfo.seg.includes('測試'), 'cht 分頁應為 文件/編輯/測試')
        assert.ok(chtInfo.pills.includes('所屬階層'), 'cht pills 標籤應轉中文「所屬階層」')

        //act：再切回「English」
        await page.getByText('中文', { exact: true }).first().click({ timeout: 8000 })
        await page.waitForTimeout(400)
        await page.getByText('English', { exact: true }).first().click({ timeout: 8000 })
        await waitUntilExist(page, 'eng tabs back', () => {
            let seg = Array.from(document.querySelectorAll('.w-seg-btn')).map((e) => (e.innerText || '').trim())
            return seg.includes('Docs')
        }, { timeout: 8000 })

        //assert：切回 eng 後恢復英文——spec 驗證1
        let backInfo = await page.evaluate(() => Array.from(document.querySelectorAll('.w-seg-btn')).map((e) => (e.innerText || '').trim()))
        assert.ok(backInfo.includes('Docs') && backInfo.includes('Edit') && backInfo.includes('Test'), '切回 eng 分頁應恢復 Docs/Edit/Test')

        //spec 驗證2：不另產 baseline（切換互動；各語系外觀由其他 case 雙語輪覆蓋）。

    })

    for (let lang of LANGS) {

        //E2E-009 真實 user path：①開 /?token=sys ②等樹渲染 ③(cht)切語系 ④點抽屜「收合」鈕→左樹搜尋框不可見
        //⑤截收合態 ⑥點「展開」鈕→左樹恢復可見。
        it(`E2E-009 [${lang}] 左側抽屜顯隱`, async function() {

            await gotoReady(page, lang)

            //初始：左樹搜尋框可見（drawer 展開）
            let sInp = searchInput(page)
            assert.ok(await sInp.isVisible(), '初始左樹搜尋框應可見（drawer 展開）')

            //act：點抽屜「收合」鈕（mdiArrowLeft，drawer 右上）
            let collapseBtn = drawerCollapseBtn(page)
            assert.ok((await collapseBtn.count()) > 0, '應找到抽屜收合鈕（mdiArrowLeft）')
            await collapseBtn.first().click({ timeout: 8000 })
            //等收合到位：搜尋框滑出視窗（x<0 或 width=0 → not visible）——spec 驗證1
            await waitUntilExist(page, 'drawer collapsed (search hidden)', () => {
                let inp = document.querySelector('input[placeholder]')
                if (!inp) {
                    return true //搜尋框整個移除亦視為收合
                }
                let b = inp.getBoundingClientRect()
                return !(b.width > 0 && b.x >= 0)
            }, { timeout: 8000 })

            //assert UI（spec 驗證1：收合後左樹搜尋框不可見）
            let searchVisibleAfterCollapse = await page.evaluate(() => {
                let inp = document.querySelector('input[placeholder]')
                if (!inp) {
                    return false
                }
                let b = inp.getBoundingClientRect()
                return b.width > 0 && b.x >= 0
            })
            assert.ok(!searchVisibleAfterCollapse, '收合後左樹搜尋框應不可見（抽屜滑出視窗）')

            //pixel baseline（收合態）——spec 驗證2：紅框標注左上「展開」鈕（收合後的抽屜控制）
            let buf = await captureStableWithBox(page, `div[tabindex="0"]:has(svg path[d="${ARROW_RIGHT}"])`)
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-009-drawer-collapsed.png`, buf)

            //act：點「展開」鈕（mdiArrowRight，content 左上）
            let expandBtn = drawerExpandBtn(page)
            assert.ok((await expandBtn.count()) > 0, '收合後應出現抽屜展開鈕（mdiArrowRight）')
            await expandBtn.first().click({ timeout: 8000 })
            //等展開到位：搜尋框恢復可見——spec 驗證1
            await waitUntilExist(page, 'drawer expanded (search visible)', () => {
                let inp = document.querySelector('input[placeholder]')
                if (!inp) {
                    return false
                }
                let b = inp.getBoundingClientRect()
                return b.width > 0 && b.x >= 0
            }, { timeout: 8000 })

            //assert UI（spec 驗證1：再點後左樹恢復可見）
            assert.ok(await searchInput(page).isVisible(), '展開後左樹搜尋框應恢復可見')

        })

    }

})
