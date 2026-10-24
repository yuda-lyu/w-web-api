import isPlainObject from 'lodash-es/isPlainObject.js'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import { pickWriteRow, getRejectKey } from 'w-serv-orm/src/baseline.mjs'
import { ormFail } from './ormErrKey.mjs'
import pickPublicRows from './pickPublicApis.mjs'
import contractDef from '../src/schema/contracts/apis.mjs'
import { isExternalRow, normGroup, isValidGroupValue, pickLocalFields, getExternalGroups, isBlockedByExternalGroup, getExternalChanged } from '../src/schema/contracts/externalRows.mjs'


//多人同時編輯之拒收鍵(w-serv-orm baseline.mjs 之固定英文鍵) → 本套件語系鍵(procLang); 一律提示重新載入(規格第6節)
//baselineMismatch: 持舊畫面存檔(先動先贏); rowNotFound: 修改或刪除時該列已不存在(已被他人刪除); baselineFormat: 基準格式或版本不識(不得降級為不帶基準)
//外部列受保護(原則 5; ADR-044)之拒收鍵為本套件自產之語系鍵(寫入階段以字串 reject), 原樣轉出:
//  saveExternalRowChanged: 修改外部列之身分欄(group、srcKey)或外部擁有欄位; deleteExternalRowDenied: 刪除外部列; saveExternalGroupDenied: 在外部管理之 group 新增列或把列改入該 group
let kpRejectKey = {
    baselineMismatch: 'saveStale',
    rowNotFound: 'errApiRowNotFound',
    baselineFormat: 'errBaselineFormat',
    saveExternalRowChanged: 'saveExternalRowChanged',
    deleteExternalRowDenied: 'deleteExternalRowDenied',
    saveExternalGroupDenied: 'saveExternalGroupDenied',
}


