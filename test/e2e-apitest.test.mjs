//e2e：API 測試流程（Try it / 經後端 proxy 送出請求）
//
//重要流程（spec bullets）：
//- E2E-001：切到「測試」分頁 → 請求建構器由所選 API 種子帶入 → 改 URL 送出 → 回應面板顯示狀態碼。
//- E2E-002~008：見 spec/流程_測試API.md。
//- E2E-009：目標回傳 JSON 陣列 → 回應內容顯示為格式化 JSON（非 [object Object]）；固定陣列目標 body 決定性、做 baseline。
//- E2E-010：請求內容為非法 JSON → 原文送達 echo（不解析不代換）；E2E-011：請求內容清空 → 不帶 body（ADR-029）。
//- E2E-012：method='del' 之種子 API → echo 收到 DELETE（顯示層 DEL → HTTP 動詞，ADR-030）。
//
//act 走真實 user 路徑：點分頁、鍵盤輸入 URL、點送出。
//assert：①送出前種子建構器穩定態 pixel baseline（deterministic）；②送出後回應狀態碼 200 之語意斷言。
//註：回應面板含 durationMs / date / etag 等非決定性內容，不做 pixel baseline，僅語意驗證（§6.2）。
//
import assert from 'assert'
import http from 'http'
import {
    startServersOnce,
    captureStableWithBox,
    waitUntilExist,
    typeIntoInput,
    gotoApiWorkspace,
    resetToBaseSeed,
    assertOrRegenBaseline,
    woItems,
    launchBrowser,
} from './tools/e2e-setup.mjs'
import ds from '../src/schema/index.mjs'


let FLOW = 'apitest'
let LANGS = ['eng', 'cht']

let T = {
    eng: { test: 'Test', send: 'Send', urlPh: 'Request URL', resEmpty: 'No response yet', valReq: 'This field is required', errInvalidUrl: 'The request URL is invalid' },
    cht: { test: '測試', send: '送出請求', urlPh: '請求網址', resEmpty: '尚無回應', valReq: '此欄位必填', errInvalidUrl: '請求網址無效' },
}


//測試自帶 echo server（回聲收到的 method/query/headers/body）：認證帶入與建構器編輯 case 把請求
//網址指向它，經後端 proxy round-trip 後回應面板即顯示 echo 內容，用語意斷言驗「認證/參數確實隨請求送達」。
//固定 port（非 ephemeral）：位址列 URL 進 baseline，須決定性。後端(srv.mjs 子進程)以 Node fetch 打 127.0.0.1
//同機可達；echo server 跑在 mocha 進程內、before 起、after 關（lifecycle 對稱）。
let ECHO_PORT = 11077
let ECHO_URL = `http://127.0.0.1:${ECHO_PORT}/echo`
//固定陣列目標（E2E-009）：回一個決定性 JSON 陣列（元素為物件），驗「陣列型回應顯示為格式化 JSON」；
//與 echo 不同：內容固定、無 request 回顯，故回應 body 可入 pixel baseline。
let ARR_URL = `http://127.0.0.1:${ECHO_PORT}/arr`
let ARR_FIXTURE = [{ id: 1, name: 'alpha' }, { id: 2, name: 'beta' }]
let echoServer = null

function startEchoServer() {
    return new Promise((resolve, reject) => {
        echoServer = http.createServer((req, res) => {
            let chunks = []
            req.on('data', (c) => chunks.push(c))
            req.on('end', () => {
                let u0 = new URL(req.url, `http://127.0.0.1:${ECHO_PORT}`)
                if (u0.pathname === '/arr') {
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify(ARR_FIXTURE))
                    return
                }
                let raw = Buffer.concat(chunks).toString('utf8')
                let body
                try { body = raw ? JSON.parse(raw) : '' }
                catch (e) { body = raw }
                let u = new URL(req.url, `http://127.0.0.1:${ECHO_PORT}`)
                //重複之 query 鍵回顯為陣列（改造前 forEach 覆蓋只留最後一值，無法驗「重複鍵各自送達」；E2E-013）
                let query = {}
                for (let k of new Set(u.searchParams.keys())) {
                    let vs = u.searchParams.getAll(k)
                    query[k] = vs.length > 1 ? vs : vs[0]
                }
                let out = { ok: true, method: req.method, path: u.pathname, query, headers: req.headers, body }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(out))
            })
        })
        echoServer.on('error', reject)
        echoServer.listen(ECHO_PORT, '127.0.0.1', () => resolve())
    })
}

function stopEchoServer() {
    return new Promise((resolve) => {
        if (echoServer) {
            echoServer.close(() => resolve())
            echoServer = null
        }
        else {
            resolve()
        }
    })
}


//建立本檔特化之認證 API（疊加於 base seed 之上；levels='API' 使其在左樹頂層可見、可點）。
//目標網址指向 echo，seedFromItem 依 authType 自動帶入認證於 Headers/Query。
function makeAuthApi(authType, authConfig, name) {
    return ds.apis.funNew({
        name,
        levels: 'API',
        method: 'get',
        url: ECHO_URL,
        authType,
        authConfigJson: JSON.stringify(authConfig),
    })
}


