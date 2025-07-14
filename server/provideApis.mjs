import axios from 'axios'
import get from 'lodash-es/get.js'
import ltdtpick from 'wsemi/src/ltdtpick.mjs'
import genPm from 'wsemi/src/genPm.mjs'


async function provideApis(url, group, apis) {
    //url: 指API伺服器提供的接入網址, 例如 http://localhost:11005/syncAndReplaceApis
    //group: 指API所屬群組

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
    // console.log('apis', apis)

    //rin
    let rin = {
        group,
        apis,
    }
    // console.log('rin', rin)

    //axios
    await axios({
        method: 'post',
        url,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        data: rin,
    })
        .then((res) => {
            // console.log('then', res)
            let data = get(res, 'data')
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


export default provideApis
