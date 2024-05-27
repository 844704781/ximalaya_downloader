import {app, shell, BrowserWindow, ipcMain} from 'electron'
import {join} from 'path'
import {electronApp, optimizer, is} from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import log from 'electron-log/main';
import {registerGetQrCodeHandler, registerGetLoginResultHandler, registerEnterMainHandler} from './ipc'

log.initialize();

function createWindow() {
  // Create the browser window.
  let mainWindow = new BrowserWindow({
    width: 800,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? {icon} : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return {action: 'deny'}
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  log.info('url', process.env['ELECTRON_RENDERER_URL'])
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return mainWindow
}


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  let mainWindow = null
  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  registerGetQrCodeHandler()
  registerGetLoginResultHandler()
  registerEnterMainHandler(hasOnlineDownloader => {
    if (mainWindow == null) {
      return
    }
    mainWindow.setResizable(true)
    if (hasOnlineDownloader) {
      mainWindow.setSize(1024, 714)
    }
  })
  mainWindow = createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

//
// function registerLoginHandler() {
//
//   ipcMain.handle('getQrCode', async (e, deviceType) => {
//     const downloader = downloaderFactory.getDownloader(deviceType)
//     const result = await downloader._getQrCode()
//     return result
//   })
//
//   ipcMain.handle('getLoginResult', async (e, deviceType, qrId) => {
//     const downloader = downloaderFactory.getDownloader(deviceType)
//     const result = await downloader._getLoginResult(qrId)
//     let user = null
//     if (result.isSuccess) {
//       user = await downloader._getCurrentUser()
//       downloader._checkUser(user)
//     }
//     return {
//       isSuccess: result.isSuccess,
//       user: user
//     }
//   })
//
//   ipcMain.handle('enterMain', async (e) => {
//     const hasOnlineDownloader = downloaderFactory.hasOnlineDownloader()
//   })
// }