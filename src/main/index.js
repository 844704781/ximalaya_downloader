import {app, BrowserWindow, dialog, shell} from 'electron'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {config} from '../../common/config.js'
import {initPaths} from '../../core/paths.js'
import {taskManager} from '../../core/taskManager.js'
import {registerIpc} from './ipc/index.js'
import {log, logFilePath, safeLog} from '../../common/log4jscf.js'

/**
 * Electron 主进程入口
 *
 * 注意 ESM 的加载时序：静态 import 会先于本文件正文执行。
 * core/ 下的模块都只在函数内部访问 userData 目录，所以这里的 initPaths()
 * 晚于 import 执行是安全的。但任何在模块顶层读写设置的代码都不能加到被 import 的模块里。
 */

/**
 * 启动阶段专用的路标日志：**同步**追加到日志文件
 *
 * log4js 的文件写入是异步的（内部是 WriteStream）。如果进程很快就退出
 * —— 比如单实例锁竞争失败后立刻 app.quit() —— 缓冲区里的日志会全部丢失，
 * 表现就是「日志只写了两行，完全不知道死在哪儿」。
 *
 * 启动阶段一律用这个函数，保证任何退出路径都留下痕迹。
 * @param message
 */
function bootstrapNote(message) {
    const stamp = new Date().toISOString()
    try {
        const file = logFilePath()
        if (file) {
            fs.appendFileSync(file, `[${stamp}] [BOOT] ${message}\n`)
        }
    } catch (e) {
        // 日志文件不可写就只留控制台那一份
    }
    safeLog('info', message)
}

bootstrapNote('=== 主进程启动 ===')
bootstrapNote(`electron=${process.versions.electron} node=${process.versions.node} chrome=${process.versions.chrome}`)
bootstrapNote(`cwd=${process.cwd()}`)
bootstrapNote(`argv=${process.argv.join(' ')}`)
bootstrapNote(`pid=${process.pid} ppid=${process.ppid}`)
bootstrapNote(`日志文件=${logFilePath() || '(仅控制台)'}`)

/**
 * 把 Electron 的 userData 重定向到配置的数据目录
 *
 * 受限环境下 %APPDATA% 可能整个不可写，连锁反应很广：
 *   - settings.json 写入报 EPERM（就是之前界面弹的那个错误提示）
 *   - Chromium 的缓存 / LocalStorage / GPU 缓存写入失败
 *   - **单实例锁创建失败 → requestSingleInstanceLock() 返回 false
 *     → 应用直接退出且没有任何窗口**，这是最难排查的一种
 *
 * 统一放到 config.xmd 下面（现在指向项目内的 .xmd-data），保证可写。
 *
 * 必须在 app ready 之前调用，也要早于任何一次 getPath('userData')。
 */
try {
    const rawXmd = String(config.xmd || '~/.xmd')
    const expanded = rawXmd.replace(/^~(?=$|[/\\])/, os.homedir())
    const base = path.isAbsolute(expanded) ? expanded : path.join(process.cwd(), '.xmd-data')
    const target = path.join(base, 'electron')
    fs.mkdirSync(target, {recursive: true})
    const before = app.getPath('userData')
    app.setPath('userData', target)
    bootstrapNote(`userData: ${before} -> ${target}`)
} catch (e) {
    safeLog('error', 'userData 重定向失败: ' + (e && e.stack ? e.stack : e))
}

/**
 * 把当前进程的令牌信息写进日志
 *
 * 这台机器上 Electron 进程被观测到运行在低完整性级别（Low），而同一个终端里的
 * node 不是。令牌里的完整性标签和 SID 列表能直接指出是谁把它降下来的：
 *
 *   - `Mandatory Label\Low Mandatory Level`  → 确认是低完整性
 *   - `S-1-15-2-...`   → AppContainer 沙箱
 *   - `S-1-5-5-...`    → 登录会话 SID
 *   - 其它自定义 SID   → 某个沙箱/安全软件注入的受限令牌
 *   - 权限列表若明显偏少 → 说明用的是「受限令牌」
 *
 * whoami 能从 Electron 里成功执行（前面的 icacls 实验证明了子进程可以启动），
 * 所以这条探测是可靠的。
 *
 * 只在「完整性级别探测失败」时调用 —— 正常启动时它会往日志里刷 40 多行，
 * 而配合 --watch 每次改代码都会重启，那就把有用的日志淹没了。
 */
