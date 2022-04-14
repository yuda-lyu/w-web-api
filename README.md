# w-serv-api
An operator for orm in server.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-serv-api.svg?style=flat)](https://npmjs.org/package/w-serv-api) 
[![license](https://img.shields.io/npm/l/w-serv-api.svg?style=flat)](https://npmjs.org/package/w-serv-api) 
[![gzip file size](http://img.badgesize.io/yuda-lyu/w-serv-api/master/dist/w-serv-api-server.umd.js.svg?compression=gzip)](https://github.com/yuda-lyu/w-serv-api)
[![npm download](https://img.shields.io/npm/dt/w-serv-api.svg)](https://npmjs.org/package/w-serv-api) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-serv-api.svg)](https://www.jsdelivr.com/package/npm/w-serv-api)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-serv-api/WServApi.html).

## Installation
### Using npm(ES6 module):
> **Note:** `w-serv-api` is mainly dependent on `lodash` and `wsemi`.

```alias
npm i w-serv-api
```

#### Example for server:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-serv-api/blob/master/g.mOrm.mjs)]
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
WWebApi(url, db, WOrm, opt)
    .catch((err) => {
        console.log(err)
    })

```
