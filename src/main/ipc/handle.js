import {ipcMain} from 'electron'
import {log} from '../../../common/log4jscf.js'

/**
 * 注册一个 IPC 处理器
 *
 * 统一记录异常，再把原始异常抛回渲染进程。
 * Electron 会把 message 序列化过去（自定义属性会丢失），
 * 所以错误信息里的文案要写清楚，前端直接展示。
 * @param channel
 * @param fn
 */
function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
        try {
            return await fn(...args)
        } catch (e) {
            log.error(`IPC ${channel} 执行失败:`, e)
            throw e
        }
    })
}

export {handle}
