"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  getQrCode: (deviceType) => electron.ipcRenderer.invoke("getQrCode", deviceType),
  getLoginResult: (deviceType, qrId) => electron.ipcRenderer.invoke("getLoginResult", deviceType, qrId),
  enterMain: () => electron.ipcRenderer.invoke("enterMain"),
  getCurrentUser: () => electron.ipcRenderer.invoke("getCurrentUser"),
  exit: () => electron.ipcRenderer.invoke("exit"),
  download: (output, albumId) => electron.ipcRenderer.invoke("download", output, albumId),
  logReceive: (callback) => electron.ipcRenderer.on("logReceive", (event, message) => {
    callback(event, message);
  }),
  getSwitch: (callback) => electron.ipcRenderer.on("getSwitch", (event, isStart) => {
    callback(event, isStart);
  })
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
