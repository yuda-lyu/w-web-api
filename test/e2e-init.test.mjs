//e2e：初始畫面語系（server settings.language 注入）
//
//重要流程（spec bullets，見 spec/流程_初始語系.md）：
//- E2E-001：以 server settings.language=<lang> 啟動後端 → 載入 /?token=sys（不帶 ?lang=）→ 初始畫面即該語系。
//
//act 走真實 user 路徑：以指定 server 語系重啟後端（restartBackend(genTempSettings({language})))，
//瀏覽器開 /?token=sys（不帶 URL ?lang=，純靠 server 注入 window.___pmwperm___.language）。
//assert：window.___pmwperm___.language === 指定語系（server 注入）+ UI 文字為該語系；pixel baseline。
//雙語 eng/cht 各一輪、各自 fresh browser。
//
//與「功能流程之 ?lang= 載入」（display/edit/apitest 的 cht 案）區別：那些走 URL ?lang=（前端 getLang 最高優先）；
//本檔走 server settings.language → 注入 index.html → window（getLang 之 window 來源），驗「server 端決定初始語系」。
//
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import {
    startServersOnce,
    restartBackend,
    genTempSettings,
    captureStable,
    captureStableWithBox,
    cropRegion,
    overlayImageAt,
    waitUntilExist,
    resetToBaseSeed,
    assertOrRegenBaseline,
    baseUrl,
    launchBrowser,
    REGEN,
} from './e2e-setup.mjs'


let FLOW = 'init'
let LANGS = ['eng', 'cht']

//連線中(csIng)/已登入(csLogin) 文字皆來自 mUI kpFallback，後端 kpLang 未載入時依「注入語系」顯示。
//connState 由 App.vue login 流程控制：預設 csIng；getUserByToken(HTTP) 成功 → loginSuccess → csLogin；
//ready = csLogin && webInfor(經 converhp /api/main 載入) → 顯示 Layout。故可分別凍結三狀態：
//  csIng   ：hang /api/getUserByToken → login 不完成、停連線中
//  csLogin ：hang /api/main → getUserByToken 成功進 csLogin，但 webInfor 永不載入、停已登入
//  loaded  ：正常載入 → 主畫面
let T = {
    eng: { staTitle: 'Statistics Information', timeRange: 'Time range', win: 'eng', connecting: 'Connecting', loggedIn: 'Logged in', errConn: 'Unable to connect', loggedOut: 'Logged out' },
    cht: { staTitle: '統計資訊', timeRange: '時間範圍', win: 'cht', connecting: '連線中', loggedIn: '已登入', errConn: '無法連線', loggedOut: '已登出' },
}


//以前端連線狀態 API 強制切 connState（CLAUDE.md「e2e 測試初始畫面語系」明文授權之測試機構：
//連線懸置後，某些連線狀態畫面（連線錯誤/已登出）難自然觸發，改以前端狀態 API 強制切到目標狀態，
//該狀態文字走前端內建字典 kpFallback 依注入語系顯示）。經 Vuex 唯一合法變更路徑 store.commit，
//store 由 Vue 2 掛在各組件根元素之 __vue__ 取得（vm.$el.__vue__ = vm）。
async function forceConnState(page, connState) {
    await page.evaluate((cs) => {
        let store = null
        let els = document.querySelectorAll('*')
        for (let i = 0; i < els.length; i++) {
            let vm = els[i].__vue__
            if (vm && vm.$store && vm.$store.types) {
                store = vm.$store
                break
            }
        }
        if (!store) {
            throw new Error('vuex store not found via __vue__')
        }
        store.commit(store.types.UpdateConnState, cs)
    }, connState)
}


//確保 dist/index.tmp 為含 {language} 佔位符之「不可變模板」，供 WWebApi 每次重啟依 settings.language 注入。
//WWebApi 啟動時優先讀 index.tmp（不存在才退回 index.html）；首次注入後 index.html 之 {language} 已被取代，
//若無 index.tmp，第 2 次起就無佔位符可注入。故從 dist/index.html 把已注入的 language: '...' 還原為 '{language}'
//寫成 index.tmp（冪等，正規式容許有無空白）。
function ensureIndexTmpl() {
    let distHtml = path.resolve('dist', 'index.html')
    let distTmp = path.resolve('dist', 'index.tmp')
    if (!fs.existsSync(distHtml)) {
        throw new Error('dist/index.html 不存在 — 請先 npm run build 產 dist')
    }
    let c = fs.readFileSync(distHtml, 'utf8')
    c = c.replace(/language:\s*'[^']*'/, "language: '{language}'")
    fs.writeFileSync(distTmp, c, 'utf8')
}


