//以 --import 預載: 把 global Date 之「現在」釘在 FIXED, 使舊實作 (以 ot() 取 now) 可產出固定 expected
//  node --import ./test/staLogs-golden/fakeDate.mjs test/staLogs-golden/gen-expected.mjs expected
//只供 gen-expected.mjs 使用; 測試檔本身不用假時鐘 (改以 opt.timeNow 注入)
let FIXED = process.env.FAKE_NOW ? Number(process.env.FAKE_NOW) : 1788150896789 //預設 2026-08-31 12:34:56.789 (+08:00)
let RealDate = Date
class FakeDate extends RealDate {
    constructor(...args) {
        if (args.length === 0) {
            super(FIXED)
        }
        else {
            super(...args)
        }
    }

    static now() {
        return FIXED
    }
}
globalThis.Date = FakeDate
