//unit-distGuard: e2e／api 測試之建置不得改變入版控之 dist/(排程第 603 項, 回饋 2026-11-23 第 13 列; 規則帳本 R-E2E-DISTGUARD-01)
//  修前: startServersOnce 之 `npm run build` 清空 dist/ 並寫出新 hash 檔, 測試結束後入版控之 dist/ 檔被刪、多出未追蹤之新檔(2026-11-23 全庫連動跟跑後 git status 見 dist/index.tmp、w-web-api.umd.js(.map) 三檔刪除)。
//  修後: test/tools/distGuard.mjs 於建置前備份 dist/(逐檔 sha256＋原位元組), cleanup 時清空並寫回、逐檔回驗、確認無多餘檔; 殘留之備份(前次被強制結束)於下次啟動時先還原。
//DG-001 往返: 刪檔、改位元組、新增檔、整個子目錄被刪後, 還原得原檔案清單、目錄清單(含空目錄)、位元組與修改時間, 備份夾已移除
//DG-002 崩潰安全: 前次未收尾(殘留備份)——下次啟動先還原再備份, 最終回到第一次備份時之位元組(不是被改過之狀態)
//DG-003 備份時 dist 不存在: 還原後 dist 不存在(建置產生之目錄被移除)
//DG-004 還原回驗: 備份檔位元組被改動時還原拋錯(sha256)並保留備份供查
//DG-005 不跟進連結: dist/ 內有目錄連結即拒絕備份, 連結目標之內容不受影響
//DG-006 接線: test/tools/e2e-setup.mjs 於 `npm run build` 之前呼叫 guardDistStart、cleanup 時呼叫 guardDistRestore; 本套件測試輔助中唯一之建置呼叫即此處
//測試用之 dist 一律建於 test/_tmp/unit-distGuard/(不碰專案之 dist/); 測試結束即刪。
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'


let fdTest = path.dirname(fileURLToPath(import.meta.url))
let FD = path.resolve(fdTest, '_tmp', 'unit-distGuard')
let sha = (fp) => crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')

//tree: 目錄下全部檔案(相對路徑 → sha256)與目錄清單, 供前後比對
let tree = (dir) => {
    let files = {}
    let dirs = []
    let walk = (rel) => {
        for (let d of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            let r = rel === '' ? d.name : `${rel}/${d.name}`
            if (d.isDirectory()) {
                dirs.push(r)
                walk(r)
            }
            else {
                files[r] = sha(path.join(dir, r))
            }
        }
    }
    walk('')
    return { files, dirs: dirs.sort() }
}

//mkDist: 仿入版控之 dist/(hash 檔、index.tmp、umd 檔、空目錄), 各檔內容逐檔相異
let mkDist = (dir) => {
    let put = (rel, c) => {
        let fp = path.join(dir, rel)
        fs.mkdirSync(path.dirname(fp), { recursive: true })
        fs.writeFileSync(fp, c)
    }
    put('index.tmp', '<html>{language}</html>')
    put('w-web-api.umd.js', 'umd-' + 'x'.repeat(1000))
    put('w-web-api.umd.js.map', '{"map":' + '1'.repeat(777) + '}')
    put('css/app.0a8155cc.css', 'a{color:red}')
    put('js/app.0362d624.js', 'console.log("app-0362")')
    put('js/chunk-vendors.9145400b.js', Buffer.from([0, 1, 2, 250, 251, 252, 13, 10, 13, 10])) //含 CRLF 與非 UTF-8 位元組: 須原位元組還原
    fs.mkdirSync(path.join(dir, 'empty-dir'), { recursive: true })
}

//mutate: 模擬 vue-cli-service build 之效果與測試期間之寫入——刪檔、改位元組、新增 hash 檔、整個子目錄被刪、新增目錄
let mutate = (dir) => {
    fs.rmSync(path.join(dir, 'index.tmp'))
    fs.writeFileSync(path.join(dir, 'w-web-api.umd.js'), 'rebuilt')
    fs.rmSync(path.join(dir, 'css'), { recursive: true })
    fs.rmSync(path.join(dir, 'empty-dir'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'js', 'app.NEWHASH00.js'), 'new build')
    fs.mkdirSync(path.join(dir, 'img'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'img', 'logo.png'), 'png')
    fs.writeFileSync(path.join(dir, 'index.html'), 'written by backend at startup')
}

let dirsOf = (name) => ({ distDir: path.join(FD, name, 'dist'), snapDir: path.join(FD, name, 'snap') })


