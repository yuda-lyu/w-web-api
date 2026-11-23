# twa1 證據(2026-11-23; 排程第 301、570、206 項〔api 側〕)

本夾隨 repo(`spec/evidence/`), 供事後重跑與核對; 規則與取捨見 `spec/設計要點與取捨.md` ADR-061／ADR-062／ADR-040 Update、`sgud/rule/rulebook_backend.md` R-STA-TIMELENGTH-01／R-CONSOLE-NOVAL-01。

| 檔 | 內容 | 重跑 |
|---|---|---|
| `repro301-run.mjs` | 第 301 項最小重現: 逐候選(`timeLength` 有效 11 種／無效 33 種、`opt.timeNow` 15 種)以逾時保護之子行程(`test/tools/timeLengthChild.mjs`)跑 `genPlan`／`staLogs`／worker 版／`staEvent`; 逾時 6 秒視為同步無窮迴圈 | `node spec/evidence/twa1-20261123/repro301-run.mjs [根目錄] [逾時ms] [輸出 jsonl]`; 根目錄可指向修前碼之鏡像根(`git archive HEAD server src test/tools` 解開後補 `timeLengthChild.mjs`) |
| `repro301-prefix.jsonl` | 修前(HEAD `3b977dc`)輸出: `timeLength` 之 33 種無效值皆被拒(固定鍵 `errTimeLengthInvalid`), **唯數字字串 `'7'`、`' 7 '`、`'1e1'`、`'+7'` 被拒**; `opt.timeNow` 之 `NaN`、`±Infinity`、`1e300`、`-1e300`、`±8.64e15`、`-8.64e15 + 5 天` 共 8 種 **hang**, 超過 2100 與負值被照單採用 | — |
| `repro301-postfix.jsonl` | 修後同一腳本之輸出(全部候選不卡住; 數字字串收下; 無效 `timeNow` 退回現在) | 同上(根目錄為專案根) |
| `measure570.mjs` | 第 570 項實測: 已安裝 w-serv-orm(1.1.52)對 NaN、±Infinity、布林、物件主鍵之 `procOrm insert／save` 行為(以公開主入口 `WServOrm` ＋記憶體替身組出真 `procOrm`), 並量 `checkRowIds` 與 JSON 往返 | `node spec/evidence/twa1-20261123/measure570.mjs` |
| `measure570.log` | 上列之輸出(整批 reject `invalid id: data[1]`、零寫入、底層未被呼叫; 未給主鍵補主鍵) | — |
| `mutate.mjs` | 變異驗證(單點植入、跑目標測試、判定擊殺／存活／未判定、每項還原並以 sha256 回驗; 錨點須恰出現一次; 先跑未變異對照組須全綠) | `node spec/evidence/twa1-20261123/mutate.mjs <301\|570\|206\|e2e> [輸出 json]`(須在測試鎖下, `quiet-run --lock`) |
| `mutation-results-301.json`、`-570.json`、`-206.json`、`-e2e.json` | 凍結碼上之變異結果: 301 共 18 項、570 共 2 項、206 共 17 項(單元層)、e2e 共 2 項(真瀏覽器層), **39／39 擊殺, 全部還原後 sha256 與變異前相同** | — |
| `red-prefix-summary.txt` | 修前紅: 新測試對 HEAD 鏡像根(補載入 shim)之 quiet-run 摘要: 52 passing／25 failing | — |
