import {log} from '#root/common/log4jscf.js'
import {httpCookie, buildHeaders} from '#root/common/utils.js'
import {config} from '#root/common/config.js'
import {iaxios} from '#root/common/axioscf.js'

/**
 * 获取章节
 */
let _getTracksList = async (albumId, cookies, pageNum, pageSize) => {
    const url = `${config.baseUrl}/revision/album/v1/getTracksList?albumId=${albumId}&pageNum=${pageNum}&pageSize=${pageSize}`
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
    if (response.data.ret != 200) {
        log.error("喜马拉雅内部异常", response.data)
        throw new Error("喜马拉雅内部异常")
    }
    return response.data.data;
}

//
// const cookies = await getCookies()
// getTracksList(7235715, cookies)

export const getTracksList = _getTracksList