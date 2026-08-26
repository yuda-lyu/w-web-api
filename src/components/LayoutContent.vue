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
                                        {{props.data.key}}
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
                                                <pre class="code" v-html="jsonHighlight($ui.gv(apiSelect,'outputExample'))"></pre>
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
import set from 'lodash-es/set.js'
import each from 'lodash-es/each.js'
import size from 'lodash-es/size.js'
import trim from 'lodash-es/trim.js'
import find from 'lodash-es/find.js'
import filter from 'lodash-es/filter.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import isobj from 'wsemi/src/isobj.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import convertToTree from 'wsemi/src/convertToTree.mjs'
import { mdiArrowLeft, mdiArrowRight, mdiCloudBraces, mdiChartBar } from '@mdi/js'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WDrawer from 'w-component-vue/src/components/WDrawer.vue'
import WTree from 'w-component-vue/src/components/WTree.vue'
import MdPanel from './MdPanel.vue'
import LayoutContentEdit from './LayoutContentEdit.vue'
import LayoutContentTest from './LayoutContentTest.vue'
import LayoutContentStats from './LayoutContentStats.vue'


export default {
    components: {
        WButtonCircle,
        WDrawer,
        WTree,
        MdPanel,
        LayoutContentEdit,
        LayoutContentTest,
        LayoutContentStats,
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

            //default
            vo.apiActive = null
            vo.apisTree = []
            vo.kpApisTree = {}

            //check
            if (size(vo.apis) === 0) {
                vo.apiSelect = null
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
            let kpTree = {}
            each(apis, (v) => {

                //id, levels
                let id = v.id
                let levels = `${v.levels}.${v.name}`

                //save
                kpTree[id] = v

                //check
                if (!isobj(get(tr, levels))) {
                    set(tr, levels, id)
                }

            })
            // console.log('tr', cloneDeep(tr))
            // console.log('kpTree', cloneDeep(kpTree))

            //convertToTree, 由預處理tree物件轉成tree物件
            let tree = convertToTree(tr, { bindRoot: '全部' })
            // console.log('tree', cloneDeep(tree))

            //apiSelect: 優先保留原選取(仍存在時), 否則取第一筆
            let apiSelect = null
            if (prevId !== '') {
                apiSelect = find(apis, { id: prevId }) || null
            }
            if (!iseobj(apiSelect)) {
                apiSelect = get(apis, 0, null)
            }
            // console.log('apiSelect', cloneDeep(apiSelect))

            //save
            vo.apiSelect = apiSelect
            vo.apisTree = tree
            vo.kpApisTree = kpTree

        },

        getItemByKey: function(key) {
            let vo = this
            // let k = `kpApisTree.${key}`
            // console.log('getItemByKey k', k)
            let r = vo.kpApisTree[key]
            // console.log('getItemByKey r', r, vo.kpApisTree)
            return r
        },

        getMethod: function(item) {
            // let vo = this
            let method = get(item, 'method', '').toUpperCase()
            return method
        },

        curlOf: function(item) {
            let vo = this
            let method = vo.getMethod(item) || 'GET'
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

        jsonHighlight: function(str) {
            let s = (str === null || str === undefined) ? '' : String(str)
            // escape HTML
            s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            // key: "xxx":
            s = s.replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="k">$1</span>$2')
            // string value
            s = s.replace(/:(\s*)("(?:[^"\\]|\\.)*")/g, ':$1<span class="s">$2</span>')
            // number
            s = s.replace(/([:\[,\s])(-?\d+\.?\d*)/g, '$1<span class="n">$2</span>')
            // bool/null
            s = s.replace(/\b(true|false|null)\b/g, '<span class="b">$1</span>')
            return s
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
            //種子空白API(預設值, 送出時後端funNew會配id/時間)
            vo.blankApi = {
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
            }
            vo.newMode = true
            vo.mode = 'edit'
        },

        onEditSaved: function() {
            let vo = this
            vo.newMode = false
            vo.mode = 'docs'
        },

        onEditDeleted: function() {
            let vo = this
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
