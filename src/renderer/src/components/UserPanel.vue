<template>
  <div class="user-main">
    <div class="avatar">
      <el-avatar
        :src='avatarUrl'
        :size="100"
      />
    </div>
    <div class="info">
      <div class="info-main">
        <el-row>
          <el-col :span="20" :offset="4">
            {{ username }}
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
          <el-button type="info" link>退出</el-button>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script>
import {ref} from "vue";

export default {
  name: "UserPanel",
  setup() {
    const avatarUrl = ref('https://imagev2.xmcdn.com/storages/7411-audiofreehighqps/86/59/GMCoOR4KADyzAABaWALLHLrf.jpg!strip=1&quality=7&magick=webp&op_type=5&upload_type=cover&name=web_large&device_type=ios')
    const username = ref('watermelon_46')
    const isVip = ref('false')
    const vipLeftDay = ref(10)

    return {
      avatarUrl,
      username,
      isVip,
      vipLeftDay
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
