# 喜马拉雅下载器 —— Electron + Vue 图形界面

本文件说明新增的 GUI 部分。原有的命令行用法（`node xmd.js -a <albumId>`）完全不受影响。

---

## 一、做了什么

在原有 CLI 核心之上，新增了三层：

| 层 | 位置 | 职责 |
|---|---|---|
| 下载核心 | `core/` | 可暂停的下载任务、任务管理器、登录通道服务、设置持久化 |
| Electron 主进程 | `src/main/` | 窗口、IPC、把下载事件推给界面 |
| 渲染层 | `src/renderer/` | Vue 3 界面，只通过 `window.xmd` 与主进程通信 |

原有的 `handler/`、`common/`、`db/` 只做了**增量修改**，没有删除或重写任何既有方法。

---

## 二、目录结构

```
ximalaya_downloader/
├── core/                         # 新增：下载核心（不依赖 electron，可用 node 直接跑）
│   ├── paths.js                  #   路径工具，userData 目录注入
│   ├── settingsStore.js          #   设置持久化（写 userData/settings.json）
│   ├── authService.js            #   登录通道服务（web / pc）
│   ├── downloadTask.js           #   单专辑下载状态机（暂停/恢复/取消/重试）
│   └── taskManager.js            #   全局任务管理器（单例 factory + 事件合批）
├── src/
│   ├── main/
│   │   ├── index.js              # 主进程入口
│   │   └── ipc/                  # IPC 处理器，按域拆分
│   ├── preload/index.js          # contextBridge 白名单桥
│   └── renderer/                 # Vue 3 应用
├── common/                       # 原有 + 新增 errors.js / filename.js
├── handler/                      # 原有 + streamAudio / 登录轮询接口
├── db/                           # 原有 + updateMulti
├── xmd.js                        # 原有 CLI 入口，未改动
├── electron.vite.config.js       # 新增
├── electron-builder.yml          # 新增
└── package.json                  # 已修改（新增 main 字段、GUI 脚本与依赖）
```

---

## 三、安装与运行

### 环境要求

本项目刻意选了**兼容 Node 18 的工具链**：

| 依赖 | 版本 | `engines` 要求 |
|---|---|---|
| Node.js | **18.20.8**（当前环境） | — |
| vite | `^5.4.10` | `^18.0.0 \|\| >=20.0.0` |
| electron-vite | `^2.3.0` | `^18.0.0 \|\| >=20.0.0` |
| @vitejs/plugin-vue | `^5.2.4` | `^18.0.0 \|\| >=20.0.0` |
| electron | `^39.2.6` | `>= 12.20.55` |
| electron-builder | `^26.0.12` | `>=14.0.0` |

**为什么要降级：** 最初的配置用的是 Vite 7 + electron-vite 5 + plugin-vue 6，它们都要求 `^20.19.0 || >=22.12.0`，并且依赖 Node 20.12 才引入的 `crypto.hash()`。在 Node 18 上会直接崩：

```
TypeError: crypto.hash is not a function
    at getHash (node_modules/vite/dist/node/chunks/config.js)
    at getDepsHash (...)
```

降级后这套组合能在 Node 18.20.8 上正常运行。

**关于 `electron.vite.config.js` 的版本差异（升级时必看）：**

| | electron-vite 2.x（当前） | electron-vite 5.x |
|---|---|---|
| 依赖外部化 | 必须显式挂 `externalizeDepsPlugin()` | 已移除该插件，内置 `build.externalizeDeps` 默认启用 |
| 配套 vite | 5.x | 7.x |
| 配套 plugin-vue | 5.x | 6.x |
| 需要的 Node | `^18.0.0 \|\| >=20.0.0` | `^20.19.0 \|\| >=22.12.0` |

将来若把 Node 升到 22 LTS，可以整体换回新版：`electron-vite@^5` + `vite@^7` + `@vitejs/plugin-vue@^6`，同时把 `electron.vite.config.js` 里的 `externalizeDepsPlugin` 去掉。其余代码无需改动。

### 国内网络：Electron 二进制下载

仓库根目录的 `.npmrc` 已配置好 npmmirror 镜像：

```
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
```

`electron` 的 `postinstall` 会从 GitHub Releases 下载约 100MB 的二进制包，国内网络下会被重置或长时间无响应，表现为 `npm install` 永远卡住不结束，而 `node_modules/electron` 里只有包本体、没有 `dist/` 和 `path.txt`。

判断二进制是否装好：

```powershell
Test-Path .\node_modules\electron\path.txt   # 必须是 True
```

