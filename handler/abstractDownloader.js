import {iaxios} from '../common/axioscf.js'
import {config} from '../common/config.js'
import {log} from '../common/log4jscf.js'
import {sleep, buildHeaders, parseCookies, addCookie, convertCookiesToString} from '../common/utils.js'
import {randomUUID} from 'crypto'
import path from "path";
import fs from "fs";
import {exec, spawn} from "child_process";
import kill from "tree-kill";
import {pipeline} from 'stream/promises'
import {CustomError} from '../common/error.js'
import {getXmSign} from './core/xm-sign.js'
import os from 'os'

// www 域的 revision 接口已被 dws 风控接管，需要浏览器指纹算出的 xm-sign 才能访问，
// 命令行侧无法复刻，章节列表与播放地址改走无此校验的客户端接口
const MOBILE_BASE_URL = 'https://mobile.ximalaya.com'

/**
 * 从 content-type 推断音频文件扩展名
 *
 * _getAudio 和 streamAudio 共用。原实现内嵌在 _getAudio 里，
 * 这里提到模块级；_getAudio 内部那份保留不动，以免影响 CLI 的既有行为。
 * @param contentType
 * @returns {string} 形如 '.m4a'，无法识别时返回空串
 */
function getFileExtension(contentType) {
    if (contentType == null) {
        return ''
    }
    // 去掉 '; charset=...' 之类的参数
    const pureType = String(contentType).split(';')[0].trim()
    const parts = pureType.split('/')
    if (parts.length === 2) {
        return '.' + parts[1].replace('x-', '')
    }
    return ''
}

/**
 * 下载抽象类
 */
class AbstractDownloader {
    constructor(deviceType, playDeviceType) {
        if (this.constructor == AbstractDownloader) {
            throw new Error("抽象类不能被实例化")
        }
        this.deviceType = deviceType
        // 付费声音接口按这个值决定密文用哪套算法加密，与 cookie 用的 deviceType 不是一回事
        this.playDeviceType = playDeviceType
        this.pcDeviceId = randomUUID()
        // config.json 里缺 xmd 字段时要有兜底，否则构造函数直接抛 TypeError，
        // 登录面板会整个不可用
        const xmdHome = String(config.xmd || '~/.xmd').replace('~', os.homedir())
        this.cookiePath = path.join(xmdHome, `${deviceType}-cookies.json`)
        this.qrCodePath = path.join(xmdHome, `${deviceType}-qrcode.png`);
        this.albumId = null
        this.cookies = null

    }

    /**
     * 获取可用的cookies
     * @private
     */
    _getCookies() {
        throw new Error("抽象方法，子类需要实现")
    }

    /**
     * 获取 cookies json格式
     * @returns {Promise<unknown>}
     * @private
     */
    async __readCookies() {
        const readFile = () => {
            return new Promise((resolve) => {
                return fs.readFile(this.cookiePath, (err, data) => {
                    if (err) {
                        return resolve(null)
                    }
                    return resolve(JSON.parse(String(data)))
                })
            })
        }
        return await readFile()
    }


    /**
     * 打开登录二维码
     * @param qrCodePath
     * @returns {ChildProcessWithoutNullStreams}
     */
    _openQrCode() {
        const platform = process.platform;
        let command;

        if (platform === 'win32') {
            command = `start ${this.qrCodePath}`;
        } else if (platform === 'darwin') {
            command = `open ${this.qrCodePath}`;
        } else if (platform === 'linux') {
            command = `xdg-open ${this.qrCodePath}`;
        }

        const openProcess = spawn(command, [], {shell: true});
        return openProcess;
    }

