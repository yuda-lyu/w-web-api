//e2e 共用基礎設施（改寫自 w-web-sso/test/e2e-setup.mjs，依 api2 架構精簡）。
//
//與 SSO 差異：
//- api2 後端 srv.mjs 同時服務 build 後的 dist（port 11005），故 e2e 直接瀏覽 11005，
//  不另起前端 dev server（8080）。startServersOnce 會先 build 再 spawn srv.mjs。
//- baseline 比對採 pixelmatch 容差（反鋸齒感知）+ maxDiffPixels，對齊 SSO assertBaselineMatch；治次像素/字形 flake。
//- 未移植 SSO 之 maskRegions/maskBelowY/動畫 img 遮罩：本專案截圖態無 SMIL 動畫 img，且用 DOM 層遮罩
//  （captureStableWithBox 之 opts.mask），無 buffer 後製遮罩需求；日後若有再移植。
//- base seed = ds.apis.funTest()（固定 id，hermetic）。
//
import 'dotenv/config'
import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import JSON5 from 'json5'
import sharp from 'sharp'
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import ds from '../src/schema/index.mjs'
import { woItems } from '../g_mOrm.mjs'

//baseline 產製模式：mocha 帶 --baseline 或 env E2E_REGEN=1 時寫檔；否則 pixelmatch 容差比對。
let REGEN = process.argv.includes('--baseline') || process.env.E2E_REGEN === '1'
//診斷閘門紀律：診斷 env 生效時絕不可寫正式 baseline（技能 references/pixel-mismatch-diagnosis.md §6）
if (REGEN && (process.env.E2E_BARE || process.env.E2E_DIAG)) {
    throw new Error('拒絕在診斷 env (E2E_BARE / E2E_DIAG) 下寫入正式 baseline')
}

//一律 127.0.0.1（避開 Windows IPv6 Happy-Eyeballs 回退延遲，詳全域 CLAUDE.md §6.3）
let baseUrl = 'http://127.0.0.1:11005'

//瀏覽器 launch 一律帶 chromiumLaunchArgs（確定性渲染組）。headless Chromium 預設 GPU 光柵化 + subpixel
//字形 AA 在 byte 級截圖比對下非決定性：同一版面（實測 .op-title 之 DOM top 恆為 166、無位移），eng 拉丁字
//走 subpixel AA 仍偶發數十像素散落差異（cht 灰階 AA 較穩，故僅 eng 中招）。此組關 GPU（改 CPU Skia）、固定
//srgb 色彩、關 LCD/subpixel 字形定位、關 skia runtime opt 與 partial raster，實測截圖 self-consistency 5/5（裸 launch 僅 2/4）。
let chromiumLaunchArgs = [
    '--disable-gpu',
    '--force-color-profile=srgb',
    '--disable-lcd-text',
    '--disable-font-subpixel-positioning',
    '--disable-skia-runtime-opts',
    '--disable-partial-raster',
]
//全專案唯一 chromium.launch 出口（技能 §3 C1）；測試端 / regen 端 / 探查腳本一律走此 wrapper，旗標組單一 source of truth。
async function launchBrowser() {
    return await chromium.launch({ headless: true, args: chromiumLaunchArgs })
}
//成功訊息用 confirm modal（停留、可穩定截圖）而非 toast（插入後又移除、截圖時序不穩），同 SSO。

let serverProc = null
let started = false


async function isPortUp(port) {
    try {
        let ctrl = new AbortController()
        let timer = setTimeout(() => ctrl.abort(), 1500)
        await fetch(`http://127.0.0.1:${port}/`, { signal: ctrl.signal })
        clearTimeout(timer)
        return true
    }
    catch (err) {
        return false
    }
}


async function waitForPort(port, timeoutMs) {
    let start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await isPortUp(port)) {
            return
        }
        await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error(`server not ready on port ${port} after ${timeoutMs / 1000}s`)
}


function killProc(proc) {
    if (!proc || proc.killed) {
        return
    }
    if (process.platform === 'win32') {
        try {
            execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' })
        }
        catch (err) { /* already dead */ }
    }
    else {
        try {
            proc.kill('SIGKILL')
        }
        catch (err) { /* ignore */ }
    }
}


//第一次呼叫：11005 沒人 → 先 build 再 spawn srv.mjs；已被佔用 → 重用（不 spawn 也不負責關）。
//後續呼叫只認 started 旗標立即 return。cleanup 只殺自己 spawn 的。
async function startServersOnce() {
    if (started) {
        return
    }
    started = true

    if (await isPortUp(11005)) {
        console.log('[e2e-setup] backend already running on 11005, reusing')
        return
    }

    console.log('[e2e-setup] building dist (vue-cli build)...')
    execSync('npm run build', { stdio: 'ignore' })

    console.log('[e2e-setup] starting backend (port 11005)...')
    serverProc = spawn('node', ['srv.mjs'], { stdio: 'ignore' })
    await waitForPort(11005, 30000)
    console.log('[e2e-setup] backend ready')
}


