//前端瀏覽器 console 不印資料值之使用者視角驗收(排程第 206 項〔api 側〕; 規則帳本 R-CONSOLE-NOVAL-01 之前端站點; 靜態不變式見 unit-consoleNoValuesFront)
//E2E-CN-001: 真瀏覽器以系統管理者登入(?token=sys, 開發捷徑)並瀏覽統計資訊與 API 兩個工作區, 收集瀏覽器 console 之全部訊息(含物件引數之內容),
//  斷言: ①登入成功之 console 為摘要 `login success (keys: …)`(只列鍵名); ②全部訊息不含該使用者之資料(email、使用者 id、名稱); ③不含權杖參數。
//  修前: App.vue 印出 cloneDeep(data.user)——email、id、名稱皆在 console。
//純語意斷言(無標準圖; 只收集 console, 不改畫面、不截圖、不寫資料庫)。
//act 走 user-facing input(真點主選單); 起點為帶 token 之網址(與 gotoApiWorkspace 同, 登入由 w-ui-loginout 自動完成)。
//跑法: npx mocha test/e2e-consoleNoValues.test.mjs --reporter list --timeout 300000
import assert from 'assert'
import { startServersOnce, launchBrowser, gotoApiWorkspace, waitUntilExist, baseUrl } from './tools/e2e-setup.mjs'

const A = assert.strict

//該使用者(srv.mjs 之 'sys' 開發捷徑)之資料: 任何一筆出現在 console 即為印出使用者資料
const USER_VALUES = ['admin@example.com', 'id-for-admin', '測試者']

