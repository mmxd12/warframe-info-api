const express = require('express');
const router = express.Router();

// 仲裁精华表（节点 -> 精华/小时）
// 数据来源：Warframe 社区整理，部分节点待补充
const ESSENCE_TABLE = {
  // === S级 (≥400) ===
  "Tyana Pass": 480, "Tyana Pass (火星)": 480,
  "Callisto": 480, "Callisto (木星)": 480, "Callisto (木卫二)": 480,

  // === B级 (≥350) ===
  "光理塔": 360, "光理塔 (虚空)": 360,
  "Oestrus": 360, "Oestrus (阋神星)": 360, "Oestrus (冥王星)": 360,
  "Ose": 360, "Ose (欧罗巴)": 360, "Ose (阋神星)": 360,
  "V Prime": 350, "V Prime (金星)": 350,
  "Hyf": 350, "Hyf (火卫二)": 350,

  // === C级 (≥300) ===
  "Tycho": 320, "Tycho (月球)": 320,
  "Vana": 320, "Vell": 320, "Void": 320,
  "Casta": 300, "Casta (鸟神星)": 300, "Casta (谷神星)": 300,
  "Seimeni": 300, "Seimeni (谷神星)": 300,
  "Cinxia": 300, "Cinxia (阋神星)": 300,
  "Kappa": 300, "Kappa (赛德娜)": 300,
  "Lares": 300, "Lares (水星)": 300,
  "Gabii": 300, "Gabii (谷神星)": 300,
  "Gaia": 300, "Gaia (地球)": 300,
  "Larzac": 300, "Larzac (欧罗巴)": 300,
  "Stickney": 300, "Stickney (火卫一)": 300,
  "Olympus": 300, "Olympus (火星)": 300,
  "Helene": 300, "Helene (土星)": 300,
  "Hydron": 300, "Hydron (赛德娜)": 300,
  "Io": 300, "Io (木星)": 300,
  "Elara": 300, "Elara (木星)": 300,
  "Coba": 300, "Coba (地球)": 300,
  "Lith": 300, "Lith (地球)": 300,
  "Everest": 300, "Everest (地球)": 300,
  "Sinai": 300, "Sinai (火星)": 300,
  "Spear": 300, "Spear (火星)": 300,
  "Memphis": 300, "Memphis (火卫一)": 300,
  "Alator": 300, "Alator (火卫一)": 300,
  "Tessera": 300, "Tessera (金星)": 300,
  "Romula": 300, "Romula (金星)": 300,
  "Malva": 300, "Malva (金星)": 300,
  "Zabala": 300, "Zabala (阋神星)": 300,
  "Xini": 300, "Xini (阋神星)": 300,
  "Acacia": 300, "Acacia (阋神星)": 300,
  "Akkad": 300, "Akkad (阋神星)": 300,
  "Kelashin": 300, "Kelashin (水星)": 300,
  "Augustus": 300, "Augustus (水星)": 300,
  "Valefor": 300, "Valefor (水星)": 300,
  "Sangeru": 300, "Sangeru (火卫二)": 300,
  "Cameria": 300, "Cameria (木星)": 300,
  "Caracol": 300, "Caracol (土星)": 300,
  "Piscinas": 300, "Piscinas (土星)": 300,
  "Umbriel": 300, "Umbriel (天王星)": 300,
  "Despina": 300, "Despina (海王星)": 300,
  "Proteus": 300, "Proteus (海王星)": 300,
  "Amarna": 300, "Amarna (海王星)": 300,
  "Zeugma": 300, "Zeugma (冥王星)": 300,
  "Sechura": 300, "Sechura (冥王星)": 300,
  "Palus": 300, "Palus (冥王星)": 300,
  "Cholistan": 300, "Cholistan (阋神星)": 300,

  // === D级 (<300) ===
  "Rhea": 240, "Rhea (土星)": 240,
  "Odin": 280, "Odin (水星)": 280, "Odin (阋神星)": 280,
  "Nimus": 280, "Nimus (阋神星)": 280,
  "Draco": 280, "Draco (阋神星)": 280,
  "Stöfler": 280, "Stöfler (月球)": 280,
  "Apollo": 280, "Apollo (月球)": 280,
  "Berehynia": 280, "Berehynia (赛德娜)": 280,
  "Selkie": 280, "Selkie (赛德娜)": 280,
  "Assur": 280, "Assur (天王星)": 280,
  "Ur": 280, "Ur (天王星)": 280,
  "Paimon": 280, "Paimon (欧罗巴)": 280,
  "Kiliken": 280, "Kiliken (金星)": 280,
  "Terrorem": 280, "Terrorem (火卫二)": 280,
  "Kala-azar": 280, "Kala-azar (阋神星)": 280,
  "Hieracon": 280, "Hieracon (冥王星)": 280,
  "Yursa": 280, "Yursa (海王星)": 280,
  "Tikal": 280, "Tikal (地球)": 280,
  "Cerberus": 280, "Cerberus (冥王星)": 280,
  "Outer Terminus": 280, "Outer Terminus (冥王星)": 280,
  "Ganymede": 280, "Ganymede (木星)": 280,
  "Stephano": 280, "Stephano (天王星)": 280,
  "Apollodorus": 280, "Apollodorus (阋神星)": 280,

  // 中文名
  "光神塔": 360, "光神塔 (虚空)": 360,
  "奥金工场": 300, "奥金工场 (金星)": 300,
  "异化区": 280, "异化区 (火卫二)": 280,
  "永视弧域": 280, "永视弧域 (赛德娜)": 280,
  "涂沃主厅": 280, "涂沃主厅 (赛德娜)": 280,
  "阿尼塔": 300, "阿尼塔 (地球)": 300,
  "雷争塔": 280, "雷争塔 (谷神星)": 280,
};

// 匹配节点名的精华数量
function getEssence(node) {
  if (!node) return null;
  if (ESSENCE_TABLE[node]) return ESSENCE_TABLE[node];
  // 去掉星球名后匹配
  const clean = node.replace(/[（(].*?[）)]/, '').trim();
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
  if (!essence) return '?';
  if (essence >= 400) return 'S';
  if (essence >= 350) return 'B';
  if (essence >= 300) return 'C';
  return 'D';
}

/* GET 精华表 */
router.get('/:days?', function(req, res) {
  const days = parseInt(req.params.days) || 7;
  const ARBYS_URL = 'https://wf.555590.xyz/api/arbys?days=' + days;

  fetch(ARBYS_URL, { headers: { 'User-Agent': 'wf-api/1.0' } })
    .then(fRes => fRes.json())
    .then(arbitations => {
      const result = (arbitations || []).map(item => {
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
    })
    .catch(e => {
      res.json({ success: false, error: '数据获取失败: ' + e.message, data: [] });
    });
});

module.exports = router;