//讀請求建構器 Query（idx=0）／Headers（idx=1）表各列之 on/key/value（input value 不在 innerText, 須逐 input 讀）。
async function readKvRows(page, idx) {
    return await page.evaluate((i) => {
        let tables = document.querySelectorAll('.kv-table')
        let h = tables[i]
        if (!h) {
            return []
        }
        return Array.from(h.querySelectorAll('.kv-row')).map((r) => ({
            on: !!(r.querySelector('.kv-col-ck input') && r.querySelector('.kv-col-ck input').checked),
            key: (r.querySelector('.kv-col-key input') || {}).value || '',
            value: (r.querySelector('.kv-col-val input') || {}).value || '',
        }))
    }, idx)
}
async function readHeaderRows(page) {
    return await readKvRows(page, 1)
}


//讀回應面板 body pre（最後一個 .card pre.code）之純文字，用於 echo 語意斷言（scope 到回應區、
//避免撈到左樹 method badge 等同名文字造成 false positive）。送出前 body pre 不存在則回空字串。
async function getRespBodyText(page) {
    return await page.evaluate(() => {
        let pres = Array.from(document.querySelectorAll('.card pre.code'))
        return pres.length ? (pres[pres.length - 1].innerText || '') : ''
    })
}


//等回應面板 body pre 出現且含指定值（echo round-trip 完成）。
async function waitEchoValue(page, val) {
    await waitUntilExist(page, `echo response contains ${val}`, (v) => {
        let pres = Array.from(document.querySelectorAll('.card pre.code'))
        let body = pres.length ? (pres[pres.length - 1].innerText || '') : ''
        return body.includes(v)
    }, { timeout: 15000, arg: val })
}


//導頁至 API 工作區改用共用 gotoApiWorkspace（收斂自本檔、e2e-display、e2e-edit 逐字相同之舊 gotoReady；見 e2e-setup.mjs）。