    /**
     * 关闭登录二维码
     * @param openProcess
     * @returns {Promise<unknown>}
     */
    _killQrCode(openProcess) {
        return new Promise((resolve, reject) => {
            if (process.platform == 'darwin') {
                exec(`osascript -e 'quit app "Preview"'`, (err) => {
                    if (err) {
                        log.error('Error closing the image viewer:', err);
                        return reject(err)
                    }
                    return resolve()
                });
            } else if (process.platform === 'win32') {
                // 使用 taskkill 命令终止进程
                exec(`taskkill /IM PhotosApp.exe /F`, (err) => {
                    if (err) {
                        log.error('Error closing the image viewer:', err);
                        return reject(err)
                    }
                    return resolve()
                });
            } else {
                kill(openProcess.pid, 'SIGKILL', (err) => {
                    if (err) {
                        log.error('Error closing the image viewer:', err);
                        return reject(err)
                    }
                    return resolve()
                })
            }
        })
    }

    /**
     * 获取登录二维码抽象方法
     * @returns {Promise<void>}
     * @private
     */
    async _getQrCode() {
        throw new Error("抽象方法，子类需要实现")
    }

    /**
     * 获取登录二维码
     * @returns {Promise<{qrId:int,img:str}>}
     */
    async __getQrCode(clientName) {
        const url = `${config.loginBaseUrl}/web/qrCode/gen?level=L&source=${encodeURIComponent(clientName)}`;
        const response = await iaxios.get(url)

        if (response.status != 200) {
            throw new Error('网络请求失败');
        }
        if (response.data == null) {
            throw new Error('数据为空');
        }
        if (response.data.ret != 0) {
            log.error("喜马拉雅内部异常", response.data)
            throw new Error("喜马拉雅内部异常")
        }
        return {
            qrId: response.data.qrId,
            img: response.data.img
        }; // 将响应数据解析为 JSON
    }


    /**
     * 登录方法
     * @returns {Promise<AbstractDownloader>}
     */
    async login() {
        // TODO 如果config中没有的cookies的话，就扫码获取
        let cookies = null
        if (config.cookie != null
            && config.cookie[this.deviceType] != null
            && config.cookie[this.deviceType]['serverMode']) {
            if (config.cookie[this.deviceType].value == null || config.cookie[this.deviceType].value.trim() == '') {
                throw new CustomError(`当前为非扫码模式，请在config.json中手动配置cookie.${this.deviceType}.value的值`)
            }
            cookies = parseCookies(config.cookie[this.deviceType].value.split(';'))
        } else {
            const qrCode = await this._getQrCode()
            const qrCodeBuffer = Buffer.from(qrCode.img, 'base64');

            fs.writeFileSync(this.qrCodePath, qrCodeBuffer);

            log.info(this.deviceType, "请使用喜马拉雅APP扫描登录二维码")
            const openProcess = this._openQrCode();
            //等待扫码
            log.info(this.deviceType, "等待登录结果...")
            while (true) {
                const loginResult = await this._getLoginResult(qrCode.qrId)
                if (loginResult.isSuccess) {
                    cookies = loginResult.cookies
                    break
                }
                await sleep(2000)
            }

            //处理登录成功
            try {
                await this._killQrCode(openProcess);
            } catch (e) {
                log.debug(e)
                log.info(this.deviceType, "扫码已成功，可自行关闭图片程序")
            }
        }
        fs.writeFileSync(this.cookiePath, Buffer.from(JSON.stringify(cookies)))
        log.info(this.deviceType, "登录成功")
        const user = await this._getCurrentUser()
        this._checkUser(user, false)
        return this
    }

    /**
     * 根据qrId，获取登录结果
     * @param qrId
     * @returns {Promise<{cookies: JSONObject, isSuccess: boolean}|{isSuccess: boolean}>}
     */
    async _getLoginResult(qrId) {
        const url = `${config.loginBaseUrl}/web/qrCode/check/${qrId}/${Date.now()}`;
        const response = await iaxios.get(url)

        if (response.status != 200) {
            throw new Error('网络请求失败');
        }
        if (response.data == null) {
            throw new Error('数据为空');
        }
        let isSuccess = false
        if (response.data.ret != 0) {
            return {
                isSuccess
            }
        }
        const cookieHeaders = response.headers['set-cookie'];
        const cookies = parseCookies(cookieHeaders)
        return {
            isSuccess: true,
            cookies: cookies
        };
    }