describe('unit-distGuard (測試之建置不得改變入版控之 dist/, 備份＋原位元組還原)', function() {
    this.timeout(60000)

    let G = null

    before(async function() {
        fs.rmSync(FD, { recursive: true, force: true })
        fs.mkdirSync(FD, { recursive: true })
        G = await import('./tools/distGuard.mjs')
    })

    after(function() {
        fs.rmSync(FD, { recursive: true, force: true })
        let fdTmp = path.resolve(fdTest, '_tmp')
        if (fs.existsSync(fdTmp) && fs.readdirSync(fdTmp).length === 0) {
            fs.rmSync(fdTmp, { recursive: true, force: true })
        }
    })

    it('DG-001 往返: 刪檔、改位元組、新增檔、整個子目錄被刪後還原——檔案清單、目錄清單(含空目錄)、逐檔 sha256 與修改時間皆同備份當時, 備份夾已移除', function() {
        let o = dirsOf('dg001')
        fs.mkdirSync(o.distDir, { recursive: true })
        mkDist(o.distDir)
        let before = tree(o.distDir)
        let mt0 = fs.statSync(path.join(o.distDir, 'w-web-api.umd.js')).mtimeMs
        let r0 = G.guardDistStart(o)
        assert.deepStrictEqual(r0, { staleRestored: false, nFiles: 6 })
        mutate(o.distDir)
        assert.notDeepStrictEqual(tree(o.distDir), before, '前置: 變更確實發生')
        let r1 = G.guardDistRestore(o)
        assert.deepStrictEqual(r1, { restored: true, nFiles: 6 })
        assert.deepStrictEqual(tree(o.distDir), before, '還原後須與備份當時逐檔相同(含 index.html 與 img/ 等多餘者已移除)')
        assert.ok(!fs.existsSync(path.join(o.distDir, 'index.html')) && !fs.existsSync(path.join(o.distDir, 'img')), '多餘檔與目錄須移除')
        assert.ok(fs.existsSync(path.join(o.distDir, 'empty-dir')), '空目錄須還原')
        assert.ok(Math.abs(fs.statSync(path.join(o.distDir, 'w-web-api.umd.js')).mtimeMs - mt0) < 5, '修改時間須還原(git 以內容判定, 此為保守)')
        assert.ok(!fs.existsSync(o.snapDir), '備份夾須移除')
        assert.deepStrictEqual(G.guardDistRestore(o), { restored: false, nFiles: 0 }, '無備份時不動作(冪等)')
    })

    it('DG-002 崩潰安全: 前次未收尾(殘留備份, 如被強制結束)——下次啟動先還原再備份, 最終回到第一次備份時之位元組', function() {
        let o = dirsOf('dg002')
        fs.mkdirSync(o.distDir, { recursive: true })
        mkDist(o.distDir)
        let original = tree(o.distDir)
        G.guardDistStart(o)
        mutate(o.distDir) //模擬建置後行程被強制結束: 未呼叫 guardDistRestore
        let r = G.guardDistStart(o) //下一次啟動
        assert.strictEqual(r.staleRestored, true, '應偵測到殘留備份並先還原')
        assert.deepStrictEqual(tree(o.distDir), original, '重新備份前 dist 已回到原狀')
        mutate(o.distDir)
        G.guardDistRestore(o)
        assert.deepStrictEqual(tree(o.distDir), original, '最終須是第一次備份時之位元組, 不是被建置改過之狀態')
        assert.ok(!fs.existsSync(o.snapDir))
        //備份途中被結束(有備份檔而無 manifest): 此時 dist 尚未被動過, 下次啟動直接清掉殘留並重新備份
        fs.mkdirSync(path.join(o.snapDir, 'files'), { recursive: true })
        fs.writeFileSync(path.join(o.snapDir, 'files', 'partial.js'), 'partial')
        let r2 = G.guardDistStart(o)
        assert.strictEqual(r2.staleRestored, false)
        assert.ok(!fs.existsSync(path.join(o.snapDir, 'files', 'partial.js')), '無 manifest 之殘留須清掉')
        G.guardDistRestore(o)
        assert.deepStrictEqual(tree(o.distDir), original)
    })

    it('DG-003 備份時 dist 不存在(如多開之臨時實例不含 dist): 還原後 dist 不存在(建置產生者被移除)', function() {
        let o = dirsOf('dg003')
        fs.mkdirSync(path.dirname(o.distDir), { recursive: true })
        G.guardDistStart(o)
        mkDist(o.distDir) //建置產生
        assert.deepStrictEqual(G.guardDistRestore(o), { restored: true, nFiles: 0 })
        assert.ok(!fs.existsSync(o.distDir), '備份時不存在者, 還原後須不存在')
        assert.ok(!fs.existsSync(o.snapDir))
    })

    it('DG-004 還原回驗: 備份檔之位元組被改動時還原拋錯(sha256 不符)並保留備份供查', function() {
        let o = dirsOf('dg004')
        fs.mkdirSync(o.distDir, { recursive: true })
        mkDist(o.distDir)
        G.guardDistStart(o)
        fs.writeFileSync(path.join(o.snapDir, 'files', 'index.tmp'), '<html>{language}</html?') //位元組長度與原檔相同、只改最後一字元(> 改 ?)仍須被 sha256 抓到
        assert.throws(() => G.guardDistRestore(o), /sha256/)
        assert.ok(fs.existsSync(path.join(o.snapDir, 'manifest.json')), '回驗失敗時須保留備份')
    })

    it('DG-005 不跟進連結: dist/ 內有目錄連結即拒絕備份(不建立備份), 連結目標之內容不受影響', function() {
        let o = dirsOf('dg005')
        let target = path.join(FD, 'dg005', 'target')
        fs.mkdirSync(o.distDir, { recursive: true })
        fs.mkdirSync(target, { recursive: true })
        fs.writeFileSync(path.join(target, 'keep.txt'), 'keep')
        fs.writeFileSync(path.join(o.distDir, 'a.js'), 'a')
        let link = path.join(o.distDir, 'lnk')
        fs.symlinkSync(target, link, 'junction')
        try {
            assert.throws(() => G.guardDistStart(o), /連結/)
            assert.ok(!fs.existsSync(path.join(o.snapDir, 'manifest.json')), '拒絕時不得留下備份')
            assert.strictEqual(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'keep')
        }
        finally {
            fs.rmdirSync(link) //只拆連結本身, 不動目標(全域規範: 先拆連結再刪)
        }
        assert.strictEqual(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'keep', '連結目標須完好')
    })

    //接線(結構): 於 test/tools/e2e-setup.mjs 之 beforeSpawn 在 `npm run build` 之前備份、cleanup 之 onCleanup 還原; 測試輔助中不得另有未受保護之建置呼叫
    it('DG-006 接線: e2e-setup 於 npm run build 之前呼叫 guardDistStart、onCleanup 呼叫 guardDistRestore; 全 test/ 內唯一之 `npm run build`／vue-cli-service build 呼叫即此處', function() {
        let fp = path.join(fdTest, 'tools', 'e2e-setup.mjs')
        let code = fs.readFileSync(fp, 'utf8')
        let iImport = code.search(/^import \{[^}]*\bguardDistStart\b[^}]*\} from '\.\/distGuard\.mjs'/m)
        let iStart = code.indexOf('guardDistStart(')
        let iBuild = code.indexOf('execSync(\'npm run build\'')
        assert.ok(iImport >= 0, 'e2e-setup 須自 ./distGuard.mjs 匯入 guardDistStart／guardDistRestore')
        assert.ok(/^import \{[^}]*\bguardDistRestore\b[^}]*\} from '\.\/distGuard\.mjs'/m.test(code))
        assert.ok(iStart > 0 && iBuild > 0 && iStart < iBuild, 'guardDistStart( 須在 npm run build 之前呼叫(備份先於清空)')
        let mCleanup = /onCleanup:\s*\(\)\s*=>\s*\{([^}]*)\}/.exec(code)
        assert.ok(mCleanup !== null && /guardDistRestore\(/.test(mCleanup[1]), 'onCleanup 須呼叫 guardDistRestore(後端已停止後同步還原)')
        //逐檔 runner: 每檔前與收尾各還原一次(前一檔之 mocha 被強制結束時殘留之備份)
        let runner = fs.readFileSync(path.join(fdTest, 'tools', 'run-e2e-isolated.mjs'), 'utf8')
        assert.ok(/^import \{ guardDistRestore \} from '\.\/distGuard\.mjs'/m.test(runner), '逐檔 runner 須自 ./distGuard.mjs 匯入 guardDistRestore')
        assert.strictEqual((runner.match(/^\s+guardDistRestore\(\)/gm) || []).length, 2, '逐檔 runner 須於 beforeEachFile 與 afterAll 各呼叫 guardDistRestore() 一次')
        let builds = []
        let walk = (d) => {
            for (let n of fs.readdirSync(d, { withFileTypes: true })) {
                let f = path.join(d, n.name)
                if (n.isDirectory()) {
                    if (n.name !== '_tmp' && n.name !== 'pics' && n.name !== 'staLogs-golden') {
                        walk(f)
                    }
                }
                else if (/\.mjs$/.test(n.name) && n.name !== 'unit-distGuard.test.mjs') {
                    let c = fs.readFileSync(f, 'utf8')
                    for (let [i, l] of c.split(/\r?\n/).entries()) {
                        //只認「起行程之呼叫」帶建置命令(訊息字串如「請先 npm run build」不算)
                        if (!/^\s*(\/\/|\*)/.test(l) && /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync|fork)\s*\([^)]*(?:npm run build|'run',\s*'build'|vue-cli-service|cli-service\/bin)/.test(l)) {
                            builds.push(`${path.relative(fdTest, f).replace(/\\/g, '/')}:${i + 1}`)
                        }
                    }
                }
            }
        }
        walk(fdTest)
        assert.strictEqual(builds.length, 1, `測試輔助中之建置呼叫應只有 e2e-setup 之一處(其餘會繞過備份): ${builds}`)
        assert.ok(builds[0].startsWith('tools/e2e-setup.mjs:'), `建置呼叫之位置應為 e2e-setup: ${builds}`)
    })

})
