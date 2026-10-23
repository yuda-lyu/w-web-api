<template>
    <div
        style="height:100%; width:100%;"
        v-domresize
        @domresize="resize"
        :changeApis="changeApis"
    >
      <div style="display:flex; height:100%; width:100%;">

        <!-- 左側垂直主選單（仿 w-web-sso）：切換 API 工作區 / 統計資訊 -->
        <div :style="`width:${widthMainMenu}px; flex-shrink:0; height:100%; box-sizing:border-box; background:var(--bg-2); border-right:1px solid var(--border); display:flex; flex-direction:column; padding:8px 0; gap:4px;`">
            <button
                v-for="m in mainMenus"
                :key="m.id"
                class="w-mm-btn"
                :class="{on: section===m.id}"
                @click="onClickMainMenu(m)"
            >
                <svg viewBox="0 0 24 24" width="22" height="22" style="display:block; margin:0 auto;"><path :d="m.icon" fill="currentColor"></path></svg>
                <div class="w-mm-label">{{$t(m.textKey)}}</div>
            </button>
        </div>

        <!-- 工作區 -->
        <div style="flex:1; min-width:0; height:100%; position:relative;">

          <template v-if="section==='api'">

            <template v-if="syncState">

            <WDrawer
                :style="`height:${panelHeight}px; width:100%;`"
                v-model="drawer"
                :drawerWidth.sync="drawerWidth"
                :drawerWidthMin="drawerWidthMin"
                :drawerWidthMax="drawerWidthMax"
                :mode="'from-left'"
                :dragDrawerWidth="true"
                :autoSwitchToHide="true"
                :autoSwitchToShow="true"
                :autoSwitchToFloat="true"
                :switchWidth="drawerWidth*2.3"
            >

                <template v-slot:drawer="props">
                    <div :style="`height:${props.height}px; background:var(--bg-2); border-right:1px solid var(--border); position:relative;`">

                        <!-- 搜尋 + 新增API -->
                        <div :style="`height:${heightDrawerHeader}px; box-sizing:border-box; padding:8px 40px 8px 8px; border-bottom:1px solid var(--border); display:flex; gap:6px; align-items:center;`">
                            <input
                                v-model="search"
                                type="text"
                                :placeholder="$t('searchApiPlaceholder')"
                                style="flex:1; min-width:0; padding:5px 8px; border:1px solid var(--border); border-radius:var(--radius); font-size:0.85rem; outline:none; box-sizing:border-box; transition:border-color .15s, box-shadow .15s;"
                                @focus="$event.target.style.borderColor='var(--accent)'; $event.target.style.boxShadow='var(--focus)'"
                                @blur="$event.target.style.borderColor='var(--border)'; $event.target.style.boxShadow='none'"
                            />
                            <button
                                @click="onClickAddApi"
                                class="w-btn-primary"
                                style="flex-shrink:0; white-space:nowrap;"
                            >+ {{$t('addApi')}}</button>
                        </div>

                        <template v-if="apisTree.length>0">
                            <WTree
                                :style="`height:${props.height-heightDrawerHeader}px;`"
                                :viewHeightMax="props.height-heightDrawerHeader"
                                :data="apisTree"
                                :iconHeight="lineHeightTree"
                                :defItemHeight="lineHeightTree"
                                :activable="true"
                                :itemActive="apiActive"
                                :funActive="funActive"
                                :itemTextColorActive="'var(--c-1)'"
                                :itemBackgroundColorActive ="'linear-gradient(to right, #0099ff 3px, rgba(0,153,255,0.08) 3px)'"
                                :indent="0.25"
                                :iconSize="12"
                            >
                                <template v-slot:item="props">

                                    <div
                                        :style="`display:flex; align-items:center; min-height:${lineHeightTree}px; color:var(--c-3); font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase;`"
                                        v-if="props.data.type!=='node'"
                                    >
                                        {{treeRowText(props.data.key)}}
                                    </div>

                                    <div
                                        :style="`display:flex; align-items:center; min-height:${lineHeightTree}px; cursor:pointer;`"
                                        @click="ckItem(getItemByKey(props.data.text), props.data)"
                                        v-else
                                    >

                                        <div style="padding-right:5px;">
                                            <div class="w-mb" :class="getMethodByKey(props.data.text).toLowerCase()">
                                                {{getMethodByKey(props.data.text)}}
                                            </div>
                                        </div>

                                        <div>
                                            {{$ui.gv(getItemByKey(props.data.text),'name')}}
                                        </div>

                                        <!-- 外部列(鎖頭)／外部管理 group 內無來源鍵之混雜列(警告): 原則 5, ADR-044; 平時不渲染 -->
                                        <ExtMark
                                            v-if="rowMark(props.data.text) !== ''"
                                            :kind="rowMark(props.data.text)"
                                            :tip="rowMarkTip(props.data.text)"
                                        ></ExtMark>

                                    </div>

                                </template>
                            </WTree>
                        </template>
                        <div
                            style="padding:20px; font-size:0.9rem;"
                            v-else
                        >
                            {{$t('waitingData')}}
                        </div>

                        <div
                            :style="`position:absolute; top:1px; right:12px;`"
                            v-if="drawer"
                        >
                            <WButtonCircle
                                :paddingStyle="{v:3,h:3}"
                                :icon="mdiArrowLeft"
                                :iconSize="16"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#eee'"
                                :backgroundColorFocus="'#fff'"
                                :borderColor="'transparent'"
                                :borderColorHover="'#eee'"
                                :borderColorFocus="'#eee'"
                                :tooltip="$t('menuTreeHide')"
                                :shadow="true"
                                @click="drawer=false"
                            ></WButtonCircle>
                        </div>

                    </div>
                </template>

                <template v-slot:content="props">
                    <div :style="`height:${props.height}px; width:${props.width}px; position:relative;`">

                        <!-- 模式切換(文件/編輯/測試) + 內容 -->
                        <template v-if="apiSelect || newMode">

                            <div :style="`height:${heightModeBar}px; box-sizing:border-box; padding:8px 12px; border-bottom:1px solid var(--border); background:var(--bg-1); display:flex; align-items:center;`">
                                <div class="w-seg">
                                    <button class="w-seg-btn" :class="{on: mode==='docs'}" @click="onChangeMode({id:'docs'})">{{$t('tabDocs')}}</button>
                                    <button class="w-seg-btn" :class="{on: mode==='edit'}" @click="onChangeMode({id:'edit'})">{{$t('tabEdit')}}</button>
                                    <button class="w-seg-btn" :class="{on: mode==='test'}" @click="onChangeMode({id:'test'})">{{$t('tabTest')}}</button>
                                </div>
                            </div>

                            <div
                                :style="`height:${props.height-heightModeBar}px; overflow-y:auto; background:var(--bg-1);`"
                                v-if="mode==='docs' && apiSelect"
                            >
                                <div style="padding:30px 36px;">

                                    <!-- op header -->
                                    <div><span class="w-mb" :class="getMethod(apiSelect).toLowerCase()">{{getMethod(apiSelect)}}</span></div>
                                    <div class="op-title">{{$ui.gv(apiSelect,'name')}}</div>
                                    <div class="op-path"><span class="w-mb" :class="getMethod(apiSelect).toLowerCase()">{{getMethod(apiSelect)}}</span><span class="w-mono">{{$ui.gv(apiSelect,'url')}}</span></div>
                                    <div class="op-desc">{{$ui.gv(apiSelect,'description')}}</div>

                                    <!-- metadata pills -->
                                    <div class="pills">
                                        <span class="pill" v-if="$ui.gv(apiSelect,'version')"><b>{{$ui.gv(apiSelect,'version')}}</b></span>
                                        <span class="pill" v-if="$ui.gv(apiSelect,'levels')">{{$t('levels')}} <b>{{$ui.gv(apiSelect,'levels')}}</b></span>
                                        <span class="pill" v-if="keywordsList.length">{{$t('keywords')}}<span class="kw-chip" v-for="kw in keywordsList" :key="'kw-'+kw">{{kw}}</span></span>
                                        <span class="pill ok" v-if="$ui.gv(apiSelect,'state')">{{$ui.gv(apiSelect,'state')}}</span>
                                        <span class="pill" v-if="$ui.gv(apiSelect,'creator')">{{$t('creator')}} <b>{{$ui.gv(apiSelect,'creator')}}</b></span>
                                        <span class="pill" v-if="$ui.gv(apiSelect,'dataSource')">{{$t('dataSource')}} <b>{{$ui.gv(apiSelect,'dataSource')}}</b></span>
                                    </div>

                                    <!-- two-column split -->
                                    <div class="split">
                                        <!-- 左欄：參數說明 -->
                                        <div>
                                            <div class="dsec">
                                                <div class="dsec-h">{{$t('docInput')}}</div>
                                                <div class="doc-md"><MdPanel :md="$ui.gv(apiSelect,'mdInputParams')"></MdPanel></div>
                                            </div>
                                            <div class="dsec">
                                                <div class="dsec-h">{{$t('docOutputFields')}}</div>
                                                <div class="doc-md"><MdPanel :md="$ui.gv(apiSelect,'mdOutputParams')"></MdPanel></div>
                                            </div>
                                        </div>
                                        <!-- 右欄：code rail -->
                                        <div class="rail">
                                            <div class="card">
                                                <div class="card-h"><span class="lab">{{$t('docRequest')}}</span><span class="w-muted" style="margin-left:auto; font-size:11.5px;">cURL</span></div>
                                                <pre class="code">{{curlOf(apiSelect)}}</pre>
                                            </div>
                                            <div class="card">
                                                <div class="card-h"><span class="lab">{{$t('resTitle')}}</span><span class="st">200 OK</span></div>
                                                <pre class="code" v-html="$s.jsonHighlight($ui.gv(apiSelect,'outputExample'))"></pre>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            <LayoutContentEdit
                                v-else-if="mode==='edit'"
                                :item="editItem"
                                :height="props.height-heightModeBar"
                                :isNew="newMode"
                                :gone="selectGone"
                                @saved="onEditSaved"
                                @deleted="onEditDeleted"
                                @cancel="onEditCancel"
                            ></LayoutContentEdit>

                            <LayoutContentTest
                                v-else-if="mode==='test' && apiSelect"
                                :item="apiSelect"
                                :height="props.height-heightModeBar"
                            ></LayoutContentTest>

                        </template>

                        <div
                            style="padding:20px; font-size:0.9rem;"
                            v-else
                        >
                            {{$t('noSelectApi')}}
                        </div>

                        <div
                            :style="`position:absolute; top:1px; left:4px;`"
                            v-if="!drawer"
                        >
                            <WButtonCircle
                                :paddingStyle="{v:3,h:3}"
                                :icon="mdiArrowRight"
                                :iconSize="16"
                                :backgroundColor="'#fff'"
                                :backgroundColorHover="'#eee'"
                                :backgroundColorFocus="'#fff'"
                                :borderColor="'transparent'"
                                :borderColorHover="'#eee'"
                                :borderColorFocus="'#eee'"
                                :tooltip="$t('menuTreeShow')"
                                :shadow="true"
                                @click="drawer=true"
                            ></WButtonCircle>
                        </div>

                    </div>
                </template>

            </WDrawer>

        </template>

        <template v-else>
            <div
                style="padding:20px; font-size:0.9rem;"
            >
                {{$t('waitingData')}}
            </div>
        </template>

          </template>

          <LayoutContentStats
            v-else-if="section==='stats'"
            :height="panelHeight"
          ></LayoutContentStats>

        </div>

      </div>
    </div>
