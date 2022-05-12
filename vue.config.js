module.exports = {
    lintOnSave: false, //禁止eslint-loader於編譯時檢查語法
    devServer: {
        proxy: {
            '/api': {
                target: 'http://localhost:11005',
                pathRewrite: {
                    '^/api': '/api'
                },
            },
        }
    },
    // transpileDependencies: ['vuetify'],
    publicPath: process.env.NODE_ENV === 'production' ? '/mapi/' : '/', //預先編譯至mapi子目錄下, 待轉成模板, 並於伺服器啟動後依照設定檔取代
}