若仍是 `False`，用环境变量显式指定（`.npmrc` 对 lifecycle script 的传递在某些 npm 版本下不可靠）：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_CUSTOM_DIR="{{ version }}"
npm install
```

### ⚠️ 本机必须加 `--no-sandbox --disable-gpu` 才能启动 Electron

这台机器上 Chromium 的**沙箱初始化会失败**，导致 Electron 在加载任何 JS 之前就以
`0x80000003`（`STATUS_BREAKPOINT`，Chromium 原生 `CHECK()` 失败）终止。

典型症状（全都是这一个原因）：

- 执行 `npm run dev` 后终端停在 `start electron app...`，**没有任何报错**
- 没有窗口、没有崩溃转储
- `~/.xmd/logs/app.log` 里连一行启动日志都没有（`src/main/index.js` 模块体的第一行就是路标日志，
  没有它说明 ESM import 阶段就没跑起来）

**为什么看不到报错：** Windows 上 `electron.exe` 是 GUI 子系统程序，它的 stdout/stderr 不接父控制台，
所以 `> file 2>&1`、`Tee-Object` 都抓不到；而故障发生在原生层，JS 根本没机会写日志。

**解法：** `package.json` 的 `dev` / `start` / `preview` 脚本已经带上参数：

```jsonc
"dev": "electron-vite dev --noSandbox -- --disable-gpu"
```

注意 electron-vite **2.x 的 CLI 选项是驼峰 `--noSandbox`**，写成 `--no-sandbox` 会直接报
`CACError: Unknown option '--sandbox'`（cac 把 `--no-x` 当成了对 `--x` 取反）。
`--` 之后的内容会透传给 Electron。electron-vite 2.3.0 源码里的拼接逻辑是：

```js
const args = process.env.ELECTRON_CLI_ARGS ? JSON.parse(process.env.ELECTRON_CLI_ARGS) : []
if (process.env.NO_SANDBOX === '1') args.push('--no-sandbox')
spawn(electronPath, [entry].concat(args), { stdio: 'inherit' })
```

**想知道到底哪个参数是必需的**，跑 `npm run probe:electron`，它会依次测试
无参数 / 只 `--no-sandbox` / 只 `--disable-gpu` / 两者都有，结果即时写入 `electron-test.log`。
把非必需的那个去掉即可（`--disable-gpu` 会关掉硬件加速，影响不大但没必要一直开着）。

**如果换到别的机器/终端上**，先试着把参数去掉——很可能根本不需要。

### 命令

```bash
npm install          # 注意：不要用 npm ci，见下方说明

# 开发模式（带热更新）
npm run dev

# 仅构建产物到 out/
npm run build

# 用构建产物启动，验证生产模式
npm run preview

# 打包安装程序（产物在 release/）
npm run dist

# 命令行版本仍然可用
npm run cli -- -a 33476331
```

关键依赖版本：electron 39 / electron-vite 5 / vite 7 / vue 3.5。

> ⚠️ **先跑 `npm install`，不要用 `npm ci`。**
> 仓库里的 `package-lock.json` 还是 CLI 时代的，里面没有 electron / electron-vite / vite / vue 这些新依赖，`npm ci` 会因 lock 与 `package.json` 不一致而直接失败。
> 执行一次 `npm install` 重建 lock 之后，`npm ci` 才能用。

---

## 四、关于 `electron-app/` 目录

工作区里曾经出现过一个 `electron-app/` 目录，那是一份**未被使用的 create-electron 模板**（只有 `Versions.vue`、`electron.svg` 这类模板自带文件，没有任何本项目代码）。它已经被删掉了，这是对的。

**GUI 建在项目根目录**，因为 `handler/`、`common/`、`db/`、`xmd.js` 都在根目录，GUI 必须和它们同一个包才能复用下载逻辑。如果以后又生成了类似的脚手架目录，直接删掉即可。

同理，旧的 `electron/main.js`、`electron/preload.js`、`electron/download.js`（三个 0 字节空文件）和 `renderer/index.html`（只有空 `#app` 的骨架）也已从工作区移除，它们的位置由 `src/main/`、`src/preload/`、`src/renderer/` 取代。

---

## 五、本机环境限制与适配

> **✅ 这一节描述的核心问题已经解决。**
> Electron 进程曾经只能写项目目录，根因是 `electron.exe` 这个**文件**继承了工作区的
> 低完整性标签 —— 完整分析和修复见**第十一节**。修复后**下载目录可以任意选择**，
> 不再需要限制在项目内。
>
> 下面保留历史记录，以及**仍然需要**的几处适配（数据目录位置、日志与设置的候选链）。

这台机器上曾经存在一个**非标准的环境限制**，它直接决定了配置怎么设。这里记录完整证据，换机器时可以据此判断要不要保留这些适配。

### 历史现象（已解决）

> ~~**从这个终端启动的 Electron 进程，无法写入 `D:\test\ximalaya_downloader` 之外的任何位置。**~~
> ~~同一个终端里的 `node` 却完全正常（`npm install`、构建、写家目录都没问题）。只有 Electron 被限制。~~