//產臨時 settings 檔：讀 ./settings.json（JSON5）套 overrides，寫純 JSON 至 test/_tmp/（gitignore），回傳路徑。
//供 e2e 以不同 server 設定重啟後端（如 init 改 server 初始語系）。
//落 test/_tmp/ 不落 ./tmp/：後者為 AI 代理暫存區隨時會被整個清除，後端讀不到 settings 會啟動失敗；三專案統一此目錄名。
//測完即刪：本進程產生者由 cleanup() 一併刪除。
let tmpSettingsSeq = 0
let tmpSettingsFiles = []
function genTempSettings(overrides = {}) {
    let base = JSON5.parse(fs.readFileSync('./settings.json', 'utf8'))
    let merged = { ...base, ...overrides }
    let tmpDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '_tmp')
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true })
    }
    let p = path.join(tmpDir, `settings-e2e-${process.pid}-${tmpSettingsSeq++}.json`)
    fs.writeFileSync(p, JSON.stringify(merged, null, 2))
    tmpSettingsFiles.push(p)
    return p
}
function cleanupTempSettings() {
    for (let p of tmpSettingsFiles) {
        try {
            fs.rmSync(p, { force: true })
        }
        catch (err) { /* ignore */ }
    }
    tmpSettingsFiles = []
    try {
        let tmpDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '_tmp')
        if (fs.existsSync(tmpDir) && fs.readdirSync(tmpDir).length === 0) {
            fs.rmdirSync(tmpDir)
        }
    }
    catch (err) { /* ignore */ }
}


//以指定 settings 重啟後端：殺現有 → spawn `node srv.mjs <pathSettings>` → 等 11005 ready。
//給「需特定 server 設定」之測試用（如 init 帶 {language}）；srv.mjs 啟動時依設定注入 dist/index.html。
//注意：多次切換 server language 須先建 dist/index.tmp 不可變模板（見 e2e-init 之 ensureIndexTmpl），
//否則第 2 次起 index.html 已無 {language} 佔位符、無法再注入。
async function restartBackend(pathSettings = './settings.json') {
    if (serverProc) {
        killProc(serverProc)
        serverProc = null
    }
    else if (await isPortUp(11005)) {
        //11005 被外部/reuse 後端佔用（startServersOnce 偵測已啟動而未自 spawn）→ OS-level 查 PID 殺乾淨
        if (process.platform === 'win32') {
            try {
                let netstat = execSync('netstat -ano | findstr ":11005"', { encoding: 'utf8' })
                let pids = new Set()
                for (let line of netstat.split(/\r?\n/).filter((l) => /LISTENING/.test(l))) {
                    let m = line.match(/\s(\d+)\s*$/)
                    if (m) {
                        pids.add(m[1])
                    }
                }
                for (let pid of pids) {
                    try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }) }
                    catch (err) { /* already dead */ }
                }
            }
            catch (err) { /* netstat 失敗, fallback 不殺 */ }
        }
        else {
            try {
                let out = execSync('lsof -ti:11005', { encoding: 'utf8' })
                for (let pid of out.trim().split(/\s+/).filter(Boolean)) {
                    try { execSync(`kill -9 ${pid}`, { stdio: 'ignore' }) }
                    catch (err) { /* already dead */ }
                }
            }
            catch (err) { /* lsof 失敗, fallback */ }
        }
        //等舊 port 釋放，避免新 spawn 撞舊 socket
        let waitStart = Date.now()
        while (Date.now() - waitStart < 5000) {
            if (!(await isPortUp(11005))) {
                break
            }
            await new Promise((r) => setTimeout(r, 200))
        }
    }
    serverProc = spawn('node', ['srv.mjs', pathSettings], { stdio: 'ignore' })
    await waitForPort(11005, 30000)
    started = true //後續 startServersOnce 不再 spawn
}


function cleanup() {
    if (serverProc) {
        killProc(serverProc)
        serverProc = null
    }
    cleanupTempSettings()
}

process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

//mocha root after()：主動觸發 cleanup，子進程死 → event loop 清空 → mocha 順利 exit。
//走 --baseline 直跑（非 mocha）時 globalThis.after 未定義，跳過（由直跑分支末尾顯式呼叫 cleanup）。
if (typeof globalThis.after === 'function') {
    globalThis.after(function() {
        this.timeout(20000)
        cleanup()
    })
}


