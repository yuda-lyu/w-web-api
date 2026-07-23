//e2e：統計資訊頁（事件頻率圖 + 事件統計表）
//
//重要流程（spec bullets，見 spec/流程_統計資訊.md）：
//- E2E-001：點左側選單「統計資訊」→ 進統計頁，事件頻率圖各選取事件分系列（預設全選、各自顏色可區分）。
//- E2E-002：清除後選取部分事件 → 圖表只顯示所選事件（供趨勢辨認 / 危險識別之事件聚焦）。
//- E2E-003：事件統計表（各事件為列、依最近1日多→少排序，欄位 最近1日/8時/4時/1時）。
//
//hermetic：以合成 log 寫入測試專用 logFd，restartBackend 令後端讀之 → getStaEvent 回確定性資料 → 圖/表渲染。
//圖表 canvas 與表格計數皆非決定性（x 軸日期相對今日漂移、canvas GPU 漂移、後端執行期 log 累積），
//故 pixel baseline 以 .stats-chart-area / .stats-table-area 紅框標註並「貼圖覆蓋」（per-item ref 凍結真實
//畫面、非黑塊）；語意斷言仍讀 live DOM（選單/標題/控制/canvas/表頭+列+排序），數值正確性另由 test_staEvent 保證。
//
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import ot from 'dayjs'
import { chromium } from 'playwright'
import {
    startServersOnce,
    restartBackend,
    genTempSettings,
    captureStableWithBox,
    overlayImageAt,
    cropRegion,
    waitUntilExist,
    resetToBaseSeed,
    assertOrRegenBaseline,
    baseUrl,
    chromiumLaunchArgs,
} from './e2e-setup.mjs'


let FLOW = 'stainfor'
let LANGS = ['eng', 'cht']

let T = {
    eng: { menu: 'Statistics', title: 'Statistics Information', timeRange: 'Time range', selectEvents: 'Select events', colEvent: 'Event', col1day: 'Last 1 day', tableTitle: 'Event Statistics', opt1day: '1 day' },
    cht: { menu: '統計資訊', title: '統計資訊', timeRange: '時間範圍', selectEvents: '選擇事件', colEvent: '事件', col1day: '最近1日', tableTitle: '事件統計表', opt1day: '1天' },
}

//測試專用 log 資料夾（與 srLog/staEvent 共用之 logFd）
let SYNTH_FD = './tmp/_logs-e2e-stats'

//E2E-002 聚焦選取之事件（須存在於合成 log）
let PICK_EVENTS = ['verifyConn', 'kpfun-getApisList']


function logLine(t, event, extra = {}) {
    return JSON.stringify({ level: 30, time: t.valueOf(), pid: 1, hostname: 'e2e', event, ...extra })
}


//寫確定性合成 log：近 3 天、多種 event（使圖/表渲染、個別系列與排序皆有內容）。畫面以貼圖覆蓋故數值不需精確。
function writeSyntheticLogs() {
    fs.rmSync(SYNTH_FD, { recursive: true, force: true })
    fs.mkdirSync(SYNTH_FD, { recursive: true })

    let now = ot()
    let evs = [
        ['verifyConn', 6],
        ['kpfun-getApisList', 4],
        ['kpfun-saveApi', 2],
        ['kpfun-getWebInfor', 5],
        ['api/getUserByToken', 3],
        ['verifyClientUser', 2],
    ]

    let lines = []
    for (let d of [0, 1, 2]) {
        let base = now.subtract(d, 'day').startOf('hour')
        for (let [ev, n] of evs) {
            for (let i = 0; i < n; i++) {
                lines.push(logLine(base.subtract(i, 'minute'), ev))
            }
        }
    }
    fs.writeFileSync(path.join(SYNTH_FD, 'e2e-synth.log'), lines.join('\n') + '\n', 'utf8')
}


//取某 selector 之 fullPage 矩形
async function rectOf(page, sel) {
    return await page.evaluate((s) => {
        let el = document.querySelector(s)
        if (!el) {
            return null
        }
        let r = el.getBoundingClientRect()
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }
    }, sel)
}


