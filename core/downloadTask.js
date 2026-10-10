import {EventEmitter} from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import {mkdirpSync} from 'mkdirp'
import {trackDB} from '../db/trackdb.js'
import {albumDB} from '../db/albumdb.js'
import {log} from '../common/log4jscf.js'
import {sleep} from '../common/utils.js'
import {buildTrackBaseName, cleanedStr, fitDirName, fitFileName} from '../common/filename.js'
import {PausedError, isAbortError} from '../common/errors.js'
import {expandHome} from './paths.js'

/**
 * 单个专辑的下载任务
 *
 * 暂停语义（简化版）：
 *   暂停 -> 停止派发新章节 + abort 所有在途下载 + 删除半截 .part 文件
 *   恢复 -> 未完成的章节重新获取播放地址，从 0 字节开始下载
 * 不做 HTTP Range 断点续传。代价是暂停时丢掉在途章节已下载的字节，
 * 换来的是 100% 可靠的暂停/恢复，不依赖 CDN 支持 Range。
 *
 * 事件：
 *   state    {taskId, albumId, albumTitle, status, total, done, failed, output, concurrency, slow, type}
 *   progress {taskId, albumId, total, done, failed}
 *   track    {taskId, albumId, trackId, num, title, status, received, total, path, error}
 *   log      {level, message}
 */

// 单集最大重试次数（简化版重试就是整集重下，成本很低）
const MAX_RETRY = 3

// 章节列表分页大小，与 CLI 保持一致
const PAGE_SIZE = 30

// 进度事件的最小间隔，避免高频查库
const PROGRESS_INTERVAL_MS = 400

// 暂停/取消时等待在途请求收敛的最长时间
const PAUSE_TIMEOUT_MS = 15000

// 暂停收尾的看门狗：超过这个时间还没落到 paused 就强制执行。
// 必须大于 PAUSE_TIMEOUT_MS，给它留出收敛的余地。
const PAUSE_WATCHDOG_MS = 20000

const TRACK_STATUS = {
    PENDING: 'pending',
    DOWNLOADING: 'downloading',
    DONE: 'done',
    FAILED: 'failed'
}

class DownloadTask extends EventEmitter {

    constructor({taskId, albumId, output, concurrency, slow, type, typeCandidates, factory}) {
        super()
        this.taskId = taskId
        this.albumId = String(albumId)
        this.output = output
        this.concurrency = concurrency
        this.slow = slow
        // 候选通道按优先级排列：用户指定的优先，然后是其它已登录通道。
        // 加载专辑信息时逐个尝试，第一个成功的会成为 this.type。
        this.typeCandidates = Array.isArray(typeCandidates) && typeCandidates.length > 0
            ? typeCandidates.slice()
            : (type != null ? [type] : [])
        this.type = this.typeCandidates[0] || type || null
        this.factory = factory

        // idle | running | pausing | paused | done | failed | cancelled
        this.status = 'idle'
        this.albumTitle = null
        this.trackTotal = 0
        this.done = 0
        this.failed = 0

        this.paused = false
        this.cancelled = false

        // trackId -> AbortController，用于暂停/取消时中断在途请求
        this.controllers = new Map()
        // 当前一批正在跑的 Promise，暂停时要等它们收敛
        this.inFlight = []
        this._lastProgressAt = 0
    }

    // ------------------------------------------------------------------
    // 对外快照
    // ------------------------------------------------------------------

    /**
     * 该专辑的落盘目录：<下载根目录>/<专辑名>
     * @returns {string}
     */
    targetDir() {
        const root = expandHome(this.output || '')
        // 专辑名也要按整条路径长度裁剪：喜马拉雅的专辑名经常非常长，
        // 光是目录就可能顶到 Windows 的 260 上限
        const name = fitDirName(cleanedStr(this.albumTitle || this.albumId), root)
        return path.join(root, name)
    }

