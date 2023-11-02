<template>
    <div
        style="height:100%; width:100%;"
        :changeApis="changeApis"
        v-domresize
        @domresize="resize"
    >

        <template v-if="syncState">

            <WDrawer
                :style="`height:${panelHeight}px; width:100%;`"
                v-model="drawer"
                :drawerWidth.sync="drawerWidth"
                :drawerWidthMin="drawerWidthMin"
                :drawerWidthMax="drawerWidthMax"
                :mode="'from-left'"
                :dragDrawerWidth="true"
                :autoSwitch="true"
                :switchWidth="drawerWidth*2.3"
            >

                <template v-slot:drawer="props">
                    <div :style="`height:${props.height}px; background:#fff; position:relative;`">

                        <WTree
                            :style="`height:${props.height}px;`"
                            :viewHeightMax="props.height"
                            :data="apisTree"
                            :iconHeight="lineHeightTree"
                            :defItemHeight="lineHeightTree"
                            :activable="true"
                            :itemActive="apiActive"
                            :funActive="funActive"
                            :itemTextColorActive="'#000'"
                            :itemBackgroundColorActive ="'rgba(100,100,100,0.15)'"
                        >
                            <template v-slot:item="props">

                                <div
                                    :style="`display:flex; align-items:center; min-height:${lineHeightTree}px;`"
                                    v-if="props.data.type!=='node'"
                                >
                                    {{props.data.key}}
                                </div>

                                <div
                                    :style="`display:flex; align-items:center; min-height:${lineHeightTree}px; cursor:pointer;`"
                                    @click="ckItem(getItemByKey(props.data.text))"
                                    v-else
                                >

                                    <div style="padding-right:5px;">
                                        <div :style="`padding:0px 6px; font-size:0.7rem; border-radius:10px; border:1px solid #ddd; color:#fff; background:${getMethodColorByKey(props.data.text)};`">
                                            {{getMethodByKey(props.data.text)}}
                                        </div>
                                    </div>

                                    <div>
                                        {{$ui.gv(getItemByKey(props.data.text),'name')}}
                                    </div>

                                </div>

                            </template>
                        </WTree>

                        <div
                            :style="`position:absolute; top:1px; right:12px;`"
                            v-if="drawer"
                        >
                            <WButtonCircle
                                :paddingStyle="{v:3,h:3}"
                                :icon="'mdi-arrow-left'"
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

                        <!-- 選擇API之顯示區 -->
                        <template>

                            <div
                                :style="`height:${props.height}px; overflow-y:auto;`"
                                v-if="apiSelect"
                            >
                                <div style="padding:20px;">

                                    <div style="padding:5px;">

                                        <div class="bk-title" style="">
                                            {{$t('apiUrl')}}
                                        </div>

                                        <div style="padding:10px; border-radius:5px; border:1px solid #ddd; background:#fff; display:flex; align-items:center;">

                                            <div style="padding-right:5px;">
                                                <div :style="`padding:0px 6px; font-size:0.7rem; border-radius:10px; border:1px solid #ddd; color:#fff; background:${getMethodColor(apiSelect)};`">
                                                    {{getMethod(apiSelect)}}
                                                </div>
                                            </div>

                                            <div style="font-size:0.8rem;">
                                                {{$ui.gv(apiSelect,'url')}}
                                            </div>

                                        </div>

                                    </div>

                                    <div style="padding:10px;">

                                        <div style="color:#485ed5;">
                                            {{$ui.gv(apiSelect,'name')}}
                                        </div>

                                        <div class="bk-title" style="">
                                            {{$ui.gv(apiSelect,'description')}}
                                        </div>

                                    </div>

                                    <div style="padding:10px;">

                                        <div class="bk" style="">

                                            <div class="bk-title" style="">
                                                {{$t('tokens')}}
                                            </div>

                                            <div class="bk-item" style="">
                                                {{$ui.gv(apiSelect,'tokens')}}
                                            </div>

                                        </div>

                                        <div class="bk" style="">

                                            <div class="bk-title" style="">
                                                {{$t('version')}}
                                            </div>

                                            <div class="bk-item" style="">
                                                {{$ui.gv(apiSelect,'version')}}
                                            </div>

                                        </div>

                                        <div class="bk" style="">

                                            <div class="bk-title" style="">
                                                {{$t('levels')}}
                                            </div>

                                            <div class="bk-item" style="">
                                                {{$ui.gv(apiSelect,'')}}
                                            </div>

                                        </div>

                                        <div class="bk" style="">

                                            <div class="bk-title" style="">
                                                {{$t('keywords')}}
                                            </div>

                                            <div class="bk-item" style="">
                                                {{$ui.gv(apiSelect,'')}}
                                            </div>

                                        </div>

                                        <div class="bk" style="">

                                            <div class="bk-title" style="">
                                                {{$t('state')}}
                                            </div>

                                            <div class="bk-item" style="">
                                                {{$ui.gv(apiSelect,'')}}
                                            </div>

                                        </div>

                                        <div class="bk" style="">

                                            <div class="bk-title" style="">
                                                {{$t('timeCreate')}}
                                            </div>

                                            <div class="bk-item" style="">
                                                {{$ui.gv(apiSelect,'timeCreate',getDay)}}
                                            </div>

                                        </div>

                                        <div class="bk" style="">

                                            <div class="bk-title" style="">
                                                {{$t('timeUpdate')}}
                                            </div>

                                            <div class="bk-item" style="">
                                                {{$ui.gv(apiSelect,'timeUpdate',getDay)}}
                                            </div>

                                        </div>

                                        <div class="bk" style="">

                                            <div class="bk-title" style="">
                                                {{$t('creator')}}
                                            </div>

                                            <div class="bk-item" style="">
                                                {{$ui.gv(apiSelect,'creator')}}
                                            </div>

                                        </div>

                                        <div class="bk" style="">

                                            <div class="bk-title" style="">
                                                {{$t('dataSource')}}
                                            </div>

                                            <div class="bk-item" style="">
                                                {{$ui.gv(apiSelect,'dataSource')}}
                                            </div>

                                        </div>

                                        <div class="bk" style="">

                                            <div class="bk-title" style="">
                                                {{$t('isActive')}}
                                            </div>

                                            <div class="bk-item" style="">
                                                {{$ui.gv(apiSelect,'isActive')}}
                                            </div>

                                        </div>

                                    </div>

                                    <div style="padding:10px;">

                                        <div class="bk-title" style="">
                                            {{$t('mdInputParams')}}
                                        </div>

                                        <div class="bk-item" style="padding:10px;">
                                            <MdPanel
                                                :md="$ui.gv(apiSelect,'mdInputParams')"
                                            ></MdPanel>
                                        </div>

                                    </div>

                                    <div style="padding:10px;">

                                        <div class="bk-title" style="">
                                            {{$t('inputExample')}}
                                        </div>

                                        <div class="bk-item" style="padding:10px;">
                                            {{$ui.gv(apiSelect,'inputExample')}}
                                        </div>

                                    </div>

                                    <div style="padding:10px;">

                                        <div class="bk-title" style="">
                                            {{$t('mdOutputParams')}}
                                        </div>

                                        <div class="bk-item" style="padding:10px;">
                                            <MdPanel
                                                :md="$ui.gv(apiSelect,'mdOutputParams')"
                                            ></MdPanel>
                                        </div>

                                    </div>

                                    <div style="padding:10px;">

                                        <div class="bk-title" style="">
                                            {{$t('outputExample')}}
                                        </div>

                                        <div style="padding-top:3px;">

                                            <div style="padding-left:10px; margin-bottom:-1px;">
                                                <!-- 因上下皆有border, 故需負margin-bottom來吃掉重複border -->
                                                <WGroupRadio
                                                    :items="optputMenuItems"
                                                    :value="optputMenuItemSelect"
                                                    @input="changeOptputMenuItemSelect"
                                                    :group="true"
                                                    :group-border-radius-style="{top:true}"
                                                    :group-shift="7"
                                                    :border-radius="20"
                                                    :border-color="'#ddd'"
                                                    :border-color-hover="'#dadada'"
                                                    :border-color-active="'orange lighten-2'"
                                                    :margin-style="{}"
                                                ></WGroupRadio>
                                            </div>

                                            <div style="border:1px solid #ddd; background:#fff">

                                                <div
                                                    style="padding:10px 15px;"
                                                    v-if="optputMenuItemSelectId==='tree'"
                                                >
                                                    <WJsonView
                                                        style="width:100%;"
                                                        :viewHeightMax="null"
                                                        :data="getOutputJsonObj(apiSelect)"
                                                    ></WJsonView>
                                                </div>

                                                <div
                                                    style="padding:15px; color:#555; font-size:0.85rem;"
                                                    v-if="optputMenuItemSelectId==='raw'
                                                ">
                                                    <pre style="margin:0px; padding:0px;">{{getOutputJson(apiSelect)}}</pre>
                                                </div>

                                            </div>

                                        </div>

                                    </div>

                                </div>
                            </div>

                            <div
                                style="padding:20px; font-size:0.9rem;"
                                v-else
                            >
                                {{$t('noSelectApi')}}
                            </div>

                        </template>

                        <div
                            :style="`position:absolute; top:1px; left:4px;`"
                            v-if="!drawer"
                        >
                            <WButtonCircle
                                :paddingStyle="{v:3,h:3}"
                                :icon="'mdi-arrow-right'"
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

    </div>
