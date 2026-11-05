//測試 e2e 單開之自動換埠與只動本實例之下殺(規則帳本 R-E2E-PORT-01; 排程第 309 項, 2026-11-05 wa309; 規格 C:/opensrcOper/dspec/e2e埠與多套件同跑.md E1～E8)
//
//受測: test/tools/e2ePorts.mjs(基準埠單一定義＋reserveE2ePorts)、test/tools/e2e-setup.mjs(baseUrl／genTempSettings 之 serverPort／服務管理器之 reservation)、
//      test/tools/run-e2e-isolated.mjs(逐檔 runner 之下殺)、test/e2e-apitest.test.mjs(echo 埠)、test/ 下寫死之埠與網址。
//契約(R-E2E-PORT-01):
//  1. [E1][E2] 沒有占用時即基準埠(E2E_PORT_OFFSET 維持未設); 後端 11005 或 echo 11077 任一被真實監聽者占用時整組位移, 位移後之 baseUrl／echo 埠／臨時設定之 serverPort 皆為位移後之實際埠。
//  2. [E4] 占用者絕不被動到: 位移之過程中占用者仍在監聽、沒有收到任何 HTTP 請求(保留與偵測只做綁定檢查)。
//  3. [E3] 兩個同時開跑之行程(同一登錄目錄)不會選到同一組埠(預約, 偵測與綁定之間有時間差)。
//  4. [E4] test/ 內無依埠或依名稱下殺(killPortListeners)之呼叫; 逐檔 runner 只殺本實例已確認身分之監聽者並於遇他人占用時中止; 服務管理器明確帶入 reservation。
//  5. 測試碼(e2e-／api-／tools)無寫死之連線網址(host:埠); 例外只有種子資料字串(http://localhost:11005/<種子路徑>, 資料不是連線, 不隨位移改)。
//     api-／unit- 測試寫死之監聽埠與 e2ePorts.OTHER_TEST_PORTS 一致(新增忘了列即紅)。
//占用情境之期望由「當下環境」動態算出(他人占用者、api 後端、本測試之占用者皆計入), 占不到(已被他人占用)視為已占用; 不以 skip 當常態。
//跑法: node C:/opensrcOper/tools/quiet-run.mjs --name e2ePortReserve --lock -- npx mocha test/unit-e2ePortReserve.test.mjs --timeout 120000
import fs from 'fs'
import net from 'net'
import http from 'http'
import path from 'path'
import assert from 'assert'
import { spawn, spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'

const A = assert.strict
const fdTest = path.dirname(fileURLToPath(import.meta.url))
const projRoot = path.join(fdTest, '..')
const fdTmp = path.join(fdTest, '_tmp', 'e2ePortReserve') //測試中介資料(測完即刪)
const fdReg = path.join(fdTmp, 'reg') //私有之埠預約登錄目錄(不干擾真實預約)
const SETUP_URL = pathToFileURL(path.join(fdTest, 'tools', 'e2e-setup.mjs')).href
const PORTS_URL = pathToFileURL(path.join(fdTest, 'tools', 'e2ePorts.mjs')).href
const LIB_URL = pathToFileURL(path.join(fdTest, 'tools', 'e2eLib.mjs')).href
const BACKEND = 11005
const ECHO = 11077

//子行程: 匯入 e2e-setup(其匯入之 e2ePorts 於模組頂層即保留埠)後回報實際埠; holdOpen 時續留至父行程寫入一行(保留不釋放)
const CHILD_CODE = `
import fs from 'fs'
const m = await import(${JSON.stringify(SETUP_URL)})
const p = await import(${JSON.stringify(PORTS_URL)})
const lib = await import(${JSON.stringify(LIB_URL)})
const t = JSON.parse(fs.readFileSync(m.genTempSettings({}), 'utf8'))
console.log('RESULT ' + JSON.stringify({ source: p.reservation.source, offset: p.reservation.offset, ports: p.reservation.ports, env: process.env.E2E_PORT_OFFSET === undefined ? null : process.env.E2E_PORT_OFFSET, base: m.baseUrl, echo: lib.resolveE2ePort(p.ECHO_PORT), serverPort: t.serverPort }))
if (process.env.WA309_HOLD_OPEN === '1') {
    await new Promise((resolve) => process.stdin.once('data', resolve))
}
m.cleanup()
`

let baseEnv = () => {
    let env = { ...process.env, E2E_PORT_REG_DIR: fdReg }
    for (let k of ['E2E_PORT_OFFSET', 'E2E_PORT_HOLD', 'E2E_REGEN', 'E2E_BARE', 'E2E_DIAG', 'E2E_COLLECT', 'WA309_HOLD_OPEN']) {
        delete env[k]
    }
    return env
}

let runChild = (env) => {
    let r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD_CODE], { cwd: projRoot, env, encoding: 'utf8', timeout: 90000, windowsHide: true })
    let m = /RESULT (.*)/.exec(r.stdout || '')
    return { status: r.status, out: m ? JSON.parse(m[1]) : null, stdout: r.stdout || '', err: (r.stderr || '').slice(-800) }
}

