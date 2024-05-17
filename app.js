import {login, getCurrentUser, isLogin, checkUser} from '#root/handler/loginHandler.js'
import {getTracksList} from '#root/handler/trackHandler.js'
import {getBaseInfo, download, playUrl} from '#root/handler/downloadHandler.js'
import {getCookies} from "#root/common/utils.js"
import {decrypt} from "#root/handler/core/decrypt.js"
import {config} from '#root/common/config.js'
import pLimit from 'p-limit';
import {log} from '#root/common/log4jscf.js'
import {database} from '#root/db/database.js'
import {program} from "commander"
import {AtomicInteger} from '#root/common/AtomicInteger.js'

let taskCount = new AtomicInteger(0)

let finishCount = new AtomicInteger(0)


async function downloadAudio(track, path) {
    let user = await getCurrentUser(await getCookies())
    checkUser(user, true)
    const cookies = await getCookies()
    const baseInfo = await getBaseInfo(track.albumId, track.trackId, cookies)
    const playUrlList = baseInfo.trackInfo.playUrlList
    const e = playUrl(playUrlList)
    const url = decrypt({deviceType: "www2", link: e.encodeText})
    const filePath = path + "/" + baseInfo.albumInfo.title
    const trackName = `${(parseInt(track.num) + 1)}.${baseInfo.trackInfo.title}`
    let target = await download(url, filePath, trackName)
    await database.update({'trackId': track.trackId}, {'done': true})
    await finishCount.increment()
    await printProgress(trackName, target)
}

async function printProgress(trackName, target) {
    if (trackName)
        log.info(`下载成功------>进度:${await getProgress(finishCount, taskCount)}%(${await finishCount.get()}/${await taskCount.get()})---->${target}`)
    else {
        log.info(`当前信息------>进度:${await getProgress(finishCount, taskCount)}%(${await finishCount.get()}/${await taskCount.get()})`)

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

async function main() {


    program
        .option('-a, --albumId <value>', '请输入albumId,必填')
        .option('-n, --concurrency <value>', '并发数,默认10')
        .option('-r, --overwrite <value>', '覆盖操作,默认false')
        .option('-p, --path <value>', '当前要保存的目录,默认为~/Downloads');

    program.parse(process.argv)
    const options = program.opts();
    /**
     * 1. 判断是否登录，如果未登录，则登录
     * 2. 根据书名将书存入数据库，要保存是否完结
     * 3. 获取章节列表，将其存入数据库，要记录是否下载
     * 4. 下载音频，下载成功后将记录设置为已下载
     */
    let _isLogin = await isLogin()
    if (!_isLogin) {
        login()
    }
    let user = await getCurrentUser(await getCookies())
    checkUser(user)

    const albumId = options.albumId
    if (albumId == null || albumId.trim() == '') {
        log.error("请输入albumId")
        return
    }
    log.info(`当前albumId:${albumId}`)
    let concurrency = 10
    if (options.concurrency != null && options.concurrency.trim() != '') {
        concurrency = parseInt(options.concurrency)
    }
    let overwrite = false
    if (options.overwrite != null && options.overwrite.trim() != '') {
        overwrite = true
    }

    let path = config.archives
    if (options.path != null && options.path.trim() != '') {
        path = options.path
    }
    log.info(`当前保存目录:${path}`)

    const limit = pLimit(concurrency)

    let pageSize = 30
    let total = 1
    let num = 0
    for (let pageNum = 1; pageNum <= total; pageNum++) {
        const book = await getTracksList(albumId, await getCookies(), pageNum, pageSize)
        const trackTotalCount = book.trackTotalCount
        total = Math.floor(trackTotalCount / pageSize) + 1
        for (let index in book.tracks) {
            num++
            let track = book.tracks[index]
            const _track = await database.findOne({'trackId': track.trackId})
            if (_track == null) {
                await database.insert({
                    "trackId": track.trackId,
                    "title": track.title,
                    "albumId": albumId,
                    "num": num,
                    "done": false
                })
            }
        }
    }
    const condition = {"albumId": albumId}
    if (!overwrite) {
        condition.done = false
    }
    await taskCount.set(await database.count({}))
    await finishCount.set(await database.count({
        "albumId": albumId,
        "done": true
    }))
    await printProgress()
    while (true) {
        const tracks = await database.find(condition, concurrency * 2)
        if (tracks.length == 0) {
            break
        }
        const promises = tracks.map(track => limit(() => downloadAudio(track, path)))
        await Promise.all(promises)
    }
}

main()