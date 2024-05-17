import {projectRoot} from "#root/settings.js";
import {log} from '#root/common/log4jscf.js'
import {sleep, httpCookie, buildHeaders, getCookies} from '#root/common/utils.js'
import {config} from '#root/common/config.js'
import {chromium, devices} from 'playwright';
import {iaxios} from '#root/common/axioscf.js'
import fs from 'fs'
import {exec, spawn} from 'child_process'
import path from 'path'
import kill from 'tree-kill'
import fakeUA from 'fake-ua'


const COOKIE_PATH = `${projectRoot}/cookies.json`

/**
 * 打开登录二维码
 * @param qrCodePath
 * @returns {ChildProcessWithoutNullStreams}
 */
function openQrCode(qrCodePath) {
    // Open the image using the default viewer based on the OS
    const platform = process.platform;
    let command;

    if (platform === 'win32') {
        command = `start ${qrCodePath}`;
    } else if (platform === 'darwin') {
        command = `open ${qrCodePath}`;
    } else if (platform === 'linux') {
        command = `xdg-open ${qrCodePath}`;
    }

    const openProcess = spawn(command, [], {shell: true});
    return openProcess;
}

/**
 * 关闭登录二维码
 * @param openProcess
 * @returns {Promise<unknown>}
 */
function killQrCode(openProcess) {
    return new Promise((resolve, reject) => {
        if (process.platform == 'darwin') {
            exec(`osascript -e 'quit app "Preview"'`, (err) => {
                if (err) {
                    log.error('Error closing the image viewer:', err);
                    return reject(err)
                }
                return resolve()
            });
        } else {
            kill(openProcess.pid, 'SIGKILL', (err) => {
                if (err) {
                    log.error('Error closing the image viewer:', err);
                    return reject(err)
                }
                return resolve()
            })
        }
    })

}

/**
 * 登录
 */
let login = async () => {
    const browser = await chromium.launch({
        headless: true,
    });
    const context = await browser.newContext({
        userAgent: fakeUA.pc(),
    });

    const page = await context.newPage()
    log.info("开始执行登录操作")
    await page.goto(config.baseUrl, {waitUntil: "domcontentloaded"});
    const loginButton = await page.locator("xpath=//a[contains(@class,'login-btn')]")
    await loginButton.click()
    // 定位二维码元素并获取其背景图片 URL
    const qrCodeElement = await page.locator('.qrcode-login__qrcode');
    let qrCodeBase64 = ''
    while (qrCodeBase64.trim() == '') {
        const qrCodeStyle = await qrCodeElement.evaluate(el => el.style.backgroundImage);
        // 提取 base64 图片数据
        qrCodeBase64 = qrCodeStyle.match(/url\("data:image\/png;base64,(.*)"\)/)[1];
        await sleep(1000)
    }

    const qrCodeBuffer = Buffer.from(qrCodeBase64, 'base64');
    const qrCodePath = path.join(`${projectRoot}`, 'qrcode.png');

    fs.writeFileSync(qrCodePath, qrCodeBuffer);
    log.info("请使用喜马拉雅APP扫描登录二维码")
    const openProcess = openQrCode(qrCodePath);

    let token = null;
    while (token == null) {
        const cookies = await page.context().cookies()
        token = cookies.find(cookie => cookie.name == '1&_token')
        log.info("登录检查中...")
        await sleep(1000)
    }
    await killQrCode(openProcess);
    await context.storageState({path: COOKIE_PATH})
    log.info("登录成功")
}

/**
 * 获取用户基本信息
 */
let getCurrentUser = async (cookies) => {
    const url = `${config.baseUrl}/revision/main/getCurrentUser`
    const cookie = httpCookie(cookies)
    const headers = buildHeaders(config.baseUrl, cookie)
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
    return response.data.data; // 将响应数据解析为 JSON
}

/**
 * 判断用户是否登录
 */
let isLogin = async () => {
    const cookies = await getCookies()
    if (!cookies) {
        return false
    }
    const user = await getCurrentUser(cookies)
    if (user == null) {
        return false
    }
    return true
}

/**
 * 检查用户账号信息
 * @param user
 */
function checkUser(user, single) {
    if (user.isLoginBan) {
        log.warn("该用户被禁止登录")
    }
    if (!single) {
        log.info("用户名称:", user.nickname)
        log.info("是否vip:", user.isVip ? "是" : "否")
        log.info("vip剩余天数:", user.vipExpireTime)
        log.info("是否被检测为机器人:", "否")
    }
    if (user.isRobot) {
        log.warn("警告，被系统检测为机器人，请暂停下载稍后重试")
    }
}

// isLogin()

export {
    login, getCurrentUser, isLogin, checkUser
}