</template>

<script>
import get from 'lodash/get'
import set from 'lodash/set'
import each from 'lodash/each'
import trim from 'lodash/trim'
import find from 'lodash/find'
import cloneDeep from 'lodash/cloneDeep'
import isobj from 'wsemi/src/isobj.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import j2o from 'wsemi/src/j2o.mjs'
import timemsTZ2day from 'wsemi/src/timemsTZ2day.mjs'
import convertToTree from 'wsemi/src/convertToTree.mjs'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WGroupRadio from 'w-component-vue/src/components/WGroupRadio.vue'
import WDrawer from 'w-component-vue/src/components/WDrawer.vue'
import WTree from 'w-component-vue/src/components/WTree.vue'
import WJsonView from 'w-component-vue/src/components/WJsonView.vue'
import MdPanel from './MdPanel.vue'


export default {
    components: {
        WButtonCircle,
        WGroupRadio,
        WDrawer,
        WTree,
        WJsonView,
        MdPanel,
    },
    props: {
    },
    data: function() {
        return {

            panelWidth: 0,
            panelHeight: 0,

            drawer: true,
            drawerWidth: 320,
            drawerWidthMin: 200,
            drawerWidthMax: 700,

            lineHeightTree: 38,

            apisTree: [],
            kpApisTree: {},
            apiActive: null,
            apiSelect: null,

            kpColorMethod: {
                GET: '#7c2',
                POST: '#68f',
                PUT: '#f82',
                DEL: '#f26',
            },

            optputMenuItemSelectId: 'tree',

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
            vo.genTree(apis)
            return ''
        },

        optputMenuItems: function() {
            let vo = this
            let ms = [
                {
                    id: 'tree',
                    text: vo.$t('outputMenuTree'),
                    icon: 'mdi-vanity-light',
                },
                {
                    id: 'raw',
                    text: vo.$t('outputMenuRaw'),
                    icon: 'mdi-lan',
                },
            ]
            return ms
        },

        optputMenuItemSelect: function() {
            let vo = this
            let r = find(vo.optputMenuItems, { id: vo.optputMenuItemSelectId })
            // console.log(r)
            return r
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

            //default
            vo.apisTree = []
            vo.kpApisTree = {}

            //cloneDeep
            let apis = cloneDeep(vo.apis)
            // console.log('apis', cloneDeep(apis))

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

            //filepathToTree

            //apiSelect, 預先選定api項目, 非tree選單active物件, 因id由convertToTree轉換提供, 故不能直接算得active選單物件id
            let apiSelect = get(apis, 0, null)
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

        getMethodByKey: function(key) {
            let vo = this
            let item = vo.getItemByKey(key)
            let method = get(item, 'method', '').toUpperCase()
            return method
        },

        getMethodColor: function(item) {
            let vo = this
            let method = vo.getMethod(item)
            let color = get(vo.kpColorMethod, method, '#888')
            return color
        },

        getMethodColorByKey: function(key) {
            let vo = this
            let method = vo.getMethodByKey(key)
            let color = get(vo.kpColorMethod, method, '#888')
            return color
        },

        getDay: function(t) {
            return timemsTZ2day(t)
        },

        getOutputJson: function(item) {
            // let vo = this
            let j = get(item, 'outputExample', '')
            j = trim(j)
            return j
        },

        getOutputJsonObj: function(item) {
            // let vo = this
            let j = this.getOutputJson(item)
            // console.log(j)
            let o = j2o(j)
            return o
        },

        funActive: function(msg) {
            let vo = this
            let b = !Array.isArray(msg.item.children) //children非陣列代表沒有所屬節點
            if (b) {
                if (!iseobj(vo.apiActive)) { //偵測若沒有apiActive才初始化預先選擇之api項目, 非api完整資訊
                    let id = msg.item.id
                    vo.apiActive = { id }
                    // console.log('!iseobj(vo.apiActive)', vo.apiActive)
                }
            }
            return b
        },

        changeOptputMenuItemSelect: function(msg) {
            // console.log('changeOptputMenuItemSelect', msg)
            let vo = this
            vo.optputMenuItemSelectId = msg.id
        },

        ckItem: function(item) {
            // console.log('ckItem', item)
            let vo = this
            vo.apiSelect = cloneDeep(item)
        },

    }
}
</script>

<style scoped>
.bk {
    display:inline-block;
    width:200px;
    padding:0px 10px 10px 0px;
    vertical-align:top;
}
.bk-title {
    padding:3px;
    font-size:0.8rem;
    color:#888;
}
.bk-item {
    padding:3px 5px;
    font-size:0.9rem;
    line-height:0.9rem;
    border-radius:5px;
    border:1px solid #ddd;
    background:#fff;
}
</style>
