// import path from 'path'
// import fs from 'fs'
// import JSON5 from 'json5'


function getSettings() {
    return {
        // 'dbUsername': 'username',
        // 'dbPassword': 'password',
        // 'dbName': 'wapis',
        // 'dbIP': '127.0.0.1',
        // 'dbPort': 27017,
        'dbUrl': './db',
        'dbName': 'wapis',
        'ssoBaseUrl': 'http://localhost:11007',
        'ssoAppToken': '', //部署時填入SSO tokens表中isApp=y的app token
        'ssoLoginUrl': 'http://localhost:11007/', //未登入時導向之SSO登入頁
    }
}


export default getSettings
