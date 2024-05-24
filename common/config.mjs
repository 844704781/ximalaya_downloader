import fs from "fs";
import {projectRoot} from "../settings.mjs";

let _config = {
  "baseUrl": "https://www.ximalaya.com",
  "loginBaseUrl": "https://passport.ximalaya.com",
  "archives": "~/Downloads",
  "xmd": "~/.xmd",
  "cookie": {
    "www2": {
      "serverMode": false,
      "value": ""
    },
    "mac": {
      "serverMode": false,
      "value": ""
    }
  }
}
if (fs.existsSync(`${projectRoot}/config.json`)) {
  const configBuf = fs.readFileSync(`${projectRoot}/config.json`)
  _config = JSON.parse(String(configBuf))
}

export const config = _config