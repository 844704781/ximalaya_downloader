<script setup>
/**
 * TrackTable.vue —— 章节明细表格（带筛选与分页，每页默认 200 行）。
 *
 * 进度口径说明：这里的百分比只用于「单集」的字节进度显示；
 * 专辑总进度一律在 AlbumCard 里用 done / total 计算。
 */
import { computed, onMounted, watch } from 'vue'
import {
  TRACK_FILTERS,
  TRACK_PAGE_SIZE,
  TRACK_STATUS_LABELS,
  ensureTracks,
  formatBytes,
  goTrackPage,
  setTrackFilter,
  state,
  trackStatusTone
} from '../store.js'

const props = defineProps({
  albumId: { type: String, required: true }
})

const cache = computed(() => state.trackPages[props.albumId] || null)
const rows = computed(() => (cache.value && cache.value.rows) || [])
const total = computed(() => (cache.value && cache.value.total) || 0)
const page = computed(() => (cache.value && cache.value.page) || 1)
const pageSize = computed(() => (cache.value && cache.value.pageSize) || TRACK_PAGE_SIZE)
const filter = computed(() => (cache.value && cache.value.filter) || 'all')
const loading = computed(() => !!(cache.value && cache.value.loading))
const pageCount = computed(() => {
  const size = pageSize.value || TRACK_PAGE_SIZE
  return Math.max(1, Math.ceil(total.value / size))
})

onMounted(() => {
  ensureTracks(props.albumId)
})

watch(
  () => props.albumId,
  (albumId) => {
    if (albumId) ensureTracks(albumId)
  }
)

function changeFilter(value) {
  if (value === filter.value) return
  setTrackFilter(props.albumId, value)
}

function prev() {
  if (page.value <= 1 || loading.value) return
  goTrackPage(props.albumId, page.value - 1)
}

function next() {
  if (page.value >= pageCount.value || loading.value) return
  goTrackPage(props.albumId, page.value + 1)
}

function statusLabel(status) {
  return TRACK_STATUS_LABELS[status] || status
}

/** 单集下载进度（按字节，未知总大小时为 0）。 */
function percentOf(row) {
  if (row.status === 'done') return 100
  if (row.status !== 'downloading') return 0
  const totalBytes = Number(row.bytes) || 0
  const received = Number(row.received) || 0
  if (totalBytes <= 0) return 0
  return Math.max(0, Math.min(100, Math.floor((received / totalBytes) * 100)))
}

function progressText(row) {
  if (row.status === 'done') return formatBytes(row.bytes) || '已完成'
  if (row.status === 'downloading') {
    const received = formatBytes(row.received) || '0 B'
    const totalBytes = formatBytes(row.bytes)
    return totalBytes ? `${received} / ${totalBytes}` : `已下载 ${received}`
  }
  if (row.status === 'failed') return '下载失败'
  return '待下载'
}

/** 只取文件名，避免表格被长路径撑开。 */
function baseName(value) {
  const text = String(value || '')
  if (!text) return ''
  const parts = text.split(/[\\/]/)
  return parts[parts.length - 1] || text
}
</script>

<template>
  <div class="detail-head">
    <div class="filter-group">
      <button
        v-for="option in TRACK_FILTERS"
        :key="option.value"
        type="button"
        class="chip"
        :class="{ 'chip--active': option.value === filter }"
        :disabled="loading"
        @click="changeFilter(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
    <span class="dim">
      <span v-if="loading" class="spinner"></span>
      共 {{ total }} 条 · 第 {{ page }} / {{ pageCount }} 页
    </span>
  </div>

  <div v-if="!total && !loading" class="empty">暂无章节数据</div>
  <div v-else class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th>章节</th>
          <th class="col-status">状态</th>
          <th class="col-progress">进度</th>
          <th class="col-path">文件</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.trackId">
          <td class="col-num">{{ row.num }}</td>
          <td>
            <span class="track-title" :title="row.title">{{ row.title || '(无标题)' }}</span>
            <span v-if="row.status === 'failed' && row.error" class="track-error">{{ row.error }}</span>
          </td>
          <td class="col-status">
            <span class="badge" :class="`badge--${trackStatusTone(row.status)}`">
              {{ statusLabel(row.status) }}
            </span>
          </td>
          <td class="col-progress">
            <div class="track-progress">
              <div class="bar bar--slim" :class="`bar--${trackStatusTone(row.status)}`">
                <div class="bar-fill" :style="{ width: percentOf(row) + '%' }"></div>
              </div>
              <span class="dim">{{ progressText(row) }}</span>
            </div>
          </td>
          <td class="col-path">
            <span class="track-title" :title="row.path || ''">
              {{ row.path ? baseName(row.path) : '—' }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="pager">
    <span class="dim">每页 {{ pageSize }} 条</span>
    <div class="row-actions">
      <button
        class="btn btn--ghost btn--sm"
        type="button"
        :disabled="page <= 1 || loading"
        @click="prev"
      >
        上一页
      </button>
      <button
        class="btn btn--ghost btn--sm"
        type="button"
        :disabled="page >= pageCount || loading"
        @click="next"
      >
        下一页
      </button>
    </div>
  </div>
</template>