//主動等左側 WDrawer「展開到位」再截圖（移植自 w-web-sso/test/e2e-setup.mjs，api2 同元件同問題）。
//根因：backstage mount 後 body 文字即 ready，但 WDrawer drawer 初始滑在 viewport 左外
//（sidebar x<0），@domresize/autoSwitch 異步觸發後才滑入展開（x>=0），滯後 navDOM-ready ~150ms；
//CPU 忙（全套件連跑）時超過上游 wait → 截到「sidebar 未展開」flake（edit-002 曾凍進收合態 baseline）。
//錨點：sidebar header 內恆有搜尋框（placeholder 為 searchApiPlaceholder 的 eng/cht 值），content 區
//不會出現此 placeholder；以「搜尋框 x>=0 且 width>0」判定展開到位。收合時搜尋框被 translate 到 x<0
//（或 display:none → width 0），故會繼續等到 autoSwitch 把抽屜重新展開。失敗(timeout)不阻塞，由後續
//retry-until-stable 兜底。SEARCH_PH 須與 server/procLang.mjs 的 searchApiPlaceholder 逐字同步。
//等 WDrawer 進入穩定態再截圖（canonical，沿用 w-web-sso 作法）。
//直接讀 WDrawer 根節點的 [state] 屬性（hidden/opening/opened/hiding，見 w-component-vue WDrawer.vue），
//等所有 drawer 皆為穩定態（opened 或 hidden）才放行——事件驅動（transitionend），不受 CPU 負載影響。
//比舊版「量搜尋框幾何 x>=0」優：①收合態(hidden)也能正確判定(舊版搜尋框 x<0 → 永遠 false → 空轉到 10s timeout)；
//②展開/收合雙向皆準；③一穩定即放行不浪費等待。
async function waitDrawerReady(page) {
    await page.waitForFunction(() => {
        let drawerStates = Array.from(document.querySelectorAll('[state]'))
            .map((e) => e.getAttribute('state'))
            .filter((s) => ['hidden', 'opening', 'opened', 'hiding'].includes(s))
        if (drawerStates.length === 0) {
            return true //無 WDrawer（非 backstage 頁），放行
        }
        //所有 drawer 須為穩定態（opened 或 hidden），不可停在 opening / hiding 過渡中
        return drawerStates.every((s) => s === 'opened' || s === 'hidden')
    }, null, { timeout: 10000, polling: 100 }).catch(() => {})
}


//pixel baseline 截圖統一 helper：retry 至連續兩張一致再回傳，治 cold-start / CJK glyph
//lazy rasterization / GPU init / paint timing。所有 baseline 端與比對端都用它，不用裸 screenshot。
//opts.strict：regen 端用——重試耗盡仍未 settle 時 throw（拒絕把未穩定畫面寫成 baseline）；未指定時 REGEN 模式預設 strict。
async function captureStable(page, opts = {}) {
    let { maxRetries = 8, intervalMs = 200, initialWaitMs = 1500, strict = REGEN } = opts
    let shotOpts = { fullPage: true, animations: 'disabled' }

    //park mouse 到 (0,0)：給滑鼠「移出（mouseleave）」事件，消除點擊後殘留 hover state 造成的 byte 不穩。
    //tooltip 處理（canonical）：w-component-vue 帶 tooltip 之按鈕（WButtonCircle/WButtonChip）hover/click 會彈出
    //tooltip popup，「滑鼠移出才會消失」；mouse.move(0,0) 即提供此 mouseleave，配合下方 initialWaitMs 涵蓋 ~200ms
    //淡出 transition → tooltip 消失再截圖，穩定。
    //例外（視為可接受，不另處理）：若按鈕「點擊即彈出 dialog」，dialog 的全屏背景遮蔽層會攔截滑鼠移動事件，
    //使該按鈕收不到 mouseleave → tooltip 不會消失 → 截圖會含 tooltip。此類 e2e 之 baseline/測試含該 tooltip 屬正常。
    await page.mouse.move(0, 0)

    //等 setTimeout-based delayed-reveal 已 fire + hover-leave/chain 動畫 settle
    await page.waitForTimeout(initialWaitMs)

    //主動等 WDrawer 拖曳分隔條 overlay（cursor:col-resize）opacity → 1（由 setTimeout 300ms 控制）
    await page.evaluate(async () => {
        let deadline = Date.now() + 5000
        while (Date.now() < deadline) {
            let bars = Array.from(document.querySelectorAll('[style*="cursor:col-resize"], [style*="cursor: col-resize"]'))
            if (bars.length === 0) return
            let allReady = bars.every((b) => parseFloat(getComputedStyle(b).opacity) === 1)
            if (allReady) return
            await new Promise((r) => setTimeout(r, 50))
        }
    })

    //主動等 WDrawer drawer 達穩定態（讀 [state]=opened/hidden，詳 waitDrawerReady 定義處），避免截到過渡態
    await waitDrawerReady(page)

    //凍結 inline <svg> SMIL 動畫（animations:'disabled' 只凍 CSS 不影響 SVG SMIL）
    await page.evaluate(() => {
        document.querySelectorAll('svg').forEach((svg) => {
            if (typeof svg.pauseAnimations === 'function') {
                svg.pauseAnimations()
                if (typeof svg.setCurrentTime === 'function') {
                    svg.setCurrentTime(0)
                }
            }
        })
    })

    //等 web fonts 載入完成（否則 mdi 圖標 glyph 未渲染）
    await page.evaluate(() => {
        return (document.fonts && typeof document.fonts.ready?.then === 'function') ? document.fonts.ready : Promise.resolve()
    })

    let prev = await page.screenshot(shotOpts)
    for (let i = 0; i < maxRetries; i++) {
        await page.waitForTimeout(intervalMs)
        let curr = await page.screenshot(shotOpts)
        if (curr.equals(prev)) {
            return curr
        }
        prev = curr
    }
    //未 settle：strict（regen）拒絕寫入；否則回傳最後一張，後續 baseline 之 pixelmatch 容差比對失敗會揭露真實 flake
    if (strict) {
        throw new Error(`captureStable ${maxRetries} 次仍未 settle（regen 拒絕寫入未穩定畫面）`)
    }
    return prev
}


