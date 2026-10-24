import path from 'path'
import fs from 'fs'
import get from 'lodash-es/get.js'
import j2o from 'wsemi/src/j2o.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import isErr from 'wsemi/src/isErr.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import cint from 'wsemi/src/cint.mjs'
import strleft from 'wsemi/src/strleft.mjs'
import strright from 'wsemi/src/strright.mjs'
import strdelright from 'wsemi/src/strdelright.mjs'
import pm2resolve from 'wsemi/src/pm2resolve.mjs'
import fsIsFolder from 'wsemi/src/fsIsFolder.mjs'
import fsIsFile from 'wsemi/src/fsIsFile.mjs'
import replace from 'wsemi/src/replace.mjs'
import cacheSt from 'wsemi/src/cacheSt.mjs'
import evEmit from 'wsemi/src/evEmit.mjs'
import WServHapiServer from 'w-serv-hapi/src/WServHapiServer.mjs'
import WServOrm from 'w-serv-orm/src/WServOrm.mjs'
import checkOptRemoved from 'w-serv-orm/src/checkOptRemoved.mjs'
import procLang from './procLang.mjs'
import procProxy from './procProxy.mjs'
import createTargetPolicy from './proxyTargetPolicy.mjs'
import procApis from './procApis.mjs'
import createSyncApis from './syncApis.mjs'
import createLockSave from './lockSave.mjs'
import getLockExternalRows from './getLockExternalRows.mjs'
import staEvent from './staLogs/staEvent.mjs'
import srLogInit from './srLog.mjs'
import { maskTok, maskQuery } from './maskLog.mjs'
import { wrapInjected } from './wrapInjected.mjs'
import getOptDataChannel from './getOptDataChannel.mjs'
import { pickLoginUser } from './pickLoginUser.mjs'
import ds from '../src/schema/index.mjs'


