import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs'
import ds from '../src/schema/index.mjs'
import getSettings from './getSettings.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'


//getSettings
let st = getSettings()

//WServOrm
let opt = {
    url: `mongodb://${st.dbUsername}:${st.dbPassword}@${st.dbIP}:${st.dbPort}`,
    db: st.dbName,
    getUserById: null,
    bCheckUser: false,
    bExcludeWhenNotAdmin: false,
}
let r = WServOrm(ds, WOrm, opt)
let { woItems, procOrm } = r


export { woItems, procOrm }