function dumpProcessToken() {
    try {
        const groups = execFileSync('whoami.exe', ['/groups'], {encoding: 'utf8', windowsHide: true})
        bootstrapNote('--- 进程令牌 whoami /groups ---')
        for (const raw of String(groups).split(/\r?\n/)) {
            const line = raw.trim()
            if (line !== '') {
                bootstrapNote('  ' + line)
            }
        }

        const priv = execFileSync('whoami.exe', ['/priv'], {encoding: 'utf8', windowsHide: true})
        bootstrapNote('--- 进程权限 whoami /priv ---')
        for (const raw of String(priv).split(/\r?\n/)) {
            const line = raw.trim()
            if (line !== '') {
                bootstrapNote('  ' + line)
            }
        }
    } catch (e) {
        safeLog('warn', '读取进程令牌失败: ' + (e && e.message ? e.message : e))
    }
}

let userDataPath = null
try {
    userDataPath = app.getPath('userData')
    initPaths(userDataPath)
    bootstrapNote(`userData 生效值=${userDataPath}`)
} catch (e) {
    safeLog('error', 'initPaths 失败: ' + (e && e.stack ? e.stack : e))
}

/**
 * 探测当前进程的完整性级别（Integrity Level）
 *
 * 这台机器上出现过「只有项目目录能写、其他目录全报 EPERM」的问题，
 * 根因是 Electron 进程跑在低完整性级别（Low），而 Windows 的强制完整性控制
 * 只允许向下写 —— Low 写得了带 Low 标签的目录（项目目录就是），
 * 写不了默认的 Medium 目录。
 *
 * 往用户主目录写一个探针文件即可判断：主目录是 Medium 级别，
 * 能写说明进程是 Medium/High，写不了说明被限制在 Low。
 *
 * ⚠️ 一旦探测到「受限」，说明 electron.exe 又被继承成 Low 标签了
 * （npm install 重新解压会这样），执行 `npm run fix:electron-integrity` 修复。
 */
try {
    const probeDir = os.homedir()
    const probeFile = path.join(probeDir, `.xmd-integrity-probe-${process.pid}`)
    let integrity = '未知'
    try {
        fs.writeFileSync(probeFile, 'ok')
        fs.unlinkSync(probeFile)
        integrity = 'Medium 或更高（能写用户主目录）—— 下载目录可以任意选择'
    } catch (e) {
        integrity = `受限（${e && e.code ? e.code : e}）—— 进程处于低完整性级别，只能写带 Low 标签的目录。`
            + '修复: npm run fix:electron-integrity 然后重启'
        // 只有探测失败才需要令牌细节来定位原因，正常启动不刷日志
        dumpProcessToken()
    }
    bootstrapNote(`完整性级别探测: ${integrity}`)
} catch (e) {
    safeLog('warn', '完整性级别探测失败: ' + (e && e.message ? e.message : e))
}

let mainWindow = null

/**
 * preload 构建产物是 .mjs
 *
 * "type": "module" 时 electron-vite 会把 preload 输出成 index.mjs
 * （Electron 官方要求 ESM preload 必须是 .mjs 扩展名）。
 */
function preloadPath() {
    return fileURLToPath(new URL('../preload/index.mjs', import.meta.url))
}

