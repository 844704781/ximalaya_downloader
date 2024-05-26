<template>
  <el-row>
    <el-row>
      <log-panel></log-panel>
    </el-row>
    <el-row>
      <control-panel></control-panel>
    </el-row>
  </el-row>
</template>

<script>
import LogPanel from "../components/LogPanel.vue";
import ControlPanel from "../components/ControlPanel.vue";

export default {
  name: "Main",
  components: {
    'log-panel': LogPanel,
    'control-panel': ControlPanel
  }
}
</script>

<style scoped>

</style>