</template>

<script>
import get from 'lodash-es/get.js'
import each from 'lodash-es/each.js'
import size from 'lodash-es/size.js'
import trim from 'lodash-es/trim.js'
import find from 'lodash-es/find.js'
import filter from 'lodash-es/filter.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import iseobj from 'wsemi/src/iseobj.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import dtmapping from 'wsemi/src/dtmapping.mjs'
import convertToTree from 'wsemi/src/convertToTree.mjs'
import ds from '../schema/index.mjs'
import { mdiArrowLeft, mdiArrowRight, mdiCloudBraces, mdiChartBar } from '@mdi/js'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WDrawer from 'w-component-vue/src/components/WDrawer.vue'
import WTree from 'w-component-vue/src/components/WTree.vue'
import MdPanel from './MdPanel.vue'
import LayoutContentEdit from './LayoutContentEdit.vue'
import LayoutContentTest from './LayoutContentTest.vue'
import LayoutContentStats from './LayoutContentStats.vue'
import ExtMark from './ExtMark.vue'
import { isExternalRow, isMixedRow, getExternalGroups, fmtVars } from '../schema/contracts/externalRows.mjs'


//樹根節點之哨符 key（非顯示文字）：顯示文字於 template 以 $t('treeRootAll') 依當前語系取得。
//用哨符而非中文字面值，一來使語系可即時切換，二來避免與真實 group 名稱（種子資料即有名為「全部」者）相撞。
let KEY_TREE_ROOT = '__treeRootAll__'

