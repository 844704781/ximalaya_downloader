import fs from "fs";
import {projectRoot} from "#root/settings.js";


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function httpCookie(cookies) {
    return cookies.cookies.map(cookie => {
        if (cookie.name == 'web_login')
            cookie.value = Date.now()
        if (cookie.name == 'Hm_lpvt_4a7d8ec50cfd6af753c4f8aee3425070')
            cookie.value = Math.floor(Date.now() / 1000)
        return `${cookie.name}=${cookie.value}`
    }).join('; ');
}

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const UA = '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"'
const PLATFORM = '"macOS"'


/**
 *
 * @param referer 'https://www.ximalaya.com'
 */
function buildHeaders(referer, cookie) {
    const headers = {
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Cookie': cookie,
        'Pragma': 'no-cache',
        'Referer': referer,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': USER_AGENT,
        'sec-ch-ua': UA,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': PLATFORM
    };
    return headers
}

/**
 * 获取本地cookies
 * @returns {Promise<unknown>}
 */
async function getCookies() {
    const COOKIE_PATH = `${projectRoot}/cookies.json`

    let cookies = await new Promise((resolve) => {
        return fs.readFile(COOKIE_PATH, (err, data) => {
            if (err) {
                return resolve(null)
            }
            return resolve(JSON.parse(String(data)))
        })
    })
    return cookies;
}

export {
    sleep, httpCookie, buildHeaders, getCookies
}