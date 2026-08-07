const { getJson, getText } = require('../../utils/superagent')
const logger = require('../../utils/logger')(__filename)

// KingPrimes/DataSource：NyxBot 使用的同一「实时维护 + 中文成品」数据源。
// 之所以整体接入这里，是因为项目原本的中文词库来自 Richasy 的 WFA 静态词库
// （wfa.richasy.cn 的 COS），实测其 WF_Dict.json 停更于 2021-09、Invasion 停更于
// 2019、Nightwave 停更于 2020 —— 也就是说 2021 年后的新内容（新战甲/武器/MOD/节点等）
// 根本没有中文，只能显示英文。KingPrimes/DataSource 则随游戏持续更新，故用它作为
// 「现行主词库」补足新内容，WFA 词库降级为长尾兜底。
// 所有文件走 jsDelivr 国内镜像，无需代理，也无需本地手动维护。
const REPO = 'KingPrimes/DataSource'
// 版本解析源：api.github.com 在国内直连不通（实测 fetch failed），
// 改用 jsDelivr 自己的 data API，它同时也是 CDN 的版本索引，与实际可拉取的版本一致。
// 按可用性排序，逐个尝试；GitHub API 留在最后作为境外环境的兜底。
const VERSION_URLS = [
    `https://data.jsdelivr.com/v1/packages/gh/${REPO}`,
    `https://data.jsdelivr.com/v1/package/gh/${REPO}`,
    `https://api.github.com/repos/${REPO}/tags`
]
// 按优先级排列的多源，%TAG%/%PATH% 占位；jsDelivr 需版本号，kingprimes.top 直接拼路径
const SOURCE_TEMPLATES = [
    `https://testingcf.jsdelivr.net/gh/${REPO}@%TAG%/%PATH%`,
    `https://jsd.onmicrosoft.cn/gh/${REPO}@%TAG%/%PATH%`,
    `https://cdn.jsdelivr.net/gh/${REPO}@%TAG%/%PATH%`,
    `https://kingprimes.top/%PATH%`
]

// tag 缓存也跟着 TTL 走：卡 6 小时的话，词库虽然每 2h 重刷，拉的还是旧版本号，
// 上游发新版最迟要 6h 才吃到。取 100 分钟，每轮多一次 jsDelivr 版本查询而已。
const TAG_TTL = 100 * 60 * 1000
let tagCache = { tag: null, ts: 0 }
// 多个 loader 并行启动时会同时触发版本解析，各自把三个源重试一遍（实测断网下打了 12 次
// 无效请求）。用 in-flight 复用，并发只解析一次。
let tagInflight = null

// 三个源的返回结构互不相同，统一抽成版本号字符串数组：
//   /v1/packages  -> { versions: [{ version: '1.0.1' }, ...] }
//   /v1/package   -> { versions: ['1.0.1', ...] }
//   GitHub tags   -> [{ name: '1.0.1' }, ...]
const extractVersions = data => {
    if (!data) return []
    if (Array.isArray(data)) return data.map(v => v && v.name).filter(Boolean)
    if (Array.isArray(data.versions)) {
        return data.versions
            .map(v => (typeof v === 'string' ? v : v && v.version))
            .filter(Boolean)
    }
    return []
}

// 语义化版本降序取最大者。jsDelivr 已按新→旧返回，但不保证，显式排一次更稳。
const pickLatest = versions => versions.slice().sort((a, b) => {
    const pa = String(a).split('.').map(Number)
    const pb = String(b).split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pb[i] || 0) - (pa[i] || 0)
        if (d) return d
    }
    return 0
})[0]

// 取 DataSource 仓库最新版本（多源尝试；全失败才回退 latest，jsDelivr 支持 @latest）
const resolveTag = async () => {
    if (tagCache.tag && Date.now() - tagCache.ts < TAG_TTL) return tagCache.tag
    if (tagInflight) return tagInflight
    tagInflight = (async () => {
        for (const url of VERSION_URLS) {
            try {
                const tag = pickLatest(extractVersions(await getJson(url)))
                if (tag) {
                    tagCache = { tag, ts: Date.now() }
                    logger.info(`DataSource 版本已锁定 ${tag}`)
                    return tag
                }
            } catch (err) {
                logger.warn(`版本源不可用 ${url}: ${(err && err.message) || err}`)
            }
        }
        logger.warn('所有版本源均失败，回退 @latest')
        tagCache = { tag: 'latest', ts: Date.now() }
        return 'latest'
    })().finally(() => { tagInflight = null })
    return tagInflight
}

// 依次尝试多源拉取 warframe/<path> 下的 JSON，任一成功即返回；validate 用于判空
const fetchJson = async (path, validate = d => d != null) => {
    const tag = await resolveTag()
    let lastErr
    for (const tpl of SOURCE_TEMPLATES) {
        const url = tpl.replace('%TAG%', tag).replace('%PATH%', path)
        try {
            const data = await getJson(url)
            if (validate(data)) return data
            lastErr = new Error('空数据')
        } catch (err) {
            lastErr = err
        }
    }
    throw lastErr || new Error(`所有数据源均失败: ${path}`)
}

const nonEmptyArray = d => Array.isArray(d) && d.length > 0

// 赏金奖励池（数组，含中文 rewards）
const loadRewardPool = () => fetchJson('warframe/reward_pool.json', nonEmptyArray)

// 节点补充：DE 的 ExportRegions 不含虚空洪流/前哨战等新星域节点，这份是中文成品
const loadNodes = () => fetchJson('warframe/nodes.json', nonEmptyArray)

// 玩家黑话别名（磁妹→Mag），DE 官方永远不会有
const loadAlias = () => fetchJson('warframe/alias.json', nonEmptyArray)

// 自定义翻译补充（组合包、任务名等 DE 中文导出漏掉的条目）
const loadStateTranslation = () => fetchJson('warframe/state_translation.json', nonEmptyArray)

// 从 NyxBot 源码抓文本文件（用于解析其硬编码枚举，见 factionMission.js）
// 走 jsDelivr 镜像，raw.githubusercontent 在国内不通。
const NYXBOT = 'KingPrimes/NyxBot'
const NYX_TEMPLATES = [
    `https://testingcf.jsdelivr.net/gh/${NYXBOT}@main/%PATH%`,
    `https://jsd.onmicrosoft.cn/gh/${NYXBOT}@main/%PATH%`,
    `https://cdn.jsdelivr.net/gh/${NYXBOT}@main/%PATH%`
]
const fetchNyxbotText = async path => {
    let lastErr
    for (const tpl of NYX_TEMPLATES) {
        try {
            const txt = await getText(tpl.replace('%PATH%', path))
            if (txt && txt.length > 50) return txt
            lastErr = new Error('空内容')
        } catch (err) {
            lastErr = err
        }
    }
    throw lastErr || new Error(`NyxBot 源码拉取失败: ${path}`)
}

const { loadFactionMissionDict } = require('./factionMission')
const { loadNodeDict, loadAliasDict, loadStateDict } = require('./supplement')

module.exports = { 
    fetchJson, 
    loadRewardPool, 
    loadNodes, 
    loadAlias, 
    loadStateTranslation, 
    fetchNyxbotText,
    loadFactionMissionDict,
    loadNodeDict,
    loadAliasDict,
    loadStateDict
}
