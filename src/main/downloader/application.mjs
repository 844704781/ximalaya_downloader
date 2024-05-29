#!/usr/bin/env node
import {config} from '../common/config.mjs'
import {log} from '../common/log4jscf.mjs'
import {trackdb} from '../db/trackdb.mjs'
import {albumdb} from '../db/albumdb.mjs'
import {program, InvalidArgumentError} from "commander"
import {AtomicInteger} from '../common/AtomicInteger.mjs'
import {sleep} from '../common/utils.mjs'
import {DownloaderFactory as CommandDownloaderFactory} from '../downloader/downloader.mjs'
import os from "os";
import fs from "fs";
import path from 'path'
import {mkdirpSync} from "mkdirp";
import {rimrafSync} from 'rimraf'


let taskCount = new AtomicInteger(0)
let finishCount = new AtomicInteger(0)

let emoji = '>'

async function getPQueue() {
  const pQueueModule = await import('p-queue')
  return pQueueModule.default
}

async function printProgress(trackName, target, deviceType) {
  const downloaderName = `${deviceType == null ? '' : `(${deviceType})`}`
  if (trackName)
    log.info(`${downloaderName}下载成功${emoji.repeat(5)}进度:${await getProgress(finishCount, taskCount)}%(${await finishCount.get()}/${await taskCount.get()})---->${target}`)
  else {
    log.info(`${downloaderName}当前信息${emoji.repeat(5)}进度:${await getProgress(finishCount, taskCount)}%(${await finishCount.get()}/${await taskCount.get()})`)
  }
}

async function getProgress(finishCount, taskCount) {
  let _finishCount = await finishCount.get()
  let _taskCount = await taskCount.get()
  if (_taskCount == 0) {
    return 100
  }
  let n = _finishCount / _taskCount
  return (n * 100).toFixed(2)
}

function myParseInt(value, dummyPrevious) {
  // parseInt takes a string and a radix
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError('Not a number.');
  }
  return parsedValue;
}

