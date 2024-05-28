import {iaxios} from '../common/axioscf.mjs'
import {config} from '../common/config.mjs'
import {log} from '../common/log4jscf.mjs'
import {sleep, buildHeaders, parseCookies, convertCookiesToString} from '../common/utils.mjs'
import path from "path";
import fs from "fs";
import {exec, spawn} from "child_process";
import kill from "tree-kill";
import {CustomError} from '../common/error.mjs'
import os from 'os'

/**
 * 下载抽象类
 */
class AbstractDownloader {
  constructor(deviceType) {
    if (this.constructor == AbstractDownloader) {
      throw new Error("抽象类不能被实例化")
    }
    this.deviceType = deviceType
    this.cookiePath = path.join(config.xmd.replace('~', os.homedir()), `${deviceType}-cookies.json`)
    this.qrCodePath = path.join(config.xmd.replace('~', os.homedir()), `${deviceType}-qrcode.png`);
    this.albumId = null
    this.cookies = null

  }

  /**
   * 获取可用的cookies
   * @private
   */
  _getCookies() {
    throw new Error("抽象方法，子类需要实现")
  }

  /**
   * 获取 cookies json格式
   * @returns {Promise<unknown>}
   * @private
   */
  async __readCookies() {
    const readFile = () => {
      return new Promise((resolve) => {
        return fs.readFile(this.cookiePath, (err, data) => {
          if (err) {
            return resolve(null)
          }
          return resolve(JSON.parse(String(data)))
        })
      })
    }
    return await readFile()
  }


  /**
   * 打开登录二维码
   * @param qrCodePath
   * @returns {ChildProcessWithoutNullStreams}
   */
  _openQrCode() {
    const platform = process.platform;
    let command;

    if (platform === 'win32') {
      command = `start ${this.qrCodePath}`;
    } else if (platform === 'darwin') {
      command = `open ${this.qrCodePath}`;
    } else if (platform === 'linux') {
      command = `xdg-open ${this.qrCodePath}`;
    }

    const openProcess = spawn(command, [], {shell: true});
    return openProcess;
  }

