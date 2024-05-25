const {WebSiteDownloader} = require('../handler/webSiteDownloader.js');
const {DarwinDownloader} = require('../handler/darwinDownloader.js');
const {contextBridge} = require('electron');


// 创建一个通用的包装函数来包装异步方法
// 创建一个通用的包装函数来包装异步方法，包括父类的方法
function wrapAsyncMethods(obj) {
    let proto = Object.getPrototypeOf(obj);

    while (proto && proto !== Object.prototype) {
        const methodNames = Object.getOwnPropertyNames(proto);

        methodNames.forEach(methodName => {
            const method = obj[methodName];
            // 检查方法是否是异步函数
            if (method && method.constructor.name === 'AsyncFunction') {
                const asyncMethodName = methodName + 'Async';
                if (!obj.hasOwnProperty(asyncMethodName)) {
                    obj[asyncMethodName] = async function (...args) {
                        return await method.apply(obj, args);
                    };
                }
            }
        });

        proto = Object.getPrototypeOf(proto);
    }
}


const downloader = {
    pc: new DarwinDownloader(),
    web: new WebSiteDownloader()
};


wrapAsyncMethods(downloader.pc)
wrapAsyncMethods(downloader.web)

contextBridge.exposeInMainWorld('downloader', downloader);

contextBridge.exposeInMainWorld('node', {
    base64ToBuffer: (base64Data) => {
       const data= Buffer.from(base64Data, 'base64');
       return data
    }
});
