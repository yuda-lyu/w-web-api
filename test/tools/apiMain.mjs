//apiMain：直打資料通道（w-converhp /api/main）之唯一 helper（2026-10-14 收斂 api-tokenLeak.postMain 與 api-doubleclick.callFun 兩份手寫，ADR-038）。
//本體與回應皆為 wsemi obj2u8arr 編碼；資料通道之結果經 w-serv-webdata 包為 { state:'success'|'error', msg }，置於 w-converhp 之成功外殼 success.output；
//verifyConn 拒絕等通訊層錯誤則為 { error }（如 { error: 'permission denied' }）。
import get from 'lodash-es/get.js'
import obj2u8arr from 'wsemi/src/obj2u8arr.mjs'
import u8arr2obj from 'wsemi/src/u8arr2obj.mjs'


//postMain：送出任意 payload，回原始文字與解碼結果（供斷言回應不含秘密者使用）
async function postMain(baseUrl, authToken, payload, headers = {}) {
    let res = await fetch(`${baseUrl}/api/main`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/octet-stream', ...headers },
        body: Buffer.from(obj2u8arr(payload)),
    })
    let u8a = new Uint8Array(await res.arrayBuffer())
    return { raw: Buffer.from(u8a).toString('utf8'), data: u8arr2obj(u8a) }
}


//callFun：以同一 token 為 Authorization 與 __sysToken__ 呼叫資料通道之函數（kpFunExt、表操作、[sys:*]），回 { ok, state, msg, data }
async function callFun(baseUrl, token, func, args = []) {
    let { data } = await postMain(baseUrl, token, { func, input: { __sysInputArgs__: args, __sysToken__: token } })
    let state = get(data, 'success.output.state', '')
    return { ok: state === 'success', state, msg: get(data, 'success.output.msg', null), data }
}


export { postMain, callFun }