  /**
   * 关闭登录二维码
   * @param openProcess
   * @returns {Promise<unknown>}
   */
  _killQrCode(openProcess) {
    return new Promise((resolve, reject) => {
      if (process.platform == 'darwin') {
        exec(`osascript -e 'quit app "Preview"'`, (err) => {
          if (err) {
            log.error('Error closing the image viewer:', err);
            return reject(err)
          }
          return resolve()
        });
      } else if (process.platform === 'win32') {
        // 使用 taskkill 命令终止进程
        exec(`taskkill /IM PhotosApp.exe /F`, (err) => {
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
   * 获取登录二维码抽象方法
   * @returns {Promise<void>}
   * @private
   */
  async _getQrCode() {
    throw new Error("抽象方法，子类需要实现")
  }

  /**
   * 获取登录二维码
   * @returns {Promise<{qrId:int,img:str}>}
   */
  async __getQrCode(clientName) {
    const url = `${config.loginBaseUrl}/web/qrCode/gen?level=L&source=${encodeURIComponent(clientName)}`;
    const response = await iaxios.get(url)

    if (response.status != 200) {
      throw new Error('网络请求失败');
    }
    if (response.data == null) {
      throw new Error('数据为空');
    }
    if (response.data.ret != 0) {
      log.warn("喜马拉雅内部异常", response.data)
      throw new Error("喜马拉雅内部异常")
    }
    return {
      qrId: response.data.qrId,
      img: response.data.img
    }; // 将响应数据解析为 JSON
  }


  /**
   * 登录方法
   * @returns {Promise<AbstractDownloader>}
   */
  async login() {
    // TODO 如果config中没有的cookies的话，就扫码获取
    let cookies = null
    if (config.cookie != null
      && config.cookie[this.deviceType] != null
      && config.cookie[this.deviceType]['serverMode']) {
      if (config.cookie[this.deviceType].value == null || config.cookie[this.deviceType].value.trim() == '') {
        throw new CustomError(`当前为非扫码模式，请在config.json中手动配置cookie.${this.deviceType}.value的值`)
      }
      cookies = parseCookies(config.cookie[this.deviceType].value.split(';'))
    } else {
      const qrCode = await this._getQrCode()
      const qrCodeBuffer = Buffer.from(qrCode.img, 'base64');

      fs.writeFileSync(this.qrCodePath, qrCodeBuffer);

      log.info(this.deviceType, "请使用喜马拉雅APP扫描登录二维码")
      const openProcess = this._openQrCode();
      //等待扫码
      log.info(this.deviceType, "等待登录结果...")
      while (true) {
        const loginResult = await this._getLoginResult(qrCode.qrId)
        if (loginResult.isSuccess) {
          cookies = loginResult.cookies
          break
        }
        await sleep(2000)
      }

      //处理登录成功
      try {
        await this._killQrCode(openProcess);
      } catch (e) {
        log.debug(e)
        log.info(this.deviceType, "扫码已成功，可自行关闭图片程序")
      }
    }
    log.info(this.deviceType, "登录成功")
    const user = await this._getCurrentUser()
    this._checkUser(user, false)
    return this
  }

  /**
   * 根据qrId，获取登录结果
   * @param qrId
   * @returns {Promise<{cookies: JSONObject, isSuccess: boolean}|{isSuccess: boolean}>}
   */
  async _getLoginResult(qrId) {
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
    this.cookies = convertCookiesToString(cookies)
    fs.writeFileSync(this.cookiePath, Buffer.from(JSON.stringify(cookies)))
    return {
      isSuccess: true,
      cookies: cookies
    };
  }

  async _getCurrentUser() {
    const url = `${config.baseUrl}/revision/main/getCurrentUser`
    const cookie = await this._getCookies()
    const headers = buildHeaders(config.baseUrl, cookie)
    const response = await iaxios.get(url, {headers: headers})
    if (response.status != 200) {
      throw new Error('网络请求失败');
    }
    if (response.data == null) {
      throw new Error('数据为空');
    }
    if (response.data.ret == 401) {
      log.error(response.data.msg)
      return null
    }
    if (response.data.ret != 200) {
      log.error("喜马拉雅内部异常", response.data)
      throw new Error("喜马拉雅内部异常")
    }
    return response.data.data; // 将响应数据解析为 JSON
  }

  /**
   * 检查用户账号信息
   * @param user
   */
  _checkUser(user, single) {
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

  async isLogin() {
    const cookies = await this._getCookies()
    if (cookies == null) {
      return false
    }
    const user = await this._getCurrentUser(cookies)
    if (user == null) {
      return false
    }
    return true
  }

  /**
   * 获取专辑简况
   * @param albumId
   * @param cookies
   * @returns {Promise<*>}
   */
  async _getAlbumSimple(albumId, cookie) {
    const url = `${config.baseUrl}/revision/album/v1/simple?albumId=${albumId}`
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


  /**
   * 获取专辑信息
   * @param albumId
   * @param cookies
   * @returns {Promise<*>}
   */
  async _getAlbumInfo(albumId, cookie) {
    const url = `${config.baseUrl}/tdk-web/seo/search/albumInfo?albumId=${albumId}`
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

  /**
   * 获取专辑详情
   * @param albumId
   * @returns {Promise<{trackCount, albumTitle, isFinished}>}
   */
  async getAlbum(albumId) {
    if (albumId == null) {
      throw new Error("albumId不能为空")
    }
    const simple = await this._getAlbumSimple(albumId, await this._getCookies())
    const info = await this._getAlbumInfo(albumId, await this._getCookies())
    const book = await this.getTracksList(albumId, 1, 1)
    return {
      albumId: albumId,
      albumTitle: simple['albumPageMainInfo']['albumTitle'],
      isFinished: simple['albumPageMainInfo']['isFinished'],
      trackCount: book.trackTotalCount
    }
  }

  /**
   * 获取章节列表
   * @param albumId
   * @param pageNum
   * @param pageSize
   * @returns {Promise<*>}
   */
  async getTracksList(albumId, pageNum, pageSize) {
    const url = `${config.baseUrl}/revision/album/v1/getTracksList?albumId=${albumId}&pageNum=${pageNum}&pageSize=${pageSize}`
    const referer = `${config.baseUrl}/album/${albumId}`
    const headers = buildHeaders(referer, await this._getCookies())
    const response = await iaxios.get(url, {headers: headers})
    if (response.status != 200) {
      throw new Error('网络请求失败')
    }
    if (response.data == null) {
      throw new Error('数据为空')
    }
    if (response.data.ret != 200) {
      log.error("喜马拉雅内部异常", response.data)
      throw new Error("喜马拉雅内部异常")
    }
    return response.data.data
  }

  /**
   * 获取音频数据
   * @param trackId
   * @returns {Promise<{trackTitle, playUrlList}>}
   * @private
   */
  async _getBaseInfo(trackId) {
    const trackQualityLevel = 2
    const url = `${config.baseUrl}/mobile-playpage/track/v3/baseInfo/${Date.now()}?device=${this.deviceType}&trackId=${trackId}&trackQualityLevel=${trackQualityLevel}`
    const referer = `${config.baseUrl}/album/${trackId}`
    const headers = buildHeaders(referer, await this._getCookies())
    const response = await iaxios.get(url, {headers: headers})
    if (response.status != 200) {
      throw new Error('网络请求失败');
    }
    if (response.data == null) {
      throw new Error('数据为空');
    }
    if (response.data.ret == 999 || response.data.ret == 1001) {
      log.warn(`${this.deviceType}端喜马拉雅接口内部异常`, response.data)
      throw new CustomError(999, `${this.deviceType}端速率限制`)
    }
    if (response.data.ret != 0) {
      log.warn(`${this.deviceType}端喜马拉雅接口内部异常`, response.data)
      throw new Error("喜马拉雅内部异常")
    }
    return {
      playUrlList: response.data.trackInfo.playUrlList,
      trackTitle: response.data.albumInfo.title
    }
  }

  /**
   * 获取音频数据
   * @param url
   * @returns {Promise<*>}
   */
  async _getAudio(url) {
    if (url == null) {
      throw new Error("Invalid url")
    }
    let response = await iaxios({
      method: 'GET',
      url: url,
      responseType: 'arraybuffer',
    })
    if (response.status != 200) {
      throw new Error('网络请求失败');
    }
    if (response.data == null) {
      throw new Error('数据为空');
    }

    // 获取文件后缀函数
    function getFileExtension(contentType) {
      const parts = contentType.split('/');
      if (parts.length === 2) {
        return '.' + parts[1].replace("x-", "");
      }
      return '';
    }

    const contentType = response.headers['content-type'];
    const fileExtension = getFileExtension(contentType)

    return {
      buffer: response.data,
      extension: fileExtension
    }
  }

  /**
   * 获取解密参数
   * @param t
   * @returns {*}
   */
  _playUrl = (t) => {
    let e, r = {}, n = 1;
    return r.mediaType && t.some((function (t) {
        return t.type.indexOf(r.mediaType) >= 0 && (e = t.url,
          !0)
      }
    )),
    e || (e = t[0].url),
    t && t.length && (n = t[0].qualityLevel),
      {
        qualityLevel: n,
        encodeText: e
      }
  }

  /**
   * 解密
   * @param encodeText
   * @return url
   */
  _decrypt(encodeText) {
    throw new Error("抽象方法，子类需要实现")
  }


  /**
   * 下载音频
   * @param trackId
   * @returns {Promise<buffer, fileExtension>}
   */
  async download(trackId) {
    let user = await this._getCurrentUser()
    await this._checkUser(user, true)
    const baseInfo = await this._getBaseInfo(trackId)
    const e = this._playUrl(baseInfo.playUrlList)
    const url = this._decrypt(e.encodeText)
    const data = await this._getAudio(url)
    return data
  }


  removeCookie() {
    try {
      this.cookies = null
      fs.rmSync(this.cookiePath)
    } catch (e) {
    }
  }
}


export {
  AbstractDownloader
}


