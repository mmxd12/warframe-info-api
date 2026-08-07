const express = require('express');
const router = express.Router();
const utils = require('../utils/utils');
const logger = require('../utils/logger')(__filename)
const warframeUtil = require('../service/warframe/warframe');
const schedule = require('../schedule/worldStateSchedule');
// 中文/别名 -> worldState key。查不到就把输入当成英文 key 原样使用，
// 因此 /wf/电波 和 /wf/nightwave 等价，中英文都能直接访问。
const typeAlias = require('../utils/dict/wfTypeAlias.json');

// 归一化用户输入：去空格、转小写后再查表。
// 别名表的键在启动时一并归一化，避免大小写/空格导致查不到。
const normalize = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '');
const aliasMap = (() => {
  const m = new Map();
  for (const [k, v] of Object.entries(typeAlias)) {
    if (k.startsWith('_')) continue;   // 跳过 _comment 之类的说明字段
    m.set(normalize(k), v);
  }
  return m;
})();

// 把用户输入解析成 worldState 字段名；未命中别名表时原样返回（即视作英文 key）
const resolveType = input => aliasMap.get(normalize(input)) || input;

/* GET home */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

// TEMP probe: 测试词库命中（已完成使命，删除）
// router.all('/_probe/:words', ...)

//获取分类
router.all('/list',function (req,res) {
  wfApi(null).then( ({ worldState }) => {
    const list = Object.keys(worldState);
    res.json({
      types: list,
      // 一并给出中文别名，方便调用方知道能用哪些中文词
      alias: Object.fromEntries([...aliasMap.entries()])
    });
  }).catch(e => {
    logger.error(e)
    res.json({error:"网络不畅"});
  });
});

router.all('/time',function (req,res) {
  wfApi('events').then( ({ data: body }) => {
    const time = utils.apiTimeUtil(body[0].expiry);
    res.json(time);
  }).catch(e => {
    logger.error(e)
    res.json({error:"网络不畅"});
  });
});

// 世界状态查询：/wf/电波、/wf/nightwave、/wf?type=电波 都可以。
// 统一返回中文化后的 json（原 /detail 的位置，但内容改为格式化后的数据）。
router.all(['/:type', ''],function (req,res) {
  const input = utils.getParamFromReq(req,'type',true)
  const type = resolveType(input);
  // 赏金三兄弟在数据上是 syndicateMissions 的过滤视图，取数用父类型
  const param = utils.testType(type);
  logger.info(`wf query: ${input} -> ${type}`);
  wfApi(param).then( ({ worldState, data: body }) => {
    if(body == null) {
      // worldState 里有这个键但值为 null：类型存在、当前未激活（如无赤毒任务），
      // 和"输入拼错/别名不存在"是两码事，分开提示。
      if (param && Object.prototype.hasOwnProperty.call(worldState, param))
        return res.json({ error: `当前无数据：${input}（该类型未激活）` });
      return res.json({error:`未知类型：${input}`});
    }
    const data = warframeUtil.getInfo(type, body);
    if (data instanceof Promise) {
      data.then(result => res.json(result)).catch(err => res.json(err))
    } else {
      res.json(data);
    }
  }).catch( e => {
    logger.error(e)
    res.json({error: "网络不畅"});
  })
});

let wfApi = (param) => new Promise(async (resolve, reject) => {
  let worldState = await schedule.getWorldStateCache(schedule);
  resolve({ worldState, data: param ? worldState[param] : worldState })
});
module.exports = router;