//每步驟先偵測對象就緒再進下一步（取代 fixed sleep 猜時序）。fn 跨 process 序列化，不能 closure，傳值用 arg。
async function waitUntilExist(page, label, fn, opts = {}) {
    let { timeout = 15000, arg = null } = opts
    try {
        await page.waitForFunction(fn, arg, { timeout })
    }
    catch (err) {
        throw new Error(`waitUntilExist 超過 ${timeout}ms 仍找不到「${label}」`)
    }
}


//真實 user 輸入 helper（Pattern D，對齊全域 CLAUDE.md §6.3「Vue v-model 文字輸入 race」）。
//click → 驗 activeElement → Backspace 清空 → keyboard.insertText 整段 → 驗 inputValue → retry×3。
async function typeIntoInput(page, locator, value) {
    await locator.waitFor({ state: 'visible', timeout: 5000 })
    await page.waitForTimeout(1000)
    let maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await locator.click()
        let handle = await locator.elementHandle()
        await page.waitForFunction((el) => document.activeElement === el, handle, { timeout: 3000 })
        let cur = await locator.inputValue()
        if (cur) {
            await page.keyboard.press('End')
            for (let k = 0; k < cur.length + 2; k++) await page.keyboard.press('Backspace')
        }
        await page.keyboard.insertText(value)
        await page.waitForTimeout(200)
        let got = await locator.inputValue()
        if (got === value) return
        console.warn(`typeIntoInput attempt ${attempt}/${maxAttempts}: 預期「${value}」實得「${got}」, 重試`)
        await page.waitForTimeout(400)
    }
    let final = await locator.inputValue()
    throw new Error(`typeIntoInput ${maxAttempts} 次仍漏字: 預期「${value}」, 最終「${final}」`)
}


//導頁至 API 工作區並等就緒（apitest / display / edit 三檔逐字相同，收斂於此，技能 §3「helper 不重複」）。
//以 ?lang= 指定語系載入初始畫面（對齊 w-web-sso；前端 getLang 之 URL ?lang= 最高優先）。lang 省略則預設 eng。
//進站預設頁為統計資訊：先等左選單掛載，點「API」切至 API 工作區（按鈕文字雙語皆為 API）。
//此步等的是「登入 → webInfor → Layout 掛載」整條 ready 鏈（非單一元素），高負載時較慢，故給 40s。
//注意：init 之 gotoReadyNoLang（不帶 ?lang=，驗 server 注入語系）與 stainfor 之 gotoStats（進站預設頁本身即
//統計頁，不切 API 工作區）目的不同，各自保留獨立定義，不併入此函式。
async function gotoApiWorkspace(page, lang) {
    let q = (lang === 'cht' || lang === 'eng') ? `&lang=${lang}` : ''
    await page.goto(`${baseUrl}/?token=sys${q}`, { waitUntil: 'load', timeout: 30000 })
    await waitUntilExist(page, 'app ready (main menu rendered)', () => document.querySelectorAll('.w-mm-btn').length >= 2, { timeout: 40000 })
    await page.locator('.w-mm-btn', { hasText: 'API' }).first().click()
    await waitUntilExist(page, 'API tree rendered', () => {
        let t = document.body.innerText || ''
        return t.includes('取得API清單') && t.includes('取得寵物清單')
    }, { timeout: 25000 })
    //等指定語系 UI 套用到位（cht 看「文件」分頁、eng/預設看「Docs」）
    let marker = (lang === 'cht') ? '文件' : 'Docs'
    await waitUntilExist(page, `UI lang applied (${marker})`, (m) => (document.body.innerText || '').includes(m), { timeout: 8000, arg: marker })
    await page.waitForTimeout(300)
}


