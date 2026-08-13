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
const { libs } = require('../../utils/wfaLibs')

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
    await enrichArbitration(ws)
    await enrichBounties(ws)
    return ws
}

// 从 oracle.browse.wf 补全官方 API 缺失的新赏金任务数据（科维兽/1999/扎里曼）
// 官方 worldState 的 SyndicateMissions 对这几个集团未提供 Jobs 字段，
// browse.wf 的后端从游戏数据提取了这些信息，这里作为补充数据源接入。
const BOUNTY_URL = 'https://oracle.browse.wf/bounty-cycle'
const enrichBounties = async (ws) => {
    try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)
        const raw = await getText(BOUNTY_URL, {}, { signal: controller.signal })
        clearTimeout(timer)
        const data = JSON.parse(raw)
        const bounties = data.bounties || {}
        // 拉取挑战名表（browse.wf 从游戏导出，含本地化键）
        let challengeNames = {}
        let zhDict = {}
        let nodeEntry = null, typeEntry = null
        try {
            const ctrl = new AbortController()
            const t = setTimeout(() => ctrl.abort(), 8000)
            const chRaw = await getText('https://browse.wf/warframe-public-export-plus/ExportChallenges.json', {}, { signal: ctrl.signal })
            clearTimeout(t)
            challengeNames = JSON.parse(chRaw) || {}
            // 拉取中文总词库，直接翻译挑战名
            const dzCtrl = new AbortController()
            const dzT = setTimeout(() => dzCtrl.abort(), 8000)
            const dzRaw = await getText('https://browse.wf/warframe-public-export-plus/dict.zh.json', {}, { signal: dzCtrl.signal })
            clearTimeout(dzT)
            zhDict = JSON.parse(dzRaw) || {}
        } catch (_) { /* 拉取失败时回退 */ }
        // 从词库（Nyx）自动适配节点中文名和任务类型。
        // WFCD 的 solNodes 数据已合并到 Nyx 词库，key 为 SolNode232，value 为 { en, zh }。
        // missionType 通过 SolNode232_type 词条获取（wfcdLibs 额外生成）。
        // 在 map 回调中执行 get 而不是在 try 块中，避免变量作用域问题。
        // 若词库未初始化（首次启动尚未跑完 schedule），则 fallback 到原始值。
        // 1999 赏金队友（Ally）中文名映射
        const ALLY_NAMES = {
            '/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/ArthurAllyAgent': '亚瑟',
            '/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/LettieAllyAgent': '莱蒂',
            '/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/AmirAllyAgent': '阿米尔',
            '/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/AoiAllyAgent': '碧',
            '/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/EleanorAllyAgent': '埃莉诺',
            '/Lotus/Types/Gameplay/1999Wf/ProtoframeAllies/QuincyAllyAgent': '昆西',
        }
        const SYNDICATE_MAP = {
            'ZarimanSyndicate': 'The Holdfasts',
            'EntratiLabSyndicate': 'Cavia',
            'HexSyndicate': 'The Hex',
        }
        // 敌人等级 / 声望奖励为游戏固定值（browse.wf live.php 同源硬编码，不随轮换变化）
        const LEVELS = {
            'ZarimanSyndicate': ['50-55', '60-65', '70-75', '90-95', '110-115'],
            'EntratiLabSyndicate': ['55-60', '65-70', '75-80', '95-100', '115-120'],
            'HexSyndicate': ['65-70', '75-80', '85-90', '95-100', '105-110', '115-120', '125-130'],
        }
        const REWARDS = {
            // VQ = Void Plume（虚空翎羽），普通/钢铁模式数量不同
            'ZarimanSyndicate': ['1/2 VQ', '2/3 VQ', '3/5 VQ', '4/6 VQ', '5/8 VQ'],
            // 普通/钢铁声望
            'EntratiLabSyndicate': ['1000/1500', '2000/3000', '3000/4500', '4000/6000', '5000/7500'],
            'HexSyndicate': ['1000/1500', '2000/3000', '3000/4500', '4000/6000', '5000/7500', '6000/9000', '7500/11250'],
        }
        for (const [oracleTag, syndicateName] of Object.entries(SYNDICATE_MAP)) {
            const jobs = (bounties[oracleTag] || []).map((b, i) => {
                const ch = challengeNames[b.challenge] || {}
                const typeKey = ch.name || (b.challenge || '').split('/').pop() || 'Unknown'
                const levels = LEVELS[oracleTag] || []
                const rewards = REWARDS[oracleTag] || []
                const _nodeEntry = libs && libs.Nyx ? libs.Nyx.get(b.node) : null
                const _typeEntry = libs && libs.Nyx ? libs.Nyx.get(b.node + '_type') : null
                // 自动适配 missionType：查词库→去空格→CamelCase→回退原文
                let _missionType = ''
                if (_typeEntry) {
                    _missionType = _typeEntry.zh
                } else if (b.type) {
                    const t = b.type
                    const r1 = libs.Nyx.get(t)
                    if (r1) { _missionType = r1.zh }
                    else {
                        const r2 = libs.Nyx.get(t.replace(/ /g, ''))
                        if (r2) { _missionType = r2.zh }
                        else {
                            const cc = t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                            const r3 = libs.Nyx.get(cc)
                            if (r3) { _missionType = r3.zh }
                            else { _missionType = t }
                        }
                    }
                }
                return {
                    id: `${oracleTag}_${i}`,
                    type: zhDict[ch.name] || typeKey,
                    node: _nodeEntry ? _nodeEntry.zh : b.node || 'Unknown',
                    missionType: _missionType,
                    enemyLevel: levels[i] || '',
                    reward: rewards[i] || '',
                    ally: b.ally ? (ALLY_NAMES[b.ally] || b.ally) : null,
                    expiry: data.expiry,
                }
            })
            if (Array.isArray(ws.syndicateMissions)) {
                const target = ws.syndicateMissions.find(s => s.syndicate === syndicateName)
                if (target && (!target.jobs || target.jobs.length === 0)) {
                    target.jobs = jobs
                    target.jobsSource = 'oracle.browse.wf'
                }
            }
        }
    } catch (e) {
        logger.warn('[wfrag] 赏金补充数据拉取失败，使用官方数据:', e.message)
    }
}

module.exports = { queryWorldState }
