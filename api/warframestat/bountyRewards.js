const dataSource = require('../dataSource')
const fs = require('fs')
const path = require('path')
const logger = require('../../utils/logger')(__filename)

// 赏金奖励池数据源：KingPrimes/DataSource（NyxBot 使用的同一维护源，抓取逻辑见 api/dataSource）。
// - warframe/reward_pool.json 已是「中文成品」，key 为 job.uniqueName（与解析器一致），无需再翻译；
// - 由维护者随游戏更新，走 jsDelivr 国内镜像，无需代理，也无需本地手动维护映射；
// - 相比旧的 browse.wf ExportRewards（2.3MB 英文 + 字典还原）：这里仅 ~37KB 且已中文化。
// DE 官方 PublicExport 已移除 ExportRewards（这正是 browse.wf「plus」和本数据源存在的原因），
// 因此赏金奖励表只能取自这类维护源，而非 DE 官方导出（官方现已无此表可拉，也就无从「字典还原」）。
const TTL = 12 * 60 * 60 * 1000 // 奖励表变动很慢，缓存 12 小时

// 磁盘快照：与 supplement.js / warframeExport.js 同一套策略，放在 dataSource 目录下统一管理。
// 之前这里只有内存 cache，注释写着「拉取失败时用旧缓存兜底」，但冷启动时 cache.map 是 null，
// 等于没有兜底 —— 重启时若断网或 jsDelivr 抽风，赏金奖励池就是空的，
// 表现为 rewardPool 退回解析器那个 1 条的占位值，很难和「上游缺表」区分开。
const SNAPSHOT = path.join(__dirname, '..', 'dataSource', 'reward_pool_snapshot.json')

// 快照存上游原始 list 而不是拼好的 map：这样走快照启动时，
// buildMap 仍会把 reward_pool_local.json 叠加上去，本地补充表照常生效。
const readSnapshot = () => {
    try {
        const d = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
        return Array.isArray(d) && d.length ? d : null
    } catch { return null }
}

const writeSnapshot = list => {
    try { fs.writeFileSync(SNAPSHOT, JSON.stringify(list), 'utf8') }
    catch (e) { logger.warn(`写赏金奖励池快照失败: ${(e && e.message) || e}`) }
}

let cache = { map: null, ts: 0 }
let inflight = null

// 上游 DataSource 的 reward_pool.json 漏了 6 张火卫二普通赏金表（Deimos TierB/D/E 的部分轮次）。
// Cetus 和 Venus 都是完整的 5 Tier × 3 Table = 15 张，只有 Deimos 是 9 张。
// 实测同一轮世界状态里 TierA~E 与 TableA/C 自由组合出现，可见这 6 张并非「不存在的组合」，
// 而是维护源确实缺失。缺表时解析器会给一个 1 条的兜底值（如 Core Samples），不会崩但内容近乎为空。
// 这里放本地占位，rewards 填好后即生效；将来上游补齐，把对应条目从 json 里删掉就会自动走回上游。
const localPool = (() => {
    try {
        return require('../dataSource/reward_pool_local.json').filter(e => e && Array.isArray(e.rewards) && e.rewards.length)
    } catch { return [] }
})()

// reward_pool.json 是数组，转成 { uniqueName: [中文奖励字符串...] }，并把 |COUNT| 占位替换为数量
const buildMap = list => {
    const map = Object.create(null)
    // 本地表放在后面，同名时覆盖上游
    for (const entry of [...list, ...localPool]) {
        if (!entry || !entry.uniqueName || !Array.isArray(entry.rewards)) continue
        map[entry.uniqueName] = entry.rewards.map(r => {
            const count = r.itemCount == null ? 1 : r.itemCount
            return String(r.item).replace(/\|COUNT\|/g, count)
        })
    }
    return map
}

// 拉上游 -> 落盘 -> 建 map
const refresh = () => {
    if (inflight) return inflight
    inflight = dataSource.loadRewardPool()
        .then(list => {
            writeSnapshot(list)
            cache = { map: buildMap(list), ts: Date.now() }
            inflight = null
            logger.info(`赏金奖励池已加载（KingPrimes/DataSource），共 ${Object.keys(cache.map).length} 张表`)
            return cache.map
        })
        .catch(err => {
            inflight = null
            logger.error(`加载 DataSource 赏金奖励池失败: ${(err && err.message) || err}`)
            // 依次回退：内存旧缓存 -> 磁盘快照 -> 仅本地补充表（至少让手填的那几张生效）
            if (cache.map) return cache.map
            const snap = readSnapshot()
            if (snap) {
                cache = { map: buildMap(snap), ts: Date.now() }
                logger.warn(`赏金奖励池回退磁盘快照，共 ${Object.keys(cache.map).length} 张表`)
                return cache.map
            }
            cache = { map: buildMap([]), ts: Date.now() }
            logger.warn(`赏金奖励池无快照可退，仅本地补充表生效（${Object.keys(cache.map).length} 张）`)
            return cache.map
        })
    return inflight
}

const loadRewardMap = async () => {
    if (cache.map && Date.now() - cache.ts < TTL) return cache.map

    // 首次调用：有快照就先顶上，后台再抓新的，避免上游慢/不通时拖住首个请求
    if (!cache.map) {
        const snap = readSnapshot()
        if (snap) {
            cache = { map: buildMap(snap), ts: Date.now() }
            logger.info(`赏金奖励池先用本地快照启动（${Object.keys(cache.map).length} 张表），后台刷新中`)
            refresh().catch(() => {})
            return cache.map
        }
    }
    return refresh()
}

// 就地为解析后的 worldState 补全各集团赏金任务的 rewardPool（已是中文，下游无需再翻译）
const enrich = async ws => {
    const missions = ws && ws.syndicateMissions
    if (!Array.isArray(missions)) return ws
    const map = await loadRewardMap()
    if (!map) return ws
    for (const mission of missions) {
        if (!Array.isArray(mission.jobs)) continue
        for (const job of mission.jobs) {
            const pool = map[job.uniqueName]
            if (pool && pool.length) job.rewardPool = pool
        }
    }
    return ws
}

module.exports = { enrich }