    /**
     * 任务快照，直接推给渲染进程
     */
    snapshot() {
        return {
            taskId: this.taskId,
            albumId: this.albumId,
            albumTitle: this.albumTitle,
            status: this.status,
            total: this.trackTotal,
            done: this.done,
            failed: this.failed,
            output: this.targetDir(),
            concurrency: this.concurrency,
            slow: this.slow,
            type: this.type
        }
    }

    // ------------------------------------------------------------------
    // 事件辅助
    // ------------------------------------------------------------------

    _emitState() {
        this.emit('state', this.snapshot())
    }

    _emitLog(level, message) {
        this.emit('log', {level: level, message: message})
    }

    _trackEvent(track, patch) {
        return {
            taskId: this.taskId,
            albumId: this.albumId,
            trackId: track.trackId,
            num: track.num,
            title: track.title,
            ...patch
        }
    }

    /**
     * 上报进度（按时间间隔节流）
     * @param force 忽略节流，立即上报
     */
    async _emitProgress(force = false) {
        const now = Date.now()
        if (!force && now - this._lastProgressAt < PROGRESS_INTERVAL_MS) {
            return
        }
        this._lastProgressAt = now
        try {
            const [total, done, failed] = await Promise.all([
                trackDB.count({albumId: this.albumId}),
                trackDB.count({albumId: this.albumId, status: TRACK_STATUS.DONE}),
                trackDB.count({albumId: this.albumId, status: TRACK_STATUS.FAILED})
            ])
            this.trackTotal = total
            this.done = done
            this.failed = failed
            this.emit('progress', {
                taskId: this.taskId,
                albumId: this.albumId,
                total: total,
                done: done,
                failed: failed
            })
        } catch (e) {
            log.warn('统计下载进度失败:', e)
        }
    }

    // ------------------------------------------------------------------
    // 生命周期
    // ------------------------------------------------------------------

    /**
     * 开始/重新开始下载
     */
    /**
     * 开始/重新开始下载
     *
     * 注意：会一直等到下载结束或再次暂停才返回。刻意不 await 它的调用方有
     * TaskManager.create()（fire-and-forget）和 resume()（见那边的注释）。
     */
    async start() {
        if (this.status === 'running' || this.status === 'pausing') {
            return
        }
        this.cancelled = false
        this.paused = false
        this.status = 'running'
        this._emitState()
        await this._loadAndLoop()
    }

    /**
     * 加载专辑/章节并进入下载循环
     *
     * 从 start() 和 resume() 共用。resume() 不会 await 它 —— 详见 resume() 的注释。
     */
    async _loadAndLoop() {
        try {
            await this._loadAlbum()
            await this._loadTracks()
            await this._normalizeRecords()
            // 提前把下载目录建出来并验证可写。
            // 如果放到 _downloadOne 里才建，目录不可写会变成「每一集都失败一次」，
            // 几千集的专辑会把界面和日志刷爆。这里失败就整任务失败，只报一次。
            this._ensureTargetDir()
            await this._emitProgress(true)
            await this._loop()
        } catch (e) {
            if (e instanceof PausedError || this.paused || this.cancelled) {
                return
            }
            this.status = 'failed'
            log.error(`任务 ${this.albumId} 失败:`, e)
            this._emitLog('error', `任务失败：${e && e.message ? e.message : e}`)
            this._emitState()
        }
    }

    /**
     * 等待在途任务收敛，带超时兜底
     *
     * 不能只写 await Promise.allSettled(inFlight)：只要有一个请求既不 resolve
     * 也不 reject（DNS 卡死、socket 半开、代理挂起），pause() 就会永久挂起，
     * 状态停在 pausing，界面按钮永远是禁用的「暂停中…」，连 cancel() 也拉不出来
     * （cancel 等的是同一批 inFlight）。
     */
    async _settleInFlight() {
        const pending = [...this.inFlight]
        if (pending.length === 0) {
            return
        }
        await Promise.race([
            Promise.allSettled(pending),
            sleep(PAUSE_TIMEOUT_MS)
        ])
    }

