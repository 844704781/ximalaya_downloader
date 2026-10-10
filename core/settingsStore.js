import fs from 'node:fs'
import path from 'node:path'
import {userDataDir, expandHome} from './paths.js'
import {config} from '../common/config.js'
import {safeLog} from '../common/log4jscf.js'

/**
 * GUI 的用户设置持久化
 *
 * 刻意不写回项目根的 config.json：
 * 打包后 settings.js 里的 path.resolve('.') 不再是项目根，
 * 而且安装目录通常不可写。config.json 只作为首次启动的默认值来源。
 *
 * 关于候选链：某些受限环境（安全软件、沙箱、受控文件夹访问）会拒绝进程往
 * 用户目录写文件，报 EPERM。此时不能让整个应用不可用 ——
 * 逐个候选目录探测，全都失败就退化成「仅内存」，界面照常能用，
 * 只是设置不会跨重启保留。
 */

const DEFAULTS = {
    // 下载根目录（实际写入用的路径）
    output: config.archives || '~/Downloads',
    // 界面上显示给用户的路径。
    // 受限环境下 output 可能是一个「目录联接」的内部路径，
    // 直接显示那个哈希路径会让人莫名其妙，所以单独存一份原始选择。
    outputLabel: null,
    // 并发数
    concurrency: 5,
    // 慢速模式
    slow: false,
    // 登录通道偏好：null 表示自动选择已登录的通道
    type: null
}

const MIN_CONCURRENCY = 1
const MAX_CONCURRENCY = 20

const FILE_NAME = 'settings.json'

let _cache = null
// 实际生效的设置文件路径；null 表示只能放在内存里
let _activeFile = null
let _resolved = false
// 是否出现过无法持久化的情况，用于只提示一次
let _persistFailed = false

function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10)
    if (Number.isNaN(n)) {
        return fallback
    }
    return Math.min(max, Math.max(min, n))
}

/**
 * 判断目录是否真的可写
 *
 * 必须实际写一个探针文件：目录存在不等于可写，
 * EPERM 恰恰是在 open 写文件时才暴露出来的。
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
 * 设置文件候选路径，按优先级排列
 * @returns {string[]}
 */
function candidateFiles() {
    const list = []
    // 1. Electron 的 userData（标准位置）
    try {
        list.push(path.join(userDataDir(), FILE_NAME))
    } catch (e) {
        // initPaths 还没调用，跳过
    }
    // 2. 项目自己的 ~/.xmd
    try {
        list.push(path.join(expandHome(config.xmd || '~/.xmd'), FILE_NAME))
    } catch (e) {
    }
    // 3. 当前工作目录（开发时通常位于项目内）
    try {
        list.push(path.join(process.cwd(), FILE_NAME))
    } catch (e) {
    }
    return list
}

/**
 * 解析出第一个可写的设置文件路径
 * @returns {string|null}
 */
function resolveActiveFile() {
    if (_resolved) {
        return _activeFile
    }
    _resolved = true
    const candidates = candidateFiles()
    for (const file of candidates) {
        if (isWritableDir(path.dirname(file))) {
            _activeFile = file
            return _activeFile
        }
    }
    _activeFile = null
    _persistFailed = true
    safeLog('warn', `所有设置文件位置都不可写，设置将只保存在内存中: ${candidates.join(' | ')}`)
    return null
}

/**
 * 从任意候选文件里读出已保存的设置
 * @returns {object}
 */
function readStored() {
    for (const file of candidateFiles()) {
        try {
            if (fs.existsSync(file)) {
                // 必须去掉 UTF-8 BOM：用记事本或 PowerShell 的 Set-Content 保存会带上
                // BOM（EF BB BF），而 JSON.parse 遇到它直接抛 SyntaxError。
                // 那会导致用户的设置被静默丢弃、退回默认值（下载目录"自己变回去"就是这样）。
                const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
                return JSON.parse(text) || {}
            }
        } catch (e) {
            safeLog('warn', `读取设置文件失败 ${file}: ${e.message}`)
        }
    }
    return {}
}

/**
 * 把设置写到磁盘，失败时尝试其它候选位置
 * @param settings
 * @returns {boolean} 是否成功持久化
 */
