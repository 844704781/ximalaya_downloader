import {WebSiteDownloader} from './webSiteDownloader.mjs'
import {DarwinDownloader} from './darwinDownloader.mjs'
// import {log} from '../common/log4jscf.mjs'
import {sleep} from "../common/utils.mjs";
import {AtomicInteger} from "../common/AtomicInteger.mjs";

class DownloaderFactory {

    constructor() {
        this.downloaders = []
        this.delay = 60
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
                downloader: new WebSiteDownloader(),
                executeCounter: new AtomicInteger(0)

            })
            this.downloaders.push({
                isLimit: false,
                downloader: new DarwinDownloader(),
                executeCounter: new AtomicInteger(0)
            })
        } else if (type == 'pc') {
            this.downloaders.push({
                isLimit: false,
                downloader: new DarwinDownloader(),
                executeCounter: new AtomicInteger(0)
            })
        } else if (type == 'web') {
            this.downloaders.push({
                isLimit: false,
                downloader: new WebSiteDownloader(),
                executeCounter: new AtomicInteger(0)
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
          //  log.info(`登录${downloader.deviceType}中...`)
            await downloader.login()
        }
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
        const item = downloads[downloads.length - 1]
        item.isLimit = false
        return item
    }

    _getNextHoursMinutes() {
        const now = new Date();
        const minutes = now.getMinutes();
        return 60 - minutes;
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
            const item = await this._getItem(this.downloaders)
            //const item = this.downloaders[i]
            if (item == null) {
                break
            }
            if (item.isLimit) {
                continue
            }
            try {
                return await cb(item.downloader)
            } catch (e) {
                item.isLimit = true
                continue
            }
        }

        const delayTime = (this.delay+=2) * 60 * 1000
       // log.warn(`所有下载方式都受限了，${delayTime / 60000}分钟后会自动重试哦`)
        await sleep(delayTime)
    }

}

export {
    DownloaderFactory
}
