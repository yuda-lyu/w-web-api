//前後端共用函數區
// import min from 'lodash/min'
import max from 'lodash/max'
import trim from 'lodash/trim'
// import isEqual from 'lodash/isEqual'
import uniq from 'lodash/uniq'
import set from 'lodash/set'
import get from 'lodash/get'
import map from 'lodash/map'
import each from 'lodash/each'
import isNumber from 'lodash/isNumber'
import sortBy from 'lodash/sortBy'
import find from 'lodash/find'
import size from 'lodash/size'
import filter from 'lodash/filter'
import last from 'lodash/last'
import split from 'lodash/split'
import join from 'lodash/join'
import cloneDeep from 'lodash/cloneDeep'
import cstr from 'wsemi/src/cstr.mjs'
import sep from 'wsemi/src/sep.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import isstr from 'wsemi/src/isstr.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import ispint from 'wsemi/src/ispint.mjs'
import isnum from 'wsemi/src/isnum.mjs'
import ispnum from 'wsemi/src/ispnum.mjs'
import isfun from 'wsemi/src/isfun.mjs'
import cdbl from 'wsemi/src/cdbl.mjs'
import cint from 'wsemi/src/cint.mjs'
import strleft from 'wsemi/src/strleft.mjs'
import strmid from 'wsemi/src/strmid.mjs'
import haskey from 'wsemi/src/haskey.mjs'
import timemsTZ2past from 'wsemi/src/timemsTZ2past.mjs'
import getFileAccept from 'wsemi/src/getFileAccept.mjs'
import at from 'wsemi/src/attstr.mjs'


function dtAddAndLtdtFind(dt, keyDtSrc, keyDtSave, ltdt, keyLtdt = 'id') {

    //id
    let id = get(dt, keyDtSrc, '')
    // console.log('id', id)

    //check
    if (!isestr(id)) {
        return {}
    }

    //find
    let r = find(ltdt, { [keyLtdt]: id })
    // console.log('find r', r)

    //check
    if (!iseobj(r)) {
        return {}
    }

    //join
    dt[keyDtSave] = r
    // console.log('dt', dt)

    return dt
}


function gv(o, k, def = '無') {
    let r = get(o, k, '')
    if (!isestr(r)) {
        return def
    }
    return r
}


function parseNameByVersion(name) {

    //check
    if (name.indexOf('R') < 0) {
        return {
            name,
            version: null,
        }
    }

    let s = sep(name, 'R')
    let s0 = get(s, 0, '')
    let s1 = get(s, 1, '')
    let nv = size(s1)

    //check
    if (nv < 5) { //版本號為R00.00, 不包括R需為5位
        return {
            name,
            version: null,
        }
    }
    else if (nv > 5) { //版本號為R00.00-1091019, 後面可能有其他文字數字
        s1 = strleft(s1, 5)
    }

    //check, 提取出版本號為00.00, 需針對各字元檢查
    let c0 = strmid(s1, 0, 1)
    let c1 = strmid(s1, 1, 1)
    let c2 = strmid(s1, 2, 1)
    let c3 = strmid(s1, 3, 1)
    let c4 = strmid(s1, 4, 1)
    if (!isnum(c0) || !isnum(c1) || !isnum(c3) || !isnum(c4) || (c2 !== '.')) {
        return {
            name,
            version: null,
        }
    }

    //version
    let version = `R${s1}`

    return {
        name: s0,
        version,
    }
}


function timeFormaterPast(t) {
    let c = timemsTZ2past(t)
    c = get(c, 'msg', '無')
    return c
}


// function parseSerialNumberByVersion(serialNumber) {

//     //check
//     if (serialNumber.indexOf('R') < 0) {
//         return {
//             serialNumber,
//             serialNumberBase: serialNumber,
//             version: null,
//         }
//     }

//     let s = sep(serialNumber, 'R')
//     let s0 = get(s, 0, '')
//     let s1 = get(s, 1, '')
//     let nv = size(s1)

//     //check
//     if (nv !== 5) { //版本號為R00.00, 不包括R需為5位
//         return {
//             serialNumber,
//             serialNumberBase: serialNumber,
//             version: null,
//         }
//     }

//     //version
//     let version = `R${s1}`

//     return {
//         serialNumber,
//         serialNumberBase: s0,
//         version,
//     }
// }


// function isNumOrEng(str) {
//     let regExp = /^[\d|a-zA-Z]+$/
//     if (regExp.test(str)) {
//         return true
//     }
//     else {
//         return false
//     }
// }


// function getKpTableData(rows) {
//     rows = filter(rows, (v) => {
//         return v.isActive === 'y'
//     })
//     let kp = {}
//     each(rows, (v) => {
//         kp[v.id] = v
//     })
//     return kp
// }


// function getItemsByIds(ids, kp) {
//     let ts = atParse(ids)
//     let rs = []
//     each(ts, (v) => {
//         let r = get(kp, v.id)
//         if (iseobj(r)) {
//             rs.push(r)
//         }
//     })
//     return rs
// }


// function extractFileType(fileName, fileType) {
//     let r = ''

//     //find
//     let ar = getFileAccept()
//     for (let i = 0; i < ar.length; i++) {
//         if (ar[i].acp === fileType) {
//             return ar[i].name
//         }
//     }

//     //from name ext
//     let s = split(fileName, '.')
//     if (size(s) > 1) {
//         return last(s)
//     }

//     return r
// }


export {
    at,
    gv,
    parseNameByVersion,
    // parseSerialNumberByVersion,
    dtAddAndLtdtFind,
    timeFormaterPast
}
