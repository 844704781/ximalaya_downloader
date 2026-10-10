/**
 * store.js —— 模块级的全局状态与动作（不用 pinia，只用 vue 的 reactive / computed 能力）。
 *
 * 关键设计：
 *  1. 所有章节分页数据按 albumId 缓存在 state.trackPages 里，默认不加载，卡片展开时才拉第一页。
 *  2. 主进程推送的事件统一按 albumId 匹配（evt:state 里的 taskId 可能还是旧的/占位的），
 *     找不到对应专辑时做一次防抖的列表刷新，避免漏掉主进程新建的任务。
 *  3. 订阅函数被保存下来，disposeStore() / HMR dispose 时退订，避免重复订阅。
 *  4. 暂停是异步的：点击后立刻把专辑置为 pausing 并把在途章节的进度清零，
 *     直到 evt:state 报 paused 才彻底停下来。
 *
 * 进度口径（重要）：专辑总进度一律用 已完成章节数 / 章节总数（done / total），
 * 绝不用字节数——因为暂停会丢弃在途章节已下载的字节，用字节会让进度条倒退。
 */

import { reactive } from 'vue'
import { api, normalizeError } from './api.js'

/** 章节明细每页行数（不要一次渲染上千行）。 */
export const TRACK_PAGE_SIZE = 200
/** 日志最多保留条数。 */
const MAX_LOGS = 200
/** 最多同时显示的提示条数。 */
const MAX_TOASTS = 4

/**
 * 章节筛选。值直接透传给主进程 task.tracks(albumId, { filter })。
 * 若主进程使用的枚举名不同，只需要改这里的 value。
 */
export const TRACK_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '未完成' },
  { value: 'failed', label: '失败' }
]

export const ALBUM_STATUS_LABELS = {
  idle: '未开始',
  running: '下载中',
  pausing: '暂停中',
  paused: '已暂停',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消'
}

export const TRACK_STATUS_LABELS = {
  pending: '待下载',
  downloading: '下载中',
  done: '已完成',
  failed: '失败'
}

/** 专辑卡片字段，事件里出现时才覆盖。 */
const ALBUM_FIELDS = [
  'taskId',
  'albumTitle',
  'status',
  'total',
  'done',
  'failed',
  'output',
  'concurrency',
  'slow',
  'type'
]

function emptyChannel(type) {
  return { logged: false, label: type === 'web' ? '网页端' : '电脑端', error: '', user: null }
}

export const state = reactive({
  /** { web: ChannelState, pc: ChannelState } */
  auth: { web: emptyChannel('web'), pc: emptyChannel('pc') },
  authLoading: false,
  /** Settings（默认值与主进程 settingsStore.DEFAULTS 保持一致） */
  settings: { output: '', concurrency: 5, slow: false, type: null },
  settingsLoaded: false,
  /** AlbumView[] */
  albums: [],
  albumsLoading: false,
  /** albumId -> { total, page, pageSize, filter, rows, loading, loaded, error } */
  trackPages: {},
  /** albumId -> true：已经点了暂停、但主进程还没确认 paused */
  pauseRequested: {},
  /** { level, message, albumId, taskId, at }[]，最多 200 条 */
  logs: [],
  /** { id, message, type }[] */
  toasts: []
})

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function toCount(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function channelLabel(type) {
  return type === 'pc' ? '电脑端' : '网页端'
}

export function albumStatusTone(status) {
  if (status === 'running') return 'active'
  if (status === 'done') return 'ok'
  if (status === 'pausing' || status === 'paused') return 'warn'
  if (status === 'failed') return 'err'
  return 'mute'
}

/**
 * 没有活动任务、可以（重新）开始下载的状态。
 * done 也放进来：文件被用户删掉或移动后，重新开始会触发主进程的
 * _normalizeRecords() 把缺失的章节退回 pending 并重新下载。
 */
export function isStartable(status) {
  return status === 'idle' || status === 'cancelled' || status === 'done'
}

export function trackStatusTone(status) {
  if (status === 'done') return 'ok'
  if (status === 'downloading') return 'active'
  if (status === 'failed') return 'err'
  return 'mute'
}

/** 专辑总进度：必须是 已完成章节 / 章节总数。 */
export function albumPercent(album) {
  const total = Number(album && album.total) || 0
  const done = Number(album && album.done) || 0
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.floor((done / total) * 100)))
}

