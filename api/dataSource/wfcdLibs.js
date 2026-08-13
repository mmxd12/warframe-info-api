// WFCD (Warframe Community Developers) 中文数据源
// 提供活动/任务类型/派系/节点/集团等的中文翻译，跟随游戏版本
const { getJson } = require('../../utils/superagent')
const logger = require('../../utils/logger')(__filename)

const BASE = 'https://cdn.jsdelivr.net/gh/WFCD/warframe-worldstate-data@master/data/zh/'

// 扁平化 WFCD 数据类型：把 { key: { value: '中文' } } 转成 [{ en, zh }]
const flattenWfcd = (data, keyField = 'key') => {
    const out = []
    for (const [k, v] of Object.entries(data || {})) {
        if (v && typeof v === 'object' && 'value' in v) {
            out.push({ en: k, zh: v.value })
        } else if (v && typeof v === 'object') {
            // 嵌套对象（如 eventsData 的 tags / scoreVariables）
            for (const [k2, v2] of Object.entries(v)) {
                if (v2 && typeof v2 === 'object' && 'value' in v2) {
                    let zh = v2.value
                    if (zh && typeof zh === 'object' && 'value' in zh) zh = zh.value
                    out.push({ en: k2, zh: String(zh || '') })
                }
            }
        } else if (typeof v === 'string') {
            out.push({ en: k, zh: v })
        }
    }
    return out.filter(x => x.en && x.zh)
}

// 拉取单个中文数据文件
const fetchDict = async (name) => {
    try {
        const data = await getJson(BASE + name)
        return flattenWfcd(data)
    } catch (e) {
        logger.warn(`[wfcd] ${name} 拉取失败: ${(e && e.message) || e}`)
        return []
    }
}

// 拉取全部 WFCD 中文数据，返回 [{en, zh}] 数组
const getWfcdDicts = async () => {
    const files = [
        'eventsData.json', 'missionTypes.json', 'factionsData.json',
        'operationTypes.json', 'persistentEnemyData.json', 'solNodes.json',
        'syndicatesData.json', 'fissureModifiers.json', 'sortieData.json',
        'steelPath.json', 'upgradeTypes.json', 'archonShards.json', 'synthTargets.json'
    ]
    const results = await Promise.all(files.map(fetchDict))
    const merged = []
    for (const list of results) merged.push(...list)
    // 额外：从 solNodes 原始数据中提取节点类型（missionType），
    // 生成 SolNode{xxx}_type 词条，供 enrichBounties 查 missionType 用。
    // 因为 flattenWfcd 只保留了 value（节点名），type 字段被丢弃了。
    try {
        const solData = await getJson(BASE + 'solNodes.json')
        for (const [k, v] of Object.entries(solData || {})) {
            if (v && typeof v === 'object' && v.type && typeof v.type === 'string') {
                merged.push({ en: k + '_type', zh: v.type })
            }
        }
        logger.info(`[wfcd] solNodes type 补充 ${merged.length} 条`)
    } catch (e) {
        logger.warn(`[wfcd] solNodes type 拉取失败: ${(e && e.message) || e}`)
    }
    logger.info(`[wfcd] 拉取完成，共 ${merged.length} 条中文词条`)
    return merged
}

module.exports = { getWfcdDicts }
