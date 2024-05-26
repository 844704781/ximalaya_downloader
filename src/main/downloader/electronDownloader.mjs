import {WebSiteDownloader} from './webSiteDownloader.mjs'
import {DarwinDownloader} from './darwinDownloader.mjs'


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
    })
    factory.downloaders.push({
      downloader: new DarwinDownloader(),
    })
    return factory
  }

  getDownloader(deviceType) {
    for (let i = 0; i < this.downloaders.length; i++) {
      const item = this.downloaders[i]

      if (item.downloader.deviceType == deviceType) {
        return item.downloader
      }
    }
    throw new Error(`暂不支持: ${type} 这种登录方式`)
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
