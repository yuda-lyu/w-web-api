<template>
    <div :style="`height:${height}px; box-sizing:border-box; overflow-y:auto; padding:20px;`">

        <!-- 草稿保護(多人同時編輯, 原則 10): 編輯中收到他人更新／刪除之推播，或存檔被拒時顯示；平時不渲染(v-if)，不影響既有排版與標準圖 -->
        <div class="bk-stale" role="alert" v-if="staleMsg !== ''">
            <span class="bk-stale-text">{{staleMsg}}</span>
            <button class="bk-stale-btn" @click="onClickReload" v-if="!isGone">{{$t('reloadData')}}</button>
        </div>

        <!-- 外部列受保護(原則 5, ADR-044): 外部列顯示唯讀說明；外部管理 group 內無來源鍵之混雜列顯示下次匯入之警告；平時不渲染(v-if)，不影響既有排版與標準圖 -->
        <div class="bk-ext" role="note" v-if="isExt">
            <svg class="bk-ext-ic" viewBox="0 0 24 24" width="16" height="16"><path :d="mdiLock" fill="currentColor"></path></svg>
            <span class="bk-ext-text">{{fv($t('externalRowNotice'), { group: item.group })}}</span>
        </div>
        <div class="bk-ext bk-ext-warn" role="note" v-else-if="isMixed">
            <svg class="bk-ext-ic" viewBox="0 0 24 24" width="16" height="16"><path :d="mdiAlert" fill="currentColor"></path></svg>
            <span class="bk-ext-text">{{fv($t('externalGroupMixedNotice'), { group: item.group })}}</span>
        </div>

        <!-- 區塊一：基本資訊 -->
        <div style="margin-bottom:20px;">

            <div class="bk-title-sec">
                {{$t('secBasic')}}
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('name')}}<span style="color:var(--danger); margin-left:2px;">*</span><ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <input class="bk-input" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.name" type="text" />
                    <div class="bk-err" v-if="errName">{{errName}}</div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('description')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.description" rows="3"></textarea>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('apiUrl')}}<span style="color:var(--danger); margin-left:2px;">*</span><ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <input class="bk-input" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.url" type="text" />
                    <div class="bk-err" v-if="errUrl">{{errUrl}}</div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldMethod')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <!-- 外部列：方法為外部擁有欄位，唯讀顯示(WTextSelect 無唯讀屬性，不以下拉呈現) -->
                    <div class="bk-input bk-ro bk-ro-box" style="width:160px;" data-ro-field="method" v-if="isExt">{{getMethodText(form.method)}}</div>
                    <WTextSelect
                        style="width:160px;"
                        :items="methodItems"
                        :value="form.method"
                        @input="onChangeMethod"
                        v-else
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
                <div class="bk-col-label bk-title">{{$t('version')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <input class="bk-input" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.version" type="text" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldGroup')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <input class="bk-input" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.group" type="text" />
                    <div class="bk-err" v-if="errGroupLive">{{errGroupLive}}</div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('levels')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <input class="bk-input" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.levels" type="text" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('keywords')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <input class="bk-input" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.keywords" type="text" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('state')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <input class="bk-input" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.state" type="text" />
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('fieldOrder')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <input class="bk-input" :class="{'bk-ro': isExt}" :readonly="isExt" v-model.number="form.order" type="number" />
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
                <div class="bk-col-label bk-title">{{$t('mdInputParams')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.mdInputParams" rows="6"></textarea>
                    <div class="bk-preview bk-item" v-if="form.mdInputParams">
                        <MdPanel :md="form.mdInputParams"></MdPanel>
                    </div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('inputExample')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.inputExample" rows="4"></textarea>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('mdOutputParams')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.mdOutputParams" rows="6"></textarea>
                    <div class="bk-preview bk-item" v-if="form.mdOutputParams">
                        <MdPanel :md="form.mdOutputParams"></MdPanel>
                    </div>
                </div>
            </div>

            <div class="bk-row">
                <div class="bk-col-label bk-title">{{$t('outputExample')}}<ExtMark v-if="isExt" :tip="lockTip"></ExtMark></div>
                <div class="bk-col-field">
                    <textarea class="bk-textarea" :class="{'bk-ro': isExt}" :readonly="isExt" v-model="form.outputExample" rows="6"></textarea>
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

            <!-- 外部列不可由後台刪除: 刪除鈕停用(disabled＋pointer-events:none，使停留落在外層觸發區)並以 tooltip 說明 -->
            <WTooltip
                :isolated="true"
                :placement="'top'"
                :maxWidth="320"
                v-if="!isNew && isExt"
            >
                <template v-slot:trigger>
                    <button class="btn-delete btn-delete-off" disabled data-delete-locked="y">
                        {{$t('delete')}}
                    </button>
                </template>
                <template v-slot:content>
                    <div style="white-space:normal; word-break:break-word;">{{$t('externalRowDeleteTip')}}</div>
                </template>
            </WTooltip>
            <button class="btn-delete" @click="onClickDelete" v-else-if="!isNew">
                {{$t('delete')}}
            </button>

            <button class="btn-cancel" @click="onClickCancel">
                {{$t('cancel')}}
            </button>

        </div>

    </div>
</template>

<script>
import get from 'lodash-es/get.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import { mdiLock, mdiAlert } from '@mdi/js'
import { buildBaseline, digestRow } from 'w-serv-orm/src/baseline.mjs'
import WTextSelect from 'w-component-vue/src/components/WTextSelect.vue'
import WTooltip from 'w-component-vue/src/components/WTooltip.vue'
import MdPanel from './MdPanel.vue'
import ExtMark from './ExtMark.vue'
import contract from '../schema/contracts/apis.mjs'
import { isExternalRow, isMixedRow, getExternalGroups, isBlockedByExternalGroup, normGroup, fmtVars } from '../schema/contracts/externalRows.mjs'


//存檔／刪除被後端拒收之鍵(procLang): 一律保留草稿並提示重新載入(多人同時編輯規格第6、8節)
//saveStale: 持舊畫面存檔(先動先贏); errBaselineFormat: 基準格式或版本不識; errApiRowNotFound: 該 API 已不存在(已被他人刪除)
//saveExternalRowChanged／deleteExternalRowDenied(外部列受保護): 編輯中該列被匯入轉為外部列(srcKey 空 → 非空; 摘要不變故無推播提示)而草稿含外部擁有欄位之修改，或點了刪除 → 同樣提示並提供重新載入(重新載入後欄位唯讀、刪除鈕停用)
let KEYS_REJECT_CHANGED = ['saveStale', 'errBaselineFormat', 'saveExternalRowChanged', 'deleteExternalRowDenied']
let KEYS_REJECT_DELETED = ['errApiRowNotFound']


export default {
    components: {
        WTextSelect,
        WTooltip,
        MdPanel,
        ExtMark,
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
        gone: { //編輯中之原列已不在清單(被他人刪除): 由 LayoutContent 判定, 此時 item 仍為原列(停留原畫面, 不換成另一筆)
            type: Boolean,
            default: false,
        },
    },
    data: function() {
        return {

            form: {},

            //草稿保護: formInit 為載入時之快照(判定有無未存修改); baseline 為載入時以畫面所見之 store 列(props.item)自算之基準 [[id, 列摘要]],
            //凍結至重新載入／換筆, 推播不更新; remote 為他人更新之狀態('' | 'changed'); rejected 為存檔被拒之鍵
            formInit: {},
            baseline: undefined,
            baselineBroken: false, //既有列無法自算基準(舊資料含不可摘要之值): 禁止存檔／刪除, 不得降級為不帶基準(會靜默覆寫他人更新)
            remote: '',
            rejected: '',

            errName: '',
            errUrl: '',
            errJson: '',
            errJsonField: '',
            errSave: '',

            methodItems: this.$s.METHODS, //單一來源 mShare.METHODS（與測試分頁共用）
            authTypeItems: ['none', 'bearer', 'apikey', 'basic'],

            mdiLock,
            mdiAlert,

        }
    },
    computed: {

        //外部列受保護(原則 5, ADR-044, R-EXT-LOCK-01; 伺服端為強制者, 此處供畫面提示與送出前擋下, 判定共用 contracts/externalRows.mjs):
        //lockOn: webInfor.lockExternalRows 非 'n'(未給視為開啟, 同伺服端預設拒絕); extGroups: store 全表中外部管理之 group 集合
        lockOn: function() {
            let vo = this
            return get(vo, '$store.state.webInfor.lockExternalRows', 'y') !== 'n'
        },

        extGroups: function() {
            let vo = this
            return vo.lockOn ? getExternalGroups(get(vo, '$store.state.apis', [])) : new Set()
        },

        //isExt: 編輯中之既有列為外部列(以 props.item 即 store 中該列判定，非表單: srcKey 為伺服器專有欄位)——唯讀欄位、鎖頭、刪除鈕停用
        isExt: function() {
            let vo = this
            return vo.lockOn && !vo.isNew && isExternalRow(vo.item)
        },

        //isMixed: 外部管理 group 內無來源鍵之後台列(混雜列): 不鎖，提示下次匯入之行為
        isMixed: function() {
            let vo = this
            return vo.lockOn && !vo.isNew && isMixedRow(vo.item, vo.extGroups)
        },

        lockTip: function() {
            let vo = this
            return fmtVars(vo.$t('externalRowLocked'), { group: get(vo.item, 'group', '') })
        },

        //errGroupLive: 群組欄即時提示——新增列或後台列之 group 為外部管理之 group(混雜列 group 未改者不攔)
        errGroupLive: function() {
            let vo = this
            if (!vo.lockOn || vo.isExt) {
                return ''
            }
            if (isBlockedByExternalGroup(vo.isNew ? null : vo.item, vo.form.group, vo.extGroups)) {
                return fmtVars(vo.$t('externalGroupNoAdd'), { group: normGroup(vo.form.group) })
            }
            return ''
        },

        //isGone: 編輯既有列時原列已不在(被他人刪除; 由推播得知或存檔／刪除被回 errApiRowNotFound)
        isGone: function() {
            let vo = this
            return !vo.isNew && (vo.gone || vo.rejected === 'errApiRowNotFound')
        },

        //staleMsg: 草稿保護提示文字('' 為不顯示)
        staleMsg: function() {
            let vo = this
            if (vo.isGone) {
                return vo.$t('staleDeleted')
            }
            if (vo.remote === 'changed' || vo.rejected !== '') {
                return vo.$t('staleChanged')
            }
            return ''
        },

    },
    mounted: function() {
        let vo = this
        vo.initFromItem(vo.item)
    },
    watch: {

        //item 為 LayoutContent 提供之編輯對象: 既有列時為 store 中該列之複本(推播使 store 變動時, 即使內容不變也會換成新物件), 新增時為空白列。
        //不再深度監看並整份覆寫表單(舊作法使無關列之推播、搜尋框輸入皆丟棄草稿, E7)。依下列情形處理:
        //  新增模式: 空白列物件換新(使用者再點「新增」)才重置; 換成另一筆(id 不同)＝使用者主動切換 → 重置;
        //  同一筆: 比對該列與載入時基準之摘要——相同(無關推播／自己的存檔結果)不動; 不同(他人更新)→ 無未存修改則照舊重建並重凍結基準, 有則保留草稿並提示
        item: function(val, old) {
            let vo = this
            vo.onItemChange(val, old)
        },

        //gone: 原列被他人刪除 → 停留原畫面(item 仍為原列)並提示; 列重新出現且內容等於基準 → 自動撤提示
        gone: function(val) {
            let vo = this
            if (!val) {
                vo.onItemChange(vo.item, vo.item)
            }
        },

    },
    methods: {

        //initFromItem: 以 store 列(item)重建表單與基準。基準取自「畫面所見之 store 列」而非表單(表單可能已被使用者改過); 新增模式不帶基準
        initFromItem: function(item) {
            let vo = this
            let row = cloneDeep(item)
            vo.form = cloneDeep(row)
            vo.formInit = cloneDeep(row)
            vo.remote = ''
            vo.rejected = ''
            vo.baseline = undefined
            vo.baselineBroken = false
            if (!vo.isNew) {
                try {
                    vo.baseline = buildBaseline([row], contract)
                }
                catch (err) {
                    //列無主鍵或含不可摘要之值(過深巢狀、函式、非有限數字): 無法建立基準 → 標記後禁止存檔／刪除。
                    //不降級為不帶基準: 那會在他人更新後靜默覆寫(後端對不帶基準者不比對)
                    console.log('buildBaseline', err)
                    vo.baselineBroken = true
                }
            }
        },

        //isDirty: 有無未存修改——只比契約欄位(伺服器專有欄位的變動不算)
        isDirty: function() {
            let vo = this
            try {
                return digestRow(vo.form, contract) !== digestRow(vo.formInit, contract)
            }
            catch (err) {
                console.log('digestRow', err)
                return true
            }
        },

        onItemChange: function(val, old) {
            let vo = this
            if (vo.isNew) {
                if (val !== old) {
                    vo.initFromItem(val)
                }
                return
            }
            if (!iseobj(val) || get(val, 'id', '') !== get(vo.formInit, 'id', '')) { //換成另一筆(使用者主動點選)
                if (iseobj(val)) {
                    vo.initFromItem(val)
                }
                return
            }
            if (vo.gone) { //原列已被刪除: item 為停留的原列，不比對
                return
            }
            if (vo.rejected === 'errApiRowNotFound') {
                vo.rejected = '' //先前存檔／刪除被回「已不存在」, 現收到該列之新鮮內容(列重新出現, 如外部匯入恢復): 重新判定(外審 sol#13), 草稿仍保留
            }
            //同一筆: 該列之最新內容(val)與載入時基準比對
            let same = true
            try {
                same = !vo.baselineBroken && (vo.baseline === undefined || digestRow(val, contract) === vo.baseline[0][1])
            }
            catch (err) {
                console.log('digestRow', err)
                same = false
            }
            if (same) {
                if (vo.remote === 'changed') {
                    vo.remote = '' //他人的更新又被改回載入時的內容
                }
                return
            }
            if (vo.isDirty()) {
                vo.remote = 'changed' //有未存修改: 保留草稿與基準，提示；存檔時後端會以基準比對而拒收
            }
            else {
                vo.initFromItem(val) //無未存修改: 照舊重建並重凍結基準
            }
        },

        //onClickReload: 放棄草稿，取最新列(store)重建表單並重凍結基準
        onClickReload: function() {
            let vo = this
            if (vo.isGone) {
                return
            }
            vo.initFromItem(vo.item)
        },

        //markRejected: 存檔／刪除被拒時保留草稿(不動 form)並提示重新載入
        markRejected: function(err) {
            let vo = this
            if (KEYS_REJECT_CHANGED.includes(err) || KEYS_REJECT_DELETED.includes(err)) {
                vo.rejected = err
            }
        },

        fv: function(tpl, vars) {
            return fmtVars(tpl, vars)
        },

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
                if (!vo.isNew && vo.baselineBroken) { //既有列無法建立載入基準: 不降級為不帶基準存檔(會靜默覆寫他人更新)
                    vo.errSave = vo.$t('errBaselineBroken')
                    return
                }
                if (vo.errGroupLive !== '') { //外部管理之 group 不得新增列或改入(伺服端同樣整次拒收 saveExternalGroupDenied)；不送出
                    vo.errSave = vo.$t('saveExternalGroupDenied')
                    return
                }
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
                //修改既有列帶載入時自算之基準(後端於表鎖內與新鮮讀取比對; 不符 → saveStale、零寫入)；新增列不帶
                //成功時後端回傳寫入後之列(save 逐筆結果第 0 筆之 row, 表鎖內新鮮讀回; 新增時含新 id)——存檔成功後立即以之更新 store 列與下次編輯之基準(不等推播),
                //其後抵達之同內容推播摘要相同, 不被當成他人更新(規格第8節); 不得以送出之 form 當新基準(clearXSS 等會改寫)
                let okSave = false
                let rowSaved = null
                let baselineSent = vo.isNew ? undefined : cloneDeep(vo.baseline)
                let pmSave = (vo.isNew || vo.baseline === undefined) ? vo.$fapi.saveApi(cloneDeep(vo.form)) : vo.$fapi.saveApi(cloneDeep(vo.form), { baseline: cloneDeep(vo.baseline) })
                await pmSave
                    .then(function(res) {
                        okSave = true
                        rowSaved = get(res, '0.row', null)
                    })
                    .catch(function(err) {
                        console.log('saveApi', err); vo.errSave = vo.$transErr(err); vo.markRejected(err) //被拒: 保留草稿(不動 form)並提示重新載入
                    }) //err 為後端 err-key，依 lang 反查顯示
                if (!okSave) return

                // 5) 全成功
                vo.$emit('saved', { row: rowSaved, baseline: baselineSent })
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

            //外部列不可由後台刪除(刪除鈕已停用；此為保險，伺服端同樣拒收 deleteExternalRowDenied)
            if (vo.isExt) {
                return
            }

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

                // 2) 同步檢測（id 由 item 帶入；既有列無法建立載入基準時不降級為不帶基準刪除）
                if (vo.baselineBroken) {
                    vo.errSave = vo.$t('errBaselineBroken')
                    return
                }

                // 3) 開 loading
                vo.$ui.updateLoading(true)

                // 4) 執行 async
                let okDel = false
                let idDel = vo.form.id
                let baselineSent = cloneDeep(vo.baseline)
                let pmDel = vo.baseline === undefined ? vo.$fapi.deleteApi(vo.form.id) : vo.$fapi.deleteApi(vo.form.id, { baseline: cloneDeep(vo.baseline) })
                await pmDel
                    .then(function() {
                        okDel = true
                    })
                    .catch(function(err) {
                        console.log('deleteApi', err); vo.errSave = vo.$transErr(err); vo.markRejected(err)
                    }) //err 為後端 err-key，依 lang 反查顯示
                if (!okDel) return

                // 5) 全成功(父層立即自 store 移除該列, 其後之推播不致誤報「已被刪除」)
                vo.$emit('deleted', { id: idDel, baseline: baselineSent })
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
/* 草稿保護提示: 沿用既有警示色票(--s-4xx／--s-4xx-bg，同 4xx 狀態卡)、字級(--fs-sm)、圓角(--radius-lg)、按鈕樣式同 .btn-cancel；平時不渲染 */
.bk-stale {
    display: flex;
    align-items: center;
    gap: 12px;
    box-sizing: border-box;
    padding: 8px 12px;
    margin-bottom: 16px;
    color: var(--s-4xx);
    background: var(--s-4xx-bg);
    border: 1px solid var(--s-4xx);
    border-radius: var(--radius-lg);
    font-size: var(--fs-sm);
    line-height: 1.5;
}
.bk-stale-text {
    flex: 1;
    min-width: 0;
}
.bk-stale-btn {
    flex-shrink: 0;
    padding: 4px 14px;
    font-size: var(--fs-sm);
    border-radius: var(--radius-lg);
    border: 1px solid var(--s-4xx);
    background: var(--bg-1);
    color: var(--s-4xx);
    cursor: pointer;
    transition: background-color .15s;
}
.bk-stale-btn:hover {
    background: var(--s-4xx-bg);
}
/* 外部列受保護(原則 5, ADR-044): 唯讀欄位與說明列；平時不渲染／不套用。色票沿用既有: 底 --bg-2、邊線 --border、文字 --c-2、圖示 --accent；混雜列警告同草稿保護提示之 --s-4xx 色票 */
.bk-ext {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    box-sizing: border-box;
    padding: 8px 12px;
    margin-bottom: 16px;
    color: var(--c-2);
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    font-size: var(--fs-sm);
    line-height: 1.5;
}
.bk-ext-warn {
    color: var(--s-4xx);
    background: var(--s-4xx-bg);
    border-color: var(--s-4xx);
}
.bk-ext-ic {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--accent);
}
.bk-ext-warn .bk-ext-ic {
    color: var(--s-4xx);
}
.bk-ext-text {
    flex: 1;
    min-width: 0;
}
.bk-input.bk-ro,
.bk-textarea.bk-ro {
    background: var(--bg-2);
    color: var(--c-2);
    cursor: default;
}
.bk-input.bk-ro:focus,
.bk-textarea.bk-ro:focus {
    border-color: var(--border);
    box-shadow: none;
}
.bk-ro-box {
    display: block;
    line-height: normal;
}
.btn-delete-off {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
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
