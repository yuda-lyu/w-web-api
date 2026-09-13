<template>
    <div :style="`height:${height}px; overflow-y:auto; padding:16px;`">

        <!-- 頂部：method + url + 送出（address bar 群組） -->
        <div class="addr-bar" style="margin-bottom:12px;">

            <div class="addr-method">
                <WTextSelect
                    :items="methodItems"
                    :value="req.method"
                    @input="onInputMethod"
                >
                    <template v-slot:select="props">
                        <span :style="`color:${getMethodColor(props.item)};`">{{props.item}}</span>
                    </template>
                    <template v-slot:item="props">
                        <span :style="`color:${getMethodColor(props.item)};`">{{props.item}}</span>
                    </template>
                </WTextSelect>
            </div>

            <input
                v-model="req.url"
                type="text"
                class="addr-url"
                :placeholder="$t('reqUrlPlaceholder')"
            />

            <button
                @click="onClickSend"
                :disabled="sending"
                class="addr-send"
                :style="sending ? 'opacity:0.6; cursor:not-allowed;' : ''"
            >
                {{$t('reqSend')}}
            </button>

        </div>

        <!-- 錯誤訊息 -->
        <div
            v-if="errSend"
            class="err-bar"
            style="margin-bottom:10px;"
        >
            {{errSend}}
        </div>

        <!-- Query 參數 -->
        <div style="margin-bottom:12px;">

            <div class="sec-label" style="margin-bottom:6px;">
                {{$t('reqQuery')}}
            </div>

            <div class="kv-table">

                <div class="kv-head">
                    <div class="kv-col-ck">{{$t('colOn')}}</div>
                    <div class="kv-col-key">{{$t('colKey')}}</div>
                    <div class="kv-col-val">{{$t('colValue')}}</div>
                    <div class="kv-col-del"></div>
                </div>

                <div
                    v-for="(row, idx) in req.query"
                    :key="row.id"
                    class="kv-row"
                >
                    <div class="kv-col-ck kv-center">
                        <input type="checkbox" v-model="row.on" style="cursor:pointer;" />
                    </div>
                    <div class="kv-col-key">
                        <input
                            v-model="row.key"
                            type="text"
                            class="kv-input"
                        />
                    </div>
                    <div class="kv-col-val">
                        <input
                            v-model="row.value"
                            type="text"
                            class="kv-input"
                        />
                    </div>
                    <div class="kv-col-del kv-center">
                        <button
                            @click="(/* */) => removeQueryRow(idx)"
                            class="kv-del-btn"
                        >×</button>
                    </div>
                </div>

            </div>

            <div style="margin-top:8px;">
                <button
                    @click="addQueryRow"
                    class="btn-addrow"
                >
                    + {{$t('reqAddRow')}}
                </button>
            </div>

        </div>

        <!-- Headers -->
        <div style="margin-bottom:12px;">

            <div class="sec-label" style="margin-bottom:6px;">
                {{$t('reqHeaders')}}
            </div>

            <div class="kv-table">

                <div class="kv-head">
                    <div class="kv-col-ck">{{$t('colOn')}}</div>
                    <div class="kv-col-key">{{$t('colKey')}}</div>
                    <div class="kv-col-val">{{$t('colValue')}}</div>
                    <div class="kv-col-del"></div>
                </div>

                <div
                    v-for="(row, idx) in req.headers"
                    :key="row.id"
                    class="kv-row"
                >
                    <div class="kv-col-ck kv-center">
                        <input type="checkbox" v-model="row.on" style="cursor:pointer;" />
                    </div>
                    <div class="kv-col-key">
                        <input
                            v-model="row.key"
                            type="text"
                            class="kv-input"
                        />
                    </div>
                    <div class="kv-col-val">
                        <input
                            v-model="row.value"
                            type="text"
                            class="kv-input"
                        />
                    </div>
                    <div class="kv-col-del kv-center">
                        <button
                            @click="(/* */) => removeHeaderRow(idx)"
                            class="kv-del-btn"
                        >×</button>
                    </div>
                </div>

            </div>

            <div style="margin-top:8px;">
                <button
                    @click="addHeaderRow"
                    class="btn-addrow"
                >
                    + {{$t('reqAddRow')}}
                </button>
            </div>

        </div>

        <!-- Body（僅 non-GET/HEAD 顯示） -->
        <div
            v-if="showBody"
            style="margin-bottom:12px;"
        >

            <div class="sec-label" style="margin-bottom:6px;">
                {{$t('reqBody')}}
            </div>

            <textarea
                v-model="req.body"
                class="body-textarea"
            ></textarea>

        </div>

        <!-- 回應區 -->
        <div>

            <div class="sec-label" style="margin-bottom:8px;">
                {{$t('resTitle')}}
            </div>

            <!-- 空狀態 -->
            <div
                v-if="res === null"
                class="card res-empty-card"
            >
                <div class="card-h" style="border-bottom:none; background:transparent;">
                    <span style="color:var(--c-3); font-size:var(--fs-sm);">{{$t('resEmpty')}}</span>
                </div>
            </div>

            <!-- 有回應 -->
            <div v-else class="card">

                <!-- status + time -->
                <div class="card-h">
                    <span class="w-status" :class="statusClass">{{res.status}} {{res.statusText}}</span>
                    <span class="w-muted w-tnum" style="font-size:12px; margin-left:auto;">{{$t('resTime')}} {{res.durationMs}} ms</span>
                </div>

                <!-- response headers -->
                <div class="card-h"><span class="lab" style="font-size:11.5px;">{{$t('resHeaders')}}</span></div>
                <pre class="code" style="white-space:pre-wrap; word-break:break-all;">{{resHeadersStr}}</pre>

                <!-- response body -->
                <div class="card-h"><span class="lab" style="font-size:11.5px;">{{$t('resBody')}}</span></div>
                <pre class="code" style="white-space:pre-wrap; word-break:break-all;" v-html="bodyHighlighted"></pre>

            </div>

        </div>

    </div>
