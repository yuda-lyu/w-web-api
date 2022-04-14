import apis from './tables/apis.mjs'
import build from 'w-data-collector/src/build.mjs'


let cs = {
    apis,
}

//ds
let ds = {}
for (let k in cs) {
    ds[k] = build(cs[k], { useCreateStorage: false })
}


export default ds
