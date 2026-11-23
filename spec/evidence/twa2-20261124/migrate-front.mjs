//前端遷移(一次性批次腳本): describeShape→getDiagShape、describeErr→getDiagBriefErr(物件直印), 匯入行改自 wsemi
//保留各檔換行格式(CRLF); 只改含預期匯入行之檔; 回報處理之呼叫數與匯入行數供與 Grep 對照
import fs from 'fs'
import path from 'path'

let root = path.resolve('.')
let files = [
    'src/App.vue',
    'src/main.js',
    'src/components/LayoutContentEdit.vue',
    'src/components/LayoutContentStats.vue',
    'src/components/LayoutContentTest.vue',
    'src/components/MdPanel.vue',
    'src/store/applyRows.mjs',
]
let IMP_SHAPE = `import getDiagShape from 'wsemi/src/getDiagShape.mjs'`
let IMP_ERR = `import getDiagBriefErr from 'wsemi/src/getDiagBriefErr.mjs'`
let total = { shape: 0, err: 0, imp: 0 }
for (let f of files) {
    let fp = path.join(root, f)
    let c = fs.readFileSync(fp, 'utf8')
    let eol = c.includes('\r\n') ? '\r\n' : '\n'
    let nImp = 0
    c = c.replace(/^import \{ ([^}]*) \} from '(?:\.{1,2}\/)+describeShape\.mjs'$/gm, (m, names) => {
        let ns = names.split(',').map((s) => s.trim())
        let out = []
        for (let n of ns) {
            if (n === 'describeShape') {
                out.push(IMP_SHAPE)
            }
            else if (n === 'describeErr') {
                out.push(IMP_ERR)
            }
            else {
                throw new Error(`${f}: 非預期之匯入名稱 ${n}`)
            }
        }
        nImp += 1
        return out.join(eol)
    })
    if (nImp !== 1) {
        throw new Error(`${f}: 匯入行應恰 1 行, 實得 ${nImp}`)
    }
    let nShape = 0
    let nErr = 0
    c = c.replace(/\bdescribeShape\(/g, () => {
        nShape += 1
        return 'getDiagShape('
    })
    c = c.replace(/\bdescribeErr\(/g, () => {
        nErr += 1
        return 'getDiagBriefErr('
    })
    if (/describeShape|describeErr|safeCtl/.test(c)) {
        throw new Error(`${f}: 仍殘留舊名稱`)
    }
    fs.writeFileSync(fp, c, 'utf8')
    total.shape += nShape
    total.err += nErr
    total.imp += nImp
    console.log(`${f}: imp=${nImp} shape=${nShape} err=${nErr}`)
}
console.log(JSON.stringify(total))
