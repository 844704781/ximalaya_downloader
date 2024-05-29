<template>
  <el-row class="log-main">
    <el-scrollbar ref="outputContainer" class="output">
      <div>
        <p v-for="(item,index) in logs" :key="index">
          {{ item }}
        </p>
      </div>
    </el-scrollbar>
  </el-row>
</template>

<script>
import {ref, onMounted, nextTick, watch} from 'vue';
import {ElScrollbar} from 'element-plus';

export default {
  name: 'LogPanel',
  components: {
    ElScrollbar,
  },
  setup() {
    const outputContainer = ref(null);
    const logs = ref([])
    const scrollToBottom = () => {
      nextTick(()=>{
        const container = outputContainer.value.wrapRef;
        container.scrollTop = container.scrollHeight;
      })
    };


    onMounted(() => {
      scrollToBottom();
      window.api.logReceive((event, message) => {
        logs.value.push(message)
        if (logs.value.length >= 1000) {
          logs.value.shift()
        }
      })
    });

    watch(logs.value, () => {
      scrollToBottom();
    });

    return {
      outputContainer,
      logs
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
    font-size: 12px;
    line-height: 15px;
  }
}
</style>
