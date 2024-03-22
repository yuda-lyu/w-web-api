<template>
    <div>
        <div class="md" v-html="mdh"></div>
    </div>
</template>

<script>
// import get from 'lodash-es/get'
// import find from 'lodash-es/find'
// import each from 'lodash-es/each'
// import map from 'lodash-es/map'
// import size from 'lodash-es/size'
// import sortBy from 'lodash-es/sortBy'
// import isNumber from 'lodash-es/isNumber'
// import cloneDeep from 'lodash-es/cloneDeep'
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
import Showdown from 'showdown'
// import MarkdownIt from 'markdown-it'


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
        }
    },
    computed: {

        mdh: function() {
            let vo = this

            // md = `| 參數 | 型別 | 範例 |
            // | -- | -- | -- |
            // | token | STRING | key-for-token |
            // | id | STRING | id-for-test |
            // | paramA | INTEGER | 123 |
            // | paramB | DOUBLE | 123.456 |
            // `

            let cv = new Showdown.Converter()
            cv.setOption('tables', true)
            let html = cv.makeHtml(vo.md)

            // let cv = new MarkdownIt()
            // let html = cv.render(vo.md)

            // console.log('md', md)
            // console.log('html', html)
            return html
        },

    },
    methods: {
    }
}
</script>

<style scoped>

.md >>> table {
    border-collapse: collapse;
    margin: 0;
    padding: 0;
    word-break: initial;
}

.md >>> tr {
    margin: 0;
    padding: 0;
}

.md >>> table tr th {
    font-weight: bold;
    background: #eee;
    border: 1px solid #ddd;
    border-bottom: 0;
    margin: 0;
    padding: 6px 13px;
}

.md >>> table tr td {
    border: 1px solid #ddd;
    margin: 0;
    padding: 6px 13px;
}

.md >>> h1 {
    font-weight: bold;
    font-size: 1.2rem;
    line-height: 1.2rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
}

.md >>> h2 {
    font-weight: bold;
    font-size: 1.1rem;
    line-height: 1.1rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
}

.md >>> h3 {
    font-weight: bold;
    font-size: 1rem;
    line-height: 1rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
}

.md >>> h4 {
    font-weight: bold;
    font-size: 1rem;
    line-height: 1rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
}

.md >>> h5 {
    font-weight: bold;
    font-size: 1rem;
    line-height: 1rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
}

.md >>> h6 {
    font-weight: bold;
    font-size: 1rem;
    line-height: 1rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
}

</style>
