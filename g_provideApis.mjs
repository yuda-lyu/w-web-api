import provideTabs from './server/provideTabs.mjs'


async function provide() {

    let keyTable = 'apis'

    let group = '寵物'

    let url = `http://localhost:11005/syncAndReplaceTabs?keyTable=${keyTable}&token=sys`

    let rs = [
        {
            srcKey: 'pets-guineapigs-1', //外部自訂之來源鍵: 於 group 內唯一且穩定(原則11); 內部 id 由本系統產生, 外部不指定
            // order: 0,
            name: '取得天竺鼠清單資訊',
            description: '取得天竺鼠清單資訊',
            url: '指api網址, 例如 http://localhost:11005/getDogsList',
            method: 'get',
            version: 'v1',
            group,
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
    console.log('rows', rs.length) //只印筆數, 不印請求本體(列內容含外部系統之描述與範例數據)

    //provideTabs 只送出白名單內之描述欄位; 本系統擁有之欄位(tokens、authType、authConfigJson 等)由本站編輯表單管理, 不送、伺服器亦不寫
    let r = await provideTabs(url, keyTable, group, rs)
    console.log('r', r) //{ nAdd, nUpdate, nDel, nSame }; 同一批重送時 nSame 為全數、零寫入

}

provide()
    .catch((err) => {
        console.log('provide catch', err)
    })


//node g_provideApis.mjs
