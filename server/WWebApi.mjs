import get from 'lodash/get'
// import map from 'lodash/map'
import each from 'lodash/each'
import keys from 'lodash/keys'
// import cloneDeep from 'lodash/cloneDeep'
import j2o from 'wsemi/src/j2o.mjs'
import iseobj from 'wsemi/src/iseobj'
import isestr from 'wsemi/src/isestr'
import ispint from 'wsemi/src/ispint'
import isfun from 'wsemi/src/isfun'
import cint from 'wsemi/src/cint'
import strleft from 'wsemi/src/strleft'
import strdelleft from 'wsemi/src/strdelleft'
import b642str from 'wsemi/src/b642str'
import fsIsFolder from 'wsemi/src/fsIsFolder'
import WServHapiServer from 'w-serv-hapi/src/WServHapiServer.mjs'
import ds from '../src/schema/index.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'


/**
 * 基於hapi之API伺服器
 *
 * @class
 * @param {Function} WOrm 輸入資料庫ORM函數
 * @param {String} url 輸入資料庫連線字串，例如'mongodb://sername:password@$127.0.0.1:27017'
 * @param {String} db 輸入資料庫名稱字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.serverPort=11005] 輸入伺服器通訊port，預設11005
 * @param {Function} [opt.getUserById=null] 輸入當bCheckUser=true時依照使用者ID取得使用者資訊物件函數，預設null
 * @param {Boolean} [opt.bCheckUser=true] 輸入是否檢查使用者資訊布林值，預設true
 * @param {Boolean} [opt.bExcludeWhenNotAdmin=true] 輸入使用ORM的select方法時是否自動刪除數據內isActive欄位之布林值，預設true
 * @param {Object} [opt.webName={}] 輸入站台名稱物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @returns {Object} 回傳物件，其內server為hapi伺服器實體，wsrv為w-converhp的伺服器事件物件，wsds為w-serv-webdata的伺服器事件物件，可監聽error事件
 * @example
 *
 * import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs' //自行選擇引用ORM, 使用Mongodb測試
 * import getSettings from './server/getSettings.mjs'
 * import WWebApi from './server/WWebApi.mjs'
 *
 * //st
 * let st = getSettings()
 *
 * let url = `mongodb://${st.dbUsername}:${st.dbPassword}@${st.dbIP}:${st.dbPort}` //使用Mongodb測試
 * let db = st.dbName
 * let opt = {
 *
 *     getUserById: null,
 *     bCheckUser: false,
 *     bExcludeWhenNotAdmin: false,
 *
 *     serverPort: 11005,
 *
 *     webName: {
 *         'eng': 'API Service',
 *         'cht': 'API管理系統'
 *     },
 *
 * }
 *
 * //WWebApi
 * WWebApi(WOrm, url, db, opt)
 *     .catch((err) => {
 *         console.log(err)
 *     })
 *
 */
