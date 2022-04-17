import map from 'lodash/map'
import keys from 'lodash/keys'
// import get from 'lodash/get'
import genID from 'wsemi/src/genID.mjs'
import dtmapping from 'wsemi/src/dtmapping.mjs'
import dtpick from 'wsemi/src/dtpick.mjs'
import nowms2str from 'wsemi/src/nowms2str.mjs'
import now2strp from 'wsemi/src/now2strp.mjs'
import isestr from 'wsemi/src/isestr'
import filePathToCode from '../../../server/filePathToCode.mjs'


let keyTable = 'apis'
let tableNameCht = 'APIs'
let tableNameEng = 'APIs'

let settings = {
    'id': {
        pk: true,
        name: '主鍵',
        type: 'STRING',
    },
    'order': {
        name: '順序',
        type: 'INTEGER',
    },
    'name': {
        name: '名稱',
        type: 'STRING',
    },
    'description': {
        name: '說明',
        type: 'TEXT',
    },
    'url': {
        name: '網址',
        type: 'STRING',
    },
    'method': {
        name: '方法',
        type: 'STRING',
    },
    'version': {
        name: '版本',
        type: 'STRING',
    },
    'levels': { //階層群組用英文句點「.」分隔
        name: '階層群組',
        type: 'STRING',
    },
    'keywords': {
        name: '關鍵字',
        type: 'STRING',
    },
    'state': {
        name: '狀態',
        type: 'STRING',
    },
    'creator': {
        name: '創建者',
        type: 'STRING',
    },
    'dataSource': {
        name: '資料提供者',
        type: 'STRING',
    },
    'tokens': { //多金鑰用分號分隔
        name: '金鑰',
        type: 'TEXT',
    },
    'mdInputParams': {
        name: '輸入參數md說明',
        type: 'STRING',
    },
    'inputExample': {
        name: '輸入範例',
        type: 'STRING',
    },
    'mdOutputParams': {
        name: '輸出資料md說明',
        type: 'STRING',
    },
    'outputExample': {
        name: '輸出範例',
        type: 'STRING',
    },
    'timeCreate': {
        name: '創建時間',
        type: 'STRING',
    },
    'timeUpdate': {
        name: '更新時間',
        type: 'STRING',
    },
    'isActive': {
        name: '是否有效',
        type: 'STRING',
    },
}

let funNew = (ndata = {}) => {
    let o = dtmapping(ndata, keys(settings))
    o.id = `${now2strp()}-${genID()}`
    o.timeCreate = nowms2str()
    o.timeUpdate = o.timeCreate
    o.isActive = 'y'
    return o
}

