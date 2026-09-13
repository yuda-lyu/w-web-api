<template>
    <div class="stats-panel" :style="`height:${height}px; overflow-y:auto; padding:20px 24px; box-sizing:border-box;`">

        <!-- 標題列（ref 供 chartHeight 量測上方實佔高度） -->
        <div ref="$hdr" style="margin-bottom:16px;">
            <div style="font-size:1.4rem; font-weight:600; color:var(--c-1);">{{$t('statisticsInformation')}}</div>
            <div style="font-size:0.875rem; color:var(--c-3); margin-top:4px;">{{$t('statisticsInformationDescription')}}</div>
        </div>

        <!-- 控制區（時間範圍）：.ctrl 為兩欄 grid（label 欄寬 max-content 自動隨語系文字），
             .ctrl-row 以 display:contents 使 label 與 field 直接成為 grid 子項，中英文自動對齊。
             事件之顯示/隱藏切換由 echarts 圖例（legend）提供，不另建 checkbox（功能重複）。 -->
        <div ref="$ctrl" class="ctrl">

            <div class="ctrl-row">
                <span class="ctrl-label">{{$t('timeRange')}}</span>
                <div class="ctrl-field">
                    <!-- 自製下拉（WTextSelect）取代原生 <select>：原生下拉之彈出清單選中／hover 色由 OS 決定、CSS 不可控，與本頁主題不一致（全域 §10.6-3）。
                         色票沿用本頁既有 token 實值（scalar-ui.css :root；WShellEllipse 之顏色經 convertColor 轉 hex、不認 var()）：
                         邊線 --border #e6e8ec、底 --bg-1 #ffffff、文字 --c-1 #1b1b1b、焦點邊線 --accent #0099ff、項目 hover 底 --bg-3 #eceef1、
                         展開圖標 --c-3 #9aa1ac、圓角 --radius 8；字級 0.875rem 同原 .ctrl-select；展開圖標隨開闔旋轉（狀態聯動）。
                         id 供 e2e 定位觸發區；寬度依當前語系最長選項文字計算（computed timeGroupSelWidth，同原生 select 依最長選項定寬）。
                         清單對齊（全域 §10.6-6）：WPopup 錨在觸發區之內容元素（外框左緣 + 邊框 1 + 內距 8 = 內容左緣），故 placementDistX=-9 把清單左緣拉回外框左緣、
                         清單寬固定為觸發區寬（關 autoFit、min/maxWidth 同 timeGroupSelWidth），項目左內距 9（= 邊框 1 + 內距 8）使項目文字左緣與觸發區文字左緣貼齊（實測 191/191）。 -->
                    <WTextSelect
                        id="timeGroupSel"
                        :style="`width:${timeGroupSelWidth}px;`"
                        :items="timeGroupItems"
                        :value="timeGroup"
                        :shadow="false"
                        :borderRadius="8"
                        :paddingStyle="{ v: 4, h: 8 }"
                        :backgroundColor="'#ffffff'"
                        :backgroundColorHover="'#ffffff'"
                        :backgroundColorFocus="'#ffffff'"
                        :borderColor="'#e6e8ec'"
                        :borderColorHover="'#e6e8ec'"
                        :borderColorFocus="'#0099ff'"
                        :textColor="'#1b1b1b'"
                        :textFontSize="'0.875rem'"
                        :itemTextFontSize="'0.875rem'"
                        :itemTextColor="'#1b1b1b'"
                        :itemTextColorHover="'#1b1b1b'"
                        :itemBackgroundColor="'#ffffff'"
                        :itemBackgroundColorHover="'#eceef1'"
                        :itemPaddingStyle="{ v: 6, h: 9 }"
                        :placementDistX="-9"
                        :autoFitMinWidth="false"
                        :autoFitMaxWidth="false"
                        :minWidth="timeGroupSelWidth"
                        :maxWidth="timeGroupSelWidth"
                        :expansionIconColor="'#9aa1ac'"
                        @input="onInputTimeGroup"
                    >
                        <template v-slot:select="props">
                            {{$t('selectItem' + props.item)}}
                        </template>
                        <template v-slot:item="props">
                            {{$t('selectItem' + props.item)}}
                        </template>
                    </WTextSelect>
                </div>
            </div>

        </div>

        <!-- 錯誤 -->
        <div v-if="errMsg" style="padding:12px 0; font-size:0.875rem; color:var(--danger);">
            {{errMsg}}
        </div>

        <!-- 先到先畫（ADR-028）：圖表區與統計表區骨架立即渲染，資料未到前各自以轉圈佔位（圖區與圖同高，不跳版）；載入後 DOM 與先前一致 -->
        <template v-else>

            <!-- 圖表區（event 展示區；各事件各一系列、各自顏色，可區分趨勢；點圖例可切換個別事件顯示） -->
            <div class="stats-chart-area">
                <div
                    v-if="loading"
                    style="display:flex; align-items:center; justify-content:center; gap:8px; color:var(--c-3); font-size:0.875rem;"
                    :style="`height:${chartHeight}px;`"
                >
                    <WIconLoading :name="'cir-rotate'" :size="24" :color="'#9aa1ac'"></WIconLoading>
                    <span>{{$t('waitingData')}}</span>
                </div>
                <div
                    v-else-if="hasNoData"
                    style="display:flex; align-items:center; justify-content:center; color:var(--c-3); font-size:0.875rem;"
                    :style="`height:${chartHeight}px;`"
                >
                    {{$t('noStaData')}}
                </div>
                <WEchartsVue
                    v-else
                    :options="chartOption"
                    :style="`width:100%; height:${chartHeight}px;`"
                ></WEchartsVue>
            </div>

            <!-- 事件統計表（各事件為列，依最近1日總數多→少排序；欄位 1日/8時/4時/1時） -->
            <div class="stats-table-area">
                <div style="font-size:1rem; font-weight:600; color:var(--c-1); margin:18px 0 8px;">{{$t('eventStatsTable')}}</div>
                <div v-if="loading" style="display:flex; align-items:center; gap:8px; font-size:0.875rem; color:var(--c-3); padding:8px 0;">
                    <WIconLoading :name="'cir-rotate'" :size="20" :color="'#9aa1ac'"></WIconLoading>
                    <span>{{$t('waitingData')}}</span>
                </div>
                <div v-else-if="eventRows.length === 0" style="font-size:0.875rem; color:var(--c-3); padding:8px 0;">
                    {{$t('noStaData')}}
                </div>
                <table v-else class="stats-table">
                    <thead>
                        <tr>
                            <th style="text-align:left;">{{$t('colEvent')}}</th>
                            <th>{{$t('colRecent1day')}}</th>
                            <th>{{$t('colRecent8hr')}}</th>
                            <th>{{$t('colRecent4hr')}}</th>
                            <th>{{$t('colRecent1hr')}}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in eventRows" :key="row.event" :data-event="row.event">
                            <td style="text-align:left;">
                                <span class="evt-dot" :style="`background:${colorOf(row.event)};`"></span>{{row.event}}
                            </td>
                            <td>{{row.d1day}}</td>
                            <td>{{row.d8hr}}</td>
                            <td>{{row.d4hr}}</td>
                            <td>{{row.d1hr}}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

        </template>

    </div>
