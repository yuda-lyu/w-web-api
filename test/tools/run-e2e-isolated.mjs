//逐檔隔離執行 e2e：每個 e2e 檔以「獨立 mocha 進程 + 全新後端」跑（移植自 w-web-perm，技能 §9.2）。
//
//本專案後端 srv.mjs（11005）同時 serve build 後之 dist 與 API，無獨立前端 dev server；每檔前殺後端 → 新 mocha 進程之
//startServersOnce 偵測 11005 沒人 → 重新 build + spawn 全新後端（build 約數十秒；若要省 build 可先自行 `npm run build`，
//startServersOnce 仍會 build 一次——此為 hermetic 之代價，逐檔隔離優先）。
//
//定位：`npm test` 依全域 §16.5 為單一 mocha 進程跑全部 test/*.test.mjs（各 e2e 檔以 after 還原後端 settings / 資料表使其 hermetic）；
//  本 runner 為輔助工具（全域 §16.4 test/tools/），用於 flake 排查或需完全隔離之情境：每檔獨立 mocha 進程 + 全新後端。
//
//2026-09-30 起組裝自 w-package-tools-e2e（runIsolatedE2e、killPortListeners；經 ./e2eLib.mjs 引用），與 w-web-sso / perm / task 之 runner 同一實作。
//  原本檔手寫同一迴圈（逐檔殺 port → 等 2 秒 → `npx mocha` → 彙總），改用套件後行為差異：①殺 port 只殺「本機位址為 11005 且 LISTENING」者
//  （原以 findstr ":11005" 逐行比對再濾 LISTENING；非 Windows 原以 lsof 殺任何使用該 port 者，含連線端）；②有本地 mocha 時以 node 直接執行
//  node_modules/mocha/bin/mocha.js、不經 shell（原為 npx mocha，Windows 下經 cmd.exe）。測試檔清單（pattern /^e2e-.*\.test\.mjs$/，依檔名排序）、
//  mocha 參數（--reporter list --timeout 300000）、逐檔結果與結束碼皆同。
//
//2026-11-05 起(排程第 309 項, 規格 E1～E4): 本 runner 於最上層(經 e2ePorts.mjs)先呼叫一次 reserveE2ePorts, 子行程之 mocha 繼承保留(E2E_PORT_HOLD／E2E_PORT_OFFSET)而不再各自換埠;
//  原 killPortListeners(依埠殺任何監聽者, 占用者可能是別的套件之測試; 2026-11-05 修前以真實占用者實測第一檔前即被殺)改為 reservation.killOwnListeners(只殺身分已確認屬本實例者);
//  該埠上有非本實例之監聽者時不殺並拋錯中止(不讓下一檔沿用別人之服務)。
//
//用法：node test/tools/run-e2e-isolated.mjs   (exit 0=全綠；非 0=有失敗檔)

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runIsolatedE2e } from './e2eLib.mjs'
import { BACKEND_PORT, reservation } from './e2ePorts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url)) //test/tools
//後端實際埠: 基準埠 11005 經保留後之實際埠(沒有占用且未設 E2E_PORT_OFFSET 時＝11005, 與導入前相同; 與 e2e-setup.mjs 同源)
const BACKEND_ACTUAL_PORT = reservation.portOf(BACKEND_PORT)

//只殺本實例之後端監聽者; 有非本實例之監聽者(skipped)不殺: strict 時拋錯中止(每檔前, 免下一檔沿用別人之服務), 否則只印出(收尾, 不遮蔽逐檔結果)。
//查不到監聽者(r.pids === null: 取行程表失敗, 高負載下偶發逾時)時先重試 3 次; 仍查不到＝無法確認埠上有無別人之服務: 不殺(取不到不殺), 且 strict 時同樣中止
//  (2026-11-05 修: 原只印出就續跑, 下一檔之 mocha 見埠有回應即沿用占用者之服務, 實測 34 次請求打到占用者; wa309 獨立審查亦指出)。
const killOwnBackend = async (strict) => {
    let r = null
    for (let i = 0; i < 3; i++) {
        r = reservation.killOwnListeners(BACKEND_ACTUAL_PORT)
        if (r.pids !== null) {
            break
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (r.pids === null) {
        const msg = `[run-e2e-isolated] 查詢埠 ${BACKEND_ACTUAL_PORT} 監聽者之工具不可用(重試 3 次), 無法確認埠上有無非本實例之監聽者, 未殺`
        if (strict) {
            throw new Error(`${msg}; 為免下一檔沿用別人之服務而中止`)
        }
        console.log(msg)
    }
    else if (r.skipped.length > 0) {
        const msg = `[run-e2e-isolated] 埠 ${BACKEND_ACTUAL_PORT} 有非本實例之監聽者(PID ${r.skipped.join(', ')}), 不下殺(占用者可能是別的套件正在跑之測試)`
        if (strict) {
            throw new Error(`${msg}; 為免下一檔沿用別人之服務而中止`)
        }
        console.log(msg)
    }
    return r
}

let { failed } = await runIsolatedE2e({
    projRoot: join(__dirname, '..', '..'),
    testDir: join(__dirname, '..'),
    beforeEachFile: async () => {
        //每檔前殺本實例之後端 → 新 mocha 進程之 startServersOnce 重新 build + spawn 全新後端
        await killOwnBackend(true)
        await new Promise((resolve) => setTimeout(resolve, 2000))
    },
    afterAll: async () => {
        //收尾殺本實例之後端
        await killOwnBackend(false)
    },
})
process.exit(failed === 0 ? 0 : 1)
