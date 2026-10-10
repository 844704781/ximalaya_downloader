import fs from "fs";
import path from "path";
import {projectRoot} from "../settings.js";

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

/**
 * 依次尝试几个位置查找 config.json
 *
 * settings.js 里的 projectRoot 是 path.resolve('.')，也就是进程的工作目录。
 * 命令行下就是项目根，没问题；但 Electron 打包后工作目录变成了用户启动程序的位置，
 * 安装目录还可能不可写，所以还要找 extraResources 里的那一份
 * （electron-builder 的 extraResources 会把文件放到 process.resourcesPath）。
 */
function findConfigFile() {
  const candidates = []
  if (process.env.XMD_CONFIG) {
    candidates.push(process.env.XMD_CONFIG)
  }
  candidates.push(path.join(projectRoot, 'config.json'))
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'config.json'))
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    } catch (e) {
      // 路径不可访问，继续尝试下一个
    }
  }
  return null
}

const configFile = findConfigFile()
if (configFile != null) {
  try {
    // 必须去掉 UTF-8 BOM：用记事本或 PowerShell 的 Set-Content 保存 JSON 会带上
    // BOM（EF BB BF），而 JSON.parse 遇到它直接抛 SyntaxError，
    // 结果是用户改的配置被静默忽略、退回内置默认值，很难排查。
    const text = fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, '')
    _config = JSON.parse(text)
  } catch (e) {
    // 配置损坏时退回内置默认值，不能因为一个坏文件让程序起不来
    console.error(`读取配置文件失败，将使用默认配置: ${configFile}`, e)
  }
}

export const config = _config