async function WWebApi(WOrm, url, db, opt = {}) {
    let instWServHapiServer = null


    //check WOrm
    if (!isfun(WOrm)) {
        console.log('invalid WOrm', WOrm)
        throw new Error('invalid WOrm')
    }


    //check url
    if (!isestr(url)) {
        console.log('invalid url', url)
        throw new Error('invalid url')
    }


    //check db
    if (!isestr(db)) {
        console.log('invalid db', db)
        throw new Error('invalid db')
    }


    //serverPort
    let serverPort = get(opt, 'serverPort')
    if (!ispint(serverPort)) {
        serverPort = 11005
    }
    serverPort = cint(serverPort)


    //bCheckUser
    let bCheckUser = get(opt, 'bCheckUser', false)


    //getUserById
    let getUserById = get(opt, 'getUserById', null)


    //bExcludeWhenNotAdmin
    let bExcludeWhenNotAdmin = get(opt, 'bExcludeWhenNotAdmin', false)


    //webName
    let webName = get(opt, 'webName', {})


    //webDescription
    let webDescription = get(opt, 'webDescription', {})


    //webLogo
    let webLogo = get(opt, 'webLogo', {})


    //WServOrm
    let optWServOrm = {
        bCheckUser,
        getUserById,
        bExcludeWhenNotAdmin,
    }
    let wp = {}
    try {
        wp = WServOrm(ds, WOrm, url, db, optWServOrm)
    }
    catch (err) {
        console.log(err)
    }
    let { woItems, procOrm } = wp


    //getWebInfor
    let getWebInfor = (userId) => {
        return {
            webName,
            webDescription,
            webLogo,
        }
    }


    //getAPIsList
    let getAPIsList = async (userId, token) => {
        let rs = await woItems.apis.select()
        return rs
    }


    //parsePayload
    let parsePayload = (req) => {
        let inp = get(req, 'payload')

        //to obj
        if (isestr(inp)) {
            inp = j2o(inp)
        }

        //cv apis for base64
        if (iseobj(inp)) {

            //spread
            let { group, apis } = inp

            //apis
            each(apis, (api, kapi) => {
                // console.log(kapi, api.name)
                each(api, (v, k) => {
                    // console.log(k, v)
                    if (isestr(v)) {
                        if (strleft(v, 7) === 'base64:') {
                            // console.log(k, 'get base64')
                            v = strdelleft(v, 7)
                            v = b642str(v)
                            // console.log(v)
                            apis[kapi][k] = v
                        }
                    }
                })
            })

            //resave
            inp = { group, apis }

        }
        else {
            inp = null
        }

        return inp
    }


    //updateAPIs
    let updateAPIs = async (userId, params = {}) => {

        //spread params
        let { apis: rsApis } = params
        // console.log('group', group)
        // console.log('rsApis', rsApis)

        //save
        let r = await woItems.apis.save(rsApis)

        return r
    }


    //replaceAPIsByLevels
    let replaceAPIsByLevels = async (userId, params = {}) => {

        //spread params
        let { group, apis: rsApis } = params
        // console.log('group', group)
        // console.log('rsApis', rsApis)

        //delAll group
        await woItems.apis.delAll({ group })

        //insert
        let r = await woItems.apis.insert(rsApis)

        return r
    }


    //pathStaticFiles
    let pathStaticFiles = 'dist'
    let npmPathStaticFiles = './node_modules/w-web-api/dist'
    if (fsIsFolder(npmPathStaticFiles)) {
        pathStaticFiles = npmPathStaticFiles
    }
    // console.log('pathStaticFiles', pathStaticFiles)


    //apis
    let apis = [
        // {
        //     method: 'GET',
        //     path: '/api/someAPI',
        //     handler: async function (req, res) {

        //         // //token
        //         // let token = get(req, 'query.token', '')

        //         return 'someAPI'
        //     },
        // },
        {
            method: 'GET',
            path: '/getWebInfor',
            handler: async function (req, res) {
                return getWebInfor()
            },
        },
        {
            method: 'GET',
            path: '/getAPIsList',
            handler: async function (req, res) {

                //token
                let token = get(req, 'query.token', '')

                //getAPIsList
                let r = await getAPIsList('', token)

                return r
            },
        },
        {
            method: 'POST',
            path: '/updateAPIs',
            handler: async function (req, res) {
                // console.log(req, res)
                // console.log('payload', req.payload)

                //parsePayload
                let inp = parsePayload(req)

                //updateAPIs
                let r = await updateAPIs('', inp)

                return r
            },
        },
        {
            method: 'POST',
            path: '/replaceAPIsByLevels',
            handler: async function (req, res) {
                // console.log(req, res)
                // console.log('payload', req.payload)

                //parsePayload
                let inp = parsePayload(req)

                //replaceAPIsByLevels
                let r = await replaceAPIsByLevels('', inp)

                return r
            },
        },
    ]


    //tableNamesExec, tableNamesSync
    let tableNamesExec = keys(ds)
    // let tableNamesSync = filter(tableNamesExec, (v) => {
    //     return strright(v, 5) !== 'Items'//不同步數據
    // })
    let tableNamesSync = tableNamesExec


    //WServHapiServer
    instWServHapiServer = WServHapiServer({
        port: opt.serverPort,
        pathStaticFiles,
        apis,
        getUserIDFromToken: async (token) => { //可使用async或sync函數
            return 'id-for-admin'
        },
        useDbORM: true,
        dbORMs: woItems,
        operORM: procOrm, //procOrm的輸入為: userId, tableName, methodName, input
        tableNamesExec,
        methodsExec: ['select', 'insert', 'save', 'del'], //mix需於procOrm內註冊以提供
        tableNamesSync,
        extFuncs: { //接收參數第1個為userId, 之後才是前端給予參數
            getWebInfor,
            getAPIsList,
            //...
        },
        hookBefores: null,
        hookAfters: null,
        fnTableTags: 'tableTags-web-api.json',
    })


    return instWServHapiServer
}


export default WWebApi