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
    // 有快照直接用，不重新拉取（重启秒开）
    // Setp 0:
    //  从schedule cache获取最新词库
            }
        }
    } catch (e) { /* 清理快照失败不影响启动 */ }
    // Setp 0:
    //  从schedule cache获取最新词库
    let library = await wf