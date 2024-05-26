<template>
  <el-container>
    <el-header>
      <el-row class="logo">
        <el-image :src="logoPath" :fit="fit"/>
      </el-row>
      <el-row class="title">
        <el-text tag="b" size="large">欢迎使用喜马拉雅下载器</el-text>
      </el-row>
    </el-header>

    <el-main>
      <el-row>
        <el-col :span="12" v-for="(item, index) in list" :key="index">
          <el-row>
            <el-image v-loading="item.url === null" :src="item.url" :fit="fit"/>
          </el-row>
          <el-row class="qr-tag">
            <el-text>{{ item.tag }}</el-text>
          </el-row>
        </el-col>
      </el-row>
    </el-main>
  </el-container>
</template>

<script>
import {reactive, onMounted} from 'vue';
import logoPath from '../assets/logo.png';

export default {
  name: "Login",
  setup() {
    const fit = 'contain';
    const list = reactive([
      {deviceType: 'www2', url: null, qrId: null, isLogin: false, tag: 'Web端登录'},
      {deviceType: 'mac', url: null, qrId: null, isLogin: false, tag: 'PC端登录'}
    ]);

    const abstractGetQrCode = async (deviceType) => {
      const qrCode = await window.api.getQrCode(deviceType)
      return {
        url: 'data:image/jpeg;base64,' + qrCode.img,
        qrId: qrCode.qrId
      };
    };

    const getQrCodeResult = async (item) => {
      console.log(`${item.deviceType},扫码中`)
      const loginResult = await window.api.getLoginResult(item.deviceType, item.qrId)
      if (!loginResult.isSuccess) {
        return
      }
      console.log('当前登录用户', loginResult.user)

    };

    const loadQrCode = async () => {
      await Promise.all(list.map(async (item) => {
        abstractGetQrCode(item.deviceType)
          .then(data => {
            item.url = data.url;
            item.qrId = data.qrId;
            setInterval(() => {
              getQrCodeResult(item)
            }, 5000)
          });
      }));
    };


    onMounted(async () => {
      await loadQrCode();
    });

    return {
      logoPath,
      fit,
      list,
      abstractGetQrCode,
      loadQrCode,
      getQrCodeResult
    };
  }
};
</script>

<style lang="scss" scoped>
.el-container {
  display: flex;
  flex-direction: column;

  .el-header {
    height: 200px;
    display: flex;
    flex-direction: column;

    .logo {
      height: 150px;
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;

      .el-image {
        width: 100px;
      }
    }

    .title {
      flex: 1;
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;
    }
  }

  .el-main {
    .el-col {
      .el-row {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
      }

      .el-image {
        height: 250px;
        width: 250px;
      }

      .qr-tag {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
      }
    }
  }
}
</style>
