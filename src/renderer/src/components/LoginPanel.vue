<script setup>
/**
 * LoginPanel.vue —— 登录管理页。
 * 展示 web / pc 两个通道的登录状态，支持扫码登录（每 2 秒轮询）、
 * 手动粘贴 Cookie、退出登录。
 */
import { computed, ref } from 'vue'
import { channelLabel, loadAuth, logout, saveCookie, state } from '../store.js'
import { useQrLogin } from '../composables/useQrLogin.js'

const cookieOpen = ref({ web: false, pc: false })
const cookieDraft = ref({ web: '', pc: '' })
const saving = ref({ web: false, pc: false })

const {
  visible: qrVisible,
  type: qrType,
  img: qrImg,
  loading: qrLoading,
  error: qrError,
  seconds: qrSeconds,
  success: qrSuccess,
  open: openQr,
  close: closeQr,
  refresh: refreshQr
} = useQrLogin()

const channels = computed(() =>
  ['web', 'pc'].map((type) => {
    const channel = state.auth[type] || {}
    return {
      type,
      label: channel.label || channelLabel(type),
      logged: !!channel.logged,
      error: channel.error || '',
      user: channel.user || null
    }
  })
)

function toggleCookie(type) {
  cookieOpen.value[type] = !cookieOpen.value[type]
}

function clearCookie(type) {
  cookieDraft.value[type] = ''
}

function onCookieInput(type, event) {
  cookieDraft.value[type] = event && event.target ? event.target.value : ''
}

async function submitCookie(type) {
  if (saving.value[type]) return
  saving.value[type] = true
  try {
    const res = await saveCookie(type, cookieDraft.value[type])
    if (res) {
      cookieDraft.value[type] = ''
      cookieOpen.value[type] = false
    }
  } finally {
    saving.value[type] = false
  }
}

async function doLogout(type) {
  await logout(type)
}

function refreshAuth() {
  loadAuth()
}
</script>

<template>
  <section class="login-panel">
    <div class="section-head">
      <h2>登录管理</h2>
      <div class="row-actions">
        <span class="dim">扫码登录时前端每 2 秒查询一次状态</span>
        <button class="btn btn--ghost" type="button" :disabled="state.authLoading" @click="refreshAuth">
          {{ state.authLoading ? '刷新中…' : '刷新状态' }}
        </button>
      </div>
    </div>

    <article v-for="item in channels" :key="item.type" class="card channel-card">
      <div class="channel-head">
        <div class="channel-title">
          <strong>{{ item.label }}</strong>
          <span class="badge" :class="item.logged ? 'badge--ok' : 'badge--mute'">
            {{ item.logged ? '已登录' : '未登录' }}
          </span>
        </div>
        <div class="channel-actions">
          <button v-if="!item.logged" class="btn btn--primary" type="button" @click="openQr(item.type)">
            扫码登录
          </button>
          <button class="btn" type="button" @click="toggleCookie(item.type)">
            {{ cookieOpen[item.type] ? '收起 Cookie 登录' : '手动填写 Cookie' }}
          </button>
          <button v-if="item.logged" class="btn btn--danger" type="button" @click="doLogout(item.type)">
            退出登录
          </button>
        </div>
      </div>

      <div v-if="item.logged" class="user-row">
        <span class="user-name">{{ (item.user && item.user.nickname) || '未知用户' }}</span>
        <span class="badge" :class="item.user && item.user.isVip ? 'badge--ok' : 'badge--mute'">
          {{ item.user && item.user.isVip ? 'VIP' : '非 VIP' }}
        </span>
        <span v-if="item.user && item.user.isRobot" class="badge badge--active">机器人账号</span>
        <span v-if="item.user && item.user.vipExpireTime" class="dim">
          VIP 到期：{{ item.user.vipExpireTime }}
        </span>
      </div>
      <p v-else class="dim">该通道未登录。喜马拉雅大部分专辑需要登录后才能下载。</p>

      <p v-if="item.error" class="error-text">{{ item.error }}</p>

      <div v-if="cookieOpen[item.type]" class="cookie-box">
        <label class="field">
          <span class="field-label">粘贴浏览器里的 Cookie 字符串（形如 <code>a=1; b=2</code>）</span>
          <textarea
            class="textarea"
            rows="4"
            spellcheck="false"
            placeholder="1&_token=xxx; ..."
            :value="cookieDraft[item.type]"
            @input="onCookieInput(item.type, $event)"
          ></textarea>
        </label>
        <div class="row-actions">
          <button
            class="btn btn--primary"
            type="button"
            :disabled="saving[item.type]"
            @click="submitCookie(item.type)"
          >
            {{ saving[item.type] ? '保存中…' : '保存 Cookie' }}
          </button>
          <button class="btn btn--ghost" type="button" @click="clearCookie(item.type)">清空</button>
        </div>
      </div>
    </article>

    <div v-if="qrVisible" class="modal-mask" @click.self="closeQr">
      <div class="modal">
        <div class="modal-head">
          <strong>{{ channelLabel(qrType) }}扫码登录</strong>
          <button class="btn btn--ghost btn--sm" type="button" @click="closeQr">关闭</button>
        </div>
        <div class="modal-body qr-body">
          <div v-if="qrLoading" class="qr-placeholder">
            <span class="spinner"></span>&nbsp;二维码生成中…
          </div>
          <img v-else-if="qrImg" class="qr-img" :src="qrImg" :alt="`${channelLabel(qrType)}登录二维码`" />
          <div v-else class="qr-placeholder">二维码获取失败</div>

          <p v-if="qrSuccess" class="ok-text">登录成功，正在刷新登录状态…</p>
          <p v-else-if="qrError" class="error-text">{{ qrError }}</p>
          <p v-else class="dim">
            请使用喜马拉雅 App 扫描二维码，二维码 {{ qrSeconds }} 秒后自动刷新
          </p>

          <div class="row-actions">
            <button class="btn" type="button" :disabled="qrLoading" @click="refreshQr">刷新二维码</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
