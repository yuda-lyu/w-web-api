//畫面含實際埠之比對端覆蓋(規格 E7「比對端覆蓋該處」; 排程第 309 項 wa309; 規則帳本 R-E2E-PORT-01)。
//
//背景: e2e-apitest 之位址列(.addr-url)顯示請求網址, 其埠(後端 11005、echo 11077)進標準圖; 被占用而位移時, 同一處改顯示實際埠(如 11105／11177),
//  差異只有幾個數字(低於 maxDiffPixels, 全綠不能證明畫面不含埠), 且位數相同之數字寬度未必相同, 故不能只靠容差。
//作法: 截圖「當下」於頁內掃描含實際埠之可見輸入框(input／textarea 之 value)與可見文字行(文字節點), 記下矩形(頁面座標, 與全頁截圖同座標系);
//  比對端以標準圖同座標之內容覆蓋這些矩形(標準圖不動、產製端原樣寫出); 被覆蓋之值另由呼叫端以語意斷言驗為實際埠。
//  只在實際埠不同於基準埠(位移)時才量測與覆蓋: 沒有占用時零差異、比對行為與導入前逐位元相同。
//量不到(元素被遮蓋、捲出可視範圍)即不覆蓋(不遮蔽未量到之區域); 但位數相同之埠數字差異常低於比對容差(maxDiffPixels 100), 量不到不一定使比對失敗,
//  故覆蓋之完整性不靠容差證明, 而靠(1)被覆蓋之值另以語意斷言驗為實際值(e2e-apitest 之 expectAddr)、(2)位元組級等價驗證(E2E_PORT_REGIONS_OUT 記錄量測區域, 逐像素重算覆蓋後須與基準埠產出全等)。
import fs from 'fs'
import crypto from 'crypto'
import { overlayRegions } from './e2eLib.mjs'

//頁內掃描(序列化至頁內執行, 不可有閉包變數)。ports: 實際埠(字串或數字)陣列; 比對 ":<埠>" 且其後非數字(11105 不誤中 111055)
function scanInPage(ports) {
    let esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    let src = `:(${ports.map((p) => esc(String(p))).join('|')})(?![0-9])`
    let re = new RegExp(src) //輸入框之值(只需知道有無)
    let reAll = new RegExp(src, 'g') //文字節點(同一節點出現多次者逐一取矩形)
    let sx = window.scrollX
    let sy = window.scrollY
    let out = []
    //矩形中心點須落在視窗內且為該元素(或其後代)所在之最上層, 否則視為不可見(被遮蓋、被捲動容器裁掉)
    let visible = (el, r) => {
        let cx = r.left + r.width / 2
        let cy = r.top + r.height / 2
        if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) {
            return false
        }
        let hit = document.elementFromPoint(cx, cy)
        return !!hit && (hit === el || el.contains(hit))
    }
    for (let el of document.querySelectorAll('input, textarea')) {
        let v = el.value || ''
        if (!re.test(v)) {
            continue
        }
        let r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0 || !visible(el, r)) {
            continue
        }
        out.push({ kind: el.tagName.toLowerCase(), text: v, x: r.left + sx, y: r.top + sy, w: r.width, h: r.height })
    }
    let walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        let par = n.parentElement
        if (!par || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION)$/.test(par.tagName)) {
            continue
        }
        //行尾基準取最近之非行內(block 級)祖先: 父元素為行內元素(如 v-html 高亮之 span)時, 其右緣不是行尾
        let blk = par
        while (blk.parentElement && /^inline/.test(getComputedStyle(blk).display)) {
            blk = blk.parentElement
        }
        let pr = blk.getBoundingClientRect()
        for (let m of n.data.matchAll(reAll)) {
            let range = document.createRange()
            range.setStart(n, m.index)
            range.setEnd(n, m.index + m[0].length)
            for (let r of range.getClientRects()) {
                if (r.width <= 0 || r.height <= 0 || !visible(par, r)) {
                    continue
                }
                //該行自 block 祖先左緣覆蓋至右緣(埠後之文字寬度隨位數浮動, 須涵蓋到行尾)
                out.push({ kind: 'text', text: n.data.slice(0, 80), x: pr.left + sx, y: r.top + sy, w: Math.max(pr.right - pr.left, r.right - pr.left), h: r.height })
            }
        }
    }
    return out
}

//取得頁內含實際埠之可見區域矩形陣列[{kind,text,x,y,w,h}](頁面座標)。ports 為空陣列回 []
async function findPortRegions(page, ports) {
    let list = (ports || []).map((p) => String(p))
    if (list.length === 0) {
        return []
    }
    return await page.evaluate(scanInPage, list)
}

//以標準圖(baselinePath)同座標之內容覆蓋 buf 之 rects(外擴 pad px, 涵蓋文字邊緣之反鋸齒); 無矩形回原 buf
async function overlayPortRegions(buf, baselinePath, rects, pad = 2) {
    if (!rects || rects.length === 0) {
        return buf
    }
    let rs = rects.map((r) => ({ x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad }))
    return await overlayRegions(buf, rs, fs.readFileSync(baselinePath))
}


//診斷／等價驗證用(平時關閉): 環境變數 E2E_PORT_REGIONS_OUT 給定時, 把「截圖 Buffer 之 sha1 → 該圖含實際埠之區域」附加一行 JSON 至該檔。
//  產製端(REGEN)寫出之 PNG 位元組即該 Buffer, 故事後可由檔案 sha1 取回當次量測之區域, 逐像素重算比對端覆蓋(證明覆蓋既完整又未遮蔽其他區域)。未設環境變數時零行為。
function recordPortRegions(buf, regions) {
    let fp = process.env.E2E_PORT_REGIONS_OUT
    if (!fp) {
        return
    }
    fs.appendFileSync(fp, JSON.stringify({ sha1: crypto.createHash('sha1').update(buf).digest('hex'), regions }) + '\n')
}


export { findPortRegions, overlayPortRegions, recordPortRegions, scanInPage }