//以真實 http 監聽占用一個埠(node 預設之雙棧位址); 記錄收到之請求數
let occupy = (port) => new Promise((resolve, reject) => {
    let hits = 0
    let server = http.createServer((req, res) => {
        hits++
        res.end('occupied')
    })
    server.once('error', reject)
    server.listen(port, () => resolve({ port, hits: () => hits, close: () => new Promise((r) => server.close(r)) }))
})

//埠是否仍在監聽(以 TCP 連線檢查, 不送 HTTP)
let isListening = (port) => new Promise((resolve) => {
    let s = net.connect({ host: '127.0.0.1', port })
    s.once('connect', () => {
        s.destroy()
        resolve(true)
    })
    s.once('error', () => resolve(false))
})

//使該埠處於「被占用」: 能占即以真實 http 監聽占用(own=true, 可驗占用者沒被打到); 該埠已被他人占用(如同一 mocha 行程內 api 測試已起之後端占著 11005, 全套之 rest 段即是)
//  則視為已被占用(own=false), 不重複占。使本檔之占用情境在單檔跑與全套 rest 段皆能成立, 不因環境而整批 skip。
let holdBusy = async (port) => {
    try {
        return { ...(await occupy(port)), own: true }
    }
    catch (err) {
        if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') {
            throw err
        }
        return { port, own: false, hits: () => 0, close: async () => {} }
    }
}

