import {createRouter, createWebHashHistory} from 'vue-router'


export default createRouter({
        history: createWebHashHistory(),
        routes: [
            {
                path: '/',
                name: 'Login',
                component: () => import('@/renderer/src/views/Login.vue')
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

