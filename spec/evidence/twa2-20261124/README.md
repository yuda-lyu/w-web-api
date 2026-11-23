# twa2 證據(2026-11-24; 排程第 603 項 w-web-api 部分; ADR-063)

本夾為「console 之形狀與錯誤類別摘要改用 wsemi 共用函數」之探測、批次改檔與變異腳本。腳本於專案根以 `node spec/evidence/twa2-20261124/<檔>` 執行(相對路徑以專案根為 cwd); 不含使用端專案名與本機路徑。

| 檔 | 內容 |
|---|---|
| `probe-shape.mjs` | 同一組輸入(基本型別、陣列、類別實例、null-prototype、循環、25 鍵、長鍵名、控制／格式字元鍵、Proxy、內建物件；錯誤 14 種；請求本體 7 種)分別跑修前之本地實作(前端 `describeShape`／`describeErr`、伺服端 `shapeOf`／`errBrief`／`typeOf`／`payloadShape`)與 wsemi `getDiagShape`／`getDiagBriefErr`, 產字樣改變表。修前實作取自修前版本之鏡像根(`git archive` 解到 `./tmp/twa2/pre/`; 其 `src/describeShape.mjs`、`server/maskLog.mjs` 為本腳本所匯入), 故重跑須先重建該鏡像根 |
| `shape-diff.json` | 上列探測之輸出(52 列: `shape` 31、`err` 14、`payload` 7) |
| `migrate-front.mjs` | 前端 7 檔之批次遷移(`describeShape(`→`getDiagShape(` 5 處、`describeErr(`→`getDiagBriefErr(` 15 處、匯入行改自 `wsemi/src`); 逐檔斷言匯入行恰 1 行、改後無舊名 |
| `migrate-server.mjs` | `server/WWebApi.mjs`、`srv.mjs` 之批次遷移(`typeOf` 12 站〔其中建構參數 7 站帶 `{ keys: false }`〕、`shapeOf` 11 站、`errBrief` 4 站、`payloadShape` 5 站〔4 站另附 `rows` 之形狀〕; `srv.mjs` 4 站); 刪 `typeOf`、`payloadShape` 閉包; 逐項斷言替換次數 |
| `mutate.mjs` | 變異驗證: 對產品碼與測試輔助逐項植入單點缺陷, 跑相關測試須轉紅; 先跑未變異對照組; 錨點須恰出現指定次數(不符報「錨點錯誤」), 每項還原後以 sha256 回驗。須經測試鎖執行 |
| `mutation-results.json` | 上列變異之結果(逐項 verdict、擊殺之測試名) |
