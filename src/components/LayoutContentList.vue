<template>
    <div
        style="height:100%;"
        :changeApis="changeApis"
    >

        <div style="display:flex; height:100%;" v-if="hasApis">

            <div style="min-width:400px; height:100%; _font-size:10pt; color:#444; background:#fff; overflow-y:auto;">

                <WTree
                    :viewHeightMax="null"
                    :data="apisTree"
                    :iconHeight="lineHeightTree"
                    :defItemHeight="lineHeightTree"
                    :activable="true"
                    :activeItem="apiActive"
                    :fun-active="funActive"
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

            </div>

            <div style="height:100%; border-right:1px solid #ddd;"></div>

            <div style="width:100%; height:100%; overflow-y:auto;" v-if="apiSelect">
                <div style="padding:15px 20px 10px 10px;">

                    <div style="padding:5px;">

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

                        <div style="padding-top:10px;">

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

                                <div style="" v-if="optputMenuItemSelectId==='tree'">
                                    <WJsonView
                                        style="width:100%;"
                                        :viewHeightMax="null"
                                        :data="getOutputJsonObj(apiSelect)"
                                    ></WJsonView>
                                </div>

                                <div style="padding:10px; color:#555; font-size:0.85rem;" v-if="optputMenuItemSelectId==='raw'">
                                    <pre>{{getOutputJson(apiSelect)}}</pre>
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

        </div>

        <div
            style="padding:20px; font-size:0.9rem;"
            v-else
        >
            {{$t('waitingData')}}
        </div>

    </div>
</template>

<script>
import get from 'lodash/get'
import set from 'lodash/set'
// import map from 'lodash/map'
import each from 'lodash/each'
import size from 'lodash/size'
// import join from 'lodash/join'
import trim from 'lodash/trim'
import find from 'lodash/find'
import cloneDeep from 'lodash/cloneDeep'
// import isestr from 'wsemi/src/isestr.mjs'
// import isnum from 'wsemi/src/isnum.mjs'
// import isarr from 'wsemi/src/isarr.mjs'
import isobj from 'wsemi/src/isobj.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import j2o from 'wsemi/src/j2o.mjs'
// import cdbl from 'wsemi/src/cdbl.mjs'
// import str2md5 from 'wsemi/src/str2md5.mjs'
// import sep from 'wsemi/src/sep.mjs'
import timemsTZ2day from 'wsemi/src/timemsTZ2day.mjs'
import convertToTree from 'wsemi/src/convertToTree.mjs'
import WGroupRadio from 'w-component-vue/src/components/WGroupRadio.vue'
import WTree from 'w-component-vue/src/components/WTree.vue'
import WJsonView from 'w-component-vue/src/components/WJsonView.vue'
import MdPanel from './MdPanel.vue'


export default {
    components: {
        WGroupRadio,
        WTree,
        WJsonView,
        MdPanel,
    },
    props: {
    },
    data: function() {
        return {

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

        apis: function() {
            return get(this, '$store.state.apis')
        },

        changeApis: function() {
            let vo = this
            vo.genTree(vo.apis)
            return ''
        },

        hasApis: function() {
            return size(this.apisTree) > 0
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
