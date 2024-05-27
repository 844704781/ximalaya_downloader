<template>
  <el-row class="log-main">
    <el-scrollbar ref="outputContainer" class="output">
      <div>{{ content }}</div>
    </el-scrollbar>
  </el-row>
</template>

<script>
import { ref, onMounted, watch } from 'vue';
import { ElScrollbar } from 'element-plus';

export default {
  name: 'LogPanel',
  components: {
    ElScrollbar,
  },
  setup() {
    const content = ref('');
    const outputContainer = ref(null);
      content.value =
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n' +
        '[2024-05-21T16:06:58.018] [INFO] app - (mac)下载成功>>>>>进度:0.17%(2/1191)---->/Users/watermelon/Downloads/《斗破苍穹》20亿网络点击神作_原著无删减，畅听全集/2.斗破苍穹001【新书《凌天战尊》上架，嘎嘎好听，快冲鸭兄得】.m4a\n';
    const scrollToBottom = () => {
      const container = outputContainer.value.wrapRef;
      container.scrollTop = container.scrollHeight;
    };

    onMounted(() => {
      scrollToBottom();
    });

    watch(content, () => {
      scrollToBottom();
    });

    return {
      content,
      outputContainer,
    };
  },
};
</script>

<style lang="scss" scoped>
.log-main {

  background-color: #272727;
  width: 100%;
  height: 100%;
  border: solid 1px #2c3e50;
  border-radius: 5px;
  margin: 0 20px;

  .output {
    height: 500px;
    padding: 10px;
    overflow-y: auto;
    white-space: pre-wrap; /* Ensure text will wrap */
    word-wrap: break-word; /* Ensure long words will break */
    word-break: break-all; /* Ensure links and long words break */
  }

  div {
    text-align: left; /* Ensure text is left-aligned */
    white-space: pre-wrap; /* Ensure text will wrap */
    word-wrap: break-word; /* Ensure long words will break */
    word-break: break-all; /* Ensure links and long words break */
    font-size: 15px;
    line-height: 20px;
  }
}
</style>