describe('e2e-apitest (API 測試 / proxy)', function() {
    this.timeout(240000)

    let browser = null
    let ctx = null
    let page = null

    before(async function() {
        this.timeout(180000)
        await startServersOnce()
        await startEchoServer() //進場起 echo（離場於 after 關閉，lifecycle 對稱）
    })

    beforeEach(async function() {
        this.timeout(180000)
        //每個 case 從相同 base seed 起跑（hermetic）
        await resetToBaseSeed()
        //每 case 全新 browser（對齊 SSO eye-toggle E2E-017/018 之 per-case fresh）：避免共用 browser 跨 case
        //累積的 glyph atlas / raster 狀態於虛擬渲染邊界偶發位移。launchBrowser() 內建確定性渲染組。
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

    after(async function() {
        //還原 base seed 供非 e2e 時段使用；關閉本檔 spawn 之 echo server
        await resetToBaseSeed()
        await stopEchoServer()
    })

    //導頁就緒 + 於左樹點選指定 API + 切「測試」分頁，回傳網址輸入 Locator。
    async function selectApiAndOpenTest(page, lang, apiName) {
        await gotoApiWorkspace(page, lang)
        await waitUntilExist(page, `tree has ${apiName}`, (n) => (document.body.innerText || '').includes(n), { timeout: 10000, arg: apiName })
        await page.getByText(apiName, { exact: true }).first().click({ timeout: 8000 })
        await waitUntilExist(page, `docs selected ${apiName}`, (n) => {
            let op = document.querySelector('.op-title')
            return !!op && (op.innerText || '').trim() === n
        }, { timeout: 8000, arg: apiName })
        await page.getByText(T[lang].test, { exact: true }).first().click({ timeout: 8000 })
        let urlInp = page.getByPlaceholder(T[lang].urlPh)
        await urlInp.waitFor({ state: 'visible', timeout: 8000 })
        return urlInp
    }

    for (let lang of LANGS) {

        it(`E2E-001 [${lang}] 測試 API 送出請求顯示回應`, async function() {
            await gotoApiWorkspace(page, lang)

            //act：點「測試」分頁
            await page.getByText(T[lang].test, { exact: true }).first().click({ timeout: 8000 })
            let urlInp = page.getByPlaceholder(T[lang].urlPh)
            await urlInp.waitFor({ state: 'visible', timeout: 8000 })

            //種子驗證：建構器 url 由 API（取得API清單）種子帶入（讀 input value，非 innerText）、回應區為「尚無回應」
            let urlVal = await urlInp.inputValue()
            assert.ok(urlVal.includes('http://localhost:11005/getAPIsList'), `建構器 url 應由 API 種子帶入（實得「${urlVal}」）`)
            let pre = await page.evaluate(() => document.body.innerText || '')
            assert.ok(pre.includes(T[lang].resEmpty), '送出前回應區應顯示「尚無回應」')

            //步驟1 出圖：送出前的請求建構器（由 API 種子帶入）→ 紅框標 address bar（method+url+送出）
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-001-1-seeded.png`, await captureStableWithBox(page, '.addr-bar'))

            //步驟2：把 URL 改為本機 server 根（送出前）→ 紅框標 address bar（已改的 URL，從什麼變成什麼）
            await typeIntoInput(page, urlInp, 'http://127.0.0.1:11005/')
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-001-2-url-changed.png`, await captureStableWithBox(page, '.addr-bar'))

            //步驟3：點送出（經後端 proxy 繞過 CORS）→ 等回 200
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitUntilExist(page, 'response 200', () => (document.body.innerText || '').includes('200'), { timeout: 15000 })

            //assert UI（user-facing 語意）
            let post = await page.evaluate(() => document.body.innerText || '')
            assert.ok(post.includes('200'), '回應面板應顯示狀態碼 200（proxy round-trip 成功）')
            assert.ok(!post.includes(T[lang].resEmpty), '送出後不應再顯示「尚無回應」')

            //步驟3 出圖：回應卡 → 紅框標回應卡。三個非決定性區域處理：
            //①durationMs(.w-tnum) 右對齊、位數變動使左緣浮動 → 固定寬度(100px)錨右緣遮黑；
            //②headers pre(含 date/etag) → 遮黑（.card pre.code 第一個=headers）；
            //③response body 含 build asset hash(/js/app.<hash>.js、app.<hash>.css 等)每次重編皆變 →
            //  截圖前正規化為 .HASH.（取代「每次重產」，使標準圖跨 rebuild 穩定，body 其餘內容仍受 pixel 比對驗證）。
            await page.evaluate(() => {
                let pres = Array.from(document.querySelectorAll('.card pre.code'))
                let body = pres[pres.length - 1] //最後一個 pre.code = response body（v-html highlighted）
                if (body) {
                    body.innerHTML = body.innerHTML.replace(/\.[0-9a-f]{8}\.(js|css)/g, '.HASH.$1')
                }
            })
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-001-3-response.png`, await captureStableWithBox(page, '.card', { mask: [{ sel: '.w-tnum', fixedWidth: 100 }, '.card pre.code'] }))
        })

        //E2E-002：Request URL 留空送出 → 同步檢測短路、err-bar 必填紅字、不打網路、回應區維持「尚無回應」
        it(`E2E-002 [${lang}] 請求網址留空送出顯示必填錯誤、不打網路`, async function() {
            await gotoApiWorkspace(page, lang)

            await page.getByText(T[lang].test, { exact: true }).first().click({ timeout: 8000 })
            let urlInp = page.getByPlaceholder(T[lang].urlPh)
            await urlInp.waitFor({ state: 'visible', timeout: 8000 })

            //act 多階段：清空 URL →（階段1 送出前空 URL 態）→ 點送出 →（階段2 錯誤態）
            await typeIntoInput(page, urlInp, '')

            //階段1：URL 已清空、尚未送出（err-bar 未出現）→ 紅框標 address bar
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-002-1-url-empty.png`, await captureStableWithBox(page, '.addr-bar'))

            //act：點送出（URL 空 → 同步檢測短路）
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })

            //等 err-bar 必填紅字出現（同步檢測短路、未打網路）
            await waitUntilExist(page, 'url required err-bar', (msg) => {
                let e = document.querySelector('.err-bar')
                return !!e && (e.innerText || '').includes(msg)
            }, { timeout: 8000, arg: T[lang].valReq })

            //assert 語意：err-bar = 必填；回應區仍「尚無回應」
            let info = await page.evaluate(() => ({
                err: (document.querySelector('.err-bar')?.innerText || '').trim(),
                body: document.body.innerText || '',
            }))
            assert.ok(info.err.includes(T[lang].valReq), `err-bar 應顯示必填「${T[lang].valReq}」（實得「${info.err}」）`)
            assert.ok(info.body.includes(T[lang].resEmpty), '回應區應維持「尚無回應」（未送出）')

            //階段2：送出後 err-bar 必填紅字 → 紅框標 address bar 與其下 err-bar
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-002-2-url-required.png`, await captureStableWithBox(page, ['.addr-bar', '.err-bar']))
        })

        //E2E-003：非 http(s) 字串送出 → 前端僅檢非空放行 → 後端 reject err-key 'errReqUrlInvalid' → 前端依 lang 反查顯示在地化錯誤（eng/cht 各異）
        it(`E2E-003 [${lang}] 非 http(s) 網址送出，後端拒絕並顯示錯誤`, async function() {
            await gotoApiWorkspace(page, lang)

            await page.getByText(T[lang].test, { exact: true }).first().click({ timeout: 8000 })
            let urlInp = page.getByPlaceholder(T[lang].urlPh)
            await urlInp.waitFor({ state: 'visible', timeout: 8000 })

            //act 多階段：輸入 notaurl →（階段1 送出前輸入態）→ 點送出 →（階段2 後端拒絕錯誤態）
            await typeIntoInput(page, urlInp, 'notaurl')

            //階段1：已輸入非法 URL、尚未送出（err-bar 未出現）→ 紅框標 address bar
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-003-1-url-typed.png`, await captureStableWithBox(page, '.addr-bar'))

            //act：點送出（前端放行 → 後端 reject）
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })

            //等 err-bar 出現——後端 reject err-key 'errReqUrlInvalid'，前端依當前 lang 反查顯示在地化文字
            await waitUntilExist(page, 'invalid url err-bar', (msg) => {
                let e = document.querySelector('.err-bar')
                return !!e && (e.innerText || '').includes(msg)
            }, { timeout: 15000, arg: T[lang].errInvalidUrl })

            //assert 語意：err-bar 顯示在地化錯誤文字（eng/cht 各異，由前端依 lang 反查 err-key）；回應區無 200
            let info = await page.evaluate(() => ({
                err: (document.querySelector('.err-bar')?.innerText || '').trim(),
                body: document.body.innerText || '',
                hasStatus: !!document.querySelector('.card-h .w-status'),
            }))
            assert.ok(info.err.includes(T[lang].errInvalidUrl), `err-bar 應顯示在地化錯誤「${T[lang].errInvalidUrl}」（實得「${info.err}」）`)
            assert.ok(!info.hasStatus, '送出失敗不應出現回應狀態碼（res 為空）')
            assert.ok(info.body.includes(T[lang].resEmpty), '送出失敗回應區應維持「尚無回應」')

            //階段2：送出後 err-bar 在地化錯誤 → 紅框標 address bar 與其下 err-bar
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-003-2-invalid-url.png`, await captureStableWithBox(page, ['.addr-bar', '.err-bar']))
        })

        //E2E-004：選 bearer 認證 API → 切測試分頁 → Headers 自動帶入 Authorization: Bearer <token> → 送 echo → 回應回顯該值
        it(`E2E-004 [${lang}] bearer 認證帶入並隨請求送達目標`, async function() {
            let apiName = 'API認證測試Bearer'
            let token = 'TESTBEARER123'
            //疊加一支 bearer 認證 API（beforeEach 已 resetToBaseSeed；於 goto 前 insert 使初次同步即含此 API）
            await woItems.apis.insert([makeAuthApi('bearer', { token }, apiName)])

            await selectApiAndOpenTest(page, lang, apiName)

            //語意①：建構器 Headers 帶入 Authorization: Bearer <token>（seedFromItem 依 authType 解析）
            let rows = await readHeaderRows(page)
            let authRow = rows.find((r) => r.key === 'Authorization')
            assert.ok(authRow, 'Headers 應帶入一列 Authorization')
            assert.strictEqual(authRow.value, `Bearer ${token}`, `Authorization 值應為「Bearer ${token}」（實得「${authRow ? authRow.value : ''}」）`)

            //視覺：送出前種子態、紅框標 Headers 表（第 2 個 kv-table）
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-004-bearer-header.png`, await captureStableWithBox(page, page.locator('.kv-table').nth(1)))

            //act：送出（網址已為 echo 種子）→ 等回應回顯 Bearer token
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitEchoValue(page, `Bearer ${token}`)

            //語意②：回應面板 body 含 echo 回顯之 Authorization（證明認證隨請求送達）
            let resp = await getRespBodyText(page)
            assert.ok(resp.includes(`Bearer ${token}`), `回應 body 應回顯「Bearer ${token}」（proxy 已把認證送達 echo）`)
        })

        //E2E-005：選 apikey 認證 API（in='header'）→ Headers 自動帶入 X-API-Key → 送 echo → 回應回顯
        it(`E2E-005 [${lang}] apikey 認證帶入並隨請求送達目標`, async function() {
            let apiName = 'API認證測試ApiKey'
            let keyName = 'X-API-Key'
            let keyVal = 'APIKEYVAL123'
            await woItems.apis.insert([makeAuthApi('apikey', { name: keyName, value: keyVal, in: 'header' }, apiName)])

            await selectApiAndOpenTest(page, lang, apiName)

            //語意①：建構器 Headers 帶入 X-API-Key: <value>
            let rows = await readHeaderRows(page)
            let keyRow = rows.find((r) => r.key === keyName)
            assert.ok(keyRow, `Headers 應帶入一列 ${keyName}`)
            assert.strictEqual(keyRow.value, keyVal, `${keyName} 值應為「${keyVal}」（實得「${keyRow ? keyRow.value : ''}」）`)

            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-005-apikey-header.png`, await captureStableWithBox(page, page.locator('.kv-table').nth(1)))

            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitEchoValue(page, keyVal)

            let resp = await getRespBodyText(page)
            assert.ok(resp.includes(keyVal), `回應 body 應回顯金鑰值「${keyVal}」`)
        })

        //E2E-006：選 basic 認證 API → Headers 自動帶入 Authorization: Basic base64(user:pass) → 送 echo → 回應回顯
        it(`E2E-006 [${lang}] basic 認證帶入並隨請求送達目標`, async function() {
            let apiName = 'API認證測試Basic'
            let username = 'user1'
            let password = 'pass1'
            let basicVal = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
            await woItems.apis.insert([makeAuthApi('basic', { username, password }, apiName)])

            await selectApiAndOpenTest(page, lang, apiName)

            //語意①：建構器 Headers 帶入 Authorization: Basic <base64>
            let rows = await readHeaderRows(page)
            let authRow = rows.find((r) => r.key === 'Authorization')
            assert.ok(authRow, 'Headers 應帶入一列 Authorization')
            assert.strictEqual(authRow.value, basicVal, `Authorization 值應為「${basicVal}」（實得「${authRow ? authRow.value : ''}」）`)

            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-006-basic-header.png`, await captureStableWithBox(page, page.locator('.kv-table').nth(1)))

            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitEchoValue(page, basicVal)

            let resp = await getRespBodyText(page)
            assert.ok(resp.includes(basicVal), `回應 body 應回顯「${basicVal}」`)
        })

        //E2E-007：於建構器新增 Query/Header 列並勾選/取消勾選 → 改網址為 echo → 送出 → 回應驗參數生效、未勾選之列不納入
        it(`E2E-007 [${lang}] 建構器新增 Query/Header 列送出參數生效`, async function() {
            //預設所選 API（取得API清單，GET），直接切測試分頁
            await gotoApiWorkspace(page, lang)
            await page.getByText(T[lang].test, { exact: true }).first().click({ timeout: 8000 })
            let urlInp = page.getByPlaceholder(T[lang].urlPh)
            await urlInp.waitFor({ state: 'visible', timeout: 8000 })

            let qTable = page.locator('.kv-table').nth(0)
            let hTable = page.locator('.kv-table').nth(1)

            //Query 首列填鍵值（勾選態、應納入）
            await typeIntoInput(page, qTable.locator('.kv-row').nth(0).locator('.kv-col-key input'), 'xqkey')
            await typeIntoInput(page, qTable.locator('.kv-row').nth(0).locator('.kv-col-val input'), 'xqval')
            //新增第二列 query，填鍵值後「取消勾選」（不應納入送出）
            await page.locator('.btn-addrow').nth(0).click({ timeout: 8000 })
            await typeIntoInput(page, qTable.locator('.kv-row').nth(1).locator('.kv-col-key input'), 'yqkey')
            await typeIntoInput(page, qTable.locator('.kv-row').nth(1).locator('.kv-col-val input'), 'yqval')
            await qTable.locator('.kv-row').nth(1).locator('.kv-col-ck input').uncheck({ timeout: 8000 })
            //Headers 新增一列填鍵值（勾選態、應納入）
            await page.locator('.btn-addrow').nth(1).click({ timeout: 8000 })
            await typeIntoInput(page, hTable.locator('.kv-row').last().locator('.kv-col-key input'), 'X-Test-Header')
            await typeIntoInput(page, hTable.locator('.kv-row').last().locator('.kv-col-val input'), 'xhval')

            //網址改為 echo
            await typeIntoInput(page, urlInp, ECHO_URL)

            //視覺：送出前編輯態、紅框標 Query 與 Headers 兩表
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-007-kv-edit.png`, await captureStableWithBox(page, [qTable, hTable]))

            //act（刪列）：再新增第三列 query 填鍵值（勾選態）→ 點該列「×」刪除 → 表回到兩列（x 勾選、y 未勾選）。
            //（.kv-del-btn 為建構器唯一未被任何 case 點過之可點元素；列 :key 改為列 id 後刪列不錯位——ADR-031）
            await page.locator('.btn-addrow').nth(0).click({ timeout: 8000 })
            await typeIntoInput(page, qTable.locator('.kv-row').nth(2).locator('.kv-col-key input'), 'zqkey')
            await typeIntoInput(page, qTable.locator('.kv-row').nth(2).locator('.kv-col-val input'), 'zqval')
            assert.strictEqual((await readKvRows(page, 0)).length, 3, '新增後 Query 表應為 3 列')
            await qTable.locator('.kv-row').nth(2).locator('.kv-del-btn').click({ timeout: 8000 })
            let qRows = await readKvRows(page, 0)
            assert.deepStrictEqual(qRows.map((r) => r.key), ['xqkey', 'yqkey'], `刪列後 Query 表應剩 xqkey、yqkey（實得 ${JSON.stringify(qRows.map((r) => r.key))}）`)
            assert.deepStrictEqual(qRows.map((r) => r.on), [true, false], '刪列後各列勾選狀態應維持（x 勾選、y 未勾選）')

            //act：送出 → 等 echo 回顯 header 值
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitEchoValue(page, 'xhval')

            //語意：回應 body 含已勾選之 query 鍵值與 header；不含被取消勾選之列值；不含已刪除之列值
            let resp = await getRespBodyText(page)
            assert.ok(resp.includes('xqkey') && resp.includes('xqval'), '回應應含已勾選之 query 鍵值 xqkey/xqval')
            assert.ok(resp.includes('xhval'), '回應應含新增之 header 值 xhval')
            assert.ok(!resp.includes('yqval'), '被取消勾選之 query 列值 yqval 不應納入送出')
            assert.ok(!resp.includes('yqkey'), '被取消勾選之 query 列鍵 yqkey 不應納入送出')
            assert.ok(!resp.includes('zqkey') && !resp.includes('zqval'), '已刪除之列 zqkey/zqval 不應納入送出')
        })

        //E2E-008：選 POST API → 出現請求內容區 → 清空並輸入 JSON body → 改網址為 echo → 送出 → 回應驗 method=POST + body
        it(`E2E-008 [${lang}] POST API 編輯請求內容送出`, async function() {
            //選 base seed 之 POST 筆「新增狗狗資訊」
            let urlInp = await selectApiAndOpenTest(page, lang, '新增狗狗資訊')

            //請求內容區（非 GET/HEAD 才顯示）
            let bodyArea = page.locator('.body-textarea')
            await bodyArea.waitFor({ state: 'visible', timeout: 8000 })

            //清空並輸入 JSON body
            await typeIntoInput(page, bodyArea, '{"dog":"lucky","age":3}')
            //網址改為 echo
            await typeIntoInput(page, urlInp, ECHO_URL)

            //視覺：送出前編輯態、紅框標 address bar（含方法 POST + 網址）與請求內容區
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-008-post-body.png`, await captureStableWithBox(page, ['.addr-bar', '.body-textarea']))

            //act：送出 → 等 echo 回顯 body 值
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitEchoValue(page, 'lucky')

            //語意：回應 body（scope 到回應區，避免撈左樹 POST badge）含 method POST 與所輸入 JSON 欄位值
            let resp = await getRespBodyText(page)
            assert.ok(resp.includes('POST'), '回應應顯示 method 為 POST')
            assert.ok(resp.includes('lucky') && resp.includes('dog'), '回應應含所輸入 JSON body 之欄位值（dog/lucky）')
        })

        //E2E-009：目標回傳 JSON 陣列 → 回應內容應為格式化 JSON（非 `[object Object],...`）。
        //對應 spec「回應 data 型別 → 顯示形式」表之陣列列；缺陷來源：建議w-web-api調整.md 第 1 項。
        it(`E2E-009 [${lang}] 目標回傳 JSON 陣列，回應內容顯示為格式化 JSON`, async function() {
            await gotoApiWorkspace(page, lang)

            //act：點「測試」分頁 → 網址改為固定陣列目標 → 送出
            await page.getByText(T[lang].test, { exact: true }).first().click({ timeout: 8000 })
            let urlInp = page.getByPlaceholder(T[lang].urlPh)
            await urlInp.waitFor({ state: 'visible', timeout: 8000 })
            await typeIntoInput(page, urlInp, ARR_URL)
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitUntilExist(page, 'response 200', () => (document.body.innerText || '').includes('200'), { timeout: 15000 })

            //語意（spec E2E-009 驗證 1）：狀態碼 200；body 以 `[` 起頭、含縮排後之 `"name": "alpha"`（鍵值間空白＝經
            //JSON.stringify(,2)）、為多行；不含 String(array) 之 `[object Object]`
            let post = await page.evaluate(() => document.body.innerText || '')
            assert.ok(post.includes('200'), '回應面板應顯示狀態碼 200')
            let resp = (await getRespBodyText(page)).trim()
            assert.ok(!resp.includes('[object Object]'), `陣列回應不得顯示為 [object Object]（實得「${resp.slice(0, 60)}」）`)
            assert.ok(resp.startsWith('['), `陣列回應應以 [ 起頭（實得「${resp.slice(0, 60)}」）`)
            assert.ok(resp.includes('"name": "alpha"') && resp.includes('"name": "beta"'), '陣列回應應為縮排 JSON（含 "name": "alpha" / "beta"）')
            assert.ok(resp.split('\n').length > 1, '陣列回應應為多行格式化 JSON')

            //視覺（spec E2E-009 驗證 2）：回應卡紅框；遮黑 durationMs（右對齊固定寬）與 headers pre（含 date）；
            //固定陣列 body 為決定性、保留比對
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-009-array-response.png`, await captureStableWithBox(page, '.card', { mask: [{ sel: '.w-tnum', fixedWidth: 100 }, '.card pre.code'] }))
        })

        //E2E-010：POST API → 請求內容輸入非法 JSON → 改網址為 echo → 送出 → echo 回顯原文字串（工具不解析、不驗證、不代換）
        //對應 spec 規則摘要「契約」之「請求內容原文送出」（ADR-029；改造前 j2o 對非法 JSON 回 {} 而靜默送出 {}）
        it(`E2E-010 [${lang}] 請求內容為非法 JSON 仍原文送達目標`, async function() {
            let urlInp = await selectApiAndOpenTest(page, lang, '新增狗狗資訊')
            let bodyArea = page.locator('.body-textarea')
            await bodyArea.waitFor({ state: 'visible', timeout: 8000 })

            //act：輸入非法 JSON（鍵未加引號、尾逗號）；網址改為 echo
            let invalid = '{dog:lucky,}'
            await typeIntoInput(page, bodyArea, invalid)
            await typeIntoInput(page, urlInp, ECHO_URL)

            //視覺（spec E2E-010 驗證 2）：送出前編輯態、紅框標 address bar 與請求內容區
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-010-invalid-json-body.png`, await captureStableWithBox(page, ['.addr-bar', '.body-textarea']))

            //act：送出 → 等 echo 回顯
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitEchoValue(page, 'lucky')

            //語意（spec E2E-010 驗證 1）：狀態碼 200（由目標決定，工具不擋）；echo 之 body 為原文字串；未被代換為 {}
            let post = await page.evaluate(() => document.body.innerText || '')
            assert.ok(post.includes('200'), '回應面板應顯示狀態碼 200')
            let resp = await getRespBodyText(page)
            assert.ok(resp.includes(`"body": "${invalid}"`), `echo 應回顯原文字串（實得片段「${resp.slice(resp.indexOf('"body"'), resp.indexOf('"body"') + 40)}」）`)
            assert.ok(!resp.includes('"body": {}'), '非法 JSON 不得被代換為空物件送出')
        })

        //E2E-011：POST API → 清空請求內容 → 改網址為 echo → 送出 → echo 收到空 body（工具不補內容）
        //對應 spec 規則摘要「契約」之「空白則不帶 body」（ADR-029；改造前靜默送出 {}）
        it(`E2E-011 [${lang}] 請求內容清空送出不帶 body`, async function() {
            let urlInp = await selectApiAndOpenTest(page, lang, '新增狗狗資訊')
            let bodyArea = page.locator('.body-textarea')
            await bodyArea.waitFor({ state: 'visible', timeout: 8000 })

            //act：清空請求內容；網址改為 echo
            await typeIntoInput(page, bodyArea, '')
            assert.strictEqual(await bodyArea.inputValue(), '', '請求內容應已清空')
            await typeIntoInput(page, urlInp, ECHO_URL)

            //視覺（spec E2E-011 驗證 2）：送出前清空態、紅框標 address bar 與請求內容區
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-011-empty-body.png`, await captureStableWithBox(page, ['.addr-bar', '.body-textarea']))

            //act：送出 → 等 echo 回應（以 echo 固定欄位 "ok": true 作為 round-trip 完成訊號）
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitEchoValue(page, '"ok": true')

            //語意（spec E2E-011 驗證 1）：狀態碼 200；echo 之 body 為空；未被補成 {}
            let post = await page.evaluate(() => document.body.innerText || '')
            assert.ok(post.includes('200'), '回應面板應顯示狀態碼 200')
            let resp = await getRespBodyText(page)
            assert.ok(resp.includes('"body": ""'), `echo 應收到空 body（實得片段「${resp.slice(resp.indexOf('"body"'), resp.indexOf('"body"') + 30)}」）`)
            assert.ok(!resp.includes('"body": {}'), '空白請求內容不得被補成空物件送出')
        })

        //E2E-012：選 method='del' 之種子 API → 測試分頁方法欄顯示 DEL → 改網址為 echo → 送出 → echo 收到 HTTP 標準動詞 DELETE
        //對應 spec 規則摘要「契約」之「方法代號 → HTTP 動詞」（ADR-030）。此為 DEL→DELETE 修法之使用者真實路徑；
        //MSHARE-006 只測轉換函式、PROXY 只測後端收到 DELETE 之行為，皆未走過真瀏覽器之送出鏈。
        it(`E2E-012 [${lang}] 選方法為 DEL 之 API 送出，目標收到 DELETE`, async function() {
            let urlInp = await selectApiAndOpenTest(page, lang, '刪除狗狗資訊')

            //語意（送出前）：方法欄顯示 DEL（顯示層代號不改）
            let addr = await page.locator('.addr-bar').first().innerText()
            assert.ok(addr.includes('DEL'), `方法欄應顯示 DEL（實得「${addr.slice(0, 40)}」）`)

            //act：網址改為 echo
            await typeIntoInput(page, urlInp, ECHO_URL)

            //視覺（spec E2E-012 驗證 2）：送出前態、紅框標 address bar（方法欄 DEL + echo 網址）
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-012-del-method.png`, await captureStableWithBox(page, '.addr-bar'))

            //act：送出 → 等 echo 回顯 method
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitEchoValue(page, '"method": "DELETE"')

            //語意（spec E2E-012 驗證 1）：狀態碼 200；echo 收到之動詞為 DELETE 而非 DEL
            let post = await page.evaluate(() => document.body.innerText || '')
            assert.ok(post.includes('200'), '回應面板應顯示狀態碼 200')
            let resp = await getRespBodyText(page)
            assert.ok(resp.includes('"method": "DELETE"'), 'echo 應收到 HTTP 標準動詞 DELETE')
            assert.ok(!resp.includes('"method": "DEL"'), '不得把非 HTTP 動詞 DEL 送到目標')
        })

        //E2E-013：Query／Headers 各兩列同鍵 → 送出 → echo 回顯 query 為兩值陣列、標頭為合併值（重複鍵不收斂；ADR-031）
        //改造前以物件收斂（query[key]=value），同鍵之後列靜默覆蓋前列：使用者看到兩列卻只送出一列。
        it(`E2E-013 [${lang}] 重複之 Query／Header 鍵皆送達目標`, async function() {
            await gotoApiWorkspace(page, lang)
            await page.getByText(T[lang].test, { exact: true }).first().click({ timeout: 8000 })
            let urlInp = page.getByPlaceholder(T[lang].urlPh)
            await urlInp.waitFor({ state: 'visible', timeout: 8000 })
            let qTable = page.locator('.kv-table').nth(0)
            let hTable = page.locator('.kv-table').nth(1)

            //Query 兩列同鍵 dupq=dv1 / dupq=dv2
            await typeIntoInput(page, qTable.locator('.kv-row').nth(0).locator('.kv-col-key input'), 'dupq')
            await typeIntoInput(page, qTable.locator('.kv-row').nth(0).locator('.kv-col-val input'), 'dv1')
            await page.locator('.btn-addrow').nth(0).click({ timeout: 8000 })
            await typeIntoInput(page, qTable.locator('.kv-row').nth(1).locator('.kv-col-key input'), 'dupq')
            await typeIntoInput(page, qTable.locator('.kv-row').nth(1).locator('.kv-col-val input'), 'dv2')
            //Headers 兩列同鍵 X-Dup: ha / hb
            for (let v of ['ha', 'hb']) {
                await page.locator('.btn-addrow').nth(1).click({ timeout: 8000 })
                await typeIntoInput(page, hTable.locator('.kv-row').last().locator('.kv-col-key input'), 'X-Dup')
                await typeIntoInput(page, hTable.locator('.kv-row').last().locator('.kv-col-val input'), v)
            }
            await typeIntoInput(page, urlInp, ECHO_URL)

            //視覺（spec E2E-013 驗證 2）：送出前編輯態（兩表各含兩列同鍵）、紅框標 Query 與 Headers 兩表
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-013-dup-keys.png`, await captureStableWithBox(page, [qTable, hTable]))

            //act：送出 → 等 echo 回顯
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitEchoValue(page, 'hb')

            //語意（spec E2E-013 驗證 1）：query 重複鍵回顯為兩值陣列（dv1、dv2 皆送達）；標頭重複鍵為 Fetch 標準合併值「ha, hb」
            let resp = await getRespBodyText(page)
            let seg = resp.slice(Math.max(0, resp.indexOf('"dupq"')), resp.indexOf('"dupq"') + 60)
            assert.ok(/"dupq": \[\s*"dv1",\s*"dv2"\s*\]/.test(resp), `echo 應回顯 dupq 為 ["dv1","dv2"]（實得片段「${seg}」）`)
            assert.ok(resp.includes('"x-dup": "ha, hb"'), 'echo 應回顯標頭 x-dup 為合併值「ha, hb」')
        })

        //E2E-014：預設標頭已明給 Content-Type 之 API → 測試分頁 Headers 只有一列 Content-Type（明給值優先、不再補 contentType 列）
        //→ 送出 → echo 收到該值（ADR-031；改造前雙列並存，送出時被收斂／合併，皆非使用者所見）
        it(`E2E-014 [${lang}] 預設標頭明給 Content-Type 時不重複帶入`, async function() {
            let apiName = 'API標頭測試ContentType'
            //funNew 預設 contentType='application/json'；defaultHeadersJson 明給 text/plain → 兩者相衝，明給者勝
            await woItems.apis.insert([ds.apis.funNew({ name: apiName, levels: 'API', method: 'post', url: ECHO_URL, defaultHeadersJson: JSON.stringify({ 'Content-Type': 'text/plain' }) })])

            await selectApiAndOpenTest(page, lang, apiName)

            //語意①：Headers 表恰一列 Content-Type（不分大小寫）、值為明給之 text/plain
            let rows = await readHeaderRows(page)
            let ctRows = rows.filter((r) => r.key.toLowerCase() === 'content-type')
            assert.strictEqual(ctRows.length, 1, `Headers 應只有一列 Content-Type（實得 ${ctRows.length} 列：${JSON.stringify(rows)}）`)
            assert.strictEqual(ctRows[0].value, 'text/plain', '明給之 Content-Type 值應優先')

            //視覺（spec E2E-014 驗證 2）：送出前種子態、紅框標 Headers 表
            await assertOrRegenBaseline(assert, FLOW, `${FLOW}-${lang}-E2E-014-content-type-single.png`, await captureStableWithBox(page, page.locator('.kv-table').nth(1)))

            //act：送出（POST、請求內容空）→ 等 echo 回顯
            await page.getByText(T[lang].send, { exact: true }).first().click({ timeout: 8000 })
            await waitEchoValue(page, '"content-type"')

            //語意②：echo 收到之 content-type 為 text/plain（單一值；非 'text/plain, application/json'）
            let resp = await getRespBodyText(page)
            let seg = resp.slice(Math.max(0, resp.indexOf('"content-type"')), resp.indexOf('"content-type"') + 50)
            assert.ok(resp.includes('"content-type": "text/plain"'), `echo 應收到 content-type 為 text/plain（實得片段「${seg}」）`)
            assert.ok(!resp.includes('application/json'), '不得再帶入 contentType 之預設值')
        })

    }

})