//e2e DB 起始狀態重置：清空 apis 再插入 base seed（ds.apis.funTest()，固定 id，hermetic）。
//每個 e2e setup 先呼叫，保證從相同已知狀態起跑。
async function resetToBaseSeed() {
    await woItems.apis.delAll()
    await woItems.apis.insert(ds.apis.funTest())
}


//mutation（存檔/新增/刪除）後、截圖前等 UI 完全 settle（移植自 w-web-sso waitCheckYes 的 settle 策略）。
//根因（與 SSO 同類）：存檔觸發 async DbOrm store 同步 → LayoutContent.changeApis→genTree 重建 →
//apiSelect/樹節點變動、且同步瞬間 apis 可能短暫為空使 docs 區（v-if 含 apiSelect）一度空白 →
//不等則 captureStable 可能收斂到 transient state（曾測得 docs 空白態 77640B vs 正常 110958B）。
//作法：每 200ms 取一次「內容簽章」（docs 標題 + method badge 數 + 全文長度），連續 10 筆（~2s）
//完全相同才視為 settle。涵蓋 docs 空白→full 的 transition 與樹重建。失敗(timeout)拋錯揭露真異常。
async function waitMutationSettled(page) {
    await page.mouse.move(0, 0)
    await page.waitForFunction(() => {
        //docs 正確最終態一定有 .op-title（顯示選取的 API）；async 同步瞬間 apiSelect=null 的空白態沒有 →
        //op-title 為空就 return false 繼續等（不讓「空白」這個 transient/卡住態算進 settle 窗），
        //對齊 w-web-sso「等到有意義的最終內容（grid 填滿）才截」而非接受任一 stable state。
        let op = document.querySelector('.op-title')
        let opTxt = op ? (op.innerText || '').trim() : ''
        if (!opTxt) {
            return false
        }
        //簽章含版面幾何（op-title 的 left/top + 搜尋框 left/width），不只文字內容 —— 因曾測得
        //存檔後整頁約 1px 次像素位移（文字邊緣全圖差異 maxDelta=255），純文字簽章抓不到；
        //把幾何納入後 2s 穩定才放行，等同 w-web-sso 等「drawer/layout 幾何 settle」才截。
        let opR = op.getBoundingClientRect()
        let inp = document.querySelector('input[placeholder]')
        let inpR = inp ? inp.getBoundingClientRect() : { left: 0, width: 0 }
        let sig = JSON.stringify({
            op: opTxt.slice(0, 60),
            opX: Math.round(opR.left), opY: Math.round(opR.top),
            inpX: Math.round(inpR.left), inpW: Math.round(inpR.width),
            mb: document.querySelectorAll('.w-mb').length,
            len: (document.body.innerText || '').length,
        })
        let k = '__a2SettleSamples'
        if (!window[k]) window[k] = []
        window[k].push({ t: Date.now(), sig })
        let cut = Date.now() - 2000
        window[k] = window[k].filter((s) => s.t >= cut)
        if (window[k].length < 10) return false
        return window[k].every((s) => s.sig === window[k][0].sig)
    }, null, { timeout: 15000, polling: 200 })
}


//pixel baseline 統一處置：REGEN 模式寫檔，否則 pixelmatch 容差比對（取代舊 buf.equals 逐位元組精確）。
//baseline 路徑 test/pics/<flow>/<fileName>；fileName 慣例 <flow>-<lang>-<NNN>-<kebab>.png。
//比對採 pixelmatch（includeAA:false 反鋸齒感知）+ maxDiffPixels 容差（移植 w-web-sso assertBaselineMatch）：
//- includeAA:false 自動忽略反鋸齒邊緣次像素差（SVG icon / 字型跨 session 光柵化不決定性）→ 不再因此 flake。
//- maxDiffPixels 預設 100：反鋸齒殘留遠低於此（個位~數十）；真 regression（icon 換/版面位移/顏色變/內容變）
//  動輒數百~數千 px 遠超 → 仍被抓到。同 Playwright toHaveScreenshot 業界標準。
//- 尺寸不同 = 必為真差異（版面/裁切變）→ 直接 fail。
//- 失敗時把 capture + baseline + diff 標紅圖 存 testPending/（ms-ts + 撞檔 -N 永不覆蓋，已 gitignore）供事後 diff。
//pixel baseline 為補強層，呼叫前每 case 須先有語意斷言（全域規範 §6.2）：容差只放輔助層，主驗證仍嚴。
//opts.maxDiffPixels / opts.threshold 可由呼叫端覆寫（預設 100 / 0.1），供個別 case 需更嚴/更鬆。
function baselinePath(flow, fileName) {
    return path.resolve('test', 'pics', flow, fileName)
}

