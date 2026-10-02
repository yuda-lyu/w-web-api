<template>
    <div :style="`height:${height}px; box-sizing:border-box; overflow-y:auto; padding:20px;`">

        <!-- 區塊一：基本資訊 -->
        <div style="margin-bottom:20px;">

            <div class="bk-title-sec">
                {{$t('secBasic')}}
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('name')}}<span style="color:var(--danger); margin-left:2px;">*</span></div>
                <div class="bk-col-field">
                    <input class="bk-input" v-model="form.name" type="text" />
                    <div class="bk-err" v-if="errName">{{errName}}</div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('description')}}</div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" v-model="form.description" rows="3"></textarea>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('apiUrl')}}<span style="color:var(--danger); margin-left:2px;">*</span></div>
                <div class="bk-col-field">
                    <input class="bk-input" v-model="form.url" type="text" />
                    <div class="bk-err" v-if="errUrl">{{errUrl}}</div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldMethod')}}</div>
                <div class="bk-col-field">
                    <WTextSelect
                        style="width:160px;"
                        :items="methodItems"
                        :value="form.method"
                        @input="onChangeMethod"
                    >
                        <template v-slot:select="props">
                            {{getMethodText(props.item)}}
                        </template>
                        <template v-slot:item="props">
                            {{getMethodText(props.item)}}
                        </template>
                    </WTextSelect>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('version')}}</div>
                <div class="bk-col-field">
                    <input class="bk-input" v-model="form.version" type="text" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldGroup')}}</div>
                <div class="bk-col-field">
                    <input class="bk-input" v-model="form.group" type="text" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('levels')}}</div>
                <div class="bk-col-field">
                    <input class="bk-input" v-model="form.levels" type="text" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('keywords')}}</div>
                <div class="bk-col-field">
                    <input class="bk-input" v-model="form.keywords" type="text" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('state')}}</div>
                <div class="bk-col-field">
                    <input class="bk-input" v-model="form.state" type="text" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldOrder')}}</div>
                <div class="bk-col-field">
                    <input class="bk-input" v-model.number="form.order" type="number" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('tokens')}}</div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" v-model="form.tokens" rows="3"></textarea>
                </div>
            </div>

        </div>

        <!-- 區塊二：文件 -->
        <div style="margin-bottom:20px;">

            <div class="bk-title-sec">
                {{$t('secDocs')}}
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('mdInputParams')}}</div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" v-model="form.mdInputParams" rows="6"></textarea>
                    <div class="bk-preview bk-item" v-if="form.mdInputParams">
                        <MdPanel :md="form.mdInputParams"></MdPanel>
                    </div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('inputExample')}}</div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" v-model="form.inputExample" rows="4"></textarea>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('mdOutputParams')}}</div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" v-model="form.mdOutputParams" rows="6"></textarea>
                    <div class="bk-preview bk-item" v-if="form.mdOutputParams">
                        <MdPanel :md="form.mdOutputParams"></MdPanel>
                    </div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('outputExample')}}</div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" v-model="form.outputExample" rows="6"></textarea>
                </div>
            </div>

        </div>

        <!-- 區塊三：測試設定 -->
        <div style="margin-bottom:20px;">

            <div class="bk-title-sec">
                {{$t('secTest')}}
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldTestBaseUrl')}}</div>
                <div class="bk-hint">{{$t('hintTestBaseUrl')}}</div>
                <div class="bk-col-field">
                    <input class="bk-input" v-model="form.testBaseUrl" type="text" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldAuthType')}}</div>
                <div class="bk-hint">{{$t('hintAuthType')}}</div>
                <div class="bk-col-field">
                    <WTextSelect
                        style="width:200px;"
                        :items="authTypeItems"
                        :value="form.authType"
                        @input="onChangeAuthType"
                    >
                        <template v-slot:select="props">
                            {{getAuthTypeText(props.item)}}
                        </template>
                        <template v-slot:item="props">
                            {{getAuthTypeText(props.item)}}
                        </template>
                    </WTextSelect>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldAuthConfigJson')}}</div>
                <div class="bk-hint">{{$t('hintAuthConfigJson')}}</div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" v-model="form.authConfigJson" rows="4"></textarea>
                    <div class="bk-err" v-if="errJson && errJsonField==='authConfigJson'">{{errJson}}</div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldDefaultHeadersJson')}}</div>
                <div class="bk-hint">{{$t('hintDefaultHeadersJson')}}</div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" v-model="form.defaultHeadersJson" rows="4"></textarea>
                    <div class="bk-err" v-if="errJson && errJsonField==='defaultHeadersJson'">{{errJson}}</div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldDefaultQueryJson')}}</div>
                <div class="bk-hint">{{$t('hintDefaultQueryJson')}}</div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" v-model="form.defaultQueryJson" rows="4"></textarea>
                    <div class="bk-err" v-if="errJson && errJsonField==='defaultQueryJson'">{{errJson}}</div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldDefaultBodyJson')}}</div>
                <div class="bk-hint">{{$t('hintDefaultBodyJson')}}</div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" v-model="form.defaultBodyJson" rows="4"></textarea>
                    <div class="bk-err" v-if="errJson && errJsonField==='defaultBodyJson'">{{errJson}}</div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldContentType')}}</div>
                <div class="bk-hint">{{$t('hintContentType')}}</div>
                <div class="bk-col-field">
                    <input class="bk-input" v-model="form.contentType" type="text" />
                </div>
            </div>

        </div>

        <!-- 全域儲存錯誤 -->
        <div class="bk-err" v-if="errSave" style="margin-bottom:10px;">{{errSave}}</div>

        <!-- 底部按鈕列 -->
        <div style="display:flex; gap:8px; padding-bottom:20px;">

            <button class="btn-save" @click="onClickSave">
                {{$t('save')}}
            </button>

            <button class="btn-delete" @click="onClickDelete" v-if="!isNew">
                {{$t('delete')}}
            </button>

            <button class="btn-cancel" @click="onClickCancel">
                {{$t('cancel')}}
            </button>

        </div>

    </div>