//編輯中之原列被他人刪除時 apiActive 之哨符 id(非任何樹節點 id): 使樹不高亮任何節點(funActive 見 apiActive 為物件即不初始化第一個葉節點)
let KEY_ACTIVE_GONE = '__gone__'


export default {
    components: {
        WButtonCircle,
        WDrawer,
        WTree,
        MdPanel,
        LayoutContentEdit,
        LayoutContentTest,
        LayoutContentStats,
        ExtMark,
    },
    props: {
    },
    data: function() {
        return {

            panelWidth: 0,
            panelHeight: 0,

            //左側垂直主選單
            section: 'stats', //'api' | 'stats'; 進站預設頁為統計資訊
            widthMainMenu: 76,
            mainMenus: [
                { id: 'stats', textKey: 'mmStaInfor', icon: mdiChartBar },
                { id: 'api', textKey: 'mmApi', icon: mdiCloudBraces },
            ],

            drawer: true,
            drawerWidth: 320,
            drawerWidthMin: 200,
            drawerWidthMax: 700,

            lineHeightTree: 38,

            apisTree: [],
            kpApisTree: {},
            apiActive: null,
            mdiArrowLeft,
            mdiArrowRight,
            apiSelect: null,
            selectGone: false, //編輯既有列時，原列已被他人刪除(不在最新清單): 停留原畫面(apiSelect 仍為原列)並由編輯器提示，不換成另一筆(草稿保護)

            //API 管理：模式切換 / 新增 / 搜尋
            mode: 'docs', //'docs' | 'edit' | 'test'
            newMode: false,
            blankApi: {},
            search: '',
            heightModeBar: 46,
            heightDrawerHeader: 48,

        }
    },
    computed: {

        syncState: function() {
            return get(this, '$store.state.syncState')
        },

        apis: function() {
            return get(this, '$store.state.apis')
        },

        //外部列受保護(原則 5, ADR-044): lockOn 同伺服端 opt.lockExternalRows(webInfor.lockExternalRows 非 'n'); extGroups 為 store 全表(非搜尋過濾後)中外部管理之 group
        lockOn: function() {
            return get(this, '$store.state.webInfor.lockExternalRows', 'y') !== 'n'
        },

        extGroups: function() {
            let vo = this
            return vo.lockOn ? getExternalGroups(vo.apis) : new Set()
        },

        changeApis: function() {
            let vo = this
            //trigger
            let apis = vo.apis
            let search = vo.search //讓搜尋變更也觸發tree重建
            void search
            vo.genTree(apis)
            return ''
        },

        editItem: function() {
            let vo = this
            return vo.newMode ? vo.blankApi : vo.apiSelect
        },

        //關鍵字以分號切開成陣列（trim + 去空），供 pills 區逐一以 chip 呈現
        keywordsList: function() {
            let vo = this
            let s = get(vo.apiSelect, 'keywords', '')
            if (!s) {
                return []
            }
            return String(s).split(';').map((x) => x.trim()).filter((x) => x !== '')
        },

    },
    methods: {

        resize: function(msg) {
            // console.log('methods resize', msg)

            let vo = this

            //save
            vo.panelWidth = msg.snew.clientWidth
            vo.panelHeight = msg.snew.clientHeight
            // console.log('vo.panelHeight', vo.panelHeight)

        },

        genTree: function () {
            let vo = this

            //保留目前選取的API id, 重建後盡量維持選取(避免儲存/同步後選取跳回第一筆)
            let prevId = get(vo.apiSelect, 'id', '')

            //editingExisting: 正在編輯既有列(編輯分頁、非新增模式)——此時選取須與搜尋、他人之刪除脫鉤，否則草稿被換筆而丟失(多人同時編輯規格第8節 草稿保護; E7、A6)
            //文件／測試分頁維持原行為(選取隨搜尋結果轉移)，不改變既有畫面
            let editingExisting = vo.mode === 'edit' && !vo.newMode && prevId !== ''

            //default
            vo.apiActive = null
            vo.apisTree = []
            vo.kpApisTree = {}

            //check
            if (size(vo.apis) === 0) {
                if (editingExisting && iseobj(vo.apiSelect)) { //清單全空(如全被刪除): 停留原畫面
                    vo.apiActive = { id: KEY_ACTIVE_GONE }
                    vo.selectGone = true
                    return
                }
                vo.apiSelect = null
                vo.selectGone = false
                return
            }

            //cloneDeep
            let apis = cloneDeep(vo.apis)
            // console.log('apis', cloneDeep(apis))

            //搜尋過濾(name/keywords/url/levels/method)
            let sterm = trim(vo.search).toLowerCase()
            if (sterm !== '') {
                apis = filter(apis, (v) => {
                    let hay = `${get(v, 'name', '')} ${get(v, 'keywords', '')} ${get(v, 'url', '')} ${get(v, 'levels', '')} ${get(v, 'method', '')}`.toLowerCase()
                    return hay.indexOf(sterm) >= 0
                })
            }

            //tr
            let tr = {}
            let kpTree = Object.create(null) //鍵為 API id(外部同步可給任意字串主鍵), 無原型 (R-KEY-01)
            each(apis, (v) => {

                //id, levels(節點路徑陣列: levels 依 . 分層, name 為單一葉名, 不把 name 內之 . 或 [ 當路徑, 見 mShare.apiTreePath)
                let id = v.id
                let levels = vo.$s.apiTreePath(v.levels, v.name)

                //save
                kpTree[id] = v

                //寫入樹物件(各層以自有鍵判斷與寫入, 名稱為 __proto__ 等原型鍵名者亦保留, 見 mShare.apiTreeSet)
                vo.$s.apiTreeSet(tr, levels, id)

            })
            // console.log('tr', cloneDeep(tr))
            // console.log('kpTree', cloneDeep(kpTree))

            //convertToTree, 由預處理tree物件轉成tree物件
            //bindRoot 用不會與真實資料相撞之哨符：樹根是 UI 產生的標籤（非資料），須隨語系切換即時改變，
            //故不可在此把譯文烤進樹資料（語系為就地切換、不重載頁面，烤進去會停在舊語系直到樹重建）。
            //譯文於 template 以 $t(KEY_TREE_ROOT_TEXT) 呈現。附帶修正：原值 '全部' 會與同名之 group 資料相撞。
            let tree = convertToTree(tr, { bindRoot: KEY_TREE_ROOT })
            // console.log('tree', cloneDeep(tree))

            //apiSelect: 優先保留原選取(仍存在時), 否則取第一筆
            let apiSelect = null
            let gone = false
            if (editingExisting) {
                //編輯既有列: 以「未過濾」之清單找原列(搜尋只影響左樹，不影響選取，P4)；找不到(被他人刪除)則停留原畫面、不取第一筆(P3)
                let hit = find(vo.apis, { id: prevId })
                if (iseobj(hit)) {
                    apiSelect = cloneDeep(hit)
                }
                else {
                    apiSelect = vo.apiSelect
                    gone = true
                }
            }
            else {
                if (prevId !== '') {
                    apiSelect = find(apis, { id: prevId }) || null
                }
                if (!iseobj(apiSelect)) {
                    apiSelect = get(apis, 0, null)
                }
            }
            // console.log('apiSelect', cloneDeep(apiSelect))

            //save
            vo.apiSelect = apiSelect
            vo.selectGone = gone
            vo.apisTree = tree
            vo.kpApisTree = kpTree
            if (editingExisting && iseobj(apiSelect) && !find(apis, { id: apiSelect.id })) {
                vo.apiActive = { id: KEY_ACTIVE_GONE } //編輯中之列不在樹中(被他人刪除，或被搜尋濾掉): 不讓 funActive 把第一個葉節點標成選取
            }

        },

        getItemByKey: function(key) {
            let vo = this
            // let k = `kpApisTree.${key}`
            // console.log('getItemByKey k', k)
            let r = vo.kpApisTree[key]
            // console.log('getItemByKey r', r, vo.kpApisTree)
            return r
        },

        //rowMark: 樹狀清單列之外部標記——'lock' 外部列、'warn' 外部管理 group 內無來源鍵之混雜列、'' 無(含關閉 lockExternalRows)
        rowMark: function(key) {
            let vo = this
            if (!vo.lockOn) {
                return ''
            }
            let row = vo.getItemByKey(key)
            if (isExternalRow(row)) {
                return 'lock'
            }
            return isMixedRow(row, vo.extGroups) ? 'warn' : ''
        },

        rowMarkTip: function(key) {
            let vo = this
            let group = get(vo.getItemByKey(key), 'group', '')
            return fmtVars(vo.$t(vo.rowMark(key) === 'warn' ? 'externalGroupMixedTip' : 'externalRowLocked'), { group })
        },

        getMethod: function(item) {
            // let vo = this
            let method = get(item, 'method', '').toUpperCase()
            return method
        },

        curlOf: function(item) {
            let vo = this
            //方法代號 → HTTP 標準動詞：cURL 亦須顯示 DELETE 而非 DEL（複製貼上即可執行），與送出路徑同一述語
            let method = vo.$s.methodToHttpVerb(vo.getMethod(item))
            let url = get(item, 'inputExample', '')
            if (!url) {
                url = get(item, 'url', '')
            }
            return 'curl -X ' + method + ' "' + url + '"'
        },

        getMethodByKey: function(key) {
            let vo = this
            let item = vo.getItemByKey(key)
            let method = get(item, 'method', '').toUpperCase()
            return method
        },

        //樹之群組列顯示文字：樹根為 UI 標籤（哨符）→ 依當前語系取譯文；其餘為資料（levels 群組名）→ 原樣顯示。
        //於 template 取值而非在 genTree 烤進資料，語系就地切換時才會即時更新。
        treeRowText: function(key) {
            let vo = this
            return (key === KEY_TREE_ROOT) ? vo.$t('treeRootAll') : key
        },

        funActive: function(msg) {
            let vo = this
            let b = !Array.isArray(msg.item.children) //children非陣列代表沒有所屬節點(葉節點)
            if (b) {
                //渲染時用穩定的 api id(=節點 text) 對應目前選取項, 把 apiActive 刷新成該葉節點「當前」的 id;
                //避免存檔後 tree 重建、convertToTree 重新產生節點 id, 使 apiActive 變舊而高亮(含左側 accent bar)失效
                let itemText = get(msg, 'item.text', '')
                let itemId = get(msg, 'item.id', '')
                if (iseobj(vo.apiSelect) && itemText === vo.apiSelect.id) {
                    if (get(vo.apiActive, 'id') !== itemId) {
                        vo.apiActive = { id: itemId }
                    }
                }
                else if (!iseobj(vo.apiActive)) { //無選取時初始化第一個葉節點為 active
                    vo.apiActive = { id: itemId }
                }
            }
            return b
        },

        ckItem: function(item, node) {
            // console.log('ckItem', item)
            let vo = this
            vo.apiSelect = cloneDeep(item)
            if (iseobj(node)) { //點擊即更新 active 節點 id, 使高亮(含左側 bar)立即移到所點項目
                vo.apiActive = { id: node.id }
            }
            vo.newMode = false //點選既有API即離開新增狀態
        },

        onChangeMode: function(msg) {
            let vo = this
            vo.mode = msg.id
            //切到非編輯模式時取消新增狀態
            if (vo.newMode && msg.id !== 'edit') {
                vo.newMode = false
            }
        },

        onClickMainMenu: function(m) {
            let vo = this
            vo.section = m.id
        },

        onClickAddApi: function() {
            let vo = this
            //種子空白API(預設值, 送出時後端funNew會配id/時間)。
            //以 schema 全部欄位補齊（缺者為 ''）：編輯表單以 cloneDeep(item) 為 form，Vue 2 對初始不存在之屬性無法追蹤，
            //只列預設值時 tokens／testBaseUrl／authConfigJson／default*Json 等欄位於新增模式為非響應式（ADR-031）
            vo.blankApi = dtmapping({
                name: '',
                description: '',
                url: '',
                method: 'get',
                version: 'v1',
                group: '',
                levels: '',
                keywords: '',
                state: 'ok',
                authType: 'none',
                contentType: 'application/json',
            }, ds.apis.keys, '')
            vo.newMode = true
            vo.mode = 'edit'
        },

        //onEditSaved: 存檔成功。後端回傳寫入後之列(表鎖內新鮮讀回) → 立即更新 store 列(左樹、右側文件與下次開啟編輯之基準皆取自 store), 不等推播／輪詢;
        //其後抵達之同內容推播, 該列摘要與基準相同, 編輯器不視為他人更新(多人同時編輯規格第8節; 先動先贏不被削弱: 他人於其後改了同一列, 其推播先到時不回退, 見 store/applyRows.mjs)
        onEditSaved: function(msg) {
            let vo = this
            if (iseobj(get(msg, 'row'))) {
                vo.$store.commit(vo.$store.types.ApplySavedRow, { tableName: 'apis', row: msg.row, baseline: msg.baseline })
            }
            vo.newMode = false
            vo.mode = 'docs'
        },

        //onEditDeleted: 刪除成功 → 立即自 store 移除該列(不等推播), 其後之推播不致使重開編輯之頁面誤報「已被他人刪除」
        onEditDeleted: function(msg) {
            let vo = this
            if (isestr(get(msg, 'id'))) {
                vo.$store.commit(vo.$store.types.ApplyDeletedRow, { tableName: 'apis', id: msg.id, baseline: msg.baseline })
            }
            vo.newMode = false
            vo.apiSelect = null
            vo.mode = 'docs'
        },

        onEditCancel: function() {
            let vo = this
            vo.newMode = false
            vo.mode = 'docs'
        },

    }
}
</script>

<style scoped>
.w-mm-btn {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 4px;
    border: none;
    border-left: 3px solid transparent;
    background: transparent;
    color: var(--c-2);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: background .15s, color .15s, border-color .15s;
}
.w-mm-btn:hover {
    background: rgba(0, 153, 255, 0.06);
    color: var(--c-1);
}
.w-mm-btn.on {
    color: var(--accent);
    border-left-color: var(--accent);
    background: rgba(0, 153, 255, 0.08);
}
.w-mm-label {
    font-size: 11px;
    line-height: 1.2;
    text-align: center;
    word-break: break-word;
}
</style>
