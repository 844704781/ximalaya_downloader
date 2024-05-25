import {createRouter, createWebHashHistory} from 'vue-router'

const login = () => import('@/components/Login')

export default createRouter({
        history: createWebHashHistory(),
        routes: [
            {
                path: '/',
                name: 'Login',
                component: login
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

