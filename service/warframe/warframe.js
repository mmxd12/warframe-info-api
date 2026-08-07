const tran = require('../../utils/translate');
const utils = require('../../utils/utils');
const logger = require('../../utils/logger')(__filename)
const archimedeaTerms = require('../../utils/dict/archimedeaTerms.json');
// 术语表转成小写键 Map，查表时大小写不敏感（跳过 _comment 说明字段）
const archimedeaZh = new Map(
    Object.entries(archimedeaTerms)
        .filter(([k]) => !k.startsWith('_'))
        .map(([k, v]) => [k.replace(/\s+/g, ' ').trim().toLowerCase(), v])
);

const timeout = 24 * 60 * 60 * 1000;

const warframe = {
    getInfo:function (type = 'alerts',orginInfo) {
        switch (type) {
            case "timestamp":
                return utils.apiTimeUtil(orginInfo);
            case "news":
                return newsFormat(orginInfo);
            case "events":
                return eventsFormat(orginInfo);
            case "alerts":
                return alertsFormat(orginInfo);
            case "sortie":
                return sortieFormat(orginInfo);
            case "syndicateMissions":
                return syndicateMissionsFormat(orginInfo);
            // 三处赏金是 syndicateMissions 的过滤视图，取数时用的是父类型，
            // 这里按集团名筛出对应的一条，避免落到 default 返回整包未过滤数据。
            case "Ostrons":
            case "Entrati":
                return syndicateFilter(syndicateMissionsFormat(orginInfo), type);
            case "Solaris":
                return syndicateFilter(syndicateMissionsFormat(orginInfo), 'Solaris United');
            case "EntratiSyndicate":
                return syndicateFilter(syndicateMissionsFormat(orginInfo), 'Entrati');
            case "fissures":
                return fissuresFormat(orginInfo);
            case "flashSales":
                return flashSalesFormat(orginInfo);
            case "invasions":
                return invasionsFormat(orginInfo);
            case "voidTrader":
                return voidTraderFormat(orginInfo);
            case "voidTraders":
                return (Array.isArray(orginInfo) ? orginInfo : []).map(voidTraderFormat);
            case "vaultTrader":
                return voidTraderFormat(orginInfo);
            case "dailyDeals":
                return dailyDealsFormat(orginInfo);
            case "persistentEnemies":
                return persistentEnemiesFormat(orginInfo);
            case "steelPath":
                return steelPathFormat(orginInfo);
            case "archonHunt":
                return archonHuntFormat(orginInfo);
            case "simaris":
                return simarisFormat(orginInfo);
            case "sentientOutposts":
                return sentientOutpostsFormat(orginInfo);
            case "clanWeeklyInitiative":
                return clanWeeklyInitiativeFormat(orginInfo);
            case "globalUpgrades":
                return globalUpgradesFormat(orginInfo);
            case "conclaveChallenges":
                return conclaveChallengesFormat(orginInfo);
            case "earthCycle":
            case "cetusCycle":
            case "cambionCycle":
            case "vallisCycle":
            case "zarimanCycle":
                return cycleFormat(orginInfo);
            case "nightwave":
                return nightwaveFormat(orginInfo);
            case "duviriCycle":
                return duviriCycleFormat(orginInfo);
            // 灵化（Incarnon）轮换 = 钢铁之路回环的每周奖励，普通回环给战甲。
            // 两者都是 duviriCycle.choices 的过滤视图。
            case "duviriCycle:hard":
                return circuitFilter(duviriCycleFormat(orginInfo), 'hard');
            case "duviriCycle:normal":
                return circuitFilter(duviriCycleFormat(orginInfo), 'normal');
            case "archimedeas":
                return archimedeaFormat(orginInfo);
            // 深层科研/时光科研 是 archimedeas 的过滤视图，按 typeKey 筛。
            case "archimedeas:CT_LAB":
                return archimedeaFilter(archimedeaFormat(orginInfo), 'CT_LAB');
            case "archimedeas:CT_HEX":
                return archimedeaFilter(archimedeaFormat(orginInfo), 'CT_HEX');
            case "arbitration":
                return arbitrationFormat(orginInfo);
            case "calendar":
                return calendarFormat(orginInfo);
            case "weeklyChallenges":
            case "twitter":
            case "darkSectors":
            case "constructionProgress":
            default:
                return orginInfo;
        }
    }
};

