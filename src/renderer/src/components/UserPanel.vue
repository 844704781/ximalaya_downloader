<template>
  <div class="user-main">
    <div class="avatar">
      <el-avatar
        :src='logoPic'
        :size="100"
      />
    </div>
    <div class="info">
      <div class="info-main">
        <el-row>
          <el-col :span="20" :offset="4">
            {{ nickname }}
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="20" :offset="4">
            {{ mobile }}
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="20" :offset="4">
            {{ isVip ? '会员用户' : '普通用户' }}
          </el-col>
        </el-row>

      </div>

    </div>
    <div class="exit">
      <el-row>
        <el-col :span="20" :offset="4">
          <el-button type="info" link @click="exit">退出</el-button>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script>
import {onMounted, ref} from "vue";
import log from "electron-log/renderer";

export default {
  name: "UserPanel",
  setup() {
    const logoPic = ref('https://imagev2.xmcdn.com/storages/7411-audiofreehighqps/86/59/GMCoOR4KADyzAABaWALLHLrf.jpg!strip=1&quality=7&magick=webp&op_type=5&upload_type=cover&name=web_large&device_type=ios')
    const nickname = ref('watermelon_46')
    const isVip = ref('false')
    const vipLeftDay = ref(10)
    const mobile = ref('176****8447')

    const exit = () => {
      window.api.exit()
    }

    onMounted(async () => {
      const user = await window.api.getCurrentUser()
      nickname.value = user.nickname
      logoPic.value = user.logoPic
      isVip.value = user.isVip
      mobile.value = user.mobile
    })
    return {
      logoPic,
      mobile,
      nickname,
      isVip,
      vipLeftDay,
      exit
    }
  }
}
</script>

<style lang="scss" scoped>
.user-main {
  display: flex;
  flex-direction: column;
  height: 100%;

  //border: solid 1px red;
  .avatar {
    margin: 50px;
  }

  .info {
    .info-main {
      //border:solid 1px blue;
      margin: 10px 0;
      padding: 5px;
      text-align: left;

      .el-row {
        margin-top: 40px;
      }
    }
  }

  .exit {
    margin-top: auto;
    margin-bottom: 30px;
    //border: solid 1px red;
  }
}
</style>
