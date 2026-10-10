<script setup>
/**
 * AlbumCard.vue —— 单张专辑卡片：标题、章节进度、状态、操作按钮、可展开的章节明细。
 *
 * 关键 UX：
 *  - 总进度用 done / total（章节数），不用字节数。
 *  - 点「暂停」后 store 会立刻把状态置为 pausing 并把在途章节进度清零，
 *    按钮因此马上变成禁用的「暂停中…」，直到 evt:state 报 paused 才变成「继续下载」。
 *  - 暂停时给出明确提示：未完成章节会重新下载。
 */
import { computed, ref } from 'vue'
import TrackTable from './TrackTable.vue'
import {
  ALBUM_STATUS_LABELS,
  albumPercent,
  albumStatusTone,
  cancelTask,
  channelLabel,
  createTask,
  ensureTracks,
  isStartable,
  openAlbumDir,
  pauseTask,
  removeTask,
  resumeTask,
  retryTask,
  setTrackFilter
} from '../store.js'

const props = defineProps({
  album: { type: Object, required: true }
})

const expanded = ref(false)
const confirmRemove = ref(false)
const pending = ref('')

const percent = computed(() => albumPercent(props.album))
const tone = computed(() => albumStatusTone(props.album.status))
const statusLabel = computed(() => ALBUM_STATUS_LABELS[props.album.status] || props.album.status)

const isRunning = computed(() => props.album.status === 'running')
const isPausing = computed(() => props.album.status === 'pausing')
const isPaused = computed(() => props.album.status === 'paused')
/** idle / cancelled 都表示「该专辑当前没有活动任务」，可以重新开始下载。 */
const canStart = computed(() => isStartable(props.album.status))
const hasFailed = computed(() => Number(props.album.failed) > 0)
const canRetry = computed(
  () => (hasFailed.value || props.album.status === 'failed') && !isRunning.value && !isPausing.value
)
const canCancel = computed(() => isRunning.value || isPausing.value || isPaused.value)

/** 暂停提示文案（暂停中 / 已暂停各一份）。 */
const pauseHint = computed(() => {
  if (isPausing.value) {
    return '正在暂停：当前未完成章节的下载会被中断，恢复后将重新下载（已完成的章节不受影响）。'
  }
  if (isPaused.value) {
    return '已暂停。恢复后当前未完成的章节将重新下载（不影响已完成的章节）。'
  }
  return ''
})

async function run(name, action) {
  if (pending.value) return
  pending.value = name
  try {
    await action()
  } finally {
    pending.value = ''
  }
}

function toggleDetail() {
  expanded.value = !expanded.value
  if (expanded.value) ensureTracks(props.album.albumId)
}

async function showFailed() {
  expanded.value = true
  await setTrackFilter(props.album.albumId, 'failed')
}

function onPause() {
  run('pause', () => pauseTask(props.album.albumId))
}

function onResume() {
  run('resume', () => resumeTask(props.album.albumId))
}

function onStart() {
  run('start', () => createTask({ albumId: props.album.albumId }))
}

function onRetry() {
  run('retry', () => retryTask(props.album.albumId))
}

function onCancel() {
  run('cancel', () => cancelTask(props.album.albumId))
}

function onOpenDir() {
  run('open', () => openAlbumDir(props.album.albumId))
}

function onRemove(deleteRecords) {
  confirmRemove.value = false
  run('remove', () => removeTask(props.album.albumId, deleteRecords))
}
</script>

<template>
  <article class="card album-card">
    <div class="album-head">
      <div class="album-title">
        <strong>{{ album.albumTitle || `专辑 ${album.albumId}` }}</strong>
        <span class="badge" :class="`badge--${tone}`">{{ statusLabel }}</span>
        <span v-if="album.type" class="badge badge--mute">{{ channelLabel(album.type) }}</span>
        <span class="album-sub">ID {{ album.albumId }}</span>
      </div>

      <div class="album-actions">
        <button v-if="isPausing" class="btn" type="button" disabled>暂停中…</button>
        <button
          v-else-if="isRunning"
          class="btn btn--primary"
          type="button"
          :disabled="!!pending"
          @click="onPause"
        >
          暂停
        </button>
        <button
          v-else-if="isPaused"
          class="btn btn--primary"
          type="button"
          :disabled="!!pending"
          @click="onResume"
        >
          继续下载
        </button>
        <button
          v-else-if="canStart"
          class="btn btn--primary"
          type="button"
          :disabled="!!pending"
          @click="onStart"
        >
          {{ album.status === 'idle' || album.status === 'done' ? '开始下载' : '重新下载' }}
        </button>

        <button v-if="canRetry" class="btn" type="button" :disabled="!!pending" @click="onRetry">
          重试失败章节
        </button>
        <button v-if="canCancel" class="btn" type="button" :disabled="!!pending" @click="onCancel">
          取消任务
        </button>
        <button
          class="btn"
          type="button"
          :disabled="!!pending || !album.output"
          :title="album.output || '该专辑还没有下载目录'"
          @click="onOpenDir"
        >
          打开文件夹
        </button>
        <button class="btn btn--ghost" type="button" @click="toggleDetail">
          {{ expanded ? '收起明细' : '展开明细' }}
        </button>
        <button class="btn btn--danger" type="button" @click="confirmRemove = true">移除</button>
      </div>
    </div>

    <div class="album-progress">
      <div class="bar" :class="`bar--${tone}`">
        <div class="bar-fill" :style="{ width: percent + '%' }"></div>
      </div>
      <div class="bar-meta">
        <span>已完成 {{ album.done }} / {{ album.total }} 章节（{{ percent }}%）</span>
        <span class="row-actions">
          <button
            v-if="hasFailed"
            class="btn btn--ghost btn--sm"
            type="button"
            @click="showFailed"
          >
            查看失败 {{ album.failed }} 章
          </button>
          <span v-if="album.concurrency" class="dim">并发 {{ album.concurrency }}</span>
          <span v-if="album.slow" class="dim">慢速模式</span>
        </span>
      </div>
    </div>

    <div class="album-sub ellipsis" :title="album.output || ''">
      输出目录：{{ album.output || '未指定（使用全局设置）' }}
    </div>

    <p v-if="pauseHint" class="hint hint--warn">{{ pauseHint }}</p>

    <div v-if="confirmRemove" class="confirm-row">
      <span>移除「{{ album.albumTitle || album.albumId }}」？</span>
      <button class="btn btn--danger btn--sm" type="button" :disabled="!!pending" @click="onRemove(true)">
        移除并删除下载记录
      </button>
      <button class="btn btn--sm" type="button" :disabled="!!pending" @click="onRemove(false)">
        仅从列表移除
      </button>
      <button class="btn btn--ghost btn--sm" type="button" @click="confirmRemove = false">取消</button>
    </div>

    <div v-if="expanded" class="album-detail">
      <TrackTable :album-id="album.albumId" />
    </div>
  </article>
</template>