    /**
     * 暂停
     *
     * 顺序很重要：先立 flag 再 abort，否则循环可能在 abort 的间隙又派发一批新章节。
     *
     * 关键约束：**这个方法必须在有限时间内返回，并且最终一定要落到 paused。**
     * 否则状态机会死锁 —— 界面永远停在「暂停中…」，而 resume() 又不处理 pausing，
     * 用户只能重启应用。所以这里用了「收敛超时」+「看门狗」两层兜底。
     */
    async pause() {
        if (this.status === 'pausing' || this.status === 'paused') {
            // 幂等：已经暂停或正在暂停，不重复走一遍。
            // 但仍然要补发一次当前状态 —— 前端是乐观更新（先把卡片置成 pausing
            // 再发 IPC），如果这里什么都不发，那个乐观状态就永远没人纠正。
            this._emitState()
            return
        }
        if (this.status !== 'running') {
            // 任务已结束/已取消，没有可暂停的东西。
            // 这里必须补一次状态广播：前端是先把卡片乐观置成 pausing 再发 IPC 的，
            // 如果不发事件，它就永远等不到结果，按钮卡在「暂停中…」。
            this._emitState()
            return
        }

        this.cancelled = false
        this.paused = true
        this.status = 'pausing'
        this._emitState()

        // 无论后面哪一步卡住或抛错，都要保证最终落到 paused
        let finished = false
        const markPaused = async (level, message) => {
            if (finished || this.cancelled) {
                return
            }
            finished = true
            this.status = 'paused'
            await this._emitProgress(true)
            this._emitState()
            if (message) {
                this._emitLog(level, message)
            }
        }
        const watchdog = setTimeout(() => {
            markPaused('warn', '暂停收尾超时，已强制标记为「已暂停」').catch(() => {
            })
        }, PAUSE_WATCHDOG_MS)

        try {
            for (const controller of this.controllers.values()) {
                controller.abort()
            }
            // 等所有在途请求真正收敛，否则会出现「界面已暂停但仍在写文件」
            await this._settleInFlight()
            this.controllers.clear()
            this.inFlight = []

            try {
                // 兜底：把可能残留的 downloading 状态改回 pending
                await trackDB.updateMulti(
                    {albumId: this.albumId, status: TRACK_STATUS.DOWNLOADING},
                    {status: TRACK_STATUS.PENDING}
                )
            } catch (e) {
                // 数据库回滚失败不该阻止暂停本身生效
                log.warn(`暂停时回滚章节状态失败（不影响暂停）: ${e && e.message ? e.message : e}`)
            }

            await markPaused('info', '已暂停。恢复后当前未完成的章节将重新下载（不影响已完成的章节）')
        } finally {
            clearTimeout(watchdog)
        }
    }

    /**
     * 恢复
     *
     * 不只是处理 paused：任务被 cancel 过、或者已经跑完一轮但还有失败章节时，
     * 界面上「继续下载」/「重试」也会走到这里。
     *
     * ⚠️ 关键：**绝不 await start() / _loadAndLoop()**。
     * 它们内部的 _loop() 会一直运行到下载结束或再次暂停。如果这里 await，
     * 那么 TaskManager.resume() → IPC task:resume 就会阻塞整个下载时长；
     * 而前端 store.js 是 `await api.task.resume(taskId)` 之后才写
     * `album.status = 'running'` —— 等它落地时后端可能已经被用户又暂停了，
     * 于是把正确的 paused 覆盖回 running，前后端状态就此错位：
     * 界面显示「暂停」但后端是 paused，再点暂停不产生任何事件，
     * 按钮永久卡在「暂停中…」。这个 bug 之前真实发生过。
     */
    async resume() {
        if (this.status === 'running') {
            return
        }
        if (this.status === 'pausing') {
            // 上一次暂停还没收尾（极端情况），先强制推进到 paused
            log.warn(`任务 ${this.albumId} 处于 pausing，恢复时先强制收尾`)
            this.paused = true
            this.status = 'paused'
            this._emitState()
        }
        this._emitLog('info', '继续下载')
        this.cancelled = false
        this.paused = false
        this.status = 'running'
        this._emitState()
        // 故意不 await：让它在后台自己跑到结束
        this._loadAndLoop().catch(e => {
            log.error(`任务 ${this.albumId} 恢复后异常:`, e)
        })
    }

