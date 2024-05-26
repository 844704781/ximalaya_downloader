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


router.beforeEach((to, from, next) => {
  // 假设这里有个判断用户是否登录的逻辑

  if (to.path === '/login') {
    const hasOnline = window.api.enterMain()
    // 如果用户已经登录，并且要前往登录页面，则重定向到主页面
    if (hasOnline) {
      next('/main');
    } else {
      next();
    }
  } else {
    next();
  }

});


export default router

