import {config} from '#root/common/config.js'
import pLimit from 'p-limit';
import {log} from '#root/common/log4jscf.js'
import {trackDB} from '#root/db/trackdb.js'
import {albumDB} from '#root/db/albumdb.js'
import {program, InvalidArgumentError} from "commander"
import {AtomicInteger} from '#root/common/AtomicInteger.js'
import {sleep} from '#root/common/utils.js'
import {DownloaderFactory} from '#root/handler/downloader.js'
import os from "os";
import fs from "fs";
import {mkdirpSync} from "mkdirp";

let taskCount = new AtomicInteger(0)
let finishCount = new AtomicInteger(0)

let emoji = '🐢'

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

async function download(factory, options, album, track) {
    if (track.path && fs.existsSync(track.path)) {
        return
    }
    let targetDir = options.output + "/" + album.albumTitle
    if (targetDir.includes('~')) {
        targetDir = targetDir.replace('~', os.homedir())
    }
    if (!fs.existsSync(targetDir)) {
        mkdirpSync(targetDir)
    }

    const {data, deviceType} = await factory.getDownloader(options.type, async downloader => {
        return {
            data: await downloader.download(track.trackId),
            deviceType: downloader.deviceType
        }
    })
    const filePath = targetDir + "/" + track.title + data.extension
    fs.writeFileSync(filePath, data.buffer)
    await trackDB.update({'trackId': track.trackId}, {'path': filePath})
    await finishCount.increment()
    await printProgress(track.title, filePath, deviceType)
}


async function main() {
    log.info("欢迎使用 ximalaya_downloader！🎉")
    log.info("如果觉得棒棒哒，去 GitHub 给我们点个星星吧！🌟")
    log.info("GitHub 地址：https://github.com/844704781/ximalaya_downloader 💻")
    program
        .option('-a, --albumId <value>', 'albumId,必填')
        .option('-n, --concurrency <number>', '并发数,默认10', myParseInt)
        .option('-s, --slow', '慢速模式')
        .option('-t, --type', '登录类型,可选值pc、web,默认都登陆(需要扫码多次)')
        .option('-o, --output <value>', '当前要保存的目录,默认为~/Downloads', config.archives);

    program.parse(process.argv)
    const options = program.opts();
    const albumId = options.albumId
    if (albumId == null || albumId.trim() == '') {
        log.error("要输入 albumId 哦，尝试输入 node xmd.js --help 查看使用说明吧😞")
        return
    }

    log.info(`当前albumId:${options.albumId}`)
    log.info(`当前保存目录:${options.output}`)
    if (options.concurrency == null) {
        options.concurrency = 10
    }
    if (!options.slow) {
        emoji = '🚀'
        log.warn(`${emoji.repeat(5)}当前为快速模式,很容易被官方检测到哦`)
    } else {
        emoji = '🐢'
        options.concurrency = 1
        log.info(`${emoji.repeat(5)}当前为慢速模式`)
    }

    log.info(`并发数:${options.concurrency}`)
    const limit = pLimit(options.concurrency)

    const factory = DownloaderFactory.create()
    log.info("正在获取专辑信息")

    const albumResp = await factory.getDownloader(options.type, async (downloader) => {
        return await downloader.getAlbum(albumId)
    })

    log.info(`当前专辑:${albumResp.albumTitle},总章节数:${albumResp.trackCount}`)
    let album = await albumDB.findOne({"albumId": albumId})
    let needFlushTracks = true

    if (album == null) {
        album = {
            "albumId": albumId,
            "albumTitle": albumResp.albumTitle,
            "isFinished": albumResp.isFinished,//0:不间断更新 1:连载中 2:完结
            "trackCount": albumResp.trackCount
        }
        await albumDB.insert(album)
    } else {
        await albumDB.update({'albumId': albumId}, {
            "isFinished": album.isFinished,
            "trackCount": album.trackCount
        })
        album = albumResp
    }

    const iTrackCount = await trackDB.count({'albumId': albumId})
    if (album.trackCount == iTrackCount) {
        needFlushTracks = false
    }
    if (needFlushTracks) {
        let pageSize = 30
        let total = 1
        let num = 0
        log.info("正在获取章节列表")
        for (let pageNum = 1; pageNum <= total; pageNum++) {
            const book = await factory.getDownloader(options.type, async downloader => {
                return await downloader.getTracksList(albumId, pageNum, pageSize)
            })
            const trackTotalCount = book.trackTotalCount
            total = Math.floor(trackTotalCount / pageSize) + 1
            for (let index in book.tracks) {
                num++
                let track = book.tracks[index]
                const _track = await trackDB.findOne({'trackId': track.trackId})
                if (_track == null) {
                    await trackDB.insert({
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

    await taskCount.set(await trackDB.count({}))
    await finishCount.set(await trackDB.count({
        "albumId": albumId,
        "path": {
            $ne: null
        }
    }))
    await printProgress()
    while (true) {
        const tracks = await trackDB.find(condition, {"num": 1}, !options.slow ? options.concurrency * 2 : 1)
        if (tracks.length == 0) {
            break
        }
        const promises = tracks.map(track =>
            limit(async () =>
                await download(factory, options, album, track)))
        await Promise.all(promises)
        if (options.slow) {
            await sleep(Math.floor(Math.random() * (5000 - 500 + 1)) + 500)
        }
    }
}

main()
