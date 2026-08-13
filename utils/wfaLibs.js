const mcache = require('memory-cache');
const statsName = require('./dict/RivenStatsName.json');
const WmRivenAttribute = require('./dict/WmRivenAttribute.json');
const wfaLibrarySchedule = require('../schedule/wfaLibrarySchedule');
const customDict = require('./dict/custom.json');
const path = require("path");
const lexiconPath = path.join(__dirname, './lexicon/wmItems/')
const logger = require('./logger')(__filename)
const wmApi = require("../api/warframeMarket");
const warframeExport = require("../api/dataSource/warframeExport");
const dataSource = require("../api/dataSource");
const utils = require("../utils/utils");
const fs = require("fs");

// 存放经过处理的特定业务的词库
const libs = {
    // WFA的遗产词库，Dict为比较全面的词库（旧
    Dict: new mcache.Cache(),       //Dict为比较全面的词库（旧
    Sale: new mcache.Cache(),       //对应wm的items，不过比较旧已经废弃
    Riven: new mcache.Cache(),      //废弃，被wm的riven_items替代
    NightWave: new mcache.Cache(),  //午夜电波,可能还在使用
    Invasion: new mcache.Cache(),   //入侵、裂隙、奸商相关

    // DE 官方 PublicExport 自生成的现行中文词库（en↔zh 按 uniqueName 配对）。
    // WFA 静态词库停更于 2021，用它作为主词库补足新内容，跟随游戏版本，见 api/dataSource/warframeExport。
    Nyx: new mcache.Cache(),

    // uniqueName -> 中文节点名。单独一份是因为 Nyx/Dict 都按英文名索引，
    // 而 nodes.json 只给 uniqueName + 中文名，没有英文名，无法并入。
    NodeZh: new mcache.Cache(),
    // 中文黑话 -> 标准英文名（磁妹 -> Mag）。方向与展示词库相反，供搜索入口使用。
    Alias: new mcache.Cache(),

    wm: new mcache.Cache(),
    /* warframe market lexicon */
    wmRiven: new mcache.Cache(),
    riven_attributes: new mcache.Cache(),
    auctionsWeapons: new mcache.Cache(),
    ephemeras: new mcache.Cache(),
    quirks: new mcache.Cache(),

    wmr2rma: new mcache.Cache(),
};
const libsArr = ['Dict', 'Sale', 'Riven', 'NightWave', 'Invasion']
const wmLibArr = [ 'riven_attributes','auctionsWeapons','ephemeras','quirks']
const wmLibURLArr = [ 'ephemeras','quirks']
// 内容对应：
//      WFA遗产：Dict,Invasion,NightWave,Lib,Sale,Riven.    
//      WarframeMarket: items(常规商品),riven_items(紫卡武器),riven_attributes(紫卡属性),auctionsWeapons(玄骸+姐妹武器),ephemeras,quirks.           
const commonMcache = new mcache.Cache()

