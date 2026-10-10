import crypto from 'crypto'
import zlib from 'zlib'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {iaxios} from '../../common/axioscf.js'
import {config} from '../../common/config.js'
import {CustomError} from '../../common/error.js'

const REPORT_URL = 'https://hdaa.shuzilm.cn/report?v=1.2.0&e=1&c=1&r='
const REPORT_KEY = 'm9ZtRrz:qujT8@da'

// 采集快照里混着 SDK 自己的 storage 代理和嵌套采集器，真实页面上报时不带这些，
// 原样发出去会被服务端当成采集器对象而不是设备报告
const INTERNAL_KEYS = ['_caddStorage', '_checkdetects', '_checkextensions', '_checkintacts',
    '_cidStorage', '_getmousetest', '_idstor', '_ipfStorage', '_ipflagStorage', '_pkgStorage',
    '_envalue', 'infoCallback', 'url_host']

function aesEncrypt(buffer) {
    const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(REPORT_KEY, 'utf8'), null)
    return Buffer.concat([cipher.update(buffer), cipher.final()])
}

function aesDecrypt(buffer) {
    const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(REPORT_KEY, 'utf8'), null)
    return Buffer.concat([decipher.update(buffer), decipher.final()])
}

function deviceInfoPath() {
    return path.join(config.xmd.replace('~', os.homedir()), 'device-info.json')
}

function readDeviceInfo() {
    const file = deviceInfoPath()
    if (!fs.existsSync(file)) {
        throw new CustomError(404, `缺少设备指纹文件 ${file}，付费声音无法下载，采集方法见 README`)
    }
    // 去掉 UTF-8 BOM：这个文件是用户自己采集后手工放的，
    // 用记事本保存会带上 BOM，JSON.parse 会直接抛错
    const info = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    for (const key of INTERNAL_KEYS) {
        delete info[key]
    }
    return info
}

function userAgent(deviceInfo) {
    return `Mozilla/${deviceInfo.ew1.yV2}`
}

/**
 * 生成付费声音接口所需的 xm-sign
 *
 * cadd 与 sid 必须取自同一次上报，分开缓存会拼出服务端不认的组合，所以每次都重新上报
 * @returns {Promise<{xmSign: string, userAgent: string}>}
 */
async function getXmSign() {
    const deviceInfo = readDeviceInfo()
    deviceInfo.Zf5 = Date.now()
    const ua = userAgent(deviceInfo)
    const payload = aesEncrypt(zlib.deflateSync(Buffer.from(JSON.stringify(deviceInfo), 'utf8'), {level: 6}))
    const response = await iaxios.post(REPORT_URL + crypto.randomUUID(), payload, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'User-Agent': ua
        }
    })
    if (response.status != 200) {
        throw new Error('设备指纹上报失败')
    }
    const result = JSON.parse(aesDecrypt(Buffer.from(String(response.data), 'base64')))
    if (!result.cadd || !result.sid) {
        throw new Error('设备指纹上报未返回 cadd/sid')
    }
    return {
        xmSign: `${result.cadd}&&${result.sid}`,
        userAgent: ua
    }
}

export {
    getXmSign
}
