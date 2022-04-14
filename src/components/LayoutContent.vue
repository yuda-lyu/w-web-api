<template>
    <div style="height:100%;">

        <template v-if="syncState">

            <LayoutContentList></LayoutContentList>

        </template>

        <div
            style="padding:20px; font-size:0.9rem;"
            v-else
        >
            {{kpTexts.waitingData}}
        </div>

    </div>
</template>

<script>
import get from 'lodash/get'
// import map from 'lodash/map'
// import each from 'lodash/each'
// import size from 'lodash/size'
// import cloneDeep from 'lodash/cloneDeep'
// import isestr from 'wsemi/src/isestr.mjs'
// import isnum from 'wsemi/src/isnum.mjs'
// import cdbl from 'wsemi/src/cdbl.mjs'
// import WPanelBulge from 'w-component-vue/src/components/WPanelBulge.vue'
// import WButtonChip from 'w-component-vue/src/components/WButtonChip.vue'
// import WGroupCheck from 'w-component-vue/src/components/WGroupCheck.vue'
// import WTree from 'w-component-vue/src/components/WTree.vue'
import LayoutContentList from './LayoutContentList.vue'


export default {
    components: {
        // WPanelBulge,
        // WButtonChip,
        // WGroupCheck,
        // WTree,
        LayoutContentList,
    },
    props: {
    },
    data: function() {
        return {
        }
    },
    computed: {

        kpTexts: function() {
            return this.$ui.getKpLang()
        },

        syncState: function() {
            return get(this, '$store.state.syncState')
        },

    },
    methods: {
    }
}
</script>

<style scoped>
</style>
