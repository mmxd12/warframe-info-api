const { getJson } = require('../../utils/superagent')
const logger = require('../../utils/logger')(__filename)

// v1 已陆续下线（items / orders 已 404/403），改用 v2 clean JSON 接口；
// statistics 与 auctions/search 目前仍由 v1 提供，故做混合调用并加容错。
const V1 = "https://api.warframe.market/v1/"
const V2 = "https://api.warframe.market/v2/"
// v2 通过请求头选择语言，一次返回 en + zh-hans 两种 i18n
const LANG = { Language: 'zh-hans', Platform: 'pc' }

// 订单价格变化快，60 秒 TTL；统计数据日级汇总，1 小时 TTL
// 拍卖（紫卡/玄骸武器）同属实时挂单，与订单同级 60 秒
const ORDERS_TTL = 60 * 1000
const STATS_TTL = 60 * 60 * 1000
const AUCTIONS_TTL = 60 * 1000

const ordersCache = new Map() // slug -> { data, ts }
const ordersInflight = new Map() // slug -> Promise
const statsCache = new Map()
const statsInflight = new Map()
const auctionsCache = new Map() // `${type}:${weapon}` -> { data, ts }
const auctionsInflight = new Map()

// 通用缓存辅助：TTL + in-flight 去重
const cached = async (cache, inflight, ttl, key, fetcher) => {
    const entry = cache.get(key)
    if (entry && Date.now() - entry.ts < ttl) return entry.data
    const existing = inflight.get(key)
    if (existing) return existing
    const promise = fetcher()
        .then(data => { cache.set(key, { data, ts: Date.now() }); inflight.delete(key); return data })
        .catch(e => { inflight.delete(key); throw e })
    inflight.set(key, promise)
    return promise
}

// 把 v2 的 {slug,i18n} 结构规整成下游词库/格式化函数期望的 {en,zh,code,url_name,...} 结构
const norm = (v, extra = {}) => {
    const i18n = v.i18n || {}
    const en = (i18n.en && i18n.en.name) || v.slug
    const zh = (i18n['zh-hans'] && i18n['zh-hans'].name) || en
    return { ...v, en, zh, code: v.slug, url_name: v.slug, ...extra }
}

const listV2 = (path, extra) =>
    getJson(`${V2}${path}`, LANG).then(r => (r.data || []).map(v => norm(v, typeof extra === 'function' ? extra(v) : extra)))

const index = {
    items: async () => listV2('items'),

    rivenItems: async () => listV2('riven/weapons'),

    item: async (slug) => {
        const r = await getJson(`${V2}items/${slug}`, LANG)
        return norm(r.data)
    },

    // 用 v2 的多个 clean 接口重建词库数据，替代原先对 auctions 页面 application-state 的 HTML 抓取
    auctions: async () => {
        const [items, riven_items, riven_attributes, lichW, sisterW, lichE, sisterE, lichQ, sisterQ] =
            await Promise.all([
                listV2('items'),
                listV2('riven/weapons'),
                listV2('riven/attributes', v => ({ units: v.unit })),
                listV2('lich/weapons', { type: 'lich' }),
                listV2('sister/weapons', { type: 'sister' }),
                listV2('lich/ephemeras'),
                listV2('sister/ephemeras'),
                listV2('lich/quirks'),
                listV2('sister/quirks'),
            ])
        return {
            items,
            riven_items,
            riven_attributes,
            auctionsWeapons: lichW.concat(sisterW),
            ephemeras: lichE.concat(sisterE),
            quirks: lichQ.concat(sisterQ),
        }
    },

    // auctions/search 目前仍走 v1（v2 未提供对应搜索），返回 v1 结构，下游格式化函数无需改动
    // 紫卡/玄骸武器拍卖同属实时挂单，60 秒缓存 + in-flight 去重
    // 支持 positive_stats/negative_stats 多词条筛选（服务端过滤，比客户端快且准）
    auctionsSearch: async (type = 'riven', weapon_url_name, positiveStats = [], negativeStats = []) => {
        const statsKey = [...positiveStats.sort(), ...negativeStats.sort().map(s => `!${s}`)].join(',')
        const cacheKey = statsKey ? `${type}:${weapon_url_name}:${statsKey}` : `${type}:${weapon_url_name}`
        
        return cached(auctionsCache, auctionsInflight, AUCTIONS_TTL, cacheKey, async () => {
            let url = `${V1}auctions/search?type=${type}&weapon_url_name=${weapon_url_name}&polarity=any&buyout_policy=direct&sort_by=price_asc`
            if (positiveStats.length > 0) url += `&positive_stats=${positiveStats.join(',')}`
            if (negativeStats.length > 0) url += `&negative_stats=${negativeStats.join(',')}`
            
            try {
                return (await getJson(url)).payload.auctions.filter(v => v.owner.status !== 'offline')
            } catch (e) {
                logger.error(`auctionsSearch failed: ${e}`)
                return []
            }
        })
    },

    // 订单改用 v2 /orders/item/{slug}，并把字段映射回 v1 命名（order_type / user.ingame_name）保持兼容
    // 60 秒缓存：同一物品高频查询只打一次上游；in-flight 去重避免并发穿透
    orders: async (slug = 'primed_chamber') =>
        cached(ordersCache, ordersInflight, ORDERS_TTL, slug, async () => {
            const orders = (await getJson(`${V2}orders/item/${slug}`, LANG)).data || []
            const compat = o => ({ ...o, order_type: o.type, user: { ...o.user, ingame_name: o.user.ingameName } })
            const sell = orders.filter(o => o.type === 'sell' && o.visible !== false)
            const online = sell.filter(o => o.user.status !== 'offline').sort((a, b) => a.platinum - b.platinum)
            const offline = sell.filter(o => o.user.status === 'offline').sort((a, b) => a.platinum - b.platinum)
            return online.concat(offline).map(compat)
        }),

    // statistics 目前仍由 v1 提供；失败时返回空数组，交由上层做“无估价”降级
    // 日级汇总数据，缓存 1 小时；v1 若下线，stale 兜底可继续用上一次结果
    statistics: async (slug = 'primed_chamber') =>
        cached(statsCache, statsInflight, STATS_TTL, slug, async () => {
            try {
                return (await getJson(`${V1}items/${slug}/statistics`)).payload.statistics_live['90days']
            } catch (e) {
                logger.error(`statistics failed: ${e}`)
                return []
            }
        }),
}

module.exports = index
