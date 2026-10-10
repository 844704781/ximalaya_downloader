/**
 * 修复 exe 的完整性标签（postinstall / dist 之后都要跑）
 *
 * ── 背景 ────────────────────────────────────────────────────────────────
 * 本机的工作区目录 D:\test\ximalaya_downloader 带一个低完整性标签：
 *
 *     Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)
 *
 * 其中 (OI)(CI) 表示「容器继承 + 对象继承」—— 在这个目录里**新建**的
 * 所有文件和子目录都会自动继承这个 Low 标签。
 *
 * 而 **Windows 用镜像文件（exe）本身的完整性标签来决定进程的完整性级别**。
 * 于是只要 exe 是在这个目录里生成/解压出来的，它跑起来就是低完整性进程，
 * 而 Windows 的强制完整性控制只允许向下写 —— 低完整性进程写得了带 Low 标签的
 * 目录（也就是工作区），写任何默认的 Medium 目录都会报 EPERM。
 *
 * 这解释了「只有项目目录能下载」以及为什么下面这些绕路全都无效：
 *   - node.exe 在 E:\tools 下、没有 Low 标签，所以一直不受限
 *   - 目录联接没用（写入穿透到目标，受的是目标的标签约束）
 *   - 应用内 icacls 没用（低完整性改不了 Medium 对象）
 *   - UAC 提权没用（低完整性进程的提权请求会被拒）
 *   - 委托 node 子进程没用（子进程继承父进程的低完整性令牌）
 *
 * ── 需要处理的 exe ──────────────────────────────────────────────────────
 *   1. node_modules/electron/dist/ 下的 exe  —— npm install 解压出来的 Electron 运行时
 *   2. release/win-unpacked/ 下的所有 exe    —— 打包出来的应用主体（含 resources 子目录）
 *   3. release/ 下的 exe                     —— 安装程序本身
 *
 * 第 2、3 项很容易被忽略：它们同样是在工作区里生成的，同样会继承 Low。
 * 不修的话，装完之后的应用会有完全一样的问题，安装程序自己也可能装不进
 * Program Files。
 *
 * 必须**递归**扫描：release/win-unpacked/resources/elevate.exe 是 electron-builder
 * 用来请求提权的辅助程序，它藏在子目录里，只扫顶层会漏掉它。
 *
 * 挂在 postinstall 上（覆盖第 1 项），也在 dist 之后跑（覆盖第 2、3 项）。
 * 永远以退出码 0 结束，不会因为修不了而让安装/打包失败。
 *
 * ── 如果 npm 禁用了脚本（--ignore-scripts）────────────────────────────────
 * 手动执行一次即可：
 *     node scripts/fix-electron-integrity.cjs
 */

const fs = require('node:fs')
const path = require('node:path')
const {execFileSync} = require('node:child_process')

const TAG = '[fix-electron-integrity]'
const repoRoot = path.resolve(__dirname, '..')

/** 读取某个路径的完整性标签行；读不到返回 null */
function labelOf(target) {
    try {
        const out = execFileSync('icacls.exe', [target], {encoding: 'utf8', windowsHide: true})
        const line = String(out).split(/\r?\n/).find(l => /Mandatory Label/i.test(l))
        return line ? line.trim() : '(无标签)'
    } catch (e) {
        return null
    }
}

/** 把单个文件的标签改回 Medium；返回 'fixed' | 'skip' | 'fail' */
function fixOne(file) {
    const before = labelOf(file)
    if (before == null) {
        console.log(`${TAG} 跳过（读取标签失败）: ${path.relative(repoRoot, file)}`)
        return 'fail'
    }
    if (!/Low Mandatory/i.test(before)) {
        return 'skip'
    }
    try {
        execFileSync('icacls.exe', [file, '/setintegritylevel', 'Medium'], {
            encoding: 'utf8',
            windowsHide: true
        })
        const after = labelOf(file)
        console.log(`${TAG} 已修复: ${path.relative(repoRoot, file)}`)
        console.log(`${TAG}   ${before}  ->  ${after}`)
        return 'fixed'
    } catch (e) {
        console.warn(`${TAG} 修复失败: ${path.relative(repoRoot, file)}`)
        console.warn(`${TAG}   ${e && e.message ? e.message : e}`)
        console.warn(`${TAG}   可手动执行: icacls "${file}" /setintegritylevel Medium`)
        return 'fail'
    }
}

/**
 * 递归找出目录下所有 .exe
 *
 * 必须递归：`release/win-unpacked/resources/elevate.exe` 是 electron-builder 用来
 * 请求提权的辅助程序，它也在工作区里生成、同样会继承 Low 标签。
 * 只扫顶层的话会漏掉它。
 */
function exeIn(dir) {
    const found = []
    const walk = d => {
        let entries
        try {
            entries = fs.readdirSync(d, {withFileTypes: true})
        } catch (e) {
            return
        }
        for (const entry of entries) {
            const full = path.join(d, entry.name)
            if (entry.isDirectory()) {
                walk(full)
            } else if (entry.name.toLowerCase().endsWith('.exe')) {
                found.push(full)
            }
        }
    }
    if (fs.existsSync(dir)) {
        walk(dir)
    }
    return found
}

function main() {
    // 只有 Windows 才有完整性级别这回事
    if (process.platform !== 'win32') {
        return
    }

    const candidates = [
        ...exeIn(path.join(repoRoot, 'node_modules', 'electron', 'dist')),
        ...exeIn(path.join(repoRoot, 'release', 'win-unpacked')),
        ...exeIn(path.join(repoRoot, 'release'))
    ]

    // 去重（release 和 release/win-unpacked 会重叠）
    const unique = [...new Set(candidates)]

    if (unique.length === 0) {
        console.log(`${TAG} 没找到需要处理的 exe（可能还没装依赖，也还没打包）`)
        return
    }

    let fixed = 0
    let failed = 0
    for (const file of unique) {
        const r = fixOne(file)
        if (r === 'fixed') {
            fixed++
        } else if (r === 'fail') {
            failed++
        }
    }

    if (fixed === 0 && failed === 0) {
        console.log(`${TAG} ${unique.length} 个 exe 的标签都正常，无需修改`)
    } else {
        console.log(`${TAG} 共 ${unique.length} 个 exe：修复 ${fixed} 个，失败 ${failed} 个`)
    }
}

try {
    main()
} catch (e) {
    console.warn(`${TAG} 意外错误（已忽略）: ${e && e.message ? e.message : e}`)
}
// 永远成功退出，绝不让 npm install / npm run dist 失败
process.exit(0)
