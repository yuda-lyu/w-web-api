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
//opt.funLog 亦刻意不給(R-ORMDIAG-01, ADR-054): 離線工具無 srLog, 標準輸出即操作者終端機, 且 w-serv-orm 1.1.20 起預設輸出已不含主鍵、資料值與錯誤原文
let r = WServOrm(ds, WOrm, url, db)
let { woItems, procOrm } = r


export { woItems, procOrm }
