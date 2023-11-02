import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs' //自行選擇引用ORM, 使用Mongodb測試
import WWebApi from './server/WWebApi.mjs'
import getSettings from './g.getSettings.mjs'


//st
let st = getSettings()

let url = `mongodb://${st.dbUsername}:${st.dbPassword}@${st.dbIP}:${st.dbPort}` //使用Mongodb測試
let db = st.dbName
let opt = {

    bCheckUser: false,
    getUserById: null,
    bExcludeWhenNotAdmin: false,

    serverPort: 11005,
    subfolder: '', //mapi
    urlRedirect: 'https://www.google.com/', //本機測試時得先編譯, 再瀏覽: http://localhost:11005/

    webName: {
        'eng': 'API Service',
        'cht': 'API管理系統',
    },
    webDescription: {
        'eng': 'A web service package as methods to send requests to and receive responses from an API.',
        'cht': 'A web service package as methods to send requests to and receive responses from an API.',
    },
    webLogo: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjwhRE9DVFlQRSBzdmcgIFBVQkxJQyAnLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4nICAnaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkJz48c3ZnIGVuYWJsZS1iYWNrZ3JvdW5kPSJuZXcgMCAwIDMyIDMyIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+PGcgaWQ9IkxheWVyXzIiLz48ZyBpZD0iTGF5ZXJfMyIvPjxnIGlkPSJMYXllcl80Ij48Zz48cGF0aCBkPSJNOS4wMiw2QzkuMDEyNyw2LDkuMDA2OCw1Ljk5OSw5LDZIMkMxLjQ0NzgsNiwxLDUuNTUyNywxLDVWMmMwLTAuNTUyNywwLjQ0NzgtMSwxLTFoNiAgICBjMC40MzA3LDAsMC44MTI1LDAuMjc1NCwwLjk0ODcsMC42ODM2bDAuOTQwNCwyLjgyMTNDOS45NzIyLDQuNjUxNCwxMC4wMiw0LjgyMDMsMTAuMDIsNUMxMC4wMiw1LjU1MjcsOS41NzIzLDYsOS4wMiw2eiBNMyw0ICAgIGg0LjYxMjhMNy4yNzkzLDNIM1Y0eiIgZmlsbD0iI0Y1RDgwMyIvPjwvZz48Zz48cGF0aCBkPSJNMjQuMDE5NSwyMmMtMC4wMDM5LDAtMC4wMTE3LDAuMDAxLTAuMDE5NSwwaC03Yy0wLjU1MjIsMC0xLTAuNDQ3My0xLTF2LTNjMC0wLjU1MjcsMC40NDc4LTEsMS0xaDYgICAgYzAuNDMwNywwLDAuODEyNSwwLjI3NTQsMC45NDgyLDAuNjgzNmwwLjk0MDQsMi44MjEzYzAuMDg0LDAuMTQ2NSwwLjEzMDksMC4zMTU0LDAuMTMwOSwwLjQ5NTEgICAgQzI1LjAxOTUsMjEuNTUyNywyNC41NzIzLDIyLDI0LjAxOTUsMjJ6IE0xOCwyMGg0LjYxMjNsLTAuMzMzLTFIMThWMjB6IiBmaWxsPSIjRjVEODAzIi8+PC9nPjxnPjxwYXRoIGQ9Ik0xNSwxNUgyYy0wLjU1MjIsMC0xLTAuNDQ3My0xLTFWNWMwLTAuNTUyNywwLjQ0NzgtMSwxLTFoMTNjMC41NTIyLDAsMSwwLjQ0NzMsMSwxdjkgICAgQzE2LDE0LjU1MjcsMTUuNTUyMiwxNSwxNSwxNXogTTMsMTNoMTFWNkgzVjEzeiIgZmlsbD0iIzAxODFCMCIvPjwvZz48Zz48cGF0aCBkPSJNMzAsMzFIMTdjLTAuNTUyMiwwLTEtMC40NDczLTEtMXYtOWMwLTAuNTUyNywwLjQ0NzgtMSwxLTFoMTNjMC41NTI3LDAsMSwwLjQ0NzMsMSwxdjkgICAgQzMxLDMwLjU1MjcsMzAuNTUyNywzMSwzMCwzMXogTTE4LDI5aDExdi03SDE4VjI5eiIgZmlsbD0iIzAxODFCMCIvPjwvZz48Zz48cGF0aCBkPSJNMjYsOGgtOGMtMC41NTI3LDAtMSwwLjQ0NzMtMSwxczAuNDQ3MywxLDEsMWg3djZjMCwwLjU1MjcsMC40NDczLDEsMSwxczEtMC40NDczLDEtMVY5ICAgIEMyNyw4LjQ0NzMsMjYuNTUyNyw4LDI2LDh6IiBmaWxsPSIjMDBBQ0JBIi8+PGc+PHBhdGggZD0iTTIwLDEyYy0wLjI1NTksMC0wLjUxMTctMC4wOTc3LTAuNzA3LTAuMjkzbC0yLTJjLTAuMzkwNi0wLjM5MDYtMC4zOTA2LTEuMDIzNCwwLTEuNDE0MWwyLTIgICAgIGMwLjM5MDYtMC4zOTA2LDEuMDIzNC0wLjM5MDYsMS40MTQxLDBzMC4zOTA2LDEuMDIzNCwwLDEuNDE0MUwxOS40MTQxLDlsMS4yOTMsMS4yOTNjMC4zOTA2LDAuMzkwNiwwLjM5MDYsMS4wMjM0LDAsMS40MTQxICAgICBDMjAuNTExNywxMS45MDIzLDIwLjI1NTksMTIsMjAsMTJ6IiBmaWxsPSIjRjVEODAzIi8+PC9nPjwvZz48Zz48cGF0aCBkPSJNMTQsMjVIN3YtNmMwLTAuNTUyNy0wLjQ0NzgtMS0xLTFzLTEsMC40NDczLTEsMXY3YzAsMC41NTI3LDAuNDQ3OCwxLDEsMWg4YzAuNTUyMiwwLDEtMC40NDczLDEtMSAgICBTMTQuNTUyMiwyNSwxNCwyNXoiIGZpbGw9IiMwMEFDQkEiLz48Zz48cGF0aCBkPSJNMTIsMjljLTAuMjU1OSwwLTAuNTExNy0wLjA5NzctMC43MDctMC4yOTNjLTAuMzkwNi0wLjM5MDYtMC4zOTA2LTEuMDIzNCwwLTEuNDE0MUwxMi41ODU5LDI2ICAgICBsLTEuMjkzLTEuMjkzYy0wLjM5MDYtMC4zOTA2LTAuMzkwNi0xLjAyMzQsMC0xLjQxNDFzMS4wMjM0LTAuMzkwNiwxLjQxNDEsMGwyLDJjMC4zOTA2LDAuMzkwNiwwLjM5MDYsMS4wMjM0LDAsMS40MTQxbC0yLDIgICAgIEMxMi41MTE3LDI4LjkwMjMsMTIuMjU1OSwyOSwxMiwyOXoiIGZpbGw9IiNGNUQ4MDMiLz48L2c+PC9nPjwvZz48ZyBpZD0iTGF5ZXJfNSIvPjxnIGlkPSJMYXllcl82Ii8+PGcgaWQ9IkxheWVyXzciLz48ZyBpZD0iTGF5ZXJfOCIvPjxnIGlkPSJMYXllcl85Ii8+PGcgaWQ9IkxheWVyXzEwIi8+PGcgaWQ9IkxheWVyXzExIi8+PGcgaWQ9IkxheWVyXzEyIi8+PGcgaWQ9IkxheWVyXzEzIi8+PGcgaWQ9IkxheWVyXzE0Ii8+PGcgaWQ9IkxheWVyXzE1Ii8+PGcgaWQ9IkxheWVyXzE2Ii8+PGcgaWQ9IkxheWVyXzE3Ii8+PGcgaWQ9IkxheWVyXzE4Ii8+PGcgaWQ9IkxheWVyXzE5Ii8+PGcgaWQ9IkxheWVyXzIwIi8+PGcgaWQ9IkxheWVyXzIxIi8+PGcgaWQ9IkxheWVyXzIyIi8+PGcgaWQ9IkxheWVyXzIzIi8+PGcgaWQ9IkxheWVyXzI0Ii8+PGcgaWQ9IkxheWVyXzI1Ii8+PGcgaWQ9IkxheWVyXzI2Ii8+PC9zdmc+',

}

let getUserByToken = async (token) => {
    // return {} //測試無法登入
    if (token === '{token-for-application}') { //提供外部應用系統作為存取使用者
        return {
            id: 'id-for-application',
            name: 'application',
            email: 'application@example.com',
            isAdmin: 'y',
        }
    }
    if (token === 'sys') { //開發階段w-ui-loginout自動給予browser使用者(且位於localhost)的token為sys
        return {
            id: 'id-for-admin',
            name: '測試者',
            email: 'admin@example.com',
            isAdmin: 'y',
        }
    }
    console.log('invalid token', token)
    console.log('於生產環境時得加入SSO等驗證token機制')
    return {}
}

let verifyUser = (user) => {
    // return false //測試無法登入
    console.log('於生產環境時得加入驗證user機制')
    return user.isAdmin === 'y' //測試僅系統管理者使用
}

//WWebApi
let instWWebApi = WWebApi(WOrm, url, db, getUserByToken, verifyUser, opt)

instWWebApi.on('error', (err) => {
    console.log(err)
})


//node --experimental-modules --es-module-specifier-resolution=node srv.mjs
