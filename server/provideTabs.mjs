import get from 'lodash-es/get.js'
import genPm from 'wsemi/src/genPm.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import ltdtpick from 'wsemi/src/ltdtpick.mjs'
import { pickErrName, pickErrCode } from './maskLog.mjs'


//kpKs
let ks_apis = [
    'srcKey', //外部自訂之來源鍵(原則11): 於 group 內唯一且穩定之字串, 例如 'pets-guineapigs-1'; 本系統依此做差異同步(新增/刪除/修改/不變), 內部 id 由本系統產生
    'id', //相容(現行 major): 列未給 srcKey 而給 id 者, 以 id 值為來源鍵並沿用為內部 id, 並記警告; 下一 major 起 srcKey 必填、不再接受以 id 代替
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
    //group: 指陣列數據所屬群組(來源範圍)
    //rows: 陣列數據, 每列須帶 srcKey(group 內唯一且穩定); 只送出 ks_apis 白名單內之欄位(本系統擁有之欄位如 tokens、authType、authConfigJson 不送、伺服器亦不寫)
    //成功時 resolve 伺服器回應之 { nAdd, nUpdate, nDel, nSame }

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
