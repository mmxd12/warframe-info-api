const wfaLibs = require('./wfaLibs');
const { translate } = require('@vitalets/google-translate-api');
const utils = require("./utils");
const logger = require('./logger')(__filename)
const translateApi = {
    translateByCache:function (original) {
        if(original)
        {
            //防止过度翻译
            if(isNode(original)){
                return preRegExpTest(original);
            }
            return getSearchStr(original,getCache);
        }
        return null;
    },
    // 整词翻译：只按完整英文名查词库，查不到返回 null。
    // 与 translateByCache 的区别是不做逐词/子串替换，适合武器、战甲这类
    // 专有名词——子串替换会把 "Nami Solo" 这种词组拆散或半译。
    translateWord: function (word) {
        if (!word) return null;
        const zh = lookupZh(word);
        if (zh) return zh;
        // 黑话兜底：磁妹 -> Mag -> 麦格（若词库有官方英文名）
        const en = wfaLibs.libs.Alias.get(word);
        if (en && en !== word) return lookupZh(en);
        return null;
    },
    // 黑话映射：玩家黑话（水男/奶爸/磁妹）-> 官方英文名（Hydroid/Oberon/Mag）。
    // 词库按官方英文名索引，黑话只做一次跳板；查不到返回 null。
    resolveAlias: function (input) {
        if (!input) return null;
        const en = wfaLibs.libs.Alias.get(input);
        return en && en !== input ? en : null;
    },
    googleTranslate: function (original, from = 'en') {
        return new Promise((resolve, reject) => {
            translate(original,{from: from, to:'zh-cn'})
                .then( res => resolve(res.text))
                .catch( err => {
                    console.error( err )
                    resolve(original)
                })
        })
    },
    fuzzTran: function (input, libRange = [],max = 10) {
        let _key = utils.formatter(input)
        let libArray = Object.keys(wfaLibs.libs)
            .filter(lib => !['rw', 'rd', 'Alias'].includes(lib))
            // BrowseDict 等词库是普通对象（没有 mcache 的 keys()），
            // 混进来会让 getSaleWordFromLib 抛 TypeError，整个 /dict 返回 500。
            .filter(lib => wfaLibs.libs[lib] && typeof wfaLibs.libs[lib].keys === 'function')
            .filter(lib => !libRange.length > 0 || libRange.includes(lib))
        logger.info(`translate lib range: ${libArray}`)
        return libArray
            .map(lib => utils.getSaleWordFromLib(_key, wfaLibs.libs[lib])
                .map(v => {
                    return normalizeWord({...v, ...wfaLibs.libs[lib].get(v.key), lib})
                }))
            .flatMap(v => v)
            .filter((v, i, arr) => i === arr.map(_v => _v.en).indexOf(v.en))
            .filter((v, i, arr) => !v.main || i === arr.map(_v => _v.main).indexOf(v.main))
            .sort((a, b) => b.acc - a.acc)
            .slice(0,max)
    }
};

// 整词查中文名。Nyx/Dict/wm 是 {en,zh} 结构；wmRiven/auctionsWeapons 只有 i18n，
// 武器名（鳄神/Sobek、赤毒·鳄神）只在后两个词库里，所以要一起兜底。
function lookupZh(word) {
    const flat = wfaLibs.libs.Nyx.get(word) || wfaLibs.libs.Dict.get(word) || wfaLibs.libs.wm.get(word)
    if (flat && flat.zh) return flat.zh
    for (const lib of ['wmRiven', 'auctionsWeapons', 'ephemeras', 'quirks']) {
        const cache = wfaLibs.libs[lib]
        if (!cache || typeof cache.get !== 'function') continue
        const hit = cache.get(word)
        const name = hit && hit.i18n && hit.i18n['zh-hans'] && hit.i18n['zh-hans'].name
        if (name) return name
    }
    return null
}

