import {EventEmitter} from 'node:events'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
import {DownloaderFactory} from '../handler/downloader.js'
import {DownloadTask, TRACK_STATUS} from './downloadTask.js'
import {getSettings} from './settingsStore.js'
import {typeCandidates} from './authService.js'
import {trackDB} from '../db/trackdb.js'
import {albumDB} from '../db/albumdb.js'
import {log} from '../common/log4jscf.js'
import {cleanedStr, fitDirName} from '../common/filename.js'
import {expandHome} from './paths.js'

/**
 * 下载任务管理器（全局单例）
 *
 * 两个关键点：
 *  1. DownloaderFactory 全局只建一个。它内部持有 isLimit 状态和已登录的
 *     downloader 实例，每个任务各建一个会导致反复扫码登录、风控计数各自独立。
 *  2. 章节进度事件按 300ms 合并成数组再推给渲染进程。
 *     10 个并发下载如果每个 chunk 都发一次 IPC，渲染进程每秒要处理上千次
 *     跨进程序列化，界面必然卡死。
 */

// 章节事件合并间隔
const BATCH_INTERVAL_MS = 300

// 已结束的任务状态
const TERMINAL_STATUS = ['done', 'failed', 'cancelled']

class TaskManager extends EventEmitter {

    constructor() {
        super()
        // taskId -> DownloadTask
        this.tasks = new Map()
        this._factory = null
        this._win = null
        this._buffer = new Map()
        this._flushTimer = null
    }

    /**
     * 全局唯一的下载器工厂
     */
    factory() {
        if (this._factory == null) {
            this._factory = DownloaderFactory.create()
        }
        return this._factory
    }

    /**
     * 绑定主窗口，之后所有事件都会推给它
     * @param win BrowserWindow
     */
    bind(win) {
        this._win = win
    }

    // ------------------------------------------------------------------
    // 事件推送
    // ------------------------------------------------------------------

    _send(channel, payload) {
        if (this._win == null || this._win.isDestroyed()) {
            return
        }
        this._win.webContents.send(channel, payload)
    }

    /**
     * 章节进度按 trackId 去重合并，定时批量推送
     */
    _queueTrack(payload) {
        this._buffer.set(payload.trackId, payload)
        if (this._flushTimer != null) {
            return
        }
        this._flushTimer = setTimeout(() => {
            this._flushTimer = null
            const batch = [...this._buffer.values()]
            this._buffer.clear()
            this._send('evt:track', batch)
        }, BATCH_INTERVAL_MS)
    }

    _attach(task) {
        task.on('state', state => this._send('evt:state', state))
        task.on('progress', progress => this._send('evt:progress', progress))
        task.on('track', payload => this._queueTrack(payload))
        task.on('log', payload => {
            // 任务日志同时落盘。
            // 这些信息原来只推给界面，不写日志文件 —— 结果是「暂停之后没反应」这类
            // 交互问题在 app.log 里完全看不到，只能靠用户口述现象。
            const line = `[${task.albumId}] ${payload.message}`
            if (payload.level === 'error') {
                log.error(line)
            } else if (payload.level === 'warn') {
                log.warn(line)
            } else {
                log.info(line)
            }
            this._send('evt:log', {
                taskId: task.taskId,
                albumId: task.albumId,
                at: Date.now(),
                level: payload.level,
                message: payload.message
            })
        })
    }

    // ------------------------------------------------------------------
    // 查询
    // ------------------------------------------------------------------

    /**
     * 找该专辑当前的活动任务；没有活动任务时返回最近一个已结束的任务
     * @param albumId
     * @returns {DownloadTask|null}
     */
    _findLive(albumId) {
        const id = String(albumId)
        let matched = null
        for (const task of this.tasks.values()) {
            if (task.albumId !== id) {
                continue
            }
            matched = task
            if (!TERMINAL_STATUS.includes(task.status)) {
                return task
            }
        }
        return matched
    }

    _requireTask(taskId) {
        const task = this.tasks.get(String(taskId))
        if (task == null) {
            throw new Error('任务不存在或已结束，该专辑当前没有活动的下载任务')
        }
        return task
    }