async function assertOrRegenBaseline(assert, flow, fileName, buf, opts = {}) {
    let { maxDiffPixels = 100, threshold = 0.1 } = opts
    let p = baselinePath(flow, fileName)
    if (REGEN) {
        fs.mkdirSync(path.dirname(p), { recursive: true })
        fs.writeFileSync(p, buf)
        console.log('[baseline] wrote', fileName)
        return
    }
    if (!fs.existsSync(p)) {
        throw new Error(`baseline 不存在: ${fileName}（請先以 --baseline 產製）`)
    }
    let base = fs.readFileSync(p)
    let capPng = PNG.sync.read(buf)
    let basePng = PNG.sync.read(base)

    //fail-dump（對齊 skill[role-code-for-test-e2e]）：把「當次 capture」「baseline」「diff 標紅圖」雙存到
    //./testPending/<label>__<ms-ts>[-N]__{capture,baseline,diff}.png——ms timestamp + 撞檔 -N 永不覆蓋
    //（偶發 flake 當次證據不被下次跑蓋掉）；testPending 已 gitignore。diff 圖一眼定位差異區，省去手寫 diff 腳本。
    let dump = (reason, diffPng) => {
        let dir = path.resolve('testPending')
        fs.mkdirSync(dir, { recursive: true })
        let ts = new Date().toISOString().replace(/[:.]/g, '-')
        let stem = `${fileName.replace(/\.png$/, '')}__${ts}`
        let n = 0
        while (fs.existsSync(path.join(dir, `${stem}${n ? '-' + n : ''}__capture.png`))) n++
        let tag = `${stem}${n ? '-' + n : ''}`
        fs.writeFileSync(path.join(dir, `${tag}__capture.png`), buf)
        fs.writeFileSync(path.join(dir, `${tag}__baseline.png`), base)
        if (diffPng) {
            fs.writeFileSync(path.join(dir, `${tag}__diff.png`), PNG.sync.write(diffPng))
        }
        console.log(`[baseline] 不一致（${reason}），已保留 capture+baseline${diffPng ? '+diff' : ''} 至 testPending/：${tag}__*.png`)
        assert.ok(false, `pixel baseline 不一致: ${fileName}（${reason}；capture+baseline${diffPng ? '+diff' : ''} 已存 testPending/）`)
    }

    //尺寸不同 = 必為真差異（版面/裁切變）；pixelmatch 要求同尺寸，故直接 fail
    if (capPng.width !== basePng.width || capPng.height !== basePng.height) {
        dump(`尺寸不同 cap=${capPng.width}x${capPng.height} base=${basePng.width}x${basePng.height}`)
        return
    }
    //pixelmatch：反鋸齒感知比對，回傳「真不同」像素數（反鋸齒邊緣已被忽略）
    let { width, height } = basePng
    let diffPng = new PNG({ width, height })
    let numDiff = pixelmatch(capPng.data, basePng.data, diffPng.data, width, height, { threshold, includeAA: false })
    if (numDiff <= maxDiffPixels) {
        return //通過：反鋸齒次像素已忽略，殘留真差異在容差內
    }
    dump(`diff=${numDiff}px > maxDiffPixels=${maxDiffPixels}`, diffPng)
}


