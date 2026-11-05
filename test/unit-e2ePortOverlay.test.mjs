//測試畫面含實際埠之比對端覆蓋(規則帳本 R-E2E-PORT-01 規則 7; 規格 E7; 排程第 309 項 wa309)
//
//受測: test/tools/e2ePortOverlay.mjs(findPortRegions 頁內掃描、overlayPortRegions 以標準圖同座標內容覆蓋)。
//契約:
//  1. findPortRegions 只回「含實際埠(:<埠> 且其後非數字)之可見輸入框與可見文字行」: 不含種子資料(基準埠 11005)、不含埠為更長數字之字串、不含不可見(display:none、捲動容器裁掉)者。
//  2. 文字行之矩形自父元素左緣涵蓋到右緣(埠後之文字寬度隨位數浮動, 須涵蓋到行尾)。
//  3. 覆蓋後之當次截圖與「同版面但埠不同之標準圖」逐像素(RGBA)全等; 不覆蓋時兩者確實不同(測試有鑑別力)。
//  4. 沒有矩形或沒有埠時原樣回傳(零行為差異, 對應「沒有占用時比對不變」)。
//fixture 中「更長數字」之文字(:111770)兩次渲染皆固定(不隨埠變), 其值本身不被覆蓋, 故覆蓋後仍須與標準圖逐像素全等。
//真實瀏覽器(chromium headless, 固定版面之 DOM fixture, 不起任何伺服器、不占埠)。
//跑法: node C:/opensrcOper/tools/quiet-run.mjs --name e2ePortOverlay --lock -- npx mocha test/unit-e2ePortOverlay.test.mjs --timeout 120000
import fs from 'fs'
import path from 'path'
import assert from 'assert'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { launchBrowser } from './tools/e2eLib.mjs'
import { findPortRegions, overlayPortRegions } from './tools/e2ePortOverlay.mjs'

const A = assert.strict
const fdTest = path.dirname(fileURLToPath(import.meta.url))
const fdTmp = path.join(fdTest, '_tmp', 'e2ePortOverlay') //測試中介資料(測完即刪)

//固定版面之 fixture: 等寬字型使不同埠之寬度相同, 差異只在數字字形; 含應被覆蓋者(input、pre 之 host 行)與不應被覆蓋者(種子資料、更長數字、被裁掉、display:none)
let html = (port) => `<!doctype html><html><body style="margin:0;font:14px monospace;background:#fff">
<div style="padding:20px"><input id="addr" style="width:400px;height:28px" value="http://127.0.0.1:${port}/echo"></div>
<pre id="pre" style="margin:0 20px;width:500px;background:#eef">  "accept": "*/*",
  "host": "127.0.0.1:${port}",
  "x": "plain"</pre>
<div style="padding:20px"><input id="seed" style="width:400px;height:28px" value="http://localhost:11005/getAPIsList"></div>
<div id="clipBox" style="margin:0 20px;height:40px;width:300px;overflow:hidden"><div style="height:120px"></div><input id="clipped" value="http://127.0.0.1:${port}/clipped"></div>
<input id="hid" style="display:none" value="http://127.0.0.1:${port}/hidden">
<div id="long" style="padding:20px">http://127.0.0.1:111770/not-the-port</div>
</body></html>`

