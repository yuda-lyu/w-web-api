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
//案例管線（2026-09-28）：產製端（mocha --baseline 或 env E2E_REGEN=1）與比對端呼叫同一 runBaselineCase（w-package-tools-e2e，經 ./tools/e2eLib.mjs）：
//prepare（DB 重置）→ fresh browser（openCasePage，1440×900）→ run（原 it 流程：重啟後端換語系 → 語意斷言 → 截圖，回傳 {圖鍵: buf}）→
//全部斷言通過後才寫檔（REGEN；createBaselineGate 之 E2E_BASELINE_OUT_DIR / --write-mode）或比對（pixelmatch 容差）→ finally 關瀏覽器。
//例外：E2E-003 之 _staref 參考片段於 run 內自舉（REGEN 且缺檔時直接寫 test/pics/init/，不受 E2E_BASELINE_OUT_DIR 影響）。
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
    baseUrl,
    launchBrowser,
    REGEN,
} from './tools/e2e-setup.mjs'
import { runBaselineCase, createBaselineGate, openCasePage, composeBox, itemsUnionBox } from './tools/e2eLib.mjs'


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


//E2E-003 全頁截圖之「圖表區/統計表區」貼圖覆蓋（同 e2e-stainfor 機制）＋最後合成紅框：
//進站預設頁為統計頁後，主畫面含 live 圖表（x 軸日期相對今日漂移、canvas GPU 非決定性）與
//統計表計數（隨後端執行期 log 累積漂移），不凍結則 compare 必炸；語系斷言仍讀 live DOM。
//紅框（2026-09-28，spec 初:46 修改留痕；原「全頁乾淨截圖、不畫紅框」違技能 §7.1「每張皆須有框」）：框住統計頁內容區 .stats-panel
//（含該語系標題、控制列、圖表與統計表＝進站後露出之內容區，技能 §7.2）。順序必須是「截圖 → 貼 _staref → 最後 composeBox」，
//框在貼圖之後合成才永遠可見；_staref 為無框之內容裁片，框改在最後畫故既有 _staref 仍有效、不需重建。
async function captureInitMainShot(page, lang, caseName) {
    let buf = await captureStable(page) //先截無框全頁（貼圖覆蓋之底圖）
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
    //最後合成紅框：統計頁內容區（buffer 座標＝視窗座標加捲動量）
    let panel = await page.evaluate(() => {
        let el = document.querySelector('.stats-panel')
        if (!el) {
            return null
        }
        let r = el.getBoundingClientRect()
        return { left: r.left + window.scrollX, top: r.top + window.scrollY, right: r.right + window.scrollX, bottom: r.bottom + window.scrollY }
    })
    assert.ok(panel && panel.right - panel.left > 0 && panel.bottom - panel.top > 0, '統計頁內容區 .stats-panel 應存在且有尺寸（紅框目標）')
    buf = await composeBox(buf, panel, { guardSmall: false })
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


//截「連線狀態覆蓋層」之某一狀態：框住狀態指示整顆（狀態圖示與狀態文字之聯集，技能 §7.3-3）。
//圖示若為含 SVG <animate> 之轉圈，w-package-tools-e2e captureStable 於截圖後貼「去掉動畫元素之靜態影格」（決定性，手冊可見圖示）。
//2026-09-28 改：原只框文字、並以 mask 把轉圈塗成黑方塊（技能 §8.2 手冊用圖不填黑）
async function captureStateScreen(page, stateText) {
    //LayoutState.vue 結構：容器 > [img(狀態圖示), div(margin-left:10px) > div(狀態文字)]；圖示取文字所在 div 之前一個 img 兄弟
    //（不用全頁第一個 data URL 圖，以免命中他處圖片）
    //狀態文字元素緊貼文字寬，直接框元素時紅框內緣距文字末端僅約 1px（紅框壓字）→ 經 w-package-tools-e2e itemsUnionBox fit 量墨跡並外擴 inkPad（2026-09-28）
    let txt = page.getByText(stateText).first()
    let icon = txt.locator('xpath=../preceding-sibling::img[1]')
    return await captureStableWithBox(page, [icon, itemsUnionBox(txt, { fit: true })])
}


//案例流程（產製端與比對端共用）：原 it 內流程逐字保留（語意斷言在截圖前、狀態仍在畫面上），
//截圖改為回傳 {圖鍵: buf}，由 runBaselineCase 於全部斷言通過後才寫檔 / 比對（原為 it 內 assertOrRegenBaseline 當場寫檔 / 比對）。


//E2E-001 連線中(csIng)：hang /api/getUserByToken → login 不完成、停連線中（進站第一眼）。
//此時後端 kpLang 未載入，連線中文字由 mUI kpFallback 依「注入語系」顯示，正是 server 注入初始語系最關鍵的觀察點。
async function runConnecting(page, lang) {

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
    return { 'E2E-001-connecting': buf }

}

//E2E-002 已登入(csLogin)：hang /api/main → getUserByToken 成功進 csLogin，但 webInfor 永不載入 → 停已登入。
//已登入文字同樣由 mUI kpFallback 依注入語系顯示（後端 kpLang 仍未載入）。
async function runLoggedIn(page, lang) {

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
    return { 'E2E-002-logged-in': buf }

}

//E2E-003 連線建立後主畫面：正常載入 → 進站預設頁即統計資訊頁 → 驗 window 注入語系 + 統計頁該語系文字。
async function runPageLoaded(page, lang) {

    await restartBackend(genTempSettings({ language: lang }))
    await gotoReadyNoLang(page, lang)

    let info = await page.evaluate(() => ({ winLang: (window.___pmwperm___ || {}).language, body: document.body.innerText || '' }))
    let other = T[lang === 'eng' ? 'cht' : 'eng']
    assert.strictEqual(info.winLang, T[lang].win, `window.___pmwperm___.language 應為 server 注入之「${T[lang].win}」（實得「${info.winLang}」）`)
    assert.ok(info.body.includes(T[lang].staTitle), `主畫面（統計資訊頁）應顯示該語系標題「${T[lang].staTitle}」`)
    assert.ok(info.body.includes(T[lang].timeRange), `統計頁控制列應顯示該語系「${T[lang].timeRange}」`)
    assert.ok(!info.body.includes(other.staTitle) || T[lang].staTitle.includes(other.staTitle), `不應含另一語系標題「${other.staTitle}」`)

    let buf = await captureInitMainShot(page, lang, 'E2E-003-page-loaded')
    return { 'E2E-003-page-loaded': buf }

}

//E2E-004 連線錯誤(csErrConn)：hang getUserByToken + 連線通道 → 停連線中，再以前端狀態 API 強制切 csErrConn。
//連線錯誤文字由 mUI kpFallback 依「注入語系」顯示（後端 kpLang 未載入）。狀態圖示為靜態 PNG，無旋轉動畫、無需遮蔽。
async function runErrConn(page, lang) {

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
    return { 'E2E-004-err-conn': buf }

}

//E2E-005 已登出(csLogout)：同 E2E-004 hang 使停連線中，再以前端狀態 API 強制切 csLogout。
//已登出文字由 mUI kpFallback 依注入語系顯示。狀態圖示為靜態 PNG，無需遮蔽。
async function runLoggedOut(page, lang) {

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
    return { 'E2E-005-logged-out': buf }

}


//案例宣告：順序＝原 it 順序；title＝原 it 標題逐字（含語系）；stages＝該案產出之圖鍵（標準圖 init-<lang>-<圖鍵>.png）
let cases = [
    {
        name: 'E2E-001-connecting',
        title: (lang) => `E2E-001 [${lang}] 連線中畫面呈現該語系文字（server 注入、不帶 ?lang=）`,
        run: runConnecting,
        stages: ['E2E-001-connecting'],
    },
    {
        name: 'E2E-002-logged-in',
        title: (lang) => `E2E-002 [${lang}] 已登入畫面呈現該語系文字（server 注入、不帶 ?lang=）`,
        run: runLoggedIn,
        stages: ['E2E-002-logged-in'],
    },
    {
        name: 'E2E-003-page-loaded',
        title: (lang) => `E2E-003 [${lang}] 連線後主畫面語系（server settings.language 注入、不帶 ?lang=）`,
        run: runPageLoaded,
        stages: ['E2E-003-page-loaded'],
    },
    {
        name: 'E2E-004-err-conn',
        title: (lang) => `E2E-004 [${lang}] 連線錯誤畫面呈現該語系文字（server 注入、不帶 ?lang=）`,
        run: runErrConn,
        stages: ['E2E-004-err-conn'],
    },
    {
        name: 'E2E-005-logged-out',
        title: (lang) => `E2E-005 [${lang}] 已登出畫面呈現該語系文字（server 注入、不帶 ?lang=）`,
        run: runLoggedOut,
        stages: ['E2E-005-logged-out'],
    },
]

//標準圖路徑：test/pics/init/init-<lang>-<圖鍵>.png（與原 assertOrRegenBaseline 之 baselinePath 相同）
let pathOf = (lang, key) => path.resolve('test', 'pics', FLOW, `${FLOW}-${lang}-${key}.png`)

//REGEN 時建篩選器：E2E_BASELINE_OUT_DIR（寫到暫存目錄做等價驗證）、--write-mode（all / missing / changed）；mocha 以 --grep 選案
let gate = REGEN ? createBaselineGate({ langs: LANGS, cases }) : null
//REGEN 結束時驗證 --names 之每一項皆有產出(例如被 --grep 排除之案例)，不靜默略過
if (gate) {
    after(function() {
        gate.finalize()
    })
}

//單一案例管線：prepare（原 beforeEach 之 DB 重置）→ fresh browser（原 beforeEach 之 launch + newContext 1440×900 + newPage）→
//run（原 it 流程）→ 全部斷言通過後寫檔（REGEN）或比對 → finally 關瀏覽器（原 afterEach）
async function runCase(lang, c) {
    return await runBaselineCase({
        mode: REGEN ? 'regen' : 'compare',
        lang,
        name: c.name,
        run: c.run,
        stages: c.stages,
        compareOnly: !!c.compareOnly,
        launch: launchBrowser,
        openPage: (browser) => openCasePage(browser, { contextOptions: { viewport: { width: 1440, height: 900 } } }),
        prepare: async () => {
            await resetToBaseSeed() //原 beforeEach 之 DB 重置
        },
        pathOf,
        labelOf: (lg, key) => `${FLOW}-${lg}-${key}`,
        gate,
    })
}


describe('e2e-init (初始畫面語系 / server 注入)', function() {
    this.timeout(240000)

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

    //每案 DB 重置 + fresh browser（原 beforeEach / afterEach）改由 runCase 負責，--grep 單跑亦完整
    for (let lang of LANGS) {
        for (let c of cases) {
            it(c.title(lang), async function() {
                await runCase(lang, c)
            })
        }
    }

})