function alertsFormat(body){
    body.forEach(function (value) {
        //剩余时间格式化
        value.eta = utils.timeDiff(null,value.expiry);
        value.mission.description = tran.translateByCache(value.mission.description);
        value.mission.reward.asString = tran.translateByCache(value.mission.reward.asString);
        value.mission.node = tran.translateByCache(value.mission.node);
        value.mission.type = tran.translateByCache(value.mission.type);
        // 派系：Grineer/Corpus 国服惯例保留英文，Orokin/低语者有官方译名
        value.mission.faction = tran.translateByCache(value.mission.faction);
    });
    return body;
}

function nightwaveFormat(body){
    if(body){
        (body.activeChallenges || []).forEach(function (value) {
            value.title = tran.translateByCache(value.title);
            value.desc = tran.translateByCache(value.desc);
            value.eta = utils.timeDiff(null,value.expiry);
        });
        return body;
    } else {
        return {};
    }

}

function arbitrationFormat(body){
    body.node = tran.translateByCache(body.node);
    body.eta = utils.timeDiff(null,body.expiry);
    body.type = tran.translateByCache(body.type);
    return body;
}

function sortieFormat(body){
    body.boss = tran.translateByCache(body.boss);
    body.eta = utils.timeDiff(null,body.expiry);
    body.variants.forEach(function (value) {
        Object.keys(value).forEach(function (val) {
            value[val] = tran.translateByCache(value[val])
        });
    });
    return body;
}

function eventsFormat(body){
    return utils.cacheUtil( 'events_key', async () => {
        for (let value of body) {
            value.description = tran.translateByCache(value.description);
            logger.info(tran.translateByCache(value.tooltip));
            value.tooltip = tran.translateByCache(value.tooltip);
            value.node = tran.translateByCache(value.node);
            value.victimNode = tran.translateByCache(value.victimNode);
            for (let val of (value.rewards || [])) {
                val.asString = tran.translateByCache(val.asString);
                val.itemString = tran.translateByCache(val.itemString);
            }
            for (let val of (value.interimSteps || [])) {
                if (val.reward) {
                    val.reward.asString = tran.translateByCache(val.reward.asString);
                    val.reward.itemString = tran.translateByCache(val.reward.itemString);
                }
            }
            value.eta = utils.timeDiff(null, value.expiry);

        }
        return body;
    }, timeout);
}

function newsFormat(body) {
    return utils.cacheUtil( 'news_key', async () => {
        for (let value of body) {
            if (value.translations.zh) {
                value.message = value.translations.zh
            } else {
                const language = Object.keys(value.translations)[0];
                logger.info(language, value.translations[language]);
                const tranRes = tran.translateByCache(value.translations[language]);
                logger.info(tranRes);
                value.message = tranRes;
            }
            value.eta = utils.timeDiff(null, value.date);
        }
        return body;
    }, timeout);
}

function syndicateMissionsFormat(body){
    body.forEach(function (value) {
        value.eta = utils.timeDiff(null,value.expiry);
        value.syndicateZh = tran.translateByCache(value.syndicate);
        value.nodes.forEach(function (node,index) {
            value.nodes[index] = tran.translateByCache(node);
        });
        value.jobs.forEach(function (job) {
            // rewardPool 已由 bountyRewards.js 从 KingPrimes/DataSource 取到中文成品，无需再翻译
            job.type = tran.translateByCache(job.type);
        })
    });
    return body;
}

