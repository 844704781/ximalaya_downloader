<h1 align="center">喜马拉雅下载工具</h1>
<h4 align="center">ximalaya-downloader</h4>

![Forks](https://img.shields.io/github/forks/844704781/ximalaya_downloader.svg?style=social) ![Stars](https://img.shields.io/github/stars/844704781/ximalaya_downloader.svg?style=social) ![Downloads](https://img.shields.io/github/downloads/844704781/ximalaya_downloader/total.svg)![License](https://img.shields.io/github/license/844704781/ximalaya_downloader.svg)![Release](https://img.shields.io/github/v/release/844704781/ximalaya_downloader.svg)![Contributors](https://img.shields.io/github/contributors/844704781/ximalaya_downloader.svg)


### 说明
这款软件是用 Node.js 开发的，提供喜马拉雅音频下载功能，仅供学习参考使用。

当我的喜马拉雅 VIP 账号要过期时，我发现自己还有一堆喜欢的专辑没听完！考虑到我听东西的速度比蜗牛还慢，我决定在 VIP 还有效的时候，把喜欢的音频专辑下载下来慢慢享用。于是，我边捉急边开发了这款软件。

这个软件是用纯 Node.js 语言打造的，虽然我编程水平一般般，但我会尽力不让它荒废。哪怕我碰巧有空闲时间，也会不断更新它。不过，如果你在试用的时候发现了 bug，别急，别急，别急！欢迎在 GitHub 上提 issue，或者大佬们也可以随时提交 PR，我会不胜感激的！

PS：如果觉得这个项目不错，请一定为我点亮 star，这对我很重要（失业中😭）！另外，如果您愿意的话，也可以给我一点小小的赞助。



### 命令行版

![](./images/cli-demo.png)

### 已实现功能

- [x] 官方扫码登录
- [x] 自定义下载路径
- [x] 已购声音或vip免费声音下载
- [x] 自动重新下载下载失败的音频
- [x] 选择下载音频的音质
- [x] 整个专辑全量下载

### 可能会实现的功能

- [ ] GUI界面

### 源码编译

环境:

> node v20.13.1 (npm v10.5.2)

#### 普通编译

```shell
npm install 
node xmd.js --help
```

#### 命令行相关参数

```shell
node xmd.js --help
Usage: xmd [options]

Options:
  -a, --albumId <value>       albumId,必填
  -n, --concurrency <number>  并发数,默认10
  -s, --slow                  慢速模式
  -t, --type                  登录类型,可选值pc、web,默认都登陆(需要扫码多次)
  -o, --output <value>        当前要保存的目录,默认为~/Downloads (default: "~/Downloads")
  -h, --help                  display help for command
```
#### 使用案例

```shell
node xmd.js -a 51523585 -s
```
### 请作者喝一杯可乐

<div style="overflow: hidden; border:solid 1px #eeeeee;">
  <img src="http://qiniu.cospapa.cn/2071715937483_.pic.jpg" style="float: left; width: 35%;" />
  <img src="http://qiniu.cospapa.cn/2081715937598_.pic.jpg" style="float: right; width: 35%;" />
</div>

### Star History

[![Star History Chart](https://api.star-history.com/svg?repos=844704781/ximalaya_downloader&type=Date)](https://star-history.com/#844704781/ximalaya_downloader&Date)
