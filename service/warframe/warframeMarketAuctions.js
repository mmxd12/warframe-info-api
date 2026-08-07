const moment = require('moment');
const wmApi = require('../../api/warframeMarket')
const utils = require('../../utils/utils');
const wfaLibs = require('../../utils/wfaLibs');
const tran = require('../../utils/translate');

// 词条匹配：从中文/英文关键词找到 url_name
const matchAttribute = keyword => {
    const kw = keyword.trim().toLowerCase()
    const lib = wfaLibs.libs.riven_attributes
    for (const url_name of lib.keys()) {
        const attr = lib.get(url_name) || {}
        const zh = (attr.zh || '').toLowerCase()
        const en = (attr.en || '').toLowerCase()
        const rm = (attr.rm_name || '').toLowerCase()
        if (zh.includes(kw) || en.includes(kw) || rm.includes(kw) || url_name.includes(kw)) {
            return url_name
        }
    }
    return null
}


const warframeMarketAuctions = {
    getInfo: async function (name, baseType = 'riven', page = 1, size = 10) {
        const isRiven = baseType === 'riven'
        
        // 解析输入：武器名 + 词条关键词（空格分隔）
        // 例："食人女魔 弹匣 投射物速度 负后坐力" -> weapon="食人女魔", positives=["magazine_capacity","projectile_speed"], negatives=["recoil"]
        const parts = (name || '').trim().split(/\s+/)
        const weaponName = parts[0] || ''
        const keywords = parts.slice(1)
        
        // 解析正面和负面词条
        const positives = [], negatives = []
        for (const kw of keywords) {
            if (kw.startsWith('负') && kw.length > 1) {
                const neg = matchAttribute(kw.slice(1))
                neg && negatives.push(neg)
            } else if (kw === '负任意' || kw === '负面任意') {
                // "负任意" 不传参数，服务端会返回所有带负面的
                continue
            } else {
                const pos = matchAttribute(kw)
                pos && positives.push(pos)
            }
        }
        
        const objs = isRiven ? 
            utils.getSaleWordFromLib(tran.resolveAlias(weaponName) || weaponName, wfaLibs.libs.wmRiven) : 
            utils.getSaleWordFromLib(tran.resolveAlias(weaponName) || weaponName, wfaLibs.libs.auctionsWeapons)
            
        if(objs.length > 0){
            const obj = isRiven ? wfaLibs.libs.wmRiven.get(objs[0].key) : wfaLibs.libs.auctionsWeapons.get(objs[0].key);
            const type = isRiven ? baseType : obj.type
            
            // 服务端过滤
            let list = await wmApi.auctionsSearch(type, obj.url_name, positives, negatives)
            
            return {
                type,
                name,
                page,
                size,
                total: list.length,
                word: obj,
                words: objs.slice(1, 11),
                seller: list.slice((page - 1) * size, page * size),
                filterApplied: (positives.length > 0 || negatives.length > 0) ? { positives, negatives } : null
            }
        }
        return {
            name: name,
            word: null,
            words: [],
            seller: []
        };
    },
    rivenFormatStr: function(info){
        let en_name = info.word.en ?? info.word.zh
        let res = `从Warframe.Market查询到'${info.word.zh ?? info.word.en} [${info.word.url_name}]'的紫卡信息(截取价格最低前5条):\n\n`;
        info.seller.forEach(((value, index) => {
            res+= `${en_name} ${value.item.name} `
            res+= value.is_direct_sell ? `(一口价:${value.starting_price}p)` : `(底价:${value.starting_price}->现价:${value.buyout_price}p)`
            res+= ` ${age(value.created)}\n`
            res+= value.item.re_rolls+'洗 '+value.item.mod_rank+'级 段位'+value.item.mastery_level+'\n';
            value.item.attributes.forEach(attr => {
                let attrDict = wfaLibs.libs.riven_attributes.get(attr.url_name)
                let unit = attrDict.units === 'multiply' ? 'x' 
                    : attrDict.units === 'percent' ? '%' 
                    : ''
                res += `\t ${attrDict.rm_name??attrDict.zh??attr.url_name}:${attr.value}${unit}\n`
            })
            res+= `id:${value.owner.ingame_name} (${value.platform})[${value.owner.status}]\n\n`
        }));
        info.words.length >0 && (res += `你可能还想查：${info.words.map(v=>v.key).join('\n')}`);
        return res;
    },
    weaponFormatStr: function(info){
        let res = `从Warframe.Market查询到'${info.word.zh ?? info.word.en} [${info.word.url_name}]'的玄骸信息(截取价格最低前5条):\n\n`;
        info.seller.forEach(((value, index) => {
            res+= `${element2emoji(value.item.element)} ${value.item.damage}% ${value.item.having_ephemera? wfaLibs.libs.ephemeras.get(value.item.element).zh :''}\n`
            res+= value.is_direct_sell ? `(一口价:${value.starting_price}p)` : `(底价:${value.starting_price}->现价:${value.buyout_price}p)`
            res+= `${age(value.created)}\n`
            res+= `id:${value.owner.ingame_name} (${value.platform})[${value.owner.status}]\n\n`
        }));
        info.words.length >0 && (res += `你可能还想查：${info.words.map(v=>v.key).join('\n')}`);
        return res;
    }
}

let age = (created) => {
    let createdTime = moment.parseZone(created)
    let mss = moment().utc().diff(createdTime)
    const days = parseInt(mss / (1000 * 60 * 60 * 24));
    if(days < 1)            return '<1天'
    else if(days < 3)       return '<3天'
    else if(days < 7)       return '>3天'
    else if(days < 30)      return '>1周'
    else if(days < 365)     return '>1月'
    else                    return '>1年'
}

let element2emoji = (element) => {
    switch(element){
        case 'cold'         : return "❄️"
        case 'electricity'  : return "⚡"
        case 'heat'         : return "🔥"
        case 'impact'       : return "🔨"
        case 'magnetic'     : return "🧲"
        case 'radiation'    : return "☢️"
        case 'toxin'        : return "☠️"
    }
}

module.exports = warframeMarketAuctions
