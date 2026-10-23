//e2e 編輯類流程之共用 helper（e2e-concurrent 使用）：編輯表單欄位定位、成功 modal 等待與關閉、他人（第二位使用者）寫入。
//與 e2e-edit.test.mjs 內同名 helper 同一實作（該檔未遷移——本輪不動既有 e2e 檔以免擴大範圍；日後 e2e-edit 可改 import 本檔收斂）。
//位置 test/tools/（不帶 .test. 中綴，免被 runner 抓成測試檔）。
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'
import { woItems, baseUrl, waitUntilExist } from './e2e-setup.mjs'
import { itemsUnionBox } from './e2eLib.mjs'
import { callFun } from './apiMain.mjs'


//T: 雙語畫面文字（逐字取自 server/procLang.mjs；有 hint 說明文字者以 label 元素收窄定位）
let T = {
    eng: {
        ok: 'OK',
        edit: 'Edit',
        saved: 'Saved',
        lblName: 'Name',
        lblDescription: 'Description',
        searchPh: 'Search API...',
        reload: 'Reload',
        staleChanged: 'updated by someone else',
        staleDeleted: 'deleted by someone else',
        saveStale: 'updated by someone else, so your changes were not saved',
        notFound: 'no longer exists',
        baselineBroken: 'cannot be used as a save baseline',
        newApi: 'New API',
        yes: 'Yes',
        deleted: 'Deleted',
        lblUrl: 'API url',
        lblLevels: 'Levels',
    },
    cht: {
        ok: '確認',
        edit: '編輯',
        saved: '已儲存',
        lblName: '名稱',
        lblDescription: '說明',
        searchPh: '搜尋API...',
        reload: '重新載入',
        staleChanged: '已被他人更新',
        staleDeleted: '已被他人刪除',
        saveStale: '資料已被他人更新，您的變更未儲存',
        notFound: '已不存在',
        baselineBroken: '無法建立存檔基準',
        newApi: '新增API',
        yes: '確定',
        deleted: '已刪除',
        lblUrl: 'API網址',
        lblLevels: '所屬階層',
    },
}


//依「label 元素」定位編輯表單某欄位列／其 input／textarea（不可用 .bk-row 的 hasText：hint 文字可能含其他 label 字串）
function fieldRow(page, label) {
    return page.locator('.bk-row').filter({ has: page.locator('.bk-col-label', { hasText: label }) })
}
function fieldInput(page, label) {
    return fieldRow(page, label).locator('input.bk-input')
}
function fieldTextarea(page, label) {
    return fieldRow(page, label).locator('textarea.bk-textarea')
}
//欄位列之紅框目標：.bk-row 無可見邊界且標籤貼齊其左緣 → 經 itemsUnionBox fit 量內容（輸入框 ∪ 標籤墨跡外擴）
function fieldRowBox(row) {
    return itemsUnionBox(row.first(), { fit: true })
}

//左樹搜尋框
function searchInput(page, lang) {
    return page.locator(`input[placeholder="${T[lang].searchPh}"]`).first()
}

//草稿保護提示（編輯中收到他人更新／刪除之推播，或存檔被拒）
function staleBanner(page) {
    return page.locator('.bk-stale')
}
async function waitStaleBanner(page, text) {
    await waitUntilExist(page, 'stale banner', (s) => {
        let el = document.querySelector('.bk-stale')
        return !!el && (el.innerText || '').includes(s)
    }, { timeout: 15000, arg: text })
    await page.waitForTimeout(300)
}

async function waitSaveModal(page, lang) {
    await waitUntilExist(page, 'save success modal', (s) => (document.body.innerText || '').includes(s), { timeout: 10000, arg: T[lang].saved })
    await page.waitForTimeout(300)
}
async function clickModalOk(page, lang, textShown) {
    await page.getByText(T[lang].ok, { exact: true }).first().click({ timeout: 8000 })
    await waitUntilExist(page, 'modal closed', (s) => !(document.body.innerText || '').includes(s), { timeout: 8000, arg: textShown })
}


//---- 第二位使用者（他人）之寫入：經與瀏覽器同一條資料通道呼叫 kpFunExt（後端因此推播至所有已開啟之頁面）----
async function dbRow(name) {
    let all = await woItems.apis.select()
    return all.find((r) => r.name === name) || null
}
//otherSave: 他人修改某列（不帶基準＝看著最新資料改）
async function otherSave(name, patch) {
    let row = await dbRow(name)
    if (!row) {
        throw new Error(`otherSave: DB 無「${name}」`)
    }
    let r = await callFun(baseUrl, 'sys', 'saveApi', [{ ...row, ...patch }])
    if (!r.ok) {
        throw new Error(`otherSave 失敗: ${JSON.stringify(r.msg)}`)
    }
    return row
}
//otherDelete: 他人刪除某列
async function otherDelete(name) {
    let row = await dbRow(name)
    if (!row) {
        throw new Error(`otherDelete: DB 無「${name}」`)
    }
    let r = await callFun(baseUrl, 'sys', 'deleteApi', [row.id])
    if (!r.ok) {
        throw new Error(`otherDelete 失敗: ${JSON.stringify(r.msg)}`)
    }
    return row
}