    /**
     * 该专辑的落盘目录
     *
     * ⚠️ 关键：**绝不能只用「当前的下载目录设置」去拼路径。**
     * 用户随时可以切换下载目录，那样会让所有老专辑的「打开文件夹」指向一个
     * 根本不存在的位置 —— 实测过：同一个专辑先能正确定位，换了下载目录之后
     * 就报「目录还不存在，可能还没有开始下载」。
     *
     * 取值优先级：
     *   1) 专辑记录里存的 output —— 本次改动之后新建/更新过的任务都会有
     *   2) 从任意一条已下载章节的 path 反推 —— 老记录没有 output，
     *      但 trackDB 里存了完整文件路径，dirname 就是专辑目录
     *   3) 当前设置 —— 兜底
     *
     * @param album
     * @returns {Promise<string>}
     */
    async _historyOutput(album) {
        if (album != null && album.output != null && String(album.output).trim() !== '') {
            return this._targetDirUnder(album, expandHome(String(album.output)))
        }

        // 老记录：从已下载章节的文件路径反推专辑目录
        try {
            const done = await trackDB.findOne({albumId: album.albumId, status: TRACK_STATUS.DONE})
            if (done != null && done.path != null && String(done.path) !== '') {
                return path.dirname(String(done.path))
            }
        } catch (e) {
            log.warn(`[${album.albumId}] 反推下载目录失败: ${e && e.message ? e.message : e}`)
        }

        return this._targetDirUnder(album, expandHome(getSettings().output || ''))
    }

    /**
     * 按 DownloadTask.targetDir() 完全相同的规则拼路径
     *
     * 两条路径的裁剪规则必须一致，否则超长专辑名会算出不同的目录。
     */
    _targetDirUnder(album, root) {
        const name = fitDirName(cleanedStr(album.albumTitle || album.albumId), root)
        return path.join(root, name)
    }

    _toTrackView(track) {
        let status = track.status
        if (status == null) {
            status = track.path != null ? TRACK_STATUS.DONE : TRACK_STATUS.PENDING
        }
        return {
            trackId: track.trackId,
            num: track.num,
            title: track.title,
            status: status,
            path: track.path != null ? track.path : null,
            error: track.error != null ? track.error : null
        }
    }

    /**
     * 所有专辑（数据库里的历史记录 + 本次会话的活动任务合并）
     * @returns {Promise<Array>}
     */
    async list() {
        const albums = await albumDB.find({}, {albumId: -1})
        const result = []

        for (const album of albums) {
            const live = this._findLive(album.albumId)
            const [total, done, failed] = await Promise.all([
                trackDB.count({albumId: album.albumId}),
                trackDB.count({albumId: album.albumId, status: TRACK_STATUS.DONE}),
                trackDB.count({albumId: album.albumId, status: TRACK_STATUS.FAILED})
            ])

            if (live != null) {
                result.push({
                    ...live.snapshot(),
                    total: total,
                    done: done,
                    failed: failed
                })
            } else {
                result.push({
                    // 没有活动任务时用 album: 前缀，前端据此知道要新建任务才能继续
                    taskId: `album:${album.albumId}`,
                    albumId: album.albumId,
                    albumTitle: album.albumTitle != null ? album.albumTitle : null,
                    status: total > 0 && done === total ? 'done' : 'idle',
                    total: total,
                    done: done,
                    failed: failed,
                    output: await this._historyOutput(album),
                    concurrency: 0,
                    slow: false,
                    type: null
                })
            }
        }

        // 刚创建、专辑信息还没来得及写入 albumDB 的任务
        for (const task of this.tasks.values()) {
            if (!result.some(item => item.albumId === task.albumId)) {
                result.push(task.snapshot())
            }
        }
        return result
    }

    /**
     * 章节分页查询
     * @param albumId
     * @param page 从 1 开始
     * @param pageSize
     * @param filter 'all' | 'pending' | 'failed'
     */
    async tracks(albumId, options) {
        // IPC 传 null 时默认参数不会生效，解构 null 会抛 TypeError
        const {page = 1, pageSize = 200, filter = 'all'} = options == null ? {} : options
        const id = String(albumId == null ? '' : albumId).trim()
        if (id === '') {
            throw new Error('albumId 不能为空')
        }

        const query = {albumId: id}
        if (filter === 'failed') {
            query.status = TRACK_STATUS.FAILED
        } else if (filter === 'pending') {
            query.status = {$in: [TRACK_STATUS.PENDING, TRACK_STATUS.DOWNLOADING]}
        }

        const total = await trackDB.count(query)
        const all = await trackDB.find(query, {num: 1})

        const size = Math.max(1, Number(pageSize) || 200)
        const current = Math.max(1, Number(page) || 1)
        const start = (current - 1) * size

        return {
            total: total,
            page: current,
            pageSize: size,
            rows: all.slice(start, start + size).map(track => this._toTrackView(track))
        }
    }

    /**
     * 专辑的落盘目录
     * @param albumId
     * @returns {Promise<string>}
     */
    async targetDirOf(albumId) {
        const id = String(albumId == null ? '' : albumId).trim()
        if (id === '') {
            throw new Error('albumId 不能为空')
        }
        const live = this._findLive(id)
        if (live != null) {
            return live.targetDir()
        }
        const album = await albumDB.findOne({albumId: id})
        if (album == null) {
            throw new Error('找不到该专辑的记录')
        }
        return await this._historyOutput(album)
    }

