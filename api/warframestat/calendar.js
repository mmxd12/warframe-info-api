const { loadStateDict } = require('../dataSource/supplement')
const logger = require('../../utils/logger')(__filename)

// 1999 日历（KnownCalendarSeasons）的中文化。
//
// 为什么要单独做一层：warframe-worldstate-parser 的 Calendar 模型在构造时就把
// uniqueName（/Lotus/Types/Challenges/Calendar1999/xxx）经 languageString/languageDesc
// 转成了英文标题，原始路径没有保留在输出里。而 KingPrimes/DataSource 的
// state_translation.json 恰恰是按 uniqueName 索引的（31 条 Calendar 词条），
// 两边对不上，所以只能拿原始 worldState JSON 把 uniqueName 按顺序贴回解析结果。
//
// 顺序对齐是安全的：解析器对 Days 只做 filter(Boolean) + map，对 events 是纯 map，
// 都保持原序且不增删，因此「第 i 天的第 j 个事件」在两边一一对应。
// 为防上游哪天改了行为，贴回前会校验事件数量，不一致就整体放弃（保留英文，不错位）。

// 从原始 worldState 文本中取出 Days 结构（只取 uniqueName，不重复解析其他字段）
const extractRawDays = raw => {
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw
        const season = data && data.KnownCalendarSeasons && data.KnownCalendarSeasons[0]
        if (!season || !Array.isArray(season.Days)) return null
        // 与解析器一致：先过滤假值，再逐日取事件的 uniqueName
        return season.Days.filter(Boolean).map(d => ({
            events: (Array.isArray(d.events) ? d.events : []).map(e => ({
                type: e.type,
                // 三种事件各自把 uniqueName 放在不同字段
                uniqueName: e.challenge || e.upgrade || e.reward || ''
            }))
        }))
    } catch (err) {
        logger.warn(`日历原始数据解析失败: ${(err && err.message) || err}`)
        return null
    }
}

// 把 uniqueName 贴回解析后的 calendar.days[].events[]，并附上中文名/描述
const enrich = async (ws, raw) => {
    const cal = ws && ws.calendar
    if (!cal || !Array.isArray(cal.days)) return ws

    const rawDays = extractRawDays(raw)
    if (!rawDays) return ws

    // 结构校验：天数与每天的事件数必须完全一致，否则不敢按序号对齐
    const shapeMatch = rawDays.length === cal.days.length && cal.days.every((d, i) => {
        const a = Array.isArray(d.events) ? d.events.length : 0
        const b = rawDays[i] && rawDays[i].events ? rawDays[i].events.length : -1
        return a === b
    })
    if (!shapeMatch) {
        logger.warn('日历结构与原始数据不一致，跳过中文化（保留英文）')
        return ws
    }

    let dict
    try {
        dict = new Map((await loadStateDict()).map(e => [e.key, e]))
    } catch (err) {
        logger.warn(`日历词库加载失败，保留英文: ${(err && err.message) || err}`)
        return ws
    }

    let hit = 0, miss = 0
    cal.days.forEach((day, i) => {
        day.events.forEach((ev, j) => {
            const uniqueName = rawDays[i].events[j].uniqueName
            if (!uniqueName) return
            ev.uniqueName = uniqueName
            const t = dict.get(uniqueName)
            if (!t) { miss++; return }
            hit++
            // challenge/upgrade 是 {title, description}；reward 是纯字符串
            const target = ev.challenge || ev.upgrade
            if (target) {
                target.titleZh = t.zh
                if (t.desc) target.descriptionZh = t.desc
            } else if (ev.reward != null) {
                ev.rewardZh = t.zh
            }
        })
    })
    logger.info(`1999 日历中文化完成：命中 ${hit} 条，未收录 ${miss} 条（保留英文）`)
    return ws
}

module.exports = { enrich }