let funTest = () => {
    let rs = map([
        {
            'id': 'id-for-apis-sys-1',
            'name': '取得API清單',
            'description': 'API管理中心取得API清單資訊',
            'url': 'http://localhost:11005/getAPIsList',
            'method': 'get',
            'version': 'v1',
            'levels': 'API',
            'keywords': 'API;center',
            'state': 'ok',
            'creator': 'apis-system',
            'dataSource': 'apis-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-pets-1',
            'name': '取得寵物清單',
            'description': '寵物管理中心取得寵物清單資訊',
            'url': 'http://localhost:11005/getPetsList',
            'method': 'get',
            'version': 'v1',
            'levels': '寵物',
            'keywords': 'pets',
            'state': 'ok',
            'creator': 'pets-system',
            'dataSource': 'pets-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-pets-dogs-1',
            'name': '取得狗狗清單',
            'description': '取得狗狗清單資訊',
            'url': 'http://localhost:11005/getDogsList',
            'method': 'get',
            'version': 'v1',
            'levels': '寵物.狗狗',
            'keywords': 'pets;dogs',
            'state': 'ok',
            'creator': 'pets-system',
            'dataSource': 'pets-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-pets-dogs-2',
            'name': '新增狗狗資訊',
            'description': '新增狗狗資訊',
            'url': 'http://localhost:11005/addDog',
            'method': 'post',
            'version': 'v1',
            'levels': '寵物.狗狗',
            'keywords': 'pets;dogs',
            'state': 'ok',
            'creator': 'pets-system',
            'dataSource': 'pets-data',
            'mdInputParams': `### POST參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-pets-dogs-3',
            'name': '變更狗狗資訊',
            'description': '變更狗狗資訊',
            'url': 'http://localhost:11005/updateDog',
            'method': 'put',
            'version': 'v1',
            'levels': '寵物.狗狗',
            'keywords': 'pets;dogs',
            'state': 'ok',
            'creator': 'pets-system',
            'dataSource': 'pets-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-pets-dogs-4',
            'name': '刪除狗狗資訊',
            'description': '刪除狗狗資訊',
            'url': 'http://localhost:11005/deleteDog',
            'method': 'del',
            'version': 'v1',
            'levels': '寵物.狗狗',
            'keywords': 'pets;dogs',
            'state': 'ok',
            'creator': 'pets-system',
            'dataSource': 'pets-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-pets-cats-1',
            'name': '取得貓咪清單',
            'description': '取得貓咪清單資訊',
            'url': 'http://localhost:11005/getCatsList',
            'method': 'get',
            'version': 'v1',
            'levels': '寵物.貓咪',
            'keywords': 'pets;cats',
            'state': 'ok',
            'creator': 'pets-system',
            'dataSource': 'pets-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-pets-cats-2',
            'name': '新增貓咪資訊',
            'description': '新增貓咪資訊',
            'url': 'http://localhost:11005/addCat',
            'method': 'post',
            'version': 'v1',
            'levels': '寵物.貓咪',
            'keywords': 'pets;cats',
            'state': 'ok',
            'creator': 'pets-system',
            'dataSource': 'pets-data',
            'mdInputParams': `### POST參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-pets-cats-3',
            'name': '變更貓咪資訊',
            'description': '變更貓咪資訊',
            'url': 'http://localhost:11005/updateCat',
            'method': 'put',
            'version': 'v1',
            'levels': '寵物.貓咪',
            'keywords': 'pets;cats',
            'state': 'ok',
            'creator': 'pets-system',
            'dataSource': 'pets-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-pets-cats-4',
            'name': '刪除貓咪資訊',
            'description': '刪除貓咪資訊',
            'url': 'http://localhost:11005/deleteCat',
            'method': 'del',
            'version': 'v1',
            'levels': '寵物.貓咪',
            'keywords': 'pets;cats',
            'state': 'ok',
            'creator': 'pets-system',
            'dataSource': 'pets-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-vehicles-cars-1',
            'name': '取得汽車清單',
            'description': '取得汽車清單資訊',
            'url': 'http://localhost:11005/getcarsList',
            'method': 'get',
            'version': 'v1',
            'levels': '交通工具.汽車',
            'keywords': 'vehicles;cars',
            'state': 'ok',
            'creator': 'vehicles-system',
            'dataSource': 'vehicles-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-vehicles-cars-2',
            'name': '新增汽車資訊',
            'description': '新增汽車資訊',
            'url': 'http://localhost:11005/addDog',
            'method': 'post',
            'version': 'v1',
            'levels': '交通工具.汽車',
            'keywords': 'vehicles;cars',
            'state': 'ok',
            'creator': 'vehicles-system',
            'dataSource': 'vehicles-data',
            'mdInputParams': `### POST參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-vehicles-cars-3',
            'name': '變更汽車資訊',
            'description': '變更汽車資訊',
            'url': 'http://localhost:11005/updateDog',
            'method': 'put',
            'version': 'v1',
            'levels': '交通工具.汽車',
            'keywords': 'vehicles;cars',
            'state': 'ok',
            'creator': 'vehicles-system',
            'dataSource': 'vehicles-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
        {
            'id': 'id-for-apis-vehicles-cars-4',
            'name': '刪除汽車資訊',
            'description': '刪除汽車資訊',
            'url': 'http://localhost:11005/deleteDog',
            'method': 'del',
            'version': 'v1',
            'levels': '交通工具.汽車',
            'keywords': 'vehicles;cars',
            'state': 'ok',
            'creator': 'vehicles-system',
            'dataSource': 'vehicles-data',
            'mdInputParams': `### GET網址參數
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| token | STRING | key-for-token |
| id | STRING | id-for-test |
| paramA | INTEGER | 123 |
| paramB | DOUBLE | 123.456 |
            `,
            'inputExample': `http://localhost:11005/getAPIsList?token={token}&id={id}&paramA=123&paramB=123.456`,
            'mdOutputParams': `### 回傳數據欄位: Array of objects
| 參數 | 型別 | 範例 |
| -- | -- | -- |
| id | STRING | id-for-test |
| weight | DOUBLE | 12.3 |
| color | STRING | #f26 |
| paramA | INTEGER | 321 |
| paramB | DOUBLE | 654.321 |
| paramC | STRING | ${filePathToCode('C:\\\\pj\\abc\\filename.pdf')} |
            `,
            'outputExample': `
[
    {
        "id": "id-for-test-1",
        "weight": 12.3,
        "color": "#f26",
        "paramA": 101,
        "paramB": 0.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename1.pdf"
    },
    {
        "id": "id-for-test-2",
        "weight": 22.3,
        "color": "#2f6",
        "paramA": 102,
        "paramB": 1.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename2.pdf"
    },
    {
        "id": "id-for-test-3",
        "weight": 32.3,
        "color": "#26f",
        "paramA": 103,
        "paramB": 2.01,
        "paramC": "C:\\\\\\\\pj\\\\abc\\\\filename3.pdf"
    }
]
            `,
        },
    ], (item, k) => {
        let v = funNew({ ...item, order: k })
        v.id = item.id
        if (isestr(item.timeUpdate)) {
            v.timeUpdate = item.timeUpdate
        }
        v = dtpick(v, keys(settings))
        return v
    })
    console.log(`已產生: {keyTable} 測試資料`, rs)
    return rs
}

let tab = {
    keyTable,
    tableNameCht,
    tableNameEng,
    settings,
    funNew,
    funTest,
}


export default tab
