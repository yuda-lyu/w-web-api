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

            <WButtonCircle
                :icon="'mdi-menu'"
                :tooltip="'cht'"
                :shadow="false"
                @click="$store.commit($store.types.UpdateLang, 'cht')"
                v-if="false"
            ></WButtonCircle>

            <WButtonCircle
                :icon="'mdi-menu'"
                :tooltip="'eng'"
                :shadow="false"
                @click="$store.commit($store.types.UpdateLang, 'eng')"
                v-if="false"
            ></WButtonCircle>

            <div style="padding-left:10px; font-size:1.2rem; color:#000; white-space:nowrap">
                <div>{{webName}}</div>
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
    computed: {

        heightToolbar: function() {
            return get(this, `$store.state.heightToolbar`)
        },

        kpTexts: function() {
            return this.$ui.getKpLang()
        },

        webName: function() {
            let name = get(this, 'kpTexts.webName', this.kpTexts.waitingData)
            document.title = name //更換網頁title
            return name
        },

        lang: function() {
            return get(this, `$store.state.lang`)
        },

        viewState: function() {
            return get(this, `$store.state.viewState`)
        },

    },
    methods: {

        changeLang: function(msg) {
            // console.log('methods changeLang', msg)
            let vo = this
            let lang = msg.id
            vo.$store.commit(vo.$store.types.UpdateLang, lang)
        },

    }
}
</script>

<style scoped>
</style>
