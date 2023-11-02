import ds from './src/schema/index.mjs'
import { woItems } from './g.mOrm.mjs'
import genTestData from 'w-serv-orm/src/genTestData.mjs'


async function initialTestData() {

    //genTestData
    await genTestData(ds, woItems)

}

initialTestData()
    .catch((err) => {
        console.log('initialTestData catch', err)
    })


//刪除舊檔與重建測試資料庫
//node --experimental-modules --es-module-specifier-resolution=node g.initialTestData.mjs
