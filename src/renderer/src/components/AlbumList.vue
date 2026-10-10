<script setup>
/**
 * AlbumList.vue —— 下载列表：渲染所有专辑卡片。
 * 章节明细由 AlbumCard 展开时按需加载（默认不拉取）。
 */
import { computed } from 'vue'
import AlbumCard from './AlbumCard.vue'
import { loadAlbums, state } from '../store.js'

const albums = computed(() => state.albums)
const loading = computed(() => state.albumsLoading)

function refresh() {
  loadAlbums()
}
</script>

<template>
  <section class="album-list">
    <div class="section-head">
      <h2>下载列表</h2>
      <div class="row-actions">
        <span class="dim">共 {{ albums.length }} 张专辑</span>
        <button class="btn btn--ghost" type="button" :disabled="loading" @click="refresh">
          {{ loading ? '刷新中…' : '刷新列表' }}
        </button>
      </div>
    </div>

    <p v-if="loading && !albums.length" class="empty">正在加载下载列表…</p>
    <p v-else-if="!albums.length" class="empty">
      还没有下载任务。在上方输入专辑 ID 后点击「开始下载」，这里会显示每张专辑的进度与章节明细。
    </p>

    <AlbumCard v-for="album in albums" :key="album.albumId" :album="album" />
  </section>
</template>
