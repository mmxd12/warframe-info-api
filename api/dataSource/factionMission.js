const path = require('path')
const fs = require('fs')
const logger = require('../../utils/logger')(__filename)

// 任务类型 + 派系中文词。
//
// 这两类词是 DE PublicExport 的结构性盲区：导出的是「游戏实体」（有 uniqueName 的
// 物品/节点/MOD），而「生存」「歼灭」「合一众」是界面字符串，DE 打包在客户端本地化
// 文件里，从不对外发布。查遍 15 个导出（含 Flavour / SortieRewards / FusionBundles）
// 均无。WFA 老词库有旧任务类型，但缺 2021 后新增的 Alchemy / Ascension / 虚空三兄弟。
//
// NyxBot 的解法是硬编码在 MissionType.java 枚举里——它自己也没有自动源。
// 这里不手抄那张表，而是直接解析它的源码：KingPrimes 更新枚举时我们自动跟上，
// 拉不到就用本地快照，快照也没有才退到内置常量。三层兜底，不阻塞启动。
const MISSION_TYPE_SRC = 'src/main/java/com/nyx/bot/modules/warframe/enums/MissionType.java'
const SNAPSHOT = path.join(__dirname, 'faction_mission_snapshot.json')

// 同 supplement：小于 initLibsCache 的 2h 间隔，保证每轮调度都真刷
const TTL = 100 * 60 * 1000
let cache = { list: null, ts: 0 }
let inflight = null

// 派系名：没有任何线上源，且是封闭词表（十年只加了几个），内置即可。
// Grineer / Corpus / Orokin 在中文客户端里保持原文，不做翻译，避免画蛇添足。
const FACTIONS = {
    Infested: '感染者',
    Corrupted: '堕落者',
    Sentient: '异常者',
    Narmer: '合一众',
    Murmur: '密语者',
    Scaldra: '炽蛇军',
    Techrot: '电子锈蚀',
    Crossfire: '交叉火力'
}

// DE 的内部枚举名和世界状态 API 的显示名不是一套：枚举写 MT_EXTERMINATION，
// API 返回 Exterminate。机械 Title 化覆盖不到这几个，补一张别名表。
const KEY_ALIAS = {
    MT_EXTERMINATION: 'Exterminate',
    MT_INTEL: 'Spy',
    MT_TERRITORY: 'Interception',
    MT_RETRIEVAL: 'Hijack',
    MT_EXCAVATE: 'Excavation',
    MT_EVACUATION: 'Defection',
    MT_ORPHEUS: 'Orphix'
}

// MT_MOBILE_DEFENSE -> 'Mobile Defense'，与世界状态 API 的任务类型写法对齐
const toTitle = key => key.replace(/^MT_/, '').split('_')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')

// 解析 Java 枚举常量：MT_ALCHEMY("元素转换"),
const parseEnum = txt => {
    const out = []
    const re = /(MT_[A-Z0-9_]+)\s*\(\s*"([^"]+)"\s*\)/g
    let m
    while ((m = re.exec(txt)) !== null) {
        const [, key, zh] = m
        if (!zh.trim()) continue
        const api = KEY_ALIAS[key] || toTitle(key)
        out.push({ en: api, zh })
        out.push({ en: key, zh }) // 原始 key 也留一份，部分数据源直接给 MT_XXX
    }
    return out
}

const readSnapshot = () => {
    try {
        const d = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
        return Array.isArray(d) && d.length ? d : null
    } catch { return null }
}

const writeSnapshot = list => {
    try { fs.writeFileSync(SNAPSHOT, JSON.stringify(list), 'utf8') } catch { /* 快照失败不影响使用 */ }
}

const withFactions = list => {
    const seen = new Set(list.map(v => v.en))
    const merged = list.slice()
    Object.entries(FACTIONS).forEach(([en, zh]) => {
        if (!seen.has(en)) merged.push({ en, zh })
    })
    return merged
}

const build = async () => {
    // 惰性 require：index.js 底部会 require 本模块，顶层引用会形成循环依赖
    const { fetchNyxbotText } = require('./index')
    const txt = await fetchNyxbotText(MISSION_TYPE_SRC)
    const list = parseEnum(txt)
    if (!list.length) throw new Error('MissionType 枚举解析为空')
    const merged = withFactions(list)
    writeSnapshot(merged)
    logger.info(`任务类型/派系词库已更新：任务类型 ${list.length / 2} 种 + 派系 ${Object.keys(FACTIONS).length} 个，共 ${merged.length} 条`)
    return merged
}

// 与 loadDeDict 同样的策略：有快照先用快照秒起，后台再刷新
const loadFactionMissionDict = async () => {
    if (cache.list && Date.now() - cache.ts < TTL) return cache.list
    if (inflight) return inflight
    const snap = readSnapshot()
    if (snap) {
        cache = { list: snap, ts: Date.now() }
        build().then(l => { cache = { list: l, ts: Date.now() } })
            .catch(e => logger.warn(`任务类型词库后台刷新失败，continue 用快照: ${(e && e.message) || e}`))
        return snap
    }
    inflight = build()
        .then(l => { cache = { list: l, ts: Date.now() }; return l })
        .catch(e => {
            logger.error(`任务类型词库拉取失败，退到内置派系词: ${(e && e.message) || e}`)
            return withFactions([])
        })
        .finally(() => { inflight = null })
    return inflight
}

module.exports = { loadFactionMissionDict }
