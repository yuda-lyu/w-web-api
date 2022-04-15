<template>
    <div style="height:100vh; background:#f5f5f5;">

        <div :style="`height:${heightToolbar}px; padding:0px 10px; display:flex; align-items:center; background:#fff; border-bottom:1px solid #ccc;`">

            <WButtonCircle
                :icon="'mdi-menu'"
                :tooltip="'左側選單'"
                :shadow="false"
                @click="drawer = !drawer"
                v-if="false"
            ></WButtonCircle>

            <div style="padding-left:5px; white-space:nowrap">
                <div style="display:flex; align-items:center;">

                    <div style="padding-right:10px; display:flex; align-items:center;" v-if="webLogo">
                        <img style="width:36px; height:36px;" :src="webLogo" />
                    </div>

                    <div>
                        <div style="font-size:1.2rem; color:#000;">{{webName}}</div>
                        <div style="font-size:0.8rem; color:#666;">{{$t('webDescription')}}</div>
                    </div>

                </div>

            </div>

            <div style="width:100%;"></div>

            <div style="padding-right:10px; white-space:nowrap">
                <WTextSelect
                    :items="tgLangs"
                    v-model="tgLangSelect"
                    @input="changeLang"
                ></WTextSelect>
            </div>

        </div>

        <div :style="`height:calc( 100% - ${heightToolbar}px );`">
            <LayoutContent
            ></LayoutContent>
        </div>

    </div>
</template>

<script>
import get from 'lodash/get'
// import cloneDeep from 'lodash/cloneDeep'
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

            tgLangs: [
                {
                    id: 'cht',
                    text: '中文',
                },
                {
                    id: 'eng',
                    text: 'English',
                },
            ],
            tgLangSelect: {
                id: 'cht',
                text: '中文',
            },

        }
    },
    beforeMount: function() {
        // console.log('beforeMount')

        let vo = this

        //setLang
        vo.$ui.setLang(vo.tgLangSelect.id)

    },
    computed: {

        viewState: function() {
            return get(this, `$store.state.viewState`)
        },

        heightToolbar: function() {
            return get(this, `$store.state.heightToolbar`)
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
            return get(this, `$store.state.webInfor.webLogo`)
        },

    },
    methods: {

        changeLang: function(msg) {
            // console.log('methods changeLang', msg)
            let vo = this
            let lang = msg.id
            vo.$ui.setLang(lang)
        },

    }
}
</script>

<style scoped>
</style>