function cleanedStr(str) {
  // 定义文件路径相关字符的正则表达式
  const pathCharactersRegex = /[<>:"\/\\|?*\x00-\x1F]/g;
  // 定义替换后的字符
  const replacementCharacter = '_';
  // 替换文件路径相关字符
  const encodedStr = str.replace(pathCharactersRegex, replacementCharacter);
  return encodedStr;
}

async function download(factory, options, album, track) {
  if (track.path && fs.existsSync(track.path)) {
    return
  }
  let targetDir = options.output
  if (targetDir.includes('~')) {
    targetDir = targetDir.replace('~', os.homedir())
  }
  targetDir = path.join(targetDir, cleanedStr(album.albumTitle))

  if (!fs.existsSync(targetDir)) {
    mkdirpSync(targetDir)
  }

  const downloadResp = await factory.getDownloader(options.type, true, async downloader => {

    return {
      data: await downloader.download(track.trackId),
      deviceType: downloader.deviceType
    }
  })
  if (downloadResp == null) {
    return
  }
  const data = downloadResp.data
  const deviceType = downloadResp.deviceType
  const filePath = path.join(targetDir, track.num + "." + cleanedStr(track.title) + data.extension)
  fs.writeFileSync(filePath, data.buffer)
  await trackdb.update({'trackId': track.trackId}, {'path': filePath})
  await finishCount.increment()
  await printProgress(track.title, filePath, deviceType)
}


async function run(factory = null,
                   output = null,
                   albumId = null,
                   switchMeta = null) {
  log.info("欢迎使用 ximalaya_downloader！🎉")
  log.info("如果觉得棒棒哒，去 GitHub 给我们点个星星吧！🌟")
  log.info("GitHub 地址：https://github.com/844704781/ximalaya_downloader 💻")

  let options
  /**
   * 区分命令行和客户端
   */
  if (factory == null) {
    program
      .option('-a, --albumId <value>', 'albumId,必填')
      .option('-n, --concurrency <number>', '并发数,默认10', myParseInt)
      .option('-s, --slow', '慢速模式')
      .option('-t, --type', '登录类型,可选值pc、web,默认都登陆(需要扫码多次)')
      .option('-r, --replace', '清除缓存,任务将重新下载')
      .option('-o, --output <value>', '当前要保存的目录,默认为~/Downloads', config.archives);

    program.parse(process.argv)
    options = program.opts();
    factory = CommandDownloaderFactory.create()
  } else {
    options = {
      albumId,
      output
    }
  }

  albumId = options.albumId
  if (albumId == null || albumId.trim() == '') {
    log.error("要输入 albumId 哦，尝试输入 node xmd.mjs --help 查看使用说明吧😞")
    return
  }
  if (options.replace) {
    log.info("清空缓存中...")
    rimrafSync(path.join(config.xmd.replace('~', os.homedir()), 'db', 'file'))
  }
  log.info(`当前albumId:${options.albumId}`)
  log.info(`当前保存目录:${options.output}`)

  if (options.concurrency == null) {
    options.concurrency = 10
  }
  if (!options.slow) {
    emoji = '＞'
    log.warn(`${'🚀'.repeat(5)}当前为快速模式,很容易被官方大大踢屁屁哦`)
  } else {
    emoji = '>'
    options.concurrency = 1
    log.info(`${'🐢'.repeat(5)}当前为慢速模式`)
  }

  log.info(`并发数:${options.concurrency}`)
  const pQueue = await getPQueue()
  const queue = new pQueue({concurrency: options.concurrency})
  log.info("正在获取专辑信息")

  const albumResp = await factory.getDownloader(options.type, false, async (downloader) => {
    return await downloader.getAlbum(albumId)
  })

  log.info(`当前专辑:${albumResp.albumTitle},总章节数:${albumResp.trackCount}`)
  let album = await albumdb.findOne({"albumId": albumId})
  let needFlushTracks = true

  if (album == null) {
    album = {
      "albumId": albumId,
      "albumTitle": albumResp.albumTitle,
      "isFinished": albumResp.isFinished,//0:不间断更新 1:连载中 2:完结
      "trackCount": albumResp.trackCount
    }
    await albumdb.insert(album)
  } else {
    await albumdb.update({'albumId': albumId}, {
      "isFinished": album.isFinished,
      "trackCount": album.trackCount
    })
    album = albumResp
  }
  const iTrackCount = await trackdb.count({'albumId': albumId})
  if (album.trackCount == iTrackCount) {
    needFlushTracks = false
  }
  if (needFlushTracks) {
    let pageSize = 30
    let total = 1
    let num = 0
    log.info("正在获取章节列表")
    for (let pageNum = 1; pageNum <= total; pageNum++) {
      const book = await factory.getDownloader(options.type, false, async downloader => {
        return await downloader.getTracksList(albumId, pageNum, pageSize)
      })
      const trackTotalCount = book.trackTotalCount
      total = Math.floor(trackTotalCount / pageSize) + 1
      for (let index in book.tracks) {
        num++
        let track = book.tracks[index]
        const _track = await trackdb.findOne({'trackId': track.trackId})
        if (_track == null) {
          await trackdb.insert({
            "trackId": track.trackId,
            "title": track.title,
            "albumId": albumId,
            "num": num,
            "path": null
          })
        }
        log.info(`获取章节列中,总章节数:${album.trackCount},当前位置:${num}------>${track.title}`)
      }
    }
    log.info("获取章节列表成功")
  }
  const condition = {"albumId": albumId, path: null}

  await taskCount.set(await trackdb.count({"albumId": albumId}))
  await finishCount.set(await trackdb.count({
    "albumId": albumId,
    "path": {
      $ne: null
    }
  }))
  await printProgress()
  if (await taskCount.get() == await finishCount.get()) {
    log.info("已经下载完成")
    return
  }
  log.info("数据加载中...️")
  while (true) {

    const tracks = await trackdb.find(condition, {"num": 1}, !options.slow ? options.concurrency * 2 : 1)
    if (tracks.length == 0) {
      log.info("已经下载完成")
      break
    }
    for (const tracksKey in tracks) {
      const track = tracks[tracksKey]
      if (switchMeta) {
        if (switchMeta.getStart()) {
          queue.start()
          switchMeta.setStart(false)
        } else {
          log.info("已暂停")
          queue.pause()
          switchMeta.setStart(true)
        }
      }

      return queue.add(async () => {
        try {
          return await download(factory, options, album, track)
        } catch (e) {
          log.info("已暂停")
          queue.clear()
          switchMeta.setStart(true)
          return
        }
      })

    }
    if (options.slow) {
      await sleep(Math.floor(Math.random() * (5000 - 500 + 1)) + 500)
    }
  }
}


export const Application = {
  run
}