/**
 * API伺服器
 *
 * @class
 * @param {Function} WOrm 輸入資料庫ORM函數
 * @param {String} url 輸入資料庫連線字串，例如w-orm-lmdb為'./db'，或w-orm-mongodb為'mongodb://username:password@$127.0.0.1:27017'
 * @param {String} db 輸入資料庫名稱字串
 * @param {Function} getUserByToken 輸入處理函數，函數會傳入使用者token，通過此函數處理後並回傳使用者資訊物件，並至少須提供'id'、'email'、'name'、'isAdmin'欄位，且'isAdmin'限輸入'y'或'n'。本套件無自有使用者表，以此處所回之'isAdmin'判定系統管理員：'y'為系統管理員，'n'為一般使用者。API管理後台（登入檢查GET /api/getUserByToken與全部資料通道，含kpFunExt、表select、系統函數與上傳下載）只限系統管理員，非系統管理員一律被拒（後台登入檢查回固定錯誤鍵'errUserNotAdmin'；資料通道之連線閘回permission denied、請求本體__sysToken__為非系統管理員者回'errUserIdMissing'，函數皆不執行；1.1.17起，見README Upgrade Notes）；一般使用者僅可用GET /api/getApisList?token=取得啟用中API之公開欄位清單。應用系統入口POST /syncAndReplaceTabs同樣以此處所回之'isAdmin'判定等級（1.1.18起，須為系統管理員，且使用者物件須通過與瀏覽端相同之欄位檢查，見README Upgrade Notes）。使用者物件可另提供'isApp'欄位：'y'表示此token為應用系統token之反查結果（使用者用途回所綁使用者之實際資料、系統服務用途回虛擬身分，如id為'app:<金鑰主鍵>'且'isAdmin'為'y'），其餘為'n'或不給；本套件不據以判斷等級（等級只看'isAdmin'），僅隨使用者物件之拷貝原樣交給verifyClientUser與verifyAppUser供您區分。後台登入檢查GET /api/getUserByToken成功時只回'id'、'name'、'email'、'isAdmin'四個欄位（不原樣回傳此處所回之物件，password、description、isApp等不會出現於回應）。拋錯、reject或回傳非物件視同查無使用者
 * @param {Function} verifyClientUser 輸入驗證瀏覽使用者身份之處理函數，函數會傳入使用者資訊物件之拷貝與入口名from字串，通過此函數識別後回傳布林值，允許使用者回傳true，反之回傳false。瀏覽端以token進入之入口皆會呼叫（外部應用入口POST /syncAndReplaceTabs改走verifyAppUser，前端靜態檔為公開）：登入檢查GET /api/getUserByToken（from為'getUserByToken'）、一般使用者取API清單GET /api/getApisList（from為'getApisList'），以及資料通道（kpFunExt、表select、系統函數與上傳下載，連線閘verifyConn，from為w-converhp之入口名：'main'、'upload-controller'、'upload-slice'、'download-get-filename'、'download-get-file'、'download'；1.1.16起，見README Upgrade Notes）。拋錯、reject或回傳falsy值皆視同拒絕。本套件已自行限制後台與資料通道只限系統管理員（getUserByToken所回之isAdmin為'y'者；此檢查在本函數之後，故本函數只能再收緊、不能放寬），本函數不必再以isAdmin判斷；可用來依from或自有名單再收緊，例如只放行'getUserByToken'與'main'，或排除特定帳號。政策若只允許部分入口，請依from區分
 * @param {Function} verifyAppUser 輸入驗證應用程序使用者身份之處理函數，函數會傳入使用者資訊物件之拷貝與入口名from字串（目前只有外部匯入POST /syncAndReplaceTabs，from為'syncAndReplaceTabs'），通過此函數識別後回傳布林值，允許使用者回傳true，反之回傳false。拋錯、reject或回傳falsy值皆視同拒絕。1.1.18起本套件已自行要求應用系統路由之呼叫者為系統管理員等級（getUserByToken所回之isAdmin為'y'者，即使用者token之管理員、綁定管理員之應用系統token、不綁使用者之系統服務用途應用系統token；綁定一般使用者者與一般使用者被拒），並要求使用者物件欄位齊備（'id'、'email'、'name'、'isAdmin'，與瀏覽端同一檢查）；此檢查在本函數之後，故本函數只能再收緊、不能放寬，不必再以isAdmin判斷
 * @param {Object} [opt={}] 輸入設定物件，預設{}。w-serv-orm 1.1.9 起移除之 useCheckUser、getUserById、useExcludeWhenNotAdmin 不再支援：未給、null 或 false 照常，給予其他值時建構即拋錯（訊息取自 w-serv-orm 之 checkOptRemoved）
 * @param {Integer} [opt.serverPort=11005] 輸入伺服器通訊port，須為1至65535之整數（可為數字字串），未給(undefined或null)時取預設11005，有給但無效時建構即拋錯'invalid opt.serverPort'，預設11005
 * @param {Object} [opt.webName={}] 輸入站台名稱物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @param {Object} [opt.webDescription={}] 輸入站台描述物件，至少包含語系eng與cht鍵的名稱，預設{}
 * @param {String} [opt.webLogo=''] 輸入站台logo字串，採base64格式，預設''
 * @param {String} [opt.subfolder=''] 輸入站台所在子目錄字串，提供站台位於內網採反向代理進行服務時，故需支援位於子目錄情形，預設''
 * @param {String} [opt.urlRedirect=''] 輸入錯誤時自動轉址字串，提供站台例如無法登入或驗證失敗時須自動轉址，預設''
 * @param {String} [opt.logFd='./logs'] 輸入log紀錄儲存位置字串（srLog 寫入與統計掃描共用），預設'./logs'
 * @param {String} [opt.logInterval='hr'] 輸入log紀錄檔案拆檔時長字串，可選'hr'或'day'，預設'hr'
 * @param {Integer} [opt.logNumKeep=null] 輸入log檔保留數上限正整數，超出者自最舊刪除，未給採w-syslog預設(hr模式365*24、day模式365)，預設null
 * @param {Function} [opt.isAllowTarget=null] 輸入測試分頁proxy之目標位址檢核函數（部署方自訂之網址層檢核），函數會傳入實際將送出之目標網址字串（首跳為query列併入後經URL正規化之網址、轉址跳為Location解析後之網址；首跳與轉址後每一跳皆會呼叫），可為同步或非同步函數，回傳（或Promise解析為）false即拒絕該請求（回err-key 'errReqTargetNotAllowed'），拋錯或reject視同拒絕（不外洩拋出之內容），預設null（不另限制）。與內建之內網與本機位址拒絕（opt.proxyAllowInternal、opt.proxyAllowList）並存時兩者皆須通過：每一跳先呼叫本函數，再做內建檢查；本函數回傳true不能放寬內建拒絕，內建之放行清單亦不繞過本函數
 * @param {String} [opt.proxyAllowInternal='n'] 輸入測試分頁proxy是否關閉內建之內網與本機位址拒絕，可選'y'或'n'（亦接受true、false），預設'n'。預設（'n'）時代發請求之目標若為內網或本機位址一律拒絕（回err-key 'errReqTargetNotAllowed'，不回顯目標位址，並記srLog）：loopback（127.0.0.0/8、::1，含localhost名稱）、私有網段（10/8、172.16/12、192.168/16、fc00::/7）、鏈路本地（169.254/16、fe80::/10）、CGNAT（100.64/10）、未指定位址（0.0.0.0、::）、保留與文件與多播位址、IPv4映射或內嵌之IPv6（::ffff:127.0.0.1等，依其內嵌之IPv4判斷）等凡非全域單播之位址；依實際解析後之IP判斷（主機名於連線當下解析並檢查全部結果，連線所用之位址即檢查過之位址），轉址每一跳皆檢查。給'y'即整體關閉此拒絕（僅限部署於可信任網路、代發目標皆可信時）；給其他值建構即拋錯'invalid opt.proxyAllowInternal'。1.1.15及之前版本不限制目標，見README Upgrade Notes
 * @param {Array} [opt.proxyAllowList=[]] 輸入測試分頁proxy之內網與本機位址放行清單（調整內建拒絕之範圍），項為字串：IP（'127.0.0.1'、'::1'）、CIDR（'10.0.0.0/8'、'fd00::/8'）或主機名（'api.internal'，不分大小寫，不含port與萬用字元）。IP與CIDR涵蓋之位址不受內建拒絕（IPv4映射之IPv6亦以其IPv4比對）；主機名所列之主機其解析結果不受內建拒絕（含解析到內網，故只列可信之主機名）。公開位址不受此清單影響；此清單只放寬內建拒絕，不放寬opt.isAllowTarget。項不合法（非字串、格式錯誤）或非陣列時建構即拋錯'invalid opt.proxyAllowList'，預設[]
 * @param {String} [opt.lockExternalRows='y'] 輸入後台是否不得動外部列（srcKey為非空字串，即經syncAndReplaceTabs由外部來源匯入之API）與外部管理之群組（group內存在外部列者），可選'y'或'n'，預設'y'。'y'時伺服端強制：外部列不可刪除（deleteExternalRowDenied）、不可改group與srcKey及外部擁有欄位（order、name、description、url、method、version、group、levels、keywords、state、creator、dataSource、mdInputParams、inputExample、mdOutputParams、outputExample；saveExternalRowChanged），本系統擁有欄位（tokens、testBaseUrl、authType、authConfigJson、defaultHeadersJson、defaultQueryJson、defaultBodyJson、contentType）仍可改；外部管理之群組不可由後台新增列，也不可把列改入該群組（saveExternalGroupDenied）；違規整次拒收、零寫入，前端同步顯示鎖頭、欄位唯讀、刪除鈕停用與說明。給'n'回到升版前行為（後台可改可刪外部列、可在外部管理之群組新增列，下次匯入以外部為主覆蓋或刪除）。外部匯入（syncAndReplaceTabs）不受此選項影響。升版後既有庫中srcKey為非空之列即視為外部列而唯讀，請先依README Upgrade Notes盤點（g_auditExternalRows.mjs）
 * @returns {Object} 回傳w-serv-hapi之伺服器事件物件，可監聽error事件，並提供ready函數（回傳promise，啟動成功時resolve為hapi伺服器實體）、getServer與getInstWConverServer函數，以及stop函數：依序停止伺服器（w-serv-hapi之stop）、清除本套件之快取計時器、關閉各資料表ORM之連線、關閉後端log，可重複呼叫並回傳同一promise，之後不可再使用本實例。建構於資源建立後失敗時，已建立之資源於拋錯前釋放。資料通道只開放表操作select（同步用），寫入一律經kpFunExt之saveApi與deleteApi。本函數與參考部署皆不註冊process之unhandledRejection與uncaughtException監聽，未處理之rejection會依Node預設終止行程，宜由行程管理器重啟
 * @example
 *
 * import WOrm from 'w-orm-lmdb/src/WOrmLmdb.mjs'
 * import WWebApi from './server/WWebApi.mjs'
 * import getSettings from './g_getSettings.mjs'
 *
 *
 * //st
 * let st = getSettings()
 *
 * let url = st.dbUrl
 * let db = st.dbName
 * let opt = {
 *
 *     serverPort: 11005,
 *     subfolder: '', //mapi
 *     urlRedirect: 'https://www.google.com/', //本機測試時得先編譯, 再瀏覽: http://localhost:11005/
 *
 *     webName: {
 *         'eng': 'API Service',
 *         'cht': 'API管理系統',
 *     },
 *     webDescription: {
 *         'eng': 'A web service package as methods to send requests to and receive responses from an API.',
 *         'cht': 'A web service package as methods to send requests to and receive responses from an API.',
 *     },
 *     webLogo: 'data:image/svg+xml;base64,...',
 *
 * }
 *
 * let getUserByToken = async (token) => {
 *     // return {} //測試無法登入
 *     if (token === '{token-for-application}') { //提供外部應用系統作為存取使用者(系統服務用途: 不綁使用者，須為管理員等級才可呼叫POST /syncAndReplaceTabs)
 *         return {
 *             id: 'app:id-for-application',
 *             name: 'application',
 *             email: 'application@example.com',
 *             isApp: 'y', //選用: 'y'為應用系統token之反查結果，本套件不據以判斷等級，僅原樣交給verifyClientUser與verifyAppUser
 *             isAdmin: 'y',
 *         }
 *     }
 *     if (token === 'sys') { //開發階段w-ui-loginout自動給予browser使用者(且位於localhost)的token為sys
 *         return {
 *             id: 'id-for-admin',
 *             name: '測試者',
 *             email: 'admin@example.com',
 *             isAdmin: 'y',
 *         }
 *     }
 *     console.log('invalid token') //勿印權杖值: 權杖等同憑證, 印出即落入 stdout 與行程管理器之擷取檔
 *     console.log('於生產環境時得加入SSO等驗證token機制')
 *     return {}
 * }
 *
 * let verifyClientUser = (user, from) => {
 *     //from: 入口名，'getUserByToken'(登入檢查)、'getApisList'(一般使用者取API清單)、'main'(資料通道，每個請求都會呼叫)等，政策若只允許部分入口請依from區分
 *     //本套件已自行限制後台('getUserByToken')與資料通道('main'等)只限系統管理員(getUserByToken所回isAdmin為'y')，此處不必再以isAdmin判斷，只能在其上再收緊
 *     // return false //測試無法登入
 *     if (from === 'getApisList') {
 *         return true //任何有效使用者皆可取API清單(僅公開欄位)，可依自有名單再收緊
 *     }
 *     if (from === 'getUserByToken' || from === 'main') {
 *         return true //後台與資料通道: 由本套件限系統管理員，於生產環境時得加入限制瀏覽器使用者身份機制(例如排除特定帳號)
 *     }
 *     return false //上傳下載等其他入口預設拒絕
 * }
 *
 * let verifyAppUser = (user, from) => {
 *     //from: 入口名，目前只有'syncAndReplaceTabs'(外部匯入)
 *     //本套件已自行要求應用系統路由之呼叫者為系統管理員等級(getUserByToken所回isAdmin為'y'；此檢查在本函數之後)，此處不必再以isAdmin判斷，只能在其上再收緊
 *     console.log('verifyAppUser/user', user)
 *     // return false //測試無法登入
 *     console.log('於生產環境時得加入限制應用程式使用者身份機制(例如只放行特定應用系統之id)')
 *     return from === 'syncAndReplaceTabs'
 * }
 *
 * //WWebApi
 * let instWWebApi = WWebApi(WOrm, url, db, getUserByToken, verifyClientUser, verifyAppUser, opt)
 *
 * instWWebApi.on('error', (err) => {
 *     console.log(err)
 * })
 *
 */
