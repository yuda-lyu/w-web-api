import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'


function procApis(deps = {}) {

    //deps
    let { woItems, procOrm, ds } = deps


    let getApisList = async (userId) => {
        return await woItems.apis.select({})
    }


    let saveApi = async (userId, row) => {

        //check（reject err-key，由前端依 lang 反查顯示；邊界 kpFunExt 會 srLog 此 key）
        if (!iseobj(row)) {
            return Promise.reject('errApiRowInvalid')
        }

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
    }


    let deleteApi = async (userId, id) => {

        //check（reject err-key，由前端依 lang 反查顯示）
        if (!isestr(id)) {
            return Promise.reject('errApiIdInvalid')
        }

        let r = await procOrm(userId, 'apis', 'del', { id })

        return r
    }


    return {
        getApisList,
        saveApi,
        deleteApi,
    }
}


export default procApis