export function formatBytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${Math.floor(n)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`
}

export function formatClock(at) {
  const ms = Number(at)
  const date = new Date(Number.isFinite(ms) && ms > 0 ? ms : Date.now())
  const pad = (v) => String(v).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * albumId 可能是纯数字也可能是字符串，前端一律按字符串处理（绝不 parseInt）。
 * 顺便兼容用户直接粘贴专辑链接的情况。
 */
export function normalizeAlbumId(input) {
  let value = String(input === null || input === undefined ? '' : input).trim()
  if (!value) return ''
  const fromUrl = value.match(/album\/([^/?#]+)/i)
  if (fromUrl) value = fromUrl[1]
  return value.replace(/[/?#].*$/, '').trim()
}

/* ------------------------------------------------------------------ *
 * Toast 提示
 * ------------------------------------------------------------------ */

let toastSeq = 0

/**
 * @param {string} message
 * @param {'success'|'error'|'warn'|'info'} [type]
 * @param {number} [timeout] 毫秒，<= 0 表示不自动关闭
 */
export function pushToast(message, type = 'info', timeout = 4200) {
  const text = String(message === null || message === undefined ? '' : message).trim() || '未知错误'
  const id = (toastSeq += 1)
  state.toasts.push({ id, message: text, type })
  if (state.toasts.length > MAX_TOASTS) {
    state.toasts.splice(0, state.toasts.length - MAX_TOASTS)
  }
  if (timeout > 0) {
    setTimeout(() => dismissToast(id), timeout)
  }
  return id
}

export function dismissToast(id) {
  const index = state.toasts.findIndex((t) => t.id === id)
  if (index >= 0) state.toasts.splice(index, 1)
}

/** 统一处理 catch 到的错误：弹提示 + 写日志。 */
function reportError(err, fallback = '操作失败') {
  const error = normalizeError(err)
  pushToast(error.message || fallback, 'error')
  pushLocalLog('error', error.message || fallback)
  return error
}

function pushLocalLog(level, message) {
  state.logs.push({
    level,
    message: String(message === null || message === undefined ? '' : message),
    albumId: null,
    taskId: null,
    at: Date.now()
  })
  if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS)
}

/* ------------------------------------------------------------------ *
 * 专辑列表
 * ------------------------------------------------------------------ */

export function findAlbum(albumId) {
  const key = String(albumId)
  return state.albums.find((album) => String(album.albumId) === key) || null
}

function normalizeAlbum(album) {
  const src = album || {}
  return {
    taskId: src.taskId === null || src.taskId === undefined ? '' : String(src.taskId),
    albumId: src.albumId === null || src.albumId === undefined ? '' : String(src.albumId),
    albumTitle: src.albumTitle === null || src.albumTitle === undefined ? null : String(src.albumTitle),
    status: src.status || 'idle',
    total: toCount(src.total),
    done: toCount(src.done),
    failed: toCount(src.failed),
    output: src.output === undefined ? null : src.output,
    concurrency: toCount(src.concurrency),
    slow: !!src.slow,
    type: src.type === undefined ? null : src.type
  }
}

function upsertAlbum(album) {
  if (!album || !album.albumId) return null
  const existing = findAlbum(album.albumId)
  if (existing) {
    Object.assign(existing, album)
    return existing
  }
  const created = { ...album }
  state.albums.unshift(created)
  return created
}

function applyAlbumPatch(album, patch) {
  if (!album || !patch) return
  for (const field of ALBUM_FIELDS) {
    if (patch[field] !== undefined && patch[field] !== null) {
      album[field] = patch[field]
    }
  }
  album.total = toCount(album.total)
  album.done = toCount(album.done)
  album.failed = toCount(album.failed)
}

/** 列表里已经不存在的专辑，把其章节缓存删掉。 */
function pruneTrackPages() {
  const ids = new Set(state.albums.map((album) => String(album.albumId)))
  for (const key of Object.keys(state.trackPages)) {
    if (!ids.has(key)) delete state.trackPages[key]
  }
}

export async function loadAlbums() {
  state.albumsLoading = true
  try {
    const list = await api.task.list()
    const rows = Array.isArray(list) ? list : []
    state.albums = rows.map(normalizeAlbum)
    pruneTrackPages()
    return state.albums
  } catch (err) {
    reportError(err, '获取下载列表失败')
    return undefined
  } finally {
    state.albumsLoading = false
  }
}

let albumsRefreshTimer = null

/** 收到未知专辑的事件时，防抖刷新一次列表。 */
function scheduleAlbumsRefresh() {
  if (albumsRefreshTimer) return
  albumsRefreshTimer = setTimeout(() => {
    albumsRefreshTimer = null
    loadAlbums()
  }, 400)
}

/* ------------------------------------------------------------------ *
 * 章节分页缓存
 * ------------------------------------------------------------------ */

const pageRequestSeq = {}

function createTrackPage() {
  return {
    total: 0,
    page: 1,
    pageSize: TRACK_PAGE_SIZE,
    filter: 'all',
    rows: [],
    loading: false,
    loaded: false,
    error: null
  }
}

/** 取某个专辑的章节缓存（可能为 null，表示还没加载过）。 */
export function trackPage(albumId) {
  return state.trackPages[String(albumId)] || null
}

function normalizeTrack(row) {
  const src = row || {}
  return {
    trackId: src.trackId === null || src.trackId === undefined ? '' : String(src.trackId),
    num: toCount(src.num),
    title: src.title === null || src.title === undefined ? '' : String(src.title),
    status: src.status || 'pending',
    path: src.path === undefined ? null : src.path,
    error: src.error === undefined ? null : src.error,
    received: toCount(src.received),
    /* 单集文件总字节数（来自 TrackPatch.total），未知为 0 */
    bytes: toCount(src.total)
  }
}

/**
 * 拉取某专辑的章节分页。
 * @param {string} albumId
 * @param {{page?: number, pageSize?: number, filter?: string}} [patch]
 */
export async function loadTracks(albumId, patch = {}) {
  const key = String(albumId)
  if (!state.trackPages[key]) state.trackPages[key] = createTrackPage()
  const cache = state.trackPages[key]

  if (patch.pageSize) cache.pageSize = toCount(patch.pageSize) || TRACK_PAGE_SIZE
  if (patch.page) cache.page = toCount(patch.page) || 1
  if (patch.filter) cache.filter = patch.filter

  const requestId = (pageRequestSeq[key] || 0) + 1
  pageRequestSeq[key] = requestId
  cache.loading = true
  cache.error = null

  try {
    const res = await api.task.tracks(key, {
      page: cache.page,
      pageSize: cache.pageSize,
      filter: cache.filter
    })
    if (pageRequestSeq[key] !== requestId) return cache // 已有更新的请求，丢弃这次结果
    const rows = res && Array.isArray(res.rows) ? res.rows : []
    cache.rows = rows.map(normalizeTrack)
    cache.total = toCount(res && res.total)
    cache.page = toCount(res && res.page) || cache.page
    cache.pageSize = toCount(res && res.pageSize) || cache.pageSize
    cache.loaded = true
    return cache
  } catch (err) {
    if (pageRequestSeq[key] === requestId) {
      cache.error = normalizeError(err).message
      reportError(err, '获取章节列表失败')
    }
    return cache
  } finally {
    if (pageRequestSeq[key] === requestId) cache.loading = false
  }
}

/** 卡片第一次展开时调用；已加载过就直接返回缓存。 */
export function ensureTracks(albumId) {
  const key = String(albumId)
  const cache = state.trackPages[key]
  if (cache && cache.loaded && !cache.error) return Promise.resolve(cache)
  return loadTracks(key, { page: 1 })
}

/** 用当前页/筛选条件重新拉一次。 */
export function refreshTracks(albumId) {
  const key = String(albumId)
  const cache = state.trackPages[key]
  if (!cache || !cache.loaded) return Promise.resolve(null)
  return loadTracks(key, { page: cache.page, filter: cache.filter })
}

/** 切换筛选时回到第 1 页。 */
export function setTrackFilter(albumId, filter) {
  return loadTracks(String(albumId), { filter, page: 1 })
}

/** 翻页。 */
export function goTrackPage(albumId, page) {
  const next = Math.max(1, toCount(page) || 1)
  return loadTracks(String(albumId), { page: next })
}

/**
 * 规则 2：暂停瞬间把在途章节的进度显示立刻归零，并显示为「待下载」。
 * 主进程会把这些章节的状态改回 pending，前端不等待它，先动。
 */
function resetInflightTracks(albumId) {
  const cache = state.trackPages[String(albumId)]
  if (!cache || !Array.isArray(cache.rows)) return
  for (const row of cache.rows) {
    if (row.status === 'downloading') {
      row.status = 'pending'
      row.received = 0
      row.bytes = 0
      row.error = null
    }
  }
}

/* ------------------------------------------------------------------ *
 * 主进程事件
 * ------------------------------------------------------------------ */

function setPauseRequested(albumId, value) {
  const key = String(albumId)
  if (value) state.pauseRequested[key] = true
  else delete state.pauseRequested[key]
}

function handleState(payload) {
  if (!payload || payload.albumId === null || payload.albumId === undefined) return
  const albumId = String(payload.albumId)
  const album = findAlbum(albumId)
  if (!album) {
    scheduleAlbumsRefresh()
    return
  }
  applyAlbumPatch(album, payload)

  if (album.status === 'paused') {
    // 暂停已生效：把还在显示「下载中」的行清零
    resetInflightTracks(albumId)
    return
  }
  if (album.status !== 'pausing') {
    // running / idle / done / failed 都说明暂停请求已经结束
    setPauseRequested(albumId, false)
  }
  if (album.status === 'done' && state.trackPages[albumId] && state.trackPages[albumId].loaded) {
    refreshTracks(albumId)
  }
}

function handleProgress(payload) {
  if (!payload || payload.albumId === null || payload.albumId === undefined) return
  const album = findAlbum(String(payload.albumId))
  if (!album) {
    scheduleAlbumsRefresh()
    return
  }
  applyAlbumPatch(album, { total: payload.total, done: payload.done, failed: payload.failed })
}

function applyTrackPatch(row, patch, pauseRequested) {
  if (patch.title !== undefined && patch.title !== null) row.title = String(patch.title)
  if (patch.num !== undefined && patch.num !== null) row.num = toCount(patch.num)
  if (patch.path !== undefined) row.path = patch.path

  const nextStatus = patch.status === undefined || patch.status === null ? row.status : patch.status

  if (pauseRequested && nextStatus === 'downloading') {
    // 暂停已经发出，但主进程的「改回 pending」补丁还没到：一律显示为待下载
    row.status = 'pending'
    row.received = 0
    row.bytes = 0
    row.error = null
    return
  }

  row.status = nextStatus

  if (nextStatus === 'downloading') {
    if (Number.isFinite(Number(patch.received))) row.received = toCount(patch.received)
    if (Number.isFinite(Number(patch.total))) row.bytes = toCount(patch.total)
  } else if (nextStatus === 'done') {
    const size = toCount(patch.total) || toCount(patch.received) || row.bytes
    row.bytes = size
    row.received = size
  } else if (nextStatus === 'pending') {
    row.received = 0
    if (Number.isFinite(Number(patch.total))) row.bytes = toCount(patch.total)
  }

  if (patch.error !== undefined) row.error = patch.error
  if (row.status !== 'failed') row.error = null
}

function handleTrack(patches) {
  const list = Array.isArray(patches) ? patches : patches ? [patches] : []
  for (const patch of list) {
    if (!patch || patch.albumId === null || patch.albumId === undefined) continue
    if (patch.trackId === null || patch.trackId === undefined) continue
    const albumId = String(patch.albumId)
    const cache = state.trackPages[albumId]
    // 该专辑的章节明细还没展开过：忽略
    if (!cache || !Array.isArray(cache.rows) || cache.rows.length === 0) continue
    const trackId = String(patch.trackId)
    const row = cache.rows.find((item) => String(item.trackId) === trackId)
    if (!row) continue
    applyTrackPatch(row, patch, !!state.pauseRequested[albumId])
  }
}

function handleLog(payload) {
  if (!payload) return
  state.logs.push({
    level: payload.level || 'info',
    message: String(payload.message === null || payload.message === undefined ? '' : payload.message),
    albumId: payload.albumId === null || payload.albumId === undefined ? null : String(payload.albumId),
    taskId: payload.taskId === undefined ? null : payload.taskId,
    at: Number(payload.at) || Date.now()
  })
  if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS)
}

/* ------------------------------------------------------------------ *
 * 订阅 / 初始化
 * ------------------------------------------------------------------ */

let unsubscribers = []
let initPromise = null

function subscribeEvents() {
  if (unsubscribers.length > 0) return
  const subs = [
    ['evt:state', handleState],
    ['evt:progress', handleProgress],
    ['evt:track', handleTrack],
    ['evt:log', handleLog]
  ]
  for (const [channel, handler] of subs) {
    try {
      const off = api.events.on(channel, handler)
      if (typeof off === 'function') unsubscribers.push(off)
    } catch (err) {
      reportError(err, '订阅主进程事件失败')
      break
    }
  }
}

/** 退订全部事件，供 HMR / 卸载时调用。 */
export function disposeStore() {
  for (const off of unsubscribers) {
    try {
      off()
    } catch {
      // 忽略退订异常
    }
  }
  unsubscribers = []
  if (albumsRefreshTimer) {
    clearTimeout(albumsRefreshTimer)
    albumsRefreshTimer = null
  }
  initPromise = null
}

/** 首次加载 + 订阅事件；重复调用不会重复订阅。 */
export function initStore() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    subscribeEvents()
    await Promise.all([loadSettings(), loadAuth(), loadAlbums()])
  })()
  return initPromise
}

if (import.meta.hot) {
  // HMR 时旧模块会被替换，这里先退订，避免同一事件被订阅多次
  import.meta.hot.dispose(() => disposeStore())
}

/* ------------------------------------------------------------------ *
 * 设置
 * ------------------------------------------------------------------ */

export async function loadSettings() {
  try {
    const settings = await api.settings.get()
    if (settings && typeof settings === 'object') Object.assign(state.settings, settings)
    if (!Number.isFinite(Number(state.settings.concurrency))) state.settings.concurrency = 3
    state.settingsLoaded = true
    return state.settings
  } catch (err) {
    state.settingsLoaded = true
    reportError(err, '读取设置失败')
    return undefined
  }
}

/**
 * 局部更新设置。先乐观更新本地，失败则回滚并提示。
 * @param {object} patch
 */
export async function updateSettings(patch) {
  if (!patch || typeof patch !== 'object') return undefined
  const previous = { ...state.settings }
  Object.assign(state.settings, patch)
  try {
    const settings = await api.settings.set(patch)
    if (settings && typeof settings === 'object') Object.assign(state.settings, settings)
    return state.settings
  } catch (err) {
    Object.assign(state.settings, previous)
    reportError(err, '保存设置失败')
    return undefined
  }
}

/**
 * 界面上应当显示的下载目录。
 *
 * 优先用 outputLabel（用户自己选的位置）——受限环境下 main 进程可能把
 * output 换成项目内的「目录联接」路径，那个内部路径显示出来会让人莫名其妙。
 */
export function outputDisplay() {
  const s = state.settings
  if (!s) return ''
  return s.outputLabel || s.output || ''
}

/** 选择下载目录并保存。 */
export async function chooseOutputDir() {
  try {
    const dir = await api.dialog.chooseDir()
    if (!dir) return null // 用户取消
    await updateSettings({ output: dir })
    // 主进程在目录不可直写时会建立「目录联接」：output 变成项目内的联接路径，
    // outputLabel 保留用户选的位置。用这两个字段是否相等来判断有没有发生映射。
    const s = state.settings
    const mapped = !!(s.output && s.outputLabel && s.output !== s.outputLabel)
    if (mapped) {
      pushToast(
        `「${dir}」不可直写，已自动建立目录联接绕过限制，文件仍会保存在该位置`,
        'warn',
        12000
      )
    } else {
      pushToast('下载目录已更新', 'success')
    }
    return dir
  } catch (err) {
    reportError(err, '选择目录失败')
    return null
  }
}

/* ------------------------------------------------------------------ *
 * 登录
 * ------------------------------------------------------------------ */

export async function loadAuth() {
  state.authLoading = true
  try {
    const res = await api.auth.status()
    for (const type of ['web', 'pc']) {
      const channel = res ? res[type] : null
      state.auth[type] = channel
        ? { ...emptyChannel(type), ...channel }
        : emptyChannel(type)
    }
    return state.auth
  } catch (err) {
    reportError(err, '获取登录状态失败')
    return undefined
  } finally {
    state.authLoading = false
  }
}

export async function saveCookie(type, raw) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim()
  if (!text) {
    pushToast('请先粘贴 Cookie 内容', 'warn')
    return undefined
  }
  try {
    const res = await api.auth.saveCookie(type, text)
    pushToast(`${channelLabel(type)} Cookie 已保存（${toCount(res && res.count)} 条）`, 'success')
    await loadAuth()
    return res
  } catch (err) {
    reportError(err, `${channelLabel(type)} Cookie 保存失败`)
    return undefined
  }
}

export async function logout(type) {
  try {
    await api.auth.logout(type)
    pushToast(`${channelLabel(type)}已退出登录`, 'success')
    await loadAuth()
  } catch (err) {
    reportError(err, '退出登录失败')
  }
}

/* ------------------------------------------------------------------ *
 * 下载任务
 * ------------------------------------------------------------------ */

/** 只有拿到真实 taskId（不是 'album:<albumId>' 占位符）才允许控制任务。 */
function taskIdOf(album) {
  if (!album) return ''
  const id = album.taskId === null || album.taskId === undefined ? '' : String(album.taskId)
  if (!id) return ''
  return id === `album:${album.albumId}` ? '' : id
}

/**
 * 创建下载任务。
 * @param {{albumId: string, output?: string, concurrency?: number, slow?: boolean}} payload
 */
export async function createTask(payload = {}) {
  const albumId = normalizeAlbumId(payload.albumId)
  if (!albumId) {
    pushToast('请先填写专辑 ID', 'warn')
    return undefined
  }
  const body = { albumId }
  if (payload.output) body.output = payload.output
  const concurrency = Number(payload.concurrency)
  if (Number.isFinite(concurrency) && concurrency >= 1 && concurrency <= 20) {
    body.concurrency = Math.round(concurrency)
  }
  if (typeof payload.slow === 'boolean') body.slow = payload.slow

  try {
    const album = await api.task.create(body)
    if (album && album.albumId !== undefined && album.albumId !== null) {
      upsertAlbum(normalizeAlbum(album))
    }
    pushToast(`已添加下载任务：${(album && album.albumTitle) || albumId}`, 'success')
    await loadAlbums()
    return album
  } catch (err) {
    reportError(err, '创建下载任务失败')
    return undefined
  }
}

/**
 * 暂停：点击后立刻显示「暂停中…」并把在途章节进度清零，
 * 等 evt:state 报 paused 之后按钮才变成「继续下载」。
 */
export async function pauseTask(albumId) {
  const album = findAlbum(albumId)
  if (!album) return
  const key = album.albumId
  const taskId = taskIdOf(album)

  setPauseRequested(key, true)
  album.status = 'pausing'
  resetInflightTracks(key)

  if (!taskId) {
    setPauseRequested(key, false)
    pushToast('该专辑当前没有正在进行的下载任务', 'warn')
    await loadAlbums()
    return
  }
  try {
    await api.task.pause(taskId)
    // 兜底：如果任务在点击的同一瞬间刚好结束，主进程的 pause() 会直接返回而不发任何事件，
    // 界面就会一直停在「暂停中…」。这里延迟同步一次列表，确保状态最终收敛。
    setTimeout(() => {
      const current = findAlbum(key)
      if (current && current.status === 'pausing') loadAlbums()
    }, 2500)
  } catch (err) {
    setPauseRequested(key, false)
    reportError(err, '暂停失败')
    await loadAlbums()
  }
}

/** 继续下载（恢复）。 */
export async function resumeTask(albumId) {
  const album = findAlbum(albumId)
  if (!album) return undefined
  const key = album.albumId
  const taskId = taskIdOf(album)
  let resumeError = null

  if (taskId) {
    // 先乐观更新，让按钮立刻变成「暂停」。
    // 注意不要写成 await 之后再改 album.status —— 一旦那个 await 挂很久
    // （后端曾经会一直阻塞到下载结束），落地时就会把期间已经变成 paused
    // 的状态又覆盖回 running，造成界面与后端错位。
    // 真正的状态以 evt:state 推送为准。
    setPauseRequested(key, false)
    album.status = 'running'
    try {
      await api.task.resume(taskId)
      pushToast('已继续下载', 'success')
      return album
    } catch (err) {
      resumeError = normalizeError(err)
      // 乐观更新失败，用后端的真实状态纠正回来
      await loadAlbums()
    }
  }

  // 兜底：该专辑已经没有活动任务（taskId 是占位符或已失效），用 create 从已有记录继续
  const created = await createTask({ albumId: key })
  if (!created && resumeError) {
    pushToast(resumeError.message, 'error')
  } else if (resumeError && created) {
    pushLocalLog('warn', `恢复任务失败，已改为重新创建任务：${resumeError.message}`)
  }
  return created
}

/** 取消下载任务（已经下载完成的章节会保留）。 */
export async function cancelTask(albumId) {
  const album = findAlbum(albumId)
  if (!album) return
  const taskId = taskIdOf(album)
  if (!taskId) {
    pushToast('该专辑当前没有正在进行的下载任务', 'warn')
    return
  }
  try {
    await api.task.cancel(taskId)
    setPauseRequested(album.albumId, false)
    pushToast('已取消下载任务', 'success')
    await loadAlbums()
  } catch (err) {
    reportError(err, '取消失败')
  }
}

/** 重新下载该专辑所有失败的章节。 */
export async function retryTask(albumId) {
  const key = String(albumId)
  try {
    await api.task.retry(key)
    setPauseRequested(key, false)
    pushToast('已开始重新下载失败的章节', 'success')
    await loadAlbums()
    await refreshTracks(key)
  } catch (err) {
    reportError(err, '重试失败章节失败')
  }
}

/**
 * 从列表移除专辑。
 * @param {string} albumId
 * @param {boolean} deleteRecords 是否同时删除本地下载记录
 */
export async function removeTask(albumId, deleteRecords = false) {
  const key = String(albumId)
  try {
    await api.task.remove(key, !!deleteRecords)
    state.albums = state.albums.filter((album) => String(album.albumId) !== key)
    delete state.trackPages[key]
    setPauseRequested(key, false)
    pushToast(deleteRecords ? '已移除专辑并删除下载记录' : '已从列表移除专辑', 'success')
  } catch (err) {
    reportError(err, '移除专辑失败')
  }
}

/**
 * 用系统文件管理器打开该专辑的下载目录。
 *
 * 成功的话资源管理器窗口会自己弹出来（并选中该专辑文件夹），不需要额外提示；
 * 只有失败（目录不存在、找不到记录等）才提示。
 */
export async function openAlbumDir(albumId) {
  try {
    await api.task.openDir(String(albumId))
  } catch (err) {
    reportError(err, '打开下载目录失败')
  }
}
