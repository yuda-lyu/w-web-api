import get from 'lodash-es/get.js'
import genPm from 'wsemi/src/genPm.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import ltdtpick from 'wsemi/src/ltdtpick.mjs'
import { pickErrName, pickErrCode } from './maskLog.mjs'


//kpKs
let ks_apis = [
    'id', //'id-for-apis-pets-guineapigs-1'
    'order', //0
    'name', //'取得天竺鼠清單資訊'
    'description', //'取得天竺鼠清單資訊'
    'url', //指api網址, 例如 http://localhost:11005/getDogsList
    'method', //'get'
    'version', //'v1'
    'group', //'寵物'
    'levels', //'寵物.天竺鼠'
    'keywords', //'pets;guineapigs'
    'state', //'ok'
    'creator', //'pets-system'
    'dataSource', //'pets-data'
    'mdInputParams', //輸入方式說明, markdown格式
    'inputExample', //輸入範例數據
    'mdOutputParams', //輸出方式說明, markdown格式
    'outputExample', //輸出範例數據, json格式
]
let kpKs = {
    ks_apis,
}


async function provideTabs(url, keyTable, group, rows) {
    //url: 伺服器提供的接入網址, 例如 http://localhost:11005/syncAndReplaceTabs?token={token}&keyTable={keyTable}
    //keyTable: 資料表名
    //group: 指陣列數據所屬群組
    //rows: 陣列數據

    //pm
    let pm = genPm()

    //ks
    if (!haskey(kpKs, `ks_${keyTable}`)) {
        return Promise.reject(`invalid keyTable[${keyTable}]`)
    }
    let ks = kpKs[`ks_${keyTable}`]
    // console.log('ks', ks)

    //ltdtpick
    rows = ltdtpick(rows, ks)
    // console.log('rows', rows)

    //rin
    let rin = {
        group,
        rows,
    }
    // console.log('rin', rin)

    //fetch（Node 內建；改造前為 axios，非 2xx 由 axios 拋錯落 catch → 此處以 res.ok 判定維持同一語意）
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(rin),
    })
        .catch((err) => {
            //fetch 例外（連線拒絕／DNS／網址無法解析或含 userinfo）：其 message 可能含完整網址（網址內有 token），故改以只含
            //err.name 與 cause.code（名稱／代碼形狀才記）之新 Error 上拋，不帶原 message 亦不掛 cause（ADR-033）；非 2xx 維持下方既有訊息
            let code = pickErrCode(err)
            return Promise.reject(new Error(`Request failed: ${pickErrName(err) || 'Error'}${code ? ` ${code}` : ''}`))
        })
        .then(async (res) => {
            // console.log('then', res)
            if (!res.ok) {
                return Promise.reject(new Error(`Request failed with status code ${res.status}`)) //同 axios 之訊息格式與 Error 型別
            }
            let data = await res.json()
            let state = get(data, 'state')
            let msg = get(data, 'msg', '')
            if (state === 'success') {
                pm.resolve(msg)
            }
            else {
                pm.reject(msg)
            }

        })
        .catch((err) => {
            // console.log('catch', err)
            pm.reject(err)
        })

    return pm
}


export default provideTabs
