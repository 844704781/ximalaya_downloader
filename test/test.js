// import {sleep} from '../common/utils.js'
//
// const _downloads = [{
//     isLimit: false,
//     downloader: 'web',
//     executeCounter: 0
// }, {
//     isLimit: false,
//     downloader: 'pc',
//     executeCounter: 0
// }, {
//     isLimit: false,
//     downloader: 'android',
//     executeCounter: 0
// }]
//
// async function getDownload(downloads) {
//     for (let i = downloads.length - 1; i >= 0; i--) {
//         let item = downloads[i]
//         if (item.isLimit) {
//             continue
//         }
//         let max = Math.floor(100 / (downloads.length - i))
//         while (item.executeCounter < max) {
//             await sleep(80)
//             item.executeCounter++
//             return item
//         }
//     }
//     downloads.forEach(download => download.executeCounter = 0)
//     const _downloads = downloads.filter(download => download.isLimit == false)
//     if (_downloads.length == 0) {
//         return null
//     }
//     return downloads[downloads.length - 1]
// }
//
// setTimeout(() => {
//     _downloads[_downloads.length - 1].isLimit = true
// }, 10000)
//
// setTimeout(() => {
//     _downloads[_downloads.length - 2].isLimit = true
// }, 20000)
//
//
// setTimeout(() => {
//     _downloads[_downloads.length - 3].isLimit = true
// }, 30000)
// while (true) {
//     const item = await getDownload(_downloads)
//     console.log(`当前${item.downloader},执行次数${item.executeCounter}`)
//
// }

import {sleep} from "../common/utils.js";

/**
 * 统计:
 * web100,mac50,每个音频下载5s, 400个开始封控
 * 1212模式,每个音频下载5s，373开始封控
 * 12模式，398开始封控
 * 全2模式,399开始封控
 * 大概率休息30分钟
 */

function resolvedPromise(value) {
    console.log('我是现在', value);
    return Promise.resolve(value);
}

Promise.all([
    resolvedPromise('one'),
    resolvedPromise('two'),
    resolvedPromise('three')
]).then(values => {
    console.log("我最后执行")
    console.log(values); // 输出: ['one', 'two', 'three']
});

console.log('我在中间执行'); // 这个会首先被打印出来，因为 Promise.all 是异步的