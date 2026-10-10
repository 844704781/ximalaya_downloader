import * as authService from '../../../core/authService.js'
import {taskManager} from '../../../core/taskManager.js'
import {handle} from './handle.js'

/**
 * 凭据发生变化后，清掉下载器工厂里缓存的 downloader 实例
 *
 * TaskManager 的工厂和 authService 各自持有互相独立的 downloader 对象。
 * authService 清掉自己的 cookie 缓存后，工厂里那份仍然拿着旧的内存 cookie
 * 字符串继续发请求 —— 表现为「退出登录了但下载还在用旧身份」，
 * 或者「刚写入的新 Cookie 对下载不生效」。
 */
function invalidateDownloaders() {
    taskManager.factory().invalidate()
}

/**
 * 登录相关的 IPC
 */
function registerAuthIpc() {
    handle('auth:status', () => authService.status())

    handle('auth:qrcode', type => authService.qrcode(type))

    handle('auth:check', async (type, qrId) => {
        const result = await authService.check(type, qrId)
        if (result && result.ok) {
            invalidateDownloaders()
        }
        return result
    })

    handle('auth:cookie', async (type, raw) => {
        const result = await authService.saveCookie(type, raw)
        invalidateDownloaders()
        return result
    })

    handle('auth:logout', async type => {
        const result = await authService.logout(type)
        invalidateDownloaders()
        return result
    })
}

export {registerAuthIpc}
