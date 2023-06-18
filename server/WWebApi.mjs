import path from 'path'
import fs from 'fs'
import get from 'lodash/get'
// import map from 'lodash/map'
import each from 'lodash/each'
import keys from 'lodash/keys'
// import cloneDeep from 'lodash/cloneDeep'
import j2o from 'wsemi/src/j2o.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import ispm from 'wsemi/src/ispm.mjs'
import cint from 'wsemi/src/cint.mjs'
import strleft from 'wsemi/src/strleft.mjs'
import strdelleft from 'wsemi/src/strdelleft.mjs'
import strright from 'wsemi/src/strright.mjs'
import strdelright from 'wsemi/src/strdelright.mjs'
import pm2resolve from 'wsemi/src/pm2resolve.mjs'
import b642str from 'wsemi/src/b642str.mjs'
import fsIsFolder from 'wsemi/src/fsIsFolder.mjs'
import replace from 'wsemi/src/replace.mjs'
import WServHapiServer from 'w-serv-hapi/src/WServHapiServer.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from '../src/schema/index.mjs'


/**
 * 基於hapi之API伺服器
 *
 * @class
 * @param {Function} WOrm 輸入資料庫ORM函數
 * @param {String} url 輸入資料庫連線字串，例如'mongodb://sername:password@$127.0.0.1:27017'
 * @param {String} db 輸入資料庫名稱字串
 * @param {Function} getUserByToken 輸入處理函數，函數會傳入使用者token，通過此函數處理後並回傳使用者資訊物件，並至少須提供'id'、'email'、'name'、'isAdmin'欄位，且'isAdmin'限輸入'y'或'n'，且輸入'y'時會複寫權限系統該使用者之'isAdmin'欄位值
 * @param {Function} verifyUser 輸入處理函數，函數會傳入使用者資訊物件，通過此函數識別後回傳布林值，允許使用者回傳true，反之回傳false
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {Integer} [opt.serverPort=11005] 輸入伺服器通訊port，預設11005
 * @param {Boolean} [opt.bCheckUser=false] 輸入是否檢查使用者資訊布林值，預設false
 * @param {Function} [opt.getUserById=null] 輸入當bCheckUser=true時依照使用者ID取得使用者資訊物件函數，預設null
 * @param {Boolean} [opt.bExcludeWhenNotAdmin=false] 輸入使用ORM的select方法時是否自動刪除數據內isActive欄位之布林值，預設false
 * @param {Object} [opt.webName={}] 輸入站台名稱物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @param {Object} [opt.webDescription={}] 輸入站台描述物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @param {String} [opt.webLogo=''] 輸入站台logo字串，採base64格式，預設''
 * @param {String} [opt.subfolder=''] 輸入站台所在子目錄字串，提供站台位於內網採反向代理進行服務時，故需支援位於子目錄情形，預設''
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
 *     subfolder: '', //mpai
 *
 *     webName: {
 *         'eng': 'API Service',
 *         'cht': 'API管理系統'
 *     },
 *
 * }
 *
 * //WWebApi
 * let instWWebApi = WWebApi(WOrm, url, db, opt)
 *
 * instWWebApi.on('error', (err) => {
 *     console.log(err)
 * })
 *
 */
