import {ipcMain} from "electron";
import {DownloaderFactory} from "../main/downloader/electronDownloader.mjs";

const downloaderFactory = DownloaderFactory.create()

function registerGetQrCodeHandler() {
  ipcMain.handle('getQrCode', async (e, deviceType) => {
    const downloader = downloaderFactory.getDownloader(deviceType)
    const result = await downloader._getQrCode()
    return result
  })
}

function registerGetLoginResultHandler() {
  ipcMain.handle('getLoginResult', async (e, deviceType, qrId) => {
    const downloader = downloaderFactory.getDownloader(deviceType)
    const result = await downloader._getLoginResult(qrId)
    let user = null
    if (result.isSuccess) {
      user = await downloader._getCurrentUser()
      downloader._checkUser(user)
    }
    return {
      isSuccess: result.isSuccess,
      user: user
    }
  })
}

function registerEnterMainHandler(callback) {
  ipcMain.handle('enterMain', (e) => {
    const hasOnlineDownloader = downloaderFactory.hasOnlineDownloader()
    callback(hasOnlineDownloader)
    return hasOnlineDownloader
  })
}

export {
  downloaderFactory, registerGetQrCodeHandler, registerGetLoginResultHandler, registerEnterMainHandler
}