</template>

<script>
import ot from 'dayjs'
import get from 'lodash-es/get.js'
import map from 'lodash-es/map.js'
import keys from 'lodash-es/keys.js'
import groupBy from 'lodash-es/groupBy.js'
import sumBy from 'lodash-es/sumBy.js'
import reduce from 'lodash-es/reduce.js'
import size from 'lodash-es/size.js'
import isearr from 'wsemi/src/isearr.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import WEchartsVue from 'w-echarts-vue/src/components/WEchartsVue.vue'
import WIconLoading from 'w-component-vue/src/components/WIconLoading.vue'
import WTextSelect from 'w-component-vue/src/components/WTextSelect.vue'

//時間範圍下拉觸發區之結構寬度（不含文字）：左右內距 8+8、邊框 1+1、展開圖標 18、對稱呼吸空間 2（全域 §10.6-5；量測見 spec/流程_統計資訊.md）
let SEL_STRUCT_WIDTH = 8 + 8 + 1 + 1 + 18 + 2

//固定色票（依事件在 allEvents 之索引取色，使同一事件顏色穩定、圖表（含圖例）與統計表一致）
let COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6',
    '#6366f1', '#eab308', '#ec4899', '#14b8a6', '#a855f7',
    '#0ea5e9', '#f43f5e', '#22c55e', '#d97706', '#7c3aed',
]

