<template>
    <div class="stats-panel" :style="`height:${height}px; overflow-y:auto; padding:20px 24px; box-sizing:border-box;`">

        <!-- 標題列 -->
        <div style="margin-bottom:16px;">
            <div style="font-size:1.4rem; font-weight:600; color:var(--c-1);">{{$t('statisticsInformation')}}</div>
            <div style="font-size:0.875rem; color:var(--c-3); margin-top:4px;">{{$t('statisticsInformationDescription')}}</div>
        </div>

        <!-- 控制區（事件選擇 + 時間範圍；把各事件分出來、可區分選取，供趨勢辨認 / 危險識別） -->
        <div class="ctrl">

            <!-- 第一列：時間範圍 -->
            <div class="ctrl-row">
                <span class="ctrl-label">{{$t('timeRange')}}</span>
                <select id="timeGroupSel" v-model="timeGroup" class="ctrl-select">
                    <option value="1hr">{{$t('selectItem1hr')}}</option>
                    <option value="4hr">{{$t('selectItem4hr')}}</option>
                    <option value="8hr">{{$t('selectItem8hr')}}</option>
                    <option value="1day">{{$t('selectItem1day')}}</option>
                </select>
            </div>

            <!-- 第二列：選擇事件 標題 + 全選/清除 -->
            <div class="ctrl-row" style="margin-top:12px;">
                <span class="ctrl-label">{{$t('selectEvents')}}</span>
                <button class="evt-sel-btn stats-sel-all" @click="selectAllEvents">{{$t('selectAll')}}</button>
                <button class="evt-sel-btn stats-sel-none" @click="selectNoneEvents">{{$t('selectNone')}}</button>
                <span class="evt-count">{{selectedEvents.length}}/{{allEvents.length}}</span>
            </div>

            <!-- 第三列：事件 chip（CSS grid 等寬欄對齊，不 ragged wrap） -->
            <div class="evt-grid">
                <label
                    v-for="ev in allEvents"
                    :key="ev"
                    class="evt-chip"
                    :class="{on: selectedEvents.includes(ev)}"
                    :data-event="ev"
                >
                    <input type="checkbox" class="stats-evt-cb" :value="ev" v-model="selectedEvents" />
                    <span class="evt-dot" :style="`background:${colorOf(ev)};`"></span>
                    <span class="evt-name">{{ev}}</span>
                </label>
            </div>

        </div>

        <!-- loading -->
        <div v-if="loading" style="padding:12px 0; font-size:0.875rem; color:var(--c-3);">
            {{$t('waitingData')}}
        </div>

        <!-- 錯誤 -->
        <div v-else-if="errMsg" style="padding:12px 0; font-size:0.875rem; color:var(--danger);">
            {{errMsg}}
        </div>

        <template v-else>

            <!-- 圖表區（event 展示區；各選取事件各一系列、各自顏色，可區分趨勢） -->
            <div class="stats-chart-area">
                <div
                    v-if="hasNoData"
                    style="display:flex; align-items:center; justify-content:center; color:var(--c-3); font-size:0.875rem;"
                    :style="`height:${chartHeight}px;`"
                >
                    {{$t('noStaData')}}
                </div>
                <WEchartsVueDyn
                    v-else
                    :options="chartOption"
                    :style="`width:100%; height:${chartHeight}px;`"
                ></WEchartsVueDyn>
            </div>

            <!-- 事件統計表（各事件為列，依最近1日總數多→少排序；欄位 1日/8時/4時/1時） -->
            <div class="stats-table-area">
                <div style="font-size:1rem; font-weight:600; color:var(--c-1); margin:18px 0 8px;">{{$t('eventStatsTable')}}</div>
                <div v-if="eventRows.length === 0" style="font-size:0.875rem; color:var(--c-3); padding:8px 0;">
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
import WEchartsVueDyn from 'w-component-vue/src/components/WEchartsVueDyn.vue'


//固定色票（依事件在 allEvents 之索引取色，使同一事件顏色穩定、圖表與表格與 chip 一致）
let COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6',
    '#6366f1', '#eab308', '#ec4899', '#14b8a6', '#a855f7',
    '#0ea5e9', '#f43f5e', '#22c55e', '#d97706', '#7c3aed',
]


export default {
    components: {
        WEchartsVueDyn,
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
            selectedEvents: [],   //使用者選取要畫的事件（預設載入後全選）
            eventsInited: false,  //是否已用實際資料初始化過 selectedEvents
            timeGroup: '1hr',
            loading: false,
            errMsg: '',
        }
    },
    mounted: function() {
        let vo = this
        vo.load()
    },
    computed: {

        chartHeight: function() {
            let vo = this
            let h = vo.height - 360 //扣標題 + 控制列(含事件選擇) + 表格區估算
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

        //實際要畫的系列 = 選取且存在於資料中的事件
        seriesKeys: function() {
            let vo = this
            return vo.selectedEvents.filter(function(e) {
                return vo.allEvents.includes(e)
            })
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
                legend: { show: true, type: 'scroll' },
                grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                xAxis: [{
                    type: 'category',
                    data: map(data, function(item) { return ot(item.time).format(formatX) }),
                    axisTick: { alignWithLabel: true },
                }],
                yAxis: [{ type: 'value' }],
                series: series,
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
    watch: {
        freq: function() {
            let vo = this
            //首次取得資料時，預設全選所有事件（使各事件一開始即分系列、可區分）
            if (!vo.eventsInited && vo.allEvents.length > 0) {
                vo.selectedEvents = vo.allEvents.slice()
                vo.eventsInited = true
            }
        },
    },
    methods: {

        colorOf: function(ev) {
            let vo = this
            let idx = vo.allEvents.indexOf(ev)
            if (idx < 0) {
                idx = 0
            }
            return COLORS[idx % COLORS.length]
        },

        selectAllEvents: function() {
            let vo = this
            vo.selectedEvents = vo.allEvents.slice()
        },

        selectNoneEvents: function() {
            let vo = this
            vo.selectedEvents = []
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

.ctrl {
    margin-bottom: 16px;
}

.ctrl-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.ctrl-label {
    font-size: 0.875rem;
    color: var(--c-2);
    width: 64px;
    flex-shrink: 0;
}

.ctrl-select {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-1);
    color: var(--c-1);
    font-size: 0.875rem;
    padding: 4px 8px;
    outline: none;
    cursor: pointer;
}

.ctrl-select:focus {
    border-color: var(--accent);
}

.evt-sel-btn {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-1);
    color: var(--c-2);
    font-size: 0.8rem;
    padding: 3px 12px;
    cursor: pointer;
}

.evt-sel-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
}

.evt-count {
    font-size: 0.78rem;
    color: var(--c-3);
    margin-left: 4px;
}

/* 事件 chip：等寬欄 grid 對齊，避免 ragged wrap 之縮排錯落 */
.evt-grid {
    margin-top: 10px;
    margin-left: 72px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
    max-width: 1040px;
}

.evt-chip {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-1);
    padding: 5px 10px;
    font-size: 0.82rem;
    color: var(--c-2);
    cursor: pointer;
    transition: border-color .12s, background .12s, color .12s;
}

.evt-chip:hover {
    border-color: var(--accent);
}

.evt-chip.on {
    color: var(--c-1);
    border-color: var(--accent);
    background: rgba(0, 153, 255, 0.06);
}

.evt-chip .stats-evt-cb {
    cursor: pointer;
    margin: 0 6px 0 0;
    flex-shrink: 0;
}

.evt-dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 2px;
    margin-right: 6px;
    flex-shrink: 0;
}

.evt-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.stats-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
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
