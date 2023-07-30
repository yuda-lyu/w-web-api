# w-web-api
A web service for APIs.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-web-api.svg?style=flat)](https://npmjs.org/package/w-web-api) 
[![license](https://img.shields.io/npm/l/w-web-api.svg?style=flat)](https://npmjs.org/package/w-web-api) 
[![gzip file size](http://img.badgesize.io/yuda-lyu/w-web-api/master/dist/w-web-api-server.umd.js.svg?compression=gzip)](https://github.com/yuda-lyu/w-web-api)
[![npm download](https://img.shields.io/npm/dt/w-web-api.svg)](https://npmjs.org/package/w-web-api) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-web-api.svg)](https://www.jsdelivr.com/package/npm/w-web-api)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-web-api/WWebApi.html).

## Installation
### Using npm(ES6 module):
```alias
npm i w-web-api
```

#### Example for server:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-web-api/blob/master/srv.mjs)]
```alias
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

    webName: {
        'eng': 'API Service',
        'cht': 'API管理系統',
    },
    webDescription: {
        'eng': 'A web service package as methods to send requests to and receive responses from an API.',
        'cht': 'A web service package as methods to send requests to and receive responses from an API.',
    },
    webLogo: '{base64 img}',

}

let getUserByToken = (token) => {
    console.log('getUserByToken token', token)
    // return {} //測試無法登入條件
    if (token !== 'sys') {
        return {}
    }
    return {
        id: 'id-for-admin',
        name: '測試者',
        email: 'admin@example.com',
        isAdmin: 'y',
    }
}

let verifyUser = (user) => {
    return user.isAdmin === 'y'
}

//WWebApi
let instWWebApi = WWebApi(WOrm, url, db, getUserByToken, verifyUser, opt)

instWWebApi.on('error', (err) => {
    console.log(err)
})

```
