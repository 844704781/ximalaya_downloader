import {contextBridge, ipcRenderer} from 'electron'
import {electronAPI} from '@electron-toolkit/preload'
import {switchMeta} from "../main/common/switchMeta.mjs"

// Custom APIs for renderer
const api = {
  getQrCode: (deviceType) => ipcRenderer.invoke('getQrCode', deviceType),
  getLoginResult: (deviceType, qrId) => ipcRenderer.invoke('getLoginResult', deviceType, qrId),
  enterMain: () => ipcRenderer.invoke('enterMain'),
  getCurrentUser: () => ipcRenderer.invoke('getCurrentUser'),
  exit: () => ipcRenderer.invoke('exit'),
  download: (output, albumId) => ipcRenderer.invoke('download', output, albumId),
  logReceive: (callback) => ipcRenderer.on('logReceive', (event, message) => {
    callback(event, message)
  }),
  getSwitch: (callback) => ipcRenderer.on('getSwitch', (event, isStart) => {
    callback(event, isStart)
  })
}


// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
