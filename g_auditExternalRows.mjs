import { woItems } from './g_mOrm.mjs'
import { summarizeExternal } from './src/schema/contracts/externalRows.mjs'


//升版稽核（唯讀，不寫入任何資料）: 外部列受保護（opt.lockExternalRows 預設 'y'）起，apis 表中 srcKey 為非空字串之列視為外部列而於後台唯讀、不可刪除，
//其所在 group 為外部管理之 group（後台不可在其中新增列或把列改入）。本腳本列出升版後會被鎖定之外部列數、各外部管理 group，以及該 group 內 srcKey 為空之「混雜列」
//（升版前即已存在之後台自建列；不鎖、不自動刪除，但下次對該 group 匯入時，批次未以其 id 列入者會被刪除，見 README Upgrade Notes）。
//須在服務停止時執行（離線工具直接開啟資料庫，與 g_initialTestData.mjs 相同）。
//node g_auditExternalRows.mjs
async function auditExternalRows() {

    let rows = await woItems.apis.select()
    let r = summarizeExternal(rows)

    console.log(`apis 共 ${rows.length} 列; 外部列(srcKey 非空) ${r.nExternal} 列; 外部管理之 group ${r.groups.length} 個`)
    for (let g of r.groups) {
        console.log(`  group[${g.group}]: 外部列 ${g.nExternal}, 混雜列 ${g.nMixed}`)
    }
    if (r.mixed.length > 0) {
        console.log(`混雜列(外部管理 group 內 srcKey 為空) ${r.mixed.length} 列: 下次對該 group 匯入時, 批次未以其 id 列入者會被刪除`)
        for (let m of r.mixed) {
            console.log(`  id[${m.id}] name[${m.name}] group[${m.group}]`)
        }
    }
    if (r.badGroup.length > 0) {
        console.log(`group 非字串(陣列、數字、物件等)之歷史列 ${r.badGroup.length} 列: 不在外部 group 之判定內, 且資料庫之查詢可能把陣列元素當命中而使其被匯入刪除; 請人工處置(不自動刪除)`)
        for (let b of r.badGroup) {
            console.log(`  id[${b.id}] name[${b.name}] type[${b.type}]`)
        }
    }
    console.log('finish.')
}

auditExternalRows()
    .catch((err) => {
        console.log('auditExternalRows catch', err)
        process.exitCode = 1
    })


//升版前盤點外部列與混雜列(唯讀)
//node g_auditExternalRows.mjs
