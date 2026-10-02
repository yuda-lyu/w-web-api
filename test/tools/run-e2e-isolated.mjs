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
//用法：node test/tools/run-e2e-isolated.mjs   (exit 0=全綠；非 0=有失敗檔)

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runIsolatedE2e, killPortListeners } from './e2eLib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url)) //test/tools
const BACKEND_PORT = 11005

let { failed } = await runIsolatedE2e({
    projRoot: join(__dirname, '..', '..'),
    testDir: join(__dirname, '..'),
    beforeEachFile: async () => {
        //每檔前殺後端 → 新 mocha 進程之 startServersOnce 重新 build + spawn 全新後端
        killPortListeners(BACKEND_PORT)
        await new Promise((resolve) => setTimeout(resolve, 2000))
    },
    afterAll: () => {
        //收尾殺後端
        killPortListeners(BACKEND_PORT)
    },
})
process.exit(failed === 0 ? 0 : 1)
