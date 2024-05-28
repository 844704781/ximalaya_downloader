import {createApp} from 'vue'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'


const app = createApp(App)
app.use(ElementPlus)
app.use(router)

app.mount('#app')

window.electron.ipcRenderer.on('route-to', (event, route) => {
  if (route === 'main') {
    router.push('/main');
  } else if (route === 'login') {
    router.push('/login');
  }
});
