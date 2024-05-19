import {AbstractDownloader} from '#root/handler/abstractDownloader.js'
import {convertCookiesToString, addCookie} from '#root/common/utils.js'
import {decrypt} from "#root/handler/core/mac-decrypt.js"

/**
 * PC端登录类
 */
class DarwinDownloader extends AbstractDownloader {

    constructor() {
        super('mac');
        this.clientName = "喜马拉雅电脑版"
    }

    async _getQrCode() {
        return super.__getQrCode(this.clientName)
    }

    async _getCookies() {

        const cookies = await this.__getCookieKeyValues()
        if (cookies == null) {
            return null
        }
        addCookie(cookies, 'channel', 99)
        addCookie(cookies, '1&_device', 'darwin&24c60e8a-6a6d-51a2-af64-7613fb39a4ef&4.0.2')
        addCookie(cookies, 'v1', 'V(dDwi:*pp=zY.7#NbQ^')
        addCookie(cookies, '1&remember_me', 'y')
        const result = convertCookiesToString(cookies)
        return result
    }

    _decrypt(encodeText) {
        const url = decrypt.getSoundCryptLink(encodeText)
        return url
    }
}


async function test() {
    const downloader = new DarwinDownloader()
    if (!await downloader.isLogin()) {
        await downloader.login()
    }
    const album = await downloader.getAlbum(33476331)
    const trackPageResult = await downloader.getTracksList(33476331, 1, 1)
    const data = await downloader.download(trackPageResult.tracks[0].trackId)
    console.log(data)
}


// test()

export {
    DarwinDownloader
}