</template>

<script>
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import isestr from 'wsemi/src/isestr.mjs'
import isobj from 'wsemi/src/isobj.mjs'
import j2o from 'wsemi/src/j2o.mjs'
import WTextSelect from 'w-component-vue/src/components/WTextSelect.vue'


let kpColorMethod = {
    GET: 'var(--m-get)',
    POST: 'var(--m-post)',
    PUT: 'var(--m-put)',
    DEL: 'var(--m-del)',
}


//mkRow：Query／Headers 表列之唯一建立點（改造前 10 處各自手寫 `{ on, key, value }` 字面值）。
//id 為單調遞增序號、供 v-for :key（改造前 :key=idx——增刪列後 Vue 依索引重用 DOM，列之瞬時 DOM 狀態（焦點／IME 組字）會錯位）。
let seqKvRow = 0
function mkRow(key = '', value = '') {
    seqKvRow += 1
    return { id: seqKvRow, on: true, key, value }
}


export default {
    components: {
        WTextSelect,
    },
    props: {
        item: {
            type: Object,
            default: function() {
                return {}
            },
        },
        height: {
            type: Number,
            default: 0,
        },
    },
    data: function() {
        return {
            methodItems: this.$s.METHODS.map((m) => m.toUpperCase()), //顯示層大寫；單一來源 mShare.METHODS（與編輯表單共用）
            req: {
                method: 'GET',
                url: '',
                query: [mkRow()],
                headers: [mkRow()],
                body: '',
            },
            res: null,
            sending: false,
            errSend: '',
        }
    },
    mounted: function() {
        let vo = this
        vo.seedFromItem(vo.item)
    },
    watch: {
        item: {
            immediate: false,
            handler: function(val) {
                let vo = this
                vo.seedFromItem(val)
            },
        },
    },
    computed: {

        showBody: function() {
            let vo = this
            let m = vo.req.method
            return m !== 'GET' && m !== 'HEAD'
        },

        resHeadersStr: function() {
            let vo = this
            if (vo.res === null) {
                return ''
            }
            try {
                return JSON.stringify(vo.res.headers, null, 2)
            }
            catch (e) {
                return String(vo.res.headers)
            }
        },

        statusClass: function() {
            let vo = this
            if (vo.res === null) {
                return ''
            }
            let s = parseInt(vo.res.status, 10)
            if (s >= 200 && s < 300) return 's2'
            if (s >= 300 && s < 400) return 's3'
            if (s >= 400 && s < 500) return 's4'
            if (s >= 500) return 's5'
            return ''
        },

        bodyHighlighted: function() {
            let vo = this
            if (vo.res === null) {
                return ''
            }
            //物件／陣列 → 縮排 JSON + 語法高亮；其餘（HTML／純文字／數字…）→ 原文（僅 escape、不上色：純文字中的數字／true 不是 JSON token）。
            //型別表見 spec/流程_測試API.md「回應 data 型別 → 顯示形式」；高亮實作與 docs 分頁共用 mShare.jsonHighlight
            //（改造前本處自寫規則以 &quot; 比對但 escape 未換 "，鍵值永遠不上色、只有數字／布林被上色，且對 HTML 原文亦上色）
            let raw = vo.$s.dataToText(vo.res.data)
            if (!vo.$s.isJsonContainer(vo.res.data)) {
                return vo.$s.escapeHtml(raw)
            }
            return vo.$s.jsonHighlight(raw)
        },

    },
    methods: {

        getMethodColor: function(method) {
            // let vo = this
            return get(kpColorMethod, method, 'var(--c-2)')
        },

        jsonToRows: function(jsonStr) {
            // let vo = this
            let rows = []
            if (!isestr(jsonStr)) {
                return rows
            }
            let obj = j2o(jsonStr)
            if (!isobj(obj)) {
                return rows
            }
            each(obj, function(v, k) {
                rows.push(mkRow(k, String(v)))
            })
            return rows
        },

        seedFromItem: function(itm) {
            let vo = this

            if (!itm) {
                return
            }

            // method
            let method = isestr(itm.method) ? itm.method.toUpperCase() : 'GET'
            vo.req.method = method

            // url
            vo.req.url = isestr(itm.url) ? itm.url : (isestr(itm.testBaseUrl) ? itm.testBaseUrl : '')

            // headers / query 預設（先建好, 認證可往兩者塞）
            let headerRows = vo.jsonToRows(itm.defaultHeadersJson)
            let queryRows = vo.jsonToRows(itm.defaultQueryJson)

            // 認證：依 authType 解析 authConfigJson 自動帶入（none / bearer / apikey / basic）
            let authType = isestr(itm.authType) ? itm.authType : 'none'
            let authCfg = j2o(itm.authConfigJson)
            if (!isobj(authCfg)) {
                authCfg = {}
            }
            if (authType === 'bearer') {
                // { "token": "xxx" }；留空則退用 tokens 欄第一個（向後相容舊資料）
                let token = isestr(authCfg.token) ? authCfg.token : (isestr(itm.tokens) ? itm.tokens.split(';')[0] : '')
                if (isestr(token)) {
                    headerRows.push(mkRow('Authorization', 'Bearer ' + token))
                }
            }
            else if (authType === 'apikey') {
                // { "name": "X-API-Key", "value": "xxx", "in": "header"|"query" }
                let name = isestr(authCfg.name) ? authCfg.name : 'X-API-Key'
                let value = isestr(authCfg.value) ? authCfg.value : ''
                if (isestr(value)) {
                    if (authCfg.in === 'query') {
                        queryRows.push(mkRow(name, value))
                    }
                    else {
                        headerRows.push(mkRow(name, value))
                    }
                }
            }
            else if (authType === 'basic') {
                // { "username": "u", "password": "p" } → Authorization: Basic base64(u:p)
                let u = isestr(authCfg.username) ? authCfg.username : ''
                let p = isestr(authCfg.password) ? authCfg.password : ''
                if (isestr(u) || isestr(p)) {
                    headerRows.push(mkRow('Authorization', 'Basic ' + btoa(u + ':' + p)))
                }
            }

            // content-type 標頭：預設標頭（defaultHeadersJson）已明給 Content-Type（不分大小寫）者以其為準、不再補一列
            //（對標 Postman：使用者明給之標頭優先於自動標頭。改造前雙列並存：送出時同鍵收斂使後列覆蓋前列，
            //改為有序鍵值對後兩列會被 fetch 合併成 'a, b'，皆非使用者所見）
            let hasContentType = headerRows.some((r) => r.key.toLowerCase() === 'content-type')
            if (isestr(itm.contentType) && !hasContentType) {
                headerRows.push(mkRow('Content-Type', itm.contentType))
            }

            if (headerRows.length === 0) {
                headerRows.push(mkRow())
            }
            vo.req.headers = headerRows

            if (queryRows.length === 0) {
                queryRows.push(mkRow())
            }
            vo.req.query = queryRows

            // body
            let body = ''
            if (isestr(itm.defaultBodyJson)) {
                body = itm.defaultBodyJson
            }
            else if (isestr(itm.inputExample)) {
                body = itm.inputExample
            }
            vo.req.body = body

            // reset response
            vo.res = null
            vo.errSend = ''

        },

        addQueryRow: function() {
            let vo = this
            vo.req.query.push(mkRow())
        },

        removeQueryRow: function(idx) {
            let vo = this
            vo.req.query.splice(idx, 1)
            if (vo.req.query.length === 0) {
                vo.req.query.push(mkRow())
            }
        },

        addHeaderRow: function() {
            let vo = this
            vo.req.headers.push(mkRow())
        },

        removeHeaderRow: function(idx) {
            let vo = this
            vo.req.headers.splice(idx, 1)
            if (vo.req.headers.length === 0) {
                vo.req.headers.push(mkRow())
            }
        },

        onInputMethod: function(val) {
            let vo = this
            vo.req.method = val
        },

        onClickSend: function() {
            let vo = this
            vo.submitSend()
        },

        submitSend: function() {
            let vo = this

            let core = async function() {

                // 1) 清空舊錯誤與結果
                vo.errSend = ''
                vo.res = null

                // 2) 同步檢測
                if (!isestr(vo.req.url)) {
                    vo.errSend = vo.$t('valRequired')
                    return
                }

                // 3) 開 loading：本地 sending（送出鈕禁用）+ 頁面層全頁 overlay（CLAUDE.md 三層雙擊防護之頁面層；
                //    送出對目標可能有副作用（POST/PUT/DELETE），與編輯分頁之存／刪同級；改造前只有本地 sending）
                vo.sending = true
                vo.$ui.updateLoading(true)

                // 4) 組 spec 並送出（方法代號 → HTTP 標準動詞；顯示層之 DEL 須送 DELETE，見 mShare 說明）
                let method = vo.$s.methodToHttpVerb(vo.req.method)

                //Query／Headers：僅 on 且鍵非空之列，以有序鍵值對 [[key, value], ...] 送出、重複鍵各自保留
                //（mShare.kvRowsToPairs；改造前以物件收斂使同鍵後列靜默覆蓋前列）
                let query = vo.$s.kvRowsToPairs(vo.req.query)
                let headers = vo.$s.kvRowsToPairs(vo.req.headers)

                //請求內容原文送出（同 Scalar / Postman：打什麼送什麼，不解析、不驗證、不代換；Content-Type 以標頭表為準），
                //空白則不帶 body；GET/HEAD 不帶。見 spec/流程_測試API.md「規則摘要」契約與 ADR-029。
                let body
                if (method !== 'GET' && method !== 'HEAD') {
                    let rawBody = vo.req.body
                    body = isestr(rawBody) ? rawBody : undefined
                }

                let spec = {
                    method,
                    url: vo.req.url,
                    headers,
                    query,
                    body,
                    timeout: 30000,
                }

                let okSend = false
                await vo.$fapi.proxyRequest(spec)
                    .then(function(r) {
                        vo.res = r
                        okSend = true
                    })
                    .catch(function(err) {
                        console.log('proxyRequest', err)
                        vo.errSend = vo.$transErr(err) //err 為後端 err-key，依 lang 反查顯示
                    })
                if (!okSend) {
                    return
                }

                // 5) 全成功
                return 'ok'

            }

            core()
                .catch(function(err) {
                    //非預期例外：先關 overlay、再以 showCheckYes modal 通知（CLAUDE.md：失敗通知走 showCheckYes、之前先 updateLoading(false)；
                    //非 success 之 type 顯示警示圖標）；不用會自動消失之 $alert toast（ADR-005 modal 政策）
                    console.log('catch', err)
                    vo.$ui.updateLoading(false)
                    vo.$dg.showCheckYes(vo.$t('anUnexpectedErrorOccurred'), { type: 'error' })
                })
                .finally(function() {
                    vo.sending = false
                    vo.$ui.updateLoading(false)
                })

        },

    },
}
</script>

