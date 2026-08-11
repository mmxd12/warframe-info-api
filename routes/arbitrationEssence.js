const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// 精华表数据
const ESSENCE_TABLE = {
  "V Prime": 350, "V Prime (金星)": 350,
  "Tycho": 320, "Tycho (月球)": 320,
  "Gabii": 300, "Gabii (谷神星)": 300,
  "Hyf": 350, "Hyf (火卫二)": 350,
  "光理塔": 360, "光理塔 (虚空)": 360,
  "Larzac": 300, "Larzac (欧罗巴)": 300,
  "Tyana Pass": 480, "Tyana Pass (火星)": 480,
  "Rhea": 240, "Rhea (土星)": 240,
  "Oestrus": 360, "Oestrus (冥王星)": 360,
  "Ose": 360, "Ose (阋神星)": 360,
  "Casta": 300, "Casta (鸟神星)": 300,
  "Kappa": 300, "Kappa (赛德娜)": 300,
  "Odin": 280, "Odin (阋神星)": 280,
  "Seimeni": 300, "Seimeni (谷神星)": 300,
  "Cinxia": 300, "Cinxia (阋神星)": 300,
  "Callisto": 480, "Callisto (木卫二)": 480,
  "Gaia": 300, "Gaia (地球)": 300,
  "Lares": 300, "Lares (水星)": 300,
};

// 匹配节点名的精华数量
function getEssence(node) {
  if (!node) return null;
  // 直接匹配
  if (ESSENCE_TABLE[node]) return ESSENCE_TABLE[node];
  // 去掉星球名后匹配
  const clean = node.replace(/[（(].*?[）)]/, '');
  if (ESSENCE_TABLE[clean]) return ESSENCE_TABLE[clean];
  // 部分匹配
  for (const key in ESSENCE_TABLE) {
    if (node.includes(key) || key.includes(node)) {
      return ESSENCE_TABLE[key];
    }
  }
  return null;
}

// 获取精华品质
function getQuality(essence) {
  if (!essence) return 'N/A';
  if (essence >= 400) return 'S';
  if (essence >= 350) return 'B';
  if (essence >= 300) return 'C';
  if (essence >= 250) return 'B';
  return 'D';
}

/* GET 精华表 - 显示未来N条仲裁的精华数量 */
router.get('/:days?', function(req, res) {
  const days = parseInt(req.params.days) || 7;
  
  // 从 Nyxbot 数据源获取仲裁排期
  const ARBYS_URL = 'https://wf.555590.xyz/api/arbys?days=' + days;
  
  // 如果 Nyxbot 不可用，尝试其他数据源
  const fallbackUrl = 'https://wf.555590.xyz/api/arbys?days=' + days;
  
  require('http').get(fallbackUrl, (fRes) => {
    let data = '';
    fRes.on('data', chunk => data += chunk);
    fRes.on('end', () => {
      try {
        const arbitations = JSON.parse(data);
        const result = arbitations.map(item => {
          const essence = getEssence(item.node);
          const quality = getQuality(essence);
          return {
            id: item.id,
            node: item.node,
            missionType: item.missionType,
            enemy: item.enemy,
            activation: item.activation,
            expiry: item.expiry,
            essence: essence,
            quality: quality,
            eta: item.eta
          };
        });
        res.json({ success: true, data: result });
      } catch (e) {
        res.json({ success: false, error: '数据获取失败', data: [] });
      }
    });
  }).on('error', (e) => {
    // 如果 Nyxbot 不可用，返回空的精华表
    res.json({ success: true, data: [], tip: '仲裁精华表数据源暂时不可用，请稍后再试' });
  });
});

module.exports = router;
