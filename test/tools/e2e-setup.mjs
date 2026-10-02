//e2e 共用基礎設施。2026-09-28 起通用部分組裝自 e2e 共用設施（當時為 w-web-sso 之 srcPack；2026-09-29 起為 devDependency w-package-tools-e2e 1.0.2，
//同名同行為，2026-09-30 起 1.0.3，下文「套件」即指它；一律經 ./e2eLib.mjs 引用）：
//服務生命週期 createServiceManager、截圖 captureStable / captureStableWithBox、合成 composeBox / overlayRegions / overlayImageAt / cropRegion、
//輸入 typeIntoInput、等待 waitUntilExist、臨時設定 createTempSettings、收尾註冊 registerCleanupHooks、啟動 launchBrowser。
//標準圖之寫檔 / 比對不在本檔：各 e2e 檔以套件 runBaselineCase 執行（預設比對函式為套件 assertBaselineMatch）。
//本檔只保留本專案之組態（port、build+spawn、settle 組合、strict 來源）與專案特化 helper；匯出名稱與簽章不變。
//位置：test/tools/（全域 §16.4：setup / runner / 產生器不帶 .test. 中綴且放 tools/，免被 runner 抓成測試檔）。
//路徑解析：test/pics、testPending、settings.json 以專案根（cwd）解析；test/_tmp 以本檔上一層解析。
//
//與 SSO 差異：
//- api2 後端 srv.mjs 同時服務 build 後的 dist（port 11005），故 e2e 直接瀏覽 11005，
//  不另起前端 dev server（8080）。startServersOnce 會先 build 再 spawn srv.mjs。
//- 產製模式為 mocha 帶 --baseline 或 env E2E_REGEN=1（非 sso / perm 之直跑）；strict 於 REGEN 預設 true。
//- <img> 內 SVG SMIL 動畫區一律於截圖後處理（套件 captureStable 之 maskImgSmil，2026-09-28 起開啟；原檔頭稱「截圖態無 SMIL 動畫 img」
//  與 e2e-init 之連線中 spinner 不符）；同日起處理方式由填黑改為貼「去掉動畫元素之靜態影格」（imgSmilFill 預設 'static'，
//  手冊用圖看得到轉圈圖示而非黑方塊，技能 §8.2）。
//- base seed = ds.apis.funTest()（固定 id，hermetic）。
//
import 'dotenv/config'
import { spawn, execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import ds from '../../src/schema/index.mjs'
import { woItems } from '../../g_mOrm.mjs'
import {
    getE2eMode,
    chromiumLaunchArgs,
    launchBrowser as pkgLaunchBrowser,
    captureStable as pkgCaptureStable,
    captureStableWithBox as pkgCaptureStableWithBox,
    composeBox,
    overlayRegions,
    overlayImageAt,
    cropRegion,
    waitColResizeOverlay,
    waitDrawerReady,
    waitUntilExist as pkgWaitUntilExist,
    typeIntoInput,
    createTempSettings,
    createServiceManager,
    registerCleanupHooks,
    probeStuckTooltip as pkgProbeStuckTooltip
} from './e2eLib.mjs'

//baseline 產製模式：mocha 帶 --baseline 或 env E2E_REGEN=1 時寫檔；否則 pixelmatch 容差比對。
//診斷閘門紀律：診斷 env 生效時絕不可寫正式 baseline（技能 references/pixel-mismatch-diagnosis.md §6；getE2eMode 於此拋錯）
let { regen: REGEN } = getE2eMode()

//一律 127.0.0.1（避開 Windows IPv6 Happy-Eyeballs 回退延遲，詳全域 CLAUDE.md §6.3）
let baseUrl = 'http://127.0.0.1:11005'

//瀏覽器 launch 一律帶 chromiumLaunchArgs（確定性渲染六旗標，套件單一來源，與本專案原組逐項相同）。headless Chromium 預設 GPU 光柵化 + subpixel
//字形 AA 在 byte 級截圖比對下非決定性：同一版面（實測 .op-title 之 DOM top 恆為 166、無位移），eng 拉丁字
//走 subpixel AA 仍偶發數十像素散落差異（cht 灰階 AA 較穩，故僅 eng 中招）。此組關 GPU（改 CPU Skia）、固定
//srgb 色彩、關 LCD/subpixel 字形定位、關 skia runtime opt 與 partial raster，實測截圖 self-consistency 5/5（裸 launch 僅 2/4）。
//全專案唯一 launchChromium 出口（技能 §3 C1）；測試端 / regen 端 / 探查腳本一律走此 wrapper。
async function launchBrowser() {
    return await pkgLaunchBrowser()
}
//成功訊息用 confirm modal（停留、可穩定截圖）而非 toast（插入後又移除、截圖時序不穩），同 SSO。


//產臨時 settings 檔：讀 ./settings.json（JSON5）套 overrides，寫純 JSON 至 test/_tmp/（gitignore），回傳路徑。
//供 e2e 以不同 server 設定重啟後端（如 init 改 server 初始語系）。
//落 test/_tmp/ 不落 ./tmp/：後者為 AI 代理暫存區隨時會被整個清除，後端讀不到 settings 會啟動失敗；三專案統一此目錄名。
//測完即刪：本進程產生者由 cleanup() 一併刪除。
let { genTempSettings, cleanupTempSettings } = createTempSettings({
    basePath: './settings.json',
    tmpDir: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '_tmp'),
})


