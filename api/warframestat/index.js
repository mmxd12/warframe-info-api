// 阻止解析器内部去 warframestat.us 拉赏金奖励：指向一个立即拒绝的地址让其瞬间失败（零延迟），
// 赏金奖励改由 bountyRewards.js 从 KingPrimes/DataSource（NyxBot 同源）取中文成品。必须在加载解析器之前设置。
process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:1'

const { getText } = require('../../utils/superagent')
const logger = require('../../utils/logger')(__filename)
const bountyRewards = require('./bountyRewards')
const calendar = require('./calendar')
// warframe-worldstate-parser 依赖 class-transformer/class-validator 的装饰器元数据，
// 必须在解析器加载前引入 reflect-metadata，否则会报 Reflect.getMetadata is not a function
require('reflect-metadata')

// warframestat.us 在部分地区需要代理。改为直接取 DE 官方 CDN 的原始 worldState（这也是 warframestat.us
// 与 NyxBot 共同的上游数据源），再用 warframe-worldstate-parser 本地解析成一致结构，下游无需改动。
// 赏金奖励表 DE 官方导出已不再提供，改由 bountyRewards.js 从 KingPrimes/DataSource 取中文成品补全。
const WORLDSTATE_URL = "https://api.warframe.com/cdn/worldState.php"
// 仲裁：官方 CDN 不再提供 Arbitration 字段，改从独立服务拉取（NyxBot 同源）
const ARBYS_URL = "https://wf.555590.xyz/api/arbys?days=30"

// 传给解析器的静默日志器，屏蔽赏金拉取失败等 debug 噪声（这些已由 browse.wf 方案接管）
const silentLogger = { debug() {}, info() {}, warn() {}, error(msg) { logger.error(msg) } }

// warframe-worldstate-parser v5 是纯 ESM，用动态 import 在 CommonJS 中加载并缓存
// 其默认导出为 WorldState 类，实际解析入口是静态方法 WorldState.build(data, deps)
let buildPromise
const getBuilder = () => {
    if (!buildPromise) {
        buildPromise = import('warframe-worldstate-parser').then(m => {
            const WorldState = m.default || m.WorldState
            return WorldState.build.bind(WorldState)
        })
    }
    return buildPromise
}

// 拉取仲裁排期数据（独立源），并合并进 worldState 对象，供 /wf/arbitration 使用。
// 失败时静默降级：保留解析器生成的占位仲裁，不阻塞整体 worldState 拉取。
const enrichArbitration = async (ws) => {
    try {
        // 加 20s 超时：wf.555590.xyz 响应慢（约8s），避免偶发超时降级
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 20000)
        const raw = await getText(ARBYS_URL, {}, { signal: controller.signal })
        clearTimeout(timer)
        const list = JSON.parse(raw)
        if (!Array.isArray(list) || list.length === 0) return ws
        // 取当前正在进行的仲裁（activation <= now <= expiry）
        const now = Date.now()
        const current = list.find(a => {
            const t0 = new Date(a.activation).getTime()
            const t1 = new Date(a.expiry).getTime()
            return t0 <= now && now <= t1
        }) || list[0]
        // 合并到解析器生成的 arbitration 对象
        if (ws.arbitration && typeof ws.arbitration === 'object') {
            ws.arbitration.node = current.node
            ws.arbitration.nodeKey = current.node
            ws.arbitration.type = current.missionType
            ws.arbitration.typeKey = current.missionType
            ws.arbitration.enemy = current.enemy
            ws.arbitration.enemyKey = current.enemy
            ws.arbitration.expiry = current.expiry
            ws.arbitration.activation = current.activation
            ws.arbitration.expired = false
            ws.arbitration.id = (current.node + current.missionType).replace(/\s/g, '')
        }
        // 同时注入完整排期（可选，供前端/调试）
        ws.arbitrationSchedule = list
    } catch (e) {
        logger.error('[wfrag] 仲裁数据拉取失败，使用占位数据:', e.message)
    }
    return ws
}

const queryWorldState = async () => {
    const raw = await getText(WORLDSTATE_URL)
    const build = await getBuilder()
    const ws = await build(raw, { locale: 'en', logger: silentLogger })
    // 1999 日历：解析器丢弃了 uniqueName，需借原始 raw 贴回并中文化
    await calendar.enrich(ws, raw)
    // 用 KingPrimes/DataSource 的 reward_pool.json 补全赏金奖励池（已中文化）
    await bountyRewards.enrich(ws)
    // 仲裁：独立源补全
    return enrichArbitration(ws)
}

module.exports = { queryWorldState }