export default {
    components: {
        WEchartsVue,
        WIconLoading,
        WTextSelect,
    },
    props: {
        height: {
            type: Number,
            default: 400,
        },
    },
    data: function() {
        return {
            freq: [],
            timeGroup: '1hr',
            timeGroupItems: ['1hr', '4hr', '8hr', '1day'], //下拉項目為代號；顯示文字於 template 經 $t('selectItem' + 代號) 取當前語系（就地切換語系即時更新）
            fontSel: '', //觸發區文字之實際字型（mounted 自 computed style 取得），供 timeGroupSelWidth 量文字實寬
            loading: false,
            errMsg: '',
            hUpper: 0, //標題列+控制區實佔高度（ResizeObserver 量測，供 chartHeight 計算；語系導致控制列換行時會變化）
        }
    },
    mounted: function() {
        let vo = this

        //ResizeObserver 量測標題列+控制區實佔高（含 margin），取代固定扣除值；
        //ro 為瀏覽器原生物件不放 data（避免被深層響應化），掛 this 成非響應式屬性
        let ro = new ResizeObserver(function() {
            vo.updateUpperHeight()
        })
        if (vo.$refs['$hdr']) {
            ro.observe(vo.$refs['$hdr'])
        }
        if (vo.$refs['$ctrl']) {
            ro.observe(vo.$refs['$ctrl'])
        }
        vo.ro = ro
        vo.updateUpperHeight()

        //觸發區字型：字級 0.875rem（同原 .ctrl-select）× 根字級，字族／字重承襲本面板
        let cs = getComputedStyle(vo.$el)
        let rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
        vo.fontSel = `${cs.fontWeight} ${rootPx * 0.875}px ${cs.fontFamily}`

        vo.load()
    },
    beforeDestroy: function() {
        let vo = this
        if (vo.ro) {
            vo.ro.disconnect()
            vo.ro = null
        }
    },
    computed: {

        //時間範圍下拉觸發區寬度（全域 §10.6-5：固定尺寸須計算）：當前語系「最長選項文字」實寬（canvas measureText，字型同觸發區）
        //+ 結構寬度 SEL_STRUCT_WIDTH；語系切換即重算（$t 為響應式）。
        //why 不寫死：原生 <select> 依最長選項自動定寬（實測 eng 85px／cht 74px），自製下拉須重現，否則另一語系右側大片留白。
        timeGroupSelWidth: function() {
            let vo = this
            let texts = vo.timeGroupItems.map((k) => vo.$t('selectItem' + k))
            let wText = 0
            if (isestr(vo.fontSel)) {
                let c = document.createElement('canvas').getContext('2d')
                c.font = vo.fontSel
                wText = Math.max(...texts.map((t) => c.measureText(t).width))
            }
            return Math.ceil(wText + SEL_STRUCT_WIDTH)
        },

        chartHeight: function() {
            let vo = this
            //panel 上下 padding 40 + 上方實佔(hUpper, 量測) + 表格預留 98（既有設計值：舊公式 height−360
            //於 1440 下等價於保留 chart 底至 panel 內容底 98px，沿用該行為，非新設數字）
            let TABLE_RESERVE = 98
            let h = vo.height - 40 - vo.hUpper - TABLE_RESERVE
            return h < 220 ? 220 : h
        },

        //所有出現過的事件名（union，排除 count），固定排序
        allEvents: function() {
            let vo = this
            let kp = reduce(vo.freq, function(acc, item) {
                let d = get(item, 'data', {})
                keys(d).forEach(function(k) {
                    if (k !== 'count') {
                        acc[k] = true
                    }
                })
                return acc
            }, {})
            return keys(kp).sort()
        },

        //時間重採樣（1hr 不變；4hr/8hr/1day 同日合併）— 供圖表 x 軸
        resampledData: function() {
            let vo = this
            let arr = vo.freq
            if (!isearr(arr)) {
                return []
            }
            let tg = vo.timeGroup
            if (tg === '1hr') {
                return arr
            }
            let groupHours = 4
            if (tg === '8hr') {
                groupHours = 8
            }
            else if (tg === '1day') {
                groupHours = 24
            }
            let dataKeyList = vo.allEvents.concat(['count'])
            let gs = groupBy(arr, function(item) {
                let t = ot(item.time)
                let h = t.hour()
                let hGroup = Math.floor(h / groupHours)
                let tNew = t.startOf('day').add(hGroup * groupHours, 'hour')
                return tNew.format()
            })
            return map(gs, function(vs, timeKey) {
                let merged = { time: timeKey, data: {} }
                dataKeyList.forEach(function(k) {
                    merged.data[k] = sumBy(vs, function(item) {
                        return get(item, `data.${k}`, 0)
                    })
                })
                return merged
            })
        },

        //實際要畫的系列 = 資料中所有事件（各事件一系列、各自顏色）；
        //個別事件之顯示/隱藏由 echarts 圖例（legend）切換，不另維護選取狀態
        seriesKeys: function() {
            let vo = this
            return vo.allEvents
        },

        hasNoData: function() {
            let vo = this
            let arr = vo.freq
            if (!isearr(arr) || size(arr) === 0) {
                return true
            }
            let total = reduce(arr, function(sum, item) {
                return sum + get(item, 'data.count', 0)
            }, 0)
            return total === 0
        },

        chartOption: function() {
            let vo = this
            let data = vo.resampledData
            let tg = vo.timeGroup
            let sKeys = vo.seriesKeys

            let formatX = tg === '1day' ? 'MM/DD' : 'MM/DD\nHH:mm'
            let totalBars = size(sKeys) || 1
            let barWidthPct = Math.max(3, Math.floor(100 / (totalBars * 1.5))) + '%'

            let series = map(sKeys, function(valueKey) {
                return {
                    name: valueKey,
                    type: 'bar',
                    barWidth: barWidthPct,
                    data: map(data, function(item) {
                        return get(item, `data.${valueKey}`, 0)
                    }),
                    itemStyle: { color: vo.colorOf(valueKey) },
                    emphasis: { focus: 'series' },
                }
            })

            return {
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                legend: { show: true, type: 'scroll', top: 0 }, //top須明給: echarts 6 起 legend 預設由 top:0 改為 bottom, 不給會落到底部壓住 x 軸時間標籤
                grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                xAxis: [{
                    type: 'category',
                    data: map(data, function(item) {
                        return ot(item.time).format(formatX)
                    }),
                    axisTick: { alignWithLabel: true },
                }],
                yAxis: [{ type: 'value' }],
                series,
            }
        },

        //事件統計表：各事件之最近 1日/8時/4時/1時 計數（由小時 bucket 加總最後 N 桶），依 1日 多→少排序
        eventRows: function() {
            let vo = this
            let arr = isearr(vo.freq) ? vo.freq : []
            //freq 由後端依時間遞增排序；取最後 N 個小時 bucket 對應「最近 N 小時」
            let sumLastN = function(ev, n) {
                let bs = arr.slice(-n)
                return reduce(bs, function(s, item) {
                    return s + get(item, `data.${ev}`, 0)
                }, 0)
            }
            let rows = vo.allEvents.map(function(ev) {
                return {
                    event: ev,
                    d1day: sumLastN(ev, 24),
                    d8hr: sumLastN(ev, 8),
                    d4hr: sumLastN(ev, 4),
                    d1hr: sumLastN(ev, 1),
                }
            })
            //依最近1日總數多→少排序（同數則 8時、4時、1時 依序 tie-break）
            rows.sort(function(a, b) {
                return (b.d1day - a.d1day) || (b.d8hr - a.d8hr) || (b.d4hr - a.d4hr) || (b.d1hr - a.d1hr)
            })
            return rows
        },

    },
    methods: {

        //量測標題列+控制區實佔高（offsetHeight + margin-bottom），存入 hUpper 供 chartHeight 計算
        updateUpperHeight: function() {
            let vo = this
            let mb = function(el) {
                return parseFloat(getComputedStyle(el).marginBottom) || 0
            }
            let h = 0
            let hdr = vo.$refs['$hdr']
            let ctrl = vo.$refs['$ctrl']
            if (hdr) {
                h += hdr.offsetHeight + mb(hdr)
            }
            if (ctrl) {
                h += ctrl.offsetHeight + mb(ctrl)
            }
            vo.hUpper = h
        },

        onInputTimeGroup: function(val) {
            let vo = this
            vo.timeGroup = val //→ resampledData 重採樣 → chartOption 重繪
        },

        colorOf: function(ev) {
            let vo = this
            let idx = vo.allEvents.indexOf(ev)
            if (idx < 0) {
                idx = 0
            }
            return COLORS[idx % COLORS.length]
        },

        load: function() {
            let vo = this
            vo.loading = true
            vo.errMsg = ''
            vo.$fapi.getStaEvent(7, 'hr')
                .then(function(rs) {
                    vo.freq = isearr(rs) ? rs : []
                })
                .catch(function(err) {
                    console.log('getStaEvent catch', err)
                    vo.errMsg = vo.$t('getDataError')
                })
                .finally(function() {
                    vo.loading = false
                })
        },

    },
}
</script>

