import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs' //自行選擇引用ORM, 使用Mongodb測試
import WWebApi from './server/WWebApi.mjs'
import getSettings from './g.getSettings.mjs'


//st
let st = getSettings()

let url = `mongodb://${st.dbUsername}:${st.dbPassword}@${st.dbIP}:${st.dbPort}` //使用Mongodb測試
let db = st.dbName
let opt = {

    getUserById: null,
    bCheckUser: false,
    bExcludeWhenNotAdmin: false,

    serverPort: 11005,

    webName: {
        'eng': 'API Service',
        'cht': 'API管理系統'
    },

}

//WWebApi
WWebApi(WOrm, url, db, opt)
    .catch((err) => {
        console.log(err)
    })


//node --experimental-modules --es-module-specifier-resolution=node srv.mjs
