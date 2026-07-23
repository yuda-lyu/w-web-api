<template>
    <div style="height:100svh; background:var(--bg-2);">

        <!-- menu top, 因窄版導致名稱換行故須使用overflow-y:hidden -->
        <div :style="`height:${heightToolbar}px; box-sizing:border-box; overflow-y:hidden; padding:0px 10px; background:var(--bg-1); border-bottom:1px solid var(--border); display:flex; align-items:center;`">

            <WButtonCircle
                :icon="'mdi-menu'"
                :tooltip="'左側選單'"
                :shadow="false"
                @click="drawer=!drawer"
                v-if="false"
            ></WButtonCircle>

            <div style="padding-left:5px; white-space:nowrap">
                <div style="display:flex; align-items:center;">

                    <div style="padding-right:10px; display:flex; align-items:center;" v-if="webLogo">
                        <img style="width:36px; _min-width:36px; height:36px;" :src="webLogo" />
                    </div>

                    <div>
                        <div style="font-size:var(--fs-h3); color:var(--c-1); font-weight:600;">{{webName}}</div>
                        <div style="font-size:var(--fs-xs); color:var(--c-2);">{{$t('webDescription')}}</div>
                    </div>

                </div>
            </div>

            <div style="width:100%;"></div>

            <div
                style="padding-right:10px; white-space:nowrap;"
                v-if="showLangSelect"
            >
                <WTextSelect
                    style="width:100px;"
                    :items="keysLang"
                    :value="lang"
                    @input="toggleLang"
                >
                    <template v-slot:select="props">
                        {{getLangText(props.item)}}
                    </template>
                    <template v-slot:item="props">
                        {{getLangText(props.item)}}
                    </template>
                </WTextSelect>
            </div>

        </div>

        <div :style="`height:calc( 100% - ${heightToolbar}px );`">
            <LayoutContent
            ></LayoutContent>
        </div>

    </div>
</template>

<script>
import get from 'lodash-es/get.js'
// import cloneDeep from 'lodash-es/cloneDeep.js'
import isestr from 'wsemi/src/isestr.mjs'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WTextSelect from 'w-component-vue/src/components/WTextSelect.vue'
import LayoutContent from './LayoutContent.vue'


export default {
    components: {
        WButtonCircle,
        WTextSelect,
        LayoutContent,
    },
    props: {
    },
    data: function() {
        return {

            drawer: false, //null,

            firstSetting: true,

            showLangSelect: false,

            keysLang: [
                'eng',
                'cht',
            ],
            kpLangSelect: {
                'eng': 'English',
                'cht': '中文',
            },

        }
    },
    mounted: function() {
        // console.log('mounted')

        let vo = this

        //firstSetting
        if (vo.firstSetting) {
            // console.log('webInfor', vo.webInfor)
            let showLanguage = get(vo, 'webInfor.showLanguage', '')
            // console.log('showLanguage', showLanguage)
            vo.showLangSelect = showLanguage === 'y'
            //setLang(null)：改走 getLang 解析（URL ?lang= > window 注入之 server 語系 > store），
            //不再用 webInfor.language 明確覆蓋（否則會蓋掉 URL ?lang= 與使用者切換）。server 初始語系已由
            //window.___pmwperm___.language（WWebApi 注入 index.html）提供，getLang 會取得。
            vo.$ui.setLang(null, 'layout mounted')
            vo.firstSetting = false
        }

    },
    computed: {

        heightToolbar: function() {
            //console.log('computed heightToolbar')

            let vo = this

            return get(vo, `$store.state.heightToolbar`, 0)
        },

        lang: function() {
            let vo = this
            return get(vo, `$store.state.lang`, '')
        },

        webInfor: function() {
            let wi = get(this, `$store.state.webInfor`)
            return wi
        },

        webName: {
            get() {
                let vo = this
                let c = vo.$t('webName')
                // console.log('get webName1', c)
                if (!isestr(c)) {
                    c = vo.$t('waitingData')
                }
                // console.log('get webName2', c)
                document.title = c //更換網頁title
                return c
            },
            // set(value) {
            //     return value
            // },
        },

        webLogo: function() {
            //console.log('computed webLogo')

            let vo = this

            return get(vo, `$store.state.webInfor.webLogo`, '')
        },

    },
    methods: {

        getLangText: function(lang) {
            // console.log('methods getLangText', lang)

            let vo = this

            let t = get(vo, `kpLangSelect.${lang}`, '')

            return t
        },

        toggleLang: function(lang) {
            // console.log('methods toggleLang', lang)

            let vo = this

            //setLang
            vo.$ui.setLang(lang, 'toggle')

        },

    }
}
</script>

<style scoped>
</style>