**根因**：工作区目录带 `Mandatory Label\Low Mandatory Level:(OI)(CI)`，
npm 解压出的 `electron.exe` 继承了这个标签；而 Windows 用**镜像文件的完整性标签**
决定进程的完整性级别，于是 Electron 以 Low 运行，只能写入同样带 Low 标签的目录。

### 证据

| 位置 | 操作 | 结果 |
|---|---|---|
| `~/.xmd/logs` | Electron `mkdir` | ❌ `EPERM` |
| `~/.xmd/db/file/*.db` | Electron `open`（nedb） | ❌ `EPERM` |
| `%APPDATA%\ximalaya_downloader\settings.json` | Electron 写入 | ❌ `EPERM` |
| `D:\` 根目录 | Electron `mkdir` | ❌ `EPERM` |
| `C:\Users\…\Documents\Downloads` | Electron `mkdir` | ❌ `EPERM` |
| `D:\test\ximalaya_downloader\logs` | Electron 写入 | ✅ 成功 |
| `~/.xmd/logs` | **node** 写入 | ✅ 成功 |

### 由此做的四处适配

> **现状（2026-10-10 晚）：`config.json` 已经改回正常路径** ——
> `xmd: "~/.xmd"`、`archives: "~/Downloads"`，数据也已从项目内的
> `.xmd-data` 迁移到家目录。因为根因（低完整性）修好之后，家目录重新变得可写，
> 这些适配**不再需要**。
>
> 下面这些适配**代码里全部保留**，它们是候选链而不是硬编码，所以：
> 换到任何环境都会**优先用正常路径**，只有写不进去时才逐级退到项目内 ——
> 这层兜底值得留着。

| 适配 | 位置 | 为什么必须 |
|---|---|---|
| **数据目录指向项目内** | `config.json` 的 `xmd` = `D:/test/ximalaya_downloader/.xmd-data` | nedb 数据库、cookie、日志、设置**统一读这一个字段**，改一处即全部生效 |
| **userData 重定向** | `src/main/index.js` 启动时 `app.setPath('userData', <xmd>/electron)` | `%APPDATA%` 不可写不只影响 Chromium 缓存——**单实例锁创建失败会让 `requestSingleInstanceLock()` 返回 false，应用静默退出、完全没有窗口**，这是最难排查的一类 |
| **日志目录候选链** | `common/log4jscf.js` | `~/.xmd/logs` → `<cwd>/logs` → 临时目录 → 纯控制台；每级都做**真实写入探测**（只 `mkdirSync` 成功不代表能写文件）；`log4js.configure()` 包在 try/catch 里，**日志系统出任何问题都不能让进程挂掉** |
| **设置文件候选链** | `core/settingsStore.js` | 同样三级候选；写盘失败只在内存生效，不再抛异常刷错误提示；去掉了 `.tmp` + `rename` 中间文件（受限环境下多一个中间文件就多一次被拒绝的机会） |

### 换到正常机器时怎么恢复

把 `config.json` 改回：

```json
"xmd": "~/.xmd",
"archives": "~/Downloads"
```

上面四处适配**不需要改代码**——候选链的第一项本来就是这些正常路径，会自动用回去。

**还要注意完整性标签**：如果目标机器上的项目目录被预先打了
`Mandatory Label\Low Mandatory Level:(OI)(CI)`，那么 `npm install` 解压出来的
`electron.exe` 会继承它，**同一个问题会原样复现**。判断方法：

```powershell
icacls "node_modules\electron\dist\electron.exe" | Select-String Mandatory
# 正常机器上这一行是空的；出现 Low 就执行修复：
npm run fix:electron-integrity
```

细节见第十一节。

### ⚠️ 关于「电脑端」通道

`下载设置 → 下载通道` **推荐选「自动」或「网页端」**。

「电脑端」通道在查询章节列表时会失败。原因：`AbstractDownloader.getTracksList()` 走的是客户端接口
（`mobile.ximalaya.com/mobile/v1/album/track?...&device=android`），
而「电脑端」通道（`DarwinDownloader`）会带上 `1&_device=darwin&…`、`channel=99` 这套 mac 设备标识，
服务端判定参数矛盾，直接返回：

```
{ msg: '亲，系统繁忙，请稍后重试', ret: -1 }
```

这是**原项目就存在的问题**（CLI 的 `-t pc` 同样会踩到），不是这次改造引入的。

**不过现在即使选错也不会卡死**：`DownloadTask._loadAlbum()` 会按候选顺序逐个尝试通道
（用户指定的优先，然后是其它已登录通道），第一个成功的会被锁定。选「电脑端」时日志和界面会看到：

```
通道「电脑端」获取专辑信息失败（喜马拉雅内部异常），自动改用「网页端」
```

这个容错能力对应原项目 `DownloaderFactory.getDownloader()` 的通道轮换逻辑——
GUI 改造一开始用 `acquire()` 绕过了它，后来补回来了。

### 已经实测验证通过的部分

| 项 | 证据 |
|---|---|
| Electron 启动（加 `--noSandbox --disable-gpu` 后） | 日志 `app ready，创建窗口` + 渲染层 `[vite] connected` |
| 30+ 个模块的 ESM 加载（含 9 个 CJS 包的互操作） | 诊断脚本全部 `[OK]`，含 `nedb`/`log4js`/`mkdirp`/`p-limit`/`axios-retry` |
| nedb 数据库读写、3434 集章节分页 | 诊断脚本查询成功 |
| 扫码登录 + cookie 持久化 | 日志 `www2 登录成功` / `网页端 登录成功` |
| 专辑查询、章节列表 | 拿到服务端正常业务响应（含 `ret: 924` 这类业务错误也被正确处理） |
| **实际下载落盘** | 多张专辑累计 60+ 个 `.aac` 文件 |
| 自动建目录、自动命名、扩展名推断 | `1.《…》000（…）.aac`、`2.…-001 睁眼，有个男人（…）.aac` |
| **暂停 / 恢复 / 取消** | 真实任务完整跑过：`pause()` 0.05 秒内落到 `paused`，暂停后 2 秒文件数不再增长，恢复后继续落盘，取消后状态 `cancelled`，全程 `failed=0` |
| **下载到任意目录** | 修好完整性标签后，`D:\FlashCenter`、`D:\book` 等位置都能直接写入 |
| **「打开文件夹」** | `explorer.exe /select,<dir>` 能正确弹出并选中；路径反推修好后 3 个存量专辑全部定位成功 |
| **通道自动回退** | 日志 `通道「电脑端」获取专辑信息失败（喜马拉雅异常），自动改用「网页端」` |

### 仍然存在的未验证项

- **打包产物没实际安装运行过**：`npm run dist` 现在能跑通（依赖问题见第十二节），
  但生成的安装包没有在干净机器上装过
- **图标**：`build/` 目录下没有图标文件，打包会用默认图标并给出告警
- **开发期 CSP**：`src/renderer/index.html` 设了 `script-src 'self'`，实测不影响 HMR；若以后白屏，先注释掉那个 `<meta>` 验证
- **重启应用后的「继续下载」语义**：任务状态只存在于主进程内存中。重启后暂停过的专辑显示为 `idle`，点「开始下载」走新建任务路径——重新拉专辑信息和章节列表，只下载还没有 `path` 的章节。已下完的文件不会重复下载，但**不会**从上次中断的字节继续（简化版暂停本来也不支持）

---

## 六、暂停功能的语义（简化版）

按约定实现的是**简化版暂停**，请知悉其行为：

| 操作 | 行为 |
|---|---|
| 暂停 | 停止派发新章节 → 中断所有在途下载 → **删除半截 `.part` 文件** → 这些章节退回 `待下载` |
| 恢复 | 重新获取播放地址（签名地址会过期），**从 0 字节重新下载**这些章节 |
| 代价 | 暂停瞬间，正在下载的 ≤ 并发数 个章节的进度会丢失 |
| 好处 | 不依赖 CDN 支持 HTTP Range，暂停/恢复 100% 可靠，不会产生损坏文件 |

**因此界面上总进度必须按「已完成章节数 / 总章节数」计算，不能用字节数**——按章节数算进度单调递增，按字节算会出现总进度倒退的观感问题。

`DownloadTask` 的状态机：

```
任务：idle → running → pausing → paused → running → done
                         └→ cancelled