    /**
     * 取消：中断全部并在途章节回滚为 pending，状态置 cancelled
     */
    async cancel() {
        this.cancelled = true
        this.paused = true
        for (const controller of this.controllers.values()) {
            controller.abort()
        }
        await this._settleInFlight()
        this.controllers.clear()
        this.inFlight = []

        await trackDB.updateMulti(
            {albumId: this.albumId, status: TRACK_STATUS.DOWNLOADING},
            {status: TRACK_STATUS.PENDING}
        )

        this.status = 'cancelled'
        this._emitState()
        this._emitLog('info', '任务已取消')
    }

    // ------------------------------------------------------------------
    // 专辑与章节列表
    // ------------------------------------------------------------------

    /**
     * 通道的中文名，只用于日志
     */
    _channelLabel(type) {
        if (type === 'web') {
            return '网页端'
        }
        if (type === 'pc') {
            return '电脑端'
        }
        return String(type == null ? '未知' : type)
    }

    /**
     * 获取专辑信息
     *
     * 按 this.typeCandidates 逐个尝试，第一个成功的通道会被锁定为 this.type。
     * 这是必要的容错：用户如果把「下载通道」选成「电脑端」，查章节列表时
     * 服务端会返回 ret -1（该接口按 device=android 请求，而电脑端带的是 mac 设备标识），
     * 此时应该自动换到网页端，而不是让整个任务失败。
     */
    async _loadAlbum() {
        this._emitLog('info', `正在获取专辑信息（albumId: ${this.albumId}）...`)
        if (this.typeCandidates.length === 0) {
            throw new Error('没有可用的下载通道，请先到「登录」页登录')
        }

        let lastError = null
        for (let i = 0; i < this.typeCandidates.length; i++) {
            const type = this.typeCandidates[i]
            try {
                // 用 acquire 而不是 getDownloader：后者在 downloaders 非空时
                // 不会为新的 type 重新登录，切换通道会失效
                const downloader = await this.factory.acquire(type)
                const resp = await downloader.getAlbum(this.albumId)

                this.type = type
                this.albumTitle = resp.albumTitle
                this.trackTotal = resp.trackCount

                const exist = await albumDB.findOne({albumId: this.albumId})
                if (exist == null) {
                    await albumDB.insert({
                        albumId: this.albumId,
                        albumTitle: resp.albumTitle,
                        isFinished: resp.isFinished,
                        trackCount: resp.trackCount,
                        // 记下这个专辑实际使用的下载根目录。
                        // 用户之后切换下载目录时，「打开文件夹」仍然要能找到老专辑的真实位置，
                        // 不能拿当时的设置去重新拼一个不存在的路径。
                        output: this.output
                    })
                } else {
                    await albumDB.update({albumId: this.albumId}, {
                        albumTitle: resp.albumTitle,
                        isFinished: resp.isFinished,
                        trackCount: resp.trackCount,
                        output: this.output
                    })
                }

                this._emitLog('info', `专辑《${resp.albumTitle}》共 ${resp.trackCount} 集`)
                this._emitState()
                return
            } catch (e) {
                lastError = e
                const message = e && e.message ? e.message : String(e)
                const next = this.typeCandidates[i + 1]
                if (next != null) {
                    this._emitLog('warn',
                        `通道「${this._channelLabel(type)}」获取专辑信息失败（${message}），自动改用「${this._channelLabel(next)}」`)
                } else {
                    this._emitLog('error', `通道「${this._channelLabel(type)}」获取专辑信息失败：${message}`)
                }
            }
        }
        throw lastError || new Error('所有已登录通道都无法获取专辑信息')
    }

