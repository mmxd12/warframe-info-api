const path = require('path')
const fs = require('fs')
const lzma = require('lzma')
const { getBuffer, getText } = require('../../utils/superagent')
const logger = require('../../utils/logger')(__filename)

// DE 官方 PublicExport「自生成」中文词库（NyxBot 的「跑一下数据库」同思路，但直接取自源头）。
// - index_<lang>.txt.lzma 列出带内容哈希的清单文件名（英文 + 中文各一套，按 uniqueName 对应）；
// - 逐个拉取 Manifest 下的导出 JSON，用 uniqueName 把 en.name ↔ zh.name 配对，得到 en→zh 词典；
// - 跟随 DE 客户端更新，和游戏一样新，不依赖任何社区 push；content.warframe.com 无需代理。
// 注意：DE 官方已移除 ExportRewards（赏金奖励表），那块仍由 KingPrimes/DataSource 提供，见 bountyRewards。
const BASE = 'https://content.warframe.com/PublicExport/'
const MANIFEST = BASE + 'Manifest/'
// 参与翻译词库的导出（名称有意义的类别）；每个文件里可能含多个数组（如 Weapons + RailjackWeapons）
// Regions 提供星球名（systemName，如 Mercury→水星），节点名 DE 官方就是英文、无中文可取。
// Recipes 不列入：蓝图名全部继承成品名，实测贡献 0 条，白搭两次请求 + 十几秒。
const EXPORTS = ['Weapons', 'Warframes', 'Upgrades', 'Resources', 'Sentinels', 'Gear', 'RelicArcane', 'Customs', 'Keys', 'Drones', 'Regions']

// TTL 必须小于 initLibsCache 的 2h 调度间隔，否则重跑时 TTL 还没过、直接命中缓存，
// 等于两个周期才真刷一次。取 100 分钟：每次 2h 调度都会重建，DE 出新中文名最迟 2h 跟上。
// 代价是每轮要拉 11 个 LZMA 导出、约 1 分钟，服务器常驻可接受。
const TTL = 100 * 60 * 1000
const SNAPSHOT = path.join(__dirname, 'de_dict_snapshot.json') // 本地快照：重启秒起 / 拉取失败兜底

let cache = { list: null, ts: 0 }
let inflight = null

const decompress = buf => new Promise((resolve, reject) => {
    lzma.decompress(new Uint8Array(buf), (result, err) => {
        if (err) return reject(err)
        resolve(typeof result === 'string' ? result : Buffer.from(result).toString('utf8'))
    })
})

// index_<lang>.txt.lzma -> { Weapons: 'ExportWeapons_en.json!00_hash', ... }
const loadIndex = async lang => {
    const txt = await decompress(await getBuffer(`${BASE}index_${lang}.txt.lzma`))
    const map = {}
    txt.split(/\r?\n/).filter(Boolean).forEach(line => {
        const name = line.split(`_${lang}.json!`)[0].replace('Export', '')
        map[name] = line
    })
    return map
}

// DE 导出 JSON 内含裸控制符，会让 JSON.parse 失败，先清洗再解析
const loadManifest = async entry => {
    const raw = await getText(MANIFEST + entry)
    return JSON.parse(raw.replace(/[\u0000-\u001f]/g, ''))
}

// 取出对象里所有「数组值」并摊平（兼容一个文件多张表的情况）
const rawItems = obj => Object.values(obj).filter(Array.isArray).flat()

// 字段做一次归一：技能表用的是 abilityUniqueName / abilityName
const allItems = obj => rawItems(obj)
    .map(i => ({ uniqueName: i.uniqueName || i.abilityUniqueName, name: i.name || i.abilityName }))
    .filter(i => i.uniqueName && i.name)

// 导出名带 <ARCHWING> / <RETRO_TM> 之类的标签前缀，去掉才能和游戏内/用户输入的名字对上
const clean = s => s.replace(/<[^>]*>/g, '').trim()

