<script setup>
/**
 * App.vue —— 应用外壳。
 *   - 顶部 AppHeader 做「下载 / 登录」两个页签（用 ref 切换，不引入 vue-router）
 *   - 底部状态栏显示下载目录、并发数、慢速模式开关、登录概览
 *   - onMounted 里调用 initStore()，它负责首次加载 + 订阅主进程事件
 */
import { computed, onMounted, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import LoginPanel from './components/LoginPanel.vue'
import SettingsBar from './components/SettingsBar.vue'
import NewTaskForm from './components/NewTaskForm.vue'
import AlbumList from './components/AlbumList.vue'
import ToastHost from './components/ToastHost.vue'
import { channelLabel, formatClock, initStore, outputDisplay, state, updateSettings } from './store.js'

const tab = ref('download')
const showLogs = ref(false)

const currentDir = computed(() => outputDisplay() || '未设置')
const slow = computed(() => !!state.settings.slow)
const loggedChannels = computed(() =>
  ['web', 'pc']
    .filter((type) => state.auth[type] && state.auth[type].logged)
    .map((type) => channelLabel(type))
)
const recentLogs = computed(() => state.logs.slice(-60).reverse())

function setTab(next) {
  tab.value = next
}

function toggleSlow() {
  updateSettings({ slow: !slow.value })
}

onMounted(() => {
  initStore()
})
</script>

<template>
  <div class="app">
    <AppHeader :active="tab" @change="setTab" />

    <main class="app-main">
      <template v-if="tab === 'download'">
        <NewTaskForm />
        <SettingsBar />
        <AlbumList />
      </template>
      <LoginPanel v-else />

      <section v-if="showLogs" class="log-panel">
        <p v-if="!recentLogs.length" class="dim">暂无日志。</p>
        <div
          v-for="(log, index) in recentLogs"
          :key="`${log.at}-${index}`"
          class="log-line"
          :class="`log-line--${log.level}`"
        >
          <span class="dim mono">{{ formatClock(log.at) }}</span>
          <span>{{ log.message }}</span>
        </div>
      </section>
    </main>

    <footer class="app-footer">
      <span class="footer-item">
        <span class="dim">下载目录</span>
        <span class="mono ellipsis footer-dir" :title="currentDir">{{ currentDir }}</span>
      </span>
      <span class="footer-item">
        <span class="dim">并发</span>
        <span>{{ state.settings.concurrency }}</span>
      </span>
      <label class="switch footer-item">
        <input type="checkbox" :checked="slow" @change="toggleSlow" />
        <span class="switch-track"><span class="switch-dot"></span></span>
        <span>慢速模式</span>
      </label>
      <span class="footer-spacer"></span>
      <span class="footer-item">
        <span class="dim">登录</span>
        <span>{{ loggedChannels.length ? loggedChannels.join(' / ') : '未登录' }}</span>
      </span>
      <button class="btn btn--ghost btn--sm" type="button" @click="showLogs = !showLogs">
        {{ showLogs ? '隐藏日志' : '运行日志' }}
      </button>
    </footer>

    <ToastHost />
  </div>
</template>