    async _getCurrentUser() {
        const url = `${config.baseUrl}/revision/main/getCurrentUser`
        const cookie = await this._getCookies()
        const headers = buildHeaders(config.baseUrl, cookie)
        const response = await iaxios.get(url, {headers: headers})
        if (response.status != 200) {
            throw new Error('网络请求失败');
        }
        if (response.data == null) {
            throw new Error('数据为空');
        }
        if (response.data.ret == 401) {
            log.error(response.data.msg)
            return null
        }
        if (response.data.ret != 200) {
            log.error("喜马拉雅内部异常", response.data)
            throw new Error("喜马拉雅内部异常")
        }
        return response.data.data; // 将响应数据解析为 JSON
    }

    /**
     * 检查用户账号信息
     * @param user
     */
    _checkUser(user, single) {
        if (user.isLoginBan) {
            log.warn("该用户被禁止登录")
        }
        if (!single) {
            log.info("用户名称:", user.nickname)
            log.info("是否vip:", user.isVip ? "是" : "否")
            log.info("vip剩余天数:", user.vipExpireTime)
            log.info("是否被检测为机器人:", "否")
        }
        if (user.isRobot) {
            log.warn("警告，被系统检测为机器人，请暂停下载稍后重试")
        }
    }

    async isLogin() {
        const cookies = await this._getCookies()
        if (cookies == null) {
            return false
        }
        const user = await this._getCurrentUser(cookies)
        if (user == null) {
            return false
        }
        return true
    }

    /**
     * 获取专辑简况
     * @param albumId
     * @param cookies
     * @returns {Promise<*>}
     */
    async _getAlbumSimple(albumId, cookie) {
        const url = `${config.baseUrl}/revision/album/v1/simple?albumId=${albumId}`
        const referer = `${config.baseUrl}/album/${albumId}`
        const headers = buildHeaders(referer, cookie)
        const response = await iaxios.get(url, {headers: headers})
        if (response.status != 200) {
            throw new Error('网络请求失败');
        }
        if (response.data == null) {
            throw new Error('数据为空');
        }
        if (response.data.ret != 200) {
            log.error("喜马拉雅内部异常", response.data)
            throw new Error("喜马拉雅内部异常")
        }
        return response.data.data;
    }


    /**
     * 获取专辑信息
     * @param albumId
     * @param cookies
     * @returns {Promise<*>}
     */
    async _getAlbumInfo(albumId, cookie) {
        const url = `${config.baseUrl}/tdk-web/seo/search/albumInfo?albumId=${albumId}`
        const referer = `${config.baseUrl}/album/${albumId}`
        const headers = buildHeaders(referer, cookie)
        const response = await iaxios.get(url, {headers: headers})
        if (response.status != 200) {
            throw new Error('网络请求失败');
        }
        if (response.data == null) {
            throw new Error('数据为空');
        }
        if (response.data.ret != 200) {
            log.error("喜马拉雅内部异常", response.data)
            throw new Error("喜马拉雅内部异常")
        }
        return response.data.data;
    }

    /**
     * 获取专辑详情
     * @param albumId
     * @returns {Promise<{trackCount, albumTitle, isFinished}>}
     */
    async getAlbum(albumId) {
        if (albumId == null) {
            throw new Error("albumId不能为空")
        }
        const simple = await this._getAlbumSimple(albumId, await this._getCookies())
        const info = await this._getAlbumInfo(albumId, await this._getCookies())
        const book = await this.getTracksList(albumId, 1, 1)
        return {
            albumId: albumId,
            albumTitle: simple['albumPageMainInfo']['albumTitle'],
            isFinished: simple['albumPageMainInfo']['isFinished'],
            cover: "https:" + simple['albumPageMainInfo']['cover'],
            trackCount: book.trackTotalCount
        }
    }

