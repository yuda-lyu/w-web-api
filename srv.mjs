import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WWebApi from './server/WWebApi.mjs'
import getSettings from './g_getSettings.mjs'
import get from 'lodash-es/get.js'
import iseobj from 'wsemi/src/iseobj.mjs'
import axios from 'axios'
import JSON5 from 'json5'
import fs from 'fs'


//st（db 等系統參數由 g_getSettings 提供，供 g_mOrm 共用）
let st = getSettings()

//pathSettings：app 設定檔路徑，預設 ./settings.json；可由 `node srv.mjs <path>` 覆寫
//（供 e2e restartBackend / 部署帶不同設定，日後更細緻功能便於擴充）。settings.json 為 JSON5 格式。
let pathSettings = process.argv[2] || './settings.json'
let stApp = JSON5.parse(fs.readFileSync(pathSettings, 'utf8'))

let url = st.dbUrl
let db = st.dbName
let ssoBaseUrl = st.ssoBaseUrl
let ssoAppToken = st.ssoAppToken
let ssoLoginUrl = st.ssoLoginUrl
let opt = {

    useCheckUser: false,
    getUserById: null,
    useExcludeWhenNotAdmin: false,

    serverPort: get(stApp, 'serverPort', 11005),
    subfolder: '', //mapi
    urlRedirect: ssoLoginUrl, //未登入時導向SSO登入頁, 本機測試時得先編譯, 再瀏覽: http://localhost:11005/

    //語系（來自 settings.json）：language 由 WWebApi 注入 index.html ({language}) → 初始畫面即此語系；
    //showLanguage 控右上語系選單顯隱。e2e 可用 restartBackend(genTempSettings({language})) 改 server 初始語系。
    showLanguage: get(stApp, 'showLanguage', 'y'),
    language: get(stApp, 'language', 'eng'),

    //log 資料夾與輪檔間隔（srLog 寫入 + staEvent 統計皆讀此）。e2e 可用 genTempSettings({logFd}) 指向合成 log 達 hermetic。
    logFd: get(stApp, 'logFd', './logs'),
    logInterval: get(stApp, 'logInterval', 'hr'),

    webName: {
        'eng': 'API Service',
        'cht': 'API管理系統',
    },
    webDescription: {
        'eng': 'A web service package as methods to send requests to and receive responses from an API.',
        'cht': '一套以方法形式，用於發送請求至API並接收其回應的網頁服務套件。',
    },
    webLogo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjwhRE9DVFlQRSBzdmcgIFBVQkxJQyAnLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4nICAnaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkJz48c3ZnIGVuYWJsZS1iYWNrZ3JvdW5kPSJuZXcgMCAwIDMyIDMyIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+PGcgaWQ9IkxheWVyXzIiLz48ZyBpZD0iTGF5ZXJfMyIvPjxnIGlkPSJMYXllcl80Ij48Zz48cGF0aCBkPSJNOS4wMiw2QzkuMDEyNyw2LDkuMDA2OCw1Ljk5OSw5LDZIMkMxLjQ0NzgsNiwxLDUuNTUyNywxLDVWMmMwLTAuNTUyNywwLjQ0NzgtMSwxLTFoNiAgICBjMC40MzA3LDAsMC44MTI1LDAuMjc1NCwwLjk0ODcsMC42ODM2bDAuOTQwNCwyLjgyMTNDOS45NzIyLDQuNjUxNCwxMC4wMiw0LjgyMDMsMTAuMDIsNUMxMC4wMiw1LjU1MjcsOS41NzIzLDYsOS4wMiw2eiBNMyw0ICAgIGg0LjYxMjhMNy4yNzkzLDNIM1Y0eiIgZmlsbD0iI0Y1RDgwMyIvPjwvZz48Zz48cGF0aCBkPSJNMjQuMDE5NSwyMmMtMC4wMDM5LDAtMC4wMTE3LDAuMDAxLTAuMDE5NSwwaC03Yy0wLjU1MjIsMC0xLTAuNDQ3My0xLTF2LTNjMC0wLjU1MjcsMC40NDc4LTEsMS0xaDYgICAgYzAuNDMwNywwLDAuODEyNSwwLjI3NTQsMC45NDgyLDAuNjgzNmwwLjk0MDQsMi44MjEzYzAuMDg0LDAuMTQ2NSwwLjEzMDksMC4zMTU0LDAuMTMwOSwwLjQ5NTEgICAgQzI1LjAxOTUsMjEuNTUyNywyNC41NzIzLDIyLDI0LjAxOTUsMjJ6IE0xOCwyMGg0LjYxMjNsLTAuMzMzLTFIMThWMjB6IiBmaWxsPSIjRjVEODAzIi8+PC9nPjxnPjxwYXRoIGQ9Ik0xNSwxNUgyYy0wLjU1MjIsMC0xLTAuNDQ3My0xLTFWNWMwLTAuNTUyNywwLjQ0NzgtMSwxLTFoMTNjMC41NTIyLDAsMSwwLjQ0NzMsMSwxdjkgICAgQzE2LDE0LjU1MjcsMTUuNTUyMiwxNSwxNSwxNXogTTMsMTNoMTFWNkgzVjEzeiIgZmlsbD0iIzAxODFCMCIvPjwvZz48Zz48cGF0aCBkPSJNMzAsMzFIMTdjLTAuNTUyMiwwLTEtMC40NDczLTEtMXYtOWMwLTAuNTUyNywwLjQ0NzgtMSwxLTFoMTNjMC41NTI3LDAsMSwwLjQ0NzMsMSwxdjkgICAgQzMxLDMwLjU1MjcsMzAuNTUyNywzMSwzMCwzMXogTTE4LDI5aDExdi03SDE4VjI5eiIgZmlsbD0iIzAxODFCMCIvPjwvZz48Zz48cGF0aCBkPSJNMjYsOGgtOGMtMC41NTI3LDAtMSwwLjQ0NzMtMSwxczAuNDQ3MywxLDEsMWg3djZjMCwwLjU1MjcsMC40NDczLDEsMSwxczEtMC40NDczLDEtMVY5ICAgIEMyNyw4LjQ0NzMsMjYuNTUyNyw4LDI2LDh6IiBmaWxsPSIjMDBBQ0JBIi8+PGc+PHBhdGggZD0iTTIwLDEyYy0wLjI1NTksMC0wLjUxMTctMC4wOTc3LTAuNzA3LTAuMjkzbC0yLTJjLTAuMzkwNi0wLjM5MDYtMC4zOTA2LTEuMDIzNCwwLTEuNDE0MWwyLTIgICAgIGMwLjM5MDYtMC4zOTA2LDEuMDIzNC0wLjM5MDYsMS40MTQxLDBzMC4zOTA2LDEuMDIzNCwwLDEuNDE0MUwxOS40MTQxLDlsMS4yOTMsMS4yOTNjMC4zOTA2LDAuMzkwNiwwLjM5MDYsMS4wMjM0LDAsMS40MTQxICAgICBDMjAuNTExNywxMS45MDIzLDIwLjI1NTksMTIsMjAsMTJ6IiBmaWxsPSIjRjVEODAzIi8+PC9nPjwvZz48Zz48cGF0aCBkPSJNMTQsMjVIN3YtNmMwLTAuNTUyNy0wLjQ0NzgtMS0xLTFzLTEsMC40NDczLTEsMXY3YzAsMC41NTI3LDAuNDQ3OCwxLDEsMWg4YzAuNTUyMiwwLDEtMC40NDczLDEtMSAgICBTMTQuNTUyMiwyNSwxNCwyNXoiIGZpbGw9IiMwMEFDQkEiLz48Zz48cGF0aCBkPSJNMTIsMjljLTAuMjU1OSwwLTAuNTExNy0wLjA5NzctMC43MDctMC4yOTNjLTAuMzkwNi0wLjM5MDYtMC4zOTA2LTEuMDIzNCwwLTEuNDE0MUwxMi41ODU5LDI2ICAgICBsLTEuMjkzLTEuMjkzYy0wLjM5MDYtMC4zOTA2LTAuMzkwNi0xLjAyMzQsMC0xLjQxNDFzMS4wMjM0LTAuMzkwNiwxLjQxNDEsMGwyLDJjMC4zOTA2LDAuMzkwNiwwLjM5MDYsMS4wMjM0LDAsMS40MTQxbC0yLDIgICAgIEMxMi41MTE3LDI4LjkwMjMsMTIuMjU1OSwyOSwxMiwyOXoiIGZpbGw9IiNGNUQ4MDMiLz48L2c+PC9nPjwvZz48ZyBpZD0iTGF5ZXJfNSIvPjxnIGlkPSJMYXllcl82Ii8+PGcgaWQ9IkxheWVyXzciLz48ZyBpZD0iTGF5ZXJfOCIvPjxnIGlkPSJMYXllcl85Ii8+PGcgaWQ9IkxheWVyXzEwIi8+PGcgaWQ9IkxheWVyXzExIi8+PGcgaWQ9IkxheWVyXzEyIi8+PGcgaWQ9IkxheWVyXzEzIi8+PGcgaWQ9IkxheWVyXzE0Ii8+PGcgaWQ9IkxheWVyXzE1Ii8+PGcgaWQ9IkxheWVyXzE2Ii8+PGcgaWQ9IkxheWVyXzE3Ii8+PGcgaWQ9IkxheWVyXzE4Ii8+PGcgaWQ9IkxheWVyXzE5Ii8+PGcgaWQ9IkxheWVyXzIwIi8+PGcgaWQ9IkxheWVyXzIxIi8+PGcgaWQ9IkxheWVyXzIyIi8+PGcgaWQ9IkxheWVyXzIzIi8+PGcgaWQ9IkxheWVyXzI0Ii8+PGcgaWQ9IkxheWVyXzI1Ii8+PGcgaWQ9IkxheWVyXzI2Ii8+PC9zdmc+',

}

