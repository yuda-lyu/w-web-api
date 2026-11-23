//api-staEventTimeLength: 資料通道 getStaEvent 之 timeLength 入口(排程第 301 項〔api 側〕; 規格〈輸入參數之檢測機制〉K4／K7／K9、§5.1 遠端入口依該套件錯誤契約回固定鍵)
//真後端(隔離子行程: 獨立 lmdb、埠 8574; 與 api-logLeak／api-sysFuncs／api-ormDiag* 同埠循序), 經真實資料通道(/api/main, w-converhp 之 obj2u8arr 編碼)直打 kpFunExt getStaEvent。
//ATL-001 有效值(含數字字串 '7'、' 7 '、'1e1')照常回統計(桶數同數字 7); 數字字串以轉換值為準(修前 '7' 被拒)
//ATL-002 無效值(經線路可送達者: 負數、小數、超上限、非數字字串、null、布林、物件、陣列、Infinity／NaN〔線路上已為 null〕等)一律 reject 固定鍵 errTimeLengthInvalid, 數秒內回應, 不回顯值; 其後後端仍存活(照常回有效值)
//ATL-003 srLog 記錄 getStaEvent-error 之 err 為固定鍵, 不含送入之值
//why 真後端: 單元層 genPlan／staLogs 已由 unit-staLogs-timeLength 逐層釘住; 本檔守「遠端入口確實經過同一檢測」之端到端不變式(kpFunExt → staEvent → staLogs → genPlan), 並證明無效值不卡死後端(同步無窮迴圈會使其後之請求全部逾時)。
//跑法: npx mocha test/api-staEventTimeLength.test.mjs --timeout 180000(須在測試鎖下)
import './staLogs-golden/setTz.mjs' //釘 Asia/Taipei(子行程繼承): 桶數之斷言於有夏令時間之時區會差 1
import assert from 'assert'
import get from 'lodash-es/get.js'
import { startApiServer, waitLogs } from './tools/apiHarness.mjs'
import { postMain } from './tools/apiMain.mjs'


let PORT = 8574
let S = null
let TOKEN = 'sys'
let SECRET = 'ZZ-secret-timelength-4417' //送入 timeLength 之哨兵字串: 不得出現在回應與 srLog


//call: 以 postMain 取得原始回應文字(斷言不回顯值用), 並計回應時間
let call = async (timeLength, timeInterval = 'hr') => {
    let t0 = Date.now()
    let { raw, data } = await postMain(S.base, TOKEN, { func: 'getStaEvent', input: { __sysInputArgs__: [timeLength, timeInterval], __sysToken__: TOKEN } })
    let state = get(data, 'success.output.state', '')
    return { ok: state === 'success', state, msg: get(data, 'success.output.msg', null), raw, data, ms: Date.now() - t0 }
}


describe('api-staEventTimeLength (getStaEvent 之 timeLength 入口, 排程第 301 項〔api 側〕)', function() {
    this.timeout(180000)

    before(async function() {
        this.timeout(120000)
        S = await startApiServer({ name: 'staEventTimeLength', port: PORT })
    })

    after(async function() {
        this.timeout(60000)
        if (S) {
            await S.stop()
        }
    })


    it('ATL-001 有效值: 7、數字字串 \'7\'、\' 7 \'、\'1e1\' 照常回統計; 桶數 = 天數 × 24 + 1', async function() {
        for (let [v, days] of [[7, 7], ['7', 7], [' 7 ', 7], ['1e1', 10], [0, 0], [1, 1], ['0', 0]]) {
            let r = await call(v)
            assert.ok(r.ok, `timeLength=${JSON.stringify(v)} 應成功, 實得 ${r.state} ${JSON.stringify(r.msg).slice(0, 120)}`)
            assert.ok(Array.isArray(r.msg), `timeLength=${JSON.stringify(v)} 應回陣列`)
            assert.ok(r.msg.length === days * 24 + 1 || r.msg.length === days * 24 + 2, `timeLength=${JSON.stringify(v)} 桶數應為 ${days * 24 + 1}(跨 DST 之時區容許 +1), 實得 ${r.msg.length}`)
        }
        //'day' 粒度
        let rd = await call('1', 'day')
        assert.ok(rd.ok && Array.isArray(rd.msg) && rd.msg.length === 2, `day 粒度 '1' 應回 2 桶, 實得 ${JSON.stringify(rd.msg).slice(0, 120)}`)
    })

    it('ATL-002 無效值經資料通道一律 reject 固定鍵 errTimeLengthInvalid, 數秒內回應, 不回顯值; 其後後端仍存活', async function() {
        let bads = [-1, -1e9, 1.5, 3651, 100000, 1e20, 'abc', '', '   ', '0x10', 'Infinity', 'NaN', '7.5', '-1', '1e400', SECRET, null, true, false, {}, [], [7], { valueOf: 7 }, NaN, Infinity, -Infinity]
        for (let v of bads) {
            let r = await call(v)
            assert.strictEqual(r.ok, false, `timeLength=${JSON.stringify(v)} 應被拒`)
            assert.strictEqual(r.state, 'error')
            assert.strictEqual(r.msg, 'errTimeLengthInvalid', `timeLength=${JSON.stringify(v)} 應回固定鍵, 實得 ${JSON.stringify(r.msg).slice(0, 120)}`)
            assert.ok(r.ms < 8000, `timeLength=${JSON.stringify(v)} 應數秒內回應(實得 ${r.ms} ms)`)
            assert.ok(!r.raw.includes(SECRET), `timeLength=${JSON.stringify(v)} 之回應不得回顯送入之值(含哨兵字串)`)
        }
        //無效值處理完後後端仍可正常服務
        let ok = await call(7)
        assert.ok(ok.ok && Array.isArray(ok.msg) && ok.msg.length >= 169, `無效值之後有效值應照常, 實得 ${ok.state}`)
    })

    it('ATL-003 srLog 記 kpfun-getStaEvent 錯誤為固定鍵, 不含送入之值', async function() {
        await call(SECRET)
        let lines = await waitLogs(S.cwd, (ls) => ls.some((l) => l.includes('kpfun-getStaEvent') && l.includes('errTimeLengthInvalid')))
        let hits = lines.filter((l) => l.includes('kpfun-getStaEvent') && l.includes('errTimeLengthInvalid'))
        assert.ok(hits.length >= 1, `srLog 應有 kpfun-getStaEvent 且 err 為 errTimeLengthInvalid, 實得 ${lines.length} 行`)
        for (let l of lines) {
            assert.ok(!l.includes(SECRET), `srLog 不得含送入之值: ${l.slice(0, 200)}`)
        }
    })
})
