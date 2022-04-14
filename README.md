# w-web-api
An operator for orm in server.

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
> **Note:** `w-web-api` is mainly dependent on `lodash` and `wsemi`.

```alias
npm i w-web-api
```

#### Example for server:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-web-api/blob/master/srv.mjs)]
```alias
import WOrm from 'w-orm-mongodb/src/WOrmMongodb.mjs' //自行選擇引用ORM, 使用Mongodb測試
import getSettings from './server/getSettings.mjs'
import WWebApi from './server/WWebApi.mjs'


//st
let st = getSettings()

let url = `mongodb://${st.dbUsername}:${st.dbPassword}@${st.dbIP}:${st.dbPort}` //使用Mongodb測試
let db = st.dbName
let opt = {

    getUserById: null,
    bCheckUser: false,
    bExcludeWhenNotAdmin: false,

    serverPort: 11005,

    webName: {
        'eng': 'API Service',
        'cht': 'API管理系統'
    },

}

//WWebApi
WWebApi(WOrm, url, db, opt)
    .catch((err) => {
        console.log(err)
    })

```