//截圖 + 貼圖覆蓋（取代黑框；參考 w-web-sso e2e-stainfor）：
//統計頁之「圖表區」與「統計表區」兩者皆為動態（canvas GPU 漂移 + x 軸日期 + 計數隨 log 累積漂移），
//且兩區常同時（或局部）出現在截圖內，故**每個 case 一律同時凍結兩區**——否則焦點外那區的動態內容（如圖表
//案底部露出的統計表那列計數）會漂移而 byte 不穩（殷鑑：cht E2E-002 底部統計表計數 diff 258px）。
//紅框只標焦點區（focusSel）：focus 區之 ref 含紅框（外擴 pad）；非 focus 區 ref 為裁切原尺寸（無框）。
//ref 皆只存「該區那一塊裁切小圖」（非整頁，`_staref-*.png` 不算 baseline）；其餘整頁（選單/標題/控制區）live 比對。
async function captureStatsShot(page, lang, caseName, focusSel) {
    let buf = await captureStableWithBox(page, focusSel) //紅框畫在 focus 區外緣, 不遮黑
    let regions = [
        { key: 'chart', sel: '.stats-chart-area' },
        { key: 'table', sel: '.stats-table-area' },
    ]
    for (let rg of regions) {
        let rect = await rectOf(page, rg.sel)
        if (!rect) {
            continue
        }
        let pad = (rg.sel === focusSel) ? 8 : 0 //focus 區外擴含紅框；非 focus 區裁原尺寸
        let r = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 }
        let refPath = path.join(`./test/pics/${FLOW}`, `_staref-${lang}-${caseName}-${rg.key}.png`)
        if (!fs.existsSync(refPath)) {
            fs.mkdirSync(path.dirname(refPath), { recursive: true })
            let cropped = await cropRegion(buf, r) //bootstrap：裁該區小圖存 ref（刪檔可重產）
            fs.writeFileSync(refPath, cropped)
        }
        let refBuf = fs.readFileSync(refPath)
        buf = await overlayImageAt(buf, refBuf, Math.max(0, r.x), Math.max(0, r.y))
    }
    return buf
}


//進入統計資訊頁：開頁 → 等樹 → 點左選單「統計資訊」→ 等標題 + 圖表 canvas + 統計表列。
async function gotoStats(page, lang) {
    await page.goto(`${baseUrl}/?token=sys&lang=${lang}`, { waitUntil: 'load', timeout: 30000 })
    await waitUntilExist(page, 'API tree rendered', () => (document.body.innerText || '').includes('取得API清單'), { timeout: 25000 })
    await page.getByText(T[lang].menu, { exact: true }).first().click()
    await waitUntilExist(page, `stats title (${T[lang].title})`, (m) => (document.body.innerText || '').includes(m), { timeout: 8000, arg: T[lang].title })
    await waitUntilExist(page, 'echarts canvas', () => !!document.querySelector('.stats-chart-area canvas'), { timeout: 20000 })
    await waitUntilExist(page, 'stats table rows', () => document.querySelectorAll('.stats-table-area tbody tr').length > 0, { timeout: 8000 })
    await page.waitForTimeout(1200) //等 echarts 渲染/動畫 settle
}