let initLibsCache = async () => {
    // Setp 0:
    //  从schedule cache获取最新词库
    let library = await wfaLibrarySchedule.getWfaLibCache();
    //  刷新到commonMcache
    Object.keys(library).forEach((value => {
        commonMcache.put(value, library[value])
    }))

    // wfa static Dict
    libsArr.forEach(function (value, index, array) {
        logger.info(value);
        let lib = commonMcache.get(value)
        lib.forEach(function (value_, index_) {
            libs[value].put(value_.en, value_);
        })
    });

    // DE 官方 PublicExport 自生成的现行中文词库，作为 getCache 的主词库补足 WFA
    // 停更后的新内容（Qorvex、Dante、Coda 武器等）；拉取失败时留空，自动回退 WFA 词库，不影响启动。
    try {
        const deDict = await warframeExport.loadDeDict()
        deDict.forEach(v => {
            if (!v || !v.en || !v.zh) return
            const word = { en: v.en, zh: v.zh }
            libs.Nyx.put(v.en, word)
            v.en !== v.zh && libs.Nyx.put(v.zh, word)
        })
        logger.info("Nyx:" + libs.Nyx.size())
    } catch (e) {
        logger.error(`加载 DE 官方自生成词库失败，回退 WFA 词库: ${(e && e.message) || e}`)
    }

    // 任务类型 + 派系词：DE PublicExport 的结构性盲区（导出只含游戏实体，不含界面字符串），
    // WFA 又缺 2021 后的新任务类型。从 NyxBot 的 MissionType 枚举源码解析，详见 dataSource/factionMission.js。
    // 同样并入 Nyx 主词库，失败时仅这批词回退英文，不影响启动。
    try {
        const fmDict = await dataSource.loadFactionMissionDict()
        fmDict.forEach(v => {
            if (!v || !v.en || !v.zh) return
            const word = { en: v.en, zh: v.zh }
            libs.Nyx.put(v.en, word)
            v.en !== v.zh && libs.Nyx.put(v.zh, word)
        })
        logger.info(`Nyx(含任务类型/派系):${libs.Nyx.size()}`)
    } catch (e) {
        logger.error(`加载任务类型/派系词库失败，该批词回退英文: ${(e && e.message) || e}`)
    }

    // 本地人工维护的小词表：世界状态输出常用、但 DE 导出和 NyxBot 都缺的专有名词
    // （集团名/Boss/活动词/宝库组合包等）。只填空缺，不覆盖已有词条。
    // 源文件 utils/dict/wfExtraTerms.json，改词直接提交即可，无需拉取。
    try {
        const extraDict = require('./dict/wfExtraTerms.json')
        let filled = 0
        extraDict.forEach(v => {
            if (!v || !v.en || !v.zh) return
            if (libs.Nyx.get(v.en)) return
            libs.Nyx.put(v.en, { en: v.en, zh: v.zh })
            filled++
        })
        logger.info(`本地补充词条 ${filled} 条，Nyx:${libs.Nyx.size()}`)
    } catch (e) {
        logger.error(`加载本地补充词表失败: ${(e && e.message) || e}`)
    }

    // KingPrimes/DataSource 的三份补充表，索引方式各异，分别装载（见 dataSource/supplement.js）。
    // 三者独立 try，任一失败只影响自己那批词。
    try {
        const nodeDict = await dataSource.loadNodeDict()
        nodeDict.forEach(v => libs.NodeZh.put(v.key, { zh: v.zh, system: v.system }))
        logger.info(`NodeZh:${libs.NodeZh.size()}`)
    } catch (e) {
        logger.error(`加载节点补充词库失败: ${(e && e.message) || e}`)
    }

    try {
        const aliasDict = await dataSource.loadAliasDict()
        aliasDict.forEach(v => libs.Alias.put(v.key, v.zh))
        logger.info(`Alias:${libs.Alias.size()}`)
    } catch (e) {
        logger.error(`加载玩家黑话别名失败: ${(e && e.message) || e}`)
    }

    // state_translation 与 DE 导出同构（uniqueName -> 中文名），
    // 但主词库按英文名索引，这里只对已有英文名的条目补中文，避免塞入 uniqueName 污染查询。
    try {
        const stateDict = await dataSource.loadStateDict()
        let filled = 0
        stateDict.forEach(v => {
            const en = v.key.split('/').pop()
            if (!en || libs.Nyx.get(en)) return
            libs.Nyx.put(en, { en, zh: v.zh })
            filled++
        })
        logger.info(`state_translation 补充 ${filled} 条，Nyx:${libs.Nyx.size()}`)
    } catch (e) {
        logger.error(`加载自定义翻译补充失败: ${(e && e.message) || e}`)
    }

    // 从 schedule 缓存加载 browse.wf 补充词库，加入 Nyx 主词库
    try {
        const browseDict = commonMcache.get('BrowseDict') || {}
        if (Object.keys(browseDict).length > 0) {
            libs.BrowseDict = browseDict
            let filled = 0
            for (const [key, zh] of Object.entries(browseDict)) {
                const en = key.split('/').pop()
                if (en && !libs.Nyx.get(en)) {
                    libs.Nyx.put(en, { en, zh })
                    filled++
                }
            }
            logger.info(`BrowseDict:${Object.keys(browseDict).length} 条，补充 Nyx:${filled} 条`)
        }
    } catch (e) {
        logger.warn(`加载 BrowseDict 失败: ${(e && e.message) || e}`)
    }

    // 合并 WFCD 中文数据到 Nyx 主词库（活动/任务/派系/节点等）
    try {
        const wfcdZh = commonMcache.get('WfcdZh') || []
        if (Array.isArray(wfcdZh) && wfcdZh.length > 0) {
            let filled = 0
            for (const v of wfcdZh) {
                if (!v || !v.en || !v.zh) continue
                const en = v.en
                const zh = String(v.zh)
                const existing = libs.Nyx.get(en)
                if (!existing) {
                    libs.Nyx.put(en, { en, zh })
                    filled++
                } else if (!existing.zh || existing.zh === existing.en) {
                    existing.zh = zh
                    filled++
                }
            }
            logger.info(`WfcdZh 合并 Nyx:${filled} 条，Nyx 总数:${libs.Nyx.size()}`)
        }
    } catch (e) {
        logger.warn(`合并 WFCD 词库失败: ${(e && e.message) || e}`)
    }
    // 合并官方中文数据到 Nyx 主词库（DE Public Export，优先级最高）
    try {
        const officialZh = commonMcache.get('OfficialZh') || []
        if (Array.isArray(officialZh) && officialZh.length > 0) {
            let filled = 0
            for (const v of officialZh) {
                if (!v || !v.en || !v.zh) continue
                const en = v.en
                const zh = String(v.zh)
                const existing = libs.Nyx.get(en)
                if (!existing) {
                    libs.Nyx.put(en, { en, zh })
                    filled++
                } else if (!existing.zh || existing.zh === existing.en) {
                    existing.zh = zh
                    filled++
                }
            }
            logger.info(`OfficialZh 合并 Nyx:${filled} 条，Nyx 总数:${libs.Nyx.size()}`)
        }
    } catch (e) {
        logger.warn(`合并官方中文词库失败: ${(e && e.message) || e}`)
    }



    // wmr2rma()
    wmr2rma()

    // wm 常规物品的数据创建
    commonMcache.get('items').forEach((value_, index_) => {
        libs['wm'].put(value_.en, value_);
        value_.en !== value_.zh && libs['wm'].put(value_.zh, value_);
    });
    commonMcache.get('riven_attributes').forEach(v => {
        rm_name = commonMcache.get('wmr2rma')[v.url_name]
        libs.riven_attributes.put(v.url_name,{...v,rm_name})
    })
    commonMcache.get('ephemeras').forEach(v => {
        libs.ephemeras.put(v.element,v)
    })
    wmLibArr.forEach( libName => {
        commonMcache.get(libName).forEach((value_, index_) => {
            libs[libName].put(value_.en, value_);
            value_.en !== value_.zh && libs[libName].put(value_.zh, value_);
        });
    })
    wmLibURLArr.forEach( libName => {
        commonMcache.get(libName).forEach((value_) => {
            libs[libName].put(value_.url_name, value_);
        });
    })

    // WM 的紫卡武器词库 => lib.wmRiven
    commonMcache.get('riven_items').forEach((value_, index_) => {
        libs.wmRiven.put(value_.en,value_)
        value_.en !== value_.zh && libs.wmRiven.put(value_.zh, value_);
    })

    //加载黑话（本质是根据用户黑话对具体商品的映射，从wm数据复制了新的zh=>en关系的对象，此功能着重针对Prime Set
    initCustomLib()

    logger.info("wmRiven: "+libs.wmRiven.size())
}

