import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
import WWebApi from './server/WWebApi.mjs'
import { pickErrName, pickErrCode } from './server/maskLog.mjs'
import getSettings from './g_getSettings.mjs'
import get from 'lodash-es/get.js'
import iseobj from 'wsemi/src/iseobj.mjs'
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

    serverPort: get(stApp, 'serverPort', 11005), //須為 1–65535 之整數, 無效即建構拋錯(R-ORM-2, ADR-038)
    subfolder: '', //mapi
    urlRedirect: ssoLoginUrl, //未登入時導向SSO登入頁, 本機測試時得先編譯, 再瀏覽: http://localhost:11005/

    //語系（來自 settings.json）：language 由 WWebApi 注入 index.html ({language}) → 初始畫面即此語系；
    //showLanguage 控右上語系選單顯隱。e2e 可用 restartBackend(genTempSettings({language})) 改 server 初始語系。
    showLanguage: get(stApp, 'showLanguage', 'y'),
    language: get(stApp, 'language', 'eng'),

    //log 資料夾與輪檔間隔（srLog 寫入 + staEvent 統計皆讀此）。e2e 可用 genTempSettings({logFd}) 指向合成 log 達 hermetic。
    logFd: get(stApp, 'logFd', './logs'),
    logInterval: get(stApp, 'logInterval', 'hr'),
    logNumKeep: get(stApp, 'logNumKeep', null), //null=未給, srLog 採 w-syslog 預設; 給非正整數則 srLog 啟動即 throw (fail-fast)

    //外部列受保護(原則 5, ADR-044): 後台是否不得動外部列(srcKey 非空)與外部管理之 group, 預設 'y'; 給 'n' 回到升版前行為。e2e 可用 restartBackend(genTempSettings({lockExternalRows:'n'}))
    lockExternalRows: get(stApp, 'lockExternalRows', 'y'),

    //測試分頁代發請求之目標位址政策(P1, ADR-049): 預設拒絕內網與本機位址; proxyAllowInternal 'y' 整體關閉此拒絕, proxyAllowList(IP／CIDR／主機名)只放寬所列者。
    //e2e/api 測試之代發目標為本機 echo server, 以 restartBackend(genTempSettings({ proxyAllowList: ['127.0.0.1'] })) 放行; settings.json 之預設不放行
    proxyAllowInternal: get(stApp, 'proxyAllowInternal', 'n'),
    proxyAllowList: get(stApp, 'proxyAllowList', []),

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
    //避免 srv.mjs 若作正式入口時 'sys' 成為遠端系統管理者後門。e2e/dev 未設 NODE_ENV=production 故仍可用；
    //正式部署設 NODE_ENV=production 即停用此捷徑（並應改提供真實 getUserByToken）。
    if (token === 'sys' && process.env.NODE_ENV !== 'production') {
        return { id: 'id-for-admin', name: '測試者', email: 'admin@example.com', isAdmin: 'y' }
    }
    //測試權杖（比照 'sys' 以 NODE_ENV 守門, 正式部署不生效）: 供 test/api-tokenLeak.test.mjs 重現「注入函數上游失敗」(ADR-033)。
    //'{token-for-reject}': 以舊版 w-web-sso helper 失敗時之 reject 形狀(字串內夾完整網址、合成之介接權杖與所送權杖)拒絕, 驗上游失敗視同查無且不外洩
    if (token === '{token-for-reject}' && process.env.NODE_ENV !== 'production') {
        return Promise.reject(`can not get user data by url[http://127.0.0.1:11007/api/getSsoUserInfor?token=SYNTH-SYS-SECRET-FOR-TEST&key=token&value=${token}]`)
    }
    //'{token-for-verify-throw}': 回合法系統管理者使用者, 但 verifyClientUser / verifyAppUser 對其 throw(見下), 驗 verify 系拋錯視同無權限且不外洩
    if (token === '{token-for-verify-throw}' && process.env.NODE_ENV !== 'production') {
        return { id: 'id-for-verify-throw', name: 'verify-throw', email: 'verify-throw@example.com', isAdmin: 'y' }
    }
    //'{token-for-nonadmin}': 回合法之一般使用者(isAdmin 'n'), 供 e2e 與手動驗證「非系統管理者進不了後台、只能取 API 清單」(R-ADMINONLY-01, R-PUBLICAPIS-01); 同樣以 NODE_ENV 守門, 正式部署不生效
    if (token === '{token-for-nonadmin}' && process.env.NODE_ENV !== 'production') {
        return { id: 'id-for-nonadmin', name: '一般使用者', email: 'user@example.com', isAdmin: 'n' }
    }
    //未設定 SSO app token 時(本機開發未接SSO), 不打SSO直接拒絕
    if (!ssoAppToken) {
        console.log('ssoAppToken 未設定, 略過 SSO 驗證')
        return {}
    }
    //呼叫 SSO 解析 token -> user
    try {
        let url = `${ssoBaseUrl}/api/getSsoUserInfor?token=${encodeURIComponent(ssoAppToken)}&key=token&value=${encodeURIComponent(token)}`
        let res = await fetch(url) //Node 內建 fetch（改造前 axios）；非 2xx 視同失敗
        if (!res.ok) {
            console.log('SSO getSsoUserInfor HTTP', res.status)
            return {}
        }
        let data = await res.json()
        let state = get(data, 'state', '')
        let u = get(data, 'msg', null)
        if (state !== 'success' || !iseobj(u)) {
            console.log('SSO getSsoUserInfor 失敗', state)
            return {}
        }
        return { id: u.id, name: u.name, email: u.email, isAdmin: u.isAdmin }
    }
    catch (err) {
        //只印 err.name 與 cause.code（名稱／代碼形狀才印）: fetch 例外之 message 可能含完整網址, 而網址內有 ssoAppToken 與使用者 token(ADR-033)
        console.log('SSO getSsoUserInfor error', pickErrName(err), pickErrCode(err))
        return {}
    }
}