function persist(settings) {
    const text = JSON.stringify(settings, null, 2)

    // 优先用已解析出来的位置
    const first = resolveActiveFile()
    const ordered = first
        ? [first, ...candidateFiles().filter(f => f !== first)]
        : candidateFiles()

    for (const file of ordered) {
        if (!isWritableDir(path.dirname(file))) {
            continue
        }
        try {
            // 直接写目标文件，不用 .tmp + rename：
            // 受限环境下多一个中间文件就多一次被拒绝的机会，
            // 而这份设置很小，写坏了最多退回默认值。
            fs.writeFileSync(file, text, 'utf8')
            if (_activeFile !== file) {
                _activeFile = file
                safeLog('info', `设置文件位置切换为: ${file}`)
            }
            _persistFailed = false
            return true
        } catch (e) {
            safeLog('warn', `写入设置失败 ${file}: ${e.message}`)
        }
    }

    _activeFile = null
    if (!_persistFailed) {
        _persistFailed = true
        safeLog('warn', '设置无法持久化，本次运行只在内存中生效')
    }
    return false
}

/**
 * 读取设置（带缓存，合并默认值）
 *
 * 永远不会抛异常：读不到就用默认值。
 * @returns {object}
 */
function getSettings() {
    if (_cache == null) {
        const stored = readStored()
        _cache = {...DEFAULTS, ...stored}
        _cache.concurrency = clampInt(_cache.concurrency, MIN_CONCURRENCY, MAX_CONCURRENCY, DEFAULTS.concurrency)
        _cache.slow = !!_cache.slow
        _cache.type = _cache.type === 'web' || _cache.type === 'pc' ? _cache.type : null
        // output 必须是有效字符串。settings.json 被手工改成 null/空串时，
        // 下游 path.join(undefined, 专辑名) 会抛 TypeError，
        // 连带把专辑列表和任务启动一起搞挂。
        if (typeof _cache.output !== 'string' || _cache.output.trim() === '') {
            _cache.output = DEFAULTS.output
        }
        if (typeof _cache.outputLabel !== 'string' || _cache.outputLabel.trim() === '') {
            _cache.outputLabel = _cache.output
        }

        // 存量配置可能指向不可写的位置（受限环境下很常见：用户以为切换成功了，
        // 结果每次下载都撞 EPERM）。启动时验证一次，不可写就退回项目内的
        // downloads 并记日志，让应用自愈。
        try {
            if (!isWritableDir(expandHome(_cache.output))) {
                const fallback = path.join(process.cwd(), 'downloads')
                if (isWritableDir(fallback)) {
                    safeLog('warn', `下载目录「${_cache.output}」不可写，已自动改用「${fallback}」`)
                    _cache.output = fallback
                    _cache.outputLabel = fallback
                }
            }
        } catch (e) {
            // 验证本身失败就算了，保留用户设置
        }
    }
    return {..._cache}
}

/**
 * 部分更新设置并尝试落盘
 *
 * 即使写盘失败也**不会抛异常** —— 内存里的值照样生效，
 * 只是重启后会丢。调用方可以通过返回值里的 persisted 判断。
 *
 * @param patch
 * @returns {object} 合并后的完整设置，额外带 persisted 字段
 */
function updateSettings(patch) {
    const next = getSettings()
    if (patch != null) {
        if (patch.output != null && String(patch.output).trim() !== '') {
            next.output = String(patch.output).trim()
            // 没显式给 outputLabel 时，显示用路径与实际路径保持一致
            if (patch.outputLabel === undefined) {
                next.outputLabel = next.output
            }
        }
        if (patch.outputLabel !== undefined) {
            const label = patch.outputLabel == null ? '' : String(patch.outputLabel).trim()
            next.outputLabel = label === '' ? next.output : label
        }
        if (patch.concurrency != null) {
            next.concurrency = clampInt(patch.concurrency, MIN_CONCURRENCY, MAX_CONCURRENCY, next.concurrency)
        }
        if (patch.slow != null) {
            next.slow = !!patch.slow
        }
        if (patch.type !== undefined) {
            next.type = patch.type === 'web' || patch.type === 'pc' ? patch.type : null
        }
    }

    delete next.persisted
    _cache = {...next}

    const persisted = persist(next)
    return {..._cache, persisted: persisted}
}

/**
 * 设置存储的运行状态，便于排查
 * @returns {{file: string|null, persisted: boolean}}
 */
function settingsStatus() {
    resolveActiveFile()
    return {file: _activeFile, persisted: !_persistFailed}
}

export {
    DEFAULTS,
    getSettings,
    updateSettings,
    settingsStatus
}