<style scoped>

/* ---------- section label ---------- */
.sec-label {
    font-size: var(--fs-xs);
    font-weight: var(--fw-bold);
    letter-spacing: .05em;
    text-transform: uppercase;
    color: var(--c-3);
}

/* ---------- address bar ---------- */
.addr-bar {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--bg-1);
}
.addr-method {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 4px;
    border-right: 1px solid var(--border);
    background: var(--bg-2);
    font-family: var(--font-code);
    font-weight: var(--fw-bold);
    font-size: var(--fs-sm);
}
.addr-url {
    flex: 1;
    border: none;
    outline: none;
    padding: 0 14px;
    font-size: var(--fs-sm);
    color: var(--c-1);
    background: transparent;
    font-family: var(--font-code);
}
.addr-send {
    flex-shrink: 0;
    margin: 5px;
    padding: 0 20px;
    border: none;
    border-radius: var(--radius);
    background: var(--accent);
    color: #fff;
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background-color .15s;
}
.addr-send:hover:not(:disabled) {
    background: var(--accent-hover);
}

/* ---------- error bar ---------- */
.err-bar {
    padding: 8px 12px;
    border-radius: var(--radius-lg);
    background: var(--danger-bg);
    border: 1px solid var(--danger);
    color: var(--danger);
    font-size: var(--fs-sm);
}