function WWebApi(WOrm, url, db, getUserByToken, verifyUser, opt = {}) {
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


    //check getUserByToken
    if (!isfun(getUserByToken)) {
        console.log('invalid getUserByToken', getUserByToken)
        throw new Error('invalid getUserByToken')
    }


    //check verifyUser
    if (!isfun(verifyUser)) {
        console.log('invalid verifyUser', verifyUser)
        throw new Error('invalid verifyUser')
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
    let webLogo = get(opt, 'webLogo', '')


    //subfolder
    let subfolder = get(opt, 'subfolder', '')
    if (isestr(subfolder)) {
        if (strright(subfolder, 1) === '/') { //右邊不需要給「/」
            subfolder = strdelright(subfolder, 1)
        }
        if (strleft(subfolder, 1) !== '/') { //左邊需要給「/」
            subfolder = `/${subfolder}`
        }
    }


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


    //verifyUserByToken
    let verifyUserByToken = async (token) => {

        //getUserByToken
        let user = getUserByToken(token)
        if (ispm(user)) {
            user = await user
        }
        if (!iseobj(user)) {
            return Promise.reject(`token does not have permission`)
        }

        //verifyUser
        let b = verifyUser(user)
        if (ispm(b)) {
            b = await b
        }

        //check
        if (!b) {
            return Promise.reject(`user does not have permission`)
        }

        return user
    }

    //getAPIsList
    let getAPIsList = async (query = {}) => {
        let rs = await woItems.apis.select(query)
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
    let updateAPIs = async (params = {}) => {

        //spread params
        let { apis: rsApis } = params
        // console.log('group', group)
        // console.log('rsApis', rsApis)

        //save
        let r = await woItems.apis.save(rsApis)

        return r
    }


    //replaceAPIsByLevels
    let replaceAPIsByLevels = async (params = {}) => {

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


    //subfolder
    let fnEntryIn = 'index.tmp'
    let fnEntryOut = 'index.html'
    try {
        let fpEntryIn = path.resolve(pathStaticFiles, fnEntryIn)
        let fpEntryOut = path.resolve(pathStaticFiles, fnEntryOut)
        let c = fs.readFileSync(fpEntryIn, 'utf8')
        c = replace(c, '{sfd}', subfolder)
        fs.writeFileSync(fpEntryOut, c, 'utf8')
    }
    catch (err) {
        console.log(err)
        console.log(`can not generate ${fnEntryOut}`)
    }


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
            path: '/api/getUserByToken', //未登入界面需先檢測token是否為系統管理員, 確認後回傳為系統管理員資訊物件
            handler: async function (req, res) {
                // console.log('getUserByToken', req)

                async function core() {

                    //token
                    let token = get(req, 'query.token', '')

                    //verifyUserByToken
                    let user = await verifyUserByToken(token)

                    return user
                }

                //pm2resolve core
                let r = await pm2resolve(core)()
                // console.log('verifyIdentity', r)

                return r
            },
        },
        {
            method: 'GET',
            path: '/getAPIsList',
            handler: async function (req, res) {
                // console.log('getAPIsList', req)

                async function core() {

                    //token
                    let token = get(req, 'query.token', '')

                    //verifyUserByToken
                    await verifyUserByToken(token)

                    //getAPIsList
                    let r = await getAPIsList({ isActive: 'y' })

                    return r
                }

                //pm2resolve core
                let r = await pm2resolve(core)()
                // console.log('verifyIdentity', r)

                return r
            },
        },
        {
            method: 'POST',
            path: '/updateAPIs',
            handler: async function (req, res) {
                // console.log('updateAPIs', req)
                // console.log('payload', req.payload)

                async function core() {

                    //token
                    let token = get(req, 'query.token', '')

                    //verifyUserByToken
                    await verifyUserByToken(token)

                    //parsePayload
                    let inp = parsePayload(req)

                    //updateAPIs
                    let r = await updateAPIs(inp)

                    return r
                }

                //pm2resolve core
                let r = await pm2resolve(core)()
                // console.log('verifyIdentity', r)

                return r
            },
        },
        {
            method: 'POST',
            path: '/replaceAPIsByLevels',
            handler: async function (req, res) {
                // console.log('replaceAPIsByLevels', req)
                // console.log('payload', req.payload)

                async function core() {

                    //token
                    let token = get(req, 'query.token', '')

                    //verifyUserByToken
                    await verifyUserByToken(token)

                    //parsePayload
                    let inp = parsePayload(req)

                    //replaceAPIsByLevels
                    let r = await replaceAPIsByLevels(inp)

                    return r
                }

                //pm2resolve core
                let r = await pm2resolve(core)()
                // console.log('verifyIdentity', r)

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
    instWServHapiServer = new WServHapiServer({
        port: opt.serverPort,
        pathStaticFiles,
        apis,
        getUserIDFromToken: async (token) => { //可使用async或sync函數
            return ''
        },
        useDbORM: true,
        dbORMs: woItems,
        operORM: procOrm, //procOrm的輸入為: userId, tableName, methodName, input
        tableNamesExec,
        methodsExec: ['select', 'insert', 'save', 'del'], //mix需於procOrm內註冊以提供
        tableNamesSync,
        extFuncs: { //接收參數第1個為userId, 之後才是前端給予參數
            getWebInfor,
            getAPIsList: (userId, query = {}) => {
                return getAPIsList(query)
            },
            //...
        },
        hookBefores: null,
        hookAfters: null,
        fnTableTags: 'tableTags-web-api.json',
    })


    return instWServHapiServer
}


export default WWebApi
