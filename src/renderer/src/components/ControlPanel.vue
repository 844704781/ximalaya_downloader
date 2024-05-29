<template>

  <div class="main">
    <el-row class="select">
      <input
        type="file"
        webkitdirectory
        directory
        @change="handleDirectoryChange"
        @focus="handleFileInputFocus"
        @blur="handleFileInputBlur"
        ref="fileInput"
        style="display: none;"
      />

      <el-col :span="20">
        <el-input v-model="selectedDirectory" readonly @click="triggerFileInput" style="margin-right: 10px;"
                  placeholder="请选择下载目录,默认：/home/用户名/Desktop"></el-input>
      </el-col>
      <el-col :span="3" :offset="1">
        <el-button type="primary" @click="triggerFileInput" :disabled="!canSelectDirectory">
          下载目录
        </el-button>
      </el-col>

    </el-row>

    <el-row class="url">
      <el-col :span="20">
        <el-input v-model="url" placeholder="请输入专辑链接，例如：https://www.ximalaya.com/album/38160002"/>
      </el-col>
      <el-col :span="3" :offset="1">
        <el-button type="danger" @click="download">{{ downloadSwitch ? '下载' : '暂停' }}</el-button>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import {reactive, onMounted, ref} from 'vue';

export default {
  name: "ControlPanel",
  setup() {
    const url = ref('https://www.ximalaya.com/album/18431991')
    const fileInput = ref(null);
    const selectedDirectory = ref('');
    const canSelectDirectory = ref(true);
    const downloadSwitch = ref(true)

    const triggerFileInput = () => {
      if (canSelectDirectory.value) {
        canSelectDirectory.value = false;
        fileInput.value.click();
        setTimeout(() => {
          canSelectDirectory.value = true
        }, 2000)
      }
    };

    const handleDirectoryChange = (event) => {
      const files = Array.from(event.target.files);
      if (files.length > 0) {
        const firstFile = files[0];
        const absolutePath = firstFile.path || firstFile.webkitRelativePath; // 兼容不同浏览器
        const directoryPath = absolutePath.split(firstFile.name)[0];
        selectedDirectory.value = directoryPath;
      }
      canSelectDirectory.value = true;

    };
    const handleFileInputFocus = () => {
      canSelectDirectory.value = true;
    }
    const handleFileInputBlur = () => {
      canSelectDirectory.value = true;
    }

    const download = () => {
      if (downloadSwitch.value == false) {
        window.api.downloadSwitch(false)
        downloadSwitch.value = true
        return
      }
      let output = '~/Desktop'
      if (selectedDirectory.value != '') {
        output = selectedDirectory.value
      }
      if (url.value == '') {
        return
      }
      const match = url.value.match(/\/(\d+)$/);
      let albumId
      // 如果找到匹配的结果，则提取数字部分
      if (match) {
        albumId = match[1];
      } else {
        console.log('未找到匹配的数字部分');
        return
      }
      window.api.download(output, albumId)
      downloadSwitch.value = false
    }

    onMounted(() => {
      window.api.getSwitch((event, isStart) => {
        downloadSwitch.value = isStart
      })
    })

    return {
      url,
      download,
      fileInput,
      downloadSwitch,
      triggerFileInput,
      selectedDirectory,
      canSelectDirectory,
      handleDirectoryChange,
      handleFileInputBlur,
      handleFileInputFocus
    }
  }
}
</script>

<style lang="scss" scoped>
.main {
  //border:solid 1px red;
  width: 100%;
  margin: 0 20px;

  .select {
    margin: 10px 0;

  }

  .url {
    margin: 10px 0;
  }
}
</style>