章节：pending → downloading → done
         ↑            │
         └────────────┘   暂停/中断/失败重试
                      └→ failed（重试 3 次用尽）
```

`pausing` 这个中间态必须保留：暂停不是瞬间生效，要等所有 `AbortController.abort()` 真正收敛。界面在 `pausing` 期间应显示「暂停中…」并禁用按钮。

---

## 七、几个刻意的设计决定

1. **`.part` 临时文件 + rename**
   虽然简化版不做断点续传，仍然先写 `.part` 再改名。原因是 `trackDB` 靠 `path` 字段是否存在来判断章节已完成，如果直接写最终文件名，进程崩溃时会留下半截文件被误判为「已下载完成」，且永远不会重下。

2. **`DownloaderFactory` 全局单例**
   `handler/downloader.js` 的实例持有 `isLimit` 状态和已登录的 downloader。每个任务各建一个会导致反复扫码登录、风控计数各自独立。`TaskManager.factory()` 保证全局只有一个。

3. **章节进度事件 300ms 合批**
   `TaskManager._queueTrack()` 按 `trackId` 去重后每 300ms 推一次数组。10 个并发下载若每个 chunk 都发一次 IPC，渲染进程每秒要处理上千次跨进程序列化，界面必然卡死。

4. **不在 `_login()` 里扫码**
   `DownloaderFactory._login()` 在通道未登录时会走 `login()`，那是个 `while(true)` 死循环等扫码，适合命令行但不适合 GUI。`core/authService.js` 的 `resolveType()` 会在建任务前检查登录态，一个通道都没登录就直接报错，绝不落到那个死循环上。

5. **设置不写回 `config.json`**
   写 `app.getPath('userData')/settings.json`。安装目录通常不可写，且 `settings.js` 的 `path.resolve('.')` 在打包后不再指向项目根。

6. **渲染层零额外依赖**
   只用 `vue`，手写组件与 CSS。没有引入 vue-router / pinia / element-plus，把依赖面压到最小以降低构建风险。页面切换用 `ref` 控制的页签，章节表格分页显示（默认每页 200 行）而不是一次渲染上千行。

---

## 八、CLI 是否还正常

是。所有对既有文件的修改都是**增量**的：

| 文件 | 改动 |
|---|---|
| `handler/abstractDownloader.js` | 只新增 `streamAudio` / `getPlayUrl` / `requestQrCode` / `checkLogin` / `getLoginState` / `logout` 与模块级 `getFileExtension`；`_getAudio`、`login()`、`download()` 等原有方法一字未动（构造函数里给 `config.xmd` 加了兜底） |
| `handler/downloader.js` | 新增 `acquire()` / `invalidate()`；`getDownloader` 的 catch 里多记录 `lastError`，抛出的错误 message 保持原样，只额外挂了 `details` / `causes`；单通道时不再置 `isLimit` |
| `db/trackdb.js` / `db/albumdb.js` | 新增 `updateMulti`，新增两个索引，`config.xmd` 加兜底 |
| `common/log4jscf.js` | 日志目录从 `logs/` 改为 `~/.xmd/logs`，加了大小轮转 |
| `common/config.js` | 配置文件查找支持多个候选路径，默认值不变 |
| `common/errors.js` / `common/filename.js` | 新增文件，CLI 不使用 |

`xmd.js` 未改动。

---

## 九、独立代码审查已修复的问题

代码写完后做了一轮独立的静态对抗审查，以下是**已经修掉**的实质缺陷（都写在了最终代码里）：

| 严重度 | 问题 | 修复 |
|---|---|---|
| 🔴 | `registerSystemIpc` 被 import 却从未调用，`dialog:chooseDir` 通道根本不存在，「浏览…」选目录 100% 失效 | `src/main/ipc/index.js` 补上调用 |
| 🔴 | 暂停会永久锁死下载通道：`getDownloader` 把回调里的 abort 异常当成「通道被限流」并置 `isLimit` | 下载路径改用新增的 `DownloaderFactory.acquire()` |
| 🟠 | 单通道时一次偶发网络失败就会永久锁死整个会话（`isLimit` 无意义地置位） | 只在 `downloaders.length > 1` 时标记限流 |
| 🟠 | 取消后无法恢复：`resume()` 只在 `paused` 生效，`cancelled` 时静默无反应 | 改为任意非运行态都能重新进入下载循环 |
| 🟠 | `resume()` 期间状态短暂为 `idle`，此时再建任务会误报「已有正在进行的任务」 | 活动判断改为正向匹配 `running/pausing/paused` |
| 🟠 | `pause()` 无超时，一个卡死的请求会让状态永久停在 `pausing`，`cancel()` 也拉不出来 | 新增 `_settleInFlight()`，15 秒超时兜底 |
| 🟠 | 退出登录 / 换 Cookie 后，工厂里缓存的 downloader 仍用旧 cookie 发请求 | 新增 `invalidate()`，凭据变更时由 IPC 层调用 |
| 🟠 | `streamAudio` 写盘失败时不销毁 source 流，可能导致 unhandled `'error'` 事件干掉主进程 | `pipeline` 失败时 `response.data.destroy()` |
| 🟠 | 移除专辑后下次刷新又出现（`albumDB` 记录未删） | `remove()` 无论哪个选项都清专辑记录 |
| 🟡 | `settings.json` 中 `output` 为 `null` 时 `path.join` 抛 TypeError，专辑列表和任务启动一起挂 | `getSettings()` 强制 `output` 为有效字符串 |
| 🟡 | `remove` / `retry` / `create` 传 `null` 时解构抛 TypeError | 显式 `options == null ? {} : options` |
| 🟡 | `retry` 先重置失败章节再检查登录态，未登录时失败计数凭空归零 | 先 `resolveType()` 再重置 |
| 🟡 | `config.json` 缺 `xmd` 字段时构造函数抛 TypeError，登录面板不可用 | `abstractDownloader` / `trackdb` / `albumdb` 三处加兜底 |
| 🟡 | 目标文件已存在时「先删后改名」中间崩溃会丢成品文件 | 改为优先直接 `rename` 覆盖，失败才回退 |
| 🟡 | `done` 状态的专辑没有任何按钮，文件被删后无法重新检查 | `isStartable` 纳入 `done` |

审查也明确核对了以下类别**未发现问题**：语法、未定义标识符、相对路径层级与 `.js` 扩展名、`this` 绑定、CJS 命名导入、`{multi:true}` 参数位置、`p-limit@5` / `mkdirp@3` 用法、`electron-vite 5` 配置语法、`main` 字段与 `.mjs` 产物名、`electron-builder.yml` 字段名，以及 17 条 IPC 通道的名称/参数逐条比对（除已被修复的 `dialog:chooseDir` 外全部匹配）。

---

## 十、排查提示

### 文件都在哪

本机的数据目录是 `D:\test\ximalaya_downloader\.xmd-data\`（由 `config.json` 的 `xmd` 决定）：

| 内容 | 路径 |
|---|---|
| 应用日志 | `.xmd-data\logs\app.log` |
| Cookie（网页端 / 电脑端） | `.xmd-data\www2-cookies.json` / `.xmd-data\mac-cookies.json` |
| nedb 数据库 | `.xmd-data\db\file\track.db`、`album.db` |
| 设置 | `.xmd-data\electron\settings.json`（userData 被重定向到这里） |
| 下载文件 | `downloads\<专辑名>\` |

> 正常机器上这些应该分别在 `~/.xmd/`、`%APPDATA%\ximalaya_downloader\`、`~/Downloads\`。
> 现在指向项目内是第五节记录的环境限制导致的适配，不是设计如此。

### 常见问题

- **日志只写了两三行就断了**：启动阶段的路标日志是**同步**写盘（`bootstrapNote`），
  所以只要日志存在就一定能看到进程走到哪一步。非启动阶段走 log4js，是异步写入，
  进程被强杀时最后几条可能丢。
- **界面白屏**：按 `Ctrl+Shift+I` 打开渲染进程 DevTools；渲染层的 `console` 输出也会被
  收进 `app.log`（前面带 `[renderer]` 前缀）。
- **任务创建后立刻失败并提示「尚未登录」**：去「登录」页扫码或手动粘贴 Cookie。
  也可以在 `config.json` 里把 `cookie.www2.serverMode` 设为 `true` 并填 `value`，跳过扫码。
- **报「所有下载方式都受限了」**：所有通道都失败了。日志里会带上每个通道的原始错误
  （`details` 字段），据此判断是限流（`ret 999`）、下架（`ret 924`）还是没权限（`403`）。
- **报 `EPERM: operation not permitted`**：说明 Electron 进程又变成「低完整性级别」了
  （根因见第十一节）。一条命令修复：
  ```powershell
  npm run fix:electron-integrity
  ```
  然后重启应用。修好之后下载目录可以随便选。
- **双击 `npm run dev` 没窗口，也没有任何输出**：先杀残留实例
  （`Get-Process electron | Stop-Process -Force`）。
  单实例锁冲突时会弹一个说明框，不再静默退出。
- **下载的文件名很长**：喜马拉雅的章节标题本身就很长（常常重复一遍专辑名）。
  已按整条路径长度裁剪（目录 ≤200、文件 ≤240 字符），不会撞 Windows 的 260 上限。

---

## 十一、完整性级别：为什么曾经「只能下载到项目目录」（已解决）

这是本项目排查耗时最久的一个问题，结论非常反直觉，完整记录下来避免重蹈覆辙。

### 现象

- GUI 把下载目录设成 `D:\Documents`、`D:\book`、`D:\git` 等任何**项目外**位置，
  一律报 `EPERM: operation not permitted, mkdir ...`
- 同一个终端里的 CLI（`node xmd.js`）却能下载到任意位置
- 用资源管理器手动操作那些目录完全正常，文件本身也读得到（不是 ACL 权限不足）

### 真正的根因

工作区目录带着一个低完整性标签：

```
D:\test\ximalaya_downloader
    Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)
