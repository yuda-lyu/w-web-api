import iseobj from 'wsemi/src/iseobj.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import { fieldsPublic } from '../src/schema/contracts/apis.mjs'


//pickPublicRow：apis 列 → 公開欄位列。只輸出 fieldsPublic（白名單單一來源，見 src/schema/contracts/apis.mjs）所列之鍵，其餘鍵（tokens、authConfigJson 等憑證與本系統擁有、伺服器專有欄位）一律不輸出；
//列缺該欄（舊資料）給空字串，使輸出形狀固定。只讀列自身屬性（不讀原型鏈）。
function pickPublicRow(row) {
    let o = {}
    for (let k of fieldsPublic) {
        o[k] = Object.prototype.hasOwnProperty.call(row, k) ? row[k] : ''
    }
    return o
}


//pickPublicRows：apis 列陣列 → 啟用中（列自身有 isActive 且嚴格等於 'y'；缺欄、原型鏈上之值或其他值視為停用，預設拒絕）之列的公開欄位列，保持原順序。非陣列回空陣列。
//（R-PUBLICAPIS-01；呼叫端 procApis 另以查詢條件 isActive 先篩一次，此處為不依賴後端查詢語意之保證）
function pickPublicRows(rows) {
    if (!isarr(rows)) {
        return []
    }
    let rs = []
    for (let row of rows) {
        if (iseobj(row) && Object.prototype.hasOwnProperty.call(row, 'isActive') && row.isActive === 'y') {
            rs.push(pickPublicRow(row))
        }
    }
    return rs
}


export { pickPublicRow, pickPublicRows }
export default pickPublicRows