//E2E-003 全頁截圖之「圖表區/統計表區」貼圖覆蓋（同 e2e-stainfor 機制、無紅框版）：
//進站預設頁為統計頁後，主畫面含 live 圖表（x 軸日期相對今日漂移、canvas GPU 非決定性）與
//統計表計數（隨後端執行期 log 累積漂移），不凍結則 compare 必炸；語系斷言仍讀 live DOM。
async function captureInitMainShot(page, lang, caseName) {
    let buf = await captureStable(page) //全頁乾淨截圖、不畫紅框（spec：整體主畫面基準）
    let regions = [
        { key: 'chart', sel: '.stats-chart-area' },
        { key: 'table', sel: '.stats-table-area' },
    ]
    for (let rg of regions) {
        let rect = await page.evaluate((s) => {
            let el = document.querySelector(s)
            if (!el) {
                return null
            }
            let r = el.getBoundingClientRect()
            return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }
        }, rg.sel)
        if (!rect) {
            continue
        }
        let refPath = path.join(`./test/pics/${FLOW}`, `_staref-${lang}-${caseName}-${rg.key}.png`)
        if (!fs.existsSync(refPath)) {
            //自舉限 REGEN（技能 §7.1「只在授權的 REGEN 中自舉，正常測試缺檔即 fail」）：
            //正常測試模式下 ref 不存在代表尚未授權產製，不可靜默用當次截圖頂替（會把當次偶發畫面凍結為「參考真相」）。
            if (!REGEN) {
                throw new Error(`per-item ref 不存在: ${refPath}（請以 --baseline 產製）`)
            }
            fs.mkdirSync(path.dirname(refPath), { recursive: true })
            let cropped = await cropRegion(buf, rect) //bootstrap：裁該區小圖存 ref（刪檔可重產）
            fs.writeFileSync(refPath, cropped)
        }
        let refBuf = fs.readFileSync(refPath)
        buf = await overlayImageAt(buf, refBuf, Math.max(0, rect.x), Math.max(0, rect.y))
    }
    return buf
}


//不帶 ?lang= 載入（純靠 server 注入之初始語系）。進站預設頁為統計資訊頁：
//等該語系統計頁標題（Layout 掛載 + 語系套用）+ 圖表 canvas（資料到位、畫面穩定）。
async function gotoReadyNoLang(page, lang) {
    await page.goto(`${baseUrl}/?token=sys`, { waitUntil: 'load', timeout: 30000 })
    await waitUntilExist(page, `app ready (stats title ${T[lang].staTitle})`, (m) => (document.body.innerText || '').includes(m), { timeout: 40000, arg: T[lang].staTitle })
    await waitUntilExist(page, 'echarts canvas', () => !!document.querySelector('.stats-chart-area canvas'), { timeout: 20000 })
    await page.waitForTimeout(1200) //等 echarts 渲染/動畫 settle
}


