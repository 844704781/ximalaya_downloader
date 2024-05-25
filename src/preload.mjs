import {WebSiteDownloader} from "../handler/webSiteDownloader.mjs";
import {DarwinDownloader} from "../handler/darwinDownloader.mjs";

import {contextBridge} from 'electron'

const downloader = {
    pc: () => new DarwinDownloader(),
    web: () => new WebSiteDownloader()
}

contextBridge.exposeInMainWorld('downloader', downloader)
