<template>
    <div>
        <div class="md" v-html="mdh"></div>
    </div>
</template>

<script>
// import get from 'lodash-es/get.js'
// import find from 'lodash-es/find.js'
// import each from 'lodash-es/each.js'
// import map from 'lodash-es/map.js'
// import size from 'lodash-es/size.js'
// import sortBy from 'lodash-es/sortBy.js'
// import isNumber from 'lodash-es/isNumber.js'
// import cloneDeep from 'lodash-es/cloneDeep.js'
// import sep from 'wsemi/src/sep.mjs'
// import isobj from 'wsemi/src/isobj.mjs'
// import iseobj from 'wsemi/src/iseobj.mjs'
// import isestr from 'wsemi/src/isestr.mjs'
// import isearr from 'wsemi/src/isearr.mjs'
// import pmSeries from 'wsemi/src/pmSeries.mjs'
// import waitFun from 'wsemi/src/waitFun.mjs'
// import strleft from 'wsemi/src/strleft.mjs'
// import strdelleft from 'wsemi/src/strdelleft.mjs'
// import str2aes from 'wsemi/src/str2aes.mjs'
// import timeTZ2past from 'wsemi/src/timeTZ2past.mjs'
import md2html from 'w-md2html/src/md2html.mjs'


export default {
    components: {
    },
    props: {
        md: {
            type: String,
            default: '',
        },
    },
    data: function() {
        return {
            mdh: '',
        }
    },
    watch: {
        md: {
            immediate: true,
            handler: function() {
                let vo = this
                vo.updateMdh()
            },
        },
    },
    methods: {

        updateMdh: function() {
            let vo = this

            //nSeq, 因md2html為非同步, 須以序號丟棄過期結果避免快速輸入時渲染錯亂
            vo.nSeq = (vo.nSeq || 0) + 1
            let nCurr = vo.nSeq

            md2html(vo.md)
                .then((res) => {
                    if (nCurr !== vo.nSeq) {
                        return
                    }
                    vo.mdh = res.html
                })
                .catch((err) => {
                    console.log('md2html', err)
                    if (nCurr !== vo.nSeq) {
                        return
                    }
                    vo.mdh = ''
                })

        },

    }
}
</script>

<style scoped>
/* Scalar 風格 markdown 渲染：無外框、細列分隔、等寬欄、名稱欄加粗、標題退場感 */
.md {
    font-size: 13px;
    color: var(--c-1, #1b1b1b);
}

/* w-md2html 輸出自帶一層 <div class="md" style="contain:layout;">, containment 會阻斷首尾元素之 margin collapse 導致版面下移, 此處還原 */
.md >>> .md {
    contain: none !important;
}

.md >>> table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
    margin: 2px 0 8px;
    word-break: initial;
}

.md >>> table tr th {
    text-align: left;
    font-weight: 600;
    font-size: 11.5px;
    letter-spacing: .03em;
    color: var(--c-2, #6b7280);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border, #e6e8ec);
    margin: 0;
    padding: 8px 18px 8px 0;
}

.md >>> table tr td {
    border: none;
    border-bottom: 1px solid var(--border-soft, #eef0f3);
    color: var(--c-1, #1b1b1b);
    font-family: var(--font-code, ui-monospace, Menlo, Consolas, monospace);
    font-size: 12.5px;
    vertical-align: top;
    margin: 0;
    padding: 8px 18px 8px 0;
}

.md >>> table tbody tr:last-child td {
    border-bottom: none;
}

.md >>> table tr td:first-child {
    font-weight: 600;
    color: var(--c-1, #1b1b1b);
}

/* 對齊 mockup：型別欄(第2欄)綠字、範例欄(第3欄)灰字 */
.md >>> table tr td:nth-child(2) {
    color: var(--m-post, #069061);
}

.md >>> table tr td:nth-child(3) {
    color: var(--c-2, #6b7280);
}

.md >>> h1,
.md >>> h2,
.md >>> h3,
.md >>> h4,
.md >>> h5,
.md >>> h6 {
    font-weight: 600;
    font-size: 13px;
    line-height: 1.4;
    color: var(--c-2, #6b7280);
    margin: 8px 0 6px;
}

.md >>> p {
    color: var(--c-2, #6b7280);
    line-height: 1.6;
    margin: 4px 0;
}

.md >>> code {
    font-family: var(--font-code, ui-monospace, Menlo, Consolas, monospace);
    font-size: 12px;
    background: var(--bg-3, #eceef1);
    border-radius: 4px;
    padding: 1px 5px;
}

.md >>> pre {
    font-family: var(--font-code, ui-monospace, Menlo, Consolas, monospace);
    font-size: 12px;
    background: var(--bg-2, #f7f8fa);
    border: 1px solid var(--border, #e6e8ec);
    border-radius: 8px;
    padding: 12px 14px;
    overflow: auto;
}

.md >>> pre code {
    background: transparent;
    padding: 0;
}

</style>
