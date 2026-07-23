<template>
    <div
        v-domresize
        @domresize="resize"
    >

        <LayoutState :style="`opacity:${ready?0:1};`" v-if="!ready"></LayoutState>

        <transition enter-active-class="fade-enter-active" leave-active-class="fade-leave-active">
            <Layout v-if="ready"></Layout>
        </transition>

        <LoadingWinBar></LoadingWinBar>
        <CheckYesNo></CheckYesNo>
        <CheckYes></CheckYes>

    </div>
</template>

<script>
import get from 'lodash-es/get.js'
import cloneDeep from 'lodash-es/cloneDeep.js'
import isestr from 'wsemi/src/isestr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isDev from 'wsemi/src/isDev.mjs'
import wui from 'w-ui-loginout/src/WUiLoginout.mjs'
import Layout from './components/Layout.vue'
import LayoutState from './components/LayoutState.vue'
import LoadingWinBar from './components/Common/LoadingWinBar.vue'
import CheckYesNo from './components/Common/CheckYesNo.vue'
import CheckYes from './components/Common/CheckYes.vue'


export default {
    components: {
        Layout,
        LayoutState,
        LoadingWinBar,
        CheckYesNo,
        CheckYes,
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

        //setLang：交由 getLang 解析（優先序 URL ?lang= > window ___pmwperm___.language > store），
        //支援「以 ?lang= 指定語系載入初始畫面」（對齊 w-web-sso），無 URL 時行為同舊（讀 html 注入語系）。
        vo.$ui.setLang(null, 'app init')

        function loginSuccess(data) {
            console.log('login success', cloneDeep(data.user))
            vo.$ui.updateConnState('csLogin')
            vo.$ui.updateUserToken(data.token)
            vo.$ui.updateUserSelf(data.user)
        }

        function loginError(data) {
            console.log('login error', cloneDeep(data))
            vo.$ui.updateConnState('csErrLogin')
            vo.$ui.updateUserToken('')
            let urlRedirect = get(window, '___pmwapi___.urlRedirect', '')
            if (!isestr(urlRedirect)) {
                console.log('urlRedirect', urlRedirect)
                throw new Error(`invalid urlRedirect`)
            }
            if (isDev()) {
                console.log('60s redirect to:', urlRedirect)
                setTimeout(() => {
                    window.location.href = urlRedirect
                }, 60 * 1000)
            }
            else {
                window.location.href = urlRedirect
            }
        }

        //login
        console.log('login...')
        let ll = wui('wapi', {
            timeWaitAnimation: 2000,
            params: {},
        })
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
            //console.log('computed ready')

            let vo = this

            let connState = get(vo, `$store.state.connState`)
            let webInfor = get(vo, `$store.state.webInfor`)

            let b1 = connState === 'csLogin'
            let b2 = iseobj(webInfor)
            let b = b1 && b2

            return b
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
    font-family: var(--font);
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
