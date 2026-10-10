import log4js from 'log4js'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {config} from './config.js'

/**
 * 日志配置
 *
 * 核心原则：**日志系统出任何问题都不能让进程挂掉。**
 *
 * 之前这里在模块顶层直接 log4js.configure()，且日志路径写死在 ~/.xmd/logs。
 * 结果是：只要那个文件写不了（权限问题、被别的进程占用、只读家目录、安全软件锁定），
 * configure 就抛 EPERM，而它发生在模块顶层 —— 整个主进程直接崩溃，
 * 界面上弹一个「A JavaScript error occurred in the main process」。
 * 一个纯粹的日志问题不该导致应用起不来。
 *
 * 现在的做法：
 *  1. 逐个候选目录做**真实写入探测**（只 mkdirSync 成功不代表能写文件）
 *  2. 所有候选都失败时退回纯控制台 appender
 *  3. 整个初始化过程包在 try/catch 里，任何异常都不外抛
 */

const MAX_LOG_SIZE = 5 * 1024 * 1024
const LOG_BACKUPS = 3

/**
 * 探测目录是否真的可写
 *
 * 必须实际写一个文件：目录可能存在但不可写（NTFS 权限、只读挂载、
 * 被安全软件锁定），这种情况下 mkdirSync 是成功的。
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
 * 日志目录候选，按优先级排列
 * @returns {string[]}
 */
function candidateLogDirs() {
    const list = []
    // 1. 项目约定：~/.xmd/logs（CLI 与 GUI 共用同一份日志）
    try {
        const xmdDir = String(config.xmd || '~/.xmd').replace('~', os.homedir())
        list.push(path.join(xmdDir, 'logs'))
    } catch (e) {
        // 配置异常，跳过这个候选
    }
    // 2. 进程工作目录下的 logs/（开发时最稳，且位于项目内）
    try {
        list.push(path.join(process.cwd(), 'logs'))
    } catch (e) {
    }
    // 3. 系统临时目录兜底
    try {
        list.push(path.join(os.tmpdir(), 'xmd-logs'))
    } catch (e) {
    }
    return list
}

/**
 * 挑一个真正可写的日志目录
 * @returns {string|null}
 */
function pickLogDir() {
    for (const dir of candidateLogDirs()) {
        if (isWritableDir(dir)) {
            return dir
        }
    }
    return null
}

/**
 * 应用 log4js 配置
 * @param logDir 为 null 时只输出到控制台
 */
function applyConfig(logDir) {
    const appenders = {
        console: {type: 'console'}
    }
    if (logDir) {
        appenders.file = {
            type: 'file',
            filename: path.join(logDir, 'app.log'),
            maxLogSize: MAX_LOG_SIZE,
            backups: LOG_BACKUPS,
            compress: false
        }
    }
    log4js.configure({
        appenders: appenders,
        categories: {
            default: {appenders: Object.keys(appenders), level: 'info'}
        }
    })
}

let activeLogFile = null

// ---- 初始化：任何异常都不能外抛 ----
try {
    const dir = pickLogDir()
    activeLogFile = dir ? path.join(dir, 'app.log') : null
    applyConfig(dir)
} catch (e) {
    // 连挑目录/配置都炸了，退回纯控制台
    activeLogFile = null
    try {
        applyConfig(null)
    } catch (e2) {
        // log4js 完全不可用，下面导出的 log 仍能用（log4js 有内置的默认行为）
    }
}

export const log = log4js.getLogger('app')

/**
 * 当前实际使用的日志文件路径（为 null 表示只输出到控制台）
 * @returns {string|null}
 */
export function logFilePath() {
    return activeLogFile
}

/**
 * 输出一条日志，并顺带让它出现在控制台
 *
 * 注意：不要用这个函数做初始化，它只是给调用方一个"保证不抛异常"的写日志入口。
 */
export function safeLog(level, ...args) {
    try {
        const fn = typeof log[level] === 'function' ? log[level] : log.info
        fn.call(log, ...args)
    } catch (e) {
        // 日志失败永远不向外抛
    }
}
