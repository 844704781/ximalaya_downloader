import {registerAuthIpc} from './auth.js'
import {registerTaskIpc} from './task.js'
import {registerSettingsIpc} from './settings.js'
import {registerSystemIpc} from './system.js'

/**
 * 注册全部 IPC 处理器
 * @param context { getWindow: () => BrowserWindow|null }
 */
function registerIpc(context) {
    registerAuthIpc()
    registerTaskIpc()
    registerSettingsIpc(context)
    // 少了这一行，dialog:chooseDir 通道就不存在，「浏览…」选目录会直接失败
    registerSystemIpc(context)
}

export {registerIpc}
