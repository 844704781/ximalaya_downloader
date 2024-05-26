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
    if (typeof cookie !== 'string') {
        throw new Error('Cookie must be string')
    }
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


function parseCookies(cookieArray) {
    const cookies = cookieArray.filter(cookieStr => cookieStr.trim() != '').map(cookieStr => {
        const cookieParts = cookieStr.split(';').map(part => part.trim());
        const cookieInfo = {};
        cookieParts.forEach(part => {
            const [key, value] = part.split('=');
            if (key === 'Max-Age' || key === 'Expires') {
                cookieInfo.expires = Date.parse(value);
            } else if (key === 'HttpOnly') {
                cookieInfo.httpOnly = true;
            } else {
                cookieInfo[key] = value;
            }
        });
        return cookieInfo;
    });

    return cookies;
}

/**
 * 将cookie文件中的格式转成请求可用的cookie格式
 * @param cookies
 * @returns {string}
 */
function convertCookiesToString(cookies) {
    const parts = [];

    cookies.forEach(cookieObj => {
        for (const [key, value] of Object.entries(cookieObj)) {
            if (key === 'expires' || key === 'Domain' || key === 'Path' || key === 'httpOnly' || key === 'secure') {
                continue; // Skip these attributes for the desired format
            }
            parts.push(`${key}=${value}`);
        }
    });

    return parts.join('; ');
}

/**
 * 在cookie文件中数据动态追加数据
 * @param _cookies
 * @param key
 * @param value
 */
function addCookie(_cookies, key, value) {
    if (_cookies.length != 0) {
        for (const cookiesKey in _cookies) {
            let item = _cookies[cookiesKey]
            for (const itemKey in item) {
                if (itemKey == key) {
                    return
                }
            }
        }
    }
    _cookies.push({
        [key]: value,
        "expires": 3863521955000,
        "Domain": "ximalaya.com",
        "Path": "/"
    })
}


export {
    sleep, httpCookie, buildHeaders, parseCookies, convertCookiesToString, addCookie
}