describe('e2e-stainfor (統計資訊 / 事件頻率)', function() {
    this.timeout(300000)

    let browser = null
    let ctx = null
    let page = null

    before(async function() {
        this.timeout(180000)
        await startServersOnce()
        writeSyntheticLogs()
        await restartBackend(genTempSettings({ logFd: SYNTH_FD }))
    })

    after(async function() {
        this.timeout(30000)
        await restartBackend('./settings.json')
        try { fs.rmSync(SYNTH_FD, { recursive: true, force: true }) } catch (e) {}
    })

    beforeEach(async function() {
        this.timeout(180000)
        await resetToBaseSeed()
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

    for (let lang of LANGS) {

        //E2E-001：進統計頁 → 事件頻率圖各事件分系列（預設全選、可區分）
        it(`E2E-001 [${lang}] 事件頻率圖各事件分系列（預設全選）`, async function() {

            await gotoStats(page, lang)

            let info = await page.evaluate((tt) => {
                let menuActive = Array.from(document.querySelectorAll('.w-mm-btn'))
                    .some((b) => b.classList.contains('on') && (b.innerText || '').includes(tt.menu))
                let allCb = Array.from(document.querySelectorAll('.stats-evt-cb'))
                let checked = allCb.filter((c) => c.checked)
                return {
                    body: document.body.innerText || '',
                    menuActive,
                    cbCount: allCb.length,
                    checkedCount: checked.length,
                    hasCanvas: !!document.querySelector('.stats-chart-area canvas'),
                }
            }, T[lang])
            assert.ok(info.menuActive, '左選單「統計資訊」應為 active')
            assert.ok(info.body.includes(T[lang].title), `應顯示標題「${T[lang].title}」`)
            assert.ok(info.body.includes(T[lang].selectEvents), `應顯示「${T[lang].selectEvents}」事件選擇`)
            assert.ok(info.body.includes(T[lang].timeRange), `應顯示「${T[lang].timeRange}」`)
            assert.ok(info.cbCount >= 2, `事件 checkbox 應 >= 2（實得 ${info.cbCount}）`)
            assert.strictEqual(info.checkedCount, info.cbCount, '預設應全選所有事件（各事件分系列、可區分）')
            assert.ok(info.hasCanvas, '事件頻率圖 canvas 應存在')

            let buf = await captureStatsShot(page, lang, 'E2E-001-chart-all', '.stats-chart-area')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-001-chart-all.png`, buf)

        })

        //E2E-002：清除後選取部分事件 → 圖表只顯示所選事件
        it(`E2E-002 [${lang}] 選取部分事件圖表只顯示所選`, async function() {

            await gotoStats(page, lang)

            //清除全部 → 只勾選 PICK_EVENTS
            await page.locator('.stats-sel-none').click()
            for (let ev of PICK_EVENTS) {
                await page.locator(`.evt-chip[data-event="${ev}"]`).click()
            }
            await page.waitForTimeout(1200) //等圖表重渲染

            let checked = await page.evaluate(() => Array.from(document.querySelectorAll('.stats-evt-cb:checked')).map((c) => c.value).sort())
            assert.deepStrictEqual(checked, [...PICK_EVENTS].sort(), `應只勾選 ${PICK_EVENTS.join('、')}`)
            let hasCanvas = await page.evaluate(() => !!document.querySelector('.stats-chart-area canvas'))
            assert.ok(hasCanvas, '切換後圖表 canvas 仍應存在')

            let buf = await captureStatsShot(page, lang, 'E2E-002-chart-selected', '.stats-chart-area')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-002-chart-selected.png`, buf)

        })

        //E2E-003：事件統計表（各事件列、依最近1日多→少排序，欄位 1日/8時/4時/1時）
        it(`E2E-003 [${lang}] 事件統計表依最近1日排序`, async function() {

            await gotoStats(page, lang)

            let tbl = await page.evaluate(() => {
                let area = document.querySelector('.stats-table-area')
                let headers = Array.from(area.querySelectorAll('thead th')).map((th) => (th.innerText || '').trim())
                let rows = Array.from(area.querySelectorAll('tbody tr')).map((tr) => {
                    let tds = Array.from(tr.querySelectorAll('td')).map((td) => (td.innerText || '').trim())
                    return { event: tr.getAttribute('data-event'), d1day: Number(tds[1]) }
                })
                return { headers, rows }
            })
            //語意：表頭含該語系欄名 + 至少一列 + 依最近1日 多→少排序
            assert.ok(tbl.headers.some((h) => h.includes(T[lang].colEvent)), `表頭應含「${T[lang].colEvent}」`)
            assert.ok(tbl.headers.some((h) => h.includes(T[lang].col1day)), `表頭應含「${T[lang].col1day}」`)
            assert.ok(tbl.rows.length > 0, '統計表應至少一列')
            for (let i = 0; i + 1 < tbl.rows.length; i++) {
                assert.ok(tbl.rows[i].d1day >= tbl.rows[i + 1].d1day, `第 ${i} 列最近1日(${tbl.rows[i].d1day}) 應 >= 下一列(${tbl.rows[i + 1].d1day})`)
            }

            //視覺：紅框 + 貼圖覆蓋統計表區
            let buf = await captureStatsShot(page, lang, 'E2E-003-table', '.stats-table-area')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-003-table.png`, buf)

        })

        //E2E-004：切換時間範圍下拉（1天）→ 前端依 timeGroup 重採樣、圖表重繪
        it(`E2E-004 [${lang}] 切換時間範圍重採樣重繪`, async function() {

            await gotoStats(page, lang)

            //預設時間範圍為 1hr
            let before = await page.locator('#timeGroupSel').inputValue()
            assert.strictEqual(before, '1hr', `時間範圍下拉預設應為 1hr（實得 ${before}）`)

            //act：native <select> 切為「1天」（selectOption 為原生下拉之 user-facing 操作，無可打字之替代）
            await page.locator('#timeGroupSel').selectOption('1day')
            await page.waitForTimeout(1200) //等 resampledData 重算 + echarts 重繪 settle

            //語意：下拉值與所選選項顯示文字皆為「1天」；圖表 canvas 重繪後仍存在
            //（重採樣正確性由「下拉選取 → resampledData → chartOption」綁定 + test_staEvent 守，canvas 內部不做 introspection，同 E2E-002 取捨）
            let info = await page.evaluate(() => {
                let sel = document.querySelector('#timeGroupSel')
                let selText = sel && sel.selectedIndex >= 0 ? (sel.options[sel.selectedIndex].text || '').trim() : ''
                return { val: sel ? sel.value : '', selText, hasCanvas: !!document.querySelector('.stats-chart-area canvas') }
            })
            assert.strictEqual(info.val, '1day', `切換後時間範圍下拉值應為 1day（實得 ${info.val}）`)
            assert.ok(info.selText.includes(T[lang].opt1day), `下拉所選選項應顯示該語系「${T[lang].opt1day}」（實得「${info.selText}」）`)
            assert.ok(info.hasCanvas, '重繪後事件頻率圖 canvas 應仍存在')

            //視覺：紅框 + 貼圖覆蓋圖表區（1天重採樣後之圖表，per-item ref 凍結）
            let buf = await captureStatsShot(page, lang, 'E2E-004-timegroup-1day', '.stats-chart-area')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-004-timegroup-1day.png`, buf)

        })

    }

})
