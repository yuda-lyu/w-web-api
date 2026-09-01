import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import pmKeyMutex from 'wsemi/src/pmKeyMutex.mjs'


function procApis(deps = {}) {

    //deps
    let { woItems, procOrm, ds } = deps

    //kmx: 後端層雙擊 / 並發防護 (CLAUDE.md 三層防護之第 3 層): 同 key 之寫入序列化, 防 API 直打 / e2e race 繞過前端
    //  key: 既有筆 `saveApi:<id>` / `deleteApi:<id>`; 新增筆無 id 以 `saveApi:new:<name>` 占位 (同名並發新增第 2 次仍序列化執行, 由呼叫端 / 後續唯一性檢查決定是否拒絕)
    let kmx = pmKeyMutex()


    let getApisList = async (userId) => {
        return await woItems.apis.select({})
    }


    let saveApi = async (userId, row) => {

        //check（reject err-key，由前端依 lang 反查顯示；邊界 kpFunExt 會 srLog 此 key）
        if (!iseobj(row)) {
            return Promise.reject('errApiRowInvalid')
        }

        //key
        let key = isestr(row.id) ? `saveApi:${row.id}` : `saveApi:new:${String(row.name || '')}`

        return kmx(key, async () => {

            //正規化：funNew 配 id/時間/預設並過濾欄位
            let o = ds.apis.funNew(row)

            //保留原 id 與創建時間（既有筆）
            if (isestr(row.id)) {
                o.id = row.id
                if (isestr(row.timeCreate)) {
                    o.timeCreate = row.timeCreate
                }
            }

            //save
            let r = await procOrm(userId, 'apis', 'save', [o])

            return r
        })
    }


    let deleteApi = async (userId, id) => {

        //check（reject err-key，由前端依 lang 反查顯示）
        if (!isestr(id)) {
            return Promise.reject('errApiIdInvalid')
        }

        return kmx(`deleteApi:${id}`, async () => {
            let r = await procOrm(userId, 'apis', 'del', { id })
            return r
        })
    }


    return {
        getApisList,
        saveApi,
        deleteApi,
    }
}


export default procApis