    // ------------------------------------------------------------------
    // 操作
    // ------------------------------------------------------------------

    /**
     * 新建下载任务
     *
     * 不 await 下载过程：立刻返回快照，后续进度靠事件推送。
     * @returns {Promise<object>} AlbumView
     */
    async create(options) {
        const {albumId, output, concurrency, slow} = options == null ? {} : options
        const id = String(albumId == null ? '' : albumId).trim()
        if (id === '') {
            throw new Error('请输入专辑 ID')
        }

        const live = this._findLive(id)
        // 用「正在活动」的正向判断，而不是「不在终态列表里」的反向判断：
        // resume() 会把状态短暂置为 idle，反向判断会在这段窗口里误报「已有正在进行的任务」
        if (live != null && ['running', 'pausing', 'paused'].includes(live.status)) {
            throw new Error('该专辑已有正在进行的任务')
        }

        const settings = getSettings()
        // 传一串候选通道而不是单个：用户如果把通道选成在这个接口上不可用的
        // 「电脑端」，DownloadTask 会自动换到下一个已登录通道重试
        const candidates = await typeCandidates()

        // 清掉该专辑已结束的旧任务，避免后续查询命中过期状态
        for (const [key, task] of [...this.tasks.entries()]) {
            if (task.albumId === id && TERMINAL_STATUS.includes(task.status)) {
                this.tasks.delete(key)
            }
        }

        const task = new DownloadTask({
            taskId: randomUUID(),
            albumId: id,
            output: output != null ? output : settings.output,
            concurrency: concurrency != null ? concurrency : settings.concurrency,
            slow: slow != null ? !!slow : settings.slow,
            type: candidates[0],
            typeCandidates: candidates,
            factory: this.factory()
        })
        this._attach(task)
        this.tasks.set(task.taskId, task)

        task.start().catch(e => {
            // start() 内部已经处理了异常并广播状态，这里只兜底记日志
            log.error(`任务 ${id} 启动异常:`, e)
        })

        return task.snapshot()
    }

    async pause(taskId) {
        const task = this._requireTask(taskId)
        await task.pause()
        return {ok: true}
    }

    async resume(taskId) {
        const task = this._requireTask(taskId)
        await task.resume()
        return {ok: true}
    }

    async cancel(taskId) {
        const task = this._requireTask(taskId)
        await task.cancel()
        return {ok: true}
    }

    /**
     * 重试该专辑所有失败的章节
     *
     * 没有活动任务时会顺手新建一个，所以历史专辑也能直接点「重试」。
     */
    async retry(albumId) {
        const id = String(albumId == null ? '' : albumId).trim()
        if (id === '') {
            throw new Error('albumId 不能为空')
        }

        const live = this._findLive(id)
        if (live == null || !['running', 'pausing', 'paused'].includes(live.status)) {
            // 先确认登录态可用，再重置失败章节。
            // 否则未登录时 typeCandidates() 抛错，失败章节已经被刷成 pending，
            // 却没有任何任务会去下载它们，界面上表现为失败计数凭空归零。
            await typeCandidates()
        }

        const reset = await trackDB.updateMulti(
            {albumId: id, status: TRACK_STATUS.FAILED},
            {status: TRACK_STATUS.PENDING, error: null}
        )

        if (live != null && ['running', 'pausing'].includes(live.status)) {
            return {ok: true, reset: reset, taskId: live.taskId}
        }
        if (live != null && live.status === 'paused') {
            await live.resume()
            return {ok: true, reset: reset, taskId: live.taskId}
        }

        const created = await this.create({albumId: id})
        return {ok: true, reset: reset, taskId: created.taskId}
    }

    /**
     * 从下载列表移除专辑
     *
     * 无论 deleteRecords 取值如何，都会删掉 albumDB 里的专辑记录，
     * 否则下一次 list() 会把它从历史记录里又读回来，界面表现为「删不掉」。
     *
     * @param albumId
     * @param deleteRecords 是否连同章节记录一起删除。false 时保留章节记录，
     *        这样重新添加同一专辑时已下载的文件不会被重复下载。
     */
    async remove(albumId, deleteRecords = false) {
        const id = String(albumId == null ? '' : albumId).trim()
        if (id === '') {
            throw new Error('albumId 不能为空')
        }

        const live = this._findLive(id)
        if (live != null) {
            await live.cancel()
            this.tasks.delete(live.taskId)
        }

        await albumDB.remove({albumId: id})
        if (deleteRecords) {
            await trackDB.remove({albumId: id})
        }
        return {ok: true}
    }
}

// 全局单例
const taskManager = new TaskManager()

export {
    TaskManager,
    taskManager
}
