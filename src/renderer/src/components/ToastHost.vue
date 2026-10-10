<script setup>
/**
 * ToastHost.vue —— 极简全局提示。数据来自 store 的 state.toasts。
 * 所有被 catch 到的错误都会走 pushToast，最终在这里显示。
 */
import { computed } from 'vue'
import { dismissToast, state } from '../store.js'

const toasts = computed(() => state.toasts)

const icons = {
  success: '✓',
  error: '✕',
  warn: '!',
  info: 'i'
}

function iconOf(type) {
  return icons[type] || icons.info
}
</script>

<template>
  <div class="toast-host">
    <div v-for="toast in toasts" :key="toast.id" class="toast" :class="`toast--${toast.type}`">
      <span class="toast-icon">{{ iconOf(toast.type) }}</span>
      <span class="toast-msg">{{ toast.message }}</span>
      <button class="toast-close" type="button" title="关闭" @click="dismissToast(toast.id)">×</button>
    </div>
  </div>
</template>
