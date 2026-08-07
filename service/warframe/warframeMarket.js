const wfaLibs = require('../../utils/wfaLibs');
const tran = require('../../utils/translate');
const utils = require('../../utils/utils');
const wmApi = require('../../api/warframeMarket')

const warframeMarket = {
    getInfo: async function (name, page = 1, size = 10) {
        const objs = utils.getSaleWordFromLib(tran.resolveAlias(name) || name, wfaLibs.libs.wm);
        if(objs.length > 0){
            const obj = wfaLibs.libs.wm.get(objs[0].key);
            const list = (await wmApi.orders(obj.code));
            return {
                name,
                page,
                size,
                total: list.size,
                word: obj,
                words: objs.slice(1, 11),
                statistics: (await wmApi.statistics(obj.code)).slice(-1)[0],
                seller: list.slice((page - 1) * size, page * size)
            }
        }
        return {
            name: name,
            word: null,
            words: [],
            seller: []
        };
    }
};

module.exports = warframeMarket;
