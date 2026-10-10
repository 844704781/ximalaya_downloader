import {contextBridge, ipcRenderer} from 'electron'

/**
 * 预加载脚本
 *
 * 只暴露白名单方法，不把 ipcRenderer 直接交给渲染进程。
 * 渲染进程拿不到任何 Node 能力，所有文件/网络操作都必须走这里定义的通道。
 *
 * 构建产物是 out/preload/index.mjs —— "type": "module" 时 electron-vite
 * 会把 preload 输出成 .mjs，主进程里引用时要用这个扩展名。
 */

// 允许订阅的事件通道
const EVENT_CHANNELS = ['evt:state', 'evt:progress', 'evt:track', 'evt:log']

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

const api = {
    auth: {
        status: () => invoke('auth:status'),
        qrcode: type => invoke('auth:qrcode', type),
        check: (type, qrId) => invoke('auth:check', type, qrId),
        saveCookie: (type, raw) => invoke('auth:cookie', type, raw),
        logout: type => invoke('auth:logout', type)
    },
    settings: {
        get: () => invoke('settings:get'),
        set: patch => invoke('settings:set', patch)
    },
    dialog: {
        chooseDir: () => invoke('dialog:chooseDir')
    },
    task: {
        list: () => invoke('task:list'),
        tracks: (albumId, options) => invoke('task:tracks', albumId, options),
        create: options => invoke('task:create', options),
        pause: taskId => invoke('task:pause', taskId),
        resume: taskId => invoke('task:resume', taskId),
        cancel: taskId => invoke('task:cancel', taskId),
        retry: albumId => invoke('task:retry', albumId),
        remove: (albumId, deleteRecords) => invoke('task:remove', albumId, deleteRecords),
        openDir: albumId => invoke('task:openDir', albumId)
    },
    events: {
        /**
         * 订阅主进程事件
         * @param channel 必须是白名单内的通道
         * @param callback (payload) => void
         * @returns {Function} 取消订阅
         */
        on: (channel, callback) => {
            if (!EVENT_CHANNELS.includes(channel)) {
                throw new Error(`不支持的事件通道: ${channel}`)
            }
            const listener = (_event, payload) => callback(payload)
            ipcRenderer.on(channel, listener)
            return () => ipcRenderer.off(channel, listener)
        }
    }
}

if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('xmd', api)
    } catch (e) {
        console.error('暴露 preload API 失败:', e)
    }
} else {
    window.xmd = api
}