const build = async () => {
    const [enIdx, zhIdx] = await Promise.all([loadIndex('en'), loadIndex('zh')])
    const dict = new Map() // en -> zh
    const failed = [] // 汇总失败/缺失的导出，构建完统一告警，避免覆盖率悄悄缩水
    for (const name of EXPORTS) {
        if (!enIdx[name] || !zhIdx[name]) {
            failed.push(`${name}(清单缺失)`)
            continue
        }
        try {
            const [en, zh] = await Promise.all([loadManifest(enIdx[name]), loadManifest(zhIdx[name])])
            const zmap = new Map(allItems(zh).map(i => [i.uniqueName, i.name]))
            let before = dict.size
            for (const i of allItems(en)) {
                const e = clean(i.name)
                const c = clean(zmap.get(i.uniqueName) || '')
                if (e && c && c !== e && !dict.has(e)) dict.set(e, c)
            }
            // Regions 的星球名在 systemName 上（269 个节点重复出现同一星球），
            // 不走 uniqueName 配对，按 systemIndex 去重单独收一遍：Mercury→水星。
            if (name === 'Regions') {
                const zn = new Map(rawItems(zh).map(i => [i.uniqueName, i]))
                for (const i of rawItems(en)) {
                    const e = clean(i.systemName || '')
                    const c = clean((zn.get(i.uniqueName) || {}).systemName || '')
                    if (e && c && c !== e && !dict.has(e)) dict.set(e, c)
                }
            }
            logger.info(`DE 导出 ${name}: +${dict.size - before} 条`)
        } catch (e) {
            failed.push(`${name}(${(e && e.message) || e})`)
        }
    }
    return { list: [...dict].map(([en, zh]) => ({ en, zh })), failed }
}

const readSnapshot = () => {
    try {
        if (fs.existsSync(SNAPSHOT)) return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
    } catch (e) {
        logger.warn(`读取 DE 词库快照失败: ${(e && e.message) || e}`)
    }
    return null
}

// 返回 [{en, zh}]。内存 TTL 命中直接返回；否则重建，成功写快照，失败回退旧缓存 / 磁盘快照
const refresh = () => {
    if (inflight) return inflight
    inflight = build()
        .then(({ list, failed }) => {
            if (!list.length) throw new Error('生成的词库为空')
            cache = { list, ts: Date.now() }
            inflight = null
            try { fs.writeFileSync(SNAPSHOT, JSON.stringify(list)) } catch (e) { logger.warn(`写 DE 词库快照失败: ${(e && e.message) || e}`) }
            // 单个导出失败只是跳过、不中断构建，所以这里必须显式告警，
            // 否则词库覆盖率缩水了也看不出来（只有零散的 info 行）。
            if (failed.length) {
                logger.warn(`⚠ DE 词库不完整：${EXPORTS.length} 个导出中有 ${failed.length} 个失败，翻译覆盖率会缩水 -> ${failed.join(', ')}`)
            }
            logger.info(`DE 官方中文词库已生成，共 ${list.length} 条（${EXPORTS.length - failed.length}/${EXPORTS.length} 个导出成功）`)
            return list
        })
        .catch(err => {
            inflight = null
            logger.error(`生成 DE 官方词库失败，回退缓存/快照: ${(err && err.message) || err}`)
            const fallback = cache.list || readSnapshot()
            if (fallback) cache = { list: fallback, ts: Date.now() }
            return cache.list || []
        })
    return inflight
}

const loadDeDict = async () => {
    if (cache.list && Date.now() - cache.ts < TTL) return cache.list

    // 首次调用：拉全量要 1 分多钟，卡在这里会让启动很难看。
    // 有快照就先用快照顶上，后台再抓新的，下个周期自然换成最新词库。
    if (!cache.list) {
        const snap = readSnapshot()
        if (snap && snap.length) {
            cache = { list: snap, ts: Date.now() }
            logger.info(`DE 词库先用本地快照启动（${snap.length} 条），后台刷新中`)
            refresh().catch(() => {})
            return snap
        }
    }
    return refresh()
}

module.exports = { loadDeDict }
