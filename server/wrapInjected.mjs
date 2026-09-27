import isarr from 'wsemi/src/isarr.mjs'
import isErr from 'wsemi/src/isErr.mjs'
import { pickErrName } from './maskLog.mjs'


//注入函數（建構子參數 getUserByToken／verifyClientUser／verifyAppUser，由部署方提供）之唯一呼叫出口（W 契約；
//w-web-sso tmp/sso-token-leak-全盤.md〈六〉「共用契約 W」，perm／api／task 同一契約，見 test/unit-wrapInjected.test.mjs）。ADR-033。
//why：注入函數常為 w-web-sso 對外 helper 之包裝；舊版 helper 失敗時 reject 夾有完整網址（內含介接權杖與使用者權杖）之字串，
//原本各呼叫點以 await 原樣上拋，經 HTTP 回應 msg、srLog 之 err、stdout 與 error 事件外流（修正前探測實證）。
//契約：上游同步拋錯或 reject 一律視同否定結果（getUserByToken → null 等同查無；verify 系 → false 等同無權限），交由各呼叫點
//既有之查無／無權限分支處理——對外 key 由構造保證與既有路徑一致；失敗描述經 describeUpstream 只留白名單 key，或型別與名稱。


//ksUpstreamKey：K 契約之 14 個 key（w-web-sso 對外 helper 之 reject 詞彙，沿用 w-web-perm helper）；與 sso 為同步點，見 CLAUDE_rulebook.md
let ksUpstreamKey = [
    'invalidUrl', 'invalidTokenSelf', 'invalidTokenTar', 'invalidUserIdTar',
    'noTokenKeyValueInUrl', 'noTokenKeyUserIdInUrl', 'noTokenInUrl',
    'cannotGetUserByUrl', 'cannotGetUsersByUrl', 'cannotGetUserDataByUrl', 'cannotGetUsersDataByUrl',
    'noUserDataByUrl', 'noUsersDataByUrl', 'noUserDataAfterConvert',
]


//describeUpstream：上游失敗值 → 可入 log 之描述。reject 值（或 Error.message）恰為白名單 key → { upstream: key }；
//否則只記 { upstreamType, upstreamName }（型別與 Error.name，名稱形狀才記），絕不記原文
let describeUpstream = (err) => {
    let v = isErr(err) ? err.message : err
    if (typeof v === 'string' && ksUpstreamKey.includes(v)) {
        return { upstream: v }
    }
    let upstreamType = typeof err
    if (err === null) {
        upstreamType = 'null'
    }
    else if (isarr(err)) {
        upstreamType = 'array'
    }
    else if (isErr(err)) {
        upstreamType = 'error'
    }
    let upstreamName = isErr(err) ? pickErrName(err) : ''
    return { upstreamType, upstreamName }
}


//wrapInjected：回傳包裝後之 async 函數——上游 resolve（或同步回傳非 Promise 值）原樣回傳；上游同步拋錯、reject（含 thenable）
//一律回 failValue，並以 describeUpstream 之結果呼叫 onFail（不傳原錯誤，呼叫端無從誤記原文）；onFail 本身拋錯亦不影響回傳（永不 reject）
let wrapInjected = (fn, opt = {}) => {
    let { failValue = null, onFail = null } = opt
    return async (...args) => {
        try {
            return await fn(...args)
        }
        catch (err) {
            if (typeof onFail === 'function') {
                try {
                    onFail(describeUpstream(err))
                }
                catch (errFail) {
                    //記錄失敗不影響否定結果
                }
            }
            return failValue
        }
    }
}


export {
    wrapInjected,
    describeUpstream
}
