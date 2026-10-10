import fs from 'node:fs'
import path from 'node:path'
import {getSettings, updateSettings} from '../../../core/settingsStore.js'
import {expandHome} from '../../../core/paths.js'
import {log} from '../../../common/log4jscf.js'
import {handle} from './handle.js'

/**
 * 判断目录是否真的可写
 *
 * 必须实际写一个探针文件：目录存在不等于能写。
 * @param dir
 * @returns {boolean}
 */
function isWritableDir(dir) {
    if (!dir) {
        return false
    }
    try {
        fs.mkdirSync(dir, {recursive: true})
        const probe = path.join(dir, `.write-probe-${process.pid}-${Date.now()}`)
        fs.writeFileSync(probe, 'ok')
        fs.unlinkSync(probe)
        return true
    } catch (e) {
        return false
    }
}

/**
 * 设置相关的 IPC
 *
 * ── 关于「下载目录不可写」这件事的最终结论 ──────────────────────────────
 * 这个项目曾经出现过「只有项目目录能下载，其它目录一律 EPERM」的问题。
 *
 * 真正的根因：
 *   工作区目录带 `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)`，
 *   这个标签会被目录内新建的所有文件继承 —— 包括 npm 解压出来的 electron.exe。
 *   而 Windows 用**镜像文件本身的完整性标签**决定进程的完整性级别，
 *   于是 Electron 进程以「低完整性」运行，只能写带 Low 标签的目录。
 *
 * 已经逐一验证并排除的绕路方案（都无效，不要再走）：
 *   - 目录联接（junction）：写入会穿透到目标目录，受的是目标标签的约束
 *   - 应用内直接跑 icacls 打标签：低完整性进程改不了 Medium 对象
 *   - UAC 提权跑 icacls：低完整性进程的提权请求会被 Windows 拒绝
 *   - 委托 node 子进程落盘：子进程继承父进程的低完整性令牌
 *
 * 唯一有效的修复：把 electron.exe 的标签改回 Medium。
 * 见 scripts/fix-electron-integrity.cjs（已挂在 postinstall 上自动执行，
 * 也可以随时手动跑 `npm run fix:electron-integrity`）。
 */
function registerSettingsIpc() {
    handle('settings:get', () => getSettings())

    handle('settings:set', patch => {
        if (patch == null || patch.output == null || String(patch.output).trim() === '') {
            return updateSettings(patch)
        }

        const dir = expandHome(String(patch.output).trim())

        if (!isWritableDir(dir)) {
            log.warn(`[下载目录] 「${dir}」不可写`)
            throw new Error(
                `目录「${dir}」不可写。\n` +
                `最可能的原因：Electron 进程正处于「低完整性级别」——` +
                `因为 electron.exe 这个文件继承了工作区的低完整性标签，` +
                `而 Windows 用镜像文件的标签决定进程的完整性级别，` +
                `低完整性进程只能写带同样标签的目录。\n` +
                `修复办法：在项目目录下执行一次\n` +
                `npm run fix:electron-integrity\n` +
                `然后重启应用。`
            )
        }

        return updateSettings({...patch, output: dir, outputLabel: dir})
    })
}

export {registerSettingsIpc}
