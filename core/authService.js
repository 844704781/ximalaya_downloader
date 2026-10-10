import fs from 'node:fs'
import path from 'node:path'
import {WebSiteDownloader} from '../handler/webSiteDownloader.js'
import {DarwinDownloader} from '../handler/darwinDownloader.js'
import {getSettings} from './settingsStore.js'
import {ensureDir} from './paths.js'
import {log} from '../common/log4jscf.js'

/**
 * 登录通道服务
 *
 * 两个通道各自独立：
 *  - web -> WebSiteDownloader，cookie 文件 ~/.xmd/www2-cookies.json
 *  - pc  -> DarwinDownloader，cookie 文件 ~/.xmd/mac-cookies.json
 * 用户可以只登录其中一个，所以状态要分开上报。
 */

const CHANNELS = {
    web: {
        label: '网页端',
        create: () => new WebSiteDownloader()
    },
    pc: {
        label: '电脑端',
        create: () => new DarwinDownloader()
    }
}

/**
 * 每个通道只保留一个实例。
 *
 * _getCookies() 内部有 this.cookies 缓存，反复 new 会每次都重新计算 wfp 等
 * 指纹 cookie（要打网络请求），既慢又容易触发风控。
 */
const instances = new Map()

/**
 * 取通道实例
 * @param type 'web' | 'pc'
 */
function instance(type) {
    if (CHANNELS[type] == null) {
        throw new Error(`未知的登录通道: ${type}`)
    }
    if (!instances.has(type)) {
        instances.set(type, CHANNELS[type].create())
    }
    return instances.get(type)
}

/**
 * 查询两个通道的登录状态
 *
 * 单个通道出错不影响另一个通道，也不会抛异常给调用方。
 * @returns {Promise<object>}
 */
async function status() {
    const result = {}
    for (const type of Object.keys(CHANNELS)) {
        const label = CHANNELS[type].label
        try {
            const state = await instance(type).getLoginState()
            result[type] = {
                logged: !!state.logged,
                label: label,
                ...(state.user ? {user: state.user} : {}),
                ...(state.error ? {error: state.error} : {})
            }
        } catch (e) {
            log.warn(`查询 ${label} 登录状态失败:`, e)
            result[type] = {
                logged: false,
                label: label,
                error: String(e && e.message ? e.message : e)
            }
        }
    }
    return result
}

/**
 * 取登录二维码
 * @param type
 * @returns {Promise<{qrId: string, img: string}>}
 */
async function qrcode(type) {
    return await instance(type).requestQrCode()
}

/**
 * 查询一次扫码结果
 * @param type
 * @param qrId
 * @returns {Promise<{ok: boolean, user: object|null}>}
 */
async function check(type, qrId) {
    if (qrId == null || qrId === '') {
        throw new Error('qrId 不能为空')
    }
    const result = await instance(type).checkLogin(qrId)
    if (result.ok) {
        // cookie 变了，清掉登录态相关的缓存（实例内部的 this.cookies 已由 checkLogin 清空）
        log.info(`${CHANNELS[type].label} 登录成功`)
    }
    return result
}

/**
 * 保存用户手动粘贴的 Cookie
 *
 * 格式与扫码登录落盘的一致：JSON 数组，每个元素形如 {"name": "value"}。
 * 对应 abstractDownloader 里 __readCookies() 的读取假设。
 * @param type
 * @param raw 形如 "a=1; b=2"
 * @returns {Promise<{ok: boolean, count: number}>}
 */
async function saveCookie(type, raw) {
    const downloader = instance(type)
    const text = String(raw == null ? '' : raw).trim()
    if (text === '') {
        throw new Error('Cookie 内容不能为空')
    }
    const list = text
        .split(';')
        .map(part => part.trim())
        .filter(part => part !== '')
        .map(pair => {
            const index = pair.indexOf('=')
            if (index <= 0) {
                return null
            }
            const key = pair.slice(0, index).trim()
            const value = pair.slice(index + 1).trim()
            if (key === '') {
                return null
            }
            return {[key]: value}
        })
        .filter(Boolean)

    if (list.length === 0) {
        throw new Error('Cookie 格式不正确，应形如 name1=value1; name2=value2')
    }

    ensureDir(path.dirname(downloader.cookiePath))
    fs.writeFileSync(downloader.cookiePath, Buffer.from(JSON.stringify(list)))
    // 清缓存，让下一次请求重新读取刚写入的文件
    downloader.cookies = null
    log.info(`${CHANNELS[type].label} 已写入手动 Cookie，共 ${list.length} 项`)
    return {ok: true, count: list.length}
}

/**
 * 退出登录
 * @param type
 * @returns {Promise<{ok: boolean}>}
 */
async function logout(type) {
    return await instance(type).logout()
}

/**
 * 返回当前已登录的通道，网页端优先
 * @returns {Promise<Array<'web'|'pc'>>}
 */
async function loggedInTypes() {
    const state = await status()
    const list = []
    if (state.web && state.web.logged) {
        list.push('web')
    }
    if (state.pc && state.pc.logged) {
        list.push('pc')
    }
    return list
}

/**
 * 决定本次下载优先使用哪个通道
 *
 * 用户指定的通道如果没登录就退回已登录列表里的第一个；一个都没登录就明确报错，
 * 绝不落到 DownloaderFactory._login() 的扫码死循环上去。
 * @returns {Promise<'web'|'pc'>}
 */
async function resolveType() {
    const candidates = await typeCandidates()
    return candidates[0]
}

/**
 * 生成通道尝试顺序：用户指定的通道排最前，然后是其余已登录通道
 *
 * 为什么需要一串而不是一个：
 * 「电脑端」通道在查章节列表时会被服务端拒绝
 * （getTracksList 请求的是 device=android 的客户端接口，而电脑端带的是
 *  1&_device=darwin&… 这套 mac 设备标识，服务端判定参数矛盾，返回 ret -1），
 * 原项目 DownloaderFactory.getDownloader 本来就有「一个通道失败就换另一个」的容错，
 * 这里把这个能力补回来 —— 用户选错通道不应该导致完全下不了。
 *
 * @returns {Promise<Array<'web'|'pc'>>}
 */
async function typeCandidates() {
    const logged = await loggedInTypes()
    if (logged.length === 0) {
        throw new Error('尚未登录喜马拉雅，请先到「登录」页扫码登录或手动填写 Cookie')
    }
    const preferred = getSettings().type
    const list = []
    if (preferred != null && logged.includes(preferred)) {
        list.push(preferred)
    }
    for (const type of logged) {
        if (!list.includes(type)) {
            list.push(type)
        }
    }
    return list
}

export {
    CHANNELS,
    instance,
    status,
    qrcode,
    check,
    saveCookie,
    logout,
    loggedInTypes,
    resolveType,
    typeCandidates
}
