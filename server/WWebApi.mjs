import get from 'lodash/get'
import map from 'lodash/map'
import keys from 'lodash/keys'
import cloneDeep from 'lodash/cloneDeep'
import j2o from 'wsemi/src/j2o.mjs'
import iseobj from 'wsemi/src/iseobj'
import isestr from 'wsemi/src/isestr'
import ispint from 'wsemi/src/ispint'
import isfun from 'wsemi/src/isfun'
import fsIsFolder from 'wsemi/src/fsIsFolder'
import cint from 'wsemi/src/cint'
import WServHapiServer from 'w-serv-hapi/src/WServHapiServer.mjs'
import ds from '../src/schema/index.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'


/**
 * 基於hapi之API伺服器
 *
 * @class
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} opt.url 輸入資料庫連線字串，例如'mongodb://sername:password@$127.0.0.1:27017'
 * @param {String} opt.db 輸入資料庫名稱字串
 * @param {Function} opt.WOrm 輸入資料庫ORM函數
 * @param {Integer} [opt.serverPort=11005] 輸入伺服器通訊port，預設11005
 * @param {Function} [opt.getUserById=null] 輸入當bCheckUser=true時依照使用者ID取得使用者資訊物件函數，預設null
 * @param {Boolean} [opt.bCheckUser=true] 輸入是否檢查使用者資訊布林值，預設true
 * @param {Boolean} [opt.bExcludeWhenNotAdmin=true] 輸入使用ORM的select方法時是否自動刪除數據內isActive欄位之布林值，預設true
 * @param {Object} [opt.webName={}] 輸入站台名稱物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @returns {Object} 回傳物件，其內server為hapi伺服器實體，wsrv為w-converhp的伺服器事件物件，wsds為w-serv-webdata的伺服器事件物件，可監聽error事件
 * @example
 *

 *
 */
async function WWebApi(url, db, WOrm, opt = {}) {


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


    //check WOrm
    if (!isfun(WOrm)) {
        console.log('invalid WOrm', WOrm)
        throw new Error('invalid WOrm')
    }


    //serverPort
    let serverPort = get(opt, 'serverPort')
    if (!ispint(serverPort)) {
        serverPort = 11005
    }
    serverPort = cint(serverPort)


    //getUserById
    let getUserById = get(opt, 'getUserById', null)


    //bCheckUser
    let bCheckUser = get(opt, 'bCheckUser', false)


    //bExcludeWhenNotAdmin
    let bExcludeWhenNotAdmin = get(opt, 'bExcludeWhenNotAdmin', false)


    //webName
    let webName = get(opt, 'webName', {})


    //WServOrm
    let optWServOrm = {
        url,
        db,
        getUserById,
        bCheckUser,
        bExcludeWhenNotAdmin,
    }
    let wp = {}
    try {
        wp = WServOrm(ds, WOrm, optWServOrm)
    }
    catch (err) {
        console.log(err)
    }
    let { woItems, procOrm } = wp


    //getWebInfor
    let getWebInfor = (userId) => {
        return {
            webName,
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
        if (isestr(inp)) {
            inp = j2o(inp)
        }
        if (!iseobj(inp)) {
            inp = null
        }
        return inp
    }


    //updateAPIs
    let updateAPIs = async (userId, params = {}) => {

        //spread params
        let { apis: rsApis } = params
        // console.log('levels', levels)
        // console.log('rsApis', rsApis)

        //save
        let r = await woItems.apis.save(rsApis)

        return r
    }


    //replaceAPIsByLevels
    let replaceAPIsByLevels = async (userId, params = {}) => {

        //spread params
        let { levels, apis: rsApis } = params
        // console.log('levels', levels)
        // console.log('rsApis', rsApis)

        //delAll levels
        await woItems.apis.delAll({ levels })

        //rsApisTemp
        let rsApisTemp = cloneDeep(rsApis)
        rsApisTemp = map(rsApisTemp, (v) => {
            v.levels = levels
            return v
        })

        //insert
        let r = await woItems.apis.insert(rsApisTemp)

        return r
    }


    //pathStaticFiles
    let pathStaticFiles = 'dist'
    let npmPathStaticFiles = './node_modules/w-web-api/dist'
    if (fsIsFolder(npmPathStaticFiles)) {
        pathStaticFiles = npmPathStaticFiles
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
    let wshs = WServHapiServer({
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
    })


    return wshs
}


export default WWebApi