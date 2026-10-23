/**
 * 解析 WWebApi 之 opt.lockExternalRows（後台是否不得動外部列與外部管理之 group，原則 5，ADR-044）: 僅 'n' 或 false 關閉，其餘（含未給、'y'、true、'N'、0、null、''、其他字串）一律開啟——預設拒絕（原則 1）
 *
 * @param {*} v 輸入 opt.lockExternalRows 之值
 * @returns {Boolean} 回傳是否啟用外部列保護
 * @example
 *
 * getLockExternalRows('n')
 * // => false
 * getLockExternalRows(undefined)
 * // => true
 *
 */
function getLockExternalRows(v) {
    return !(v === 'n' || v === false)
}


export default getLockExternalRows