//整張全頁截圖 + 在「此 e2e 要比對的區塊」外圍畫紅框（#f26、5px）標注，讓報表/審查委員一眼看出本
//case 驗的是哪一區（含「編輯前→編輯後」每一步），截圖仍為完整畫面、保留 UI 脈絡，不裁切成小片。
//target：CSS selector 字串 / 字串陣列 / Playwright Locator / 以上混合陣列（多個取聯集框成一個框）。
//  ——欄位列須依 label 文字定位時用 Locator（如 page.locator('.bk-row').filter({hasText:'名稱'})）。
//fold 以下的目標會先把第一個 scrollIntoView 捲進視窗再框（同組目標應在同一捲動位置）。
//opts.mask：要遮黑的非決定性區域陣列，使 baseline 可穩定 byte 比對。每項可為：
//  - selector 字串：遮該元素的 bbox（左緣/寬度依元素，適用尺寸固定的區域，如 headers pre）。
//  - { sel, fixedWidth }：錨定元素右緣、固定寬度往左延伸（適用右對齊且寬度浮動者，如 durationMs 位數會變）。
async function captureStableWithBox(page, target, opts = {}) {
    let { mask = [] } = opts
    let items = Array.isArray(target) ? target : [target]
    let isLoc = (x) => x && typeof x === 'object' && typeof x.boundingBox === 'function'
    //先把第一個目標捲進視窗（同組目標應在同一捲動位置）
    let firstLoc = isLoc(items[0]) ? items[0].first() : page.locator(items[0]).first()
    await firstLoc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(300)
    await page.mouse.move(0, 0)
    //取每個目標的 viewport rect（Locator → boundingBox；CSS 字串 → querySelector）
    let rects = []
    for (let it of items) {
        if (isLoc(it)) {
            let bb = await it.first().boundingBox()
            if (bb) {
                rects.push(bb)
            }
        }
        else {
            let r = await page.evaluate((s) => {
                let e = document.querySelector(s)
                if (!e) {
                    return null
                }
                let rc = e.getBoundingClientRect()
                return { x: rc.left, y: rc.top, width: rc.width, height: rc.height }
            }, it)
            if (r) {
                rects.push(r)
            }
        }
    }
    //遮罩區（viewport 座標）：字串 → 元素 bbox；{ sel, fixedWidth } → 錨定元素右緣往左固定寬（右對齊且位數浮動之值，如 durationMs，
    //若依元素自身寬遮則黑塊邊界跟著浮動 → flake；錨右緣固定寬度才穩定）
    let maskRects = await page.evaluate((ms) => {
        let out = []
        ms.forEach((s) => {
            let sel = (typeof s === 'string') ? s : s.sel
            let e = document.querySelector(sel)
            if (!e) {
                return
            }
            let r = e.getBoundingClientRect()
            let left = r.left
            let width = r.width
            if (typeof s === 'object' && s.fixedWidth) {
                width = s.fixedWidth
                left = (r.left + r.width) - width
            }
            out.push({ x: left, y: r.top, w: width, h: r.height })
        })
        return out
    }, mask)
    //fullPage 截圖座標 = viewport rect + scroll offset
    let env = await page.evaluate(() => ({ sx: window.scrollX, sy: window.scrollY }))
    //先截圖再以 sharp 後製：遮罩 → 紅框（框疊在遮罩之上永遠可見）。2026-09-01 起改為截圖後合成，不再注入 DOM：
    //插入後又移除的暫時 DOM 偶發使整頁光柵化偏 1px（本專案 toast 殷鑑，技能 §8.3），量測工具不得改動被測頁 layer tree。
    let buf = await captureStable(page, opts)
    if (maskRects.length > 0) {
        buf = await maskRegions(buf, maskRects.map((r) => ({ x: r.x + env.sx, y: r.y + env.sy, w: r.w, h: r.h })))
    }
    if (rects.length > 0) {
        buf = await composeBox(buf, {
            left: Math.min(...rects.map((r) => r.x)) + env.sx,
            top: Math.min(...rects.map((r) => r.y)) + env.sy,
            right: Math.max(...rects.map((r) => r.x + r.width)) + env.sx,
            bottom: Math.max(...rects.map((r) => r.y + r.height)) + env.sy,
        })
    }
    return buf
}


//對截圖 buffer 的指定矩形填色（sharp composite；clamp 至 buffer 內）。用於 DOM 層凍不到的動態內容；預設黑色一眼可辨「刻意遮蔽」。
async function maskRegions(buf, rects, color = { r: 0, g: 0, b: 0 }) {
    let meta = await sharp(buf).metadata()
    let composite = rects
        .map((r) => {
            let left = Math.max(0, Math.round(r.x))
            let top = Math.max(0, Math.round(r.y))
            let width = Math.min(Math.round(r.w), meta.width - left)
            let height = Math.min(Math.round(r.h), meta.height - top)
            return { left, top, width, height }
        })
        .filter((c) => c.width > 0 && c.height > 0)
        .map((c) => ({ input: { create: { width: c.width, height: c.height, channels: 3, background: color } }, left: c.left, top: c.top }))
    if (composite.length === 0) {
        return buf
    }
    return await sharp(buf).composite(composite).png().toBuffer()
}