    async _loadTracks() {
        const existing = await trackDB.count({albumId: this.albumId})
        if (existing > 0 && this.trackTotal > 0 && existing >= this.trackTotal) {
            return
        }

        const downloader = await this.factory.acquire(this.type)

        this._emitLog('info', '正在获取章节列表...')
        let pageNum = 1
        let totalPages = 1
        let num = 0

        while (pageNum <= totalPages) {
            const book = await downloader.getTracksList(this.albumId, pageNum, PAGE_SIZE)
            let totalCount = book.trackTotalCount
            if (totalCount == null || totalCount === 0) {
                totalCount = this.trackTotal
            }
            totalPages = Math.floor(totalCount / PAGE_SIZE) + 1

            for (const item of book.tracks) {
                num++
                const found = await trackDB.findOne({trackId: item.trackId})
                if (found == null) {
                    await trackDB.insert({
                        trackId: item.trackId,
                        title: item.title,
                        albumId: this.albumId,
                        num: num,
                        path: null,
                        status: TRACK_STATUS.PENDING,
                        error: null,
                        updatedAt: Date.now()
                    })
                }
            }
            this._emitLog('info', `章节列表获取中 ${num}/${totalCount}`)
            pageNum++
        }
        this._emitLog('info', '章节列表获取完成')
    }

    /**
     * 修正历史数据
     *
     * 两件事：
     *  1. CLI 时代写入的记录没有 status 字段，补齐它
     *  2. 标记为已完成但文件实际已不存在的记录，退回 pending 重新下载
     */
    async _normalizeRecords() {
        // 上一次运行崩溃/被杀会留下卡在 downloading 的记录。
        // 任务刚开始时不可能真的有 worker 在跑，所以这里全部复位成 pending。
        // worker 模型只领 pending 的活，这一步是它正确性的前提。
        await trackDB.updateMulti(
            {albumId: this.albumId, status: TRACK_STATUS.DOWNLOADING},
            {status: TRACK_STATUS.PENDING}
        )

        await trackDB.updateMulti(
            {albumId: this.albumId, path: null, status: {$exists: false}},
            {status: TRACK_STATUS.PENDING}
        )
        await trackDB.updateMulti(
            {albumId: this.albumId, path: {$ne: null}, status: {$exists: false}},
            {status: TRACK_STATUS.DONE}
        )

        const doneList = await trackDB.find({albumId: this.albumId, status: TRACK_STATUS.DONE})
        for (const track of doneList) {
            if (track.path == null || !fs.existsSync(track.path)) {
                await trackDB.update({trackId: track.trackId}, {
                    status: TRACK_STATUS.PENDING,
                    path: null,
                    error: null
                })
            }
        }
    }

    // ------------------------------------------------------------------
    // 下载主循环
    // ------------------------------------------------------------------

    /**
     * 下载主循环
     *
     * 用「固定数量的 worker 各自领活」而不是「取一批 → 等整批完成 → 再取一批」。
     *
     * 老写法有三个真实的吞吐损失。实测单连接上限约 2.3 MB/s（见 speed-bench2.mjs），
     * 并发是唯一的加速手段，所以任何并发位空转都直接等于掉速：
     *   1. **批量屏障**：`await Promise.allSettled(jobs)` 要等整批结束才取下一批，
     *      批次末尾只剩一两集在跑时，其余并发位全部空转
     *   2. **重试退避占着名额**：某一集失败后在 `sleep(800 * attempt)` 里等待，
     *      pLimit 不会因为「在 sleep」就释放名额，整批也跟着一起等
     *   3. **一集慢就拖住整批**（CDN 抖动、单集特别大）
     *
     * worker 模型下，任何一集结束立刻领下一集，并发数始终是满的。
     */
    async _loop() {
        const workers = this.slow ? 1 : Math.max(1, this.concurrency)

        // inFlight 直接放 worker 的 promise：暂停/取消时 _settleInFlight 等的就是它们。
        // 每个 worker 在自己那一集返回后会检查 paused/cancelled 并退出，
        // 所以 pause() 里的「等收敛 → 再把 downloading 回滚成 pending」顺序依然成立。
        const pool = Array.from({length: workers}, () => this._worker())
        this.inFlight = pool
        await Promise.allSettled(pool)
        this.inFlight = []

        if (this.cancelled || this.paused) {
            return
        }

        // worker 全部自然退出 = 没有待下载的章节了。
        // 再确认一次，避免最后一个 worker 领走活之后其余 worker 已退出的竞态。
        const remain = await trackDB.count({
            albumId: this.albumId,
            status: TRACK_STATUS.PENDING
        })
        if (remain > 0) {
            return
        }
        await this._finish()
    }