```

`(OI)(CI)` = 容器继承 + 对象继承，**在这个目录里新建的所有文件都会继承这个 Low 标签**。

npm 安装 electron 时把压缩包解压到 `node_modules/electron/dist/`，于是：

```
node_modules\electron\dist\electron.exe
    Mandatory Label\Low Mandatory Level:(I)(NW)        ← 文件带上了 Low
```

**而 Windows 用镜像文件（exe）本身的完整性标签来决定进程的完整性级别。**

于是 Electron 进程以「低完整性」运行，而 Windows 的强制完整性控制（MIC）只允许**向下写**：

| 进程完整性 | 写 Low 目录 | 写 Medium 目录（系统默认） |
|---|---|---|
| **Electron（Low）** | ✅ | ❌ **EPERM** |
| **`node.exe`（在 `E:\tools` 下、无标签，继承终端的管理员级别）** | ✅ | ✅ |

这一条就解释了全部现象：项目目录带 Low 标签所以能写，其它目录默认 Medium 所以写不了，
而 `node` 完全不受影响。

### 验证与修复

```powershell
# 1. 看 electron.exe 文件本身的标签
icacls "node_modules\electron\dist\electron.exe" | Select-String Mandatory
#    改之前: Mandatory Label\Low Mandatory Level:(I)(NW)

