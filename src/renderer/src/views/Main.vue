<template>
  <div class="app-main">
    <el-row class="app-main-row">
      <el-col :span="5" class="left">
        <user-panel></user-panel>
      </el-col>
      <el-col :span="19" class="right">
        <el-row class="control">
          <control-panel></control-panel>
        </el-row>
        <el-row class="log">
          <log-panel></log-panel>
        </el-row>
      </el-col>
    </el-row>

  </div>
</template>

<script>
import LogPanel from "../components/LogPanel.vue";
import ControlPanel from "../components/ControlPanel.vue";
import UserPanel from "../components/UserPanel.vue";

export default {
  name: "Main",
  components: {
    'log-panel': LogPanel,
    'control-panel': ControlPanel,
    'user-panel': UserPanel
  }
}
</script>

<style lang="scss" scoped>
.app-main {
  .app-main-row{
    height: 100vh;
  }
  .left {
    background-color: #171717;
  }
  .right{
    background-color: #211f20;
  }

  .control {
    //border: solid 1px red;
    margin-top: 20px;
    margin-bottom: 20px;
  }

  .log {
    //border: solid 1px red;
    margin-top: 20px;
    margin-bottom: 20px;
  }
}
</style>
