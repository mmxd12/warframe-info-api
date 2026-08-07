const express = require('express');
const router = express.Router();
const hjwiki = require('../service/warframe/huijiwiki');
const utils = require('../utils/utils');

// 灰机 wiki 搜索：/wiki/词条
router.all(['/:type', ''],async function (req,res) {
    const type = utils.getParamFromReq(req,'type',true)
    const page = utils.getParamFromReq(req,'page')
    const size = utils.getParamFromReq(req,'size')
    res.send(await hjwiki.getInfo(type,page,size));
});

module.exports = router;