describe('e2e-init (初始畫面語系 / server 注入)', function() {
    this.timeout(240000)

    let browser = null
    let ctx = null
    let page = null

    before(async function() {
        this.timeout(180000)
        await startServersOnce() //確保 dist 已 build + 後端在跑
        ensureIndexTmpl()        //建 dist/index.tmp 不可變模板，供每次重啟依語系注入
    })

    after(async function() {
        this.timeout(30000)
        await restartBackend('./settings.json') //還原預設語系給後續測試/時段
        await resetToBaseSeed()
    })

    beforeEach(async function() {
        this.timeout(180000)
        await resetToBaseSeed()
        browser = await launchBrowser()
        ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        page = await ctx.newPage()
    })

    afterEach(async function() {
        if (browser) {
            await browser.close()
            browser = null
        }
    })

    //截「連線狀態覆蓋層」之某一狀態：框住狀態文字、遮罩旋轉 spinner（SVG <animate> 非決定性）。
    async function captureStateScreen(page, stateText) {
        return await captureStableWithBox(page, page.getByText(stateText).first(), { mask: ['img[src^="data:image/svg"]'] })
    }

    for (let lang of LANGS) {

        //E2E-001 連線中(csIng)：hang /api/getUserByToken → login 不完成、停連線中（進站第一眼）。
        //此時後端 kpLang 未載入，連線中文字由 mUI kpFallback 依「注入語系」顯示，正是 server 注入初始語系最關鍵的觀察點。
        it(`E2E-001 [${lang}] 連線中畫面呈現該語系文字（server 注入、不帶 ?lang=）`, async function() {

            await restartBackend(genTempSettings({ language: lang }))

            //hang login 檢查（getUserByToken）→ loginSuccess 不觸發 → 停 csIng；併 hang 連線通道確保不前進
            await page.route('**/api/getUserByToken**', () => {})
            await page.route('**/api/main', () => {})
            await page.route('**/api/ulctr', () => {})
            await page.route('**/api/slc', () => {})

            await page.goto(`${baseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await waitUntilExist(page, `connecting (${T[lang].connecting})`, (t) => (document.body.innerText || '').includes(t), { timeout: 15000, arg: T[lang].connecting })

            let info = await page.evaluate(() => ({ winLang: (window.___pmwperm___ || {}).language, body: document.body.innerText || '' }))
            let other = T[lang === 'eng' ? 'cht' : 'eng']
            assert.strictEqual(info.winLang, T[lang].win, `window.___pmwperm___.language 應為 server 注入之「${T[lang].win}」（實得「${info.winLang}」）`)
            assert.ok(info.body.includes(T[lang].connecting), `連線中畫面應含該語系「${T[lang].connecting}」（實際: ${info.body.slice(0, 120)}）`)
            assert.ok(!info.body.includes(other.connecting), `連線中畫面不應含另一語系「${other.connecting}」`)
            assert.ok(!info.body.includes(T[lang].loggedIn), `應仍停連線中、尚未進已登入「${T[lang].loggedIn}」`)
            assert.ok(!info.body.includes(T[lang].staTitle), `應仍停連線中、尚未顯示主畫面「${T[lang].staTitle}」`)

            let buf = await captureStateScreen(page, T[lang].connecting)
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-001-connecting.png`, buf)

        })

        //E2E-002 已登入(csLogin)：hang /api/main → getUserByToken 成功進 csLogin，但 webInfor 永不載入 → 停已登入。
        //已登入文字同樣由 mUI kpFallback 依注入語系顯示（後端 kpLang 仍未載入）。
        it(`E2E-002 [${lang}] 已登入畫面呈現該語系文字（server 注入、不帶 ?lang=）`, async function() {

            await restartBackend(genTempSettings({ language: lang }))

            //只 hang 連線通道（不 hang getUserByToken）→ 進 csLogin、停在已登入（webInfor 未到不進主畫面）
            await page.route('**/api/main', () => {})
            await page.route('**/api/ulctr', () => {})
            await page.route('**/api/slc', () => {})

            await page.goto(`${baseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await waitUntilExist(page, `logged-in (${T[lang].loggedIn})`, (t) => (document.body.innerText || '').includes(t), { timeout: 15000, arg: T[lang].loggedIn })

            let info = await page.evaluate(() => ({ winLang: (window.___pmwperm___ || {}).language, body: document.body.innerText || '' }))
            let other = T[lang === 'eng' ? 'cht' : 'eng']
            assert.strictEqual(info.winLang, T[lang].win, `window.___pmwperm___.language 應為 server 注入之「${T[lang].win}」（實得「${info.winLang}」）`)
            assert.ok(info.body.includes(T[lang].loggedIn), `已登入畫面應含該語系「${T[lang].loggedIn}」（實際: ${info.body.slice(0, 120)}）`)
            assert.ok(!info.body.includes(other.loggedIn), `已登入畫面不應含另一語系「${other.loggedIn}」`)
            assert.ok(!info.body.includes(T[lang].staTitle), `應仍停已登入、尚未顯示主畫面「${T[lang].staTitle}」`)

            let buf = await captureStateScreen(page, T[lang].loggedIn)
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-002-logged-in.png`, buf)

        })

        //E2E-003 連線建立後主畫面：正常載入 → 進站預設頁即統計資訊頁 → 驗 window 注入語系 + 統計頁該語系文字。
        it(`E2E-003 [${lang}] 連線後主畫面語系（server settings.language 注入、不帶 ?lang=）`, async function() {

            await restartBackend(genTempSettings({ language: lang }))
            await gotoReadyNoLang(page, lang)

            let info = await page.evaluate(() => ({ winLang: (window.___pmwperm___ || {}).language, body: document.body.innerText || '' }))
            let other = T[lang === 'eng' ? 'cht' : 'eng']
            assert.strictEqual(info.winLang, T[lang].win, `window.___pmwperm___.language 應為 server 注入之「${T[lang].win}」（實得「${info.winLang}」）`)
            assert.ok(info.body.includes(T[lang].staTitle), `主畫面（統計資訊頁）應顯示該語系標題「${T[lang].staTitle}」`)
            assert.ok(info.body.includes(T[lang].timeRange), `統計頁控制列應顯示該語系「${T[lang].timeRange}」`)
            assert.ok(!info.body.includes(other.staTitle) || T[lang].staTitle.includes(other.staTitle), `不應含另一語系標題「${other.staTitle}」`)

            let buf = await captureInitMainShot(page, lang, 'E2E-003-page-loaded')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-003-page-loaded.png`, buf)

        })

        //E2E-004 連線錯誤(csErrConn)：hang getUserByToken + 連線通道 → 停連線中，再以前端狀態 API 強制切 csErrConn。
        //連線錯誤文字由 mUI kpFallback 依「注入語系」顯示（後端 kpLang 未載入）。狀態圖示為靜態 PNG，無旋轉動畫、無需遮蔽。
        it(`E2E-004 [${lang}] 連線錯誤畫面呈現該語系文字（server 注入、不帶 ?lang=）`, async function() {

            await restartBackend(genTempSettings({ language: lang }))

            //hang login 檢查與連線通道 → login 不完成、停連線中（避免 login 流程覆蓋稍後強制之 connState）
            await page.route('**/api/getUserByToken**', () => {})
            await page.route('**/api/main', () => {})
            await page.route('**/api/ulctr', () => {})
            await page.route('**/api/slc', () => {})

            await page.goto(`${baseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 30000 })
            //先等畫面停在連線中（app 已掛載、store 就緒）再強制切 connState
            await waitUntilExist(page, `connecting (${T[lang].connecting})`, (t) => (document.body.innerText || '').includes(t), { timeout: 15000, arg: T[lang].connecting })

            //以前端連線狀態 API 強制切至連線錯誤（授權之測試機構）
            await forceConnState(page, 'csErrConn')
            await waitUntilExist(page, `err-conn (${T[lang].errConn})`, (t) => (document.body.innerText || '').includes(t), { timeout: 8000, arg: T[lang].errConn })

            let info = await page.evaluate(() => ({ winLang: (window.___pmwperm___ || {}).language, body: document.body.innerText || '' }))
            let other = T[lang === 'eng' ? 'cht' : 'eng']
            assert.strictEqual(info.winLang, T[lang].win, `window.___pmwperm___.language 應為 server 注入之「${T[lang].win}」（實得「${info.winLang}」）`)
            assert.ok(info.body.includes(T[lang].errConn), `連線錯誤畫面應含該語系「${T[lang].errConn}」（實際: ${info.body.slice(0, 120)}）`)
            assert.ok(!info.body.includes(other.errConn), `連線錯誤畫面不應含另一語系「${other.errConn}」`)
            assert.ok(!info.body.includes(T[lang].staTitle), `應仍停狀態畫面、尚未顯示主畫面「${T[lang].staTitle}」`)

            let buf = await captureStateScreen(page, T[lang].errConn)
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-004-err-conn.png`, buf)

        })

        //E2E-005 已登出(csLogout)：同 E2E-004 hang 使停連線中，再以前端狀態 API 強制切 csLogout。
        //已登出文字由 mUI kpFallback 依注入語系顯示。狀態圖示為靜態 PNG，無需遮蔽。
        it(`E2E-005 [${lang}] 已登出畫面呈現該語系文字（server 注入、不帶 ?lang=）`, async function() {

            await restartBackend(genTempSettings({ language: lang }))

            await page.route('**/api/getUserByToken**', () => {})
            await page.route('**/api/main', () => {})
            await page.route('**/api/ulctr', () => {})
            await page.route('**/api/slc', () => {})

            await page.goto(`${baseUrl}/?token=sys`, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await waitUntilExist(page, `connecting (${T[lang].connecting})`, (t) => (document.body.innerText || '').includes(t), { timeout: 15000, arg: T[lang].connecting })

            await forceConnState(page, 'csLogout')
            await waitUntilExist(page, `logged-out (${T[lang].loggedOut})`, (t) => (document.body.innerText || '').includes(t), { timeout: 8000, arg: T[lang].loggedOut })

            let info = await page.evaluate(() => ({ winLang: (window.___pmwperm___ || {}).language, body: document.body.innerText || '' }))
            let other = T[lang === 'eng' ? 'cht' : 'eng']
            assert.strictEqual(info.winLang, T[lang].win, `window.___pmwperm___.language 應為 server 注入之「${T[lang].win}」（實得「${info.winLang}」）`)
            assert.ok(info.body.includes(T[lang].loggedOut), `已登出畫面應含該語系「${T[lang].loggedOut}」（實際: ${info.body.slice(0, 120)}）`)
            assert.ok(!info.body.includes(other.loggedOut), `已登出畫面不應含另一語系「${other.loggedOut}」`)
            assert.ok(!info.body.includes(T[lang].staTitle), `應仍停狀態畫面、尚未顯示主畫面「${T[lang].staTitle}」`)

            let buf = await captureStateScreen(page, T[lang].loggedOut)
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-005-logged-out.png`, buf)

        })

    }

})
