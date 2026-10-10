<script setup>
/**
 * AppHeader.vue —— 顶部导航：品牌 + 两个页签（下载 / 登录）+ 登录状态概览。
 * 不使用 vue-router，页签状态由父组件用 ref 管理。
 */
import { computed } from 'vue'
import { channelLabel, state } from '../store.js'

const props = defineProps({
  active: { type: String, default: 'download' }
})

const emit = defineEmits(['change'])

const tabs = [
  { key: 'download', label: '下载' },
  { key: 'login', label: '登录' }
]

const channels = computed(() =>
  ['web', 'pc'].map((type) => {
    const channel = state.auth[type] || {}
    return {
      type,
      label: channel.label || channelLabel(type),
      logged: !!channel.logged,
      nickname: (channel.user && channel.user.nickname) || ''
    }
  })
)

function select(key) {
  if (key !== props.active) emit('change', key)
}
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <span class="brand-mark">喜</span>
      <div class="brand-text">
        <strong>喜马拉雅音频下载器</strong>
        <small>VIP 专辑批量下载</small>
      </div>
    </div>

    <nav class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="tab"
        :class="{ 'tab--active': tab.key === active }"
        @click="select(tab.key)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <div class="header-status">
      <span
        v-for="channel in channels"
        :key="channel.type"
        class="badge"
        :class="channel.logged ? 'badge--ok' : 'badge--mute'"
        :title="channel.logged ? `${channel.label}：${channel.nickname || '已登录'}` : `${channel.label}：未登录`"
      >
        {{ channel.label }}{{ channel.logged ? (channel.nickname ? `·${channel.nickname}` : '·已登录') : '·未登录' }}
      </span>
      <span v-if="state.authLoading" class="spinner"></span>
    </div>
  </header>
</template>
