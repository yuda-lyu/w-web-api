// import path from 'path'
import fs from 'fs'
// import _ from 'lodash'
import w from 'wsemi'
import br from 'w-serv-orm/src/getDbBackupAndRecover.mjs'
import { woItems } from './mOrm.mjs'
// import { genModels } from './mOrmGenModels.mjs'


//mOrmGenModels.mjs
let genModels = `
import path from 'path'
import _ from 'lodash'
// import w from 'wsemi'
import genModelsByTabs from 'w-orm-reladb/src/genModelsByTabs.mjs'
import ds from '../src/schema/index.mjs'


let fdSrv = path.resolve()


function genModels() {

    //names
    let names = _.keys(ds)

    //tabs
    let tabs = {}
    _.each(names, (name) => {
        tabs[name] = ds[name].settings
    })
    console.log('tabs', tabs)

    //fd
    let fd = fdSrv + '/models' 

    //genModelsByTabs
    genModelsByTabs(fd, tabs)

}


export { genModels }
`

function backup() {
    br.backup(woItems)
        .then((res) => {
            let j = w.o2j(res)
            fs.writeFileSync(`./backup-${w.now2strp()}.json`, j, 'utf8')
            console.log('backup finish')
        })
        .catch((err) => {
            console.log(err)
        })
}
backup()


function recover() {
    let fp = '../_db/backup-20220222134749.json'
    let genModels = null
    let needCreateStorage = false
    br.recover(fp, woItems, genModels, needCreateStorage)
        .then(() => {
            console.log('recover finish')
        })
        .catch((err) => {
            console.log(err)
        })
}
// recover()


//備份資料重與由備份資料重建資料庫
//node --experimental-modules --es-module-specifier-resolution=node server/mDb.mjs
