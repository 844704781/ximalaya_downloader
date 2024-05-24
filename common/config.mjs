import fs from "fs";
import {projectRoot} from "../settings.mjs";

const configBuf = fs.readFileSync(`${projectRoot}/config.json`)
const _config = JSON.parse(String(configBuf))

export const config = _config