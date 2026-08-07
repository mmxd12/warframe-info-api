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

const queryWorldState = async () => {
    const raw = await getText(WORLDSTATE_URL)
    const build = await getBuilder()
    const ws = await build(raw, { locale: 'en', logger: silentLogger })
    // 1999 日历：解析器丢弃了 uniqueName，需借原始 raw 贴回并中文化
    await calendar.enrich(ws, raw)
    // 用 KingPrimes/DataSource 的 reward_pool.json 补全赏金奖励池（已中文化）
    return bountyRewards.enrich(ws)
}

module.exports = { queryWorldState }
