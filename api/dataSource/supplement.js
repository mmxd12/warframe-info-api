const path = require('path')
const fs = require('fs')
const logger = require('../../utils/logger')(__filename)

// KingPrimes/DataSource 的三份补充词表。它们和 DE PublicExport 各自覆盖不同盲区，
// 且三份的索引方式互不相同，所以不能笼统地并进同一个 en->zh 词库：
//
//   nodes.json             uniqueName -> 中文节点名。只有中文，没有英文名。
//                          实测 62 条与 DE 词库零重叠（DE 的 ExportRegions 走
//                          英文名索引，且不含比邻星域这批新节点）。
//   alias.json             cn -> en，方向与主词库相反。玩家黑话（磁妹->Mag），
//                          用途是搜索入口，不是展示翻译。
//   state_translation.json uniqueName -> 中文名，与 DE 导出同构，可直接补进主词库。
//
// 全部走 dataSource 的多源 + 快照兜底，拉不到就退快照，再不行就空，不阻塞启动。

const SNAP_DIR = __dirname
// 与 warframeExport 同值：小于 initLibsCache 的 2h 间隔，保证每轮调度都真刷
const TTL = 100 * 60 * 1000

const snapPath = name => path.join(SNAP_DIR, `${name}_snapshot.json`)

const readSnap = name => {
    try {
        const d = JSON.parse(fs.readFileSync(snapPath(name), 'utf8'))
        return Array.isArray(d) && d.length ? d : null
    } catch { return null }
}

const writeSnap = (name, list) => {
    try { fs.writeFileSync(snapPath(name), JSON.stringify(list), 'utf8') } catch { /* 快照失败不影响使用 */ }
}

// 与 factionMission 相同的策略：有快照先秒起，后台再刷新
const makeLoader = (name, fetcher, transform) => {
    let cache = { list: null, ts: 0 }
    let inflight = null

    const build = async () => {
        const raw = await fetcher()
        const list = transform(raw).filter(v => v && v.key && v.zh)
        if (!list.length) throw new Error(`${name} 转换后为空`)
        writeSnap(name, list)
        logger.info(`${name} 补充词库已更新：${list.length} 条`)
        return list
    }

    return async () => {
        if (cache.list && Date.now() - cache.ts < TTL) return cache.list
        if (inflight) return inflight
        const snap = readSnap(name)
        if (snap) {
            cache = { list: snap, ts: Date.now() }
            build().then(l => { cache = { list: l, ts: Date.now() } })
                .catch(e => logger.warn(`${name} 后台刷新失败，继续用快照: ${(e && e.message) || e}`))
            return snap
        }
        inflight = build()
            .then(l => { cache = { list: l, ts: Date.now() }; return l })
            .catch(e => {
                logger.error(`${name} 拉取失败，该批词回退英文: ${(e && e.message) || e}`)
                return []
            })
            .finally(() => { inflight = null })
        return inflight
    }
}

// 惰性 require，避免与 index.js 形成顶层循环依赖
const ds = () => require('./index')

// nodes：uniqueName -> 中文节点名，同时带上所属星域，供节点展示时拼接
const loadNodeDict = makeLoader('nodes', () => ds().loadNodes(),
    raw => raw.map(n => ({ key: n.uniqueName, zh: n.name, system: n.systemName || '' })))

// alias：cn -> en。注意方向，key 是中文黑话，值是标准英文名
// 与 state_translation 同套路：本地补充表叠加在上游之后，同 key 本地优先；
// 上游 alias.json 更新后仍以本地为准，见 alias_local.json。
// 注意：makeLoader 有快照优先机制，必须在这里二次合并，否则启动时
// alias_snapshot.json 直接返回旧列表、本地补充词不生效。
const localAlias = (() => {
    try {
        return require('./alias_local.json').filter(e => e && e.key && e.zh)
    } catch { return [] }
})()

const _loadAliasDict = makeLoader('alias', () => ds().loadAlias(),
    raw => raw.map(a => ({ key: a.cn, zh: a.en })))

const loadAliasDict = async () => {
    const list = await _loadAliasDict()
    const seen = new Set(list.map(x => x.key))
    return [...list, ...localAlias.filter(x => !seen.has(x.key))]
}

// state_translation：uniqueName -> 中文名 + 描述。日历挑战需要完整信息
//
// 上游这份表对 1999 日历只覆盖了一部分（实测 27 个事件里命中 17 个），缺的多是
// Easy/Hard 档挑战和几个奖励物品。与 reward_pool_local.json 同一套路：本地补充表
// 叠加在上游之后，同 uniqueName 时本地优先；将来上游补齐，把对应条目从 json 里
// 删掉就会自动走回上游，不会长期分叉。
const localState = (() => {
    try {
        return require('./state_translation_local.json').filter(e => e && e.uniqueName && e.name)
    } catch { return [] }
})()

const loadStateDict = makeLoader('state_translation', () => ds().loadStateTranslation(),
    raw => [...raw, ...localState].map(s => ({ key: s.uniqueName, zh: s.name, desc: s.description || '' })))

module.exports = { loadNodeDict, loadAliasDict, loadStateDict }