let verifyClientUser = (user, from) => {
    //測試權杖 '{token-for-verify-throw}' 之使用者: 模擬部署方 verify 函數拋錯(訊息夾合成秘密), 僅非 production(ADR-033)
    if (get(user, 'id') === 'id-for-verify-throw' && process.env.NODE_ENV !== 'production') {
        throw new Error('SYNTH-VERIFY-SECRET-FOR-TEST')
    }
    //from: 入口名——'getUserByToken'(登入檢查)、'getApisList'(一般使用者以 token 取 API 清單)、'main'(資料通道，每個請求都會呼叫，故此處不逐次印使用者)、'upload-controller'|'upload-slice'|'download-get-filename'|'download-get-file'|'download'(其餘路由，本套件未啟用上傳下載)
    //於生產環境時得加入限制瀏覽器使用者身份機制（政策屬部署方；瀏覽端之登入檢查與資料通道連線閘皆呼叫本函數，ADR-048；外部應用入口 POST /syncAndReplaceTabs 走 verifyAppUser）
    //本套件已自行限制後台('getUserByToken')與資料通道('main' 等)只限系統管理者(getUserByToken 所回 isAdmin 為 'y'; 檢查在本函數之後, 本函數只能再收緊), 此處不再以 isAdmin 判斷, 只示範依 from 收緊: 其餘入口預設拒絕(R-ADMINONLY-01, ADR-051)
    // return false //測試無法登入
    return from === 'getUserByToken' || from === 'getApisList' || from === 'main'
}

let verifyAppUser = (user, from) => {
    //測試權杖 '{token-for-verify-throw}' 之使用者: 同 verifyClientUser(ADR-033)
    if (get(user, 'id') === 'id-for-verify-throw' && process.env.NODE_ENV !== 'production') {
        throw new Error('SYNTH-VERIFY-SECRET-FOR-TEST')
    }
    //本套件已自行要求應用系統路由之呼叫者為系統管理者等級(getUserByToken 所回 isAdmin 為 'y'; 檢查在本函數之後, 本函數只能再收緊), 此處不再以 isAdmin 判斷, 只示範依 from 收緊(目前只有 'syncAndReplaceTabs')
    console.log('verifyAppUser/user', user)
    console.log('於生產環境時得加入限制應用程式使用者身份機制')
    // return false //測試無法登入
    return from === 'syncAndReplaceTabs'
}

//WWebApi
let instWWebApi = WWebApi(WOrm, url, db, getUserByToken, verifyClientUser, verifyAppUser, opt)

instWWebApi.on('error', (err) => {
    console.log(err)
})

//行程層錯誤政策(R-PROC-1, ADR-038): 本參考部署與 WWebApi 皆不註冊 process 之 unhandledRejection / uncaughtException 監聽
//(w-serv-hapi 1.1.6 起亦不代為註冊), 未處理之 rejection 依 Node 預設終止行程; 正式部署宜交行程管理器(如 PM2、systemd)自動重啟.
//需優雅關機時呼叫 instWWebApi.stop(): 停止伺服器並釋放快取計時器、資料庫連線與 log worker(R-RES-1)


//node srv.mjs
