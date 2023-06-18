<template>
    <div
        :style="`position:absolute; top:0px; left:0px; width:100%; height:100%; transition:all 0.5s linear; display:flex; align-items:center; justify-content:center;`"
    >

        <template v-if="connState==='已連線' || connState==='連線中...'">

            <img src="../../public/connecting.svg">

            <div style="margin-left:10px;">
                <div style="color:#aaa;">
                    {{connState}}
                </div>
            </div>

        </template>

        <template v-else-if="connState==='已登出'">

            <img style="width:75px; height:75px;" src="../../public/logout.png">

            <div style="margin-left:10px;">
                <div style="color:#aaa;">
                    {{connState}}
                </div>
            </div>

        </template>

        <template v-else-if="connState==='無法連線'">

            <img style="width:75px; height:75px;" src="../../public/disconnect.png">

            <div style="margin-left:10px;">
                <div style="color:#aaa;">
                    {{connState}}
                </div>
            </div>

        </template>

        <template v-else>

            <img style="width:75px; height:75px;" src="../../public/deny.png">

            <div style="margin-left:10px;">
                <div style="color:#aaa;">
                    {{connState}}
                </div>
            </div>

        </template>

    </div>
</template>

<script>
import get from 'lodash/get'


export default {
    components: {
    },
    props: {
    },
    data: function() {
        return {
        }
    },
    computed: {

        connState: function() {
            //console.log('computed loading')

            let vo = this

            return get(vo, `$store.state.connState`)
        },

    },
    methods: {
    }
}
</script>

<style scoped>
</style>
