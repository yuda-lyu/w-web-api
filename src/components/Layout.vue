<template>
    <div style="height:100svh; background:var(--bg-2);">

        <!-- menu top, 內容驅動之RWD(同 w-web-sso ADR-067): 系統名稱/說明/語系選單全部攤開所需之自然寬未超過標題列寬時為寬版(與原版面相同),
             超過則右側收合為漢堡按鈕(WPopup內含當前登入者資訊/語系切換); 名稱與說明各自以剩餘寬為上限, 超出顯示省略符號並以WTooltip提供全文.
             overflow:hidden為保險, 正常情況下任何寬度皆不溢出(原overflow-y:hidden會使水平方向自動出現捲軸, 語系選單被擠出畫面) -->
        <div
            ref="rfHeader"
            :style="`height:${heightToolbar}px; box-sizing:border-box; overflow:hidden; padding:0px 10px; background:var(--bg-1); border-bottom:1px solid var(--border); display:flex; align-items:center;`"
            v-domresize
            @domresize="resizeHeader"
        >

            <WButtonCircle
                :icon="'mdi-menu'"
                :tooltip="'左側選單'"
                :shadow="false"
                @click="drawer=!drawer"
                v-if="false"
            ></WButtonCircle>

            <!-- 識別區, flex:1與min-width:0使寬度隨版寬伸縮, 不再以nowrap撐開整列 -->
            <div style="padding-left:5px; display:flex; align-items:center; flex:1 1 auto; min-width:0;">

                <div style="padding-right:10px; display:flex; align-items:center; flex:0 0 auto;" v-if="webLogo">
                    <img style="width:36px; _min-width:36px; height:36px;" :src="webLogo" />
                </div>

                <div style="flex:1 1 auto; min-width:0;">

                    <!-- 系統名稱, 超出剩餘寬時省略; 僅於確實被截斷時啟用tooltip, 顯示中則維持啟用直到移出, 避免截斷狀態於顯示中翻轉致提示無法關閉(editable為false時mouseleave不處理) -->
                    <WTooltip
                        :displayType="'line'"
                        :isolated="true"
                        :placement="'bottom-start'"
                        :maxWidth="tooltipMaxWidth"
                        :editable="webNameTruncated || tipNameShown"
                        @show="tipNameShown=true"
                        @hide="tipNameShown=false"
                    >
                        <template v-slot:trigger>
                            <div
                                ref="rfWebName"
                                style="font-size:var(--fs-h3); color:var(--c-1); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
                            >{{webName}}</div>
                        </template>
                        <template v-slot:content>
                            <div style="white-space:normal; word-break:break-word;">{{webName}}</div>
                        </template>
                    </WTooltip>

                    <!-- 系統說明, 同上 -->
                    <WTooltip
                        :displayType="'line'"
                        :isolated="true"
                        :placement="'bottom-start'"
                        :maxWidth="tooltipMaxWidth"
                        :editable="webDescTruncated || tipDescShown"
                        @show="tipDescShown=true"
                        @hide="tipDescShown=false"
                    >
                        <template v-slot:trigger>
                            <div
                                ref="rfWebDesc"
                                style="font-size:var(--fs-xs); color:var(--c-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
                            >{{webDesc}}</div>
                        </template>
                        <template v-slot:content>
                            <div style="white-space:normal; word-break:break-word;">{{webDesc}}</div>
                        </template>
                    </WTooltip>

                </div>

            </div>

            <div
                style="padding-right:10px; white-space:nowrap; flex:0 0 auto;"
                v-if="showLangSelect && !isNarrow"
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

            <!-- 窄版: 右側收合為漢堡按鈕, 彈窗內依序為當前登入者資訊/語系切換(本系統無登出功能); 配色沿用 scalar-ui 設計變數(元件 prop 須給色碼);
                 用v-show而非v-if: 非isolated之WPopup於開啟中被銷毀時不會自行隱藏(不釋放popper與開啟層級清單), 故切回寬版時改以menuOpen=false正常關閉;
                 v-show之元素其靜態style不可含display: Vue 2.7.16之updateStyle每次重繪皆重設靜態style全部屬性, 會蓋掉v-show之display:none, 故flex置於內層 -->
            <div
                style="padding-left:10px; padding-right:5px; flex:0 0 auto;"
                v-show="isNarrow && hasMenuItems"
                @keydown.esc="closeMenu"
            >
                <div style="display:flex; align-items:center;">

                    <WPopup
                        :placement="'bottom-end'"
                        :value="menuOpen"
                        @input="setMenuOpen"
                    >
                        <template v-slot:trigger>
                            <!-- 開關一律由toggleMenu經menuOpen控制(再次點擊即關閉, 開啟中以active維持底色); 攔下click不讓WPopup觸發區自行開啟:
                                 使用者真實點擊時各監聽器之間會先執行microtask, 按鈕之toggleMenu關閉後觸發區仍收到同一click而重新開啟. 外部點擊關閉走window之mouseup, 不受影響 -->
                            <div @click.stop>
                                <!-- 色碼對應 --bg-1 #ffffff / --bg-3 #eceef1(同 ghost 按鈕 hover) / --c-2 #6b7280 / --c-1 #1b1b1b -->
                                <WButtonCircle
                                    ref="rfMenuBtn"
                                    :paddingStyle="{v:6,h:6}"
                                    :icon="mdiMenu"
                                    :backgroundColor="'#ffffff'"
                                    :backgroundColorHover="'#eceef1'"
                                    :backgroundColorFocus="'#eceef1'"
                                    :backgroundColorActive="'#eceef1'"
                                    :iconColor="'#6b7280'"
                                    :iconColorHover="'#1b1b1b'"
                                    :iconColorFocus="'#1b1b1b'"
                                    :iconColorActive="'#1b1b1b'"
                                    :shadow="false"
                                    :active="menuOpen"
                                    :aria-label="$t('menuUser')"
                                    :aria-expanded="menuOpen?'true':'false'"
                                    @click="toggleMenu"
                                ></WButtonCircle>
                            </div>
                        </template>
                        <template v-slot:content>
                            <div
                                :style="`min-width:220px; max-width:${menuMaxWidth}px; padding:4px 0px; font-size:var(--fs-sm); color:var(--c-1);`"
                                @keydown.esc="closeMenu"
                            >

                                <!-- 當前登入者資訊: 姓名為主, Email為輔 -->
                                <div
                                    style="padding:8px 12px; display:flex; align-items:center;"
                                    v-if="userName || userEmail"
                                >
                                    <div style="flex:0 0 36px; display:flex; justify-content:center;">
                                        <WIcon
                                            :icon="mdiAccountCircleOutline"
                                            :color="'#6b7280'"
                                            :colorHover="'#6b7280'"
                                            :size="36"
                                        ></WIcon>
                                    </div>
                                    <div style="padding-left:10px; min-width:0;">
                                        <div style="font-size:var(--fs-body); font-weight:var(--fw-medium); color:var(--c-1); word-break:break-word;">
                                            {{userName || userEmail}}
                                        </div>
                                        <div
                                            style="font-size:var(--fs-xs); color:var(--c-2); word-break:break-all;"
                                            v-if="userName && userEmail"
                                        >
                                            {{userEmail}}
                                        </div>
                                    </div>
                                </div>

                                <!-- 語系切換, 下拉選單同寬版 -->
                                <div
                                    :style="`${(userName || userEmail)?'border-top:1px solid var(--border);':''} padding:8px 12px; display:flex; align-items:center;`"
                                    v-if="showLangSelect"
                                >
                                    <div style="flex:0 0 36px; display:flex; justify-content:center;">
                                        <WIcon
                                            :icon="mdiTranslate"
                                            :color="'#6b7280'"
                                            :colorHover="'#6b7280'"
                                            :size="20"
                                        ></WIcon>
                                    </div>
                                    <div style="padding-left:10px; flex:1 1 auto; white-space:nowrap;">
                                        {{$t('language')}}
                                    </div>
                                    <div style="padding-left:10px; flex:0 0 auto;">
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

                            </div>
                        </template>
                    </WPopup>

                </div>
            </div>

        </div>

        <div :style="`height:calc( 100% - ${heightToolbar}px );`">
            <LayoutContent
            ></LayoutContent>
        </div>

    </div>
