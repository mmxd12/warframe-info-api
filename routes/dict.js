const express = require('express');
const tran = require("../utils/translate");
const logger = require('../utils/logger')(__filename)
const utils = require('../utils/utils');
const router = express.Router();
const wfaLibs = require('../utils/wfaLibs');

// 已加载词库列表
router.all(['/list', '/list/'],function (req,res) {
  res.json(Object.keys(wfaLibs.libs));
});

// 模糊搜索：/dict/关键词，可选 /dict/关键词/词库名1,词库名2
router.all(['/:key','/:key/:libs'],function (req,res) {
  const pathKey = utils.getParamFromReq(req,'key',true)
  const pathLibs = utils.getParamFromReq(req,'libs') ;
  const max = utils.getParamFromReq(req,'max') || 10 ;
  const libs = pathLibs ? pathLibs.split(',') : [];
  if(!pathKey)
    return res.send("参数错误");
  // 黑话直达：水男 -> Hydroid（词库按英文名索引，黑话只做跳板）
  const aliasEn = wfaLibs.libs.Alias.get(pathKey);
  const aliasHit = aliasEn ? [{
    key: pathKey,
    en: aliasEn,
    zh: tran.translateWord(aliasEn) || aliasEn,
    acc: 100,
    alias: true
  }] : [];
  let hits = aliasHit.concat(tran.fuzzTran(pathKey,libs,max));
  // 武器名（鳄神/Sobek）只存在于 wm 的紫卡/玄骸词库里，指定词库时不额外兜底。
  if(hits.length === 0 && libs.length === 0){
    hits = tran.fuzzTran(pathKey,['wmRiven','auctionsWeapons'],max);
    logger.info(`dict miss, fallback to wmr: ${pathKey} -> ${hits.length}`);
  }
  res.json(hits);
});

module.exports = router;
