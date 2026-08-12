const mcache = require('memory-cache');
const retry = require('../utils/retry');
const logger = require('../utils/logger')(__filename)
const wfaApi = require('../api/wfaRichasy')
const wmApi = require('../api/warframeMarket')
const cacheKey = 'lib';

const scheduleName = '刷新缓存字典'
const cache = new mcache.Cache()
let setWfaLibCache = async () => {
    let start = new Date().getTime();
    let head = `[ScheduleJob] -- ${scheduleName}`
    let dicts = await retry(wfaApi.getWfaLexiconFromGithub,`${head} -- wfa dicts`)
    let wmDicts = await retry(wmApi.auctions,`${head} -- wm dicts`)
    let mergedLibData = { ...dicts,...wmDicts }
    // 拉取 browse.wf 补充词库（官方词库缺失的翻译）
    try {
        const { getText } = require('../utils/superagent')
        const browseDict = await getText('https://oracle.browse.wf/dicts/zh.json')
        if (browseDict) {
            mergedLibData.BrowseDict = JSON.parse(browseDict)
            logger.info(`${head} -- browse.wf dicts: ${Object.keys(mergedLibData.BrowseDict).length} 条`)
        }
    } catch (e) {
        logger.warn(`${head} -- browse.wf dicts 拉取失败: ${e.message}`)
    }
    // 拉取 WFCD 中文数据（活动/任务/派系/节点等中文翻译）
    try {
        const { getWfcdDicts } = require('../api/dataSource/wfcdLibs')
        const wfcdDict = await getWfcdDicts()
        if (wfcdDict && wfcdDict.length > 0) {
            mergedLibData.WfcdZh = wfcdDict
            logger.info(`${head} -- WFCD dicts: ${wfcdDict.length} 条`)
        }
    } catch (e) {
        logger.warn(`${head} -- WFCD dicts 拉取失败: ${e.message}`)
    }
    logger.info(`${head} mergedLibData:{${Object.keys(mergedLibData)}} ${new Date().getTime() - start} ms`)
    // save lib to cache
    cache.put(cacheKey, mergedLibData)
    logger.info(`${head} => 结束 ,耗时${new Date().getTime() - start} ms`)
}

let getWfaLibCache = async () => {
    if (!cache.get(cacheKey)) {
        await setWfaLibCache();
    }
    return cache.get(cacheKey)
}


module.exports = {
    scheduleName,
    cache,
    setWfaLibCache,
    getWfaLibCache,
};
