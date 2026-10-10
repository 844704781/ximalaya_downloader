/**
 * api.js —— window.xmd 的唯一封装层。
 *
 * 渲染层所有与主进程的通信都必须经过这里，好处：
 *  1. 统一剥掉 Electron 的错误前缀，把 `Error invoking remote method 'task:create': Error: 尚未登录喜马拉雅`
 *     变成用户能看懂的 `尚未登录喜马拉雅`。
 *  2. window.xmd 缺失（preload 未注入）时给出明确提示，而不是 `Cannot read properties of undefined`。
 *  3. 保持方法调用时的 this 绑定（调用的是宿主对象上的方法）。
 *
 * 注意：本文件不得引入任何 npm 依赖或 Node 内置模块。
 */

/** window.xmd 不存在时的提示文案。 */
const MISSING_API = '未能连接到主进程（window.xmd 未注入），请重启应用后重试。'

/** Electron 包装前缀："Error invoking remote method 'task:create': " */
const REMOTE_PREFIX_RE = /^Error invoking remote method '[^']*':\s*/
/** 常见 Error 前缀："Error: " / "TypeError: " 等。 */
const ERROR_PREFIX_RE = /^(?:Error|TypeError|RangeError|ReferenceError|SyntaxError|DOMException):\s*/

/** 渲染层是否有可用的主进程桥接。 */
export function hasApi() {
  return typeof window !== 'undefined' && !!window.xmd
}

/**
 * 把任意错误整理成 message 干净、适合直接展示给用户的 Error。
 * @param {unknown} err
 * @returns {Error}
 */
export function normalizeError(err) {
  const raw =
    err === null || err === undefined
      ? ''
      : typeof err === 'string'
        ? err
        : err.message || String(err)

  let message = String(raw)
  // 反复剥离，兼容 "Error invoking remote method 'x': Error: Error: xxx" 这类多层包装
  for (let i = 0; i < 4; i += 1) {
    const next = message.replace(REMOTE_PREFIX_RE, '').replace(ERROR_PREFIX_RE, '')
    if (next === message) break
    message = next
  }
  message = message.trim() || '操作失败，请稍后重试'

  if (err instanceof Error) {
    try {
      err.message = message
    } catch {
      // 某些内置错误对象的 message 只读，忽略即可
    }
    return err
  }
  return new Error(message)
}

/** 取出 window.xmd。 */
function getRoot() {
  if (typeof window === 'undefined' || !window.xmd) throw new Error(MISSING_API)
  return window.xmd
}

/**
 * 按 'auth.status' 这样的路径找到宿主对象和方法，保证 this 指向正确。
 * @param {string} path
 */
function resolve(path) {
  const parts = String(path).split('.')
  let owner = getRoot()
  for (let i = 0; i < parts.length - 1; i += 1) {
    owner = owner ? owner[parts[i]] : undefined
    if (!owner) throw new Error(MISSING_API)
  }
  const fn = owner ? owner[parts[parts.length - 1]] : undefined
  if (typeof fn !== 'function') throw new Error(MISSING_API)
  return { owner, fn }
}

/**
 * 调用主进程方法并统一处理错误。
 * @param {string} path
 * @param {...unknown} args
 */
async function call(path, ...args) {
  try {
    const { owner, fn } = resolve(path)
    return await fn.apply(owner, args)
  } catch (err) {
    throw normalizeError(err)
  }
}

/**
 * 订阅主进程事件。这是同步方法，返回退订函数。
 * @param {string} channel
 * @param {(payload: unknown) => void} handler
 * @returns {() => void}
 */
function on(channel, handler) {
  try {
    const { owner, fn } = resolve('events.on')
    const off = fn.call(owner, channel, handler)
    return typeof off === 'function' ? off : () => {}
  } catch (err) {
    throw normalizeError(err)
  }
}

export const api = {
  hasApi,
  normalizeError,

  auth: {
    /** @returns {Promise<{web: object, pc: object}>} */
    status: () => call('auth.status'),
    /** @param {'web'|'pc'} type */
    qrcode: (type) => call('auth.qrcode', type),
    /** @param {'web'|'pc'} type @param {string} qrId */
    check: (type, qrId) => call('auth.check', type, qrId),
    /** @param {'web'|'pc'} type @param {string} raw */
    saveCookie: (type, raw) => call('auth.saveCookie', type, raw),
    /** @param {'web'|'pc'} type */
    logout: (type) => call('auth.logout', type)
  },

  settings: {
    get: () => call('settings.get'),
    /** @param {object} patch */
    set: (patch) => call('settings.set', patch)
  },

  dialog: {
    /** @returns {Promise<string|null>} */
    chooseDir: () => call('dialog.chooseDir')
  },

  task: {
    list: () => call('task.list'),
    /** @param {string} albumId @param {{page?: number, pageSize?: number, filter?: string}} query */
    tracks: (albumId, query) => call('task.tracks', albumId, query),
    /** @param {{albumId: string, output?: string, concurrency?: number, slow?: boolean}} payload */
    create: (payload) => call('task.create', payload),
    /** @param {string} taskId */
    pause: (taskId) => call('task.pause', taskId),
    /** @param {string} taskId */
    resume: (taskId) => call('task.resume', taskId),
    /** @param {string} taskId */
    cancel: (taskId) => call('task.cancel', taskId),
    /** @param {string} albumId */
    retry: (albumId) => call('task.retry', albumId),
    /** @param {string} albumId @param {boolean} deleteRecords */
    remove: (albumId, deleteRecords) => call('task.remove', albumId, deleteRecords),
    /** @param {string} albumId */
    openDir: (albumId) => call('task.openDir', albumId)
  },

  events: { on }
}
