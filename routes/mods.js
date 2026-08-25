const express = require("express");
const router = express.Router();
const { getJson } = require("../utils/superagent");
const logger = require("../utils/logger")(__filename);
const path = require("path");
const fs = require("fs");

const MODS_URL = "https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Mods.json";
const CACHE = { data: null, time: 0, TTL: 3600000 };
let zhDict = {};

try {
  const dictPath = path.join(__dirname, "../api/dataSource/de_dict_snapshot.json");
  const raw = JSON.parse(fs.readFileSync(dictPath, "utf-8"));
  for (const item of raw) {
    if (item.en && item.zh) zhDict[item.en.toLowerCase()] = item.zh;
  }
  logger.info("[mods] 中文词库: " + Object.keys(zhDict).length + " 条");
} catch (e) {
  logger.warn("[mods] 中文词库加载失败: " + e.message);
}

function parseStats(levelStats) {
  if (!levelStats || !levelStats.length) return {};
  const last = levelStats[levelStats.length - 1];
  if (!last || !last.stats) return {};
  const result = {};
  for (const s of last.stats) {
    const m = s.match(/[+\-]\s*([\d.]+)(?:\s*%?\s*)([a-zA-Z][\w\s]*)/);
    if (m) {
      const key = m[2].trim().toLowerCase().replace(/[\s\-]/g, "_");
      result[key] = parseInt(m[1]) / 100;
    }
  }
  return result;
}

function getNumericValue(levelStats) {
  if (!levelStats || !levelStats.length) return 0;
  const last = levelStats[levelStats.length - 1];
  if (!last || !last.stats) return 0;
  let total = 0;
  for (const s of last.stats) {
    const m = s.match(/[+\-]\s*([\d.]+)/);
    if (m) total += parseFloat(m[1]);
  }
  return total;
}

// 根据 stats/名称 推断战甲 MOD 分组
function inferWarframeGroup(mod) {
  const stats = mod.stats || {};
  const type = (mod.type || "").toLowerCase();
  if (type.includes("aura")) return "aura";
  const keys = Object.keys(stats).map(k => k.toLowerCase());
  if (keys.some(k => k.includes("health") || k.includes("vitality"))) return "health";
  if (keys.some(k => k.includes("armor") || k.includes("steel"))) return "armor";
  if (keys.some(k => k.includes("shield"))) return "shield";
  if (keys.some(k => k.includes("strength") || k.includes("abilitystrength"))) return "strength";
  if (keys.some(k => k.includes("range"))) return "range";
  if (keys.some(k => k.includes("efficiency"))) return "efficiency";
  if (keys.some(k => k.includes("duration"))) return "duration";
  if (keys.some(k => k.includes("energy") || k.includes("maxenergy"))) return "energy";
  if (keys.some(k => k.includes("sprint") || k.includes("parkour") || k.includes("mobility") || k.includes("movement"))) return "mobility";
  // 名称关键词兜底（中文/英文名）
  const name = ((mod.zh_name || mod.name || "") + " " + (mod.name || "")).toLowerCase();
  if (name.includes("aura") || name.includes("光环")) return "aura";
  if (name.includes("health") || name.includes("生命") || name.includes("vitality") || name.includes("活力") || name.includes("体力")) return "health";
  if (name.includes("armor") || name.includes("护甲") || name.includes("steel") || name.includes("钢铁") || name.includes("纤维")) return "armor";
  if (name.includes("shield") || name.includes("护盾") || name.includes("盾")) return "shield";
  if (name.includes("strength") || name.includes("强度") || name.includes("power") || name.includes("力量") || name.includes("聚精会神")) return "strength";
  if (name.includes("range") || name.includes("范围") || name.includes("延伸") || name.includes("扩展")) return "range";
  if (name.includes("efficiency") || name.includes("效率") || name.includes("简化") || name.includes("弹指")) return "efficiency";
  if (name.includes("duration") || name.includes("持续") || name.includes("持久") || name.includes("延长")) return "duration";
  if (name.includes("energy") || name.includes("能量") || name.includes("虹吸") || name.includes("川流")) return "energy";
  if (name.includes("sprint") || name.includes("冲刺") || name.includes("速度") || name.includes("mobility") || name.includes("敏捷")) return "mobility";
  return "utility";
}

router.all("/", async (req, res) => {
  try {
    if (!CACHE.data || Date.now() - CACHE.time > CACHE.TTL) {
      const raw = await getJson(MODS_URL);
      const best = {};
      for (const mod of raw) {
        const en = (mod.name || "").toLowerCase();
        const val = getNumericValue(mod.levelStats);
        if (!best[en] || val > best[en]._val) {
          const stats = parseStats(mod.levelStats);
          const isWf = (mod.type || "").toLowerCase().includes("warframe") || (mod.type || "").includes("Aura");
          best[en] = {
            name: mod.name,
            zh_name: zhDict[en] || mod.name,
            type: mod.type || "",
            rarity: mod.rarity || "",
            polarity: mod.polarity || "",
            drain: mod.fusionLimit || mod.baseDrain || 0,
            weaponType: (mod.type || "").replace(" Mod", "").toLowerCase(),
            stats: stats,
            group: isWf ? inferWarframeGroup({ name: mod.name, zh_name: zhDict[en] || mod.name, stats: stats, type: mod.type }) : (mod.type || "").replace(" Mod", "").toLowerCase(),
            _val: val,
          };
        }
      }
      const items = Object.values(best).map(m => { delete m._val; return m; });
      logger.info("[mods] 加载完成: " + items.length + " 个 MOD");
      CACHE.data = items;
      CACHE.time = Date.now();
    }
    res.json(CACHE.data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