//这是一段黑话植入代码，目前仅针对Prime Set
let initCustomLib = () => {
    let sale = commonMcache.get('items')
    let customSale = customDict.map(
        da => sale.filter( db => db.en.toUpperCase().includes(da.en.toUpperCase()) )
            .map( db => { return { ...db,customZh: db.zh.toUpperCase().replace(da.en,da.zh),custom:da.zh}})
    ).flatMap(v => v)
    customSale.forEach(value_ => {
        libs['wm'].put(value_.customZh, value_);
    })
}

//将wmr的attr转换为rm的，节省字数
let wmr2rma = () =>{
    let wmr2rmaMap = {}
    Object.keys(WmRivenAttribute)
        .map(key => { 
                return {url_name:key,rm_name:statsName[WmRivenAttribute[key]]}
            }
        )
        .forEach(v => wmr2rmaMap[v.url_name] = v.rm_name )
    commonMcache.put('wmr2rma',wmr2rmaMap)
}

//请谨慎使用这两段傻逼代码，如果我没记错的话，会从wm爬一堆物品相关json下来存文件夹里，如果你不做离线化，不建议搞
let lexiconLoad = async () => {
    logger.info(`[load items] - start`)
    let items = await wmApi.items();
    await utils.createDirIfNotExist(lexiconPath)
    logger.info(`[load items] - size:${items.length}`)
    for(let index in items){
        let itemName = items[index]['url_name']
        let file = lexiconPath+itemName+'.json'
        if(!fs.existsSync(file)){
            try{
                logger.info(`[load items] - item:${itemName} - start`)
                let json = await wmApi.item(itemName)
                await utils.writeJsonFile(file,json)
            }catch (e){
                logger.error(`[load items] - item:${itemName} - Error! ${e}`)
            }finally {
                logger.info(`[load items] - item:${itemName} - end`)
                await utils.delay(2000)
            }
        }
    }
    logger.info(`[load items] - end`)
}
let lexiconList = async () => {
    await utils.createDirIfNotExist(lexiconPath)
    let jsonList = await utils.readFileList(lexiconPath)
    let resList = []
    for(let item in jsonList){
        let file = lexiconPath + jsonList[item]
        try{
            let json = await utils.readJsonFile(file)
            if(json['items_in_set']){
                resList = resList.concat(json['items_in_set'])
            }
        }catch (e){
            logger.error(`[read items] - item:${jsonList[item]} - Error! ${e}`)
        }
    }
    return distinct(resList,v => v['url_name'])
}
let distinct = (arr,apply) => {
    return arr.filter( (v,i,a) => a.map(item => apply(item)).indexOf(apply(v)) === i)
}

module.exports = {
    libs,
    commonMcache,
    initLibsCache,
    lexiconLoad,
    lexiconList
};