function procApis(deps = {}) {

    //deps
    //lockSave: 後端雙擊防護(依使用者占位, 見 lockSave.mjs, ADR-034), 由 WWebApi 建立並注入(與 procProxy 共用同一 cacheSt);
    //withTabLocks, guardWrite: w-serv-orm 1.1.17 的每表一鍵表鎖(多人同時編輯規格第7節), 取自 WServOrm 回傳物件, 與外部匯入(syncApis.mjs)共用同一實例之同一把鎖;
    //為 saveApi / deleteApi 之必要依賴, 未注入時該二者以 TypeError reject 而不執行寫入(fail-closed)
    //層次: lockSave(依使用者占位, 同人重送先被拒)在外, 表鎖在內: lockSave → withTabLocks／guardWrite → ORM; 不得在 guardWrite 之 write 內再取 apis 鎖(鎖不可重入)
    //srLog: procOrm 失敗時記原文(R-ERR-1, ADR-038); 未注入時不記錄, 仍回語系鍵
    //contract: 寫入契約, 預設取 src/schema/contracts/apis.mjs(前後端同一份)
    //lockExternalRows: 後台是否不得動外部列(srcKey 非空者)與外部管理之 group(預設 true, 僅 false 關閉回到 run01 行為; WWebApi 由 opt.lockExternalRows 轉入; ADR-044, R-EXT-LOCK-01):
    //  外部列不可刪除、不可改 group／srcKey 與外部擁有欄位(fieldsExternal), 可改本系統擁有欄位與 tokens; 外部管理之 group 不可新增列、不可把列改入; 違規整次拒收、零寫入
    let { woItems, procOrm, ds, lockSave, srLog, withTabLocks, guardWrite, contract = contractDef, lockExternalRows = true } = deps


    //rejectWrite: 寫入階段(guardWrite／withTabLocks／procOrm)之失敗轉本套件語系鍵
    //  拒收鍵(多人同時編輯)→ 對應語系鍵; rowsInvalid(庫內讀出之主鍵缺漏或重複)屬伺服端資料錯誤, 非重新載入能解 → 記 srLog 並回 getDataError(規格第6節);
    //  其餘(ORM 失敗、非預期例外)→ ormFail 改回 saveWriteFail 並記原文(R-ERR-1)
    let rejectWrite = (event) => {
        let toFail = ormFail({ srLog, event: `${event}-orm`, key: 'saveWriteFail' })
        return (err) => {
            if (err instanceof Error && isestr(err.readKey)) {
                return Promise.reject(err.readKey) //讀取階段失敗(已記 srLog)
            }
            let k = getRejectKey(err)
            if (isestr(k) && Object.prototype.hasOwnProperty.call(kpRejectKey, k)) {
                return Promise.reject(kpRejectKey[k])
            }
            if (k === 'rowsInvalid') {
                if (srLog && typeof srLog.error === 'function') {
                    srLog.error({ event: `${event}-rowsInvalid`, err: 'getDataError' })
                }
                return Promise.reject('getDataError')
            }
            return toFail(err)
        }
    }


    //pickBaseline: 取客戶端基準(第3參數 opt 只讀 baseline 一鍵, 絕不把客戶端的 opt 轉給 procOrm——規格第6節: procOrm 的 opt 只能由伺服端程式自組)
    //未給(undefined、null)＝不帶基準(外部應用、舊版頁面; 本 major 允許); 給了 → 一律比對, 格式不合即 baselineFormat, 不得降級為不帶基準;
    //opt 為非物件(字串、陣列等)→ 視為基準格式錯誤而 reject(不降級)
    let pickBaseline = (opt) => {
        if (opt === undefined || opt === null) {
            return { ok: true, baseline: undefined }
        }
        if (!isPlainObject(opt)) { //空物件 {} 亦為合法之 opt（wsemi iseobj 視空物件為 false，故不用之）
            return { ok: false }
        }
        let has = Object.prototype.hasOwnProperty.call(opt, 'baseline')
        return { ok: true, baseline: has ? opt.baseline : undefined }
    }


    //readRow: 逐列存檔／刪除之 read 只讀該列(規格第6節); 若讀整表，列被刪時會得 baselineMismatch 而非 rowNotFound
    //新鮮讀取: 直讀 woItems(不經 procOrm 之快取), 且 WServOrm 未開 useCache
    //讀取階段之失敗與寫入階段分流: 讀取失敗回 getDataError(同 getApisList、外部匯入之讀取), 以帶 readKey 之 Error 穿過 guardWrite 交給 rejectWrite(外審 sol#12)
    let readRow = (id, event) => {
        let toFail = ormFail({ srLog, event: `${event}-read-orm`, key: 'getDataError' })
        return () => {
            return woItems.apis.select({ id: { $in: [id] } })
                .catch((err) => {
                    return toFail(err).catch((key) => {
                        let e = new Error('read failed')
                        e.readKey = key
                        throw e
                    })
                })
        }
    }


    //attachRow: 存檔成功後於同一表鎖內新鮮讀回該列(全部欄位, 與資料通道 select 同步所得同形), 附於 procOrm save 逐筆結果之第 0 筆 row 鍵回傳(規格第8節):
    //  前端立即以之更新 store 列與基準, 不必等推播／輪詢; 不得以前端送出之值當新基準(寫入時 clearXSS 等會改寫字串)
    //  形狀: 沿用 procOrm save 之逐筆結果陣列(id、ok 等鍵不變), 只在第 0 筆加 row; 結果不是非空之物件陣列(非預期)或讀回失敗／未命中時原樣回傳(寫入已生效, 不使存檔失敗; 前端退回等推播), 讀回失敗與未命中皆入 srLog
    let attachRow = async (rs, id, event) => {
        if (!Array.isArray(rs) || rs.length === 0 || !rs.every((v) => isPlainObject(v))) {
            return rs
        }
        let toFail = ormFail({ srLog, event: `${event}-readBack-orm`, key: 'getDataError' })
        let rows = await woItems.apis.select({ id: { $in: [id] } })
            .catch((err) => {
                return toFail(err).catch(() => null)
            })
        let row = Array.isArray(rows) ? rows.find((v) => v && v.id === id) : undefined
        if (row === undefined) {
            if (Array.isArray(rows) && srLog && typeof srLog.error === 'function') { //讀取成功卻未命中(拒絕者已由 toFail 記錄)
                srLog.error({ event: `${event}-readBack-miss`, err: 'getDataError' })
            }
            return rs
        }
        return [{ ...rs[0], row }, ...rs.slice(1)]
    }


    //readExternalGroups: 讀某 group 之全部列(新鮮讀取、須在表鎖內)並回傳其中外部管理 group 集合(該 group 內有外部列才含)
    //讀取階段之失敗同 readRow 分流(帶 readKey 之 Error, 交 rejectWrite 回 getDataError)
    let readExternalGroups = async (group, event) => {
        let toFail = ormFail({ srLog, event: `${event}-readGroup-orm`, key: 'getDataError' })
        let rs = await woItems.apis.select({ group })
            .catch((err) => {
                return toFail(err).catch((key) => {
                    let e = new Error('read failed')
                    e.readKey = key
                    throw e
                })
            })
        return getExternalGroups(rs)
    }


    //logExternal: 外部列受保護之拒收入 srLog(只記事件、原因、欄位名與筆數, 不記值; 語系鍵另由 kpFunExt 邊界以 err 記錄)
    let logExternal = (event, key, extra = {}) => {
        if (srLog && typeof srLog.error === 'function') {
            srLog.error({ event: `${event}-external`, err: key, ...extra })
        }
    }


    let getApisList = async (userId) => {
        //經 procOrm（與 save／del 同一入口）而非直呼 woItems：擴充之前後處理會一併套到讀取（w-serv-orm 1.1.9 起不檢查使用者、不依使用者過濾，ADR-038）
        //失敗回語系鍵 getDataError，procOrm 之英文訊息入 srLog（R-ERR-1）
        return await procOrm(userId, 'apis', 'select', {})
            .catch(ormFail({ srLog, event: 'kpfun-getApisList-orm', key: 'getDataError' }))
    }


    //getPublicApisList: 一般使用者以 token 取得之 API 清單(GET /api/getApisList; R-PUBLICAPIS-01)——只回啟用中(isActive 'y')之列, 且每列只含公開欄位白名單(fieldsPublic, pickPublicApis.mjs),
    //固定排除 tokens、authConfigJson 等第三方憑證、測試設定與伺服器專有欄位。後台資料通道之 getApisList(整列, 僅系統管理員)不變。
    //查詢條件 isActive 先篩一次(減少讀出), pickPublicRows 再以嚴格比對保證(不依賴後端查詢語意); 失敗回語系鍵 getDataError, 原文入 srLog
    let getPublicApisList = async (userId) => {
        let rows = await procOrm(userId, 'apis', 'select', { isActive: 'y' })
            .catch(ormFail({ srLog, event: 'api-getApisList-orm', key: 'getDataError' }))
        return pickPublicRows(rows)
    }


    //saveApi(userId, row, opt): 新增(row 無 id)與修改(row.id 為字串)
    //  新增: 不比對、不去重(各存各的; 本系統不以名稱為唯一鍵), 於表鎖內 funNew 配 id／時間／預設值後寫入
    //  修改: 只改不增(mustExist; 列已被刪 → errApiRowNotFound, 不復活; 從未存在之 id 亦然); 只寫契約白名單欄位(pickWriteRow),
    //        伺服器專有欄位(timeCreate、isActive、userIdUpdate、srcKey…)取庫內值, 不採用客戶端值; 有 opt.baseline 時於同一表鎖內與新鮮讀取比對, 不符 → saveStale(零寫入)
    //  回傳: procOrm save 之逐筆結果陣列, 第 0 筆另帶 row ＝寫入後之列(表鎖內新鮮讀回; 新增時含新 id), 供前端立即更新畫面與基準(規格第8節, 見 attachRow)
    let saveApi = async (userId, row, opt) => {

        //check（reject err-key，由前端依 lang 反查顯示；邊界 kpFunExt 會 srLog 此 key）
        if (!iseobj(row)) {
            return Promise.reject('errApiRowInvalid')
        }
        let pb = pickBaseline(opt)
        if (!pb.ok) {
            return Promise.reject('errBaselineFormat')
        }

        //主鍵只讀一次(分流、讀取原列、外部列判定與寫入皆用此快照; 直接 JS 呼叫之存取器屬性不得使檢查之列不同於寫入之列)
        let id = row.id

        //雙擊防護(後端): 同一使用者之儲存處理中再送出即 reject 'saveInProgress', 不排隊——新增列每次 funNew 產新 id,
        //排隊後第 2 次會再插入一列(重複列); 包在表鎖之外層 (ADR-034)
        if (isestr(id)) {

            //修改: 白名單欄位 + 與 funNew 相同之預設值(authType、contentType 空值補預設; 只在列帶該欄時才補, 未帶者不碰庫內值)
            let o = null
            try {
                o = pickWriteRow(row, contract)
            }
            catch (err) {
                return Promise.reject('errApiRowInvalid')
            }
            o.id = id
            if (lockExternalRows !== false && !isValidGroupValue(o.group)) { //外部列受保護: group 須為合法字串(陣列、數字、孤立代理字元等會使「檢查之值」不同於「寫入之值」, 見 isValidGroupValue)
                return Promise.reject('errApiRowInvalid')
            }
            if (Object.prototype.hasOwnProperty.call(o, 'authType') && !isestr(o.authType)) {
                o.authType = 'none'
            }
            if (Object.prototype.hasOwnProperty.call(o, 'contentType') && !isestr(o.contentType)) {
                o.contentType = 'application/json'
            }

            return lockSave('saveApi', userId, () => {
                return guardWrite({
                    tables: ['apis'],
                    contract,
                    baseline: pb.baseline,
                    read: readRow(id, 'kpfun-saveApi'),
                    write: async (rows) => {

                        //外部列受保護(lockExternalRows; 於表鎖內以新鮮讀取之庫內原列判定, 違規整次拒收、零寫入):
                        //  原列為外部列 → 不得改 group／srcKey 與外部擁有欄位(fieldsExternal; 客戶端帶來之值與庫內不同才算改, 原樣送回不算);
                        //                 通過後實際只寫 id 與本系統擁有欄位(pickLocalFields): 外部擁有欄位已驗證與庫內相同, 不再寫入, 免得等價回聲(數字與其字串形式、庫內未清理之舊值)被改寫;
                        //  原列為後台列 → 不得把 group 改成外部管理之 group(group 未改者不攔: 混雜列原就在該 group 內)
                        //  原列不存在(rows 空) → 不判定, 交 procOrm mustExist 回 rowNotFound
                        let oWrite = o
                        if (lockExternalRows !== false) {
                            let old = Array.isArray(rows) ? rows.find((v) => v && v.id === id) : undefined
                            if (old !== undefined) {
                                if (isExternalRow(old)) {
                                    let fs = getExternalChanged(old, o, row)
                                    if (fs.length > 0) {
                                        logExternal('kpfun-saveApi', 'saveExternalRowChanged', { fields: fs })
                                        return Promise.reject('saveExternalRowChanged')
                                    }
                                    oWrite = pickLocalFields(o)
                                }
                                else if (Object.prototype.hasOwnProperty.call(o, 'group')) {
                                    let g = normGroup(o.group)
                                    if (g !== '' && g !== normGroup(old.group)) {
                                        let gs = await readExternalGroups(g, 'kpfun-saveApi')
                                        if (isBlockedByExternalGroup(old, g, gs)) {
                                            logExternal('kpfun-saveApi', 'saveExternalGroupDenied', { reason: 'moveIn' })
                                            return Promise.reject('saveExternalGroupDenied')
                                        }
                                    }
                                }
                            }
                        }

                        //save; mustExist: 只改不增; 失敗回語系鍵（procOrm 之英文訊息含失敗筆主鍵，只入 srLog；R-ERR-1）
                        //成功後仍在表鎖內讀回寫入後之列, 隨結果回傳(attachRow)
                        let rs = await procOrm(userId, 'apis', 'save', [oWrite], { mustExist: true })
                        return attachRow(rs, id, 'kpfun-saveApi')
                    },
                })
                    .catch(rejectWrite('kpfun-saveApi'))
            })
        }

        //新增: 不帶基準之寫入, 但取表鎖(與外部匯入、其他存檔序列化)
        let rn = null
        try {
            rn = pickWriteRow({ ...row, id: undefined }, contract) //客戶端之 id(非字串)、timeCreate、srcKey 等一律不採用
        }
        catch (err) {
            return Promise.reject('errApiRowInvalid')
        }
        if (lockExternalRows !== false && !isValidGroupValue(rn.group)) { //外部列受保護: group 須為合法字串(同修改路徑)
            return Promise.reject('errApiRowInvalid')
        }
        return lockSave('saveApi', userId, () => {
            return withTabLocks(['apis'], async () => {

                //外部列受保護: 外部管理之 group 不得新增列(匯入之批次＝該 group 之完整清單, 後台自建於其中之列下次匯入即被刪; 於表鎖內以新鮮讀取判定)
                if (lockExternalRows !== false) {
                    let g = normGroup(rn.group)
                    if (g !== '') {
                        let gs = await readExternalGroups(g, 'kpfun-saveApi')
                        if (isBlockedByExternalGroup(null, g, gs)) {
                            logExternal('kpfun-saveApi', 'saveExternalGroupDenied', { reason: 'add' })
                            return Promise.reject('saveExternalGroupDenied')
                        }
                    }
                }

                //正規化：funNew 配 id/時間/預設並過濾欄位
                let o = ds.apis.funNew(rn)

                //成功後仍在表鎖內讀回新列(含 funNew 配的新 id), 隨結果回傳(attachRow)
                let rs = await procOrm(userId, 'apis', 'save', [o])
                return attachRow(rs, o.id, 'kpfun-saveApi')
            })
                .catch(rejectWrite('kpfun-saveApi'))
        })
    }


    //deleteApi(userId, id, opt): 先刪先贏; 該列已不存在 → errApiRowNotFound(含不帶基準者; 修 E6); 有 opt.baseline 時於同一表鎖內比對(列已被他人改過 → saveStale, 零刪除)
    //回傳形狀不變(procOrm del 之結果)
    let deleteApi = async (userId, id, opt) => {

        //check（reject err-key，由前端依 lang 反查顯示）
        if (!isestr(id)) {
            return Promise.reject('errApiIdInvalid')
        }
        let pb = pickBaseline(opt)
        if (!pb.ok) {
            return Promise.reject('errBaselineFormat')
        }

        //雙擊防護(後端): 同一使用者之刪除處理中再送出即 reject 'deleteInProgress'(不排隊); 包在表鎖之外層 (ADR-034)
        return lockSave('deleteApi', userId, () => {
            return guardWrite({
                tables: ['apis'],
                contract,
                baseline: pb.baseline,
                read: readRow(id, 'kpfun-deleteApi'),
                write: (rows) => {
                    //外部列受保護: 外部列(srcKey 非空)不可由後台刪除(於表鎖內以新鮮讀取之庫內原列判定; 原列不存在則交 procOrm mustExist 回 rowNotFound)
                    if (lockExternalRows !== false) {
                        let old = Array.isArray(rows) ? rows.find((v) => v && v.id === id) : undefined
                        if (old !== undefined && isExternalRow(old)) {
                            logExternal('kpfun-deleteApi', 'deleteExternalRowDenied')
                            return Promise.reject('deleteExternalRowDenied')
                        }
                    }
                    return procOrm(userId, 'apis', 'del', { id }, { mustExist: true }) //R-ERR-1: 失敗改回語系鍵; 未命中 → rowNotFound
                },
            })
                .catch(rejectWrite('kpfun-deleteApi'))
        }, { errKey: 'deleteInProgress' })
    }


    return {
        getApisList,
        getPublicApisList,
        saveApi,
        deleteApi,
    }
}


export default procApis
