import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from './src/schema/index.mjs'
import getSettings from './g_getSettings.mjs'


//getSettings
let st = getSettings()

//url, db
let url = st.dbUrl
let db = st.dbName

//WServOrm(w-serv-orm 1.1.10 之 opt 無設定鍵, 不給; 原給之三鍵已移除, ADR-038)
let r = WServOrm(ds, WOrm, url, db)
let { woItems, procOrm } = r


export { woItems, procOrm }
