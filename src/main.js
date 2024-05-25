const { createApp } = require('vue');
const App = require('./App.vue').default; // 加上 .default
const router = require('./router').default; // 加上 .default
const ElementPlus = require('element-plus').default; // 加上 .default
require('element-plus/dist/index.css');

const app = createApp(App);
app.use(ElementPlus);
app.use(router);

app.mount('#app');