</template>

<script>
import cloneDeep from 'lodash-es/cloneDeep.js'
import isestr from 'wsemi/src/isestr.mjs'
import WTextSelect from 'w-component-vue/src/components/WTextSelect.vue'
import MdPanel from './MdPanel.vue'


export default {
    components: {
        WTextSelect,
        MdPanel,
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
        isNew: {
            type: Boolean,
            default: false,
        },
    },
    data: function() {
        return {

            form: {},

            errName: '',
            errUrl: '',
            errJson: '',
            errJsonField: '',
            errSave: '',

            methodItems: this.$s.METHODS, //單一來源 mShare.METHODS（與測試分頁共用）
            authTypeItems: ['none', 'bearer', 'apikey', 'basic'],

        }
    },
    mounted: function() {
        let vo = this
        vo.form = cloneDeep(vo.item)
    },
    watch: {
        item: {
            deep: true,
            immediate: true,
            handler: function(val) {
                let vo = this
                vo.form = cloneDeep(val)
            },
        },
    },
    methods: {

        getMethodText: function(item) {
            // let vo = this
            if (!isestr(item)) {
                return ''
            }
            return item.toUpperCase()
        },

        getAuthTypeText: function(item) {
            let vo = this
            let kp = {
                none: vo.$t('authNone'),
                bearer: vo.$t('authBearer'),
                apikey: vo.$t('authApikey'),
                basic: vo.$t('authBasic'),
            }
            if (!isestr(item)) {
                return ''
            }
            return kp[item] || item
        },

        onChangeMethod: function(val) {
            let vo = this
            vo.form.method = val
        },

        onChangeAuthType: function(val) {
            let vo = this
            vo.form.authType = val
        },

        onClickSave: function() {
            let vo = this

            //runSubmit: 儲存流程(自觸發起至結果訊息框關閉)進行中再觸發即略過 (ADR-034)。儲存鈕為原生 <button>(保留既有 UI 與 baseline, 無 promiseUnlock),
            //全頁 loading 與訊息框(WDialog)只擋滑鼠、不搶焦點, 焦點留在儲存鈕時鍵盤 Enter / 空白鍵仍觸發 click; 重入一律由 runSubmit 之 key 判斷
            //(原本元件 submitting 旗標已移除), 後端另依使用者占位(同一使用者處理中再送出回 saveInProgress)
            return vo.$ui.runSubmit('saveApi', function() {
                return vo.submitSave()
                    .catch(function(err) {
                        //非預期例外：先關 overlay、再以 showCheckYes modal 通知（CLAUDE.md 失敗通知政策；不用自動消失之 $alert toast，ADR-005）；
                        //回傳訊息框之 Promise, 流程至其關閉才結束 (ADR-034)
                        console.log('catch', err); vo.$ui.updateLoading(false); return vo.$dg.showCheckYes(vo.$t('anUnexpectedErrorOccurred'), { type: 'error' })
                    })
                    .finally(function() {
                        vo.$ui.updateLoading(false)
                    })
            })
        },

        submitSave: function() {
            let vo = this
            let core = async function() {

                // 1) 清空舊 inline 錯誤
                vo.errName = ''
                vo.errUrl = ''
                vo.errJson = ''
                vo.errJsonField = ''
                vo.errSave = ''

                // 2) 同步檢測，開 loading 之前
                if (!isestr(vo.form.name)) {
                    vo.errName = vo.$t('valRequired')
                    return
                }
                if (!isestr(vo.form.url)) {
                    vo.errUrl = vo.$t('valRequired')
                    return
                }
                let jsonFields = ['authConfigJson', 'defaultHeadersJson', 'defaultQueryJson', 'defaultBodyJson']
                for (let i = 0; i < jsonFields.length; i++) {
                    let fk = jsonFields[i]
                    let fv = vo.form[fk]
                    if (isestr(fv)) {
                        let jsonOk = true
                        try {
                            JSON.parse(fv)
                        }
                        catch (e) {
                            jsonOk = false
                        }
                        if (!jsonOk) {
                            vo.errJsonField = fk
                            vo.errJson = fk + ': ' + vo.$t('valInvalidJson')
                            return
                        }
                    }
                }

                // 3) 確定打 API 才開 loading
                vo.$ui.updateLoading(true)

                // 4) 執行 async，各自 catch + 旗標短路
                let okSave = false
                await vo.$fapi.saveApi(cloneDeep(vo.form))
                    .then(function() {
                        okSave = true
                    })
                    .catch(function(err) {
                        console.log('saveApi', err); vo.errSave = vo.$transErr(err)
                    }) //err 為後端 err-key，依 lang 反查顯示
                if (!okSave) return

                // 5) 全成功
                vo.$emit('saved')
                //成功訊息改用 confirm modal（$dg.showCheckYes）而非 toast：toast 是插入後又移除的暫時 DOM，
                //新版 chromium 在 insert/remove 後會把整頁 render 原點偏移 1px（headless 偶發、實測 toast 關掉即穩），
                //modal 是「顯示著被截」不會有移除殘留，且對齊 w-web-sso 之成功 modal。
                //先關 loading 再開訊息框（CLAUDE.md：showCheckYes 之前先 updateLoading(false)）；await 至訊息框關閉，
                //使 onClickSave 之 runSubmit 流程涵蓋訊息框開啟期間（期間再觸發即略過，同 w-web-sso；ADR-034 修正 ADR-020）
                vo.$ui.updateLoading(false)
                await vo.$dg.showCheckYes(vo.$t('saveSuccess'), { type: 'success' })
                return 'ok'

            }
            return core()
        },

        onClickDelete: function() {
            let vo = this

            //runSubmit: 刪除流程(自開確認框起, 經確認、請求至結果訊息框關閉)整段進行中再觸發即略過 (ADR-034)。確認框(WDialog)不搶焦點,
            //開啟期間焦點仍在原生刪除鈕上, 鍵盤 Enter 可再觸發本 handler; 原本重入判斷在確認後之 doDelete 第一行, 確認框階段未涵蓋,
            //第 2 次觸發會再開一次確認框(CheckYesNo 為單例, 見其 show); 後端另依使用者占位(同一使用者處理中再送出回 deleteInProgress)
            return vo.$ui.runSubmit('deleteApi', function() {
                return vo.$dg.showCheckYesNo(vo.$t('confirmDeleteApi'))
                    .then(function() {
                        return vo.doDelete() //回傳刪除流程之 Promise, 占位持續至結果訊息框關閉
                    })
                    .catch(function(err) {
                        if (err === 'close') return; console.log('showCheckYesNo', err)
                    })
            })
        },

        doDelete: function() {
            let vo = this
            let core = async function() {

                // 1) 清空錯誤
                vo.errSave = ''

                // 2) 同步檢測（無需額外檢測，id 由 item 帶入）

                // 3) 開 loading
                vo.$ui.updateLoading(true)

                // 4) 執行 async
                let okDel = false
                await vo.$fapi.deleteApi(vo.form.id)
                    .then(function() {
                        okDel = true
                    })
                    .catch(function(err) {
                        console.log('deleteApi', err); vo.errSave = vo.$transErr(err)
                    }) //err 為後端 err-key，依 lang 反查顯示
                if (!okDel) return

                // 5) 全成功
                vo.$emit('deleted')
                //同 saveSuccess：toast → confirm modal（避免移除殘留位移、對齊 SSO）；type:success 顯綠勾。
                //先關 loading 再開訊息框、await 至其關閉，使刪除流程涵蓋訊息框開啟期間（同 submitSave，ADR-034）
                vo.$ui.updateLoading(false)
                await vo.$dg.showCheckYes(vo.$t('deleteSuccess'), { type: 'success' })
                return 'ok'

            }
            return core()
                .catch(function(err) {
                    //非預期例外：先關 overlay、再以 showCheckYes modal 通知（CLAUDE.md 失敗通知政策；不用自動消失之 $alert toast，ADR-005）；
                    //回傳訊息框之 Promise, 流程至其關閉才結束 (ADR-034)
                    console.log('catch', err); vo.$ui.updateLoading(false); return vo.$dg.showCheckYes(vo.$t('anUnexpectedErrorOccurred'), { type: 'error' })
                })
                .finally(function() {
                    vo.$ui.updateLoading(false)
                })
        },

        onClickCancel: function() {
            let vo = this
            vo.$emit('cancel')
        },

    },
}
</script>

