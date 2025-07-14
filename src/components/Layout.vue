<template>
    <div style="height:100svh; background:#f5f5f5;">

        <!-- menu top, 因窄版導致名稱換行故須使用overflow-y:hidden -->
        <div :style="`height:${heightToolbar}px; overflow-y:hidden; padding:0px 10px; background:#fff; border-bottom:1px solid #ccc; display:flex; align-items:center;`">

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
                        <div style="font-size:1.2rem; color:#000;">{{webName}}</div>
                        <div style="font-size:0.8rem; color:#666;">{{$t('webDescription')}}</div>
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
            let language = get(vo, 'webInfor.language', '')
            // console.log('language', language)
            vo.$ui.setLang(language, 'layout mounted')
            vo.firstSetting = false
        }

    },
    computed: {

        viewState: function() {
            return get(this, `$store.state.viewState`, '')
        },

        heightToolbar: function() {
            //console.log('computed heightToolbar')

            let vo = this

            return get(vo, `$store.state.heightToolbar`, 0)
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
