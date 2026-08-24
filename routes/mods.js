const express = require("express");
const router = express.Router();
const { getJson } = require("../utils/superagent");
const logger = require("../utils/logger")(__filename);
const path = require("path");
const fs = require("fs");

const MODS_URL = "https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Mods.json";
const CACHE = { data: null, time: 0, TTL: 3600000 };
let zhDict = {};
let zhExtra = {};

try {
  const { libs } = require("../utils/wfaLibs");
  const dk = libs.Dict.keys();
  for (const k of dk) {
    const v = libs.Dict.get(k);
    if (v && typeof v === "string") zhExtra[k.toLowerCase()] = v;
  }
  // BrowseDict
  const bk = libs.BrowseDict.keys();
  for (const k of bk) {
    const v = libs.BrowseDict.get(k);
    if (v && typeof v === "string") zhExtra[k.toLowerCase()] = v;
  }
} catch(e) {}

function getZh(en) {  try {    const { libs } = require("../utils/wfaLibs");    const nyx = libs.Nyx.get(en);    if (nyx) return typeof nyx === "string" ? nyx : (nyx.zh || en);  } catch(e) {}  return zhDict[en] || zhExtra[en] || en;}

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
    const m = s.match(/[+\-]\s*([\d.]+)%?\s*([\w\s]+)/);
    if (m) {
      const key = m[2].trim().toLowerCase().replace(/[\s\-]/g, "_");
      result[key] = parseFloat(m[1]) / 100;
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

router.all("/", async (req, res) => {
  try {
    if (!CACHE.data || Date.now() - CACHE.time > CACHE.TTL) {
      const raw = await getJson(MODS_URL);
      const best = {};
      for (const mod of raw) {
        const en = (mod.name || "").toLowerCase();
        const val = getNumericValue(mod.levelStats);
        if (!best[en] || val > best[en]._val) {
          best[en] = {
            name: mod.name,
            zh_name: getZh(en) || mod.name,
            type: mod.type || "",
            rarity: mod.rarity || "",
            polarity: mod.polarity || "",
            drain: mod.fusionLimit || mod.baseDrain || 0,
            weaponType: (mod.type || "").replace(" Mod", "").toLowerCase(),
            stats: parseStats(mod.levelStats),
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
