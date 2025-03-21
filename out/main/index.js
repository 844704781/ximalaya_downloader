"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const log = require("electron-log/main.js");
const axios = require("axios");
const fs = require("fs");
const child_process = require("child_process");
const kill = require("tree-kill");
const os = require("os");
const CryptoJS = require("crypto-js");
const asyncMutex = require("async-mutex");
const Datastore = require("nedb");
const commander = require("commander");
const mkdirp = require("mkdirp");
const rimraf = require("rimraf");
const icon = path.join(__dirname, "../../resources/icon.png");
log.initialize();
class SwitchMeta {
  constructor() {
    this.isStart = true;
    this.callback = null;
  }
  setCallback(callback) {
    this.callback = callback;
  }
  setStart(isStart) {
    if (this.callback != null) {
      this.callback(isStart);
    }
    this.isStart = isStart;
  }
  getStart() {
    return this.isStart;
  }
}
const switchMeta = new SwitchMeta();
const iaxios = axios;
const rootDir = path.resolve(".");
const projectRoot = rootDir;
const configBuf = fs.readFileSync(`${projectRoot}/config.json`);
const _config = JSON.parse(String(configBuf));
const config = _config;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const UA = '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"';
const PLATFORM = '"macOS"';
function buildHeaders(referer, cookie) {
  if (typeof cookie !== "string") {
    throw new Error("Cookie must be string");
  }
  const headers = {
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    "Cookie": cookie,
    "Pragma": "no-cache",
    "Referer": referer,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": USER_AGENT,
    "sec-ch-ua": UA,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": PLATFORM
  };
  return headers;
}
function parseCookies(cookieArray) {
  const cookies = cookieArray.filter((cookieStr) => cookieStr.trim() != "").map((cookieStr) => {
    const cookieParts = cookieStr.split(";").map((part) => part.trim());
    const cookieInfo = {};
    cookieParts.forEach((part) => {
      const [key, value] = part.split("=");
      if (key === "Max-Age" || key === "Expires") {
        cookieInfo.expires = Date.parse(value);
      } else if (key === "HttpOnly") {
        cookieInfo.httpOnly = true;
      } else {
        cookieInfo[key] = value;
      }
    });
    return cookieInfo;
  });
  return cookies;
}
function convertCookiesToString(cookies) {
  const parts = [];
  cookies.forEach((cookieObj) => {
    for (const [key, value] of Object.entries(cookieObj)) {
      if (key === "expires" || key === "Domain" || key === "Path" || key === "httpOnly" || key === "secure") {
        continue;
      }
      parts.push(`${key}=${value}`);
    }
  });
  return parts.join("; ");
}
function addCookie(_cookies, key, value) {
  if (_cookies.length != 0) {
    for (const cookiesKey in _cookies) {
      let item = _cookies[cookiesKey];
      for (const itemKey in item) {
        if (itemKey == key) {
          return;
        }
      }
    }
  }
  _cookies.push({
    [key]: value,
    "expires": 3863521955e3,
    "Domain": "ximalaya.com",
    "Path": "/"
  });
}
class CustomError extends Error {
  constructor(code2, message) {
    super();
    this.code = code2;
    this.message = message;
  }
}
const code = {
  OK: 0,
  UN_LOGIN: 10001,
  NO_ITEM: 10002
};
class AbstractDownloader {
  constructor(deviceType) {
    if (this.constructor == AbstractDownloader) {
      throw new Error("抽象类不能被实例化");
    }
    this.deviceType = deviceType;
    this.cookiePath = path.join(config.xmd.replace("~", os.homedir()), `${deviceType}-cookies.json`);
    this.qrCodePath = path.join(config.xmd.replace("~", os.homedir()), `${deviceType}-qrcode.png`);
    this.albumId = null;
    this.cookies = null;
  }
  /**
   * 获取可用的cookies
   * @private
   */
  _getCookies() {
    throw new Error("抽象方法，子类需要实现");
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
            return resolve(null);
          }
          return resolve(JSON.parse(String(data)));
        });
      });
    };
    return await readFile();
  }
  /**
   * 打开登录二维码
   * @param qrCodePath
   * @returns {ChildProcessWithoutNullStreams}
   */
  _openQrCode() {
    const platform = process.platform;
    let command;
    if (platform === "win32") {
      command = `start ${this.qrCodePath}`;
    } else if (platform === "darwin") {
      command = `open ${this.qrCodePath}`;
    } else if (platform === "linux") {
      command = `xdg-open ${this.qrCodePath}`;
    }
    const openProcess = child_process.spawn(command, [], { shell: true });
    return openProcess;
  }
  /**
   * 关闭登录二维码
   * @param openProcess
   * @returns {Promise<unknown>}
   */
  _killQrCode(openProcess) {
    return new Promise((resolve, reject) => {
      if (process.platform == "darwin") {
        child_process.exec(`osascript -e 'quit app "Preview"'`, (err) => {
          if (err) {
            log.error("Error closing the image viewer:", err);
            return reject(err);
          }
          return resolve();
        });
      } else if (process.platform === "win32") {
        child_process.exec(`taskkill /IM PhotosApp.exe /F`, (err) => {
          if (err) {
            log.error("Error closing the image viewer:", err);
            return reject(err);
          }
          return resolve();
        });
      } else {
        kill(openProcess.pid, "SIGKILL", (err) => {
          if (err) {
            log.error("Error closing the image viewer:", err);
            return reject(err);
          }
          return resolve();
        });
      }
    });
  }
  /**
   * 获取登录二维码抽象方法
   * @returns {Promise<void>}
   * @private
   */
  async _getQrCode() {
    throw new Error("抽象方法，子类需要实现");
  }
  /**
   * 获取登录二维码
   * @returns {Promise<{qrId:int,img:str}>}
   */
  async __getQrCode(clientName) {
    const url = `${config.loginBaseUrl}/web/qrCode/gen?level=L&source=${encodeURIComponent(clientName)}`;
    const response = await iaxios.get(url);
    if (response.status != 200) {
      throw new Error("网络请求失败");
    }
    if (response.data == null) {
      throw new Error("数据为空");
    }
    if (response.data.ret != 0) {
      log.warn("喜马拉雅内部异常", response.data);
      throw new Error("喜马拉雅内部异常");
    }
    return {
      qrId: response.data.qrId,
      img: response.data.img
    };
  }
  /**
   * 登录方法
   * @returns {Promise<AbstractDownloader>}
   */
  async login() {
    if (config.cookie != null && config.cookie[this.deviceType] != null && config.cookie[this.deviceType]["serverMode"]) {
      if (config.cookie[this.deviceType].value == null || config.cookie[this.deviceType].value.trim() == "") {
        throw new CustomError(`当前为非扫码模式，请在config.json中手动配置cookie.${this.deviceType}.value的值`);
      }
      parseCookies(config.cookie[this.deviceType].value.split(";"));
    } else {
      const qrCode = await this._getQrCode();
      const qrCodeBuffer = Buffer.from(qrCode.img, "base64");
      fs.writeFileSync(this.qrCodePath, qrCodeBuffer);
      log.info(this.deviceType, "请使用喜马拉雅APP扫描登录二维码");
      const openProcess = this._openQrCode();
      log.info(this.deviceType, "等待登录结果...");
      while (true) {
        const loginResult = await this._getLoginResult(qrCode.qrId);
        if (loginResult.isSuccess) {
          loginResult.cookies;
          break;
        }
        await sleep(2e3);
      }
      try {
        await this._killQrCode(openProcess);
      } catch (e2) {
        log.debug(e2);
        log.info(this.deviceType, "扫码已成功，可自行关闭图片程序");
      }
    }
    log.info(this.deviceType, "登录成功");
    const user = await this._getCurrentUser();
    this._checkUser(user, false);
    return this;
  }
  /**
   * 根据qrId，获取登录结果
   * @param qrId
   * @returns {Promise<{cookies: JSONObject, isSuccess: boolean}|{isSuccess: boolean}>}
   */
  async _getLoginResult(qrId) {
    const url = `${config.loginBaseUrl}/web/qrCode/check/${qrId}/${Date.now()}`;
    const response = await iaxios.get(url);
    if (response.status != 200) {
      throw new Error("网络请求失败");
    }
    if (response.data == null) {
      throw new Error("数据为空");
    }
    let isSuccess = false;
    if (response.data.ret != 0) {
      return {
        isSuccess
      };
    }
    const cookieHeaders = response.headers["set-cookie"];
    const cookies = parseCookies(cookieHeaders);
    this.cookies = convertCookiesToString(cookies);
    fs.writeFileSync(this.cookiePath, Buffer.from(JSON.stringify(cookies)));
    return {
      isSuccess: true,
      cookies
    };
  }
  async _getCurrentUser() {
    const url = `${config.baseUrl}/revision/main/getCurrentUser`;
    const cookie = await this._getCookies();
    const headers = buildHeaders(config.baseUrl, cookie);
    const response = await iaxios.get(url, { headers });
    if (response.status != 200) {
      throw new Error("网络请求失败");
    }
    if (response.data == null) {
      throw new Error("数据为空");
    }
    if (response.data.ret == 401) {
      log.error(response.data.msg);
      return null;
    }
    if (response.data.ret != 200) {
      log.error("喜马拉雅内部异常", response.data);
      throw new Error("喜马拉雅内部异常");
    }
    return response.data.data;
  }
  /**
   * 检查用户账号信息
   * @param user
   */
  _checkUser(user, single) {
    if (user.isLoginBan) {
      log.warn("该用户被禁止登录");
    }
    if (!single) {
      log.info("用户名称:", user.nickname);
      log.info("是否vip:", user.isVip ? "是" : "否");
      log.info("vip剩余天数:", user.vipExpireTime);
      log.info("是否被检测为机器人:", "否");
    }
    if (user.isRobot) {
      log.warn("警告，被系统检测为机器人，请暂停下载稍后重试");
    }
  }
  async isLogin() {
    const cookies = await this._getCookies();
    if (cookies == null) {
      return false;
    }
    const user = await this._getCurrentUser(cookies);
    if (user == null) {
      return false;
    }
    return true;
  }
  /**
   * 获取专辑简况
   * @param albumId
   * @param cookies
   * @returns {Promise<*>}
   */
  async _getAlbumSimple(albumId, cookie) {
    const url = `${config.baseUrl}/revision/album/v1/simple?albumId=${albumId}`;
    const referer = `${config.baseUrl}/album/${albumId}`;
    const headers = buildHeaders(referer, cookie);
    const response = await iaxios.get(url, { headers });
    if (response.status != 200) {
      throw new Error("网络请求失败");
    }
    if (response.data == null) {
      throw new Error("数据为空");
    }
    if (response.data.ret != 200) {
      log.error("喜马拉雅内部异常", response.data);
      throw new Error("喜马拉雅内部异常");
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
    const url = `${config.baseUrl}/tdk-web/seo/search/albumInfo?albumId=${albumId}`;
    const referer = `${config.baseUrl}/album/${albumId}`;
    const headers = buildHeaders(referer, cookie);
    const response = await iaxios.get(url, { headers });
    if (response.status != 200) {
      throw new Error("网络请求失败");
    }
    if (response.data == null) {
      throw new Error("数据为空");
    }
    if (response.data.ret != 200) {
      log.error("喜马拉雅内部异常", response.data);
      throw new Error("喜马拉雅内部异常");
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
      throw new Error("albumId不能为空");
    }
    const simple = await this._getAlbumSimple(albumId, await this._getCookies());
    await this._getAlbumInfo(albumId, await this._getCookies());
    const book = await this.getTracksList(albumId, 1, 1);
    return {
      albumId,
      albumTitle: simple["albumPageMainInfo"]["albumTitle"],
      isFinished: simple["albumPageMainInfo"]["isFinished"],
      trackCount: book.trackTotalCount
    };
  }
  /**
   * 获取章节列表
   * @param albumId
   * @param pageNum
   * @param pageSize
   * @returns {Promise<*>}
   */
  async getTracksList(albumId, pageNum, pageSize) {
    const url = `${config.baseUrl}/revision/album/v1/getTracksList?albumId=${albumId}&pageNum=${pageNum}&pageSize=${pageSize}`;
    const referer = `${config.baseUrl}/album/${albumId}`;
    const headers = buildHeaders(referer, await this._getCookies());
    const response = await iaxios.get(url, { headers });
    if (response.status != 200) {
      throw new Error("网络请求失败");
    }
    if (response.data == null) {
      throw new Error("数据为空");
    }
    if (response.data.ret != 200) {
      log.error("喜马拉雅内部异常", response.data);
      throw new Error("喜马拉雅内部异常");
    }
    return response.data.data;
  }
  /**
   * 获取音频数据
   * @param trackId
   * @returns {Promise<{trackTitle, playUrlList}>}
   * @private
   */
  async _getBaseInfo(trackId) {
    const trackQualityLevel = 2;
    const url = `${config.baseUrl}/mobile-playpage/track/v3/baseInfo/${Date.now()}?device=${this.deviceType}&trackId=${trackId}&trackQualityLevel=${trackQualityLevel}`;
    const referer = `${config.baseUrl}/album/${trackId}`;
    const headers = buildHeaders(referer, await this._getCookies());
    const response = await iaxios.get(url, { headers });
    if (response.status != 200) {
      throw new Error("网络请求失败");
    }
    if (response.data == null) {
      throw new Error("数据为空");
    }
    if (response.data.ret == 999 || response.data.ret == 1001) {
      log.warn(`${this.deviceType}端喜马拉雅接口内部异常`, response.data);
      throw new CustomError(999, `${this.deviceType}端速率限制`);
    }
    if (response.data.ret != 0) {
      log.warn(`${this.deviceType}端喜马拉雅接口内部异常`, response.data);
      throw new Error("喜马拉雅内部异常");
    }
    if (response.data.trackInfo.playUrlList == null) {
      throw new CustomError(code.NO_ITEM, `无法获取音源，请检查账号是否是会员账号`);
    }
    return {
      playUrlList: response.data.trackInfo.playUrlList,
      trackTitle: response.data.albumInfo.title
    };
  }
  /**
   * 获取音频数据
   * @param url
   * @returns {Promise<*>}
   */
  async _getAudio(url) {
    if (url == null) {
      throw new Error("Invalid url");
    }
    let response = await iaxios({
      method: "GET",
      url,
      responseType: "arraybuffer"
    });
    if (response.status != 200) {
      throw new Error("网络请求失败");
    }
    if (response.data == null) {
      throw new Error("数据为空");
    }
    function getFileExtension(contentType2) {
      const parts = contentType2.split("/");
      if (parts.length === 2) {
        return "." + parts[1].replace("x-", "");
      }
      return "";
    }
    const contentType = response.headers["content-type"];
    const fileExtension = getFileExtension(contentType);
    return {
      buffer: response.data,
      extension: fileExtension
    };
  }
  /**
   * 获取解密参数
   * @param t
   * @returns {*}
   */
  _playUrl = (t) => {
    let e2, r2 = {}, n2 = 1;
    return r2.mediaType && t.some(function(t2) {
      return t2.type.indexOf(r2.mediaType) >= 0 && (e2 = t2.url, true);
    }), e2 || (e2 = t[0].url), t && t.length && (n2 = t[0].qualityLevel), {
      qualityLevel: n2,
      encodeText: e2
    };
  };
  /**
   * 解密
   * @param encodeText
   * @return url
   */
  _decrypt(encodeText) {
    throw new Error("抽象方法，子类需要实现");
  }
  /**
   * 下载音频
   * @param trackId
   * @returns {Promise<buffer, fileExtension>}
   */
  async download(trackId) {
    let user = await this._getCurrentUser();
    await this._checkUser(user, true);
    const baseInfo = await this._getBaseInfo(trackId);
    const e2 = this._playUrl(baseInfo.playUrlList);
    const url = this._decrypt(e2.encodeText);
    const data = await this._getAudio(url);
    return data;
  }
  removeCookie() {
    try {
      this.cookies = null;
      fs.rmSync(this.cookiePath);
    } catch (e2) {
    }
  }
}
const r = new Uint8Array([188, 174, 178, 234, 171, 147, 70, 82, 76, 72, 192, 132, 60, 17, 30, 127, 184, 233, 48, 105, 38, 232, 240, 21, 47, 252, 41, 229, 209, 213, 71, 40, 63, 152, 156, 88, 51, 141, 139, 145, 133, 2, 160, 191, 11, 100, 10, 78, 253, 151, 42, 166, 92, 22, 185, 140, 164, 91, 194, 175, 239, 217, 177, 75, 19, 225, 94, 107, 125, 138, 242, 31, 182, 150, 15, 24, 226, 29, 80, 116, 168, 118, 28, 1, 186, 220, 158, 79, 59, 244, 119, 9, 189, 161, 74, 130, 221, 56, 216, 241, 212, 26, 218, 170, 85, 165, 153, 69, 238, 93, 255, 142, 3, 159, 215, 67, 33, 249, 53, 176, 77, 254, 222, 25, 115, 101, 148, 16, 13, 237, 197, 5, 58, 157, 135, 248, 223, 61, 198, 211, 110, 44, 54, 111, 52, 227, 4, 46, 205, 7, 219, 136, 14, 87, 114, 64, 104, 50, 39, 203, 81, 196, 43, 163, 173, 109, 108, 187, 102, 195, 37, 235, 65, 190, 113, 149, 143, 8, 27, 155, 207, 134, 123, 224, 129, 245, 62, 66, 172, 122, 126, 12, 162, 214, 90, 247, 251, 124, 201, 236, 117, 183, 73, 95, 89, 246, 181, 179, 83, 228, 193, 99, 6, 45, 112, 32, 154, 128, 230, 131, 206, 243, 57, 84, 146, 0, 35, 96, 250, 137, 36, 208, 103, 34, 68, 204, 231, 144, 120, 98, 202, 49, 210, 23, 200, 18, 86, 55, 121, 20, 199, 97, 167, 180, 169, 106]), n = new Uint8Array([20, 234, 159, 167, 230, 233, 58, 255, 158, 36, 210, 254, 133, 166, 59, 63, 209, 177, 184, 155, 85, 235, 94, 1, 242, 87, 228, 232, 191, 3, 69, 178]), o = new Uint8Array([183, 174, 108, 16, 131, 159, 250, 5, 239, 110, 193, 202, 153, 137, 251, 176, 119, 150, 47, 204, 97, 237, 1, 71, 177, 42, 88, 218, 166, 82, 87, 94, 14, 195, 69, 127, 215, 240, 225, 197, 238, 142, 123, 44, 219, 50, 190, 29, 181, 186, 169, 98, 139, 185, 152, 13, 141, 76, 6, 157, 200, 132, 182, 49, 20, 116, 136, 43, 155, 194, 101, 231, 162, 242, 151, 213, 53, 60, 26, 134, 211, 56, 28, 223, 107, 161, 199, 15, 229, 61, 96, 41, 66, 158, 254, 21, 165, 253, 103, 89, 3, 168, 40, 246, 81, 95, 58, 31, 172, 78, 99, 45, 148, 187, 222, 124, 55, 203, 235, 64, 68, 149, 180, 35, 113, 207, 118, 111, 91, 38, 247, 214, 7, 212, 209, 189, 241, 18, 115, 173, 25, 236, 121, 249, 75, 57, 216, 10, 175, 112, 234, 164, 70, 206, 198, 255, 140, 230, 12, 32, 83, 46, 245, 0, 62, 227, 72, 191, 156, 138, 248, 114, 220, 90, 84, 170, 128, 19, 24, 122, 146, 80, 39, 37, 8, 34, 22, 11, 93, 130, 63, 154, 244, 160, 144, 79, 23, 133, 92, 54, 102, 210, 65, 67, 27, 196, 201, 106, 143, 52, 74, 100, 217, 179, 48, 233, 126, 117, 184, 226, 85, 171, 167, 86, 2, 147, 17, 135, 228, 252, 105, 30, 192, 129, 178, 120, 36, 145, 51, 163, 77, 205, 73, 4, 188, 125, 232, 33, 243, 109, 224, 104, 208, 221, 59, 9]), a = new Uint8Array([204, 53, 135, 197, 39, 73, 58, 160, 79, 24, 12, 83, 180, 250, 101, 60, 206, 30, 10, 227, 36, 95, 161, 16, 135, 150, 235, 116, 242, 116, 165, 171]), i = "function" == typeof atob, u = "function" == typeof e;
"function" == typeof TextDecoder && new TextDecoder(), "function" == typeof TextEncoder && new TextEncoder();
const c = ((e2) => {
  let t = {};
  return e2.forEach((e3, r2) => t[e3] = r2), t;
})(Array.prototype.slice.call("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=")), s = /^(?:[A-Za-z\d+\/]{4})*?(?:[A-Za-z\d+\/]{2}(?:==)?|[A-Za-z\d+\/]{3}=?)?$/, l = String.fromCharCode.bind(String);
"function" == typeof Uint8Array.from && Uint8Array.from.bind(Uint8Array);
const f = i ? (e2) => atob(e2.replace(/[^A-Za-z0-9\+\/]/g, "")) : u ? (t) => e.from(t, "base64").toString("binary") : (e2) => {
  if (e2 = e2.replace(/\s+/g, ""), !s.test(e2))
    throw new TypeError("malformed base64.");
  e2 += "==".slice(2 - (3 & e2.length));
  let t, r2, n2, o2 = "";
  for (let a2 = 0; a2 < e2.length; )
    t = c[e2.charAt(a2++)] << 18 | c[e2.charAt(a2++)] << 12 | (r2 = c[e2.charAt(a2++)]) << 6 | (n2 = c[e2.charAt(a2++)]), o2 += 64 === r2 ? l(t >> 16 & 255) : 64 === n2 ? l(t >> 16 & 255, t >> 8 & 255) : l(t >> 16 & 255, t >> 8 & 255, 255 & t);
  return o2;
};
function p(e2, t, r2) {
  let n2 = Math.min(e2.length - t, r2.length);
  for (let o2 = 0; o2 < n2; o2++)
    e2[o2 + t] = e2[o2 + t] ^ r2[o2];
}
let getSoundCryptLink$1 = function(e2) {
  const { link: t = "", deviceType: i2 = "www2" } = e2;
  let u2 = o, c2 = a;
  ["www2", "mweb2"].includes(i2) || (u2 = r, c2 = n);
  try {
    let e3 = f(t.replace(/_/g, "/").replace(/-/g, "+"));
    if (null === e3 || e3.length < 16)
      return t;
    let r2 = new Uint8Array(e3.length - 16);
    for (let t2 = 0; t2 < e3.length - 16; t2++)
      r2[t2] = e3.charCodeAt(t2);
    let n2 = new Uint8Array(16);
    for (let t2 = 0; t2 < 16; t2++)
      n2[t2] = e3.charCodeAt(e3.length - 16 + t2);
    for (let e4 = 0; e4 < r2.length; e4++)
      r2[e4] = u2[r2[e4]];
    for (let e4 = 0; e4 < r2.length; e4 += 16)
      p(r2, e4, n2);
    for (let e4 = 0; e4 < r2.length; e4 += 32)
      p(r2, e4, c2);
    return function(e4) {
      var t2, r3, n3, o2, a2, i3;
      for (t2 = "", n3 = e4.length, r3 = 0; r3 < n3; )
        switch ((o2 = e4[r3++]) >> 4) {
          case 0:
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
          case 6:
          case 7:
            t2 += String.fromCharCode(o2);
            break;
          case 12:
          case 13:
            a2 = e4[r3++], t2 += String.fromCharCode((31 & o2) << 6 | 63 & a2);
            break;
          case 14:
            a2 = e4[r3++], i3 = e4[r3++], t2 += String.fromCharCode((15 & o2) << 12 | (63 & a2) << 6 | (63 & i3) << 0);
        }
      return t2;
    }(r2);
  } catch (e3) {
    return console.warn(e3, "secret failed"), "";
  }
};
const decrypt$1 = {
  getSoundCryptLink: getSoundCryptLink$1
};
class WebSiteDownloader extends AbstractDownloader {
  constructor() {
    super("www2");
    this.clientName = "喜马拉雅网页端";
  }
  async _getQrCode() {
    return this.__getQrCode(this.clientName);
  }
  /**
   * 获取可用cookie
   * @returns {Promise<*>}
   * @private
   */
  async _getCookies() {
    if (this.cookies) {
      return this.cookies;
    }
    const cookies = await this.__readCookies();
    if (cookies == null) {
      return null;
    }
    addCookie(cookies, "_xmLog", "h5&85125320-3c87-43c0-8228-f43734d4bddf&2.4.15-alpha.2");
    addCookie(cookies, "wfp", "ACM4MzBmMDg3ODg2OTc4NmRho0-cwtmso-54bXdlYl93d3c");
    addCookie(cookies, "xm-page-viewid", "ximalaya-web");
    addCookie(cookies, "impl", "www.ximalaya.com.login");
    addCookie(cookies, "x_xmly_traffic", "utm_source%253A%2526utm_medium%253A%2526utm_campaign%253A%2526utm_content%253A%2526utm_term%253A%2526utm_from%253A");
    addCookie(cookies, "Hm_lvt_4a7d8ec50cfd6af753c4f8aee3425070", "1715830002,1715931095,1716018268,1716036376");
    addCookie(cookies, "Hm_lpvt_4a7d8ec50cfd6af753c4f8aee3425070", Math.floor(Date.now() / 1e3));
    addCookie(cookies, "web_login", Date.now());
    this.cookies = convertCookiesToString(cookies);
    return this.cookies;
  }
  _decrypt(encodeText) {
    const url = decrypt$1.getSoundCryptLink({ deviceType: this.deviceType, link: encodeText });
    return url;
  }
}
function getSoundCryptLink(ciphertext) {
  const key = CryptoJS.enc.Hex.parse("aaad3e4fd540b0f79dca95606e72bf93");
  const encrypted = CryptoJS.enc.Base64url.parse(ciphertext);
  const decrypted = CryptoJS.AES.decrypt({ ciphertext: encrypted }, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
}
const decrypt = {
  getSoundCryptLink
};
class DarwinDownloader extends AbstractDownloader {
  constructor() {
    super("mac");
    this.clientName = "喜马拉雅电脑版";
  }
  async _getQrCode() {
    return super.__getQrCode(this.clientName);
  }
  async _getCookies() {
    if (this.cookies) {
      return this.cookies;
    }
    const cookies = await this.__readCookies();
    if (cookies == null) {
      return null;
    }
    addCookie(cookies, "channel", 99);
    addCookie(cookies, "1&_device", "darwin&24c60e8a-6a6d-51a2-af64-7613fb39a4ef&4.0.2");
    addCookie(cookies, "v1", "V(dDwi:*pp=zY.7#NbQ^");
    this.cookies = convertCookiesToString(cookies);
    return this.cookies;
  }
  _decrypt(encodeText) {
    const url = decrypt.getSoundCryptLink(encodeText);
    return url;
  }
}
class _AtomicInteger {
  constructor(initialValue = 0) {
    this._value = initialValue;
    this._mutex = new asyncMutex.Mutex();
  }
  async increment() {
    return this._mutex.runExclusive(async () => {
      return ++this._value;
    });
  }
  async decrement() {
    return this._mutex.runExclusive(async () => {
      return --this._value;
    });
  }
  async get() {
    return this._mutex.runExclusive(async () => {
      return this._value;
    });
  }
  async set(initialValue = 0) {
    return this._mutex.runExclusive(async () => {
      this._value = initialValue;
    });
  }
}
const AtomicInteger = _AtomicInteger;
let DownloaderFactory$1 = class DownloaderFactory {
  constructor() {
    this.downloaders = [];
  }
  /**
   * 创建一个工厂类
   * @returns {DownloaderFactory}
   */
  static create() {
    const factory = new DownloaderFactory();
    factory.downloaders.push({
      downloader: new WebSiteDownloader(),
      executeCounter: new AtomicInteger(0)
    });
    factory.downloaders.push({
      downloader: new DarwinDownloader(),
      executeCounter: new AtomicInteger(0)
    });
    return factory;
  }
  getOfflineDownloader(deviceType) {
    for (let i2 = 0; i2 < this.downloaders.length; i2++) {
      const item = this.downloaders[i2];
      if (item.downloader.deviceType == deviceType) {
        return item.downloader;
      }
    }
    throw new Error(`暂不支持: ${type} 这种登录方式`);
  }
  async getPolicyItem(downloads) {
    for (let i2 = downloads.length - 1; i2 >= 0; i2--) {
      let item2 = downloads[i2];
      let max = Math.floor(100 / (downloads.length - i2));
      let currentCount = await item2.executeCounter.get();
      if (currentCount < max) {
        await item2.executeCounter.increment();
        return item2;
      }
    }
    for (const download2 of downloads) {
      await download2.executeCounter.set(0);
    }
    const _downloads = downloads;
    if (_downloads.length == 0) {
      return null;
    }
    const item = downloads[downloads.length - 1];
    return item;
  }
  async getDownloader(type2, needLimit = true, cb) {
    if (needLimit == false) {
      return cb(this.downloaders[0].downloader);
    }
    for (let i2 = 0; i2 < this.downloaders.length; i2++) {
      const item = await this.getPolicyItem(this.downloaders);
      if (item == null) {
        break;
      }
      try {
        return await cb(item.downloader);
      } catch (e2) {
        if (e2 instanceof CustomError) {
          if (e2.code = code.NO_ITEM) {
            log.info(`${item.downloader.deviceType} 剩余音频无法下载，原因:${e2.message}`);
            throw e2;
          }
        }
        log.info(`原因:${e2.message}`);
        continue;
      }
    }
    log.info("无可用的下载器");
    return null;
  }
  async hasOnlineDownloader() {
    for (let i2 = 0; i2 < this.downloaders.length; i2++) {
      let item = this.downloaders[i2];
      const cookies = await item.downloader._getCookies();
      if (cookies != null) {
        return true;
      }
    }
    return false;
  }
};
const db$1 = new Datastore({
  filename: path.join(config.xmd.replace("~", os.homedir()), "db", "file", "track.db"),
  autoload: true
});
const trackdb = {};
trackdb.insert = (entity) => {
  return new Promise((resolve, reject) => {
    db$1.insert(entity, (err, newDoc) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(newDoc);
      }
    });
  });
};
trackdb.count = (query) => {
  return new Promise((resolve, reject) => {
    db$1.count(query, (err, count) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(count);
      }
    });
  });
};
trackdb.find = (entity, sort, limit) => {
  return new Promise((resolve, reject) => {
    let query = db$1.find(entity);
    if (limit) {
      query = query.limit(limit);
    }
    if (sort) {
      query.sort(sort);
    }
    query.exec((err, docs) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(docs);
      }
    });
  });
};
trackdb.findOne = (query) => {
  return new Promise((resolve, reject) => {
    db$1.findOne(query, (err, doc) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(doc);
      }
    });
  });
};
trackdb.update = (condition, setEntity) => {
  return new Promise((resolve, reject) => {
    db$1.update(condition, { $set: setEntity }, (err, numReplaced) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(numReplaced);
      }
    });
  });
};
trackdb.remove = (condition) => {
  return new Promise((resolve, reject) => {
    db$1.remove(condition, {}, (err, numReplaced) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(numReplaced);
      }
    });
  });
};
const db = new Datastore({
  filename: path.join(config.xmd.replace("~", os.homedir()), "db", "file", "album.db"),
  autoload: true
});
const albumdb = {};
albumdb.insert = (entity) => {
  return new Promise((resolve, reject) => {
    db.insert(entity, (err, newDoc) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(newDoc);
      }
    });
  });
};
albumdb.count = (query) => {
  return new Promise((resolve, reject) => {
    db.count(query, (err, count) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(count);
      }
    });
  });
};
albumdb.find = (entity, sort, limit) => {
  return new Promise((resolve, reject) => {
    let query = db.find(entity);
    if (limit) {
      query = query.limit(limit);
    }
    if (sort) {
      query.sort(sort);
    }
    query.exec((err, docs) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(docs);
      }
    });
  });
};
albumdb.findOne = (query) => {
  return new Promise((resolve, reject) => {
    db.findOne(query, (err, doc) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(doc);
      }
    });
  });
};
albumdb.update = (condition, setEntity) => {
  return new Promise((resolve, reject) => {
    db.update(condition, { $set: setEntity }, (err, numReplaced) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(numReplaced);
      }
    });
  });
};
albumdb.remove = (condition) => {
  return new Promise((resolve, reject) => {
    db.remove(condition, {}, (err, numReplaced) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(numReplaced);
      }
    });
  });
};
class DownloaderFactory2 {
  constructor() {
    this.downloaders = [];
    this.delay = 60;
  }
  /**
   * 创建一个工厂类
   * @param type
   * @returns {DownloaderFactory}
   */
  static create() {
    return new DownloaderFactory2();
  }
  /**
   * 登录操作
   * @param target 当前对象
   * @param type 要登录的目标
   * @returns
   */
  async _login(type2) {
    if (type2 == null) {
      this.downloaders.push({
        isLimit: false,
        downloader: new WebSiteDownloader(),
        executeCounter: new AtomicInteger(0)
      });
      this.downloaders.push({
        isLimit: false,
        downloader: new DarwinDownloader(),
        executeCounter: new AtomicInteger(0)
      });
    } else if (type2 == "pc") {
      this.downloaders.push({
        isLimit: false,
        downloader: new DarwinDownloader(),
        executeCounter: new AtomicInteger(0)
      });
    } else if (type2 == "web") {
      this.downloaders.push({
        isLimit: false,
        downloader: new WebSiteDownloader(),
        executeCounter: new AtomicInteger(0)
      });
    } else {
      throw new Error(`暂不支持: ${type2} 这种登录方式`);
    }
    for (const index in this.downloaders) {
      const item = this.downloaders[index];
      const downloader = item.downloader;
      const isLogin = await downloader.isLogin();
      if (isLogin) {
        continue;
      }
      await downloader.login();
    }
  }
  async _getItem(downloads) {
    for (let i2 = downloads.length - 1; i2 >= 0; i2--) {
      let item2 = downloads[i2];
      if (item2.isLimit) {
        continue;
      }
      let max = Math.floor(100 / (downloads.length - i2));
      while (await item2.executeCounter.get() < max) {
        await sleep(80);
        await item2.executeCounter.increment();
        return item2;
      }
    }
    for (const download2 of downloads) {
      await download2.executeCounter.set(0);
    }
    const _downloads = downloads.filter((download2) => download2.isLimit == false);
    if (_downloads.length == 0) {
      return null;
    }
    const item = downloads[downloads.length - 1];
    item.isLimit = false;
    return item;
  }
  _getNextHoursMinutes() {
    const now = /* @__PURE__ */ new Date();
    const minutes = now.getMinutes();
    return 60 - minutes;
  }
  /**
   * 回调中获取下载器
   * @param type
   * @param cb
   * @returns {Promise<*>}
   */
  async getDownloader(type2, needLimit = true, cb) {
    if (this.downloaders.length == 0) {
      await this._login(type2);
    }
    if (needLimit == false) {
      return cb(this.downloaders[0].downloader);
    }
    for (let i2 = 0; i2 < this.downloaders.length; i2++) {
      const item = await this._getItem(this.downloaders);
      if (item == null) {
        break;
      }
      if (item.isLimit) {
        continue;
      }
      try {
        return await cb(item.downloader);
      } catch (e2) {
        if (e2 instanceof CustomError) {
          if (e2.code = code.NO_ITEM) {
            log.info(`剩余音频无法下载，原因:${e2.message}`);
            throw e2;
          }
        }
        item.isLimit = true;
        continue;
      }
    }
    const delayTime = (this.delay += 2) * 60 * 1e3;
    log.warn(`所有下载方式都受限了，${delayTime / 6e4}分钟后会自动重试哦`);
    await sleep(delayTime);
  }
}
let taskCount = new AtomicInteger(0);
let finishCount = new AtomicInteger(0);
let emoji = ">";
async function getPQueue() {
  const pQueueModule = await import("p-queue");
  return pQueueModule.default;
}
async function printProgress(trackName, target, deviceType) {
  const downloaderName = `${deviceType == null ? "" : `(${deviceType})`}`;
  if (trackName)
    log.info(`${downloaderName}下载成功${emoji.repeat(5)}进度:${await getProgress(finishCount, taskCount)}%(${await finishCount.get()}/${await taskCount.get()})---->${target}`);
  else {
    log.info(`${downloaderName}当前信息${emoji.repeat(5)}进度:${await getProgress(finishCount, taskCount)}%(${await finishCount.get()}/${await taskCount.get()})`);
  }
}
async function getProgress(finishCount2, taskCount2) {
  let _finishCount = await finishCount2.get();
  let _taskCount = await taskCount2.get();
  if (_taskCount == 0) {
    return 100;
  }
  let n2 = _finishCount / _taskCount;
  return (n2 * 100).toFixed(2);
}
function myParseInt(value, dummyPrevious) {
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new commander.InvalidArgumentError("Not a number.");
  }
  return parsedValue;
}
function cleanedStr(str) {
  const pathCharactersRegex = /[<>:"\/\\|?*\x00-\x1F]/g;
  const replacementCharacter = "_";
  const encodedStr = str.replace(pathCharactersRegex, replacementCharacter);
  return encodedStr;
}
async function download(factory, options, album, track) {
  if (track.path && fs.existsSync(track.path)) {
    return;
  }
  let targetDir = options.output;
  if (targetDir.includes("~")) {
    targetDir = targetDir.replace("~", os.homedir());
  }
  targetDir = path.join(targetDir, cleanedStr(album.albumTitle));
  if (!fs.existsSync(targetDir)) {
    mkdirp.mkdirpSync(targetDir);
  }
  const downloadResp = await factory.getDownloader(options.type, true, async (downloader) => {
    return {
      data: await downloader.download(track.trackId),
      deviceType: downloader.deviceType
    };
  });
  if (downloadResp == null) {
    return;
  }
  const data = downloadResp.data;
  const deviceType = downloadResp.deviceType;
  const filePath = path.join(targetDir, track.num + "." + cleanedStr(track.title) + data.extension);
  fs.writeFileSync(filePath, data.buffer);
  await trackdb.update({ "trackId": track.trackId }, { "path": filePath });
  await finishCount.increment();
  await printProgress(track.title, filePath, deviceType);
}
async function run(factory = null, output = null, albumId = null, switchMeta2 = null) {
  log.info("欢迎使用 ximalaya_downloader！🎉");
  log.info("如果觉得棒棒哒，去 GitHub 给我们点个星星吧！🌟");
  log.info("GitHub 地址：https://github.com/844704781/ximalaya_downloader 💻");
  let options;
  if (factory == null) {
    commander.program.option("-a, --albumId <value>", "albumId,必填").option("-n, --concurrency <number>", "并发数,默认10", myParseInt).option("-s, --slow", "慢速模式").option("-t, --type", "登录类型,可选值pc、web,默认都登陆(需要扫码多次)").option("-r, --replace", "清除缓存,任务将重新下载").option("-o, --output <value>", "当前要保存的目录,默认为~/Downloads", config.archives);
    commander.program.parse(process.argv);
    options = commander.program.opts();
    factory = DownloaderFactory2.create();
  } else {
    options = {
      albumId,
      output
    };
  }
  albumId = options.albumId;
  if (albumId == null || albumId.trim() == "") {
    log.error("要输入 albumId 哦，尝试输入 node xmd.mjs --help 查看使用说明吧😞");
    return;
  }
  if (options.replace) {
    log.info("清空缓存中...");
    rimraf.rimrafSync(path.join(config.xmd.replace("~", os.homedir()), "db", "file"));
  }
  log.info(`当前albumId:${options.albumId}`);
  log.info(`当前保存目录:${options.output}`);
  if (options.concurrency == null) {
    options.concurrency = 10;
  }
  if (!options.slow) {
    emoji = "＞";
    log.warn(`${"🚀".repeat(5)}当前为快速模式,很容易被官方大大踢屁屁哦`);
  } else {
    emoji = ">";
    options.concurrency = 1;
    log.info(`${"🐢".repeat(5)}当前为慢速模式`);
  }
  log.info(`并发数:${options.concurrency}`);
  const pQueue = await getPQueue();
  const queue = new pQueue({ concurrency: options.concurrency });
  log.info("正在获取专辑信息");
  const albumResp = await factory.getDownloader(options.type, false, async (downloader) => {
    return await downloader.getAlbum(albumId);
  });
  log.info(`当前专辑:${albumResp.albumTitle},总章节数:${albumResp.trackCount}`);
  let album = await albumdb.findOne({ "albumId": albumId });
  let needFlushTracks = true;
  if (album == null) {
    album = {
      "albumId": albumId,
      "albumTitle": albumResp.albumTitle,
      "isFinished": albumResp.isFinished,
      //0:不间断更新 1:连载中 2:完结
      "trackCount": albumResp.trackCount
    };
    await albumdb.insert(album);
  } else {
    await albumdb.update({ "albumId": albumId }, {
      "isFinished": album.isFinished,
      "trackCount": album.trackCount
    });
    album = albumResp;
  }
  const iTrackCount = await trackdb.count({ "albumId": albumId });
  if (album.trackCount == iTrackCount) {
    needFlushTracks = false;
  }
  if (needFlushTracks) {
    let pageSize = 30;
    let total = 1;
    let num = 0;
    log.info("正在获取章节列表");
    for (let pageNum = 1; pageNum <= total; pageNum++) {
      const book = await factory.getDownloader(options.type, false, async (downloader) => {
        return await downloader.getTracksList(albumId, pageNum, pageSize);
      });
      const trackTotalCount = book.trackTotalCount;
      total = Math.floor(trackTotalCount / pageSize) + 1;
      for (let index in book.tracks) {
        num++;
        let track = book.tracks[index];
        const _track = await trackdb.findOne({ "trackId": track.trackId });
        if (_track == null) {
          await trackdb.insert({
            "trackId": track.trackId,
            "title": track.title,
            "albumId": albumId,
            "num": num,
            "path": null
          });
        }
        log.info(`获取章节列中,总章节数:${album.trackCount},当前位置:${num}------>${track.title}`);
      }
    }
    log.info("获取章节列表成功");
  }
  const condition = { "albumId": albumId, path: null };
  await taskCount.set(await trackdb.count({ "albumId": albumId }));
  await finishCount.set(await trackdb.count({
    "albumId": albumId,
    "path": {
      $ne: null
    }
  }));
  await printProgress();
  if (await taskCount.get() == await finishCount.get()) {
    log.info("已经下载完成");
    return;
  }
  log.info("数据加载中...️");
  while (true) {
    const tracks = await trackdb.find(condition, { "num": 1 }, !options.slow ? options.concurrency * 2 : 1);
    if (tracks.length == 0) {
      log.info("已经下载完成");
      break;
    }
    for (const tracksKey in tracks) {
      const track = tracks[tracksKey];
      if (switchMeta2) {
        if (switchMeta2.getStart()) {
          queue.start();
          switchMeta2.setStart(false);
        } else {
          log.info("已暂停");
          queue.pause();
          switchMeta2.setStart(true);
        }
      }
      return queue.add(async () => {
        try {
          return await download(factory, options, album, track);
        } catch (e2) {
          log.info("已暂停");
          queue.clear();
          switchMeta2.setStart(true);
          return;
        }
      });
    }
    if (options.slow) {
      await sleep(Math.floor(Math.random() * (5e3 - 500 + 1)) + 500);
    }
  }
}
const Application = {
  run
};
const downloaderFactory = DownloaderFactory$1.create();
function registerGetQrCodeHandler() {
  electron.ipcMain.handle("getQrCode", async (e2, deviceType) => {
    const downloader = downloaderFactory.getOfflineDownloader(deviceType);
    const result = await downloader._getQrCode();
    return result;
  });
}
function registerGetLoginResultHandler() {
  electron.ipcMain.handle("getLoginResult", async (e2, deviceType, qrId) => {
    const downloader = downloaderFactory.getOfflineDownloader(deviceType);
    const result = await downloader._getLoginResult(qrId);
    let user = null;
    if (result.isSuccess) {
      user = await downloader._getCurrentUser();
      downloader._checkUser(user);
    }
    return {
      isSuccess: result.isSuccess,
      user
    };
  });
}
function registerEnterMainHandler(callback) {
  electron.ipcMain.handle("enterMain", (e2) => {
    const hasOnlineDownloader = downloaderFactory.hasOnlineDownloader();
    callback(hasOnlineDownloader);
    return hasOnlineDownloader;
  });
}
function registerGetCurrentUserHandler(callback) {
  electron.ipcMain.handle("getCurrentUser", async (e2) => {
    return await downloaderFactory.getDownloader(null, false, async (downloader) => {
      if (downloader == null) {
        callback(false);
        return;
      }
      return await downloader._getCurrentUser();
    });
  });
}
function registerExitHandler(callback) {
  electron.ipcMain.handle("exit", (e2) => {
    const downloaderList = downloaderFactory.downloaders;
    if (downloaderList.length != 0) {
      for (const downloaderListKey in downloaderList) {
        let item = downloaderList[downloaderListKey];
        item.downloader.removeCookie();
      }
    }
    callback(false);
  });
}
function registerDownloadHandler() {
  electron.ipcMain.handle("download", async (e2, output, albumId) => {
    switchMeta.setStart(true);
    await Application.run(downloaderFactory, output, albumId, switchMeta);
  });
}
function registerSetDownloadSwitchHandler() {
  electron.ipcMain.handle("downloadSwitch", (e2, isStart) => {
    switchMeta.setStart(isStart);
  });
}
let mainWindow = null;
log.hooks.push((message, transport) => {
  if (transport !== log.transports.file) {
    return message;
  }
  if (message.data[0].includes("password")) {
    return false;
  }
  if (mainWindow != null) {
    mainWindow.webContents.send("logReceive", `[${message.date}] [${message.level}]  ${message.data}`);
  }
  return message;
});
switchMeta.setCallback((isStart) => {
  mainWindow.webContents.send("getSwitch", isStart);
});
async function getSize() {
  const isLogin = await downloaderFactory.hasOnlineDownloader();
  let height;
  let width;
  if (isLogin) {
    width = 1024;
    height = 714;
  } else {
    width = 800;
    height = 780;
  }
  return {
    width,
    height
  };
}
async function createWindow() {
  const size = await getSize();
  let browSerWindow = new electron.BrowserWindow({
    width: size.width,
    height: size.height,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: false
    }
  });
  browSerWindow.on("ready-to-show", () => {
    browSerWindow.show();
  });
  browSerWindow.on("closed", () => {
    browSerWindow = null;
  });
  browSerWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  log.info("url", process.env["ELECTRON_RENDERER_URL"]);
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    await browSerWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    await browSerWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return browSerWindow;
}
electron.app.whenReady().then(async () => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  function isLoginCallback(isLogin2) {
    if (mainWindow == null) {
      return;
    }
    mainWindow.setResizable(true);
    if (isLogin2) {
      mainWindow.setSize(1024, 714);
      mainWindow.webContents.send("route-to", "main");
    } else {
      mainWindow.setSize(800, 670);
      mainWindow.webContents.send("route-to", "login");
    }
  }
  registerGetQrCodeHandler();
  registerGetLoginResultHandler();
  registerEnterMainHandler(isLoginCallback);
  registerGetCurrentUserHandler(isLoginCallback);
  registerExitHandler(isLoginCallback);
  registerDownloadHandler();
  registerSetDownloadSwitchHandler();
  mainWindow = await createWindow();
  const isLogin = await downloaderFactory.hasOnlineDownloader();
  isLoginCallback(isLogin);
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0)
      createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