# 2. 改回 Medium（或者直接跑 npm run fix:electron-integrity）
icacls "node_modules\electron\dist\electron.exe" /setintegritylevel Medium

# 3. 重启应用，看启动日志里这一行
#    [BOOT] 完整性级别探测: Medium 或更高（能写用户主目录）—— 下载目录可以任意选择
```

改完之后**任何目录都能直接选，不需要给下载目录打任何标签**。

### 永久修复：postinstall 钩子

[scripts/fix-electron-integrity.cjs](scripts/fix-electron-integrity.cjs) 已挂在 `postinstall` 上：

```json
"postinstall": "node scripts/fix-electron-integrity.cjs"
```

这样每次 `npm install` / `npm ci` 之后都会自动把 `electron.exe` 的标签改回 Medium。
脚本永远以退出码 0 结束，不会让安装失败。

```powershell
npm run fix:electron-integrity   # 也可以随时手动跑
```

> npm 若禁用了脚本（`--ignore-scripts`），需要手动跑上面这条。

### 已逐一验证并排除的绕路方案（都无效，不要再走）

| 方案 | 为什么没用 |
|---|---|
| 目录联接（junction） | 联接是透明的，写入会穿透到目标目录，受的是**目标**标签的约束 |
| 应用内直接跑 `icacls` 打标签 | 低完整性进程改不了 Medium 对象（「拒绝访问」） |
| 通过 UAC（`Start-Process -Verb RunAs`）提权跑 `icacls` | 低完整性进程的提权请求被 Windows 拒绝 |
| 委托 `node.exe` 子进程落盘 | 子进程继承父进程的令牌，同样是 Low |
| `fs.symlinkSync(target, link, 'junction')` | 它内部走 `CreateSymbolicLinkW`，需要 `SeCreateSymbolicLinkPrivilege`，报 EPERM；`mklink /J` 才走 `FSCTL_SET_REPARSE_POINT`（不需要特权） |
| 改文件名 / 复制到别的目录 | 无效，标签跟着文件内容走 |
| 给下载目录打 Low 标签 | **能解决，但每个下载根目录都要来一次，不推荐**；正确做法是修 `electron.exe` |

另外还排查过并排除：MOTW（文件来源标记）、AppCompat Layers 的 `LOWINTEGRITY`、
IFEO、AppContainer（令牌里没有 `S-1-15-2-*`）、以及 Chromium 自身降级
—— 在 `ELECTRON_RUN_AS_NODE=1` 模式下 Chromium 根本没启动，进程依然是 Low，
所以降级与 Chromium 无关。

### 换到正常机器

正常机器上的工作区不会被预先打上 Low 标签，`electron.exe` 不会继承 Low，
**这个问题根本不会出现**。只有在「目录被预先标了 Low 且带 `(OI)(CI)` 继承」的
环境里才会踩到。

### 顺带记录：`ELECTRON_RUN_AS_NODE`

如果环境里存在 `ELECTRON_RUN_AS_NODE=1`（某些 Electron 宿主程序会设置它），
那么 `electron.exe` 会以**纯 Node 模式**运行，表现为：

```
SyntaxError: The requested module 'electron' does not provide an export named 'BrowserWindow'
```

排查时如果看到这个报错，先清掉该变量再启动：

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run dev
```

