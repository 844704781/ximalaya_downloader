/**
 * 文件名清洗
 *
 * 从 xmd.js 抽出，供 CLI 与 GUI 共用，保证两边落盘的文件名规则一致。
 */

// 文件路径非法字符（与 xmd.js 中的原始正则保持一致，斜杠显式转义）
const PATH_CHARS_REGEX = /[<>:"\/\\|?*\x00-\x1F]/g

// Windows 保留设备名，作为文件名会导致创建失败
const RESERVED_NAMES = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
])

// 单个文件名片段长度上限
const MAX_NAME_LENGTH = 120

/**
 * Windows 默认的 MAX_PATH 是 260。
 * 超过之后资源管理器打不开、部分播放器也读不到，而且报错信息完全看不出是长度问题。
 *
 * 喜马拉雅的专辑名和章节标题都很长（标题里往往还重复一遍专辑名），
 * 所以只限制单个片段是不够的，必须限制整条路径。
 */
const MAX_DIR_PATH = 200
const MAX_FILE_PATH = 240

/**
 * 清理字符串，使其可以安全作为文件/目录名
 * @param str
 * @returns {string}
 */
function cleanedStr(str) {
    if (str == null) {
        return '_'
    }
    let name = String(str).replace(PATH_CHARS_REGEX, '_')
    // Windows 不允许文件名以点或空格结尾
    name = name.replace(/[. ]+$/, '').trim()
    if (name === '') {
        name = '_'
    }
    if (RESERVED_NAMES.has(name.toUpperCase())) {
        name = `_${name}`
    }
    if (name.length > MAX_NAME_LENGTH) {
        name = name.slice(0, MAX_NAME_LENGTH)
    }
    return name
}

/**
 * 章节文件名（不含扩展名）
 *
 * 注意：格式与 CLI 的 xmd.js 保持一致（`序号.标题`），
 * 这样 CLI 和 GUI 下载同一个专辑时不会产生两套命名。
 * @param num 章节序号
 * @param title 章节标题
 * @returns {string}
 */
function buildTrackBaseName(num, title) {
    return `${num}.${cleanedStr(title)}`
}

/**
 * 按整条目录路径的长度上限裁剪专辑目录名
 *
 * @param name 清洗过的专辑名
 * @param rootPath 下载根目录的绝对路径
 * @param maxTotal 目录路径允许的最大长度
 * @returns {string}
 */
function fitDirName(name, rootPath, maxTotal = MAX_DIR_PATH) {
    const budget = maxTotal - String(rootPath || '').length - 1
    if (budget <= 8) {
        return name.slice(0, 8)
    }
    return name.length <= budget ? name : name.slice(0, budget)
}

/**
 * 按整条文件路径的长度上限裁剪文件名
 *
 * 超长时截断的是标题尾部；序号和开头的标题片段都会保留，
 * 便于按名字排序和辨认。
 *
 * @param baseName 不含扩展名的文件名
 * @param dirPath 所在目录的绝对路径
 * @param extension 扩展名（含点），可为空
 * @param maxTotal 文件路径允许的最大长度
 * @returns {string}
 */
function fitFileName(baseName, dirPath, extension, maxTotal = MAX_FILE_PATH) {
    const ext = extension || ''
    const budget = maxTotal - String(dirPath || '').length - 1 - ext.length
    if (budget <= 12) {
        return baseName.slice(0, 12)
    }
    return baseName.length <= budget ? baseName : baseName.slice(0, budget)
}

export {
    cleanedStr,
    buildTrackBaseName,
    fitDirName,
    fitFileName
}