// 按集团名从 syndicateMissions 里挑出一条（地球/金星/火卫二赏金共用一份数据源）
function syndicateFilter(body, syndicate){
    const target = (body || []).find(v => v.syndicate === syndicate);
    return target || { error: `未找到集团任务：${syndicate}` };
}

function fissuresFormat(body){
    body.forEach(function (value) {
        value.eta = utils.timeDiff(null,value.expiry);
        value.node = tran.translateByCache(value.node);
        value.missionType = tran.translateByCache(value.missionType);
        value.tier = tran.translateByCache(value.tier);
        // 派系保留英文（国服惯例），Orokin/低语者等有官方译名
        value.enemy = tran.translateByCache(value.enemy);
    });
    return body
}

function flashSalesFormat(body){
    body.forEach(function (value) {
        value.item = tran.translateByCache(value.item);
        value.eta = utils.timeDiff(null,value.expiry);
    });
    return body;
}

function invasionsFormat(body){
    let resArr = [];
    body.forEach(function (value) {
        if(!value.completed)
        {
            value.node = tran.translateByCache(value.node);
            value.desc = tran.translateByCache(value.desc);
            // 赤毒/玄骸入侵的奖励侧可能是 null，不能直接读 asString
            if (value.attackerReward)
                value.attackerReward.asString = tran.translateByCache(value.attackerReward.asString);
            if (value.defenderReward)
                value.defenderReward.asString = tran.translateByCache(value.defenderReward.asString);
            value.eta = utils.timeDiff(null,value.activation);
            resArr.push(value);
        }
    });
    return resArr;
}

function voidTraderFormat(body){
    body.character = tran.translateByCache(body.character);
    body.location = tran.translateByCache(body.location);
    body.startString = utils.timeDiff(null,body.activation);
    body.endString = utils.timeDiff(null,body.expiry);
    body.activation = utils.apiTimeUtil(body.activation).localTime;
    body.expiry = utils.apiTimeUtil(body.expiry).localTime;
    body.inventory.forEach(function (value) {
        // 宝库组合包名（如 "M P V Revenant Prime Single Pack"）先归一化多余空格，
        // 再用词库做子串替换（Single Pack -> 单组合包 等）
        value.item = tran.translateByCache(String(value.item || '').replace(/\s+/g, ' ').trim());
    });
    return body;
}

function dailyDealsFormat(body){
    body.forEach(function (value) {
        value.item = tran.translateByCache(value.item);
        value.eta = utils.timeDiff(null,value.expiry);
    });
    return body
}

function persistentEnemiesFormat(body) {
    body.forEach(function (value) {
        value.agentType = tran.translateByCache(value.agentType);
        value.lastDiscoveredAt = tran.translateByCache(value.lastDiscoveredAt);
        value.lastDiscoveredTime = utils.timeDiff(null,value.lastDiscoveredTime);
    });
    return body
}

function cycleFormat(body){
    body.timeLeft = utils.timeDiff(null,body.expiry);
    !body.state && ( body.state = body.active ) ;
    return body;
}

// 1999 日历。中文名已由 api/warframestat/calendar.js 按 uniqueName 贴上（titleZh/descriptionZh/rewardZh），
// 这里只做展示层收尾：季节/事件类型的中文化，以及挑选出「当前及往后」的有效天数。
const CALENDAR_SEASON = { Spring: '春季', Summer: '夏季', Fall: '秋季', Autumn: '秋季', Winter: '冬季' };
// 解析器已把 CET_* 转成英文可读名，这里映射成中文
const CALENDAR_EVENT = {
    'To Do': '挑战',
    'Override': '增益',
    'Big Prize!': '奖励',
    'Plot': '剧情',
    'Story': '剧情'
};

