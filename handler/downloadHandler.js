import {config} from '#root/common/config.js'
import {iaxios} from "#root/common/axioscf.js";
import {log} from '#root/common/log4jscf.js'
import {decrypt} from "#root/handler/core/www2-decrypt.js"
import {httpCookie, buildHeaders, getCookies} from "#root/common/utils.js";
import fs from "fs";
import path from 'path'
import {mkdirpSync} from 'mkdirp'
import os from "os";

/**
 * 获取音频下载链接
 */
let getBaseInfo = async (albumId, trackId, cookies) => {
    const trackQualityLevel = 1
    const url = `${config.baseUrl}/mobile-playpage/track/v3/baseInfo/${Date.now()}?device=www2&trackId=${trackId}&trackQualityLevel=${trackQualityLevel}`
    const cookie = httpCookie(cookies)
    const referer = `${config.baseUrl}/album/${albumId}`
    const headers = buildHeaders(referer, cookie)
    const response = await iaxios.get(url, {headers: headers})
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
    // return {
    //     trackInfo: response.data.trackInfo,
    //     albumInfo: response.data.albumInfo,
    //     hasAlbumRealFinished: response.data.hasAlbumRealFinished
    // };
    return response.data
}

// 获取文件后缀函数
function getFileExtension(contentType) {
    const parts = contentType.split('/');
    if (parts.length === 2) {
        return '.' + parts[1].replace("x-", "");
    }
    return '';
}

/**
 * 获取音频数据
 * @param url
 * @returns {Promise<*>}
 */
let getAudio = async (url) => {
    let response = await iaxios({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer', // 设置响应类型为流
    })
    if (response.status != 200) {
        throw new Error('网络请求失败');
    }
    if (response.data == null) {
        throw new Error('数据为空');
    }

    const contentType = response.headers['content-type'];
    const fileExtension = getFileExtension(contentType)

    return {
        buffer: response.data,
        extension: fileExtension
    }
}


/**
 * 下载
 * @param url
 * @returns {Promise<void>}
 */
let download = async (url, targetDir, trackName) => {

    if(targetDir.includes('~')){
        targetDir = targetDir.replace('~',os.homedir())
    }
    if (!fs.existsSync(targetDir)) {
        mkdirpSync(targetDir)
    }
    const data = await getAudio(url)
    const filePath = targetDir + "/" + trackName + data.extension
    fs.writeFileSync(filePath, data.buffer)
    return filePath
}


// const cookies = await getCookies()
// const baseInfo = await getBaseInfo(79787971, 698681839, cookies)
// const playUrlList = baseInfo.trackInfo.playUrlList
// const e = playUrl(playUrlList)
//
// const url = www2Decrypt({deviceType: "www2", link: e.encodeText})
// const filePath = config.archives + "/" + baseInfo.albumInfo.title
// const bookName = baseInfo.trackInfo.title
// await download(url, filePath, bookName)


export {
    getBaseInfo,
    download,
    playUrl
}