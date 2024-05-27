<template>

  <div class="main">
    <el-row class="select">
      <input
        type="file"
        webkitdirectory
        directory
        @change="handleDirectoryChange"
        ref="fileInput"
        style="display: none;"
      />
      <el-col :span="20">
        <el-input v-model="selectedDirectory" readonly @click="triggerFileInput" style="margin-right: 10px;"
                  placeholder="请选择下载目录"></el-input>
      </el-col>
      <el-col :span="3" :offset="1">
        <el-button type="primary" @click="showFileInput">
          下载目录
        </el-button>
      </el-col>

    </el-row>

    <el-row class="url">
      <el-col :span="20">
        <el-input v-model="url" placeholder="请输入专辑链接"/>
      </el-col>
      <el-col :span="3" :offset="1">
        <el-button type="danger">下载</el-button>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import {reactive, onMounted, ref} from 'vue';

export default {
  name: "ControlPanel",
  setup() {
    const url = ref('')
    const fileInput = ref(null);
    const selectedDirectory = ref('');
    const fileInputVisible = ref(false); // 控制文件选择框的显示与隐藏


    const triggerFileInput = () => {
      if (!fileInputVisible.value && fileInput.value) {
        fileInputVisible.value = true;
        fileInput.value.click();
      }
    };

    const showFileInput = () => {
      if (!fileInputVisible.value && fileInput.value) {
        fileInputVisible.value = true;
        fileInput.value.click();
      }
    };

    const handleDirectoryChange = (event) => {
      const files = Array.from(event.target.files);
      if (files.length > 0) {
        const firstFile = files[0];
        const absolutePath = firstFile.path || firstFile.webkitRelativePath; // 兼容不同浏览器
        const directoryPath = absolutePath.split(firstFile.name)[0];
        selectedDirectory.value = directoryPath;
        fileInputVisible.value = false; // 隐藏文件选择框
      }
    };

    return {
      url,
      fileInput,
      triggerFileInput,
      selectedDirectory,
      showFileInput,
      handleDirectoryChange
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
