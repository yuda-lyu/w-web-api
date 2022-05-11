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
    publicPath: process.env.NODE_ENV === 'production' ? '/mapi/' : '/',
}