### 「打开文件夹」的两个坑

**坑 1：路径用当前设置去拼，而不是专辑实际下载的位置。**

`_historyOutput` 原本写的是「当前下载目录 + 专辑名」。用户一旦切换下载目录，
所有老专辑的「打开文件夹」就会指向一个不存在的位置，报
「目录还不存在，可能还没有开始下载」——实测日志里同一个专辑先能定位、换目录后就失败。

修复后的取值优先级（[core/taskManager.js](core/taskManager.js)）：

1. 专辑记录里的 `output` 字段（[core/downloadTask.js](core/downloadTask.js) 在加载专辑时写入）
2. 从任意一条已下载章节的 `path` 反推（trackDB 里存的是完整文件路径）—— **这条能修复存量老记录**
3. 当前设置（兜底）

**坑 2：`shell.showItemInFolder` 在本机没有反应。**

实测对比（Electron 已是 Medium 完整性）：

| 方式 | 结果 |
|---|---|
| `shell.showItemInFolder(dir)` | ❌ 调用无异常，但不打开任何窗口 |
| `spawn('explorer.exe', [dir])` | ✅ 打开目录 |
| `spawn('explorer.exe', ['/select,' + dir])` | ✅ **打开父目录并选中该文件夹** |

所以 [src/main/ipc/task.js](src/main/ipc/task.js) 现在首选 `/select,`。
注意 `/select,` 必须和路径写在**同一个参数**里，这是 explorer 的命令行要求。

