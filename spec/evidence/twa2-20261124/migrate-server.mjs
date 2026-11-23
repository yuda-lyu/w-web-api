//伺服端遷移(一次性批次腳本): server/WWebApi.mjs、srv.mjs 之 shapeOf／errBrief／typeOf／payloadShape／pickErrName+pickErrCode(console 站點) 改用 wsemi getDiagShape／getDiagBriefErr
//逐項斷言替換次數; 保留各檔換行格式(以 \r?\n 切行再以原 eol 接回)
import fs from 'fs'
import path from 'path'

let root = path.resolve('.')
let rd = (f) => {
    let s = fs.readFileSync(path.join(root, f), 'utf8')
    return { s, eol: s.includes('\r\n') ? '\r\n' : '\n' }
}
let wr = (f, lines, eol) => fs.writeFileSync(path.join(root, f), lines.join(eol), 'utf8')

//replaceLine: 整行相等(trim 後比對 start)之替換, 回傳新陣列; n 為預期命中數
let must = (cond, msg) => {
    if (!cond) {
        throw new Error(msg)
    }
}
let count = (lines, re) => lines.filter((l) => re.test(l)).length


//===== server/WWebApi.mjs =====
{
    let f = 'server/WWebApi.mjs'
    let { s, eol } = rd(f)
    let lines = s.split(/\r?\n/)

    //1) 匯入
    let iGen = lines.findIndex((l) => l === "import genDiagFunLog from 'wsemi/src/genDiagFunLog.mjs'")
    must(iGen >= 0, 'genDiagFunLog 匯入行不存在')
    lines.splice(iGen + 1, 0, "import getDiagShape from 'wsemi/src/getDiagShape.mjs'", "import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'")
    let iMask = lines.findIndex((l) => l === "import { maskTok, shapeOf, errBrief } from './maskLog.mjs'")
    must(iMask >= 0, 'maskLog 匯入行不存在')
    lines[iMask] = "import { maskTok } from './maskLog.mjs'"

    //2) payloadShape 之定義(註解 2 行＋函數 6 行＋其後一空行)刪除
    let iPs = lines.findIndex((l) => l.startsWith('    //payloadShape：推送資料之結構摘要'))
    must(iPs >= 0, 'payloadShape 註解不存在')
    must(lines[iPs + 2] === '    let payloadShape = (v) => {' && lines[iPs + 7] === '    }', 'payloadShape 定義形狀不符')
    lines.splice(iPs, 8) //註解 2＋函數 6
    must(lines[iPs - 2] === '' && lines[iPs - 1] === '' && lines[iPs] === '' && lines[iPs + 1] === '', 'payloadShape 定義前後應各有 2 個空行')
    lines.splice(iPs, 2) //四個空行(前 2＋後 2)去其二, 與全檔「區段間 2 空行」一致

    //3) typeOf 閉包之定義刪除(其後空行保留 2 行)
    let iTo = lines.findIndex((l) => l === '    let typeOf = (v) => `(${typeof v})`')
    must(iTo >= 0, 'typeOf 定義不存在')
    lines.splice(iTo, 1) //只刪定義行(其後 2 個空行保留, 與區段間 2 空行一致)

    //4) console 站點
    let nCtor = 0
    let nOther = 0
    let nShape = 0
    let nErr = 0
    let nPayload = 0
    for (let i = 0; i < lines.length; i++) {
        let l = lines[i]
        if (/^\s*\/\//.test(l)) {
            continue
        }
        l = l.replace(/\btypeOf\((WOrm|url|db|getUserByToken|verifyClientUser|verifyAppUser|serverPort)\)/g, (m, a) => {
            nCtor += 1
            return `getDiagShape(${a}, { keys: false })`
        })
        l = l.replace(/\btypeOf\(([A-Za-z]+)\)/g, (m, a) => {
            nOther += 1
            return `getDiagShape(${a})`
        })
        l = l.replace(/\bshapeOf\(/g, () => {
            nShape += 1
            return 'getDiagShape('
        })
        l = l.replace(/\berrBrief\(/g, () => {
            nErr += 1
            return 'getDiagBriefErr('
        })
        let mp = /^(\s*)console\.log\('(payload|inp)', payloadShape\((payload|inp)\)\)$/.exec(l)
        if (mp !== null) {
            nPayload += 1
            //parsePayload 之第 1 站(非物件)只印型別; 其餘(group／rows 無效、syncAndReplaceTabs 之 inp)另附 rows 之形狀(筆數或型別, 原 payloadShape 之 rows 欄)
            let first = mp[2] === 'payload' && nPayload === 1
            l = first ? `${mp[1]}console.log('${mp[2]}', getDiagShape(${mp[3]}))` : `${mp[1]}console.log('${mp[2]}', getDiagShape(${mp[3]}), 'rows', getDiagShape(get(${mp[3]}, 'rows')))`
        }
        lines[i] = l
    }
    must(nCtor === 7 && nOther === 5, `typeOf 站點數不符 ctor=${nCtor} other=${nOther}`)
    must(nShape === 11, `shapeOf 站點數不符 ${nShape}`)
    must(nErr === 4, `errBrief 站點數不符 ${nErr}`)
    must(nPayload === 5, `payloadShape 站點數不符 ${nPayload}`)

    //5) 註解(說明文字)同步
    let c158 = lines.findIndex((l) => l.startsWith('    //console 診斷一律不印資料值，只印型別、鍵名或固定詞彙'))
    must(c158 >= 0, '註解錨點不存在')
    lines[c158] = '    //console 診斷一律不印資料值，只印型別、鍵名或固定詞彙（跨套件規格〈診斷輸出與遮罩〉D1 單一實作、D2、〈輸入參數之檢測機制〉V20；ADR-057、ADR-110）：'
    must(lines[c158 + 1].startsWith('    //- 無效建構參數只給型別'), '註解錨點(建構參數)不符')
    lines[c158 + 1] = '    //- 無效建構參數只給型別（getDiagShape(v, { keys: false })：連鍵名亦不列，同 w-serv-orm 1.1.22 對無效參數之處置）：url 可為含帳密之連線字串, 誤傳含帳密之連線設定物件時, 印出其值即洩漏憑證；'
    must(lines[c158 + 3].startsWith('    //- 使用者物件、請求本體'), '註解錨點(使用者物件)不符')
    lines[c158 + 3] = '    //- 使用者物件、請求本體、查詢參數等物件只給鍵名（wsemi getDiagShape：至多 20 鍵、單鍵至多 32 字、控制字元換 ?；請求本體另附 rows 之形狀）；權杖仍經 maskTok（M 契約）'
    must(lines[c158 + 4].startsWith('    //- 外來錯誤'), '註解錨點(外來錯誤)不符')
    lines[c158 + 4] = '    //- 外來錯誤（ORM、WServHapiServer、檔案系統）只給錯誤類別與白名單代碼（wsemi getDiagBriefErr 之 { errType, errCode? } 物件直印；不取 message 與 stack）；錯誤本身仍原樣拋出，不動 reject／throw 之內容'

    wr(f, lines, eol)
    console.log(`${f}: ctor=${nCtor} other=${nOther} shape=${nShape} err=${nErr} payload=${nPayload}`)
}

//===== srv.mjs =====
{
    let f = 'srv.mjs'
    let { s, eol } = rd(f)
    let lines = s.split(/\r?\n/)
    let i3 = lines.findIndex((l) => l === "import { pickErrName, pickErrCode, shapeOf } from './server/maskLog.mjs'")
    must(i3 >= 0, 'srv 匯入行不存在')
    lines.splice(i3, 1, "import getDiagShape from 'wsemi/src/getDiagShape.mjs'", "import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'")
    let n = 0
    for (let i = 0; i < lines.length; i++) {
        let l = lines[i]
        if (l.startsWith("            console.log('SSO getSsoUserInfor 失敗', `(${typeof state})`)")) {
            lines[i] = l.replace('`(${typeof state})`', 'getDiagShape(state)')
            n += 1
        }
        else if (l.startsWith("        console.log('SSO getSsoUserInfor error', pickErrName(err), pickErrCode(err))")) {
            //fetch 例外之代碼在 cause.code(undici), 故宣告 nested
            lines[i] = l.replace('pickErrName(err), pickErrCode(err)', "getDiagBriefErr(err, { nested: ['cause'] })")
            n += 1
        }
        else if (l.startsWith("    console.log('verifyAppUser/user', shapeOf(user))")) {
            lines[i] = l.replace('shapeOf(user)', 'getDiagShape(user)')
            n += 1
        }
        else if (l.startsWith("    console.log('WWebApi error', pickErrName(err), pickErrCode(err))")) {
            lines[i] = l.replace('pickErrName(err), pickErrCode(err)', "getDiagBriefErr(err, { nested: ['cause'] })")
            n += 1
        }
    }
    must(n === 4, `srv.mjs 站點數不符 ${n}`)
    must(count(lines, /\b(shapeOf|pickErrName|pickErrCode)\b/) === 0 || lines.every((l) => !/\b(shapeOf|pickErrName|pickErrCode)\b/.test(l.replace(/\/\/.*$/, ''))), 'srv.mjs 仍有舊名(程式碼)')
    wr(f, lines, eol)
    console.log(`${f}: sites=${n}`)
}