</template>

<script>
import { mdiMenu, mdiAccountCircleOutline, mdiTranslate } from '@mdi/js/mdi.js'
import get from 'lodash-es/get.js'
// import cloneDeep from 'lodash-es/cloneDeep.js'
import isestr from 'wsemi/src/isestr.mjs'
import WIcon from 'w-component-vue/src/components/WIcon.vue'
import WPopup from 'w-component-vue/src/components/WPopup.vue'
import WTooltip from 'w-component-vue/src/components/WTooltip.vue'
import WButtonCircle from 'w-component-vue/src/components/WButtonCircle.vue'
import WTextSelect from 'w-component-vue/src/components/WTextSelect.vue'
import LayoutContent from './LayoutContent.vue'


//寬窄版判斷用之固定寬(px), 須與template之寬版結構一致
const hdPadH = 20 //標題列左右padding各10
const hdLeftPad = 5 //識別區padding-left
const hdLogoW = 36 + 10 //logo寬+其padding-right
const hdLangW = 100 + 10 //語系選單寬+其容器padding-right
const hdGap = 10 //寬版時名稱說明與右側群組間至少保留之間距


//量測文字自然寬(px), 以canvas量測, 不受DOM截斷(省略符號)影響
let ctxMeasure = null
function measureTextWidth(text, font) {
    if (!isestr(text)) {
        return 0
    }
    if (ctxMeasure === null) {
        ctxMeasure = document.createElement('canvas').getContext('2d')
    }
    ctxMeasure.font = font
    return ctxMeasure.measureText(text).width
}