describe('e2e-consoleNoValues (前端 console 不印資料值, 排程第 206 項〔api 側〕)', function() {
    this.timeout(240000)

    before(async function() {
        this.timeout(200000)
        await startServersOnce()
    })

    it('E2E-CN-001 登入並瀏覽統計與 API 工作區後, 瀏覽器 console 只有摘要(鍵名、型別、筆數), 不含使用者資料與權杖', async function() {
        let browser = await launchBrowser()
        try {
            let context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
            let page = await context.newPage()
            //console 收集(含物件引數之內容: msg.text() 對物件只回 JSHandle@object, 須另取 jsonValue)
            let texts = []
            let pending = []
            page.on('console', (msg) => {
                pending.push((async () => {
                    let parts = [msg.text()]
                    for (let a of msg.args()) {
                        try {
                            parts.push(JSON.stringify(await a.jsonValue()))
                        }
                        catch (err) {
                            parts.push('(unserializable)')
                        }
                    }
                    texts.push(parts.join(' | '))
                })())
            })

            //①進站(預設統計資訊頁)並切至 API 工作區(真點主選單; 帶 token 之網址, 登入由 w-ui-loginout 自動完成)
            await gotoApiWorkspace(page, 'eng')
            //②回到統計資訊工作區(主選單另一個鈕; 統計圖 canvas 出現即該頁已載入)
            await page.locator('.w-mm-btn').filter({ hasNotText: 'API' }).first().click()
            await waitUntilExist(page, '統計頁圖表 canvas', () => document.querySelector('canvas') !== null, { timeout: 30000 })
            await page.waitForTimeout(1000)
            await Promise.all(pending)

            //③斷言
            A.ok(texts.length > 0, '應收集到 console 訊息(至少登入流程之 login...／login success)')
            //登入成功之摘要(App.vue loginSuccess): 只列使用者物件之鍵名
            let ls = texts.filter((t) => t.startsWith('login success'))
            A.equal(ls.length, 1, `應恰有 1 則 login success, 實得 ${ls.length}: ${JSON.stringify(texts.slice(0, 5))}`)
            //msg.text() 為 `login success (keys: …)`, 其後接各引數之 jsonValue(此處皆為字串, 不含物件展開之使用者資料)
            A.match(ls[0], /^login success \(keys: id,name,email,isAdmin\) \| "login success" \| "\(keys: id,name,email,isAdmin\)"$/, `login success 應為鍵名摘要, 實得 ${ls[0].slice(0, 200)}`)
            //全部訊息不含使用者資料與權杖
            for (let t of texts) {
                for (let v of USER_VALUES) {
                    A.ok(!t.includes(v), `console 訊息含使用者資料 ${v}: ${t.slice(0, 200)}`)
                }
                A.ok(!/token=/.test(t), `console 訊息含權杖參數: ${t.slice(0, 200)}`)
            }
        }
        finally {
            await browser.close()
        }
    })

    //E2E-CN-002: 失敗路徑——資料通道請求失敗時(以 page.route 中止 /api/main 之全部請求, 使 main.js 之 getWebInfor 失敗), catch 內之 console 只印錯誤類別(`(TypeError)` 等), 不含瀏覽器之錯誤訊息文字;
    //  此案真正執行 describeErr(經 wsemi getDiagBriefErr, 於 webpack 打包後之瀏覽器環境), 證明該模組於瀏覽器可載入、可執行(E2E-CN-001 只走成功路徑, 不呼叫 describeErr)
    it('E2E-CN-002 資料通道請求失敗時, getWebInfor 之 catch 於 console 只印錯誤類別, 不含錯誤訊息文字', async function() {
        let browser = await launchBrowser()
        try {
            let context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
            let page = await context.newPage()
            let texts = []
            let pending = []
            page.on('console', (msg) => {
                pending.push((async () => {
                    let parts = [msg.text()]
                    for (let a of msg.args()) {
                        try {
                            parts.push(JSON.stringify(await a.jsonValue()))
                        }
                        catch (err) {
                            parts.push('(unserializable)')
                        }
                    }
                    texts.push(parts.join(' | '))
                })())
            })
            //只中止 getWebInfor 之請求(連線、同步、輪詢等其餘請求照常; 全部中止則連線閘後之同步不完成, getWebInfor 根本不會被呼叫)——w-converhp 用戶端重試 3 次(退避約 1、2、4 秒)後以錯誤拒絕
            await page.route('**/api/main', async (route) => {
                let buf = route.request().postDataBuffer()
                if (buf && buf.includes('getWebInfor')) {
                    await route.abort('failed')
                    return
                }
                await route.continue()
            })
            await page.goto(`${baseUrl}/?token=sys&lang=eng`, { waitUntil: 'load', timeout: 30000 })

            //等 getWebInfor 之 catch 訊息出現(偵測式等待, 上限 40 秒; 該訊息出現即連線錯誤態之 console 已輸出)
            let hit = null
            let t0 = Date.now()
            while (hit === null && Date.now() - t0 < 40000) {
                await Promise.all(pending)
                hit = texts.find((t) => t.startsWith('getWebInfor failed')) || null
                if (hit === null) {
                    await page.waitForTimeout(300)
                }
            }
            A.ok(hit !== null, `應出現 getWebInfor failed 之 console 訊息(40 秒內), 實得 ${JSON.stringify(texts.slice(0, 6))}`)
            //只印錯誤類別: `getWebInfor failed (TypeError)` 或 `(Error)` 等, 不含瀏覽器之錯誤訊息文字(如 Failed to fetch)與網址
            A.match(hit, /^getWebInfor failed \([A-Za-z]+( [A-Z][A-Z0-9_]+)?\) \| "getWebInfor failed" \| "\([A-Za-z]+( [A-Z][A-Z0-9_]+)?\)"$/, `應只印錯誤類別, 實得 ${hit.slice(0, 200)}`)
            A.ok(!/Failed to fetch|NetworkError|net::|127\.0\.0\.1|token=/i.test(hit), `getWebInfor 之訊息不得含錯誤訊息文字或網址: ${hit.slice(0, 200)}`)
        }
        finally {
            await browser.close()
        }
    })
})
