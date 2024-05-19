import {WebSiteDownloader} from '#root/handler/webSiteDownloader.js'
import {DarwinDownloader} from '#root/handler/DarwinDownloader.js'
import {log} from '#root/common/log4jscf.js'
import {CustomError} from '#root/common/error.js'

class DownloaderFactory {

    constructor() {
        this.downloaders = []
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
     * @param target 当前对象
     * @param type 要登录的目标
     * @returns
     */
    async _login(type) {
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
        for (const index in this.downloaders) {
            const item = this.downloaders[index]
            const downloader = item.downloader
            const isLogin = await downloader.isLogin()
            if (isLogin) {
                continue
            }
            log.info(`登录${type}中...`)
            await downloader.login()
        }
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
        for (const index in this.downloaders) {
            const item = this.downloaders[index]
            if (item.isLimit) {
                continue
            }
            try {
                return cb(item.downloader)
            } catch (e) {
                item.isLimit = true
                continue
            }
        }
        throw new Error("所有下载方式都受限了，明天再试哦")
    }

}

export {
    DownloaderFactory
}