    /**
     * 获取章节列表
     * @param albumId
     * @param pageNum
     * @param pageSize
     * @returns {Promise<*>}
     */
    async getTracksList(albumId, pageNum, pageSize) {
        const url = `${MOBILE_BASE_URL}/mobile/v1/album/track?albumId=${albumId}&device=android&isAsc=true&pageId=${pageNum}&pageSize=${pageSize}&source=0`
        const referer = `${config.baseUrl}/album/${albumId}`
        const headers = buildHeaders(referer, await this._getCookies())
        const response = await iaxios.get(url, {headers: headers})
        if (response.status != 200) {
            throw new Error('网络请求失败')
        }
        if (response.data == null) {
            throw new Error('数据为空')
        }
        if (response.data.ret == 924) {
            log.error(`专辑${albumId}在客户端渠道不可用，换个专辑试试`, response.data)
            throw new CustomError(924, "该专辑已下架或不支持客户端渠道")
        }
        if (response.data.ret != 0) {
            log.error("喜马拉雅内部异常", response.data)
            throw new Error("喜马拉雅内部异常")
        }
        const data = response.data.data
        return {
            trackTotalCount: data.totalCount,
            tracks: data.list.map(track => ({trackId: track.trackId, title: track.title}))
        }
    }

    /**
     * 获取音频数据
     * @param trackId
     * @returns {Promise<{trackTitle, playUrlList}>}
     * @private
     */
    async _getBaseInfo(trackId) {
        const url = `${MOBILE_BASE_URL}/mobile/v1/track/baseInfo/${Date.now()}?device=pc&trackId=${trackId}`
        const referer = `${config.baseUrl}/album/${trackId}`
        const headers = buildHeaders(referer, await this._getCookies())
        const response = await iaxios.get(url, {headers: headers})
        if (response.status != 200) {
            throw new Error('网络请求失败');
        }
        if (response.data == null) {
            throw new Error('数据为空');
        }
        if (response.data.ret == 999 || response.data.ret == 1001) {
            log.error(`${this.deviceType}端喜马拉雅接口内部异常`, response.data)
            throw new CustomError(999, `${this.deviceType}端速率限制`)
        }
        if (response.data.ret != 0) {
            log.error(`${this.deviceType}端喜马拉雅接口内部异常`, response.data)
            throw new Error("喜马拉雅内部异常")
        }
        const info = response.data
        const playUrl = info.playPathHq || info.downloadUrl || info.playUrl64 || info.playUrl32
        if (playUrl == null || playUrl == '') {
            // 付费声音这里只有时长和体积，地址要另走带签名的加密接口
            return {
                url: await this._getPaidPlayUrl(trackId),
                trackTitle: info.title
            }
        }
        return {
            url: playUrl,
            trackTitle: info.title
        }
    }

    /**
     * 付费声音专用 cookie：登录态 + 客户端设备身份
     *
     * 这几个设备 cookie 不能并到 _getCookies，章节列表接口按 device=android 请求，
     * 带上 win32 的设备标识会被判成参数矛盾直接拒掉
     * @returns {Promise<string>}
     */
    async _getPaidCookies() {
        const cookies = await this.__readCookies()
        addCookie(cookies, 'install_id', this.pcDeviceId)
        addCookie(cookies, '1&_device', `win32&${this.pcDeviceId}&4.0.14`)
        addCookie(cookies, 'channel', '99&100001')
        return convertCookiesToString(cookies)
    }

    /**
     * 获取付费声音的播放地址
     * @param trackId
     * @returns {Promise<string>}
     */
    async _getPaidPlayUrl(trackId) {
        const {xmSign, userAgent} = await getXmSign()
        const url = `${config.baseUrl}/mobile-playpage/track/v3/baseInfo/${Date.now()}?device=${this.playDeviceType}&trackId=${trackId}&trackQualityLevel=1`
        const headers = buildHeaders(`${config.baseUrl}/`, await this._getPaidCookies())
        headers['User-Agent'] = userAgent
        headers['Origin'] = config.baseUrl
        headers['xm-sign'] = xmSign
        const response = await iaxios.get(url, {headers: headers})
        if (response.status != 200) {
            throw new Error('网络请求失败')
        }
        if (response.data == null) {
            throw new Error('数据为空')
        }
        if (response.data.ret != 0) {
            log.error(`${this.deviceType}端付费声音接口异常`, response.data)
            throw new CustomError(999, `${this.deviceType}端被风控或没有该声音的收听权限`)
        }
        const playUrlList = response.data.trackInfo.playUrlList
        if (playUrlList == null || playUrlList.length == 0) {
            throw new CustomError(403, `没有该声音的收听权限，需要VIP或已购买(trackId:${trackId})`)
        }
        return this._decrypt(this._playUrl(playUrlList).encodeText)
    }

