// import path from 'path'
// import fs from 'fs'
// import _ from 'lodash'
import w from 'wsemi'
import ds from './src/schema/index.mjs'
import { woItems } from './g.mOrm.mjs'


async function initialTestData() {

    //delFiles
    // delFiles('./histData')
    // delFiles('./uploadFiles')

    //funTest
    await w.pmSeries(ds, async (v, k) => {

        //funTestAndSave
        let rs = await v.funTestAndSave(woItems)
        console.log(`${k}.funTestAndSave`, rs)

        // //funTest
        // let rs = await v.funTest(woItems)

        // //save
        // await woItems[k].save(rs)
        // console.log(`${k}.funTest and save`, rs)

    })

}

initialTestData()
    .catch((err) => {
        console.log('initialTestData catch', err)
    })


//刪除舊檔與重建測試資料庫
//node --experimental-modules --es-module-specifier-resolution=node g.mInitialTestData.mjs
