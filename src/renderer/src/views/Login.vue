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
            <div :class="item.qrcodeClass">
              <el-image v-loading="item.url === null" :src="item.url" :fit="fit"/>
              <div :class="item.loginSuccessClass">
              </div>
            </div>
          </el-row>
          <el-row class="qr-tag">
            <el-text>{{ item.tag }}</el-text>
          </el-row>
        </el-col>
      </el-row>
      <el-row class="entering">
        <el-button type="danger" size="large" :disabled="notAllowEnter" @click="enterClick">{{ buttonText }}</el-button>
      </el-row>
    </el-main>
  </el-container>
</template>

<script>
import {reactive, onMounted, ref} from 'vue';
import logoPath from '../assets/logo.png';
import log from 'electron-log/renderer';
import {useRouter} from 'vue-router'

export default {
  name: "Login",
  setup() {
    const router = useRouter()


    const fit = 'contain';
    let notAllowEnter = ref(true);
    let buttonText = ref('扫码中...');
    const list = reactive([
      {
        deviceType: 'www2',
        url: null,
        qrId: null,
        isLogin: false,
        tag: 'Web端登录',
        qrcodeClass: '',
        loginSuccessClass: ''
      },
      {
        deviceType: 'mac',
        url: null,
        qrId: null,
        isLogin: false,
        tag: 'PC端登录',
        qrcodeClass: '',
        loginSuccessClass: ''
      }
    ]);

    const abstractGetQrCode = async (deviceType) => {
      const qrCode = await window.api.getQrCode(deviceType)
      return {
        url: 'data:image/jpeg;base64,' + qrCode.img,
        qrId: qrCode.qrId
      };
    };

    const enterClick = () => {
      if (notAllowEnter.value) {
        log.info('至少要扫一个二维码')
        return
      }
      router.push('/main')
      window.api.enterMain()
    }

    const getQrCodeResult = async (item) => {
      log.info(`${item.deviceType},扫码中`)
      const loginResult = await window.api.getLoginResult(item.deviceType, item.qrId)
      if (!loginResult.isSuccess) {
        return loginResult
      }
      item.qrcodeClass = 'qrcode'
      item.loginSuccessClass = 'loader'
      notAllowEnter.value = false
      buttonText.value = '直接进入'
      log.info('当前登录用户', loginResult.user)
      return loginResult
    };

    const loadQrCode = async () => {
      await Promise.all(list.map(async (item) => {
        abstractGetQrCode(item.deviceType)
          .then(data => {
            item.url = data.url;
            item.qrId = data.qrId;
            /**
             * 获取扫码结果定时器
             * @type {number}
             */
            let getQrCodeInterval = setInterval(async () => {
              const loginResult = await getQrCodeResult(item)
              if (loginResult.isSuccess) {
                clearInterval(getQrCodeInterval)
              }
            }, 5000)
            let loginAllCheckInterval = setInterval(() => {
              let loginCount = 0
              for (const i in list) {
                const item = list[i]
                if (item.loginSuccessClass.trim() != '') {
                  loginCount++
                }
              }
              if (loginCount == list.length) {
                //所有都登录了
                notAllowEnter.value = false
                buttonText.value = '进入'
                clearInterval(loginAllCheckInterval)
                enterClick()
              }
            }, 2000)
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
      notAllowEnter,
      buttonText,
      abstractGetQrCode,
      loadQrCode,
      getQrCodeResult,
      enterClick
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

      .qrcode {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        background-color: rgba(0, 0, 0, 0.5);
      }

      .el-image {
        //border:solid 1px red;
        height: 250px;
        width: 250px;
        z-index: -1;
      }

      // 圆圈
      .loader {
        position: absolute;
        width: 80px;
        height: 80px;
        border-radius: 50%;
        border: 4px solid rgba(165, 220, 134, 0.2);
        border-left-color: #A5DC86;
        animation: animation_collect 1s linear 1 both; //infinite永远执行
      }

      // 圆圈动画代码
      @keyframes animation_collect {
        0% {
          transform: rotate(270deg);
          border-left-color: #A5DC86;
        }
        25% {
          border-left-color: #A5DC86;
        }
        50% {
          border-left-color: #A5DC86;
        }
        75% {
          border-left-color: #A5DC86;
        }
        100% {
          border-left-color: rgba(165, 220, 134, 0.2);
          transform: rotate(0deg);
        }
      }

      //对号
      .loader::before {
        position: absolute;
        content: '';
        top: 50%;
        left: 15px;
        border: 4px solid #A5DC86;
        border-left-width: 0;
        border-bottom-width: 0;
        transform: scaleX(-1) rotate(135deg);
        transform-origin: left top;
        // 设置动画延迟1s执行，先执行外层圆圈动画 结束后执行该动画
        animation: animation_true 0.5s 1s linear 1 both;
        // 外层执行动画执行时，里面不显示，但是不能使用display:none,所以用opacity代替
        opacity: 0;
      }

      @keyframes animation_true {
        0% {
          opacity: 0;
          width: 0px;
          height: 0px;
        }
        33% {
          opacity: 1;
          width: 20px;
          height: 0px;
        }
        100% {
          opacity: 1;
          width: 20px;
          height: 40px;
        }
      }


      .qr-tag {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
      }


    }

    .entering {
      //border: solid 1px black;
      margin-top: 50px;
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;

      .el-button {
        width: 200px;
      }
    }
  }
}
</style>
