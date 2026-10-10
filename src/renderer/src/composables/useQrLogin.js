/**
 * useQrLogin.js —— 扫码登录的通用逻辑（web / pc 两个通道共用）。
 *
 * 流程：
 *   1. open(type) 调 auth.qrcode(type) 拿到 { qrId, img }
 *   2. 每 2 秒轮询一次 auth.check(type, qrId)
 *   3. ok === true 时刷新登录状态、提示成功并自动关闭
 *   4. 二维码倒计时结束（默认 120 秒）自动换一张
 *
 * 返回的是一组独立的 ref 和普通函数，组件里请解构使用，例如：
 *   const { visible, img, open, close } = useQrLogin({ onSuccess })
 */

import { onUnmounted, ref } from 'vue'
import { api, normalizeError } from '../api.js'
import { channelLabel, loadAuth, pushToast } from '../store.js'

/** 轮询间隔（毫秒）。 */
const POLL_INTERVAL = 2000
/** 二维码有效期（秒），到期自动刷新。 */
const QR_TTL_SECONDS = 120
/**
 * 连续多少次查询失败后放弃轮询（避免提示刷屏）。
 * 注意：未扫码时主进程返回的是 { ok: false }，不会抛错，所以正常等待扫码不会触发这个上限。
 */
const MAX_POLL_ERRORS = 5

/**
 * 兜底处理二维码图片：正常情况下主进程已经返回完整的 data URL。
 * @param {unknown} raw
 */
function normalizeQrImage(raw) {
  const value = raw === null || raw === undefined ? '' : String(raw)
  if (!value) return ''
  if (value.startsWith('data:') || value.startsWith('http:') || value.startsWith('https:')) {
    return value
  }
  // 只拿到裸 base64 时补上前缀
  return `data:image/png;base64,${value}`
}

/**
 * @param {{ onSuccess?: (user: object|null) => void }} [options]
 */
export function useQrLogin(options = {}) {
  const visible = ref(false)
  const type = ref('web')
  const img = ref('')
  const qrId = ref('')
  const loading = ref(false)
  const error = ref('')
  const seconds = ref(0)
  const success = ref(false)

  let pollTimer = null
  let tickTimer = null
  let pollErrors = 0

  function stopTimers() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  function reset() {
    stopTimers()
    img.value = ''
    qrId.value = ''
    error.value = ''
    seconds.value = 0
    success.value = false
    pollErrors = 0
  }

  function startTimers() {
    stopTimers()
    pollTimer = setInterval(poll, POLL_INTERVAL)
    tickTimer = setInterval(tick, 1000)
  }

  /** 请求一张新二维码。 */
  async function requestQr() {
    loading.value = true
    error.value = ''
    try {
      const res = await api.auth.qrcode(type.value)
      img.value = normalizeQrImage(res && res.img)
      qrId.value = res && res.qrId !== undefined && res.qrId !== null ? String(res.qrId) : ''
      seconds.value = QR_TTL_SECONDS
      pollErrors = 0
      if (!img.value || !qrId.value) {
        error.value = '二维码获取失败，请点击「刷新二维码」重试'
      }
      return !!(img.value && qrId.value)
    } catch (err) {
      error.value = normalizeError(err).message
      pushToast(error.value, 'error')
      return false
    } finally {
      loading.value = false
    }
  }

  /** 轮询扫码结果。 */
  async function poll() {
    if (!qrId.value || success.value) return
    try {
      const res = await api.auth.check(type.value, qrId.value)
      pollErrors = 0
      if (res && res.ok) {
        success.value = true
        stopTimers()
        const user = res.user || null
        pushToast(
          `${channelLabel(type.value)}扫码登录成功${user && user.nickname ? `：${user.nickname}` : ''}`,
          'success'
        )
        await loadAuth()
        if (typeof options.onSuccess === 'function') options.onSuccess(user)
        setTimeout(() => {
          if (success.value) close()
        }, 900)
      }
    } catch (err) {
      pollErrors += 1
      if (pollErrors >= MAX_POLL_ERRORS) {
        stopTimers()
        error.value = normalizeError(err).message
        pushToast(`二维码状态查询失败：${error.value}`, 'error')
      }
    }
  }

  /** 每秒倒计时，到期自动换一张二维码。 */
  function tick() {
    if (seconds.value > 0) seconds.value -= 1
    if (seconds.value <= 0 && !success.value) {
      // 先复位倒计时，避免刷新失败时每秒重试
      seconds.value = QR_TTL_SECONDS
      requestQr()
    }
  }

  /**
   * 打开弹层并开始扫码。
   * @param {'web'|'pc'} nextType
   */
  async function open(nextType) {
    type.value = nextType === 'pc' ? 'pc' : 'web'
    reset()
    visible.value = true
    const ok = await requestQr()
    if (ok) startTimers()
  }

  function close() {
    visible.value = false
    reset()
  }

  /** 手动刷新二维码。 */
  async function refresh() {
    if (loading.value) return
    stopTimers()
    const ok = await requestQr()
    if (ok && visible.value) startTimers()
  }

  onUnmounted(() => {
    stopTimers()
  })

  return { visible, type, img, qrId, loading, error, seconds, success, open, close, refresh }
}
