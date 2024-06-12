import fs from "fs";
import {projectRoot} from "../settings.js";

let _config
if (fs.existsSync(`${projectRoot}/config.json`)) {
  const configBuf = fs.readFileSync(`${projectRoot}/config.json`)
  _config = JSON.parse(String(configBuf))
}

export const config = _config