describe('unit-e2ePortOverlay (畫面含實際埠之比對端覆蓋, R-E2E-PORT-01 規則 7)', function() {
    this.timeout(120000)

    let browser = null
    let shot = async (port) => {
        let page = await browser.newPage({ viewport: { width: 640, height: 480 } })
        try {
            await page.setContent(html(port))
            let regions = await findPortRegions(page, [port])
            let buf = await page.screenshot({ fullPage: true })
            return { regions, buf }
        }
        finally {
            await page.close()
        }
    }
    //統一轉成 RGBA 再比(覆蓋輸出為含 alpha 通道之 PNG, 瀏覽器截圖為 RGB; 比較像素值不比通道數)
    let raw = async (buf) => await sharp(buf).ensureAlpha().raw().toBuffer()

    before(async function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdTmp, { recursive: true })
        browser = await launchBrowser()
    })

    after(async function() {
        if (browser) {
            await browser.close()
        }
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    it('OV-001 只回含實際埠之可見輸入框與文字行: 不含種子資料(基準埠)、更長數字、被裁掉、display:none', async function() {
        let { regions } = await shot(11177)
        let kinds = regions.map((r) => r.kind).sort()
        A.deepEqual(kinds, ['input', 'text'], `應只有位址輸入框與 host 文字行各一, 實得 ${JSON.stringify(regions.map((r) => ({ kind: r.kind, text: r.text })))}`)
        let inp = regions.find((r) => r.kind === 'input')
        A.equal(inp.text, 'http://127.0.0.1:11177/echo')
        A.ok(inp.w > 300 && inp.h > 15, `輸入框矩形應為其實際尺寸(約 400×28), 實得 ${inp.w}×${inp.h}`)
        let txt = regions.find((r) => r.kind === 'text')
        A.ok(txt.text.includes('"host": "127.0.0.1:11177"'), `文字行應為含 host 埠之 pre 文字節點, 實得「${txt.text}」`)
    })

    it('OV-002 以種子資料之基準埠(11005)當「實際埠」時只命中種子輸入框(證明比對的是傳入之埠, 不是寫死)', async function() {
        let page = await browser.newPage({ viewport: { width: 640, height: 480 } })
        try {
            await page.setContent(html(11177))
            let regions = await findPortRegions(page, [11005])
            A.deepEqual(regions.map((r) => r.text), ['http://localhost:11005/getAPIsList'])
            A.deepEqual(await findPortRegions(page, []), [], 'ports 為空陣列回 []')
            A.deepEqual(await findPortRegions(page, [11178]), [], '無人使用之埠回 []')
        }
        finally {
            await page.close()
        }
    })

    it('OV-003 文字行矩形自父元素左緣涵蓋到右緣(埠後文字寬度隨位數浮動, 須涵蓋到行尾)', async function() {
        let page = await browser.newPage({ viewport: { width: 640, height: 480 } })
        try {
            await page.setContent(html(11177))
            let regions = await findPortRegions(page, [11177])
            let txt = regions.find((r) => r.kind === 'text')
            let pre = await page.evaluate(() => {
                let r = document.getElementById('pre').getBoundingClientRect()
                return { left: r.left, right: r.right }
            })
            A.ok(Math.abs(txt.x - pre.left) <= 1, `起點應為父元素左緣 ${pre.left}, 實得 ${txt.x}`)
            A.ok(Math.abs(txt.x + txt.w - pre.right) <= 1, `終點應為父元素右緣 ${pre.right}, 實得 ${txt.x + txt.w}`)
        }
        finally {
            await page.close()
        }
    })

    it('OV-007 同一文字節點出現兩次埠皆取得; 父元素為行內元素(如 v-html 高亮之 span)時行尾基準取 block 祖先', async function() {
        let page = await browser.newPage({ viewport: { width: 640, height: 480 } })
        try {
            await page.setContent('<!doctype html><html><body style="margin:0;font:14px monospace"><pre id="p2" style="margin:0 20px;width:500px"><span id="sp">  "a": "127.0.0.1:11177", "b": "127.0.0.1:11177"</span></pre></body></html>')
            let regions = await findPortRegions(page, [11177])
            A.equal(regions.length, 2, `同一文字節點內兩處皆須取得, 實得 ${regions.length}`)
            let pre = await page.evaluate(() => {
                let r = document.getElementById('p2').getBoundingClientRect()
                return { left: r.left, right: r.right }
            })
            for (let r of regions) {
                A.equal(r.kind, 'text')
                A.ok(Math.abs(r.x - pre.left) <= 1, `起點應為 block 祖先(pre)左緣 ${pre.left}, 實得 ${r.x}`)
                A.ok(Math.abs(r.x + r.w - pre.right) <= 1, `終點應為 block 祖先(pre)右緣 ${pre.right}(非行內 span 之右緣), 實得 ${r.x + r.w}`)
            }
        }
        finally {
            await page.close()
        }
    })

    it('OV-004 覆蓋後之當次截圖與「同版面但埠不同之標準圖」逐像素全等; 不覆蓋時確實不同', async function() {
        let cur = await shot(11177) //位移後之當次截圖
        let base = await shot(11077) //基準埠之標準圖(同版面)
        let fpBase = path.join(fdTmp, 'baseline.png')
        fs.writeFileSync(fpBase, base.buf)
        A.ok(!(await raw(cur.buf)).equals(await raw(base.buf)), '前提: 不覆蓋時兩張因埠數字不同而不全等(否則本測試無鑑別力)')
        let out = await overlayPortRegions(cur.buf, fpBase, cur.regions)
        A.ok((await raw(out)).equals(await raw(base.buf)), '覆蓋後應與標準圖逐像素全等(RGBA)')
    })

    it('OV-005 沒有矩形時原樣回傳同一個 Buffer(沒有占用之情形零行為差異)', async function() {
        let cur = await shot(11177)
        let fpBase = path.join(fdTmp, 'baseline2.png')
        fs.writeFileSync(fpBase, cur.buf)
        A.equal(await overlayPortRegions(cur.buf, fpBase, []), cur.buf)
        A.equal(await overlayPortRegions(cur.buf, fpBase, null), cur.buf)
        A.equal(await overlayPortRegions(cur.buf, fpBase, undefined), cur.buf)
    })

    it('OV-006 覆蓋區之外仍逐像素比對: 覆蓋區外之差異不會被遮蔽', async function() {
        let cur = await shot(11177)
        let base = await shot(11077)
        //在覆蓋區外(畫面最下方之空白區)塗一塊紅色, 模擬覆蓋區外之真差異
        let tampered = await sharp(cur.buf).composite([{ input: await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), left: 560, top: 440 }]).png().toBuffer()
        let fpBase = path.join(fdTmp, 'baseline3.png')
        fs.writeFileSync(fpBase, base.buf)
        let out = await overlayPortRegions(tampered, fpBase, cur.regions)
        A.ok(!(await raw(out)).equals(await raw(base.buf)), '覆蓋區外之差異須仍存在(覆蓋不得吞掉整張圖)')
    })
})
