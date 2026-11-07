const http = require('http')

//dev server 之 /api proxy 重用至後端之連線(排程第 347 項, R-E2E-PROXY-01): http-proxy 未給 agent 時以 agent:false 每個請求新開一條連線並送 Connection: close,
//後端回應之 connection: close 又被轉回瀏覽器, 使每個 /api 請求於「瀏覽器→dev server」「dev server→後端」兩段各留一個 TIME_WAIT(僅 `npm run serve` 開發階段; e2e 打 build 後之後端, 不經此 proxy)
const proxyAgent = new http.Agent({ keepAlive: true })

module.exports = {
    productionSourceMap: false, //不產出map檔
    lintOnSave: false, //禁止eslint-loader於編譯時檢查語法
    devServer: {
        proxy: {
            '/api': {
                target: 'http://localhost:11005',
                agent: proxyAgent,
                pathRewrite: {
                    '^/api': '/api'
                },
            },
        }
    },
    // transpileDependencies: [''],
    publicPath: process.env.NODE_ENV === 'production' ? '/mapi/' : '/', //預先編譯至mapi子目錄下, 待轉成模板, 並於伺服器啟動後依照設定檔取代
}