---

## 十二、打包（`npm run dist`）

打包本身需要先跨过两个坑，两个都已经修好并且实测通过。

### 坑 1：electron-builder 的依赖版本不兼容

```
Error [ERR_REQUIRE_ESM]: require() of ES Module
node_modules\@noble\hashes\blake2.js from app-builder-lib ... not supported
```

`app-builder-lib@26.15.3`（electron-builder 的内部包）在
`out/targets/blockmap/blockmap.js` 里用 `require()` 加载 `@noble/hashes/blake2.js`，
但它声明的版本区间 `^2.2.0` 从 v2 起该包已经是 **ESM-only**，所以必定失败。

**修复**：在 [package.json](package.json) 里把该包锁到最后一个带 CJS 的版本：

```json
"overrides": {
  "@noble/hashes": "1.8.0"
}
```

（`pkijs` 本来也要求 `1.8.0`，所以这个版本是一致的。运行时用不到这个包，只影响打包。）

### 坑 2：打包产物同样继承了 Low 完整性标签

`release/win-unpacked/*.exe` 和 `release/*.exe`（安装程序本身）都是在工作区里生成的，
**同样会继承 `(OI)(CI)` 的 Low 标签** —— 不修的话装完之后的应用会有完全一样的
「只能写项目目录」问题，安装程序自己也可能装不进 `Program Files`。

**修复**：[scripts/fix-electron-integrity.cjs](scripts/fix-electron-integrity.cjs)
现在会**递归**处理三类 exe，并且 `dist` 脚本在打包后自动跑一遍：

```json
"dist": "electron-vite build && electron-builder && node scripts/fix-electron-integrity.cjs"
```

> 递归是必须的：`release/win-unpacked/resources/elevate.exe` 是 electron-builder
> 用来请求提权的辅助程序，它藏在子目录里，只扫顶层会漏掉它。

### 实测结果

| 项 | 结果 |
|---|---|
| `npm run dist` | ✅ 退出码 0 |
| 安装包 | `release/ximalaya-downloader-1.0.0-win-x64.exe`（90.7 MB） |
| 免安装版 | `release/win-unpacked/喜马拉雅下载器.exe` |
| `extraResources` | ✅ `config.json`、`images/`、`resource/` 都在 `resources/` 下 |
| **启动免安装版** | ✅ 4 个进程，`app ready，创建窗口`，渲染层从 `app.asar` 正常加载 |
| **免安装版的进程完整性** | ✅ **Medium**（标签修复生效，可以下载到任意目录） |
| 打包版是否需要 `--no-sandbox` | **不需要**（argv 里没有任何参数也正常启动） |

`release/` 总计约 425 MB，已在 `.gitignore` 里忽略。

### 打包仍需注意的点

- **`config.json` 会被原样打进 `resources/`**，里面的 `xmd` / `archives` 是**开发机的绝对路径**
  （`D:/test/ximalaya_downloader/...`）。在当前机器上这反而正好可用；
  但发给别人之前应该改回正常路径，或者让安装后的首次启动引导用户设置。
- **安装包没有在干净机器上装过**：只验证了免安装版能启动。

### 应用图标

图标放在**项目根的 `build/` 目录**（`electron-builder.yml` 里配了 `buildResources: build`，
而且没有指定 `win.icon`，所以走默认约定）：

| 文件 | 平台 | 要求 |
|---|---|---|
| **`build/icon.ico`** | Windows | **主要就是这个**，建议包含 256×256；多尺寸（16/24/32/48/64/128/256）在任务栏、开始菜单、资源管理器里都清晰 |
| `build/icon.icns` | macOS | —— |
| `build/icon.png` | Linux | ≥512×512 |

仓库里已经放了一套图标（橙色渐变圆角方块 + 白色均衡器竖条）。
想换成自己的，**直接用同名文件覆盖**即可，不需要改任何配置。

**只需要准备两个文件就够了**：

| 文件 | 说明 |
|---|---|
| `build/icon.ico` | Windows 用。把一张 1024×1024 的 PNG 转成含 16/24/32/48/64/128/256 多尺寸的 ICO |
| `build/icon.png` | 1024×1024，四角透明、内容留约 10% 安全边距 |

转换 ICO 可以用在线工具，或者任意支持多尺寸 ICO 导出的图片工具。

> 验证图标是否真的嵌进去了：从 `release/win-unpacked/` 下的 exe 提取图标，
> 和 `node_modules/electron/dist/electron.exe` 的默认图标对比哈希，不同即成功。


