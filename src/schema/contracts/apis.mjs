//apis 表之寫入契約(多人同時編輯, 原則 10; 規格 C:\opensrcOper\dspec\多人同時編輯之寫入契約.md 第 3、4 節)與外部匯入之欄位歸屬(原則 11; 規格 外部匯入之定義與機制.md 第 4 節)。
//前後端 import 同一檔: 前端以 buildBaseline 對畫面所見之列自算基準, 後端於表鎖內以新鮮讀取重算比對; 後端存檔以 pickWriteRow 只寫白名單欄位。
//置於 src/schema/contracts/ 而非 src/schema/tables/, 避免 gi.mjs 之 genIndex 掃入而被當成資料表。
//契約依 sgud/rule/rulebook_concurrency.md 之盤點表(每欄三分類)產出; 欄位增減時 test/unit-contract.test.mjs 強迫重新分類。


//外部擁有: 由外部匯入(provideTabs → POST /syncAndReplaceTabs)提供, 匯入時依批次寫入(批次缺該欄視為空值); 同時是後台可編輯之客戶端欄位
//group 為來源範圍(匯入時等於請求之 group); order 由外部給予
let fieldsExternal = [
    'order',
    'name',
    'description',
    'url',
    'method',
    'version',
    'group',
    'levels',
    'keywords',
    'state',
    'creator',
    'dataSource',
    'mdInputParams',
    'inputExample',
    'mdOutputParams',
    'outputExample',
]


//本系統擁有: 由本站編輯表單管理, 外部匯入一律不寫(即使批次帶了也忽略); 新增列初始為空字串。ADR-031, R-IMPORT-01
let fieldsLocal = [
    'tokens',
    'testBaseUrl',
    'authType',
    'authConfigJson',
    'defaultHeadersJson',
    'defaultQueryJson',
    'defaultBodyJson',
    'contentType',
]


//伺服器專有: 不入基準, 存檔不採用客戶端值(保留庫內值)
//timeCreate 只於新增時由伺服器寫; timeUpdate、userIdUpdate 由 procOrm 寫; isActive 為系統欄位; srcKey 為匯入之來源鍵(身分欄, 後台不可改)
let fieldsServerOnly = [
    'timeCreate',
    'timeUpdate',
    'isActive',
    'userIdUpdate',
    'srcKey',
]


//fields: 入基準之欄位(白名單)＝存檔採用客戶端值之欄位, 依 schema 宣告序
//不設 orderKey: order 可由表單直接編輯且存檔不依列序重編, 屬一般欄位(其值入基準)
//不設 scope: 逐列存檔之基準只含該列; 外部匯入不帶基準, 不需要範圍
let fields = [
    'order',
    'name',
    'description',
    'url',
    'method',
    'version',
    'group',
    'levels',
    'keywords',
    'state',
    'creator',
    'dataSource',
    'tokens',
    'mdInputParams',
    'inputExample',
    'mdOutputParams',
    'outputExample',
    'testBaseUrl',
    'authType',
    'authConfigJson',
    'defaultHeadersJson',
    'defaultQueryJson',
    'defaultBodyJson',
    'contentType',
]


let contract = {
    table: 'apis',
    pk: 'id',
    fields,
    serverOnly: fieldsServerOnly,
}


export { fieldsExternal, fieldsLocal, fieldsServerOnly }
export default contract
