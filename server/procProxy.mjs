import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import isobj from 'wsemi/src/isobj.mjs'
import axios from 'axios'


function procProxy(opt = {}) {

    //srLog（後端 log；錯誤一律 log err-key，axios 例外另 log 真實訊息供排查）
    let srLog = get(opt, 'srLog', null)

    //isAllowTarget
    let isAllowTarget = get(opt, 'isAllowTarget', null)


    let proxyRequest = async (inp = {}) => {

        //method
        let method = get(inp, 'method', 'GET')
        if (!isestr(method)) {
            method = 'GET'
        }
        method = method.toUpperCase()

        //url
        let url = get(inp, 'url', '')
        if (!isestr(url)) {
            return Promise.reject('errReqUrlInvalid')
        }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return Promise.reject('errReqUrlInvalid')
        }

        //isAllowTarget check
        if (typeof isAllowTarget === 'function') {
            let allowed = isAllowTarget(url)
            if (allowed === false) {
                return Promise.reject('errReqTargetNotAllowed')
            }
        }

        //headers
        let headers = get(inp, 'headers', {})
        if (!isobj(headers)) {
            headers = {}
        }

        //移除 host 與 content-length (交給 axios)
        delete headers['host']
        delete headers['Host']
        delete headers['content-length']
        delete headers['Content-Length']

        //query
        let query = get(inp, 'query', null)
        let params = null
        if (isobj(query) && Object.keys(query).length > 0) {
            params = query
        }

        //body
        let body = get(inp, 'body', undefined)
        let data = undefined
        if (method !== 'GET' && method !== 'HEAD') {
            if (body !== undefined) {
                data = body
            }
        }

        //timeout
        let timeout = get(inp, 'timeout', 30000)
        if (typeof timeout !== 'number' || timeout <= 0) {
            timeout = 30000
        }

        //send
        let r
        let t0 = Date.now()
        try {
            let res = await axios({
                method,
                url,
                headers,
                params,
                data,
                timeout,
                validateStatus: () => true,
            })

            let durationMs = Date.now() - t0

            //r
            r = {
                status: res.status,
                statusText: res.statusText,
                headers: res.headers,
                data: res.data,
                durationMs,
            }

        }
        catch (err) {
            //axios 例外（timeout/DNS 等）：log 真實訊息供排查，但回前端只給 err-key（前端依 lang 顯示）
            if (srLog) {
                srLog.error({ event: 'proxyRequest-axios', msg: get(err, 'message', String(err)) })
            }
            return Promise.reject('errProxyRequestFailed')
        }

        return r
    }


    return {
        proxyRequest,
    }
}


export default procProxy
