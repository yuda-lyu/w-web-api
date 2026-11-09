# 回饋(w-web-api)

> 任務中發現之自有套件、全域技能、全域設定之調整與抽提提案(全域設定 §12.2)。只增不改, 處置結果另記一列。一條一列: 日期、類別、對象、內容、依據。回饋是紀錄與提案, 不等於自行修改。

| 日期 | 類別 | 對象 | 內容 | 依據 |
|---|---|---|---|---|
| 2026-11-09 | 自有套件 | w-web-api 之 `test/tools/apiHarness.mjs`(api 測試之建置步驟) | 跑 `api-*` 測試會執行 `vue-cli build` 並輸出到入版控之 `dist/`: 刪除 `dist/index.tmp`、`dist/w-web-api.umd.js(.map)` 並改寫 `tableTags-web-api.json`; 每個跑 api 測試之 agent 都須事先備份、事後還原並回驗, 漏做即污染工作樹(`dist/`、`docs/` 不得手改)。提案: harness 把前端建置輸出導向 `test/_tmp/` 或其他不入版控之夾(`vue-cli-service build --dest`), 使跑測試不再動 `dist/` | 本輪全部 unit＋api 跑完後 `git status`: `D dist/index.tmp`、`D dist/w-web-api.umd.js(.map)`、`M tableTags-web-api.json`(任務夾 20261109110349 之 `agent-out/wa114-evidence/logs/20261109-151238-wa114-nonE2E.log`); 同型記載見 `sgud/state/state.md` 版本與依賴之 2026-10-30、10-31、11-03、11-04 各條 |
| 2026-11-09 | 全域技能 | 新增建議: 還原被建置或測試改動之入版控產物(`dist/` 等)之固定作法 | 至少 5 輪各自重複處理「測試後還原 dist 並逐檔回驗」, 且有陷阱: ①`git archive … \| tar -x` 在 `core.autocrlf=true` 下輸出 CRLF 轉換後之內容(與 index 記錄之 blob 原大小不同), 還原後 `git status` 反而顯示 `M`; 正確為以 `git cat-file blob HEAD:<檔>` 之原位元組寫回(用 `execFileSync('git', …)`＋`fs.writeFileSync`, 不用 shell 重導向), 並以 md5 對 blob 回驗(index 記錄之 size 等於 blob 大小即證明原工作樹為原位元組); ②不得用 `git checkout`／`restore`。提案抽成共用腳本(列出目標檔、備份、還原、md5 回驗)供各套件主責 agent 呼叫 | 本輪以 `git archive` 還原後 `git status` 多出 4 個 `M`(`git ls-files --debug` 之 size 1474 對工作檔 1478), 改以 blob 原位元組還原後清除(任務夾 20261109110349 之 `agent-out/wa114-evidence/scripts/restore-dist.mjs`); 同型作法散見 `sgud/state/state.md` 2026-11-04 條 |
