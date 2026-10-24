//後台登入檢查（GET /api/getUserByToken）成功時回應之使用者欄位。
//fieldsLoginUser：回應欄位白名單（A-2，單一來源）。部署方之 getUserByToken 所回使用者物件可能帶有 password、tokenVerify、description、isApp 等與前端無關之欄位，
//後台登入檢查不得原樣回傳：只回 id、name、email、isAdmin。依據：前端（Layout.vue）只用 name、email 顯示登入者，w-ui-loginout 只要求回傳為非空物件；
//id、isAdmin 為本套件判定身分與等級之欄位；isApp 不需要（等級只看 isAdmin，不分應用系統 token 之用途），故不回。凍結以免被其他模組改寫而放寬。
let fieldsLoginUser = Object.freeze(['id', 'name', 'email', 'isAdmin'])


//pickLoginUser：使用者物件 → 登入檢查回應物件。只輸出 fieldsLoginUser 所列且為來源自身屬性之鍵（不讀原型鏈、缺欄不虛構），其餘一律不輸出；回傳新物件。非物件回空物件。
function pickLoginUser(user) {
    let o = {}
    if (user === null || typeof user !== 'object' || Array.isArray(user)) {
        return o
    }
    for (let k of fieldsLoginUser) {
        if (Object.prototype.hasOwnProperty.call(user, k)) {
            o[k] = user[k]
        }
    }
    return o
}


export { fieldsLoginUser, pickLoginUser }
export default pickLoginUser
