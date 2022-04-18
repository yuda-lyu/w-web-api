import axios from 'axios'
import ltdtpick from 'wsemi/src/ltdtpick.mjs'
import genPm from 'wsemi/src/genPm.mjs'


async function provideApis(url, group, apis) {
    //url: 指API伺服器提供的接入網址, 例如 http://localhost:11005/replaceAPIsByLevels
    //group: 指API所屬群組, 主要呼叫replaceAPIsByLevels為主

    //pm
    let pm = genPm()

    //ks
    let ks = [
        'id', //'id-for-apis-pets-guineapigs-1'
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

    //ltdtpick
    apis = ltdtpick(apis, ks)

    //rin
    let rin = {
        group,
        apis,
    }
    // rin = JSON.stringify(rin)

    //axios
    await axios({
        method: 'post',
        url,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        data: rin,
    })
        .then((res) => {
            // console.log(res)
            let r = {
                msg: '成功傳輸API清單',
                res,
            }
            pm.resolve(r)
        })
        .catch((err) => {
            // console.log(err)
            let r = {
                msg: '無法傳輸API清單',
                res: err,
            }
            pm.reject(r)
        })

    return pm
}


export default provideApis
