function filePathToCode(c) {
    if (c.indexOf('\\\\') >= 0) {
        return '```' + c + '```'
    }
    return c
}


export default filePathToCode