//服務生命週期（沿用政策 reuse；套件 createServiceManager）：
//- startServersOnce：11005 沒人 → 先 build（beforeSpawn phase=start）再 spawn srv.mjs；已被佔用 → 重用（不 spawn 也不負責關；不重 build，
//  手動起的後端沒關會測到舊碼，見 CLAUDE_process.md）。一次性狀態：之後之呼叫不再偵測；cleanup 後重置。
//- restartBackend：殺自建並等 11005 釋放；無自建而被佔用（外部 / reuse 之同專案後端）→ 殺其監聽者並等釋放（11005 專屬本專案，CLAUDE.md 明文例外）；
//  之後 spawn `node srv.mjs <pathSettings>` 等 ready。srv.mjs 啟動時依設定注入 dist/index.html；
//  多次切換 server language 須先建 dist/index.tmp 不可變模板（見 e2e-init 之 ensureIndexTmpl），否則第 2 次起 index.html 已無 {language} 佔位符。
//- cleanup：同步殺自建、重置一次性狀態、刪臨時 settings。
let services = createServiceManager({
    services: [
        {
            name: 'backend',
            port: 11005,
            readyTimeoutMs: 30000,
            beforeSpawn: ({ phase }) => {
                if (phase === 'start') {
                    console.log('[e2e-setup] building dist (vue-cli build)...')
                    execSync('npm run build', { stdio: 'ignore' })
                }
            },
            spawn: ({ args, env }) => spawn('node', ['srv.mjs', ...args], { stdio: 'ignore', env }),
        },
    ],
    killForeignOnRestart: true,
    onCleanup: () => cleanupTempSettings(),
})

async function startServersOnce() {
    await services.startServersOnce()
}

async function restartBackend(pathSettings = './settings.json') {
    await services.restart('backend', { args: [pathSettings] })
}

function cleanup() {
    services.cleanup()
}

//收尾兩條觸發來源：mocha root after（主動觸發 cleanup，子進程死 → event loop 清空 → mocha 順利 exit）＋ exit / SIGINT / SIGTERM 備援
registerCleanupHooks(cleanup, { afterTimeoutMs: 20000 })