//取元素實際字型字串(含 CSS 變數解析後之字級與字重), 供canvas量測
function getElFont(el) {
    if (!el) {
        return ''
    }
    let cs = window.getComputedStyle(el)
    return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
}


export default {
    components: {
        WIcon,
        WPopup,
        WTooltip,
        WButtonCircle,
        WTextSelect,
        LayoutContent,
    },
    props: {
    },
    data: function() {
        return {
            mdiMenu,
            mdiAccountCircleOutline,
            mdiTranslate,

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

            hdW: 0, //標題列寬(clientWidth), 0代表尚未量測
            fontName: '', //系統名稱實際字型, 供canvas量測自然寬
            fontDesc: '', //系統說明實際字型
            fontsTick: 0, //字型載入完成後遞增, 觸發文字自然寬重算

            menuOpen: false, //窄版漢堡選單是否開啟

            webNameTruncated: false, //系統名稱是否被截斷(顯示省略符號)
            webDescTruncated: false, //系統說明是否被截斷
            tipNameShown: false, //系統名稱tooltip是否顯示中
            tipDescShown: false, //系統說明tooltip是否顯示中

        }
    },
    mounted: function() {
        // console.log('mounted')

        let vo = this

        //字型與標題列寬, 於mounted同步設定, 寬窄版於首次繪製前即確定(資料變更之重繪在microtask內完成)
        vo.readFonts()
        let elHeader = vo.$refs.rfHeader
        if (elHeader) {
            vo.hdW = elHeader.clientWidth
        }
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                vo.readFonts()
                vo.fontsTick++
            })
        }

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

        webDesc: function() {
            let vo = this
            return vo.$t('webDescription')
        },

        webLogo: function() {
            //console.log('computed webLogo')

            let vo = this

            return get(vo, `$store.state.webInfor.webLogo`, '')
        },

        userName: function() {
            let vo = this
            return get(vo, '$store.state.userSelf.name', '')
        },

        userEmail: function() {
            let vo = this
            return get(vo, '$store.state.userSelf.email', '')
        },

        hasMenuItems: function() {
            //漢堡選單有內容才顯示按鈕
            let vo = this
            return vo.showLangSelect || isestr(vo.userName) || isestr(vo.userEmail)
        },

        natLeftWidth: function() {
            //識別區自然寬: padding + logo + 名稱與說明之較寬者
            let vo = this
            let wName = vo.getTextWidth(vo.webName, vo.fontName)
            let wDesc = vo.getTextWidth(vo.webDesc, vo.fontDesc)
            return hdLeftPad + (vo.webLogo ? hdLogoW : 0) + Math.max(wName, wDesc)
        },

        natRightWidth: function() {
            //寬版右側群組自然寬: 語系選單
            let vo = this
            return vo.showLangSelect ? hdLangW : 0
        },

        isNarrow: function() {
            //全部攤開所需寬度超過標題列寬即為窄版, 未量測前(hdW為0)視為寬版
            let vo = this
            if (vo.hdW <= 0) {
                return false
            }
            return hdPadH + vo.natLeftWidth + vo.natRightWidth + hdGap > vo.hdW
        },

        tooltipMaxWidth: function() {
            //名稱與說明tooltip最大寬(不含其左右padding共20), 不超出版寬
            let vo = this
            return Math.max(100, Math.min(400, vo.hdW - 40))
        },

        menuMaxWidth: function() {
            //漢堡選單最大寬, 不超出版寬
            let vo = this
            return Math.max(220, Math.min(320, vo.hdW - 20))
        },

        layoutSig: function() {
            //影響名稱與說明是否被截斷之因子, 變更時重新偵測截斷狀態
            let vo = this
            return `${vo.hdW}|${vo.isNarrow}|${vo.hasMenuItems}|${!!vo.webLogo}|${vo.webName}|${vo.webDesc}|${vo.fontsTick}`
        },

    },
    watch: {

        isNarrow: function(v) {
            //切回寬版時關閉漢堡選單(漢堡按鈕隨之隱藏)
            let vo = this
            if (!v) {
                vo.menuOpen = false
            }
        },

        layoutSig: function() {
            let vo = this
            vo.$nextTick(() => {
                vo.checkTruncated()
            })
        },

    },
    methods: {

        readFonts: function() {
            let vo = this
            vo.fontName = getElFont(vo.$refs.rfWebName)
            vo.fontDesc = getElFont(vo.$refs.rfWebDesc)
        },

        getTextWidth: function(text, font) {
            //以指定字型量測文字自然寬; fontsTick僅作為相依觸發重算
            let vo = this
            if (vo.fontsTick < 0 || !isestr(font)) {
                return 0
            }
            return measureTextWidth(text, font)
        },

        resizeHeader: function(msg) {
            // console.log('methods resizeHeader', msg)

            let vo = this

            //hdW, 直接讀元素當下寬度, 不用msg.snew(視窗resize事件所帶者為前次輪詢之舊值)
            let el = vo.$refs.rfHeader
            if (el) {
                vo.hdW = el.clientWidth
            }

        },

        checkTruncated: function() {
            //偵測名稱與說明是否被截斷: scrollWidth為整數, 溢出不足1px時可能偵測不到, 故再以自然寬比對元素實寬
            let vo = this
            let isTruncated = (el, text, font) => {
                if (!el) {
                    return false
                }
                if (el.scrollWidth > el.clientWidth) {
                    return true
                }
                return vo.getTextWidth(text, font) > el.getBoundingClientRect().width + 0.05
            }
            vo.webNameTruncated = isTruncated(vo.$refs.rfWebName, vo.webName, vo.fontName)
            vo.webDescTruncated = isTruncated(vo.$refs.rfWebDesc, vo.webDesc, vo.fontDesc)
        },

        toggleMenu: function() {
            // console.log('methods toggleMenu')

            let vo = this

            vo.menuOpen = !vo.menuOpen

        },

        setMenuOpen: function(b) {
            // console.log('methods setMenuOpen', b)

            let vo = this

            vo.menuOpen = b

        },

        closeMenu: function() {
            // console.log('methods closeMenu')

            let vo = this

            //check
            if (!vo.menuOpen) {
                return
            }

            vo.menuOpen = false

            //焦點回到漢堡按鈕(焦點原位於選單內時, 選單內容銷毀後焦點會遺失); WButtonCircle內有兩個tabindex=0之元素,
            //外層為其tooltip觸發區, 內層為按鈕本體(具Enter處理), 故取最後一個
            let el = get(vo, '$refs.rfMenuBtn.$el', null)
            let els = el ? el.querySelectorAll('[tabindex="0"]') : []
            let elFocus = els.length > 0 ? els[els.length - 1] : null
            if (elFocus) {
                elFocus.focus()
            }

        },

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