let getUserByToken = async (token) => {
    // return {} //測試無法登入
    //'sys' 為開發捷徑（w-ui-loginout 於 localhost 自動帶入）。加環境守門：NODE_ENV==='production' 時不接受，
    //避免 srv.mjs 若作正式入口時 'sys' 成為遠端管理員後門。e2e/dev 未設 NODE_ENV=production 故仍可用；
    //正式部署設 NODE_ENV=production 即停用此捷徑（並應改提供真實 getUserByToken）。
    if (token === 'sys' && process.env.NODE_ENV !== 'production') {
        return { id: 'id-for-admin', name: '測試者', email: 'admin@example.com', isAdmin: 'y' }
    }
    //未設定 SSO app token 時(本機開發未接SSO), 不打SSO直接拒絕
    if (!ssoAppToken) {
        console.log('ssoAppToken 未設定, 略過 SSO 驗證')
        return {}
    }
    //呼叫 SSO 解析 token -> user
    try {
        let url = `${ssoBaseUrl}/api/getSsoUserInfor?token=${encodeURIComponent(ssoAppToken)}&key=token&value=${encodeURIComponent(token)}`
        let res = await axios.get(url)
        let state = get(res, 'data.state', '')
        let u = get(res, 'data.msg', null)
        if (state !== 'success' || !iseobj(u)) {
            console.log('SSO getSsoUserInfor 失敗', state)
            return {}
        }
        return { id: u.id, name: u.name, email: u.email, isAdmin: u.isAdmin }
    }
    catch (err) {
        console.log('SSO getSsoUserInfor error', err.message)
        return {}
    }
}

let verifyClientUser = (user, from) => {
    console.log('verifyClientUser/user', user)
    console.log('於生產環境時得加入限制瀏覽器使用者身份機制')
    // return false //測試無法登入
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

let verifyAppUser = (user, from) => {
    console.log('verifyAppUser/user', user)
    console.log('於生產環境時得加入限制應用程式使用者身份機制')
    // return false //測試無法登入
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

//WWebApi
let instWWebApi = WWebApi(WOrm, url, db, getUserByToken, verifyClientUser, verifyAppUser, opt)

instWWebApi.on('error', (err) => {
    console.log(err)
})


//node srv.mjs