function WWebApi(WOrm, url, db, getUserByToken, verifyClientUser, verifyAppUser, opt = {}) {
    let instWServHapiServer = null


    //check WOrm
    if (!isfun(WOrm)) {
        console.log('invalid WOrm', WOrm)
        throw new Error('invalid WOrm')
    }


    //check url
    if (!isestr(url)) {
        console.log('invalid url', url)
        throw new Error('invalid url')
    }


    //check db
    if (!isestr(db)) {
        console.log('invalid db', db)
        throw new Error('invalid db')
    }


    //check getUserByToken
    if (!isfun(getUserByToken)) {
        console.log('invalid getUserByToken', getUserByToken)
        throw new Error('invalid getUserByToken')
    }


    //check verifyClientUser
    if (!isfun(verifyClientUser)) {
        console.log('invalid verifyClientUser', verifyClientUser)
        throw new Error('invalid verifyClientUser')
    }


    //check verifyAppUser
    if (!isfun(verifyAppUser)) {
        console.log('invalid verifyAppUser', verifyAppUser)
        throw new Error('invalid verifyAppUser')
    }


    //checkOptRemoved: w-serv-orm 1.1.9 起移除之 useCheckUser / getUserById / useExcludeWhenNotAdmin, 未給、null、false 照常, 其他值即拋錯
    //(訊息之單一擁有者為 w-serv-orm); 須於任何副作用(srLog 初始化起)之前, 拋錯時不留資源 (R-ORM-1, ADR-038)
    checkOptRemoved(opt)


    //serverPort: 未給(undefined 或 null)取 11005; 有給須為 1 至 65535 之整數(含數字字串), 否則建構即拋錯, 不退回預設 (R-ORM-2, ADR-038)
    //why: 原對無效值靜默改用 11005; w-serv-hapi 1.1.6 起對超過 65535 者又靜默改聽 8080(前端 dev server 之埠), 設定錯誤將無聲生效
    let serverPort = get(opt, 'serverPort')
    if (serverPort === undefined || serverPort === null) {
        serverPort = 11005
    }
    else if (!ispint(serverPort) || cint(serverPort) > 65535) {
        console.log('invalid opt.serverPort', serverPort)
        throw new Error('invalid opt.serverPort')
    }
    serverPort = cint(serverPort)


    //proxyTargetPolicy: 測試分頁代發請求之內建目標位址政策（預設拒絕內網與本機位址；opt.proxyAllowInternal 整體開關、opt.proxyAllowList 調整；P1, ADR-049, R-PROXYTARGET-01）。
    //須於任何副作用（srLog 初始化起）之前檢核，設定不合法即拋錯、不留資源，且不退回預設（設定寫錯不得靜默生效）
    let proxyTargetPolicy = null
    try {
        proxyTargetPolicy = createTargetPolicy({ allowInternal: get(opt, 'proxyAllowInternal'), allowList: get(opt, 'proxyAllowList') })
    }
    catch (err) {
        console.log(err.message)
        throw err
    }


    //webName
    let webName = get(opt, 'webName', {})


    //webDescription
    let webDescription = get(opt, 'webDescription', {})


    //webLogo
    let webLogo = get(opt, 'webLogo', '')


    //subfolder
    let subfolder = get(opt, 'subfolder', '')
    if (isestr(subfolder)) {
        if (strright(subfolder, 1) === '/') { //右邊不需要給「/」
            subfolder = strdelright(subfolder, 1)
        }
        if (strleft(subfolder, 1) !== '/') { //左邊需要給「/」
            subfolder = `/${subfolder}`
        }
    }


    //urlRedirect
    let urlRedirect = get(opt, 'urlRedirect', '')


    //params
    let showLanguage = get(opt, 'showLanguage', 'y')
    let language = get(opt, 'language', 'eng')
    let logFd = get(opt, 'logFd', './logs') //srLog 寫入 + staEvent 統計共用之 log 資料夾
    let isAllowTarget = get(opt, 'isAllowTarget', null) //測試分頁 proxy 之目標檢核（含轉址每一跳），交 procProxy；改造前 procProxy 雖支援此 hook 但建構子未接線

    //lockExternalRows: 後台是否不得動外部列（srcKey 非空者）與外部管理之 group（預設 true; 僅 'n' 或 false 關閉, 回到 run01 行為; 原則 5, ADR-044, R-EXT-LOCK-01）
    //未知值（'N'、0、null 等）一律維持開啟（預設拒絕, 原則 1）
    let lockExternalRows = getLockExternalRows(get(opt, 'lockExternalRows', 'y'))


    //kpLangExt
    let kpLangExt = get(opt, 'kpLangExt', {})


    //kpLang
    let kpLang = procLang({ kpLangExt, webName, webDescription })


    //srLog（後端 log；錯誤一律 log err-key 供識別，對齊 w-web-sso）。為本建構子第一個副作用（起 log worker、清舊 log），其後之建構失敗須釋放之（R-RES-1）
    let srLog = srLogInit(opt)

    //印權杖一律經 ./maskLog.mjs 之 maskTok／maskQuery（M 契約：前後各至多 4 字＋長度、陣列逐元素、其他型別只給型別；ADR-033）

    //注入函數一律經 wrapInjected（W 契約，ADR-033）：以包裝版取代參數，之後本函數內之呼叫皆為包裝版（原始參數無從直接呼叫）。
    //上游同步拋錯或 reject 視同否定結果：getUserByToken → null（等同查無）、verifyClientUser／verifyAppUser → false（等同無權限），
    //由各呼叫點既有之查無／無權限分支回自家 key；因（上游失敗）記 warn、只留白名單 key 或型別與名稱，果（拒絕）由呼叫點記 error。
    //（原第四個注入函數 opt.getUserById 隨 w-serv-orm 1.1.9 移除該設定而刪除，給予即由上方 checkOptRemoved 拒絕；ADR-033 #5 作廢，ADR-038）
    //why：注入函數常包裝 w-web-sso 對外 helper，舊版 helper 失敗時 reject 夾完整網址（含介接權杖與使用者權杖），原本經 await 原樣上拋，
    //經 HTTP 回應、srLog、stdout 與 error 事件外流（修正前探測 w-web-sso tmp/probe-v3/result-before.json 實證）。
    let wrapInjectedLog = (name, fn, failValue) => {
        return wrapInjected(fn, {
            failValue,
            onFail: (info) => {
                srLog.warn({ event: `inject-${name}-fail`, ...info })
            },
        })
    }
    getUserByToken = wrapInjectedLog('getUserByToken', getUserByToken, null)
    verifyClientUser = wrapInjectedLog('verifyClientUser', verifyClientUser, false)
    verifyAppUser = wrapInjectedLog('verifyAppUser', verifyAppUser, false)


    //WServOrm（不給 opt：w-serv-orm 1.1.10 之 opt 已無設定鍵，原轉交之三鍵已移除，ADR-038）
    let wp = {}
    try {
        wp = WServOrm(ds, WOrm, url, db)
    }
    catch (err) {
        //ORM 為必要依賴：初始化失敗即 fail-fast，不以 wp={} 帶 undefined woItems/procOrm 殘缺啟動（與建構子其餘必要依賴一致）；
        //拋出前釋放已建立之 srLog（R-RES-1），否則其 log worker 撐住呼叫端之行程
        console.log('WServOrm init failed', err)
        srLog.clear().catch(() => {})
        throw err
    }
    let { woItems, procOrm, closeAll, withTabLocks, guardWrite } = wp


    //kpFunExt 邊界統一處理：成功記 info（供 staEvent 統計呼叫頻率）；catch 後端錯誤 → srLog 該 err-key →
    //原樣 re-reject（前端依 key 查自己 lang 顯示）。event 統一加 'kpfun-' 前綴 → 專用事件、與 api/verifyConn 區分。
    let wrapErrLog = (event, fn) => {
        let ev = 'kpfun-' + event
        return async (...args) => {
            try {
                let result = await fn(...args)
                srLog.info({ event: ev }) //成功也記 info
                return result
            }
            catch (err) {
                srLog.error({ event: ev, err })
                return Promise.reject(err)
            }
        }
    }

    //HTTP route 邊界統一處理（與 kpFunExt 之 wrapErrLog 同構）：core 內任一 reject 之 err-key 皆於此記錄後原樣再拋。
    //why：route 之錯誤路徑（token 無效、keyTable 無效、user 無效、payload 無效）原僅 console.log，不入 srLog，
    //而統計頁與稽核讀的正是 srLog，導致認證失敗永不可見。逐點加 log 會使同一規則散落多處，故收斂於邊界。
    let wrapRouteErrLog = (event, fn) => {
        return async (...args) => {
            try {
                return await fn(...args)
            }
            catch (err) {
                srLog.error({ event, err })
                throw err
            }
        }
    }


    //lockSave: 有副作用之 kpFunExt(saveApi / deleteApi / proxyRequest)之雙擊防護(後端, 見 lockSave.mjs, ADR-034):
    //以「操作:使用者 id」於 cacheSt 原子占位, 同一使用者之同一操作處理中再送出即 reject(saveInProgress / deleteInProgress / requestInProgress), 不排隊;
    //cst 為本實例唯一一份, 注入 procProxy 與 procApis
    let cst = cacheSt()
    let lockSave = createLockSave(cst)


    //procProxy（isAllowTarget: 部署方之網址層檢核；targetPolicy: 內建之解析後位址層政策，兩者皆須通過，見 procProxy.mjs）
    let { proxyRequestByUser, close: closeProxy } = procProxy({ srLog, isAllowTarget, targetPolicy: proxyTargetPolicy, lockSave })


    //procApis（srLog：procOrm 失敗時記原文、對外回語系鍵，R-ERR-1）
    //withTabLocks／guardWrite 取自 WServOrm 同一實例: saveApi、deleteApi 與外部匯入(syncApis)共用同一把 apis 表鎖（多人同時編輯規格第7節）
    let { getApisList, getPublicApisList, saveApi, deleteApi } = procApis({ woItems, procOrm, ds, lockSave, srLog, withTabLocks, guardWrite, lockExternalRows })


    //syncApis（外部匯入，原則 11）
    let syncApis = createSyncApis({ woItems, procOrm, withTabLocks, srLog })


    //getWebInfor
    let getWebInfor = (userId) => {
        return {

            // webName, //已併入kpLang
            // webDescription, //已併入kpLang
            webLogo,

            showLanguage,
            language,
            kpLang,

            lockExternalRows: lockExternalRows ? 'y' : 'n', //後台是否不得動外部列與外部管理之 group（opt.lockExternalRows）, 供前端鎖頭、唯讀欄位、刪除鈕停用與伺服端一致

        }
    }


    //checkUser
    let checkUser = async(user) => {
        let id = get(user, 'id', '')
        if (!isestr(id)) {
            console.log('user', user)
            console.log('can not get the userId')
            return Promise.reject('errUserIdMissing')
        }
        let email = get(user, 'email', '')
        if (!isestr(email)) {
            console.log('user', user)
            console.log('can not get the email of user')
            return Promise.reject('errUserEmailMissing')
        }
        let name = get(user, 'name', '')
        if (!isestr(name)) {
            console.log('user', user)
            console.log('can not get userName')
            return Promise.reject('errUserNameMissing')
        }
        let isAdmin = get(user, 'isAdmin', '')
        if (isAdmin !== 'y' && isAdmin !== 'n') {
            console.log('user', user)
            console.log('user.isAdmin is not y or n', user.isAdmin)
            console.log('can not get the role of user')
            return Promise.reject('errUserRoleMissing')
        }
        return true
    }


    //findTokenUser：token → 使用者；token 非字串或查無（非非空物件，含上游失敗經 wrapInjected 轉成之 null）一律 reject errUserNotFound。
    //查無之同一規則只寫此一處，經 getTokenUser 供瀏覽端／連線閘與應用端（getAndVerifyAppUser）共用（S7，ADR-033；
    //改造前 getTokenUser 未檢查，{} 經 checkUser 回 errUserIdMissing，與應用端之 errUserNotFound 不一致；應用端自 1.1.18 起亦經 getTokenUser，見 getAndVerifyAppUser）
    let findTokenUser = async (token) => {

        //getUserByToken（已包裝，永不 reject）
        let user = null
        if (isestr(token)) {
            user = await getUserByToken(token)
        }
        // console.log('user', user)

        //check
        if (!iseobj(user)) {
            console.log(`token`, maskTok(token))
            console.log(`can not find the user from token`)
            return Promise.reject('errUserNotFound')
        }

        return user
    }


    //getTokenUser
    let getTokenUser = async (token) => {

        //findTokenUser
        let userSelf = await findTokenUser(token)

        //check：checkUser 之固定鍵（errUser…Missing）原樣拋出。部署方使用者物件之必要欄位若為拋錯之取值器（或代理物件陷阱），checkUser 會拋出非固定鍵之例外，
        //其原文（可能夾部署方內部資訊）會經路由邊界回到回應與 srLog；一律視同查無使用者（固定鍵 errUserNotFound，與上游失敗經 wrapInjected 轉成 null 同一處置），不外洩原文
        try {
            await checkUser(userSelf)
        }
        catch (err) {
            console.log('can not check the user from token') //不印 err
            return Promise.reject(isestr(err) ? err : 'errUserNotFound')
        }

        return userSelf
    }


    //copyUserForHook：交給部署方鉤子（verifyClientUser／verifyAppUser）之淺拷貝，鉤子改寫拷貝不影響呼叫端之判斷（外審 sol F07）。
    //使用者物件含拋錯之取值器（getter）或代理物件陷阱時展開會拋錯，且發生在 wrapInjected 之外（引數在呼叫前即求值），原文會經路由邊界回到回應與 srLog（外審 sol 〔api-run01，任務 20261024182736〕#7）；
    //故於此攔截，失敗回 null，呼叫端視同鉤子拒絕（errUserNoPermission），與鉤子拋錯同一處置，不外洩原文
    let copyUserForHook = (user) => {
        try {
            return { ...user }
        }
        catch (err) {
            console.log('can not copy the user for verify hook') //不印 err
            return null
        }
    }


    //assertAdmin：系統管理員判準之單一擁有者（R-ADMINONLY-01，ADR-051；規格 C:\opensrcOper\dspec\使用者身分驗證原則.md 二.4：函數層級須另檢查角色，不得只靠部署方之授權設定）。
    //本套件無自有使用者表，系統管理員＝token 經部署方 getUserByToken 所回使用者之 isAdmin 嚴格等於 'y'（checkUser 已限值域為 'y'／'n'）；其餘一律為一般使用者。
    //後台（/api/getUserByToken 之登入檢查）與資料通道（連線閘、執行身分，經 authToken）都只限系統管理員，無論部署方之 verifyClientUser 如何放行（部署方只能再收緊）；
    //一般使用者唯一可用之入口為 GET /api/getApisList（公開欄位清單，R-PUBLICAPIS-01）。isAdmin 取自 getUserByToken 所回之原物件（鉤子拿到的是拷貝，改寫不影響此判斷）。
    //不通過 reject 固定鍵 'errUserNotAdmin'（不分原因、不回顯 token 與使用者資料）；呼叫端記 srLog。
    let assertAdmin = (user, from = '') => {
        if (get(user, 'isAdmin', '') !== 'y') {
            console.log(`user is not system administrator, apiType[${from}]`) //不印 user（資料通道每請求至少兩次，僅記入口名）
            return Promise.reject('errUserNotAdmin')
        }
        return user
    }


    //authToken：資料通道之 token 完整驗證＝token 認證（getTokenUser：解析呼叫者、欄位齊備）＋部署方注入之授權鉤子 verifyClientUser(user, from)＋系統管理員（assertAdmin，套件自行強制），回傳使用者。
    //連線閘（p.checkToken，驗標頭 token）與執行身分（getUserIdByToken，驗本體 __sysToken__）共用此一處，使兩個 token 各經同等完整之驗證（R-CONNGATE-01、R-EXECID-01、R-ADMINONLY-01，ADR-048、ADR-050、ADR-051；
    //規格 C:\opensrcOper\dspec\w-web呼叫者身分驗證.md 規則 3、4）。from 為入口名，供部署方區分入口；與 /api/getUserByToken 之登入檢查（getAndVerifyClientUser）為同一鉤子、
    //同一否定語意（拋錯或 reject 視同 false，wrapInjected）。部署方授權不通過 reject 'errUserNoPermission'，非系統管理員 reject 'errUserNotAdmin'
    //（呼叫端記 srLog；連線閘回 permission denied，執行身分回固定 key，皆不回顯 token 與使用者資料）。
    //認證在前、授權在後、角色最後：未通過認證者不呼叫鉤子；管理員檢查在部署方鉤子之後，故部署方只能再收緊、不能放寬。
    let authToken = async (token, from = '') => {

        //與 getTokenUser 同一規則（S8，ADR-033；改造前另手寫一份且未檢查查無）
        let user = await getTokenUser(token)

        //verifyClientUser（已包裝：拋錯或 reject 視同 false）。交給鉤子者為淺拷貝：部署方鉤子若改寫傳入之物件（如把 id 設空），後續取 id 仍用驗證前之原物件（外審 sol F07）
        let uc = copyUserForHook(user)
        let b = uc === null ? false : await verifyClientUser(uc, from)

        //check
        if (!b) {
            console.log(`user does not have permission, apiType[${from}]`) //不印 user（資料通道每請求至少兩次，僅記入口名）
            return Promise.reject('errUserNoPermission')
        }

        //系統管理員（資料通道一律只限系統管理員，R-ADMINONLY-01）
        await assertAdmin(user, from)

        return user
    }


    //p
    let p = {
        //checkToken：資料通道（w-converhp 六條路由，含 /api/main 之 kpFunExt、表 select、系統函數）之連線閘（R-CONNGATE-01，ADR-048），from 為 w-converhp 之 apiType
        //（'main'、'upload-controller'、'upload-slice'、'download-get-filename'、'download-get-file'、'download'）；驗證本體見 authToken
        checkToken: async(token, from = '') => {
            await authToken(token, from)
            return true
        },
    }


    //reBearerAuth：Authorization 標頭須為 Bearer 方案（RFC 9110 §11.1：方案名不分大小寫；方案名與憑證間為一個以上空白）。
    //原以 strdelleft(authorization, 7) 無條件刪前 7 字元而從不驗方案，'Basic <token>'、'Token <token>' 亦能通過連線閘（api-run01 實測 F4）；
    //不符方案者視為未帶 token。憑證取方案名與空白之後之整段（不另限制字元集，token 之形狀屬部署方）
    let reBearerAuth = /^Bearer +(\S.*)$/i


    //getAndVerifyClientUser：token 認證＋部署方 verifyClientUser(user, from)，不含角色檢查——是否限系統管理員由呼叫端決定（登入檢查要求 assertAdmin，
    //一般使用者可用之 GET /api/getApisList 不要求）。交給鉤子者為淺拷貝（同 authToken）：鉤子改寫傳入之物件（如把 isAdmin 改為 'y'）不影響呼叫端之角色判斷
    let getAndVerifyClientUser = async (token, from = '') => {
        //基於token查找client使用者, 會基於外部getUserByToken進行查找並比對

        //getTokenUser
        let user = await getTokenUser(token)

        //verifyClientUser（已包裝：拋錯或 reject 視同 false；拷貝失敗視同 false，見 copyUserForHook）
        let uc = copyUserForHook(user)
        let b = uc === null ? false : await verifyClientUser(uc, from)

        //check
        if (!b) {
            console.log('user', user)
            console.log(`user does not have permission`)
            return Promise.reject('errUserNoPermission')
        }

        srLog.info({ event: 'verifyClientUser', from, userId: get(user, 'id', '') }) //瀏覽使用者驗證通過
        return user
    }


    //getAndVerifyAppUser：應用入口（POST /syncAndReplaceTabs）之 token 完整驗證＝token 認證（getTokenUser：與瀏覽端同一欄位檢查）＋部署方 verifyAppUser(user, from)＋系統管理員等級（assertAdmin），回傳使用者
    //（A-1，C5；api-run01〔任務 20261024182736〕，使用者 2026-10-24 定案之 token 權責，跨套件原則 C:\opensrcOper\dspec\使用者身分驗證原則.md 二之一）。
    //token 種類：使用者 token 代表登入者；應用系統 token（getUserByToken 所回 isApp 'y'）分使用者用途（反查回所綁使用者之實際資料，能用之服務＝所綁使用者以自己 token 能用者）
    //與系統服務用途（不綁使用者，反查回 id 'app:<金鑰主鍵>'、isAdmin 'y'，能用管理員之服務）。本套件不簽發 token 亦不分辨用途，一律以反查之 isAdmin 判等級（與 assertAdmin 同一判準）：
    //綁一般使用者者與一般使用者同被拒、綁管理員者與管理員同放行、系統服務用途放行；是否簽發系統服務用途或綁管理員之應用系統 token 由專案方負責。
    //欄位檢查（getTokenUser→checkUser）：改造前本函數只 findTokenUser、不檢查欄位（虛擬應用使用者可只給 id）。等級取自 isAdmin、稽核欄 userIdUpdate 取自 id，
    //故反查結果須與瀏覽端同一規則（id／email／name 非空字串、isAdmin 限 'y'／'n'）：缺欄或值非 'y'／'n'（如 'Y'）屬部署設定錯誤，不能靜默當成一般使用者（日後誤改判準時甚至當成管理員），
    //也不另寫第二份欄位規則（一個規則一處）；不通過回既有之 errUser…Missing 鍵，部署方鉤子零呼叫。
    //順序：認證在前、授權在後、等級最後——部署方 verifyAppUser 照舊先被呼叫，只能再收緊、不能放寬；交給鉤子者為淺拷貝（同 authToken）：鉤子改寫傳入之物件（如把 isAdmin 改為 'y'）不影響等級判斷。
    //不通過 reject 'errUserNoPermission'（部署方否決）或 'errUserNotAdmin'（等級不足），由路由邊界 wrapRouteErrLog 記 srLog；回應不回顯 token 與使用者資料。
    let getAndVerifyAppUser = async (token, from = '') => {
        //基於token查找app使用者, 會基於外部getUserByToken進行查找, 故getUserByToken須提供欄位齊備之使用者（含針對應用系統所產生之虛擬使用者，w-web-sso 之系統服務用途即是）

        //getTokenUser（findTokenUser＋checkUser）
        let user = await getTokenUser(token)

        //verifyAppUser（已包裝：拋錯或 reject 視同 false；拷貝失敗視同 false，見 copyUserForHook）
        let uc = copyUserForHook(user)
        let b = uc === null ? false : await verifyAppUser(uc, from)

        //check
        if (!b) {
            console.log('user', user)
            console.log(`user does not have permission`)
            return Promise.reject('errUserNoPermission')
        }

        //系統管理員等級（R-ADMINONLY-01 之同一判準，A-1）
        await assertAdmin(user, from)

        srLog.info({ event: 'verifyAppUser', from, userId: get(user, 'id', '') }) //應用程式使用者驗證通過（含等級）
        return user
    }


    //payloadShape：推送資料之結構摘要（鍵名與 rows 筆數），供錯誤分支之 console 使用；rows 可能夾 tokens／authConfigJson 等第三方憑證，
    //故不印內容（不印整包請求資料；w-web-sso ADR-068 之同規則，ADR-033）
    let payloadShape = (v) => {
        if (!iseobj(v)) {
            return `(${typeof v})`
        }
        return { keys: Object.keys(v), rows: isarr(v.rows) ? v.rows.length : `(${typeof v.rows})` }
    }


    //parsePayload
    let parsePayload = async (req) => {

        //payload
        let payload = get(req, 'payload')

        //to obj
        if (isestr(payload)) {
            payload = j2o(payload)
        }

        //check
        if (!iseobj(payload)) {
            console.log('payload', payloadShape(payload))
            console.log(`invalid payload in req`)
            return Promise.reject('errPayloadInvalid')
        }

        //group
        let group = get(payload, 'group', '')

        //check
        if (!isestr(group)) {
            console.log('payload', payloadShape(payload))
            console.log(`invalid group in payload`)
            return Promise.reject('errGroupInvalid')
        }

        //rows
        let rows = get(payload, 'rows', [])

        //check（陣列層：非空陣列即可；逐列檢核統一於 syncAndReplaceTabs，使 [null] 與 [null,null] 皆回同一 err-key errRowInvalid，
        //不因 wsemi isearr「僅長度 1 檢查元素」而分岔）
        if (!isarr(rows) || rows.length === 0) {
            console.log('payload', payloadShape(payload))
            console.log(`invalid rows in payload`)
            return Promise.reject('errRowsInvalid')
        }

        //r
        let r = {
            group,
            rows,
        }

        return r
    }


    // //updateAPIs
    // let updateAPIs = async (inp = {}) => {

    //     //spread inp
    //     let { apis: rsApis } = inp
    //     // console.log('group', group)
    //     // console.log('rsApis', rsApis)

    //     //save
    //     let r = await woItems.apis.save(rsApis)

    //     return r
    // }


    //syncAndReplaceTabs: 外部匯入（原則 11，R-IMPORT-01）——依外部自訂之來源鍵 srcKey 於 apis 表鎖內差異同步（新增／刪除／修改／不變），回 { nAdd, nUpdate, nDel, nSame }；
    //必填欄位（apis 之 name／url，與前端編輯表單同步檢測對稱）、來源鍵規則（srcKey 必填、列帶 id 拒收，不提供呼叫端相容）、欄位歸屬、一次性遷移與失敗補償見 syncApis.mjs；此處只做陣列層檢核（group、rows）
    let syncAndReplaceTabs = async (userId, inp, keyTable) => {

        //group
        let group = get(inp, 'group', '')
        // console.log('group', group)

        //check
        if (!isestr(group)) {
            console.log('inp', payloadShape(inp))
            console.log('group', group)
            console.log(`invalid group`)
            return Promise.reject('errGroupInvalid')
        }

        //rows
        let rows = get(inp, 'rows', [])
        // console.log('rows', rows)

        //check（陣列層：須為非空陣列——空批次拒收，清空某來源須另以明確操作，防誤清；逐列檢核見 syncApis）
        if (!isarr(rows) || rows.length === 0) {
            console.log('inp', payloadShape(inp))
            console.log('keyTable', keyTable)
            return Promise.reject('errRowsInvalid')
        }

        //逐列檢核（整批驗證、全有或全無）、差異同步、失敗補償皆在 syncApis；keyTable 已由路由限為 apis
        return await syncApis(userId, { group, rows }, keyTable)
    }


    //pathStaticFiles
    let pathStaticFiles = 'dist'
    let npmPathStaticFiles = './node_modules/w-web-api/dist'
    if (fsIsFolder(npmPathStaticFiles)) {
        pathStaticFiles = npmPathStaticFiles
    }
    // console.log('pathStaticFiles', pathStaticFiles)


    //subfolder
    let fnEntryIn = 'index.tmp'
    let fnEntryOut = 'index.html'
    try {
        let fpEntryIn = path.resolve(pathStaticFiles, fnEntryIn)
        if (!fsIsFile(fpEntryIn)) {
            fpEntryIn = path.resolve(pathStaticFiles, fnEntryOut) //本機開發另使用html替代tmp
        }
        if (!fsIsFile(fpEntryIn)) {
            console.log('fpEntryIn', fpEntryIn)
            throw new Error(`invalid fpEntryIn`)
        }
        let fpEntryOut = path.resolve(pathStaticFiles, fnEntryOut)
        let c = fs.readFileSync(fpEntryIn, 'utf8')
        c = replace(c, '/mapi/', '{sfd}/') //方法同genEntry
        c = replace(c, '{sfd}', subfolder)
        c = replace(c, '{urlRedirect}', urlRedirect)
        c = replace(c, '{language}', language) //注入初始語系 → window.___pmwperm___.language（前端 getLang 之來源之一）
        fs.writeFileSync(fpEntryOut, c, 'utf8')
    }
    catch (err) {
        console.log(err)
        console.log(`can not generate ${fnEntryOut}`)
    }


    //apis
    let apis = [

        {
            method: 'GET',
            path: '/api/getUserByToken', //未登入主頁時需先檢測token, getUserByToken為w-ui-loginout預設值, 若要更改兩邊須同時修改
            handler: async function (req, res) {
                // console.log('getUserByToken', req)

                async function core() {

                    //token
                    let token = get(req, 'query.token', '')

                    //check
                    if (!isestr(token)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('token', maskTok(token))
                        console.log('[API]getUserByToken/check token: invalid token')
                        return Promise.reject('errTokenNoPermission')
                    }

                    //getAndVerifyClientUser
                    let user = await getAndVerifyClientUser(token, 'getUserByToken')

                    //check
                    if (!iseobj(user)) {
                        console.log('token', maskTok(token))
                        console.log('[API]getUserByToken/check user: invalid user')
                        return Promise.reject('errTokenNoPermission')
                    }

                    //後台登入檢查只限系統管理員（R-ADMINONLY-01）：一般使用者固定回 'errUserNotAdmin'，前端據此顯示「無權進入 API 管理後台」（src/App.vue loginError）；
                    //一般使用者取 API 清單請用 GET /api/getApisList
                    await assertAdmin(user, 'getUserByToken')

                    srLog.info({ event: 'api/getUserByToken', userId: get(user, 'id', '') })

                    //成功只回欄位白名單（A-2，fieldsLoginUser）：部署方 getUserByToken 所回物件可能帶 password、tokenVerify、description、isApp 等與前端無關之欄位，不原樣回傳
                    return pickLoginUser(user)
                }

                //pm2resolve core
                let r = await pm2resolve(wrapRouteErrLog('api/getUserByToken', core))() //w-ui-loginout接收已預設格式用pm2resolve轉過, 會提取state進行判斷
                if (isErr(r.msg)) {
                    r.msg = r.msg.message
                }
                // console.log('getUserByToken', r)

                return r
            },
        },

        {
            //一般使用者以 token 取得 API 清單（R-PUBLICAPIS-01，ADR-051）。取代原被註解之 GET /getAPIsList：改名並加 /api 前綴，與 /api/getUserByToken 同為瀏覽端以 token 進入之入口、
            //駝峰 getApisList 與資料通道之函數同名（後者回整列、僅系統管理員）；原路由已註解而從未對外存在，無相容問題。token 須通過完整驗證（有效使用者＋部署方 verifyClientUser(user, 'getApisList')），
            //一般使用者與系統管理員皆可；只回啟用中之 API 且每列只含公開欄位白名單（fieldsPublic），固定排除 tokens、authConfigJson 等憑證與測試設定。
            method: 'GET',
            path: '/api/getApisList',
            handler: async function (req, res) {
                // console.log('getApisList', req)

                async function core() {

                    //token
                    let token = get(req, 'query.token', '')

                    //check
                    if (!isestr(token)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('token', maskTok(token))
                        console.log('[API]getApisList/check token: invalid token')
                        return Promise.reject('errTokenNoPermission')
                    }

                    //getAndVerifyClientUser（不要求系統管理員）
                    let user = await getAndVerifyClientUser(token, 'getApisList')

                    //check
                    if (!iseobj(user)) {
                        console.log('token', maskTok(token))
                        console.log('[API]getApisList/check user: invalid user')
                        return Promise.reject('errTokenNoPermission')
                    }

                    //userId（checkUser 已保證 id 為非空字串）
                    let userId = get(user, 'id', '')

                    //getPublicApisList
                    let rows = await getPublicApisList(userId)

                    srLog.info({ event: 'api/getApisList', userId })
                    return rows
                }

                //pm2resolve core
                let r = await pm2resolve(wrapRouteErrLog('api/getApisList', core))()
                if (isErr(r.msg)) {
                    r.msg = r.msg.message
                }
                // console.log('getApisList', r)

                return r
            },
        },

        // {
        //     method: 'POST',
        //     path: '/updateAPIs',
        //     handler: async function (req, res) {
        //         // console.log('updateAPIs', req)
        //         // console.log('payload', req.payload)

        //         async function core() {

        //             //token
        //             let token = get(req, 'query.token', '')

        //             //check
        //             if (!isestr(token)) {
        //                 console.log('req.query', get(req, 'query'))
        //                 console.log('token', token)
        //                 console.log('[API]updateAPIs/check token: invalid token')
        //                 return Promise.reject('errTokenNoPermission')
        //             }

        //             //getAndVerifyClientUser
        //             let user = await getAndVerifyClientUser(token, 'updateAPIs')

        //             //check
        //             if (!iseobj(user)) {
        //                 console.log('token', token)
        //                 console.log('[API]updateAPIs/check user: invalid user')
        //                 return Promise.reject('errTokenNoPermission')
        //             }

        //             //parsePayload
        //             let inp = await parsePayload(req)

        //             //updateAPIs
        //             let r = await updateAPIs(inp)

        //             return r
        //         }

        //         //pm2resolve core
        //         let r = await pm2resolve(core)()
        //         if (isErr(r.msg)) {
        //             r.msg = r.msg.message
        //         }
        //         // console.log('updateAPIs', r)

        //         return r
        //     },
        // },

        {
            method: 'POST',
            path: '/syncAndReplaceTabs',
            handler: async function (req, res) {
                // console.log('syncAndReplaceTabs', req)
                // console.log('payload', req.payload)

                async function core() {

                    //token
                    let token = get(req, 'query.token', '')

                    //check
                    if (!isestr(token)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('token', maskTok(token))
                        console.log('[API]syncAndReplaceTabs/check token: invalid token')
                        return Promise.reject('errTokenNoPermission')
                    }

                    //keyTable
                    let keyTable = get(req, 'query.keyTable', '')

                    //check
                    if (!isestr(keyTable)) {
                        console.log('req.query', maskQuery(get(req, 'query')))
                        console.log('keyTable', keyTable)
                        console.log('[API]syncAndReplaceTabs/check keyTable: invalid keyTable')
                        return Promise.reject('errKeyTableInvalid')
                    }

                    //check keyTable
                    let allowedTables = ['apis']
                    if (!allowedTables.includes(keyTable)) {
                        console.log('[API]syncAndReplaceTabs/check keyTable: unexpected keyTable', keyTable)
                        return Promise.reject('errKeyTableInvalid')
                    }

                    //getAndVerifyAppUser
                    let user = await getAndVerifyAppUser(token, 'syncAndReplaceTabs')

                    //check
                    if (!iseobj(user)) {
                        console.log('token', maskTok(token))
                        console.log('[API]syncAndReplaceTabs/check user: invalid user')
                        return Promise.reject('errTokenNoPermission')
                    }

                    //userId
                    let userId = get(user, 'id', '')

                    //check userId
                    if (!isestr(userId)) {
                        console.log('token', maskTok(token))
                        console.log('user', user)
                        console.log('[API]syncAndReplaceTabs/check userId: invalid userId')
                        return Promise.reject('errTokenNoPermission')
                    }

                    //parsePayload
                    let inp = await parsePayload(req)

                    //syncAndReplaceTabs
                    let r = await syncAndReplaceTabs(userId, inp, keyTable)

                    srLog.info({ event: 'api/syncAndReplaceTabs', userId, keyTable })
                    return r
                }

                //pm2resolve core
                let r = await pm2resolve(wrapRouteErrLog('api/syncAndReplaceTabs', core))()
                if (isErr(r.msg)) {
                    r.msg = r.msg.message
                }
                // console.log('syncAndReplaceTabs', r)

                return r
            },
        },

    ]


    //optDataChannel：資料通道之選項（useDbOrm、kpOrm、operOrm、tableNamesExec、methodsExec、tableNamesSync、authorizeExec）由單一模組產生（R-DC-1，ADR-038）：
    //w-serv-webdata 1.1.7 起 useDbOrm=true 必給 authorizeExec；表操作只開放同步所需之 select，寫入一律經 kpFunExt 之 saveApi／deleteApi
    let optDataChannel = getOptDataChannel({ ds, woItems, procOrm, srLog })


    //optServ（WServHapiServer 之選項；先組好再建構，使建構失敗時可釋放已建立之資源，R-RES-1）
    let optServ = {
        port: serverPort,
        pathStaticFiles,
        apiName: 'api',
        apis,
        tokenType: 'Bearer',
        verifyConn: async ({ apiType, authorization, query, headers, req }) => {
            // console.log('verifyConn', `apiType[${apiType}]`, `authorization[${authorization}]`)

            //身分驗證責任：框架（w-converhp、w-serv-hapi、w-serv-webdata、w-serv-orm）不驗證 token，一律由本套件負責。連線閘（verifyConn）與執行身分（getUserIdByToken）
            //皆須完整驗證（token 有效、本系統使用者存在且啟用、部署方授權）；hapi apis 路由各自驗證；函數層級另檢查角色或成員；公開入口只限列名者。
            //（跨套件標準註解，見 C:\opensrcOper\dspec\使用者身分驗證原則.md 第三節；本套件之落實見 README 〈Security: identity verification responsibility〉。）

            //token：Authorization 須為 Bearer 方案（見 reBearerAuth），方案不符視為未帶 token
            let m = reBearerAuth.exec(isestr(authorization) ? authorization : '')
            let token = m === null ? '' : m[1]
            // console.log('token', token)

            //check
            if (!isestr(token)) {
                console.log('apiType', apiType)
                console.log('authorization', maskTok(authorization))
                console.log('invalid token')
                srLog.error({ event: 'verifyConn', err: 'errTokenNoPermission', apiType }) //認證失敗須入 log 供稽核/統計（CLAUDE.md「log 記錄要點」）
                return false
            }

            //checkToken：套件層連線閘＝「token 認證」（解析 user + 驗欄位齊備）＋部署方注入之授權鉤子 verifyClientUser(user, apiType)（R-CONNGATE-01，ADR-048）＋系統管理員（assertAdmin，R-ADMINONLY-01，ADR-051：資料通道一律只限系統管理員，部署方只能再收緊）。
            //套件於其餘部分不自訂「誰可用」之政策（細部政策屬部署方，由其提供之 getUserByToken / verifyClientUser / verifyAppUser 決定），但所有非公開入口一律套用部署方之鉤子、不略過
            //（跨套件規格 C:\opensrcOper\dspec\w-web呼叫者身分驗證.md 規則 1、3；修正 ADR-022、ADR-038 原「連線層只認證、不套 verifyClientUser」之設計）。
            //資料通道之表操作另由 authorizeExec（getOptDataChannel.mjs）只放行 select（寫入只經 kpFunExt），procOrm 不做授權（w-serv-orm 1.1.9 起）。詳見 spec/設計要點與取捨.md（ADR-022、ADR-038、ADR-048）。
            //checkToken 失敗會 throw（err-key），原本直接向上拋致認證失敗不入 log；此處攔截記錄後原樣再拋，行為不變。
            let b
            try {
                b = await p.checkToken(token, apiType)
            }
            catch (err) {
                srLog.error({ event: 'verifyConn', err, apiType })
                throw err
            }

            srLog.info({ event: 'verifyConn', apiType }) //連線之 token 認證通過
            return b
        },
        getUserIdByToken: async (token) => { //可使用async或sync函數
            //身分驗證責任：框架（w-converhp、w-serv-hapi、w-serv-webdata、w-serv-orm）不驗證 token，一律由本套件負責。連線閘（verifyConn）與執行身分（getUserIdByToken）
            //皆須完整驗證（token 有效、本系統使用者存在且啟用、部署方授權）；hapi apis 路由各自驗證；函數層級另檢查角色或成員；公開入口只限列名者。
            //（跨套件標準註解，見 C:\opensrcOper\dspec\使用者身分驗證原則.md 第三節；本套件之落實見 README 〈Security: identity verification responsibility〉。）
            //
            //執行身分（R-EXECID-01，ADR-050；規格 C:\opensrcOper\dspec\w-web呼叫者身分驗證.md 規則 4，C3）：w-serv-webdata 於執行每個資料通道函數（kpFunExt、表操作、系統函數）之前
            //以請求本體之 __sysToken__ 呼叫本函數取得 userId，此 token 與連線閘所驗之 Authorization 標頭 token 來自不同欄位、可為不同值（框架不比對兩者；w-serv-orm 1.1.10 起亦不做使用者檢查）。
            //故「反查使用者」即驗證身分之步驟，須與連線閘同等完整：token 認證（解析、欄位齊備）＋部署方授權 verifyClientUser(user, 'main')，共用 authToken，兩個 token 各經完整驗證。
            //修正前只取外部 getUserByToken 之 id：標頭為放行者、本體為被 verifyClientUser 拒絕者（或欄位不齊者）時函數照常執行並以被拒者之身分寫入（api-run01 實測）。
            //from 固定為 'main'：w-serv-webdata 之 execFun 只由 w-converhp 之 /api/main（apiType 'main'）觸發，其餘五條路由（上傳、下載）不經本函數（本套件亦未註冊其監聽）；
            //此為資料通道函數之執行身分檢查，與連線閘之 'main' 為同一入口，部署方之 verifyClientUser 依 from 之政策因而一致。
            //fail-closed（S9，ADR-033；對齊 w-web-perm）：token 非字串、查無、欄位不齊、授權不通過（含上游失敗經包裝轉成之 null／false）一律 reject 固定 key 'errUserIdMissing'，
            //w-serv-webdata 之 execFun 即不執行函數、不回顯 token 與使用者資料（具體原因不外露，只入 srLog：err 為認證或授權之既有 key）。改造前回 '' 仍以空 userId 執行（fail-open）。
            let user = null
            try {
                user = await authToken(token, 'main')
            }
            catch (err) {
                console.log('token', maskTok(token))
                console.log('can not verify the user from token for execution')
                srLog.error({ event: 'getUserIdByToken', err: isestr(err) ? err : 'errUserIdMissing' }) //err 為 authToken 之 reject key（固定字串）；非字串者（不應出現）只記固定 key
                return Promise.reject('errUserIdMissing')
            }
            return get(user, 'id', '') //authToken 通過 getTokenUser／checkUser，id 必為非空字串
        },
        ...optDataChannel,
        kpFunExt: { //接收參數第1個為userId, 之後才是前端給予參數（皆經 wrapErrLog：錯誤 srLog err-key 後 re-reject）

            getWebInfor: wrapErrLog('getWebInfor', getWebInfor),

            proxyRequest: wrapErrLog('proxyRequest', (userId, reqSpec) => {
                return proxyRequestByUser(userId, reqSpec) //依使用者占位(ADR-034), 同一使用者處理中再送出 → 'requestInProgress'
            }),

            getApisList: wrapErrLog('getApisList', (userId) => {
                return getApisList(userId)
            }),
            saveApi: wrapErrLog('saveApi', (userId, row, opt) => {
                return saveApi(userId, row, opt) //opt: 前端選填 { baseline }(開啟編輯時以 buildBaseline 對畫面所見之列自算); 只讀 baseline, 不轉給 procOrm
            }),
            deleteApi: wrapErrLog('deleteApi', (userId, id, opt) => {
                return deleteApi(userId, id, opt)
            }),

            //統計資訊頁：回傳各 event 之時段發生頻率（讀 logFd 之 log）。連線之 token 認證與授權由 verifyConn／getUserIdByToken 把關；
            //資料通道之全部函數（含本函數）只限系統管理員（authToken 之 assertAdmin，R-ADMINONLY-01），其餘授權政策屬部署方之 verifyClientUser。timeLength 天數 / timeInterval 'hr'|'day'。
            getStaEvent: wrapErrLog('getStaEvent', (userId, timeLength = 7, timeInterval = 'hr') => {
                return staEvent(timeLength, timeInterval, { fdLog: logFd, srLog })
            }),

            // getAPIsList: (userId, query = {}) => { //待提供api管理系統界面使用
            //     return getAPIsList(query)
            // },
            // updateApis: (userId, rows) => { //待提供api管理系統界面使用
            //     return updateApis(rows)
            // },

        },
        fpTableTags: 'tableTags-web-api.json', //w-serv-hapi 1.0.87 起正名 fpTableTags（同 sso / perm）; 舊名 fnTableTags 於 1.0.86 傳到 w-serv-webdata 時不被讀取, 實際一直寫預設 tableTags.json
    }


    //WServHapiServer（w-serv-hapi 1.1.6 起設定錯誤於建構時同步拋出）：拋錯時先釋放已建立之 cacheSt 計時器、各資料表 ORM 連線與 srLog，再原樣拋出（R-RES-1）
    try {
        instWServHapiServer = new WServHapiServer(optServ)
    }
    catch (err) {
        console.log('WServHapiServer init failed', err)
        cst.clear()
        closeAll().catch(() => {})
        srLog.clear().catch(() => {})
        throw err
    }


    //stop（R-RES-1，ADR-038）：w-serv-hapi 之 stop 只停止伺服器並釋放其下游；本套件自建之 cacheSt（TTL 偵測計時器）、各資料表 ORM（LMDB 連線）、
    //srLog（transport worker）於其後依序釋放，使呼叫 stop 後行程不被本套件撐住。停止為終態，可重複呼叫並回傳同一 promise；
    //釋放失敗不中斷其餘釋放，以 error 事件通知（同 w-serv-hapi：stop 恆 resolve）
    let stopServ = instWServHapiServer.stop
    let pmStop = null
    instWServHapiServer.stop = () => {
        if (pmStop !== null) {
            return pmStop
        }
        pmStop = (async () => {
            await stopServ()
            for (let release of [() => cst.clear(), () => closeProxy(), () => closeAll(), () => srLog.clear()]) {
                try {
                    await release()
                }
                catch (err) {
                    evEmit(instWServHapiServer, 'error', [err], { tag: 'w-web-api' }) //同 w-serv-hapi: 監聽器之同步拋錯不中斷其餘釋放
                }
            }
        })()
        return pmStop
    }


    return instWServHapiServer
}


export default WWebApi
