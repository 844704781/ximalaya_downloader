<script setup>
/**
 * SettingsBar.vue —— 下载设置：下载目录（浏览…）、并发数（1-20）、慢速模式、下载通道。
 * 所有改动都通过 settings.set(patch) 保存，失败会回滚并提示。
 */
import { ref, watch } from 'vue'
import { chooseOutputDir, outputDisplay, pushToast, state, updateSettings } from '../store.js'

const channelOptions = [
  { value: '', label: '自动' },
  { value: 'web', label: '网页端' },
  { value: 'pc', label: '电脑端' }
]

const outputDraft = ref(outputDisplay())
const concurrencyDraft = ref(clampConcurrency(state.settings.concurrency))
const browsing = ref(false)

function clampConcurrency(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 3
  return Math.min(20, Math.max(1, n))
}

watch(
  () => [state.settings.output, state.settings.outputLabel],
  () => {
    outputDraft.value = outputDisplay()
  }
)

watch(
  () => state.settings.concurrency,
  (value) => {
    concurrencyDraft.value = clampConcurrency(value)
  }
)

function onOutputInput(event) {
  outputDraft.value = event && event.target ? event.target.value : ''
}

function commitOutput() {
  const next = String(outputDraft.value || '').trim()
  if (next === outputDisplay().trim()) return
  if (!next) {
    // 主进程会忽略空的 output，这里直接还原并提示，避免界面与真实设置不一致
    pushToast('下载目录不能为空，请用「浏览…」选择或填写有效路径', 'warn')
    outputDraft.value = outputDisplay()
    return
  }
  updateSettings({ output: next }).then(() => {
    // 主进程可能做了目录联接映射，也可能因为不可写而回滚。
    // 不管哪种情况，都让输入框回到真正生效的值。
    outputDraft.value = outputDisplay()
  })
}

async function browse() {
  if (browsing.value) return
  browsing.value = true
  try {
    await chooseOutputDir()
    outputDraft.value = outputDisplay()
  } finally {
    browsing.value = false
  }
}

function onConcurrencyInput(event) {
  concurrencyDraft.value = event && event.target ? event.target.value : ''
}

function commitConcurrency() {
  const next = clampConcurrency(concurrencyDraft.value)
  concurrencyDraft.value = next
  if (next !== Number(state.settings.concurrency)) updateSettings({ concurrency: next })
}

function toggleSlow() {
  updateSettings({ slow: !state.settings.slow })
}

function setChannel(value) {
  const current = state.settings.type || ''
  if (current === value) return
  updateSettings({ type: value === 'web' || value === 'pc' ? value : null })
}
</script>

<template>
  <section class="card settings-bar">
    <div class="section-head">
      <h2>下载设置</h2>
      <span class="dim">{{ state.settingsLoaded ? '修改后立即保存' : '正在读取设置…' }}</span>
    </div>

    <div class="settings-grid">
      <div class="field">
        <span class="field-label">下载目录</span>
        <div class="dir-row">
          <input
            class="input mono"
            type="text"
            spellcheck="false"
            placeholder="例如 ~/Downloads"
            :value="outputDraft"
            @input="onOutputInput"
            @change="commitOutput"
            @keyup.enter="commitOutput"
          />
          <button class="btn" type="button" :disabled="browsing" @click="browse">
            {{ browsing ? '选择中…' : '浏览…' }}
          </button>
        </div>
        <span class="hint">支持 <code>~</code> 形式；实际目录会自动拼上专辑名。</span>
      </div>

      <div class="field">
        <span class="field-label">并发数（1 - 20）</span>
        <div class="slider-row">
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            :value="concurrencyDraft"
            @input="onConcurrencyInput"
            @change="commitConcurrency"
          />
          <input
            class="input slider-value"
            type="number"
            min="1"
            max="20"
            :value="concurrencyDraft"
            @input="onConcurrencyInput"
            @change="commitConcurrency"
          />
        </div>
      </div>

      <div class="field">
        <span class="field-label">下载通道</span>
        <div class="filter-group">
          <button
            v-for="option in channelOptions"
            :key="option.value || 'auto'"
            class="chip"
            type="button"
            :class="{ 'chip--active': (state.settings.type || '') === option.value }"
            @click="setChannel(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <span class="hint">自动：使用当前已登录的通道。</span>
      </div>

      <div class="field">
        <span class="field-label">慢速模式</span>
        <label class="switch">
          <input type="checkbox" :checked="!!state.settings.slow" @change="toggleSlow" />
          <span class="switch-track"><span class="switch-dot"></span></span>
          <span class="dim">{{ state.settings.slow ? '已开启' : '已关闭' }}</span>
        </label>
      </div>
    </div>
  </section>
</template>