    /**
     * 获取音频数据
     * @param url
     * @returns {Promise<*>}
     */
    async _getAudio(url) {
        if (url == null) {
            throw new Error("Invalid url")
        }
        let response = await iaxios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
        })
        if (response.status != 200) {
            throw new Error('网络请求失败');
        }
        if (response.data == null) {
            throw new Error('数据为空');
        }

        // 获取文件后缀函数
        function getFileExtension(contentType) {
            const parts = contentType.split('/');
            if (parts.length === 2) {
                return '.' + parts[1].replace("x-", "");
            }
            return '';
        }

        const contentType = response.headers['content-type'];
        const fileExtension = getFileExtension(contentType)

        return {
            buffer: response.data,
            extension: fileExtension
        }
    }

    /**
     * 获取解密参数
     * @param t
     * @returns {*}
     */
    _playUrl = (t) => {
        let e, r = {}, n = 1;
        return r.mediaType && t.some((function (t) {
                return t.type.indexOf(r.mediaType) >= 0 && (e = t.url,
                    !0)
            }
        )),
        e || (e = t[0].url),
        t && t.length && (n = t[0].qualityLevel),
            {
                qualityLevel: n,
                encodeText: e
            }
    }

    /**
     * 解密
     * @param encodeText
     * @return url
     */
    _decrypt(encodeText) {
        throw new Error("抽象方法，子类需要实现")
    }


    /**
     * 获取章节的播放地址（公开封装，供 GUI 侧调用）
     * @param trackId
     * @returns {Promise<{url: string, trackTitle: string}>}
     */
    async getPlayUrl(trackId) {
        return await this._getBaseInfo(trackId)
    }

    /**
     * 流式下载音频到临时文件，支持随时中止
     *
     * 与 _getAudio 的区别：_getAudio 用 responseType:'arraybuffer' 把整个文件一次性读进内存，
     * 没有中间态，无法暂停。本方法把响应作为流写入磁盘，可通过 signal 中止。
     *
     * 注意：这是「简化版」下载，不使用 HTTP Range 断点续传。
     * 被中止时由调用方删除 partPath，恢复时该章节从头重新下载。
     *
     * @param url 播放地址
     * @param signal AbortController.signal，用于暂停/取消
     * @param partPath 临时文件路径（写完后由调用方 rename 成最终文件名）
     * @param onStart ({extension, total}) => void 收到响应头时回调，此时才知道类型和总大小
     * @param onProgress ({received, total}) => void
     * @returns {Promise<{received: number, total: number, extension: string}>}
     */
    async streamAudio(url, {signal, partPath, onStart, onProgress}) {
        if (url == null || url === '') {
            throw new Error('播放地址为空')
        }
        if (partPath == null || partPath === '') {
            throw new Error('临时文件路径为空')
        }
        const response = await iaxios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            signal: signal
        })
        if (response.status !== 200) {
            throw new Error(`网络请求失败: HTTP ${response.status}`)
        }
        if (response.data == null) {
            throw new Error('数据为空')
        }

        const total = Number(response.headers['content-length'] || 0)
        const extension = getFileExtension(response.headers['content-type'])
        if (typeof onStart === 'function') {
            onStart({extension: extension, total: total})
        }

        let received = 0
        response.data.on('data', chunk => {
            received += chunk.length
            if (typeof onProgress === 'function') {
                onProgress({received: received, total: total})
            }
        })

        // 注意：pipeline 在 destination 出错时并不保证销毁 source。
        // 磁盘写满（ENOSPC）这类情况下如果不主动销毁，响应流会继续收数据，
        // socket 与 'data' 监听器滞留，之后 socket 报错就变成 unhandled 'error' event，
        // 而 process.on('uncaughtException') 兜不住它，主进程会直接崩溃。
        try {
            await pipeline(response.data, fs.createWriteStream(partPath))
        } catch (e) {
            response.data.destroy()
            throw e
        }
        return {received: received, total: total, extension: extension}
    }

    /**
     * 把内部 user 对象裁剪成可以安全传给渲染进程的形状
     * @param user
     * @returns {object|null}
     */
    _publicUser(user) {
        if (user == null) {
            return null
        }
        return {
            nickname: user.nickname,
            isVip: !!user.isVip,
            vipExpireTime: user.vipExpireTime,
            isRobot: !!user.isRobot,
            isLoginBan: !!user.isLoginBan
        }
    }

    /**
     * 获取登录二维码（不阻塞、不打开系统看图程序）
     *
     * 供 GUI 使用：前端拿到 base64 图片自己渲染，然后轮询 checkLogin。
     * 原来的 login() 会写 png 并调用系统看图软件、然后 while(true) 死循环等待，
     * 那套逻辑只适合命令行，保留给 CLI 使用。
     * @returns {Promise<{qrId: string, img: string}>}
     */
    async requestQrCode() {
        const qrCode = await this._getQrCode()
        if (qrCode == null || qrCode.img == null) {
            throw new Error('获取登录二维码失败')
        }
        return {
            qrId: qrCode.qrId,
            img: `data:image/png;base64,${qrCode.img}`
        }
    }

    /**
     * 查询一次扫码结果（供前端每 2 秒轮询）
     * @param qrId requestQrCode 返回的 qrId
     * @returns {Promise<{ok: boolean, user: object|null}>}
     */
    async checkLogin(qrId) {
        const loginResult = await this._getLoginResult(qrId)
        if (!loginResult.isSuccess) {
            return {ok: false, user: null}
        }
        fs.mkdirSync(path.dirname(this.cookiePath), {recursive: true})
        fs.writeFileSync(this.cookiePath, Buffer.from(JSON.stringify(loginResult.cookies)))
        // 清掉 cookie 缓存，让后续请求重新读取刚写入的文件
        this.cookies = null
        log.info(this.deviceType, "登录成功")

        let user = null
        try {
            user = await this._getCurrentUser()
        } catch (e) {
            // 扫码已经成功，拿不到用户信息不该让整个登录失败
            log.warn(`${this.deviceType} 登录成功但获取用户信息失败:`, e)
        }
        return {ok: true, user: this._publicUser(user)}
    }

    /**
     * 查询登录状态（不会抛异常，供 GUI 启动时调用）
     *
     * 不能直接用 isLogin()：它没有 try/catch，网络抖动会把整个启动流程炸掉。
     * @returns {Promise<{logged: boolean, user?: object, error?: string}>}
     */
    async getLoginState() {
        try {
            const cookies = await this._getCookies()
            if (cookies == null) {
                return {logged: false}
            }
            const user = await this._getCurrentUser()
            if (user == null) {
                return {logged: false}
            }
            return {logged: true, user: this._publicUser(user)}
        } catch (e) {
            log.warn(`${this.deviceType} 登录态检查失败:`, e)
            return {logged: false, error: String(e && e.message ? e.message : e)}
        }
    }

    /**
     * 退出登录：删除本地 cookie 文件
     */
    async logout() {
        this.cookies = null
        try {
            fs.unlinkSync(this.cookiePath)
        } catch (e) {
            // cookie 文件本来就不存在，忽略
        }
        return {ok: true}
    }

    /**
     * 下载音频
     * @param trackId
     * @returns {Promise<buffer, fileExtension>}
     */
    async download(trackId) {
        let user = await this._getCurrentUser()
        await this._checkUser(user, true)
        const baseInfo = await this._getBaseInfo(trackId)
        const data = await this._getAudio(baseInfo.url)
        return data
    }


}


export {
    AbstractDownloader
}


