const express = require("express");
const router = express.Router();
const { getJson } = require("../utils/superagent");
const logger = require("../utils/logger")(__filename);
const path = require("path");
const fs = require("fs");

const WARFRAMES_URL = "https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Warframes.json";
const CACHE = { data: null, time: 0, TTL: 3600000 };
let zhDict = {};
let aliasMap = {};

// 加载中文词库
try {
  const dictPath = path.join(__dirname, "../api/dataSource/de_dict_snapshot.json");
  const raw = JSON.parse(fs.readFileSync(dictPath, "utf-8"));
  for (const item of raw) {
    if (item.en && item.zh) zhDict[item.en.toLowerCase()] = item.zh;
  }
  logger.info("[warframes] 中文词库: " + Object.keys(zhDict).length + " 条");
} catch (e) { logger.warn("[warframes] 中文词库加载失败: " + e.message); }

// 加载别名（快照 + 本地自定义，本地优先覆盖）
function loadAliases(file, label) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    let count = 0;
    for (const item of raw) {
      const en = (item.zh || "").toLowerCase().trim();
      const key = (item.key || "").trim();
      if (key && en) {
        if (!aliasMap[en]) aliasMap[en] = [];
        aliasMap[en].push(key);
        count++;
      }
    }
    logger.info("[warframes] " + label + ": " + count + " 条别名");
  } catch (e) { logger.warn("[warframes] " + label + " 加载失败: " + e.message); }
}
loadAliases(path.join(__dirname, "../api/dataSource/alias_snapshot.json"), "alias_snapshot");
loadAliases(path.join(__dirname, "../api/dataSource/alias_local.json"), "alias_local");

router.all("/", async (req, res) => {
  try {
    if (!CACHE.data || Date.now() - CACHE.time > CACHE.TTL) {
      const items = await getJson(WARFRAMES_URL);
      for (const w of items) {
        const en = (w.name || "").toLowerCase();
        w.zh_name = zhDict[en] || w.name;
        if (aliasMap[en]) w.aliases = aliasMap[en];
      }
      CACHE.data = items;
      CACHE.time = Date.now();
      logger.info("[warframes] 加载完成: " + items.length + " 个战甲");
    }
    res.json(CACHE.data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
