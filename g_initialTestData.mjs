import ds from './src/schema/index.mjs'
import { woItems } from './g_mOrm.mjs'
import genTestData from 'w-serv-orm/src/genTestData.mjs'


async function initialTestData() {

    //genTestData
    await genTestData(ds, woItems)

    console.log('finish.')
}

initialTestData()
    .catch((err) => {
        console.log('initialTestData catch', err)
        process.exitCode = 1 //失敗以非零離開碼結束, 供呼叫端判斷(F9, ADR-038)
    })


//刪除舊檔與重建測試資料庫
//node g_initialTestData.mjs