//pixel baseline 截圖統一 helper（套件 captureStable，與 sso / perm 同一實作）：park mouse → 初始等待 1500ms →
//settle：WDrawer 拖曳分隔條 overlay opacity=1（waitColResizeOverlay）、抽屜 [state] 皆為 opened/hidden（waitDrawerReady，事件驅動不受 CPU 負載影響）→
//凍結 inline SVG SMIL → 等字型 → <img> 內 SVG 動畫區截圖後貼靜態影格（頁面座標；檔頭 2026-09-28 條，原寫「填黑」為改預設前之行為）→
//截圖前偵測提示框殘留（probeStuckTooltip）→ 連拍至相鄰兩張相同。所有 baseline 端與比對端都用它，不用裸 screenshot。
//tooltip 處理（canonical）：w-component-vue 帶 tooltip 之按鈕 hover/click 會彈出 tooltip，「滑鼠移出才會消失」；park mouse 即提供此 mouseleave，
//單純出現 dialog 全屏遮罩時亦同。2026-09-30 更正原載「按鈕點擊即彈出 dialog 者，遮蔽層攔截滑鼠移動 → tooltip 不消失 → 截圖含 tooltip 屬正常」：
//不成立（w-web-sso spec/evidence/2026-09-29-tooltip-mouseleave-repro.mjs 最小重現），park 後仍在之提示框即缺陷，由 probeStuckTooltip 判失敗。
//strict：opts.strict 為布林值時依之，否則 REGEN 模式預設 strict（重試耗盡仍未 settle 時 throw，拒絕把未穩定畫面寫成 baseline）。
async function captureStable(page, opts = {}) {
    return await pkgCaptureStable(page, { settle: [waitColResizeOverlay, waitDrawerReady], strictDefault: () => REGEN, ...opts, beforeShots: [probeStuckTooltip, ...(opts.beforeShots || [])] })
}

//probeStuckTooltip: 提示框殘留之回歸守門（技能 role-coder-for-test-e2e §10〈提示框／hover 殘留〉）。captureStable 已將游標移至 (0,0)
//並等待 ≥1.5 秒，此時仍顯示之 hover 型提示框（WTooltip mode='tooltip'，文字不限）必為殘留：mouseleave 未送達其觸發區，拋錯使該案失敗。
//曾見成因為 w-component-vue ≤2.5.23 之 WButtonCircle 以 v-if 換掉游標下之圖示後出現遮罩（本專案無此類按鈕，未曾觸發），2.5.24 起已修正。
//點開型浮層（mode='popup'：WPopup、下拉清單）為刻意開啟，不在此列。判斷由套件 probeStuckTooltip 執行（1.0.3 起；原四專案各自手寫之同一實作收斂至套件，
//未給 rootSel 時頁內邏輯與原實作相同）：以 WTooltip 內部結構辨識（$refs.divTrigger／divContent、props.mode、data.valueTrans）；本專案未掛 window.$vo，
//根實例取自 body 直屬元素之 __vue__。元件改寫會使其找不到提示框而一律通過（靜默失效），升級 w-component-vue 時須以真元件頁複驗（規則帳本）。
//本檔只注入錯誤訊息（指出成因與先查何處）。
async function probeStuckTooltip(page) {
    return await pkgProbeStuckTooltip(page, {
        createError: (texts) => new Error(`游標已移開, 提示框「${texts.join('」「')}」仍顯示(提示框殘留; w-component-vue 2.5.24 已修正 WButtonCircle 之成因, 再現即回歸, 先確認已安裝之 WButtonCircle.vue 圖示層仍帶 pointer-events:none)`),
    })
}


//每步驟先偵測對象就緒再進下一步（取代 fixed sleep 猜時序）；套件 waitUntilExist，本專案預設逾時 15000ms（沿用原值）。
//fn 跨 process 序列化，不能 closure，傳值用 arg。
async function waitUntilExist(page, label, fn, opts = {}) {
    await pkgWaitUntilExist(page, label, fn, { timeout: 15000, ...opts })
}


//真實 user 輸入 helper（Pattern D）：typeIntoInput 為套件之同一實作（click → 驗 activeElement → Backspace 清空 → insertText → 驗值 → retry×3）。


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


