<script setup>
/**
 * NewTaskForm.vue —— 新建下载任务：输入专辑 ID → task.create({ albumId })。
 * 高级选项可覆盖输出目录 / 并发数 / 慢速模式（留空则使用全局设置）。
 */
import { computed, ref } from 'vue'
import { createTask, normalizeAlbumId, outputDisplay, pushToast, state } from '../store.js'

const albumId = ref('')
const output = ref('')
const concurrency = ref('')
const slow = ref('default')
const advanced = ref(false)
const creating = ref(false)

/** 用户可能直接粘贴专辑链接，这里展示最终使用的 ID。 */
const previewId = computed(() => normalizeAlbumId(albumId.value))
const canSubmit = computed(() => !!previewId.value && !creating.value)

async function submit() {
  if (creating.value) return
  const id = normalizeAlbumId(albumId.value)
  if (!id) {
    pushToast('请先填写专辑 ID', 'warn')
    return
  }
  creating.value = true
  try {
    const payload = { albumId: id }
    const dir = output.value.trim()
    if (dir) payload.output = dir
    const size = Number(concurrency.value)
    if (Number.isFinite(size) && size >= 1 && size <= 20) payload.concurrency = Math.round(size)
    if (slow.value === 'on') payload.slow = true
    if (slow.value === 'off') payload.slow = false

    const album = await createTask(payload)
    if (album) {
      albumId.value = ''
      output.value = ''
      concurrency.value = ''
      slow.value = 'default'
    }
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <section class="card new-task">
    <div class="section-head">
      <h2>新建下载任务</h2>
      <button class="btn btn--ghost btn--sm" type="button" @click="advanced = !advanced">
        {{ advanced ? '收起高级选项' : '高级选项' }}
      </button>
    </div>

    <div class="new-task-row">
      <label class="field">
        <span class="field-label">专辑 ID（也可以直接粘贴专辑链接）</span>
        <input
          v-model="albumId"
          class="input"
          type="text"
          spellcheck="false"
          placeholder="例如 1234567"
          @keyup.enter="submit"
        />
      </label>
      <button class="btn btn--primary" type="button" :disabled="!canSubmit" @click="submit">
        {{ creating ? '创建中…' : '开始下载' }}
      </button>
    </div>

    <p v-if="albumId.trim() && previewId !== albumId.trim()" class="hint">
      将从链接中提取专辑 ID：<code>{{ previewId }}</code>
    </p>

    <div v-if="advanced" class="advanced-grid">
      <label class="field">
        <span class="field-label">输出目录（留空使用全局设置）</span>
        <input v-model="output" class="input mono" type="text" spellcheck="false" placeholder="例如 ~/Downloads" />
      </label>
      <label class="field">
        <span class="field-label">并发数（留空使用全局设置）</span>
        <input v-model="concurrency" class="input" type="number" min="1" max="20" placeholder="1 - 20" />
      </label>
      <label class="field">
        <span class="field-label">慢速模式</span>
        <select v-model="slow" class="select">
          <option value="default">跟随全局设置</option>
          <option value="on">开启</option>
          <option value="off">关闭</option>
        </select>
      </label>
    </div>

    <p class="hint">
      当前全局设置：并发 {{ state.settings.concurrency }} ·
      {{ state.settings.slow ? '慢速模式开启' : '慢速模式关闭' }} · 下载目录
      {{ outputDisplay() || '未设置' }}
    </p>
  </section>
</template>
