import path from 'path'
import fs from 'fs'
import get from 'lodash/get'
import each from 'lodash/each'
import keys from 'lodash/keys'
import j2o from 'wsemi/src/j2o.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isearr from 'wsemi/src/isearr.mjs'
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
import fsIsFile from 'wsemi/src/fsIsFile.mjs'
import replace from 'wsemi/src/replace.mjs'
import WServHapiServer from 'w-serv-hapi/src/WServHapiServer.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import ds from '../src/schema/index.mjs'


/**
 * API伺服器
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
 * @param {String} [opt.urlRedirect=''] 輸入錯誤時自動轉址字串，提供站台例如無法登入或驗證失敗時須自動轉址，預設''
 * @returns {Object} 回傳物件，其內server為hapi伺服器實體，wsrv為w-converhp的伺服器事件物件，wsds為w-serv-webdata的伺服器事件物件，可監聽error事件
 * @example
 *
 * import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs' //自行選擇引用ORM, 使用Mongodb測試
 * import WWebApi from './server/WWebApi.mjs'
 * import getSettings from './g.getSettings.mjs'
 *
 *
 * //st
 * let st = getSettings()
 *
 * let url = `mongodb://${st.dbUsername}:${st.dbPassword}@${st.dbIP}:${st.dbPort}` //使用Mongodb測試
 * let db = st.dbName
 * let opt = {
 *
 *     bCheckUser: false,
 *     getUserById: null,
 *     bExcludeWhenNotAdmin: false,
 *
 *     serverPort: 11005,
 *     subfolder: '', //mapi
 *     urlRedirect: 'https://www.google.com/', //本機測試時得先編譯, 再瀏覽: http://localhost:11005/
 *
 *     webName: {
 *         'eng': 'API Service',
 *         'cht': 'API管理系統',
 *     },
 *     webDescription: {
 *         'eng': 'A web service package as methods to send requests to and receive responses from an API.',
 *         'cht': 'A web service package as methods to send requests to and receive responses from an API.',
 *     },
 *     webLogo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjwhRE9DVFlQRSBzdmcgIFBVQkxJQyAnLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4nICAnaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkJz48c3ZnIGVuYWJsZS1iYWNrZ3JvdW5kPSJuZXcgMCAwIDMyIDMyIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+PGcgaWQ9IkxheWVyXzIiLz48ZyBpZD0iTGF5ZXJfMyIvPjxnIGlkPSJMYXllcl80Ij48Zz48cGF0aCBkPSJNOS4wMiw2QzkuMDEyNyw2LDkuMDA2OCw1Ljk5OSw5LDZIMkMxLjQ0NzgsNiwxLDUuNTUyNywxLDVWMmMwLTAuNTUyNywwLjQ0NzgtMSwxLTFoNiAgICBjMC40MzA3LDAsMC44MTI1LDAuMjc1NCwwLjk0ODcsMC42ODM2bDAuOTQwNCwyLjgyMTNDOS45NzIyLDQuNjUxNCwxMC4wMiw0LjgyMDMsMTAuMDIsNUMxMC4wMiw1LjU1MjcsOS41NzIzLDYsOS4wMiw2eiBNMyw0ICAgIGg0LjYxMjhMNy4yNzkzLDNIM1Y0eiIgZmlsbD0iI0Y1RDgwMyIvPjwvZz48Zz48cGF0aCBkPSJNMjQuMDE5NSwyMmMtMC4wMDM5LDAtMC4wMTE3LDAuMDAxLTAuMDE5NSwwaC03Yy0wLjU1MjIsMC0xLTAuNDQ3My0xLTF2LTNjMC0wLjU1MjcsMC40NDc4LTEsMS0xaDYgICAgYzAuNDMwNywwLDAuODEyNSwwLjI3NTQsMC45NDgyLDAuNjgzNmwwLjk0MDQsMi44MjEzYzAuMDg0LDAuMTQ2NSwwLjEzMDksMC4zMTU0LDAuMTMwOSwwLjQ5NTEgICAgQzI1LjAxOTUsMjEuNTUyNywyNC41NzIzLDIyLDI0LjAxOTUsMjJ6IE0xOCwyMGg0LjYxMjNsLTAuMzMzLTFIMThWMjB6IiBmaWxsPSIjRjVEODAzIi8+PC9nPjxnPjxwYXRoIGQ9Ik0xNSwxNUgyYy0wLjU1MjIsMC0xLTAuNDQ3My0xLTFWNWMwLTAuNTUyNywwLjQ0NzgtMSwxLTFoMTNjMC41NTIyLDAsMSwwLjQ0NzMsMSwxdjkgICAgQzE2LDE0LjU1MjcsMTUuNTUyMiwxNSwxNSwxNXogTTMsMTNoMTFWNkgzVjEzeiIgZmlsbD0iIzAxODFCMCIvPjwvZz48Zz48cGF0aCBkPSJNMzAsMzFIMTdjLTAuNTUyMiwwLTEtMC40NDczLTEtMXYtOWMwLTAuNTUyNywwLjQ0NzgtMSwxLTFoMTNjMC41NTI3LDAsMSwwLjQ0NzMsMSwxdjkgICAgQzMxLDMwLjU1MjcsMzAuNTUyNywzMSwzMCwzMXogTTE4LDI5aDExdi03SDE4VjI5eiIgZmlsbD0iIzAxODFCMCIvPjwvZz48Zz48cGF0aCBkPSJNMjYsOGgtOGMtMC41NTI3LDAtMSwwLjQ0NzMtMSwxczAuNDQ3MywxLDEsMWg3djZjMCwwLjU1MjcsMC40NDczLDEsMSwxczEtMC40NDczLDEtMVY5ICAgIEMyNyw4LjQ0NzMsMjYuNTUyNyw4LDI2LDh6IiBmaWxsPSIjMDBBQ0JBIi8+PGc+PHBhdGggZD0iTTIwLDEyYy0wLjI1NTksMC0wLjUxMTctMC4wOTc3LTAuNzA3LTAuMjkzbC0yLTJjLTAuMzkwNi0wLjM5MDYtMC4zOTA2LTEuMDIzNCwwLTEuNDE0MWwyLTIgICAgIGMwLjM5MDYtMC4zOTA2LDEuMDIzNC0wLjM5MDYsMS40MTQxLDBzMC4zOTA2LDEuMDIzNCwwLDEuNDE0MUwxOS40MTQxLDlsMS4yOTMsMS4yOTNjMC4zOTA2LDAuMzkwNiwwLjM5MDYsMS4wMjM0LDAsMS40MTQxICAgICBDMjAuNTExNywxMS45MDIzLDIwLjI1NTksMTIsMjAsMTJ6IiBmaWxsPSIjRjVEODAzIi8+PC9nPjwvZz48Zz48cGF0aCBkPSJNMTQsMjVIN3YtNmMwLTAuNTUyNy0wLjQ0NzgtMS0xLTFzLTEsMC40NDczLTEsMXY3YzAsMC41NTI3LDAuNDQ3OCwxLDEsMWg4YzAuNTUyMiwwLDEtMC40NDczLDEtMSAgICBTMTQuNTUyMiwyNSwxNCwyNXoiIGZpbGw9IiMwMEFDQkEiLz48Zz48cGF0aCBkPSJNMTIsMjljLTAuMjU1OSwwLTAuNTExNy0wLjA5NzctMC43MDctMC4yOTNjLTAuMzkwNi0wLjM5MDYtMC4zOTA2LTEuMDIzNCwwLTEuNDE0MUwxMi41ODU5LDI2ICAgICBsLTEuMjkzLTEuMjkzYy0wLjM5MDYtMC4zOTA2LTAuMzkwNi0xLjAyMzQsMC0xLjQxNDFzMS4wMjM0LTAuMzkwNiwxLjQxNDEsMGwyLDJjMC4zOTA2LDAuMzkwNiwwLjM5MDYsMS4wMjM0LDAsMS40MTQxbC0yLDIgICAgIEMxMi41MTE3LDI4LjkwMjMsMTIuMjU1OSwyOSwxMiwyOXoiIGZpbGw9IiNGNUQ4MDMiLz48L2c+PC9nPjwvZz48ZyBpZD0iTGF5ZXJfNSIvPjxnIGlkPSJMYXllcl82Ii8+PGcgaWQ9IkxheWVyXzciLz48ZyBpZD0iTGF5ZXJfOCIvPjxnIGlkPSJMYXllcl85Ii8+PGcgaWQ9IkxheWVyXzEwIi8+PGcgaWQ9IkxheWVyXzExIi8+PGcgaWQ9IkxheWVyXzEyIi8+PGcgaWQ9IkxheWVyXzEzIi8+PGcgaWQ9IkxheWVyXzE0Ii8+PGcgaWQ9IkxheWVyXzE1Ii8+PGcgaWQ9IkxheWVyXzE2Ii8+PGcgaWQ9IkxheWVyXzE3Ii8+PGcgaWQ9IkxheWVyXzE4Ii8+PGcgaWQ9IkxheWVyXzE5Ii8+PGcgaWQ9IkxheWVyXzIwIi8+PGcgaWQ9IkxheWVyXzIxIi8+PGcgaWQ9IkxheWVyXzIyIi8+PGcgaWQ9IkxheWVyXzIzIi8+PGcgaWQ9IkxheWVyXzI0Ii8+PGcgaWQ9IkxheWVyXzI1Ii8+PGcgaWQ9IkxheWVyXzI2Ii8+PC9zdmc+',
 *
 * }
 *
 * let getUserByToken = async (token) => {
 *     // return {} //測試無法登入
 *     if (token === '{token-for-application}') { //提供外部應用系統作為存取使用者
 *         return {
 *             id: 'id-for-application',
 *             name: 'application',
 *             email: 'application@example.com',
 *             isAdmin: 'y',
 *         }
 *     }
 *     if (token === 'sys') { //開發階段w-ui-loginout自動給予browser使用者(且位於localhost)的token為sys
 *         return {
 *             id: 'id-for-admin',
 *             name: '測試者',
 *             email: 'admin@example.com',
 *             isAdmin: 'y',
 *         }
 *     }
 *     console.log('invalid token', token)
 *     console.log('於生產環境時得加入SSO等驗證token機制')
 *     return {}
 * }
 *
 * let verifyUser = (user) => {
 *     // return false //測試無法登入
 *     console.log('於生產環境時得加入驗證user機制')
 *     return user.isAdmin === 'y' //測試僅系統管理者使用
 * }
 *
 * //WWebApi
 * let instWWebApi = WWebApi(WOrm, url, db, getUserByToken, verifyUser, opt)
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


    //urlRedirect
    let urlRedirect = get(opt, 'urlRedirect', '')


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


    //getTokenUserForSelf
    let getTokenUserForSelf = async (token) => {

        //getUserByToken
        let userSelf = getUserByToken(token)
        if (ispm(userSelf)) {
            userSelf = await userSelf
        }

        //check
        if (!iseobj(userSelf)) {
            console.log(`token`, token)
            console.log(`can not find the user from token`)
            return Promise.reject(`can not find the user from token`)
        }

        //verifyUser
        let b = verifyUser(userSelf)
        if (ispm(b)) {
            b = await b
        }

        //check
        if (!b) {
            console.log('userSelf', userSelf)
            console.log(`user does not have permission`)
            return Promise.reject(`user does not have permission`)
        }

        return userSelf
    }


    //getAPIsList
    let getAPIsList = async (query = {}) => {
        let rs = await woItems.apis.select(query)
        return rs
    }


    //parsePayload
    let parsePayload = async (req) => {

        //inp
        let inp = get(req, 'payload')

        //to obj
        if (isestr(inp)) {
            inp = j2o(inp)
        }

        //check
        if (!iseobj(inp)) {
            console.log('inp', inp)
            console.log(`invalid inp from req`)
            return Promise.reject(`invalid inp from req`)
        }

        //group
        let group = get(inp, 'group', '')

        //check
        if (!isestr(group)) {
            console.log('inp', inp)
            console.log('group', group)
            console.log(`invalid group from inp`)
            return Promise.reject(`invalid group from inp`)
        }

        //apis
        let apis = get(inp, 'apis', [])

        //check
        if (!isearr(apis)) {
            console.log('inp', inp)
            console.log('apis', apis)
            console.log(`invalid apis from inp`)
            return Promise.reject(`invalid apis from inp`)
        }

        //偵測b64自動恢復
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

        //save group
        each(apis, (api, kapi) => {
            apis[kapi].group = group
        })

        //resave
        inp = { group, apis }

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


    //syncAndReplaceApis
    let syncAndReplaceApis = async (params) => {

        //group
        let group = get(params, 'group', '')
        // console.log('group', group)

        //check
        if (!isestr(group)) {
            console.log('params', params)
            console.log('group', group)
            console.log(`invalid group`)
            return Promise.reject(`invalid group`)
        }

        //apis
        let apis = get(params, 'apis', [])
        // console.log('apis', apis)

        //check
        if (!isearr(apis)) {
            console.log('params', params)
            console.log('apis', apis)
            console.log(`invalid apis`)
            return Promise.reject(`invalid apis`)
        }

        //delAll group
        await woItems.apis.delAll({ group })

        //insert
        let r = await woItems.apis.insert(apis)

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
        if (!fsIsFile(fpEntryIn)) {
            fpEntryIn = path.resolve(pathStaticFiles, fnEntryOut) //本機開發另使用html替代tmp
        }
        if (!fsIsFile(fpEntryIn)) {
            console.log('fpEntryIn', fpEntryIn)
            throw new Error(`invalid fpEntryIn`)
        }
        let fpEntryOut = path.resolve(pathStaticFiles, fnEntryOut)
        let c = fs.readFileSync(fpEntryIn, 'utf8')
        c = replace(c, '/mapi/', '{sfd}/') //方法同genEntry
        c = replace(c, '{sfd}', subfolder)
        c = replace(c, '{urlRedirect}', urlRedirect)
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
            path: '/api/getUserByToken', //未登入界面需先檢測token是否為系統管理員, 確認後回傳為系統管理員資訊物件, getUserByToken為w-ui-loginout預設值, 若要更改兩邊須同時修改
            handler: async function (req, res) {
                // console.log('getUserByToken', req)

                async function core() {

                    //token
                    let token = get(req, 'query.token', '')

                    //getTokenUserForSelf
                    let user = await getTokenUserForSelf(token)

                    //check
                    if (!iseobj(user)) {
                        console.log('token', token)
                        console.log('[API]getUserByToken/check user: invalid user')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
                    }

                    return user
                }

                //pm2resolve core
                let r = await pm2resolve(core)() //w-ui-loginout接收已預設格式用pm2resolve轉過, 會提取state進行判斷
                // console.log('getUserByToken', r)

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

                    //getTokenUserForSelf
                    let user = await getTokenUserForSelf(token)

                    //check
                    if (!iseobj(user)) {
                        console.log('token', token)
                        console.log('[API]getAPIsList/check user: invalid user')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
                    }

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

                    //getTokenUserForSelf
                    let user = await getTokenUserForSelf(token)

                    //check
                    if (!iseobj(user)) {
                        console.log('token', token)
                        console.log('[API]updateAPIs/check user: invalid user')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
                    }

                    //parsePayload
                    let inp = await parsePayload(req)

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
            path: '/syncAndReplaceApis',
            handler: async function (req, res) {
                // console.log('syncAndReplaceApis', req)
                // console.log('payload', req.payload)

                async function core() {

                    //token
                    let token = get(req, 'query.token', '')

                    //getTokenUserForSelf
                    let user = await getTokenUserForSelf(token)

                    //check
                    if (!iseobj(user)) {
                        console.log('token', token)
                        console.log('[API]syncAndReplaceApis/check user: invalid user')
                        console.log(`token does not have permission`)
                        return Promise.reject(`token does not have permission`)
                    }

                    //parsePayload
                    let inp = await parsePayload(req)

                    //syncAndReplaceApis
                    let r = await syncAndReplaceApis(inp)

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
