import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import pmKeyMutex from 'wsemi/src/pmKeyMutex.mjs'


function procApis(deps = {}) {

    //deps
    //lockSave: 後端雙擊防護(依使用者占位, 見 lockSave.mjs, ADR-034), 由 WWebApi 建立並注入(與 procProxy 共用同一 cacheSt);
    //為 saveApi / deleteApi 之必要依賴, 未注入時該二者以 TypeError reject 而不執行寫入(fail-closed)
    let { woItems, procOrm, ds, lockSave } = deps

    //kmx: 同 key 之寫入序列化(不同使用者對同一列之並發; 同一使用者之重送先由外層 lockSave 拒絕, ADR-034)
    //  key: 既有筆 `saveApi:<id>` / `deleteApi:<id>`; 新增筆無 id 以 `saveApi:new:<name>` 占位 (不同使用者同名並發新增仍依序各插入一列: 本系統不以名稱為唯一鍵)
    let kmx = pmKeyMutex()


    let getApisList = async (userId) => {
        //經 procOrm（與 save／del 同一入口）而非直呼 woItems：ORM 層政策——useCheckUser 之使用者檢核、
        //useExcludeWhenNotAdmin 非管理員濾 isActive='n'、擴充之前後處理——才會一併套到讀取；改造前直呼 woItems 全數繞過
        return await procOrm(userId, 'apis', 'select', {})
    }


    let saveApi = async (userId, row) => {

        //check（reject err-key，由前端依 lang 反查顯示；邊界 kpFunExt 會 srLog 此 key）
        if (!iseobj(row)) {
            return Promise.reject('errApiRowInvalid')
        }

        //key
        let key = isestr(row.id) ? `saveApi:${row.id}` : `saveApi:new:${String(row.name || '')}`

        //雙擊防護(後端): 同一使用者之儲存處理中再送出即 reject 'saveInProgress', 不排隊——新增列每次 funNew 產新 id,
        //排隊後第 2 次會再插入一列(重複列); 包在 kmx 之外層 (ADR-034)
        return lockSave('saveApi', userId, () => {
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
        })
    }


    let deleteApi = async (userId, id) => {

        //check（reject err-key，由前端依 lang 反查顯示）
        if (!isestr(id)) {
            return Promise.reject('errApiIdInvalid')
        }

        //雙擊防護(後端): 同一使用者之刪除處理中再送出即 reject 'deleteInProgress'(不排隊); 包在 kmx 之外層 (ADR-034)
        return lockSave('deleteApi', userId, () => {
            return kmx(`deleteApi:${id}`, async () => {
                let r = await procOrm(userId, 'apis', 'del', { id })
                return r
            })
        }, { errKey: 'deleteInProgress' })
    }


    return {
        getApisList,
        saveApi,
        deleteApi,
    }
}


export default procApis