<style scoped>
.bk-title-sec {
    font-size: var(--fs-h3);
    font-weight: 600;
    color: var(--c-1);
    padding: 6px 0px 10px 0px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 12px;
}
.bk-title {
    font-size: var(--fs-xs);
    font-weight: 500;
    color: var(--c-2);
    padding: 0 0 6px 0;
}
.bk-item {
    padding: 3px 5px;
    font-size: 0.9rem;
    line-height: 0.9rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--bg-1);
}
.bk-row {
    display: flex;
    flex-direction: column;
    /* padding-top 大於 padding-bottom：使「組間」(上一列欄位→下一列小標) 間距明顯大於「組內」(小標→說明→欄位)，小標歸屬清楚 */
    padding: 12px 0 6px 0;
}
.bk-col-label {
    width: auto;
    flex-shrink: 0;
}
.bk-col-field {
    flex: 1;
}
.bk-input {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 8px;
    font-size: var(--fs-body);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--bg-1);
    color: var(--c-1);
    outline: none;
    transition: border-color .15s, box-shadow .15s;
}
.bk-input:focus {
    border-color: var(--accent);
    box-shadow: var(--focus);
}
.bk-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 8px;
    font-size: var(--fs-sm);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--bg-1);
    color: var(--c-1);
    outline: none;
    resize: vertical;
    font-family: var(--font-code);
    transition: border-color .15s, box-shadow .15s;
}
.bk-textarea:focus {
    border-color: var(--accent);
    box-shadow: var(--focus);
}
.bk-preview {
    margin-top: 6px;
    padding: 8px 10px;
}
.bk-err {
    color: var(--danger);
    font-size: var(--fs-xs);
    padding: 3px 2px;
}
.bk-hint {
    color: var(--c-3);
    font-size: var(--fs-xs);
    line-height: 1.6;
    margin: 0 0 8px 0;
    white-space: pre-line;
}
.btn-save {
    padding: 7px 18px;
    font-size: var(--fs-body);
    border-radius: var(--radius-lg);
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    transition: background-color .15s, border-color .15s;
}
.btn-save:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
}
.btn-delete {
    padding: 7px 18px;
    font-size: var(--fs-body);
    border-radius: var(--radius-lg);
    border: 1px solid var(--danger);
    background: transparent;
    color: var(--danger);
    cursor: pointer;
    transition: background-color .15s;
}
.btn-delete:hover {
    background: var(--danger-bg);
}
.btn-cancel {
    padding: 7px 18px;
    font-size: var(--fs-body);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--c-2);
    cursor: pointer;
    transition: background-color .15s;
}
.btn-cancel:hover {
    background: var(--bg-3);
}
</style>
