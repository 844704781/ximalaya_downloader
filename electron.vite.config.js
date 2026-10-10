import {resolve} from 'node:path'
import {defineConfig, externalizeDepsPlugin} from 'electron-vite'
import vue from '@vitejs/plugin-vue'

/**
 * electron-vite 配置（适配 electron-vite 2.x）
 *
 * 几点必须注意的约定：
 *
 * 1. 不写 build.rollupOptions.input。
 *    目录结构符合默认约定，electron-vite 会自动识别：
 *      main     -> src/main/index.js       (out/main)
 *      preload  -> src/preload/index.js    (out/preload)
 *      renderer -> src/renderer/index.html (out/renderer)
 *    显式写 input 需要 __dirname，而本文件是 ESM，__dirname 并不存在。
 *
 * 2. 必须使用 externalizeDepsPlugin()。
 *    electron-vite 2.x 不会自动外部化依赖，不挂这个插件的话 axios / nedb /
 *    log4js 等 CJS 包会被打进主进程产物，容易出问题。
 *    （注意：electron-vite 5 移除了这个插件，改成内置的 build.externalizeDeps。
 *      如果将来升级到 v5，需要把这里改回 main: {} / preload: {}，
 *      同时把 vite 升到 7、@vitejs/plugin-vue 升到 6。）
 *
 * 3. 因此 axios / nedb / log4js / mkdirp / p-limit 等必须留在 package.json
 *    的 dependencies 里；而只给渲染层用的 vue 放在 devDependencies，
 *    可以减小最终安装包体积。
 */
export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()]
    },
    preload: {
        plugins: [externalizeDepsPlugin()]
    },
    renderer: {
        resolve: {
            alias: {
                '@renderer': resolve('src/renderer/src'),
                '@': resolve('src/renderer/src')
            }
        },
        plugins: [vue()]
    }
})
