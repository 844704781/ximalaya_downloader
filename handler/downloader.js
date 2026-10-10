import {WebSiteDownloader} from '../handler/webSiteDownloader.js'
import {DarwinDownloader} from '../handler/darwinDownloader.js'
import {log} from '../common/log4jscf.js'
import {sleep} from "../common/utils.js";
import {CustomError} from '../common/error.js'

class DownloaderFactory {

    constructor() {
        this.downloaders = []
        // 记录当前 downloaders 是按哪个 type 初始化的
        this.resolvedType = null
        // acquire() 专用的按 type 缓存。与 downloaders 分开存放：
        // 否则 web / pc 两个任务交替 acquire 会反复重建列表、来回丢登录态。
        this.acquired = new Map()
    }


    /**
     * 创建一个工厂类
     * @param type
     * @returns {DownloaderFactory}
     */
    static create() {
        return new DownloaderFactory()
    }

    /**
     * 登录操作
     * @param type 要登录的目标
     * @param allowInteractiveLogin 允许走扫码登录流程（默认 true，保持 CLI 行为）。
     *        GUI 必须传 false：login() 是 while(true) 等扫码的死循环，
     *        在图形界面里会把任务永久挂住。
     * @returns
     */
    async _login(type, allowInteractiveLogin = true) {
        if (type == null) {
            this.downloaders.push({
                isLimit: false,
                downloader: new WebSiteDownloader()
            })
            this.downloaders.push({
                isLimit: false,
                downloader: new DarwinDownloader()
            })
        } else if (type == 'pc') {
            this.downloaders.push({
                isLimit: false,
                downloader: new DarwinDownloader()
            })
        } else if (type == 'web') {
            this.downloaders.push({
                isLimit: false,
                downloader: new WebSiteDownloader()
            })
        } else {
            throw new Error(`暂不支持: ${type} 这种登录方式`)
        }
        this.resolvedType = type
        for (const index in this.downloaders) {
            const item = this.downloaders[index]
            const downloader = item.downloader
            const isLogin = await downloader.isLogin()
            if (isLogin) {
                continue
            }
            if (!allowInteractiveLogin) {
                throw new Error('登录状态已失效，请到「登录」页重新登录后再继续下载')
            }
            log.info(`登录${downloader.deviceType}中...`)
            await downloader.login()
        }
    }

    /**
     * 直接取指定通道的下载器，不套用 getDownloader 的限流切换逻辑
     *
     * 为什么 GUI 必须用这个方法而不能用 getDownloader：
     * getDownloader 会把回调里抛出的**任何**异常都当成「该通道被限流」并置
     * isLimit = true。下载任务里一次用户暂停就会让 streamAudio 抛 abort 异常，
     * 于是整个通道可能被锁死，之后任务只会得到「所有下载方式都受限了」。
     *
     * GUI 在创建任务前已经通过 core/authService.js 的 resolveType() 确定了通道，
     * 这里只需要把对应的 downloader 取出来即可，不需要容错切换。
     *
     * @param type 'web' | 'pc'
     * @returns {Promise<AbstractDownloader>}
     */
    async acquire(type) {
        const key = type == null ? 'auto' : type
        const cached = this.acquired.get(key)
        if (cached != null) {
            return cached
        }
        this.downloaders = []
        this.resolvedType = null
        // 不允许交互式扫码：宁可报错让界面引导用户去登录
        await this._login(type, false)
        const downloader = this.downloaders[0].downloader
        this.acquired.set(key, downloader)
        return downloader
    }

    /**
     * 清空已缓存的下载器实例
     *
     * 登录成功 / 写入手动 Cookie / 退出登录之后必须调用，
     * 否则已建好的 downloader 还持有旧的内存 cookie 字符串继续发请求，
     * 退出登录对下载任务不生效。
     */
    invalidate() {
        this.downloaders = []
        this.resolvedType = null
        this.acquired.clear()
    }

    async _getItem(downloads) {
        for (let i = downloads.length - 1; i >= 0; i--) {
            let item = downloads[i]
            if (item.isLimit) {
                continue
            }
            let max = Math.floor(100 / (downloads.length - i))
            while (await item.executeCounter.get() < max) {
                await sleep(80)
                await item.executeCounter.increment()
                return item
            }
        }
        for (const download of downloads) {
            await download.executeCounter.set(0);
        }
        const _downloads = downloads.filter(download => download.isLimit == false)
        if (_downloads.length == 0) {
            return null
        }
        return downloads[downloads.length - 1]
    }

    /**
     * 回调中获取下载器
     * @param type
     * @param cb
     * @returns {Promise<*>}
     */
    async getDownloader(type, cb) {

        if (this.downloaders.length == 0) {
            await this._login(type)
        }
        for (let i = 0; i < this.downloaders.length; i++) {
            //const item = _getRandomItem(downloads)
            const item = this.downloaders[i]
            if (item.isLimit) {
                continue
            }
            try {
                return await cb(item.downloader)
            } catch (e) {
                // 记录原始异常：原来这里直接吞掉，导致上层无法区分
                // 「被限流」和「没有收听权限」这类完全不同的失败原因
                item.lastError = e
                // 只有配了多个通道时标记限流才有意义（可以切到另一个通道）。
                // 单通道场景下置 isLimit 只会让一次偶发网络失败把整个会话永久锁死，
                // 之后每次调用都直接报「所有下载方式都受限了」。
                if (this.downloaders.length > 1) {
                    item.isLimit = true
                }
                continue
            }
        }
        const message = "所有下载方式都受限了，可以一个小时后后再过来试试哦"
        log.error(message)
        const error = new Error(message)
        // 把每个通道的原始错误挂上去，GUI 可以据此给出可读的失败原因
        error.details = this.downloaders
            .map(item => `${item.downloader.deviceType}: ${item.lastError && item.lastError.message ? item.lastError.message : '未知错误'}`)
            .join('; ')
        error.causes = this.downloaders
            .map(item => item.lastError)
            .filter(Boolean)
        // 只配了一个通道时，原始错误通常更有价值（例如专辑下架 924、无收听权限 403），
        // 直接抛出它，避免把可读原因淹没在「所有下载方式都受限」这句通用提示里
        if (this.downloaders.length === 1 && error.causes.length === 1
            && error.causes[0] instanceof CustomError) {
            throw error.causes[0]
        }
        throw error
    }

}

export {
    DownloaderFactory
}