//API 樹面板（WDrawer 之 drawer slot：搜尋列＋分類樹）之 Locator，供紅框標注「左樹區」。
//why：頁面上帶 border-right 之 div 不只一個——最左側功能選單鈕列（統計 / API）亦是，且在文件順序中居前，
//直接 captureStableWithBox(page, 'div[style*="border-right"]') 會框到功能鈕列（2026-09-28 審圖發現 display E2E-002、
//edit E2E-003-3 之紅框皆落在功能鈕列）。以「內含搜尋框者」界定，取最內層（同 getTreeText 之 closest）。
function treePanel(page) {
    return page.locator('div[style*="border-right"]').filter({ has: page.locator('input[placeholder]') }).last()
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
//標準圖路徑 test/pics/<flow>/<flow>-<lang>-<圖鍵>.png；比對為套件 assertBaselineMatch（pixelmatch includeAA:false 反鋸齒感知、
//threshold 0.1、maxDiffPixels 100；尺寸不同直接 fail；失敗證據 ./testPending/<label>__<ms 時間戳>[-N]__{capture,baseline,diff}.png 永不覆蓋），
//由各 e2e 檔之 runBaselineCase 於語意斷言全部通過後呼叫。原本檔之 assertOrRegenBaseline（REGEN 時當場寫檔之第二條寫檔路徑、先寫圖後斷言）
//於 2026-09-28 五檔改走 runBaselineCase 後已無呼叫者，依「自己修改造成的孤兒函式要移除」刪除。


//整張全頁截圖 + 在「此 e2e 要比對的區塊」外圍畫紅框（#f26、5px）標注，讓報表/審查委員一眼看出本
//case 驗的是哪一區（含「編輯前→編輯後」每一步），截圖仍為完整畫面、保留 UI 脈絡，不裁切成小片。
//target：CSS selector 字串 / 字串陣列 / Playwright Locator / 以上混合陣列（多個取聯集框成一個框）。
//  ——欄位列須依 label 文字定位時用 Locator（如 page.locator('.bk-row').filter({hasText:'名稱'})）。
//fold 以下的目標會先把第一個 scrollIntoView 捲進視窗再框（同組目標應在同一捲動位置）。
//opts.mask：要遮黑的非決定性區域陣列，使 baseline 可穩定 byte 比對。每項可為：
//  - selector 字串：遮該元素的 bbox（左緣/寬度依元素，適用尺寸固定的區域，如 headers pre）。
//  - { sel, fixedWidth }：錨定元素右緣、固定寬度往左延伸（適用右對齊且寬度浮動者，如 durationMs 位數會變）。
//套件 captureStableWithBox（目標與捲動量皆在截圖「之前」量；截圖後以 sharp 合成：遮罩 → 紅框，框疊在遮罩之上永遠可見；不注入 DOM——
//插入後又移除的暫時 DOM 偶發使整頁光柵化偏 1px，本專案 toast 殷鑑，技能 §8.3）。紅框夾在整張 buffer 內（clampTo 預設 'buffer'，本專案原實作）、
//過小不畫（guardSmall 預設 true，同原實作）。mask 每項為 selector 字串（遮元素 bbox）或 { sel, fixedWidth }（錨右緣固定寬，右對齊且位數浮動之值如 durationMs）。
async function captureStableWithBox(page, target, opts = {}) {
    return await pkgCaptureStableWithBox(page, target, { ...opts, capture: captureStable })
}

//composeBox / overlayRegions / overlayImageAt / cropRegion：套件之同一實作（貼圖覆蓋用於 echarts 等無法像素穩定之區域，產製端與比對端貼同一張參考圖）。


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
    treePanel,
    resetToBaseSeed,
    woItems,
    REGEN,
    baseUrl,
    chromiumLaunchArgs,
    launchBrowser,
    composeBox,
}
