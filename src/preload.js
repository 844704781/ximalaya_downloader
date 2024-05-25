const { WebSiteDownloader } = require('../handler/webSiteDownloader.js');
const { DarwinDownloader } = require('../handler/darwinDownloader.js');
const { contextBridge } = require('electron');

const downloader = {
    pc: new DarwinDownloader(),
    web: new WebSiteDownloader()
};

contextBridge.exposeInMainWorld('downloader', downloader);
