const express = require("express");
const router = express.Router();
const { getJson } = require("../utils/superagent");
const logger = require("../utils/logger")(__filename);
const path = require("path");
const fs = require("fs");

const WEAPON_URLS = {
  Primary: "https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Primary.json",
  Secondary: "https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Secondary.json",
  Melee: "https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Melee.json",
};
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

// 加载 Nyx 词库快照（DE 官方中文翻译，key=英文名）
try {
  const dictPath = path.join(__dirname, "../api/dataSource/de_dict_snapshot.json");
  const raw = JSON.parse(fs.readFileSync(dictPath, "utf-8"));
  for (const item of raw) {
    if (item.en && item.zh) zhDict[item.en.toLowerCase()] = item.zh;
  }
  logger.info("[weapons] 中文词库: " + Object.keys(zhDict).length + " 条");
} catch (e) {
  logger.warn("[weapons] 中文词库加载失败: " + e.message);
}

router.all("/", async (req, res) => {
  try {
    if (!CACHE.data || Date.now() - CACHE.time > CACHE.TTL) {
      const results = {};
      for (const [cat, url] of Object.entries(WEAPON_URLS)) {
        const items = await getJson(url);
        for (const w of items) {
          const en = (w.name || "").toLowerCase();
          w.zh_name = getZh(en) || w.name;
        }
        results[cat] = items;
        logger.info("[weapons] " + cat + " loaded");
      }
      CACHE.data = results;
      CACHE.time = Date.now();
    }
    res.json(CACHE.data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
