//distGuard: e2e／api 測試之建置不得改變入版控之 dist/(排程第 603 項, 回饋 2026-11-23 第 13 列; 規則帳本 R-E2E-DISTGUARD-01)
//問題: startServersOnce 於啟動後端前執行 `npm run build`(vue-cli-service build 先清空 dist/ 再寫出新 hash 檔), 後端(WWebApi.mjs 之 pathStaticFiles)固定 serve cwd 下之 dist/;
//  跑完測試後入版控之 dist/ 檔(index.tmp、w-web-api.umd.js(.map)、css／js 之 hash 檔)被刪、多出未追蹤之新 hash 檔, 每次全庫連動跟跑都要人工還原。
//作法(備份＋原位元組還原, 而非把建置導向 test/_tmp/): 產品碼之靜態檔夾固定為 cwd 下 dist(WWebApi.mjs pathStaticFiles, 無 opt 可改; w-serv-hapi 同), 改 cwd 會使後端之 ./db、./logs、settings 與測試行程不同源,
//  為此改產品碼則超出本套件之測試輔助範圍; 故建置前先備份 dist/(逐檔 sha256＋原位元組副本於 test/_tmp/dist-guard/), 測試結束(cleanup, 後端已停)後清空 dist/ 並寫回、逐檔 sha256 回驗、確認無多餘檔與目錄。
//崩潰安全: 備份之 manifest.json 最後才寫(存在即表示備份完整); 下次 guardDistStart 見到殘留之 manifest 即代表前次未收尾(被強制結束), 先以它還原再重新備份, 故 dist/ 最終回到「第一次備份時」之位元組。
//同步: 全部使用同步 fs(cleanup 於 exit／signal 備援內執行, 非同步不會被等待)。不跟進連結: dist/ 內有目錄連結(junction／symlink)即拋錯, 不處理(避免遞迴刪除穿過連結, 見全域規範之連結拆除)。
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'


const MANIFEST = 'manifest.json'
const FD_TOOLS = path.dirname(fileURLToPath(import.meta.url))

let sha = (fp) => crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')


//defaults: distDir 為 cwd 下之 dist(後端 spawn 之 cwd 與之同, WWebApi.mjs pathStaticFiles); snapDir 為 test/_tmp/dist-guard(gitignore, 測試中介資料之落點)
let defaults = () => ({ distDir: path.resolve('dist'), snapDir: path.resolve(FD_TOOLS, '..', '_tmp', 'dist-guard') })


//listTree: 遞迴列出 dir 下之檔案與目錄(相對路徑, 正斜線, 已排序); 遇連結拋錯、遇非一般檔案拋錯(不跟進)
let listTree = (dir) => {
    let files = []
    let dirs = []
    let walk = (rel) => {
        for (let d of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            let r = rel === '' ? d.name : `${rel}/${d.name}`
            if (d.isSymbolicLink()) {
                throw new Error(`distGuard: ${r} 為目錄連結或符號連結, 不處理(須先拆除連結)`)
            }
            if (d.isDirectory()) {
                dirs.push(r)
                walk(r)
            }
            else if (d.isFile()) {
                files.push(r)
            }
            else {
                throw new Error(`distGuard: ${r} 非一般檔案或目錄, 不處理`)
            }
        }
    }
    walk('')
    return { files: files.sort(), dirs: dirs.sort() }
}


/**
 * 還原 dist/ 至備份當時之狀態(位元組、檔案清單、目錄清單皆回驗); 無備份(無 manifest)時不動作
 *
 * @param {Object} [opt] 輸入設定物件
 * @param {String} [opt.distDir] 輸入 dist 資料夾絕對路徑, 預設 cwd 下 dist
 * @param {String} [opt.snapDir] 輸入備份資料夾絕對路徑, 預設 test/_tmp/dist-guard
 * @returns {Object} 回傳 { restored: Boolean, nFiles: Number }
 */