//把紅框（#f26 / 5px / 圓角 4）以 sharp 疊到截圖 buffer（截圖後合成，不注入 DOM）。box 為 buffer 座標之目標區 { left, top, right, bottom }；
//外擴 6、四邊夾在 buffer 內（M=3）；stroke 置中於路徑故外緣落在 bl..br / bt..bb，等效原 DOM 版 border-box 之 5px 內縮框線。
async function composeBox(buf, box) {
    let meta = await sharp(buf).metadata()
    let M = 3
    let bl = Math.max(M, box.left - 6)
    let bt = Math.max(M, box.top - 6)
    let br = Math.min(meta.width - M, box.right + 6)
    let bb = Math.min(meta.height - M, box.bottom + 6)
    if (br - bl <= 5 || bb - bt <= 5) {
        return buf
    }
    let svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect x="${bl + 2.5}" y="${bt + 2.5}" width="${br - bl - 5}" height="${bb - bt - 5}" fill="none" stroke="#f26" stroke-width="5" rx="4" ry="4"/>` +
        `</svg>`
    return await sharp(buf).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer()
}


//把截圖 buffer 的指定矩形區域，用「參考圖 refBuf 同座標的內容」覆蓋上去（貼圖覆蓋，取代填黑遮罩；移植自 w-web-sso）。
//用途：動態圖表（echarts canvas）GPU 跨進程渲染 + x 軸日期相對今日漂移，無法 pixel 穩定，又不想用突兀黑塊 →
//改貼一張「預存的真實圖表快照（per-item ref）」。baseline 與 runtime 兩端都貼同一張 refBuf → 該區永遠一致
//（e2e 穩定），視覺上呈現真實圖表而非黑塊。refBuf 須與 buf 同尺寸（相同版面/截圖方式）才能同座標 extract+composite。
async function overlayRegions(buf, rects, refBuf) {
    let meta = await sharp(buf).metadata()
    let imgW = meta.width
    let imgH = meta.height
    let refMeta = await sharp(refBuf).metadata()
    let composite = []
    for (let r of rects.filter((r) => r.w > 0 && r.h > 0)) {
        let left = Math.max(0, Math.round(r.x))
        let top = Math.max(0, Math.round(r.y))
        let width = Math.min(Math.round(r.w), imgW - left, refMeta.width - left)
        let height = Math.min(Math.round(r.h), imgH - top, refMeta.height - top)
        if (width <= 0 || height <= 0) {
            continue
        }
        let crop = await sharp(refBuf).extract({ left, top, width, height }).png().toBuffer()
        composite.push({ input: crop, left, top })
    }
    if (composite.length === 0) {
        return buf
    }
    return await sharp(buf).composite(composite).png().toBuffer()
}


//把「一張已裁切成該區域尺寸的小圖 overlayBuf」貼到 buf 的 (left, top)。
//用於貼圖覆蓋：ref 只存「圖表/表格那一塊」之裁切圖（≈原黑屏遮蔽區尺寸），非整頁，
//一看即知只覆蓋該區、其餘 live 比對。overlayBuf 超出 buf 邊界時自動裁切。
async function overlayImageAt(buf, overlayBuf, left, top) {
    let meta = await sharp(buf).metadata()
    let oMeta = await sharp(overlayBuf).metadata()
    left = Math.max(0, Math.round(left))
    top = Math.max(0, Math.round(top))
    let w = Math.min(oMeta.width, meta.width - left)
    let h = Math.min(oMeta.height, meta.height - top)
    if (w <= 0 || h <= 0) {
        return buf
    }
    let ov = overlayBuf
    if (w !== oMeta.width || h !== oMeta.height) {
        ov = await sharp(overlayBuf).extract({ left: 0, top: 0, width: w, height: h }).png().toBuffer()
    }
    return await sharp(buf).composite([{ input: ov, left, top }]).png().toBuffer()
}


//把 buf 的指定矩形裁切出來（用於把「圖表/表格那一塊」存成 ref 小圖）。
async function cropRegion(buf, rect) {
    let meta = await sharp(buf).metadata()
    let left = Math.max(0, Math.round(rect.x))
    let top = Math.max(0, Math.round(rect.y))
    let width = Math.min(Math.round(rect.w), meta.width - left)
    let height = Math.min(Math.round(rect.h), meta.height - top)
    return await sharp(buf).extract({ left, top, width, height }).png().toBuffer()
}


export {
    startServersOnce,
    genTempSettings,
    restartBackend,
    overlayRegions,
    overlayImageAt,
    cropRegion,
    cleanup,
    captureStable,
    captureStableWithBox,
    waitDrawerReady,
    waitMutationSettled,
    waitUntilExist,
    typeIntoInput,
    gotoApiWorkspace,
    resetToBaseSeed,
    assertOrRegenBaseline,
    woItems,
    REGEN,
    baseUrl,
    chromiumLaunchArgs,
    launchBrowser,
    composeBox,
}
