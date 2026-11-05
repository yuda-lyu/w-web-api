//e2e 埠之單一定義與保留(排程第 309 項, 2026-11-05 wa309; 規格 C:/opensrcOper/dspec/e2e埠與多套件同跑.md E1～E8; 套件 w-package-tools-e2e >= 1.0.22 README §2.12; 規則帳本 R-E2E-PORT-01)。
//
//本模組為「基準埠」唯一定義處, 並於模組載入時呼叫一次 reserveE2ePorts(本實例全部基準埠)——須早於任何 resolveE2ePort／createServiceManager:
//  e2e-setup.mjs、run-e2e-isolated.mjs 與 e2e-apitest.test.mjs 皆自本檔取得基準埠(ES 模組先評估被匯入者, 故先於其本體之任何取埠)。
//行為(沒有占用時與導入前相同):
//  - 基準埠 11005(後端)／11077(e2e-apitest 之 echo)皆空閒 → 即基準埠, E2E_PORT_OFFSET 維持未設, 標準圖與行為不變。
//  - 任一基準埠被占用(別的套件正在跑, 或本機其他服務) → 整組位移 portStep(預設 100)至空閒之組, 位移寫入 E2E_PORT_OFFSET, 其後
//    resolveE2ePort／createServiceManager／子行程一律取得同一組實際埠; 實際埠印入輸出([e2e-port] …)。絕不殺占用者(E4)。
//  - 手動設 E2E_PORT_OFFSET(含 0)＝不換埠(多開工具配發位移; 0 為「沿用本機已起之服務」逃生口); 上層已保留(E2E_PORT_HOLD; 逐檔 runner 之子行程、多開各組)＝沿用上層之位移。
//OTHER_TEST_PORTS 為本套件 api-／unit- 測試寫死之監聽埠(盤點 2026-11-05, 實查見規則帳本 R-E2E-PORT-01; 以 unit-e2ePortReserve PR-011 守護與實際寫死埠一致):
//  位移後之實際埠不得落在其上。現行基準埠 11005／11077 以間距 100 位移, 實際埠恆以 05／77 結尾, 不會落在 85xx 與 110[8][2-7]; 列出為防日後改基準埠或間距。
//  這些測試埠本身與他套件(w-web-perm 之 8561～8565 等)之撞埠屬規格 E8(非 e2e 測試之監聽埠), 另案處理。

import net from 'net'
import { reserveE2ePorts } from './e2eLib.mjs'

//後端基準埠(正式實例用; 與 settings.json 之 serverPort、srv.mjs 之預設 11005 一致; 後端同時 serve build 後之 dist, 故 e2e 直接瀏覽此埠, 無獨立前端 dev server)。
//其餘組埠處一律經 resolveE2ePort(基準埠)／reservation.portOf(基準埠)。
export const BACKEND_PORT = 11005
//e2e-apitest 自建之 echo 目標埠(後端 proxy 代發之對象; 位址列網址進標準圖, 位移時由比對端覆蓋該處, 見 e2e-apitest.test.mjs)
export const ECHO_PORT = 11077
//api-／unit- 測試寫死之監聽埠: api 8550～8574(各 api-*.test.mjs 之 PORT／PORT_ECHO／PORT_LOG、api-externalRows 之 PORT_Y／PORT_N 等)、
//  unit 11082～11087(unit-procProxy 11082／11084、PORT_CLOSED 11083〔刻意無人監聽〕、unit-provideTabs 11085、api-doubleclick／unit-contract 11086、unit-procProxyTarget 11087)
export const OTHER_TEST_PORTS = [
    8550, 8551, 8552, 8553, 8554, 8555, 8556, 8557, 8558, 8559, 8560, 8561, 8562, 8563, 8564, 8565, 8566, 8567, 8568, 8569, 8570, 8571, 8572, 8573, 8574,
    11082, 11083, 11084, 11085, 11086, 11087
]

export const reservation = reserveE2ePorts([BACKEND_PORT, ECHO_PORT], { avoid: OTHER_TEST_PORTS })

//行程內監聽者(e2e-apitest 之 echo)於綁定前之連線檢查(規格 E5): Windows 允許「綁特定位址(127.0.0.1)之監聽者」與「已綁萬用位址(0.0.0.0、::、::1)之占用者」並存,
//  不會 EADDRINUSE, 但其後打 127.0.0.1 之連線全歸後綁者, 即搶走占用者之新連線(2026-11-05 修前以真實占用者實測: 占用者綁雙棧時, echo 並存綁定成功且 28 次探測被 echo 回應)。
//  故綁定前先以 TCP 連線檢查該埠有無人在應答(只連線不送 HTTP, 不算打到占用者之請求); 有人應答即拋錯寫明, 不綁定。只有 ECONNREFUSED(本機回送位址上無監聽者)視為無人, 其餘錯誤與逾時皆 fail-closed。
export function assertPortNotAnswering(port, label = '', opt = {}) {
    let connect = (opt && opt.connect) || net.connect //opt.connect 供單元測試注入(模擬各種連線錯誤); 預設 net.connect
    return new Promise((resolve, reject) => {
        let s = connect({ host: '127.0.0.1', port })
        s.setTimeout(3000)
        s.once('connect', () => {
            s.destroy()
            reject(new Error(`${label || '服務'}之埠 ${port} 於保留後被他人占用(127.0.0.1:${port} 有監聽者在應答), 不綁定(免搶走其連線)、不下殺; 重跑即重選埠`))
        })
        s.once('timeout', () => {
            //連線逾時(本機回送位址正常為立即成功或立即被拒): 狀態不明, 視為被占用(寧缺勿濫, 不綁定)
            s.destroy()
            reject(new Error(`${label || '服務'}之埠 ${port} 連線檢查逾時(狀態不明), 不綁定; 重跑即重選埠`))
        })
        s.once('error', (err) => {
            //只有「連線被拒」(本機回送位址上沒有任何監聽者)才視為無人; 其他錯誤(EACCES、ENETUNREACH、EMFILE…)狀態不明, 一律不綁定(fail-closed)
            if (err && err.code === 'ECONNREFUSED') {
                resolve()
                return
            }
            reject(new Error(`${label || '服務'}之埠 ${port} 連線檢查失敗(${err && err.code ? err.code : String(err)}, 狀態不明), 不綁定; 重跑即重選埠`))
        })
    })
}
