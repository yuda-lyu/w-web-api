import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs'
import getSettings from './server/getSettings.mjs'
import WWebApi from './server/WWebApi.mjs'


//st
let st = getSettings()

let url = `mongodb://${st.dbUsername}:${st.dbPassword}@${st.dbIP}:${st.dbPort}`
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
WWebApi(url, db, WOrm, opt)
    .catch((err) => {
        console.log(err)
    })


//node --experimental-modules --es-module-specifier-resolution=node srv.mjs