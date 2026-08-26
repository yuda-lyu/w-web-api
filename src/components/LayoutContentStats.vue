<template>
    <div class="stats-panel" :style="`height:${height}px; overflow-y:auto; padding:20px 24px; box-sizing:border-box;`">

        <!-- 標題列（ref 供 chartHeight 量測上方實佔高度） -->
        <div ref="$hdr" style="margin-bottom:16px;">
            <div style="font-size:1.4rem; font-weight:600; color:var(--c-1);">{{$t('statisticsInformation')}}</div>
            <div style="font-size:0.875rem; color:var(--c-3); margin-top:4px;">{{$t('statisticsInformationDescription')}}</div>
        </div>

        <!-- 控制區（事件選擇 + 時間範圍；把各事件分出來、可區分選取，供趨勢辨認 / 危險識別）
             結構性對齊：.ctrl 為兩欄 grid（label 欄寬 max-content 自動隨語系文字），.ctrl-row 以
             display:contents 使 label 與 field 直接成為 grid 子項，中英文自動對齊，免寫死 label 寬度 -->
        <div ref="$ctrl" class="ctrl">

            <!-- 第一列：時間範圍 -->
            <div class="ctrl-row">
                <span class="ctrl-label">{{$t('timeRange')}}</span>
                <div class="ctrl-field">
                    <select id="timeGroupSel" v-model="timeGroup" class="ctrl-select">
                        <option value="1hr">{{$t('selectItem1hr')}}</option>
                        <option value="4hr">{{$t('selectItem4hr')}}</option>
                        <option value="8hr">{{$t('selectItem8hr')}}</option>
                        <option value="1day">{{$t('selectItem1day')}}</option>
                    </select>
                </div>
            </div>

            <!-- 第二列：選擇事件 標題 + 全選/清除 -->
            <div class="ctrl-row">
                <span class="ctrl-label">{{$t('selectEvents')}}</span>
                <div class="ctrl-field">
                    <button class="evt-sel-btn stats-sel-all" @click="selectAllEvents">{{$t('selectAll')}}</button>
                    <button class="evt-sel-btn stats-sel-none" @click="selectNoneEvents">{{$t('selectNone')}}</button>
                    <span class="evt-count">{{selectedEvents.length}}/{{allEvents.length}}</span>
                </div>
            </div>

            <!-- 第三列：事件 chip（flex-wrap 內容自然寬；chip 依內容取寬、排滿可用寬才換行） -->
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
                <WEchartsVue
                    v-else
                    :options="chartOption"
                    :style="`width:100%; height:${chartHeight}px;`"
                ></WEchartsVue>
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
import WEchartsVue from 'w-echarts-vue/src/components/WEchartsVue.vue'


//固定色票（依事件在 allEvents 之索引取色，使同一事件顏色穩定、圖表與表格與 chip 一致）
let COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6',
    '#6366f1', '#eab308', '#ec4899', '#14b8a6', '#a855f7',
    '#0ea5e9', '#f43f5e', '#22c55e', '#d97706', '#7c3aed',
]


export default {
    components: {
        WEchartsVue,
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
            hUpper: 0, //標題列+控制區實佔高度（ResizeObserver 量測，供 chartHeight 計算；chip 換行數/語系皆會使其變化）
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
                legend: { show: true, type: 'scroll', top: 0 }, //top須明給: echarts 6 起 legend 預設由 top:0 改為 bottom, 不給會落到底部壓住 x 軸時間標籤
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

/* 控制區：兩欄 grid 結構性對齊（label 欄 max-content 隨語系文字自動定寬；
   第二欄 minmax(0,1fr) 防內容撐大），取代先前 label 寫死 64px + evt-grid margin-left 72px 之魔術數字對齊 */
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

/* 事件 chip：flex-wrap 內容自然寬（用滿容器可用寬、排不下才換行），
   置於 .ctrl grid 第二欄與上方控制項對齊；不設 max-width 上限（由容器自然約束） */
.evt-grid {
    grid-column: 2;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.evt-chip {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%; /* 安全閥：極長事件名時 chip 不超過容器寬（此時 .evt-name 之 ellipsis 才生效） */
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
    min-width: 0; /* flex item 預設 min-width:auto 會阻止收縮，明給 0 使安全閥可生效 */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    white-space: normal; /* 事件名欄允許換行（數值欄維持 nowrap），與 chip 區同源之防溢出處置 */
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
