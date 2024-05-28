import {app, shell, BrowserWindow, ipcMain} from 'electron';
import {join} from 'path';
import {electronApp, optimizer, is} from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import log from 'electron-log/main';
import {
  registerGetQrCodeHandler,
  registerGetLoginResultHandler,
  registerEnterMainHandler,
  registerGetCurrentUserHandler,
  registerExitHandler,
  registerDownloadHandler,
  downloaderFactory
} from './ipc';

log.initialize();

async function getSize() {
  const isLogin = await downloaderFactory.hasOnlineDownloader()
  let height;
  let width;
  if (isLogin) {
    width = 1024
    height = 714
  } else {
    width = 800
    height = 780
  }
  return {
    width,
    height
  }
}

async function createWindow() {
  const size = await getSize()

  // Create the browser window.
  let mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? {icon} : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return {action: 'deny'};
  });

  // HMR for renderer based on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  log.info('url', process.env['ELECTRON_RENDERER_URL']);
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return mainWindow;
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  let mainWindow = null;
  // IPC test
  ipcMain.on('ping', () => console.log('pong'));

  function isLoginCallback(isLogin) {
    if (mainWindow == null) {
      return;
    }
    mainWindow.setResizable(true);
    if (isLogin) {
      mainWindow.setSize(1024, 714);
      mainWindow.webContents.send('route-to', 'main');
    } else {
      mainWindow.setSize(800, 670);
      mainWindow.webContents.send('route-to', 'login');
    }
  }

  registerGetQrCodeHandler();
  registerGetLoginResultHandler();
  registerEnterMainHandler(isLoginCallback);
  registerGetCurrentUserHandler(isLoginCallback);
  registerExitHandler(isLoginCallback);
  registerDownloadHandler()

  mainWindow = await createWindow();
  const isLogin = await downloaderFactory.hasOnlineDownloader()
  isLoginCallback(isLogin)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
