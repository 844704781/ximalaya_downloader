import {WebSiteDownloader} from './webSiteDownloader.mjs'
import {DarwinDownloader} from './darwinDownloader.mjs'
import {AtomicInteger} from "../common/AtomicInteger.mjs";
import {CustomError} from "../common/error.mjs";
import {code} from "../common/code.mjs";
import {log} from "../common/log4jscf.mjs";


class DownloaderFactory {

  constructor() {
    this.downloaders = []
  }


  /**
   * 创建一个工厂类
   * @returns {DownloaderFactory}
   */
  static create() {
    const factory = new DownloaderFactory()
    factory.downloaders.push({
      downloader: new WebSiteDownloader(),
      executeCounter: new AtomicInteger(0)
    })
    factory.downloaders.push({
      downloader: new DarwinDownloader(),
      executeCounter: new AtomicInteger(0)
    })
    return factory
  }

  getOfflineDownloader(deviceType) {
    for (let i = 0; i < this.downloaders.length; i++) {
      const item = this.downloaders[i]

      if (item.downloader.deviceType == deviceType) {
        return item.downloader
      }
    }
    throw new Error(`暂不支持: ${type} 这种登录方式`)
  }

  async getPolicyItem(downloads) {
    for (let i = downloads.length - 1; i >= 0; i--) {
      let item = downloads[i]
      let max = Math.floor(100 / (downloads.length - i))
      let currentCount = await item.executeCounter.get();
      if (currentCount < max) {
        await item.executeCounter.increment()
        return item
      }
    }
    for (const download of downloads) {
      await download.executeCounter.set(0);
    }
    const _downloads = downloads
    if (_downloads.length == 0) {
      return null
    }
    const item = downloads[downloads.length - 1]
    return item
  }


  async getDownloader(type, needLimit = true, cb) {

    if (needLimit == false) {
      return cb(this.downloaders[0].downloader)
    }

    for (let i = 0; i < this.downloaders.length; i++) {
      const item = await this.getPolicyItem(this.downloaders)

      if (item == null) {
        break
      }
      try {

        return await cb(item.downloader)
      } catch (e) {
        if (e instanceof CustomError) {
          if (e.code = code.NO_ITEM) {
            log.info(`${item.downloader.deviceType} 剩余音频无法下载，原因:${e.message}`)
            throw e
          }
        }
        log.info(`原因:${e.message}`)
        continue
      }
    }
    log.info('无可用的下载器')
    return null

    // const delayTime = (this.delay+=2) * 60 * 1000
    // log.warn(`所有下载方式都受限了，${delayTime / 60000}分钟后会自动重试哦`)
    // await sleep(delayTime)
  }

  async hasOnlineDownloader() {
    for (let i = 0; i < this.downloaders.length; i++) {
      let item = this.downloaders[i]
      const cookies = await item.downloader._getCookies()
      if (cookies != null) {
        return true
      }
    }
    return false
  }
}

export {
  DownloaderFactory
}
