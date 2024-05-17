import fs from "fs";
import {projectRoot} from "#root/settings.js";

const configBuf = fs.readFileSync(`${projectRoot}/config.json`)
const _config = JSON.parse(String(configBuf))

export const config = _config