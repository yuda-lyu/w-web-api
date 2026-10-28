# 規則帳本(w-web-api)

本檔為套件設計與開發階段之規則帳本,為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.

## 分冊索引(2026-10-22 起; 全域 §14 過長整理, 原 59,282 位元組, 依類型拆分、節號與標題不變、只搬不刪)

本檔只留索引; 要查哪類規則讀哪個分冊, 不必整份讀入.

| 分冊 | 類型 | 內容 |
|---|---|---|
| `rulebook_test.md` | 測試 | 測試配置、e2e 落地映射 |
| `rulebook_backend.md` | 後端與外部同步 | 後端錯誤契約、w-serv-orm 設定／資料通道／外部同步／生命週期、打包後之可用性、權杖外洩防護、外部同步契約、**呼叫者身分驗證(資料通道連線閘 R-CONNGATE-01、執行身分 R-EXECID-01、Authorization 方案 R-AUTHSCHEME-01)**、**後台與資料通道只限系統管理者(R-ADMINONLY-01)**、**應用系統路由之系統管理者等級與後台登入檢查回應欄位白名單(R-APPLEVEL-01)**、**一般使用者以 token 取 API 清單之公開欄位白名單(R-PUBLICAPIS-01)**、**系統函數收緊(`sysFuncsPublic` 只公開 `[sys:getFuncList]`、輪詢須帶 token; R-SYSFUNCS-01)**、**代發請求之內建目標位址政策(R-PROXYTARGET-01)**、**w-serv-orm 診斷輸出轉入 srLog(`opt.funLog`; R-ORMDIAG-01)**、迭代使用端傳入之物件、〔跨套件規格〕 |
| `rulebook_ui.md` | 前端 UI | 上方標題列 RWD、計算高度之容器、按鈕雙擊防護 |
| `rulebook_gaps.md` | 已知缺口與待辦 | 已知缺口 / 待辦(現況摘要見 `../state/state.md`) |
| `rulebook_concurrency.md` | 多人同時編輯(原則 10) | 欄位三分類、寫入者全集、前端資料流、寫入契約草案、同步穩定識別、現存缺陷實證、第二波實作規劃(2026-10-22 inv01 盤點新建); **§9 實作結果與規則(2026-10-23 api-run01: R-CONC-01~06、V1~V14 驗收對照)** |

### 節 → 分冊對照(原 `rulebook.md` 各節)

| 節標題 | 分冊 |
|---|---|
| 測試配置(對應全域 §16.3–16.5) | `rulebook_test.md` |
| e2e 落地映射(對應全域技能[role-coder-for-test-e2e] §3 契約) | `rulebook_test.md` |
| 後端錯誤契約(對應 ADR-015 / ADR-029 / ADR-030) | `rulebook_backend.md` |
| w-serv-orm 設定、資料通道、外部同步與生命週期(對照 ADR-038; 2026-10-14, w-serv-orm 1.1.10 / w-serv-hapi 1.1.6 升版) | `rulebook_backend.md` |
| 打包後之可用性(對照 ADR-039; X1; 2026-10-14, 與 w-web-sso / w-web-perm 同一設計) | `rulebook_backend.md` |
| 權杖外洩防護(對照 ADR-033; w-web-sso ADR-068 之 W / M / K 契約) | `rulebook_backend.md` |
| 外部同步契約(對照 ADR-031; 含 R-IMPORT-01 外部匯入〔ADR-043〕與 R-EXT-LOCK-01 外部列受保護〔ADR-044, 2026-10-23 api-run02〕) | `rulebook_backend.md` |
| 迭代使用端傳入之物件與使用端字串鍵(R-OBJ-ITER-01 / R-KEY-01; 2026-10-20, 主控第 90 項; 對應 wsemi 同名規則、w-web-perm 與 w-web-sso 同日修正) | `rulebook_backend.md` |
| 呼叫者身分驗證:資料通道連線閘(R-CONNGATE-01; 跨套件規格 w-web呼叫者身分驗證; 2026-10-23, api-run01, ADR-048)＋執行身分(R-EXECID-01)、Authorization 方案(R-AUTHSCHEME-01)、代發請求之內建目標位址政策(R-PROXYTARGET-01)(2026-10-23, api-run02, ADR-049／050) | `rulebook_backend.md` |
| 後台與資料通道只限系統管理者(R-ADMINONLY-01)＋一般使用者以 token 取 API 清單(R-PUBLICAPIS-01)(2026-10-24, api-run01〔任務 20261024105624〕, ADR-051) | `rulebook_backend.md` |
| 應用系統路由(`POST /syncAndReplaceTabs`)由套件自行要求系統管理者等級＋後台登入檢查成功只回欄位白名單(R-APPLEVEL-01; 存取表 §3.2 逐格 `api-accessMatrix`)(2026-10-24, api-run01〔任務 20261024182736, 排程第 133 項〕, ADR-052) | `rulebook_backend.md` |
| 系統函數收緊:`sysFuncsPublic` 顯式只公開 `[sys:getFuncList]`、輪詢須帶有效 `__sysToken__`(R-SYSFUNCS-01; 跨套件〈使用者身分驗證原則〉二.7、二.8; `api-sysFuncs`)(2026-10-25, api-run01〔任務 20261025161335, 排程第 128 項〕, ADR-053) | `rulebook_backend.md` |
| 指系統管理者角色之用詞一律為「系統管理者」(R-TERM-ADMIN-01; 使用者 2026-10-26 裁示, 源自 rddmanager issue #16、#17; 2026-10-26, api-run01〔任務 20261026145816〕) | `rulebook_backend.md` |
| w-serv-orm 診斷輸出(`opt.funLog`, 1.1.20 起)轉入 srLog:只收 label 與 safe、不收 detail(R-ORMDIAG-01; `unit-ormDiagLog`、`api-ormDiag`)(2026-10-28, api-run01〔任務 20261028054319, 排程第 154 項〕, ADR-054) | `rulebook_backend.md` |
| 〔跨套件規格〕(主控 2026-10-16 依使用者交辦寫入) | `rulebook_backend.md` |
| 上方標題列 RWD(對照 ADR-032; 機制同 w-web-sso ADR-067) | `rulebook_ui.md` |
| 計算高度之容器(2026-09-29) | `rulebook_ui.md` |
| 按鈕雙擊防護(對照 ADR-034; 機制同 w-web-sso ADR-074; 2026-09-29) | `rulebook_ui.md` |
| 已知缺口 / 待辦 | `rulebook_gaps.md` |
| 多人同時編輯(原則 10)與其 §1 欄位三分類、§2 寫入者全集、§3 前端資料流、§4 寫入契約草案、§5 同步穩定識別、§6 現存缺陷實證、§7 第二波實作規劃、§8 決定與待裁示(2026-10-22 新建, 非自原檔拆出) | `rulebook_concurrency.md` |
