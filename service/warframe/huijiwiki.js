// HTTP 层已统一迁到 utils/superagent.js（原生 fetch + undici 代理），
// superagent/superagent-proxy 已从依赖移除，这里改用同一套封装。
// 保持 { state, data:{ text } } 的返回形状不变，下游消费 .data.text 无需改动。
const { getText } = require('../../utils/superagent');
const cheerio = require('cheerio');

huijiwiki ={
    getInfo: async function (name, page = 1, size = 10) {
        return { url:getListUrl(name, page, size) }
        /*
            不再解析查询列表
        const res = await wikiHtml(getListUrl(name, page, size));
        if(res.state === 'success')
        {
            const obj = elementsToList(res.data.text);
            const data = {
                state: 'success',
                page: page,
                size: size,
                total: obj.total,
                wiki: obj.wikiList
            };
            if(obj.wikiList.length >0 ) {
                let wikiObj;
                obj.wikiList.forEach(value => {
                    if (value.title.toString().toLowerCase() === name.toString().toLowerCase()){
                        wikiObj = value;
                    }
                });
                wikiObj = wikiObj?wikiObj:obj.wikiList[0];
                data['detail'] = wikiObj;
            }
            return data;
        }
        else {
            return res;
        }*/
    },
    async getHtmlText(name) {
        const listInfo = await this.getInfo(name);
        if(listInfo.state === 'success' ){
            const data = listInfo.detail;
            const detailObj = await wikiHtml(data.url);
            if(detailObj.state === 'success')
            {
                data['html'] = elementsToText(detailObj.data.text)
            } else {
                data['html'] = "error";
            }
            return data;
        } else {
            return listInfo;
        }
    }
};

function getListUrl(name,page = 1, size = 10){
    const offset = (page - 1) * size;
    const search = encodeURIComponent(name);
    return 'https://warframe.huijiwiki.com/index.php?title=%E7%89%B9%E6%AE%8A:%E6%90%9C%E7%B4%A2&limit='+size+'&offset='+offset+'&profile=default&search='+search;
}
function getDetailUrl(url){
    return 'https://warframe.huijiwiki.com'+url;
}
function wikiHtml(wikiUrl){
    // getText 内部已带 UA 与代理调度
    return getText(wikiUrl)
        .then(text => ({ state: 'success', data: { text } }))
        .catch(err => ({ state: 'error', data: err }));
}
function elementsToText(text){
    const $ = cheerio.load(text);
    $('.mw-parser-output > table').last().remove();
    $('.mw-parser-output > div').attr('style','width:100%;text-align:center;').remove();
    return $('.mw-parser-output').first().text();//.replace(/[\n\t]+/g,'\n');
}
function elementsToList(text){
    const wikiList = [];
    const $ = cheerio.load(text);
    const total = parseInt($('.results-info').attr('data-mw-num-results-total'));
    $('.mw-search-results').find('li').each((index,value)=>{
        const e = $(value);
        const heading = e.find('.mw-search-result-heading > a');
        const result = e.find('.searchresult');
        const result_data = e.find('.mw-search-result-data');
        const wiki = {
            url: getDetailUrl(heading.attr('href')),
            title: heading.attr('title'),
            result: result.text(),
            result_data: result_data.text()
        };
        wikiList.push(wiki);
    });
    return {
        wikiList: wikiList,
        total: total
    };
}
module.exports = huijiwiki;
