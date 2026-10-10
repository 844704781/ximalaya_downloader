import {dialog} from 'electron'
import {handle} from './handle.js'

/**
 * 系统对话框相关的 IPC
 * @param context { getWindow: () => BrowserWindow|null }
 */
function registerSystemIpc(context) {
    handle('dialog:chooseDir', async () => {
        const options = {
            title: '选择下载目录',
            properties: ['openDirectory', 'createDirectory']
        }
        const win = context && typeof context.getWindow === 'function' ? context.getWindow() : null
        const result = win == null
            ? await dialog.showOpenDialog(options)
            : await dialog.showOpenDialog(win, options)
        if (result.canceled || result.filePaths.length === 0) {
            return null
        }
        return result.filePaths[0]
    })
}

export {registerSystemIpc}