/* ---------- kv table (query / headers) ---------- */
.kv-table {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
}
.kv-head {
    display: grid;
    grid-template-columns: 52px 1fr 1fr 34px;
    align-items: center;
    background: var(--bg-2);
    font-size: var(--fs-xs);
    color: var(--c-2);
    font-weight: var(--fw-bold);
    white-space: nowrap;
}
.kv-head > div,
.kv-row > div {
    padding: 7px 10px;
}
.kv-row {
    display: grid;
    grid-template-columns: 52px 1fr 1fr 34px;
    align-items: center;
    border-top: 1px solid var(--border);
}
.kv-center {
    display: flex;
    justify-content: center;
    align-items: center;
}
.kv-col-ck  { /* width handled by grid */ }
.kv-col-key { }
.kv-col-val { }
.kv-col-del { }

.kv-input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid transparent;
    background: transparent;
    outline: none;
    color: var(--c-1);
    font-size: var(--fs-sm);
    padding: 3px 6px;
    border-radius: var(--radius-sm);
    font-family: var(--font-code);
    transition: border-color .15s, background-color .15s;
}
.kv-input:focus {
    border-color: var(--accent);
    background: var(--bg-1);
}

.kv-del-btn {
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--c-3);
    font-size: 1rem;
    cursor: pointer;
    line-height: 1;
    transition: color .15s;
}
.kv-del-btn:hover {
    color: var(--danger);
}

/* ---------- add row button ---------- */
.btn-addrow {
    padding: 5px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: transparent;
    color: var(--c-2);
    font-size: var(--fs-xs);
    cursor: pointer;
    transition: background-color .15s;
}
.btn-addrow:hover {
    background: var(--bg-3);
}

/* ---------- body textarea ---------- */
.body-textarea {
    width: 100%;
    min-height: 120px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    font-size: var(--fs-sm);
    font-family: var(--font-code);
    color: var(--c-1);
    background: var(--bg-1);
    resize: vertical;
    outline: none;
    box-sizing: border-box;
    transition: border-color .15s, box-shadow .15s;
}
.body-textarea:focus {
    border-color: var(--accent);
    box-shadow: var(--focus);
}

/* ---------- response panel ---------- */
.res-empty-card {
    background: var(--bg-1);
}

</style>