<style scoped>

/* 控制區：兩欄 grid 結構性對齊（label 欄 max-content 隨語系文字自動定寬；
   第二欄 minmax(0,1fr) 防內容撐大），取代先前 label 寫死 64px 之魔術數字對齊 */
.ctrl {
    margin-bottom: 16px;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 12px 8px;
    align-items: center;
}

.ctrl-row {
    display: contents; /* label 與 field 直接成為 .ctrl 之 grid 子項 */
}

.ctrl-label {
    font-size: 0.875rem;
    color: var(--c-2);
}

.ctrl-field {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}


.evt-dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 2px;
    margin-right: 6px;
    flex-shrink: 0;
}

.stats-table-area {
    overflow-x: auto; /* 極端長事件名時表格自帶水平捲動，不外溢撐破 panel */
}

.stats-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
}

.stats-table td:first-child {
    white-space: normal; /* 事件名欄允許換行（數值欄維持 nowrap），防極長事件名撐破表格 */
    overflow-wrap: anywhere;
}

.stats-table th,
.stats-table td {
    border-bottom: 1px solid var(--border);
    padding: 7px 10px;
    text-align: right;
    color: var(--c-1);
    white-space: nowrap;
}

.stats-table th {
    color: var(--c-2);
    font-weight: 600;
    background: var(--bg-2);
}

</style>
