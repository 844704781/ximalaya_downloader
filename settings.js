import {fileURLToPath} from 'url';
import path from 'path';

// 获取当前模块文件的 URL
const __filename = fileURLToPath(import.meta.url);

// 推导出项目根目录
const rootDir = path.resolve(path.dirname(__filename), '');

export const projectRoot = rootDir
