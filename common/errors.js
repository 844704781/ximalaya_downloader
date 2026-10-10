/**
 * 暂停异常
 *
 * 用来区分「用户主动暂停」和「真实下载失败」：
 * 暂停不计入失败数、不触发重试、不污染失败统计。
 */
class PausedError extends Error {
    constructor(message = '任务已暂停') {
        super(message)
        this.name = 'PausedError'
        this.isPaused = true
    }
}

/**
 * 判断一个异常是否来自 AbortController.abort()
 *
 * axios 抛 CanceledError，Node 原生 stream pipeline 抛 AbortError / ERR_CANCELED，
 * 三处命名不统一，统一在这里判断。
 * @param e
 * @returns {boolean}
 */
function isAbortError(e) {
    if (e == null) {
        return false
    }
    return e.name === 'CanceledError'
        || e.name === 'AbortError'
        || e.code === 'ERR_CANCELED'
        || e.code === 'ABORT_ERR'
}

export {
    PausedError,
    isAbortError
}
