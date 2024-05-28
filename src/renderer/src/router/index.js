import {createRouter, createWebHashHistory} from 'vue-router'


const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      {
        path: '/',
        name: 'default',
        redirect: '/login'
      },
      {
        path: '/login',
        name: 'Login',
        component: () => import('@/renderer/src/views/Login.vue')
      },
      {
        path: '/main',
        name: 'Main',
        component: () => import('@/renderer/src/views/Main.vue')
      }
    ],

    /**
     * 组件切换时可以回到顶部
     * @returns {{x: number, y: number}}
     */
    scrollBehavior() {
      return {x: 0, y: 0}
    }
  }
)


export default router

