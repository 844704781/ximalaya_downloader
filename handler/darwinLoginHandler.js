import {iaxios} from '#root/common/axioscf.js'
import {config} from '#root/common/config.js'
import {projectRoot} from "#root/settings.js";
import {log} from '#root/common/log4jscf.js'
import {sleep, httpCookie, buildHeaders, getCookies, parseCookies} from '#root/common/utils.js'
import path from "path";
import fs from "fs";
import {exec, spawn} from "child_process";
import kill from "tree-kill";

const COOKIE_PATH = `${projectRoot}/drawin_cookies.json`

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


const getQrCode = async () => {
    const url = `${config.loginBaseUrl}/web/qrCode/gen?level=L&source=${encodeURIComponent("喜马拉雅电脑版")}`;
    const response = await iaxios.get(url)

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
    return {
        qrId: response.data.qrId,
        img: response.data.img
    }; // 将响应数据解析为 JSON
}

/**
 * 根据qrId，获取登录结果
 * @param qrId
 * @returns {Promise<{cookies: JSONObject, isSuccess: boolean}|{isSuccess: boolean}>}
 */
async function getLoginResult(qrId) {
    const url = `${config.loginBaseUrl}/web/qrCode/check/${qrId}/${Date.now()}`;
    const response = await iaxios.get(url)

    if (response.status != 200) {
        throw new Error('网络请求失败');
    }
    if (response.data == null) {
        throw new Error('数据为空');
    }
    let isSuccess = false
    if (response.data.ret != 0) {
        return {
            isSuccess
        }
    }
    const cookieHeaders = response.headers['set-cookie'];
    const cookies = parseCookies(cookieHeaders)
    return {
        isSuccess: true,
        cookies: cookies
    };
}

const login = async () => {
    const qrCode = await getQrCode()

    const qrCodeBuffer = Buffer.from(qrCode.img, 'base64');
    const qrCodePath = path.join(`${projectRoot}`, 'darwin-qrcode.png');

    fs.writeFileSync(qrCodePath, qrCodeBuffer);
    log.info("请使用喜马拉雅APP扫描登录二维码")
    const openProcess = openQrCode(qrCodePath);
    //等待扫码
    log.info("等待登录结果...")
    let cookies
    while (true) {
        const loginResult = await getLoginResult(qrCode.qrId)
        if (loginResult.isSuccess) {
            cookies = loginResult.cookies
            break
        }
        await sleep(2000)
    }

    //处理登录成功
    await killQrCode(openProcess);
    fs.writeFileSync(COOKIE_PATH, Buffer.from(JSON.stringify(cookies)))
    log.info("登录成功")
}