function calendarFormat(body){
    if(!body) return body;
    body.seasonZh = CALENDAR_SEASON[body.season] || body.season;
    (body.days || []).forEach(function (day) {
        (day.events || []).forEach(function (ev) {
            ev.typeZh = CALENDAR_EVENT[ev.type] || ev.type;
            // 未收录的词条退回英文，保证字段始终有值，前端不必判空
            let target = ev.challenge || ev.upgrade;
            if(target)
            {
                !target.titleZh && ( target.titleZh = target.title );
                !target.descriptionZh && ( target.descriptionZh = target.description );
            }
            else if(ev.reward != null)
            {
                // 奖励是纯字符串，词库未命中时再试一次通用词库。
                // "2000 x Kuva" 这种带数量的整串查不到，拆出物品名单独译，数量原样保留。
                if(!ev.rewardZh)
                {
                    let m = /^([\d,]+)\s*x\s*(.+)$/.exec(String(ev.reward).trim());
                    ev.rewardZh = m
                        ? `${m[1]} x ${tran.translateByCache(m[2])}`
                        : tran.translateByCache(ev.reward);
                }
            }
        });
    });
    return body;
}


function archimedeaFormat(body) {
    if (!Array.isArray(body)) return body;
    // 这批术语 DE 官方导出和 WFA 词库都没有，用专用表整词翻译。
    // 表里没有的一律保留英文原文——不能走 translateByCache，
    // 那是子串替换，会把 "Necramech Influx" 糊成「殁世机甲 Influx」。
    // 大小写不敏感：官方数据里同一个词会出现 "Framecurse Syndrome" 和
    // "Framecurse syndrome" 两种写法，统一用小写键查表。
    const zh = v => {
        if (typeof v !== 'string' || !v) return v;
        return archimedeaZh.get(v.replace(/\s+/g, ' ').trim().toLowerCase()) || v;
    };
    body.forEach(a => {
        a.typeZh = /HEX/i.test(String(a.typeKey || a.type).replace(/\s+/g, ''))
            ? '时光科研' : '深层科研';
        (a.missions || []).forEach(m => {
            if (m.deviation) m.deviation.name = zh(m.deviation.name);
            (m.riskVariables || []).forEach(r => { r.name = zh(r.name); });
        });
        (a.personalModifiers || []).forEach(pm => { pm.name = zh(pm.name); });
    });
    return body;
}

function archimedeaFilter(body, targetTypeKey) {
    if (!Array.isArray(body)) return body;
    // 解析器会把 CT_LAB 美化成 "C T_ L A B"（大写字母前插空格），
    // 因此比较前统一去空格并转大写。
    const norm = v => String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
    const target = norm(targetTypeKey);
    const match = body.find(a => norm(a.typeKey) === target || norm(a.type) === target);
    return match ? [match] : { error: `未找到科研数据：${targetTypeKey}` };
}

// 双衍王境的螺旋情绪，2 小时一轮。和「回环每周轮换」不是一回事，别混用 expiry。
const DUVIRI_MOOD = { anger: '愤怒', envy: '嫉妒', fear: '恐惧', joy: '喜悦', sorrow: '悲伤' };
// worldState 的 EndlessXpChoices：normal = 普通回环给战甲，hard = 钢铁之路回环给灵化之源。
const CIRCUIT_CATEGORY = {
    normal: { zh: '双衍回环（普通）', reward: '战甲' },
    hard: { zh: '双衍回环（钢铁之路）', reward: '灵化之源' }
};

// 回环选项在 worldState 里是无空格驼峰（AckAndBrunt / NamiSolo），
// 而词库按官方英文名索引，所以要先还原空格，And 再还原成 &。
function circuitNameVariants(name) {
    const spaced = String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return [...new Set([String(name), spaced, spaced.replace(/ And /g, ' & ')])];
}

function circuitNameZh(name) {
    for (const v of circuitNameVariants(name)) {
        const zh = tran.translateWord(v);
        if (zh && zh !== v) return zh;
    }
    // 战甲名在国服客户端本身就保留英文，查不到属正常，返回带空格的英文原名。
    return circuitNameVariants(name).pop();
}