// wm 系词库（wmRiven/auctionsWeapons/ephemeras…）只有 i18n 结构，没有顶层 en/zh，
// 会被 fuzzTran 的 en 去重当成 undefined 折叠掉。这里补齐 en/zh，
// 让 /dict/鳄神 这类武器名也能命中 wmr 的翻译。
function normalizeWord(v) {
    if (!v) return v
    if (!v.en || !v.zh) {
        const i18n = v.i18n || {}
        const en = v.en || (i18n.en && i18n.en.name) || v.slug || v.key
        const zh = v.zh || (i18n['zh-hans'] && i18n['zh-hans'].name) || v.key
        return {...v, en, zh}
    }
    return v
}

function getSearchStr(original,getCache){
    const stringArray = original.split(/\\n| /);//.split(' ');   //.match(/\w+|\S/g);   //.split(/\W+/);
    if(stringArray.length === 0)
    {
        logger.info('original.length === 0 !!');
        return original;
    }
    let resArr = [], start = 0, max = stringArray.length;
    outside:
    for(;start<max;start++)
    {
        for(let end=max; start<end; end--){
            const data = getCache(getStringByArray(stringArray, start, end));
            if(data.cache){
                const result = data.prefix + data.cache.zh + data.suffix;
                resArr.push(regExpTest(result));
                start = end-1;
                continue outside;
            }
        }
        if(start<max)
        resArr.push(regExpTest(stringArray[start]));
    }
    return resArr.join(' ');
}

//在这里可以做一些格式化，使用正则处理 对翻译不充分做处理
function regExpTest(result) {
    // /\d+cr$/.test('') 判断星币
    result = /\d+cr$/.test(result)?result.replace(/cr$/,'星币'):result;
    result = /Only$/.test(result)?result.replace(/Only$/,'限定'):result;
    return result;
}

function isNode(input) {
    return /^[a-zA-Z]+ \([a-zA-Z]+\)$/.test(input) || /^[a-zA-Z]+ [a-zA-Z]+ \([a-zA-Z]+\)$/.test(input);
}

function preRegExpTest (input) {
    // 先查完整节点名（字典 key 不带末尾的 )，因为 getCache 会自动去掉）
    const fullMatch = getCache(input);
    if (fullMatch.cache) {
        const result = fullMatch.prefix + fullMatch.cache.zh + fullMatch.suffix;
        // 避免重复括号（suffix 是 )，zh 如果带 ) 就重复了）
        // 取个巧：zh 不带末尾 )，由 suffix 补上
        return result;
    }
    // 回退到只翻译区域
    const prefix = input.replace(/\([a-zA-Z]+\)$/, '');
    const plant = input.match(/\([a-zA-Z]+\)$/).join('');
    return prefix + getSearchStr(plant,getCache);
}

function getStringByArray(arr,start,end){
    // logger.info(arr.slice(start,end).join(' '));
    return arr.slice(start,end).join(' ');
}

function getCache(key){
    /** 去除首尾特殊符号 **/
    const searchKy = key.replace(/^[^a-zA-Z0-9\s]+/, '').replace(/[^a-zA-Z0-9\s]+$/, '');
    /** 保存首尾特殊符号用于还原 **/
    const prefix = key.match(/^[^a-zA-Z0-9\s]+/);
    const suffix = key.match(/[^a-zA-Z0-9\s]+$/);
    /** 查缓存：Nyx（KingPrimes/DataSource 现行中文词库）优先，WFA 词库停更内容作长尾兜底 **/
    const cache = wfaLibs.libs.Nyx.get(searchKy) || wfaLibs.libs.Dict.get(searchKy) || wfaLibs.libs.Invasion.get(searchKy) || wfaLibs.libs.NightWave.get(searchKy) || wfaLibs.libs.wm.get(searchKy);
    return {
        cache:cache,
        prefix : prefix?prefix.join(''):'',
        suffix : suffix?suffix.join(''):''
    };
}

//万用翻译


module.exports = translateApi;
