const express = require("express");
const router = express.Router();
const { getJson } = require("../utils/superagent");
const logger = require("../utils/logger")(__filename);

const WEAPON_URLS = {
  Primary: "https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Primary.json",
  Secondary: "https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Secondary.json",
  Melee: "https://cdn.jsdelivr.net/gh/WFCD/warframe-items@master/data/json/Melee.json",
};
const CACHE = { data: null, time: 0, TTL: 3600000 };

router.all("/", async (req, res) => {
  try {
    if (!CACHE.data || Date.now() - CACHE.time > CACHE.TTL) {
      const results = {};
      for (const [cat, url] of Object.entries(WEAPON_URLS)) {
        results[cat] = await getJson(url);
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
