import map from 'lodash-es/map.js'
import ds from './src/schema/index.mjs'
import provideTabs from './server/provideTabs.mjs'


async function provide() {

    let url = `http://localhost:11005/syncAndReplaceTabs?token=sys&keyTable=apis`

    let rs = [
        {
            id: 'id-for-test',
            // order: 0,
            name: '取得天竺鼠清單資訊',
            description: '取得天竺鼠清單資訊',
            url: '指api網址, 例如 http://localhost:11005/getDogsList',
            method: 'get',
            version: 'v1',
            // group: '寵物',
            levels: '寵物.天竺鼠',
            keywords: 'pets;guineapigs',
            state: 'ok',
            creator: 'pets-system',
            dataSource: 'pets-data',
            mdInputParams: '輸入方式說明, markdown格式',
            inputExample: '輸入範例數據',
            mdOutputParams: '輸出方式說明, markdown格式',
            outputExample: '輸出範例數據, json格式',
        },
    ]
    rs = map(rs, (v, k) => {
        let vv = ds.apis.funNew(v)
        vv.id = v.id
        return vv
    })
    console.log('rs', rs)

    let keyTable = 'apis'
    let group = '寵物'
    let r = await provideTabs(url, keyTable, group, rs)
    console.log('r', r)

}

provide()
    .catch((err) => {
        console.log('provide catch', err)
    })


//node g.provideApis.mjs