function rendererIndexPath() {
    return fileURLToPath(new URL('../renderer/index.html', import.meta.url))
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 1000,
        minHeight: 640,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#14161a',
        title: '喜马拉雅下载器',
        webPreferences: {
            preload: preloadPath(),
            // ESM preload 必须关闭 sandbox，否则无法加载
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    // 显示窗口的三重兜底。
    //
    // 不能只依赖 ready-to-show：它要求渲染进程完成首次绘制，一旦渲染层加载失败
    // （CSP 拦截、路径错误、脚本抛异常），这个事件可能永远不触发，
    // 窗口就会一直保持隐藏 —— 表现恰好是「命令在跑，但没有窗口」。
    const show = () => {
        if (!win.isDestroyed() && !win.isVisible()) {
            win.show()
        }
    }
    win.once('ready-to-show', show)
    win.webContents.once('did-finish-load', show)
    setTimeout(show, 5000)

    // 渲染层的各种失败都要落到日志里，否则只能面对一个不出现的空白窗口
    win.webContents.on('did-fail-load', (_event, code, desc, url) => {
        log.error(`渲染进程加载失败 code=${code} desc=${desc} url=${url}`)
    })
    win.webContents.on('preload-error', (_event, preload, error) => {
        log.error(`preload 执行失败 ${preload}:`, error)
    })
    win.webContents.on('render-process-gone', (_event, details) => {
        log.error('渲染进程异常退出:', details)
    })

    // 开发期把渲染层的 console 也收进日志，便于排查白屏
    if (!app.isPackaged) {
        win.webContents.on('console-message', (...args) => {
            const details = args[1]
            if (details && typeof details === 'object' && details.message !== undefined) {
                log.info(`[renderer] ${details.message}`)
            } else if (typeof args[2] === 'string') {
                // Electron 35 之前的旧签名：(event, level, message, line, sourceId)
                log.info(`[renderer] ${args[2]}`)
            }
        })
    }

    // 外部链接交给系统浏览器，不在应用内打开新窗口
    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url)
        return {action: 'deny'}
    })

    if (process.env.ELECTRON_RENDERER_URL) {
        // 开发模式：electron-vite 起了一个带 HMR 的 vite dev server
        log.info(`加载渲染进程(dev): ${process.env.ELECTRON_RENDERER_URL}`)
        win.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        const index = rendererIndexPath()
        log.info(`加载渲染进程(file): ${index}`)
        win.loadFile(index)
    }

    win.on('closed', () => {
        mainWindow = null
    })
    return win
}

/**
 * 单实例锁
 *
 * 必须尽早获取。多个实例同时运行会互相争抢同一批文件：
 *   - ~/.xmd/logs/app.log —— log4js 的文件流被前一个实例占着，后一个实例报 EPERM
 *   - ~/.xmd/db/file/*.db —— 两个进程同时写 nedb 会直接损坏数据库
 * 之前调试时留下的残留 Electron 进程正是这么把新实例搞挂的。
 */
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    // 静默退出是最糟糕的处理方式：用户看到的就是「什么都没发生」。
    // 这里同步写日志 + 弹框说明原因，保证问题一定可见。
    bootstrapNote('[单实例锁] 已有实例在运行，本次启动退出')
    try {
        dialog.showErrorBox(
            '喜马拉雅下载器已在运行',
            '检测到已经有一个实例在运行，本次启动已退出。\n\n'
            + '如果任务栏里找不到它的窗口，说明是残留进程，请先执行：\n\n'
            + '    Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force\n\n'
            + '然后再重新启动。'
        )
    } catch (e) {
        // 连对话框都失败也要继续退出
    }
    app.quit()
} else {
    app.on('second-instance', () => {
        if (mainWindow != null && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore()
            }
            mainWindow.show()
            mainWindow.focus()
        }
    })

    app.whenReady().then(() => {
        safeLog('info', 'app ready，创建窗口')
        mainWindow = createWindow()
        // 事件从这里推给渲染进程
        taskManager.bind(mainWindow)
        registerIpc({getWindow: () => mainWindow})

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                mainWindow = createWindow()
                taskManager.bind(mainWindow)
            }
        })
    }).catch(e => {
        safeLog('error', 'app.whenReady() 失败: ' + (e && e.stack ? e.stack : e))
    })
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

process.on('uncaughtException', e => {
    safeLog('error', '主进程未捕获异常: ' + (e && e.stack ? e.stack : e))
})
process.on('unhandledRejection', e => {
    safeLog('error', '主进程未处理的 Promise 拒绝: ' + (e && e.stack ? e.stack : e))
})