function guardDistRestore(opt = {}) {
    let { distDir, snapDir } = { ...defaults(), ...opt }
    let fpM = path.join(snapDir, MANIFEST)
    if (!fs.existsSync(fpM)) {
        return { restored: false, nFiles: 0 }
    }
    let m = JSON.parse(fs.readFileSync(fpM, 'utf8'))
    //清空: 不跟進連結(Node 之遞迴刪除不穿過連結); 重試 10 次(Windows 後端剛結束時檔案可能短暫被占用)
    fs.rmSync(distDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    if (m.existed) {
        fs.mkdirSync(distDir, { recursive: true })
        for (let d of m.dirs) {
            fs.mkdirSync(path.join(distDir, d), { recursive: true })
        }
        for (let f of m.files) {
            let dst = path.join(distDir, f.rel)
            fs.mkdirSync(path.dirname(dst), { recursive: true })
            fs.copyFileSync(path.join(snapDir, 'files', f.rel), dst)
            fs.utimesSync(dst, f.atimeMs / 1000, f.mtimeMs / 1000)
        }
        //回驗: 檔案清單與目錄清單相同(無多餘、無缺少)、逐檔 sha256 與備份當時相同
        let t = listTree(distDir)
        let want = m.files.map((f) => f.rel).sort()
        if (JSON.stringify(t.files) !== JSON.stringify(want) || JSON.stringify(t.dirs) !== JSON.stringify([...m.dirs].sort())) {
            throw new Error(`distGuard: 還原後之檔案或目錄清單與備份不符(備份保留於 ${snapDir})`)
        }
        for (let f of m.files) {
            if (sha(path.join(distDir, f.rel)) !== f.sha256) {
                throw new Error(`distGuard: 還原後 ${f.rel} 之 sha256 與備份不符(備份保留於 ${snapDir})`)
            }
        }
    }
    else if (fs.existsSync(distDir)) {
        throw new Error(`distGuard: 備份時 dist 不存在, 還原後仍存在(備份保留於 ${snapDir})`)
    }
    fs.rmSync(snapDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    return { restored: true, nFiles: m.files.length }
}


/**
 * 備份 dist/(建置前呼叫); 若前次未收尾(殘留 manifest, 如被強制結束)先還原再重新備份
 *
 * @param {Object} [opt] 輸入設定物件
 * @param {String} [opt.distDir] 輸入 dist 資料夾絕對路徑, 預設 cwd 下 dist
 * @param {String} [opt.snapDir] 輸入備份資料夾絕對路徑, 預設 test/_tmp/dist-guard
 * @returns {Object} 回傳 { staleRestored: Boolean, nFiles: Number }
 */
function guardDistStart(opt = {}) {
    let { distDir, snapDir } = { ...defaults(), ...opt }
    let staleRestored = false
    if (fs.existsSync(path.join(snapDir, MANIFEST))) {
        guardDistRestore({ distDir, snapDir })
        staleRestored = true
    }
    fs.rmSync(snapDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) //無 manifest 之殘留(備份途中被結束, 此時 dist 尚未被動過)
    let existed = fs.existsSync(distDir)
    let m = { existed, files: [], dirs: [] }
    if (existed) {
        let t = listTree(distDir) //含連結即拋錯, 尚未建立任何備份
        fs.mkdirSync(path.join(snapDir, 'files'), { recursive: true })
        m.dirs = t.dirs
        for (let rel of t.files) {
            let src = path.join(distDir, rel)
            let dst = path.join(snapDir, 'files', rel)
            fs.mkdirSync(path.dirname(dst), { recursive: true })
            fs.copyFileSync(src, dst)
            let st = fs.statSync(src)
            m.files.push({ rel, sha256: sha(src), size: st.size, atimeMs: st.atimeMs, mtimeMs: st.mtimeMs })
            if (sha(dst) !== m.files[m.files.length - 1].sha256) {
                throw new Error(`distGuard: 備份 ${rel} 後 sha256 不符`)
            }
        }
    }
    else {
        fs.mkdirSync(snapDir, { recursive: true })
    }
    fs.writeFileSync(path.join(snapDir, MANIFEST), JSON.stringify(m, null, 1), 'utf8') //最後才寫: 存在即表示備份完整
    return { staleRestored, nFiles: m.files.length }
}


export { guardDistStart, guardDistRestore }