    /**
     * 单个下载 worker：反复领下一集，直到没有 pending 的
     */
    async _worker() {
        while (!this.cancelled && !this.paused) {
            const [track] = await trackDB.find(
                {albumId: this.albumId, status: TRACK_STATUS.PENDING},
                {num: 1},
                1
            )
            if (track == null) {
                return
            }

            // 条件更新抢占：只有「仍然是 pending」才算抢到。
            // 多个 worker 同时 find 到同一条时，nedb 内部把操作串行执行，
            // 第一个成功的 numReplaced=1，其余为 0，于是自动去领下一条。
            const claimed = await trackDB.updateMulti(
                {trackId: track.trackId, status: TRACK_STATUS.PENDING},
                {status: TRACK_STATUS.DOWNLOADING}
            )
            if (claimed === 0) {
                continue
            }

            await this._runWithRetry(track)

            // 慢速模式：每集之间随机等待，刻意压低请求频率避免风控
            if (this.slow && !this.cancelled && !this.paused) {
                await sleep(500 + Math.floor(Math.random() * 4500))
            }
        }
    }

    async _finish() {
        await this._emitProgress(true)
        this.status = 'done'
        this._emitState()
        if (this.failed > 0) {
            this._emitLog('warn', `任务结束：成功 ${this.done} 集，失败 ${this.failed} 集`)
        } else {
            this._emitLog('info', `全部完成，共 ${this.done} 集`)
        }
    }