// 回环轮换每周一 00:00 UTC 重置，worldState 里没有这个时间，本地算。
function nextWeeklyReset(from = new Date()) {
    const d = new Date(from);
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();            // 0=周日, 1=周一
    d.setUTCDate(d.getUTCDate() + ((8 - day) % 7 || 7));
    return d.toISOString();
}

function duviriCycleFormat(body) {
    if (!body || typeof body !== 'object') return body;
    body.stateZh = DUVIRI_MOOD[String(body.state).toLowerCase()] || body.state;
    body.eta = utils.timeDiff(null, body.expiry);          // 情绪剩余时间
    body.rotationExpiry = nextWeeklyReset();
    body.rotationEta = utils.timeDiff(null, body.rotationExpiry);
    (body.choices || []).forEach(c => {
        const meta = CIRCUIT_CATEGORY[c.category] || {};
        c.categoryZh = meta.zh || c.category;
        c.rewardType = meta.reward || '';
        c.choicesZh = (c.choices || []).map(circuitNameZh);
    });
    return body;
}

function circuitFilter(body, category) {
    if (!body || !Array.isArray(body.choices)) return body;
    const hit = body.choices.find(c => c.category === category);
    if (!hit) return { error: `未找到回环轮换数据：${category}` };
    return {
        category: hit.category,
        categoryZh: hit.categoryZh,
        rewardType: hit.rewardType,
        expiry: body.rotationExpiry,
        eta: body.rotationEta,
        choices: hit.choices,
        choicesZh: hit.choicesZh
    };
}

// uniqueName 末段转可读英文：/Lotus/StoreItems/Types/Restoratives/SyndicateTeamEnergyTotem
// -> "Syndicate Team Energy Totem"，再走词库子串翻译。
function uniqueNameZh(uniqueName){
    if(!uniqueName) return uniqueName;
    const tail = String(uniqueName).split('/').pop()
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ');
    return tran.translateByCache(tail);
}

function steelPathFormat(body){
    if (body.currentReward && body.currentReward.name)
        body.currentReward.name = tran.translateByCache(body.currentReward.name);
    (body.rotation || []).forEach(function (v) {
        if (v && v.name) v.name = tran.translateByCache(v.name);
        if (v && v.reward) v.reward = tran.translateByCache(v.reward);
    });
    (body.evergreens || []).forEach(function (v) {
        if (v && v.name) v.name = tran.translateByCache(v.name);
    });
    return body;
}

function archonHuntFormat(body){
    body.boss = tran.translateByCache(body.boss);
    body.faction = tran.translateByCache(body.faction);
    body.rewardPool = tran.translateByCache(body.rewardPool);
    return body;
}

function simarisFormat(body){
    body.target = tran.translateByCache(body.target);
    return body;
}

function sentientOutpostsFormat(body){
    if (body && body.mission) {
        body.mission.node = tran.translateByCache(body.mission.node);
        body.mission.faction = tran.translateByCache(body.mission.faction);
        body.mission.type = tran.translateByCache(body.mission.type);
    }
    return body;
}

function clanWeeklyInitiativeFormat(body){
    body.bonusRegion = tran.translateByCache(body.bonusRegion);
    (body.rewwards || []).forEach(function (v) {
        if (v && v.Reward) v.Reward = uniqueNameZh(v.Reward);
    });
    return body;
}

function globalUpgradesFormat(body){
    body.forEach(function (value) {
        value.upgrade = tran.translateByCache(value.upgrade);
        value.operation = tran.translateByCache(value.operation);
    });
    return body;
}

function conclaveChallengesFormat(body){
    body.forEach(function (value) {
        value.mode = tran.translateByCache(value.mode);
        value.title = tran.translateByCache(value.title);
        value.description = tran.translateByCache(value.description);
    });
    return body;
}

module.exports = warframe;

