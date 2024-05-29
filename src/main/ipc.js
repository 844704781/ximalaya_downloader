import {ipcMain} from "electron";
import {DownloaderFactory} from "../main/downloader/electronDownloader.mjs";
import {Application} from "../main/downloader/application.mjs";
import {switchMeta} from "../main/common/switchMeta.mjs"

const downloaderFactory = DownloaderFactory.create()

function registerGetQrCodeHandler() {
  ipcMain.handle('getQrCode', async (e, deviceType) => {
    const downloader = downloaderFactory.getOfflineDownloader(deviceType)
    const result = await downloader._getQrCode()
    return result
  })
}

function registerGetLoginResultHandler() {
  ipcMain.handle('getLoginResult', async (e, deviceType, qrId) => {
    const downloader = downloaderFactory.getOfflineDownloader(deviceType)
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

function registerGetCurrentUserHandler(callback) {
  ipcMain.handle('getCurrentUser', async (e) => {
    return await downloaderFactory.getDownloader(null, false, async downloader => {
      if (downloader == null) {
        callback(false)
        return
      }
      return await downloader._getCurrentUser()
    })
  })
}

function registerExitHandler(callback) {
  ipcMain.handle('exit', (e) => {
    const downloaderList = downloaderFactory.downloaders
    if (downloaderList.length != 0) {
      for (const downloaderListKey in downloaderList) {
        let item = downloaderList[downloaderListKey]
        item.downloader.removeCookie()
      }
    }
    callback(false)
  })
}


function registerDownloadHandler() {
  ipcMain.handle('download', async (e, output, albumId) => {
    switchMeta.setStart(true)
    await Application.run(downloaderFactory, output, albumId, switchMeta)
  })
}

function registerSetDownloadSwitchHandler() {
  ipcMain.handle('downloadSwitch', (e, isStart) => {
    switchMeta.setStart(isStart)
  })
}

export {
  downloaderFactory,
  registerGetQrCodeHandler,
  registerGetLoginResultHandler,
  registerEnterMainHandler,
  registerGetCurrentUserHandler,
  registerExitHandler,
  registerDownloadHandler,
  registerSetDownloadSwitchHandler
}

