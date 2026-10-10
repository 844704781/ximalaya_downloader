import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {config} from '../common/config.js'

/**
 * 路径工具
 *
 * 这里刻意不 import electron：core/ 下的模块要保持可以脱离 Electron 运行，
 * 便于直接用 node 做脚本验证。userData 目录由主进程通过 initPaths() 注入。
 */

let _userDataDir = null

/**
 * 展开路径开头的 ~
 * @param p
 * @returns {string}
 */
function expandHome(p) {
    if (p == null || p === '') {
        return p
    }
    return String(p).replace(/^~(?=$|[/\\])/, os.homedir())
}

/**
 * 项目自己的数据目录（默认 ~/.xmd）
 * cookie、nedb 数据库、日志都在这里，与 Electron 的 userData 是两回事。
 * @returns {string}
 */
function xmdDir() {
    return expandHome(config.xmd || '~/.xmd')
}

/**
 * 递归创建目录，失败不抛异常
 * @param dir
 */
function ensureDir(dir) {
    try {
        fs.mkdirSync(dir, {recursive: true})
    } catch (e) {
        // 目录已存在或权限不足，交由后续写入操作报错
    }
}

/**
 * 初始化路径。
 *
 * 必须在 app ready 之前调用，并且早于任何读写设置的操作。
 * @param dir Electron 的 app.getPath('userData')
 */
function initPaths(dir) {
    _userDataDir = dir
    ensureDir(path.join(dir, 'db', 'file'))
    ensureDir(xmdDir())
    ensureDir(path.join(xmdDir(), 'logs'))
}

/**
 * 取用户数据目录
 * @returns {string}
 */
function userDataDir() {
    if (_userDataDir == null) {
        throw new Error('initPaths() 尚未调用，无法确定用户数据目录')
    }
    return _userDataDir
}

export {
    expandHome,
    xmdDir,
    ensureDir,
    initPaths,
    userDataDir
}
