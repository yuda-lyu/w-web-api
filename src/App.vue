<template>
    <div
        v-domresize
        @domresize="resize"
    >

        <LayoutState :style="`opacity:${ready?0:1};`" v-if="!ready"></LayoutState>

        <transition enter-active-class="fade-enter-active" leave-active-class="fade-leave-active">
            <Layout v-if="ready"></Layout>
        </transition>

    </div>
</template>

<script>
import get from 'lodash/get'
import cloneDeep from 'lodash/cloneDeep'
import wui from 'w-ui-loginout/src/WUiLoginout.mjs'
import Layout from './components/Layout.vue'
import LayoutState from './components/LayoutState.vue'


export default {
    components: {
        Layout,
        LayoutState,
    },
    data: function() {
        return {
            ll: null,
        }
    },
    beforeMount: function() {
        // console.log('methods beforeMount')

        let vo = this

        //setVo, 更換ui內vo, 才能使用廣播技術, 更換語系才能用廣播通知全部組件forceUpdate
        vo.$ui.setVo(vo)

        function loginSuccess(data) {
            console.log('login success', cloneDeep(data.user))
            vo.$ui.updateConnState('已連線')
            vo.$ui.updateUserToken(data.token)
            vo.$ui.updateUserSelf(data.user)
        }

        function loginError(data) {
            console.log('login error', cloneDeep(data))
            vo.$ui.updateConnState(data.text)
            vo.$ui.updateUserToken('')
            vo.$ui.updateUserSelf(get(vo, `$store.state.userDef`))
        }

        //login
        console.log('login...')
        let ll = wui('wperm')
        ll.login({
            afterGetUser: null,
            afterLogin: null,
            loginSuccess,
            loginError,
        })
        vo.ll = ll

    },
    computed: {

        ready: function() {
            let connState = get(this, `$store.state.connState`)
            return connState === '已連線'
        },

    },
    methods: {

        resize: function(msg) {
            // console.log('methods resize', msg)

            let vo = this

            //syncHeight
            vo.$ui.syncHeight()

        },

    },
}
</script>

<style>
html,
body {
    font-family: '微軟正黑體', 'Microsoft JhengHei', 'MicrosoftJhengHeiRegular', 'Avenir', Helvetica, Arial, sans-serif;
    overflow-y: hidden;
}

div,
p,
span,
a,
pre,
input,
textarea,
button {
    font-family: inherit;
}

.v-application, .v-application--wrap {
    font-family: inherit;
}

.v-chip {
    cursor: inherit;
}

.fade-enter-active {
  animation: go 1s;
}

.fade-leave-active {
  animation: back 1s;
}

@keyframes go {
  from { opacity: 0; }
  to {opacity: 1;}
}

@keyframes back {
  from { opacity: 1; }
  to { opacity: 0; }
}

</style>
