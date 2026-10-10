import fs from 'node:fs'
import {spawn} from 'node:child_process'
import {shell} from 'electron'
import {taskManager} from '../../../core/taskManager.js'
import {handle} from './handle.js'
import {log} from '../../../common/log4jscf.js'

/**
 * 在系统文件管理器里打开一个目录
 *
 * 这个功能在本机踩过两次坑，结论如下（都是实测得出，不要凭直觉改回去）：
 *
 * 1) **曾经在 Electron 处于低完整性级别时全部失效。**
 *    那时 `shell.openPath`、`spawn('explorer.exe')`、`shell.showItemInFolder`
 *    三种方式日志都显示执行了，但资源管理器毫无反应 ——
 *    低完整性进程无法启动/通知资源管理器。修复 electron.exe 的完整性标签之后
 *    （见 scripts/fix-electron-integrity.cjs），前两种立刻恢复可用。
 *
 * 2) **`shell.showItemInFolder` 至今仍然没有反应**（提升为 Medium 之后实测，
 *    调用无异常但不打开任何窗口），所以不作为首选。
 *
 * 现在首选 `explorer.exe /select,<目录>`：打开父目录并选中该文件夹，
 * 路径带全角标点也没问题。注意 `/select,` 必须和路径写在同一个参数里，
 * 这是 explorer 的命令行要求。
 *
 * @param dir
 * @returns {Promise<{ok: boolean}>}
 */
function openDirectory(dir) {
    if (process.platform === 'win32') {
        return new Promise(resolve => {
            const attempt = (args, label) => {
                const child = spawn('explorer.exe', args, {detached: true, stdio: 'ignore'})
                child.on('error', error => {
                    log.warn(`[openDir] ${label} 失败: ${error && error.message ? error.message : error}`)
                })
                // explorer.exe 即使成功也常常返回非 0，所以不等它退出
                child.unref()
                log.info(`[openDir] ${label}: ${dir}`)
            }

            try {
                attempt([`/select,${dir}`], '资源管理器定位')
                resolve({ok: true})
            } catch (e) {
                log.warn(`[openDir] /select 失败，退回直接打开: ${e && e.message ? e.message : e}`)
                try {
                    attempt([dir], '资源管理器打开')
                    resolve({ok: true})
                } catch (e2) {
                    // 最后退回 Electron 自带实现
                    shell.openPath(dir).then(message => {
                        if (message !== '') {
                            resolve({ok: false, error: message})
                        } else {
                            resolve({ok: true})
                        }
                    }).catch(err => {
                        resolve({ok: false, error: err && err.message ? err.message : String(err)})
                    })
                }
            }
        })
    }

    return shell.openPath(dir).then(message => {
        if (message !== '') {
            throw new Error(message)
        }
        return {ok: true}
    })
}

/**
 * 下载任务相关的 IPC
 */
function registerTaskIpc() {
    handle('task:list', () => taskManager.list())

    handle('task:tracks', (albumId, options) => taskManager.tracks(albumId, options))

    handle('task:create', options => taskManager.create(options))

    handle('task:pause', taskId => taskManager.pause(taskId))

    handle('task:resume', taskId => taskManager.resume(taskId))

    handle('task:cancel', taskId => taskManager.cancel(taskId))

    handle('task:retry', albumId => taskManager.retry(albumId))

    handle('task:remove', (albumId, deleteRecords) => taskManager.remove(albumId, deleteRecords))

    handle('task:openDir', async albumId => {
        const dir = await taskManager.targetDirOf(albumId)
        if (!fs.existsSync(dir)) {
            throw new Error(
                `目录还不存在：${dir}\n`
                + '可能还没有开始下载，或者该专辑的下载目录已经被移动/删除。'
            )
        }
        const result = await openDirectory(dir)
        return {...result, path: dir}
    })
}

export {registerTaskIpc}
