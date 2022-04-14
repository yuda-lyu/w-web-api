import axios from 'axios'
import map from 'lodash/map'
import ltdtpick from 'wsemi/src/ltdtpick.mjs'


async function provideApis(url, levels, apis) {
    //url: 指API伺服器提供的接入網址, 例如 http://localhost:11005/replaceAPIsByLevels

    //ks
    let ks = [
        'id', //'id-for-apis-pets-guineapigs-1'
        'name', //'取得天竺鼠清單資訊'
        'description', //'取得天竺鼠清單資訊'
        'url', //指api網址, 例如 http://localhost:11005/getDogsList
        'method', //'get'
        'version', //'v1'
        'levels', //'寵物.天竺鼠'
        'keywords', //'pets;guineapigs'
        'state', //'ok'
        'creator', //'pets-system'
        'dataSource', //'pets-data'
        'mdInputParams', //輸入方式說明, markdown格式
        'outputExample', //輸出範例數據, json格式
    ]

    //ltdtpick
    apis = ltdtpick(apis, ks)

    //update levels
    apis = map(apis, (v) => {
        v.levels = levels
        return v
    })

    //rin
    let rin = {
        levels,
        apis,
    }

    //axios
    let rout
    await axios({
        method: 'post',
        url,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        data: rin,
    })
        .then((res) => {
            // console.log(res)
            rout = {
                state: 'success',
                msg: '成功傳輸API清單',
                res,
            }
        })
        .catch((err) => {
            // console.log(err)
            rout = {
                state: 'success',
                msg: '無法傳輸API清單',
                res: err,
            }
        })

    return rout
}


export default provideApis
