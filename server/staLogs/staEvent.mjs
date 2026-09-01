import { staLogs } from './staLogsCore.callWorker.mjs'


//staEvent（通用事件頻率統計）：掃 fdLog 下所有 NDJSON log 檔，依時間 bucket（hr/day）+ 各 event 名聚合次數。
//自 ADR-028 起由 staLogsCore 提供：單趟掃描 + 檔級彙總快取（封閉小時檔只掃一次）+ single-flight，掃描交單一 worker（主執行緒不阻塞）。
//簽章與輸出格式不變（時間遞增、無資料時段補 { count: 0 }）：
//  [
//    { time: '2026-06-22T10', data: { count: 6, 'verifyConn': 3, 'kpfun-getApisList': 2, 'kpfun-saveApi': 1 } },
//    { time: '2026-06-22T11', data: { count: 0 } },
//    ...
//  ]
//參數：timeLength 往回統計天數（預設 7）；timeInterval 'hr'（預設）/ 'day'；opt.fdLog log 資料夾（預設 './logs'）；opt.srLog（單檔略過時記 warn）
async function staEvent(timeLength = 7, timeInterval = 'hr', opt = {}) {
    let r = await staLogs(timeLength, timeInterval, opt)
    return r.rs
}


export default staEvent
