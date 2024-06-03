import fs from "fs";
import {projectRoot} from "../settings.js";
import defaultConfig from "../config.json";

let _config = defaultConfig
if (fs.existsSync(`${projectRoot}/config.json`)) {
  const configBuf = fs.readFileSync(`${projectRoot}/config.json`)
  _config = JSON.parse(String(configBuf))
}

export const config = _config