    /**
     * 单集下载 + 失败重试
     */
    async _runWithRetry(track) {
        if (this.paused || this.cancelled) {
            return
        }
        for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
            try {
                const filePath = await this._downloadOne(track)
                await trackDB.update({trackId: track.trackId}, {
                    status: TRACK_STATUS.DONE,
                    path: filePath,
                    error: null,
                    updatedAt: Date.now()
                })
                this.emit('track', this._trackEvent(track, {
                    status: TRACK_STATUS.DONE,
                    path: filePath,
                    error: null
                }))
                await this._emitProgress()
                return
            } catch (e) {
                // 暂停/取消不算失败，不重试也不计数
                if (e instanceof PausedError || this.paused || this.cancelled) {
                    return
                }
                const message = String(e && e.message ? e.message : e)
                // noRetry：确定性的错误（例如目录没有写权限），重试只是浪费时间
                if (attempt >= MAX_RETRY || (e != null && e.noRetry === true)) {
                    await trackDB.update({trackId: track.trackId}, {
                        status: TRACK_STATUS.FAILED,
                        error: message,
                        updatedAt: Date.now()
                    })
                    this.emit('track', this._trackEvent(track, {
                        status: TRACK_STATUS.FAILED,
                        error: message
                    }))
                    this._emitLog('error', `第 ${track.num} 集《${track.title}》失败：${message}`)
                    await this._emitProgress()
                    return
                }
                this._emitLog('warn', `第 ${track.num} 集第 ${attempt} 次失败，即将重试：${message}`)
                await sleep(800 * attempt)
            }
        }
    }

    /**
     * 下载单集
     * @returns {Promise<string>} 最终文件绝对路径
     */
    async _downloadOne(track) {
        if (this.paused || this.cancelled) {
            throw new PausedError()
        }

        const targetDir = this._ensureTargetDir()
        const controller = new AbortController()
        this.controllers.set(track.trackId, controller)

        let partPath = null
        let finalPath = null

        try {
            await trackDB.update({trackId: track.trackId}, {
                status: TRACK_STATUS.DOWNLOADING,
                error: null
            })
            this.emit('track', this._trackEvent(track, {
                status: TRACK_STATUS.DOWNLOADING,
                received: 0,
                total: 0
            }))

            // 用 acquire 而不是 getDownloader：
            // 后者会把回调里抛出的任何异常都当成「通道被限流」并永久置 isLimit，
            // 于是用户按一次暂停（streamAudio 抛 abort）就能把整个通道锁死，
            // 之后所有任务只会得到「所有下载方式都受限了」。
            const downloader = await this.factory.acquire(this.type)

            // 播放地址带签名且会过期，每次都必须重新取
            const playInfo = await downloader.getPlayUrl(track.trackId)
            const baseName = buildTrackBaseName(track.num, track.title)
            // 临时文件名也要按整条路径长度裁剪（预留 .part 的长度）
            partPath = path.join(targetDir, `${fitFileName(baseName, targetDir, '.part')}.part`)

            await downloader.streamAudio(playInfo.url, {
                signal: controller.signal,
                partPath: partPath,
                onStart: ({extension, total}) => {
                    const ext = extension || '.m4a'
                    finalPath = path.join(targetDir, `${fitFileName(baseName, targetDir, ext)}${ext}`)
                    this.emit('track', this._trackEvent(track, {
                        status: TRACK_STATUS.DOWNLOADING,
                        received: 0,
                        total: total
                    }))
                },
                onProgress: ({received, total}) => {
                    this.emit('track', this._trackEvent(track, {
                        status: TRACK_STATUS.DOWNLOADING,
                        received: received,
                        total: total
                    }))
                }
            })

            if (finalPath == null) {
                throw new Error('未能从响应头解析出文件类型')
            }
            // 先写 .part 再改名：进程崩溃时磁盘上不会留下被误判为「已完成」的半截文件。
            // 优先直接 rename（原子覆盖）；个别平台/文件系统不允许覆盖时才先删目标，
            // 这样能避免「先删后改名」中间崩溃把已存在的成品文件弄丢。
            try {
                fs.renameSync(partPath, finalPath)
            } catch (renameError) {
                if (!fs.existsSync(finalPath)) {
                    throw renameError
                }
                fs.unlinkSync(finalPath)
                fs.renameSync(partPath, finalPath)
            }

            return finalPath
        } catch (e) {
            // 简化版不做续传，半截文件直接删掉
            if (partPath != null) {
                try {
                    if (fs.existsSync(partPath)) {
                        fs.unlinkSync(partPath)
                    }
                } catch (unlinkError) {
                    log.warn(`清理临时文件失败: ${partPath}`, unlinkError)
                }
            }
            if (isAbortError(e) || controller.signal.aborted) {
                await trackDB.update({trackId: track.trackId}, {
                    status: TRACK_STATUS.PENDING,
                    error: null
                })
                this.emit('track', this._trackEvent(track, {
                    status: TRACK_STATUS.PENDING,
                    received: 0,
                    total: 0,
                    error: null
                }))
                throw new PausedError()
            }
            throw e
        } finally {
            this.controllers.delete(track.trackId)
        }
    }

    _ensureTargetDir() {
        const dir = this.targetDir()
        try {
            mkdirpSync(dir)
        } catch (e) {
            const code = e != null ? e.code : null
            const denied = code === 'EPERM' || code === 'EACCES' || code === 'EROFS' || code === 'ENOTDIR'
            const error = new Error(
                `无法创建下载目录「${dir}」：${e && e.message ? e.message : e}`
                + (denied
                    ? '。当前进程对该位置没有写入权限，请到「下载设置」把下载目录改成有权限的位置。'
                    : '')
            )
            // 权限类错误是确定性的，重试没有意义
            error.noRetry = denied
            error.path = dir
            throw error
        }
        return dir
    }
}

export {
    DownloadTask,
    TRACK_STATUS
}
