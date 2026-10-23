<template>
    <WTooltip
        :isolated="true"
        :placement="'top'"
        :maxWidth="320"
        class="ext-mark-wrap"
    >
        <template v-slot:trigger>
            <svg
                class="ext-mark"
                :class="kind === 'warn' ? 'ext-mark-warn' : 'ext-mark-lock'"
                :data-ext-mark="kind"
                viewBox="0 0 24 24"
                :width="size"
                :height="size"
            ><path :d="kind === 'warn' ? mdiAlert : mdiLock" fill="currentColor"></path></svg>
        </template>
        <template v-slot:content>
            <div style="white-space:normal; word-break:break-word;">{{tip}}</div>
        </template>
    </WTooltip>
</template>

<script>
import { mdiLock, mdiAlert } from '@mdi/js'
import WTooltip from 'w-component-vue/src/components/WTooltip.vue'


//外部列標記(原則 5; ADR-044, R-EXT-LOCK-01): 鎖頭(kind='lock': 外部列，後台唯讀)或警告(kind='warn': 外部管理 group 內無來源鍵之混雜列，下次匯入可能被刪)，
//停留顯示 tooltip(tip)。純展示、不可點；樹狀清單列與編輯頁欄位標籤共用。配色沿用既有色票: 鎖頭 --c-3(次要文字)、警告 --s-4xx(同草稿保護提示)
export default {
    components: {
        WTooltip,
    },
    props: {
        kind: {
            type: String,
            default: 'lock',
        },
        tip: {
            type: String,
            default: '',
        },
        size: {
            type: Number,
            default: 13,
        },
    },
    data: function() {
        return {
            mdiLock,
            mdiAlert,
        }
    },
}
</script>

<style scoped>
.ext-mark-wrap {
    display: inline-block;
    vertical-align: middle;
    margin-left: 6px;
}
.ext-mark {
    display: block;
    cursor: default;
}
.ext-mark-lock {
    color: var(--c-3);
}
.ext-mark-warn {
    color: var(--s-4xx);
}
</style>