//otherImport: 外部應用（token=sys）以 POST /syncAndReplaceTabs 匯入（rows 可用 id 代替 srcKey 以還原已刪之列）；後端因此推播至已開啟之頁面
async function otherImport(group, rows) {
    let res = await fetch(`${baseUrl}/syncAndReplaceTabs?token=sys&keyTable=apis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group, rows }) })
    let j = await res.json()
    if (j.state !== 'success') {
        throw new Error(`otherImport 失敗: ${JSON.stringify(j.msg)}`)
    }
    return j.msg
}


//installRpcCapture: 擷取瀏覽器送出之 saveApi RPC 本體（經實際傳輸路徑之基準，只觀察不改變請求），回傳 readSent()（解碼後之 saveApi 請求陣列）
//w-converhp 客戶端以 axios（XHR）送出 Blob 本體，CDP 不提供 Blob 本體（postDataBuffer 為 null），故於頁內包裝 XMLHttpRequest.send 逐位元組複製至 window.__rpcSent，再於測試端以 wsemi u8arr2obj 解碼；觀察用，不屬 act
async function installRpcCapture(page) {
    await page.evaluate(() => {
        window.__rpcSent = []
        let orig = XMLHttpRequest.prototype.send
        XMLHttpRequest.prototype.send = function(body) {
            try {
                if (body instanceof Blob) {
                    body.arrayBuffer().then((ab) => window.__rpcSent.push(Array.from(new Uint8Array(ab))))
                }
                else if (body instanceof ArrayBuffer) {
                    window.__rpcSent.push(Array.from(new Uint8Array(body)))
                }
                else if (ArrayBuffer.isView(body)) {
                    window.__rpcSent.push(Array.from(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)))
                }
            }
            catch (err) {
                console.log('rpc capture', err)
            }
            return orig.apply(this, arguments)
        }
    })
    return async () => {
        let raws = await page.evaluate(() => window.__rpcSent)
        let rs = []
        for (let arr of raws) {
            try {
                let o = u8arr2obj(new Uint8Array(arr))
                if (o && typeof o === 'object' && o.func === 'saveApi') {
                    rs.push(o)
                }
            }
            catch (err) {
                console.log('decode rpc body', err && err.message)
            }
        }
        return rs
    }
}


//installPushHold: 延遲「伺服端推播」抵達畫面之接縫(使「存檔成功 → 推播未到 → 立即再編輯再存」必然發生, api-run03; 規格 §8 存檔成功後之新基準須立即取得):
//  於頁內攔下 store.commit('UpdateTableData') 中 apis 表之整表覆寫(推播／輪詢抵達 store 之唯一入口, main.js recvData), 暫存不套用; 其餘 commit(含存檔成功後之 ApplySavedRow)照常。
//  這是對「推播延遲」之模擬(等同網路慢), 不是使用者動作之替代: act 仍走真實點擊與鍵盤; 只觀察不改變請求。須在 store 已同步(gotoApiWorkspace 之後)安裝。
//  回傳: held() 目前暫存之推播數; lastHeldRows() 最後一筆暫存之整表列;
//  release({ index }) 取消攔截並放行第 index 筆暫存之推播(預設最後一筆＝最新者); 取消攔截後其後之推播照常套用。
//  放行較舊之一筆（index 0）即模擬「在我寫入之前由伺服端讀取、卻在我的回應之後才抵達」之舊快照(E2E-023)。放行為同步 commit,
//  回傳 { held, names }: names 為放行當下 store 中 apis 表各列之名稱(與 commit 同一次頁內執行; 放行後真實推播會陸續抵達而把 store 蓋回, 故斷言必須用此原子結果, 不可事後再讀)。
async function installPushHold(page) {
    await page.evaluate(() => {
        //#app 已被 App 根元素取代(無 id), 改自任一已掛載元素之 Vue 實例取 $store(Vue.prototype.$store, 與 main.js recvData 所用同一個)
        let el = [...document.querySelectorAll('*')].find((v) => v.__vue__ && v.__vue__.$store)
        let store = el.__vue__.$store
        let hold = { on: true, queue: [], orig: store.commit, store }
        window.__pushHold = hold
        store.commit = function(type, payload, opts) {
            if (hold.on && type === 'UpdateTableData' && payload && payload.tableName === 'apis') {
                hold.queue.push(payload) //原物件(不複製, 放行時與原推播同形)
                return undefined
            }
            return hold.orig.call(store, type, payload, opts)
        }
    })
    return {
        held: async () => await page.evaluate(() => window.__pushHold.queue.length),
        //被攔下之各筆推播中指定列(id)之名稱與 timeUpdate(診斷用)
        heldRowOf: async (id) => await page.evaluate((i) => window.__pushHold.queue.map((q) => {
            let r = Array.isArray(q.data) ? q.data.find((v) => v.id === i) : null
            return r ? { name: r.name, timeUpdate: r.timeUpdate } : null
        }), id),
        lastHeldRows: async () => await page.evaluate(() => {
            let q = window.__pushHold.queue
            return q.length > 0 ? q[q.length - 1].data : null
        }),
        release: async (opt = {}) => {
            return await page.evaluate((index) => {
                let hold = window.__pushHold
                let store = hold.store
                hold.on = false
                store.commit = hold.orig
                let q = hold.queue
                let i = index === undefined ? q.length - 1 : index
                if (i >= 0 && i < q.length) {
                    store.commit('UpdateTableData', q[i])
                }
                //names: 放行(同步 commit)當下 store 中各列之名稱——與 commit 在同一次頁內執行, 其間不可能插入其他推播, 不受畫面重繪與後續推播時序影響
                return { held: q.length, names: Array.isArray(store.state.apis) ? store.state.apis.map((r) => r.name) : null }
            }, opt.index)
        },
    }
}


export { T, fieldRow, fieldInput, fieldTextarea, fieldRowBox, searchInput, staleBanner, waitStaleBanner, waitSaveModal, clickModalOk, dbRow, otherSave, otherDelete, otherImport, installRpcCapture, installPushHold }