//埠是否空閒(同套件偵測 reserveE2ePorts: 127.0.0.1、0.0.0.0、::、::1 四個位址皆能綁定; 無 IPv6 之主機〔EAFNOSUPPORT／EADDRNOTAVAIL〕該位址視為通過)
let isFree = async (port) => {
    for (let host of ['127.0.0.1', '0.0.0.0', '::', '::1']) {
        let ok = await new Promise((resolve) => {
            let s = net.createServer()
            s.once('error', (err) => resolve(err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL'))
            s.listen(port, host, () => s.close(() => resolve(true)))
        })
        if (!ok) {
            return false
        }
    }
    return true
}

//依「由小到大逐一試位移 0、100、200…, 兩個基準埠皆空閒之第一個」算出期望位移(與當下環境無關: 他人占用者、api 後端、本測試之占用者皆計入)
let firstFreeOffset = async () => {
    for (let off = 0; off < 2000; off += 100) {
        if ((await isFree(BACKEND + off)) && (await isFree(ECHO + off))) {
            return off
        }
    }
    throw new Error('找不到空閒之位移')
}

let alive = (pid) => {
    try {
        process.kill(pid, 0)
        return true
    }
    catch (err) {
        return err.code === 'EPERM'
    }
}

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

//可執行碼之行(去掉整行註解與行尾 // 註解之文字; 區塊註解 /* */ 之行略過)。行尾 // 之判定略過字串內之 //(如 'http://')
let stripLineComment = (s) => {
    let q = null
    for (let i = 0; i < s.length; i++) {
        let c = s[i]
        if (q) {
            if (c === '\\') {
                i++
            }
            else if (c === q) {
                q = null
            }
            continue
        }
        if (c === '\'' || c === '"' || c === '`') {
            q = c
        }
        else if (c === '/' && s[i + 1] === '/') {
            return s.slice(0, i)
        }
    }
    return s
}
let sourceLines = (fp) => {
    let out = []
    let inBlock = false
    fs.readFileSync(fp, 'utf8').split(/\r?\n/).forEach((ln, k) => {
        let t = ln.trim()
        let doc = inBlock || t.startsWith('/*') || t.startsWith('*')
        if (t.startsWith('/*') && !t.includes('*/')) {
            inBlock = true
        }
        if (inBlock && t.includes('*/')) {
            inBlock = false
        }
        if (doc || t.startsWith('//')) {
            return
        }
        out.push({ no: k + 1, text: stripLineComment(ln) })
    })
    return out
}
let codeOf = (fp) => sourceLines(fp).map((l) => l.text).join('\n')


describe('unit-e2ePortReserve (e2e 單開自動換埠與只動本實例之下殺, R-E2E-PORT-01)', function() {
    this.timeout(180000)

    before(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
        fs.mkdirSync(fdReg, { recursive: true })
    })

    after(function() {
        fs.rmSync(fdTmp, { recursive: true, force: true })
    })

    describe('契約 1、2: 基準埠空閒即基準埠; 被占用整組位移且占用者不受影響', function() {
        it('PR-001 期望位移＝當下環境之首個空閒位移; 位移 0 時 E2E_PORT_OFFSET 維持未設, baseUrl／echo／臨時設定同導入前', async function() {
            let exp = await firstFreeOffset()
            let { status, out, err } = runChild(baseEnv())
            A.equal(status, 0, `子行程失敗: ${err}`)
            A.equal(out.source, 'auto')
            A.equal(out.offset, exp, '位移須為當下環境之首個空閒位移(基準埠有他人占用時為其後之組)')
            A.deepEqual(out.ports, [BACKEND + exp, ECHO + exp])
            A.equal(out.base, `http://127.0.0.1:${BACKEND + exp}`)
            A.equal(out.echo, ECHO + exp)
            A.equal(out.serverPort, BACKEND + exp, '臨時設定之 serverPort 為實際後端埠')
            if (exp === 0) {
                A.equal(out.env, null, '沒有位移時不得寫入 E2E_PORT_OFFSET(行為同導入前)')
                A.equal(out.base, 'http://127.0.0.1:11005')
                A.equal(out.serverPort, 11005, '未位移之臨時設定 serverPort 同 settings.json')
            }
            else {
                A.equal(out.env, String(exp))
            }
        })

        for (let [id, held] of [
            ['PR-002', [BACKEND]], //後端基準埠被占用
            ['PR-003', [ECHO]], //echo 基準埠被占用: 後端也一起移位(只換一個埠, 服務之間就連不上, E3)
            ['PR-004', [BACKEND, BACKEND + 100]], //第一個位移之後端埠也被占用: 再移一格
        ]) {
            it(`${id} 占用 ${held.join('、')}: 整組位移至「首個空閒位移」; 占用者仍在監聽且沒收到任何請求; 網址與臨時設定皆為實際埠`, async function() {
                let occupiers = []
                try {
                    for (let p of held) {
                        occupiers.push(await holdBusy(p))
                    }
                    //期望位移由當下環境算出(含他人與 api 後端之占用), 並須確實位移(基準埠已被占用)
                    let expOffset = await firstFreeOffset()
                    let expPorts = [BACKEND + expOffset, ECHO + expOffset]
                    let minOffset = held.includes(BACKEND + 100) ? 200 : 100
                    A.ok(expOffset >= minOffset, `前提: 基準埠已被占用, 期望位移須 >= ${minOffset}, 實得 ${expOffset}`)
                    let { status, out, stdout, err } = runChild(baseEnv())
                    A.equal(status, 0, `子行程失敗: ${err}`)
                    A.equal(out.source, 'auto')
                    A.equal(out.offset, expOffset)
                    A.deepEqual(out.ports, expPorts)
                    A.equal(out.env, String(expOffset), '位移寫入 E2E_PORT_OFFSET, 供 resolveE2ePort／子行程取得同一組埠')
                    A.equal(out.base, `http://127.0.0.1:${expPorts[0]}`, 'baseUrl 為實際後端埠')
                    A.equal(out.echo, expPorts[1], 'echo 埠為實際埠(e2e-apitest 之 echo 目標)')
                    A.equal(out.serverPort, expPorts[0], '臨時設定之 serverPort 為實際後端埠(srv.mjs 之埠只能由 settings 決定)')
                    A.ok(new RegExp(`\\[e2e-port\\] 基準埠 \\[${BACKEND}, ${ECHO}\\] → 實際埠 \\[${expPorts.join(', ')}\\]`).test(stdout), `[E6] 實際使用之埠須印入輸出: ${stdout.slice(0, 300)}`)
                    for (let o of occupiers) {
                        A.equal(await isListening(o.port), true, `占用者 ${o.port} 須仍在監聽(絕不殺占用者)`)
                        A.equal(o.hits(), 0, `占用者 ${o.port} 不得收到任何 HTTP 請求(只做綁定檢查, 不打到別人的服務)`)
                    }
                }
                finally {
                    for (let o of occupiers) {
                        await o.close()
                    }
                }
            })
        }

        it('PR-005 手動 E2E_PORT_OFFSET=0(沿用逃生口): 不換埠, 未位移之 baseUrl／echo／臨時設定同導入前(與環境占用無關), 占用者仍不被動(只告警)', async function() {
            let o = await holdBusy(BACKEND)
            try {
                let { status, out, stdout, err } = runChild({ ...baseEnv(), E2E_PORT_OFFSET: '0' })
                A.equal(status, 0, `子行程失敗: ${err}`)
                A.equal(out.source, 'pinned')
                A.deepEqual(out.ports, [BACKEND, ECHO], '手動指定位移 0＝明確要求基準埠, 不自動換埠')
                //未位移之行為(E1: 沒有位移時與導入前相同)在此以釘住位移 0 斷言, 不依賴「基準埠此刻空閒」(全套 rest 段 api 後端占著 11005 時亦成立)
                A.equal(out.base, 'http://127.0.0.1:11005', '未位移之 baseUrl 同導入前')
                A.equal(out.echo, 11077, '未位移之 echo 埠同導入前')
                A.equal(out.serverPort, 11005, '未位移之臨時設定 serverPort 同 settings.json')
                A.ok(/警告/.test(stdout), '被占用時須告警(不靜默)')
                A.equal(await isListening(BACKEND), true)
                A.equal(o.hits(), 0)
            }
            finally {
                await o.close()
            }
        })
    })

    describe('契約 2b: 行程內監聽者(echo)綁定前之連線檢查(E5)', function() {
        it('PR-013 assertPortNotAnswering: 空閒埠通過; 雙棧占用者／127.0.0.1 占用者皆拋錯寫明且占用者沒收到 HTTP 請求', async function() {
            //三個埠由作業系統配發(與基準埠無關, 不依賴環境): 空閒者先占後放
            let listenOs = (host) => new Promise((resolve, reject) => {
                let hits = 0
                let s = http.createServer((req, res) => {
                    hits++
                    res.end('occupied')
                })
                s.once('error', reject)
                s.listen(0, host, () => resolve({ s, port: s.address().port, hits: () => hits }))
            })
            let free = await listenOs('127.0.0.1')
            let freePort = free.port
            await new Promise((r) => free.s.close(r))
            let dual = await listenOs(undefined) //node 預設雙棧(Windows 上允許他人另綁 127.0.0.1 並存, 即 E5 之搶連線情境)
            let v4 = await listenOs('127.0.0.1')
            try {
                let code = `
const p = await import(${JSON.stringify(PORTS_URL)})
let r = []
for (const port of ${JSON.stringify([freePort, dual.port, v4.port])}) {
    try {
        await p.assertPortNotAnswering(port, 'echo')
        r.push({ port, threw: false })
    }
    catch (e) {
        r.push({ port, threw: true, msg: String(e.message) })
    }
}
//注入假連線: 只有 ECONNREFUSED 視為無人; 其他錯誤與逾時一律 fail-closed(拋錯, 不綁定)
import { EventEmitter } from 'events'
const fake = (ev, arg) => () => {
    const e = new EventEmitter()
    e.setTimeout = () => {}
    e.destroy = () => {}
    setImmediate(() => e.emit(ev, arg))
    return e
}
const f = []
for (const [name, ev, arg] of [['refused', 'error', { code: 'ECONNREFUSED' }], ['eacces', 'error', { code: 'EACCES' }], ['unreach', 'error', { code: 'ENETUNREACH' }], ['timeout', 'timeout', undefined]]) {
    try {
        await p.assertPortNotAnswering(1, 'fake', { connect: fake(ev, arg) })
        f.push({ name, threw: false })
    }
    catch (e) {
        f.push({ name, threw: true })
    }
}
console.log('RESULT ' + JSON.stringify(r))
console.log('FAKE ' + JSON.stringify(f))
`
                //E2E_PORT_HOLD: 視為上層已保留(不在本子行程內再選埠/預約), 只驗 assertPortNotAnswering
                let r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: projRoot, env: { ...baseEnv(), E2E_PORT_HOLD: 'wa309-unit-pr013' }, encoding: 'utf8', timeout: 60000, windowsHide: true })
                let m = /RESULT (.*)/.exec(r.stdout || '')
                A.ok(m, `子行程失敗: ${(r.stderr || '').slice(-600)}`)
                let res = JSON.parse(m[1])
                A.equal(res[0].threw, false, '空閒埠須通過(沒有人應答)')
                A.equal(res[1].threw, true, '雙棧占用者之埠須拋錯(不綁定, 免搶其連線)')
                A.ok(res[1].msg.includes(String(dual.port)) && /占用|應答/.test(res[1].msg), `錯誤須寫明埠與原因: ${res[1].msg}`)
                A.equal(res[2].threw, true, '127.0.0.1 占用者之埠須拋錯')
                let fk = JSON.parse(/FAKE (.*)/.exec(r.stdout || '')[1])
                A.deepEqual(fk.map((x) => [x.name, x.threw]), [['refused', false], ['eacces', true], ['unreach', true], ['timeout', true]], '只有 ECONNREFUSED 視為無人; 其他錯誤與逾時 fail-closed')
                A.equal(dual.hits(), 0, '連線檢查只連線不送 HTTP, 占用者不得收到請求')
                A.equal(v4.hits(), 0)
                A.equal(await isListening(dual.port), true)
                A.equal(await isListening(v4.port), true)
            }
            finally {
                await new Promise((r) => dual.s.close(r))
                await new Promise((r) => v4.s.close(r))
            }
        })
    })

    describe('契約 3: 同時開跑之兩個行程不選到同一組埠(預約)', function() {
        it('PR-006 兩個子行程同一登錄目錄: 先到者取首個空閒位移, 後到者因預約而取更大之位移(兩組埠不重疊)', async function() {
            let off0 = await firstFreeOffset()
            let kids = []
            let startKid = () => new Promise((resolve, reject) => {
                let child = spawn(process.execPath, ['--input-type=module', '-e', CHILD_CODE], { cwd: projRoot, env: { ...baseEnv(), WA309_HOLD_OPEN: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
                kids.push(child)
                let buf = ''
                let tm = setTimeout(() => reject(new Error(`子行程逾時未回報: ${buf.slice(-400)}`)), 60000)
                child.stdout.on('data', (d) => {
                    buf += d
                    let m = /RESULT (.*)/.exec(buf)
                    if (m) {
                        clearTimeout(tm)
                        resolve(JSON.parse(m[1]))
                    }
                })
                child.once('error', reject)
            })
            try {
                let a = await startKid()
                let b = await startKid() //a 仍持有(未結束), 其預約使 b 不得選同一組, 即使兩組埠都沒有真實監聽者
                A.equal(a.offset, off0, '先到者取首個空閒位移')
                A.ok(b.offset > a.offset, `後到者須因預約而位移(偵測與綁定之間有時間差, 不能只靠綁定檢查): 先 ${a.offset} 後 ${b.offset}`)
                A.ok(a.ports.every((p) => !b.ports.includes(p)), `兩組埠不得重疊: ${a.ports} vs ${b.ports}`)
            }
            finally {
                for (let k of kids) {
                    try {
                        k.stdin.write('go\n')
                    }
                    catch (err) {}
                }
                //以可觀察之條件同步(輪詢至行程結束), 不以固定延時後斷言
                let t0 = Date.now()
                while (kids.some((k) => alive(k.pid)) && Date.now() - t0 < 15000) {
                    await sleep(100)
                }
                for (let k of kids) {
                    if (alive(k.pid)) {
                        k.kill()
                    }
                }
            }
        })
    })

    describe('契約 4: 無依埠或依名稱下殺; 逐檔 runner 只殺本實例並於遇他人占用時中止', function() {
        let files = () => [
            ...fs.readdirSync(fdTest).filter((f) => /\.mjs$/.test(f)).map((f) => path.join(fdTest, f)),
            ...fs.readdirSync(path.join(fdTest, 'tools')).filter((f) => /\.mjs$/.test(f)).map((f) => path.join(fdTest, 'tools', f)),
        ].filter((fp) => path.basename(fp) !== 'unit-e2ePortReserve.test.mjs')

        it('PR-008 test/ 與 test/tools/ 之可執行碼(含 e2eLib 轉出)不含 killPortListeners(依埠下殺)', function() {
            let hits = []
            for (let fp of files()) {
                for (let l of sourceLines(fp)) {
                    if (/killPortListeners/.test(l.text)) {
                        hits.push(`${path.relative(projRoot, fp)}:${l.no}`)
                    }
                }
            }
            A.deepEqual(hits, [], `不得依埠下殺(占用者可能是別的套件之測試), 改用 reservation.killOwnListeners: ${hits.join(', ')}`)
        })

        it('PR-009 run-e2e-isolated: 以 reservation.killOwnListeners 下殺、遇非本實例占用即拋錯中止; e2e-setup 之服務管理器明確帶入 reservation', function() {
            let runner = codeOf(path.join(fdTest, 'tools', 'run-e2e-isolated.mjs'))
            A.ok(/reservation\.killOwnListeners\(/.test(runner), 'runner 須以 reservation.killOwnListeners 下殺')
            A.ok(/skipped/.test(runner) && /throw new Error\(/.test(runner), 'runner 遇下殺略過(非本實例占用)須拋錯中止, 不得讓下一檔沿用他人之服務')
            A.ok(/beforeEachFile:[\s\S]*?killOwnBackend\(true\)/.test(runner), '每檔前之下殺須為 strict(遇他人占用拋錯); 僅收尾(afterAll)可只印出')
            A.ok(/pids === null\) \{\s*const msg = [^\n]*\n\s*if \(strict\) \{\s*throw new Error\(`\$\{msg\}/.test(runner), '查不到監聽者(pids===null)時 strict 亦須中止(不得只印出就續跑, 否則下一檔沿用占用者之服務)')
            A.ok(/from '\.\/e2ePorts\.mjs'/.test(runner), 'runner 之基準埠與保留取自 e2ePorts.mjs(單一定義)')
            let setup = codeOf(path.join(fdTest, 'tools', 'e2e-setup.mjs'))
            A.ok(/from '\.\/e2ePorts\.mjs'/.test(setup), 'e2e-setup 之基準埠與保留取自 e2ePorts.mjs')
            A.ok(/createServiceManager\(\{[\s\S]*?\breservation,/.test(setup), 'createServiceManager 須明確帶入 reservation(只殺身分已確認屬本實例者)')
            let ports = codeOf(path.join(fdTest, 'tools', 'e2ePorts.mjs'))
            A.ok(/reserveE2ePorts\(\[BACKEND_PORT, ECHO_PORT\], \{ avoid: OTHER_TEST_PORTS \}\)/.test(ports), 'e2ePorts 須一次宣告全部基準埠(後端與 echo)並帶 avoid')
        })
    })

    describe('契約 4b: 逐檔 runner 之行為(真實行程): 遇他人占用即於第一檔前中止, 不殺占用者', function() {
        it('PR-014 手動鎖基準埠(E2E_PORT_OFFSET=0)且 11005 有他人之服務: runner 以非 0 離開、沒有開跑任何 e2e 檔(不沿用他人之服務)、占用者仍在監聽且沒收到請求', async function() {
            //占用者: 能占即真實 http 監聽; 已被他人占用(全套 rest 段 api 後端占著 11005)則以該服務為占用者——兩者 runner 皆須不殺、不沿用
            let o = await holdBusy(BACKEND)
            let child = null
            try {
                //以 spawn 觀察輸出: runner 應自行中止並離開; 若(迴歸時)它開始執行第一個 e2e 檔(輸出「執行」行), 立即終止整棵行程樹, 不讓 mocha／後端被起動
                child = spawn(process.execPath, [path.join(fdTest, 'tools', 'run-e2e-isolated.mjs')], { cwd: projRoot, env: { ...baseEnv(), E2E_PORT_OFFSET: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
                let out = ''
                child.stdout.on('data', (d) => {
                    out += d
                })
                child.stderr.on('data', (d) => {
                    out += d
                })
                let code = await new Promise((resolve) => {
                    let t0 = Date.now()
                    let poll = setInterval(() => {
                        if (/\[run-e2e-isolated\] 執行/.test(out) || Date.now() - t0 > 90000) {
                            clearInterval(poll)
                            resolve(null) //未自行離開(已開始執行 e2e 檔或逾時)
                        }
                    }, 100)
                    child.once('exit', (c) => {
                        clearInterval(poll)
                        resolve(c)
                    })
                })
                if (alive(child.pid)) {
                    spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true })
                }
                A.ok(code !== null && code !== 0, `runner 須自行以非 0 離開碼中止(實得 ${code}): ${out.slice(-400)}`)
                A.ok(/為免下一檔沿用別人之服務而中止/.test(out), `須寫明中止原因: ${out.slice(-400)}`)
                A.ok(!/\[run-e2e-isolated\] 執行/.test(out), '第一檔開跑前即須中止(沒有任何 e2e 檔被執行, 沒有沿用他人之服務)')
                A.equal(await isListening(BACKEND), true, '占用者須仍在監聽(runner 不得殺非本實例之監聽者)')
                A.equal(o.hits(), 0, '占用者不得收到任何 HTTP 請求(沒有 mocha 子行程被起動而打到它)')
            }
            finally {
                if (child && alive(child.pid)) {
                    spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true })
                }
                await o.close()
            }
        })
    })

    describe('契約 5: 測試碼無寫死之連線網址; 寫死之監聽埠與 avoid 清單一致; echo 埠取自保留', function() {
        //例外(資料不是連線): 種子 API 之網址字串 http://localhost:11005/<種子路徑>。它們是畫面顯示之資料(e2e-display 驗 docs 顯示、各 e2e 把它打進新增表單),
        //  不隨位移改——改了會使標準圖不符; 其路徑集合固定, 新增任何其他 host:埠 字面值即紅。
        let SEED_DATA_URL = /^'?http:\/\/localhost:11005\/(getAPIsList|e2eAdd|e2eNew|e2eExt|e2eN)'?$/

        it('PR-010 e2e-／api- 測試與 test/tools 之可執行碼不含「localhost／127.0.0.1 ＋ :數字埠」之寫死連線網址(種子資料字串除外); 網址一律由 baseUrl／resolveE2ePort 衍生', function() {
            let hits = []
            let cand = [
                ...fs.readdirSync(fdTest).filter((f) => /^(e2e|api)-.*\.test\.mjs$/.test(f)).map((f) => path.join(fdTest, f)),
                ...fs.readdirSync(path.join(fdTest, 'tools')).filter((f) => /\.mjs$/.test(f)).map((f) => path.join(fdTest, 'tools', f)),
            ]
            let seedHits = 0
            for (let fp of cand) {
                for (let l of sourceLines(fp)) {
                    let re = /(['"`])?(https?:\/\/)?(localhost|127\.0\.0\.1):\d{2,5}[^\s'"`)]*(['"`])?/g
                    let m
                    while ((m = re.exec(l.text)) !== null) {
                        //以 includes 比對之種子資料字串(e2e-display／e2e-apitest 之 assert.ok(x.includes('http://localhost:11005/getAPIsList')))取引號內文字
                        let lit = m[0].replace(/^['"`]|['"`]$/g, '')
                        if (SEED_DATA_URL.test(lit)) {
                            seedHits++
                            continue
                        }
                        hits.push(`${path.relative(projRoot, fp)}:${l.no}: ${l.text.trim().slice(0, 100)}`)
                    }
                }
            }
            A.deepEqual(hits, [], `寫死之連線網址(位移後會打到別人的服務): ${hits.join(' | ')}`)
            A.ok(seedHits >= 1, '前提: 種子資料字串之例外規則須有命中(若已全部移除, 請連同此例外一併刪除)')
        })

        it('PR-011 api-／unit- 測試及子行程腳本寫死之監聽埠＝e2ePorts.OTHER_TEST_PORTS(新增寫死埠而忘了列入 avoid 即紅)', function() {
            let found = new Set()
            let where = []
            let cand = [
                ...fs.readdirSync(fdTest).filter((f) => /\.mjs$/.test(f) && f !== 'unit-e2ePortReserve.test.mjs').map((f) => path.join(fdTest, f)),
                ...fs.readdirSync(path.join(fdTest, 'tools')).filter((f) => /\.mjs$/.test(f) && f !== 'e2ePorts.mjs').map((f) => path.join(fdTest, 'tools', f)),
            ]
            for (let fp of cand) {
                for (let l of sourceLines(fp)) {
                    let re = /\b(PORT\w*|port|serverPort)\b\s*[:=]\s*(\d{4,5})\b|\blisten\(\s*(\d{4,5})\b/g
                    let m
                    while ((m = re.exec(l.text)) !== null) {
                        found.add(Number(m[2] || m[3]))
                        where.push(`${path.basename(fp)}:${l.no}=${m[2] || m[3]}`)
                    }
                }
            }
            //自 e2ePorts.mjs 原始碼取清單, 不 import 該模組(import 會在本 mocha 行程內實際呼叫 reserveE2ePorts, 使本盤點依賴環境)
            let m = /OTHER_TEST_PORTS\s*=\s*\[([^\]]*)\]/.exec(codeOf(path.join(fdTest, 'tools', 'e2ePorts.mjs')))
            A.ok(m, 'e2ePorts.mjs 須有 OTHER_TEST_PORTS 陣列')
            let listed = m[1].split(',').map((s) => Number(s.trim())).filter((n) => n > 0)
            A.deepEqual([...found].sort((a, b) => a - b), listed.sort((a, b) => a - b), `寫死之監聽埠(${where.join(', ')})須與 e2ePorts.OTHER_TEST_PORTS 一致`)
        })

        it('PR-012 e2e-apitest 之 echo 埠取自 e2ePorts 並經 resolveE2ePort 解析(無寫死 11077); 比對端覆蓋已接線; 位移時禁止寫入正式標準圖', function() {
            let src = codeOf(path.join(fdTest, 'e2e-apitest.test.mjs'))
            A.ok(!/\b11077\b/.test(src), 'e2e-apitest 不得寫死 echo 埠 11077(基準埠只定義於 e2ePorts.mjs)')
            A.ok(/from '\.\/tools\/e2ePorts\.mjs'/.test(src), 'echo 基準埠須取自 e2ePorts.mjs')
            A.ok(/resolveE2ePort\(ECHO_PORT\)/.test(src) && /listen\(ECHO_PORT_ACTUAL/.test(src), 'echo server 須聽 resolveE2ePort 解析後之實際埠')
            A.ok(/compareBuf:\s*PORTS_SHIFTED\s*\?\s*comparePortBuf\s*:\s*null/.test(src) && /overlayPortRegions\(/.test(src) && /findPortRegions\(/.test(src), '位移時含實際埠之畫面區域須由比對端覆蓋(E7): runBaselineCase 之 compareBuf 於位移時接 comparePortBuf')
            A.ok(/E2E_BASELINE_OUT_DIR/.test(src) && /標準圖只能在基準埠產製/.test(src), '位移實例不得寫正式標準圖(畫面含埠): 產製模式須有守門')
        })
    })
})
