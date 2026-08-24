const express = require("express");
const router = express.Router();
const { getJson } = require("../utils/superagent");
const logger = require("../utils/logger")(__filename);

const SOURCES = [
  "https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Warframes.json",
  "https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/Warframes.json",
];
const CACHE = { data: null, time: 0, TTL: 3600000 };

const FRAME_ZH = {
  "ash": "灰烬", "ash prime": "灰烬 Prime",
  "atlas": "撼天刑者", "atlas prime": "撼天刑者 Prime",
  "banshee": "超能女妖", "banshee prime": "超能女妖 Prime",
  "baruuk": "巴鲁克", "baruuk prime": "巴鲁克 Prime",
  "caliban": "卡利班",
  "chroma": "龙将", "chroma prime": "龙将 Prime",
  "citrine": "石英",
  "dante": "但丁",
  "ember": "灰烬", "ember prime": "灰烬 Prime",
  "equinox": "阴阳双子", "equinox prime": "阴阳双子 Prime",
  "excalibur": "圣剑", "excalibur prime": "圣剑 Prime",
  "excalibur umbra": "圣剑 Umbra",
  "frost": "冰雪寒霜", "frost prime": "冰雪寒霜 Prime",
  "garuda": "血妈", "garuda prime": "血妈 Prime",
  "gauss": "高斯", "gauss prime": "高斯 Prime",
  "grendel": "贪食龙", "grendel prime": "贪食龙 Prime",
  "gara": "玻璃", "gara prime": "玻璃 Prime",
  "gyre": "回转",
  "harrow": "主教", "harrow prime": "主教 Prime",
  "hildryn": "母牛", "hildryn prime": "母牛 Prime",
  "hydroid": "水男", "hydroid prime": "水男 Prime",
  "inaros": "沙人", "inaros prime": "沙人 Prime",
  "ivara": "弓妹", "ivara prime": "弓妹 Prime",
  "jade": "翡翠",
  "khora": "猫甲", "khora prime": "猫甲 Prime",
  "kullervo": "库勒沃",
  "lavos": "炼金", "lavos prime": "炼金 Prime",
  "limbo": "虚空行者", "limbo prime": "虚空行者 Prime",
  "loki": "洛基", "loki prime": "洛基 Prime",
  "mag": "磁力", "mag prime": "磁力 Prime",
  "mirage": "小丑", "mirage prime": "小丑 Prime",
  "nezha": "哪吒", "nezha prime": "哪吒 Prime",
  "nidus": "不死鸟", "nidus prime": "不死鸟 Prime",
  "nova": "毒妈", "nova prime": "毒妈 Prime",
  "nyx": "精神控制", "nyx prime": "精神控制 Prime",
  "oberon": "奥伯龙", "oberon prime": "奥伯龙 Prime",
  "octavia": "DJ", "octavia prime": "DJ Prime",
  "protea": "导弹", "protea prime": "导弹 Prime",
  "revenant": "夜灵", "revenant prime": "夜灵 Prime",
  "rhino": "犀牛", "rhino prime": "犀牛 Prime",
  "saryn": "毒女", "saryn prime": "毒女 Prime",
  "sevagoth": "鬼甲", "sevagoth prime": "鬼甲 Prime",
  "styanax": "斯巴达",
  "titania": "蝶妹", "titania prime": "蝶妹 Prime",
  "trinity": "奶妈", "trinity prime": "奶妈 Prime",
  "valkyr": "女武神", "valkyr prime": "女武神 Prime",
  "vauban": "工程兵", "vauban prime": "工程兵 Prime",
  "volt": "伏特", "volt prime": "伏特 Prime",
  "voruna": "狼妹",
  "wisp": "花妹", "wisp prime": "花妹 Prime",
  "wukong": "悟空", "wukong prime": "悟空 Prime",
  "xaku": "骨甲",
  "yareli": "水妹",
  "zephyr": "鸟姐", "zephyr prime": "鸟姐 Prime",
  "koumei": "骰子妹",
  "qorvex": "辐射甲",
  "dagath": "死亡女",
  "bonewidow": "骨骸寡妇",
  "caliban prime": "卡利班 Prime",
  "gyre prime": "回转 Prime",
  "helminth": "赫尔明斯",
  "mesa": "枪女",
  "mesa prime": "枪女 Prime",
  "nekros": "死灵",
  "nekros prime": "死灵 Prime",
  "styanax prime": "斯巴达 Prime",
  "voidrig": "虚空锐将",
  "voruna prime": "狼妹 Prime",
  "xaku prime": "骨甲 Prime",
  "yareli prime": "水妹 Prime",
  "cyte-09": "Cyte-09",
  "follie": "Follie",
  "nokko": "Nokko",
  "oraxia": "Oraxia",
  "orion & sirius": "Orion & Sirius",
  "sirius & orion": "Sirius & Orion",
  "temple": "Temple",
  "uriel": "Uriel"
};

function getZh(en) {
  if (FRAME_ZH[en]) return FRAME_ZH[en];
  try {
    const { libs } = require("../utils/wfaLibs");
    const nyx = libs.Nyx.get(en);
    if (nyx) return typeof nyx === "string" ? nyx : (nyx.zh || en);
    const d = libs.Dict.get(en);
    if (d && typeof d === "string") return d;
  } catch(e) {}
  return en;
}

async function fetchWarframes() {
  let lastErr = null;
  for (const url of SOURCES) {
    try {
      const items = await getJson(url);
      if (!Array.isArray(items) || items.length === 0) continue;
      for (const w of items) {
        w.zh_name = getZh((w.name||"").toLowerCase()) || w.name;
        if (Array.isArray(w.abilities)) {
          for (const ab of w.abilities)
            ab.zh_name = getZh((ab.name||"").toLowerCase()) || ab.name;
        }
      }
      logger.info("[warframes] 拉取成功: " + url + "，共 " + items.length + " 个战甲");
      return items;
    } catch (e) {
      lastErr = e;
      logger.warn("[warframes] 源失败 " + url + ": " + (e.message || e));
    }
  }
  throw lastErr || new Error("所有数据源均失败");
}

router.all("/", async (req, res) => {
  try {
    if (!CACHE.data || Date.now() - CACHE.time > CACHE.TTL) {
      CACHE.data = await fetchWarframes();
      CACHE.time = Date.now();
    }
    res.json(CACHE.data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
