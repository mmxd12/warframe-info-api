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


// 通用 stats 键名中文化（关键词匹配）
function statsZh(stats) {
  const zh = {};
  const map = [
    [/(^|_)critical_chance|crit_chance/, "暴击几率"],
    [/(^|_)critical_damage|crit_damage/, "暴击伤害"],
    [/fire_rate|fireRate/, "射速"],
    [/status_chance/, "触发几率"],
    [/status_damage/, "触发伤害"],
    [/(^|_)multishot/, "多重射击"],
    [/base_damage|baseDamage|damage_/, "基础伤害"],
    [/(^|_)damage(?![_a-z])/, "伤害"],
    [/accuracy/, "精准度"],
    [/punch_through/, "穿透"],
    [/flight_speed|projectile_speed/, "弹道速度"],
    [/blast_radius|blast_range/, "爆炸范围"],
    [/magazine_capacity/, "弹匣容量"],
    [/reload_speed/, "换弹速度"],
    [/ammo_maximum/, "弹药上限"],
    [/ammo_efficiency/, "弹药效率"],
    [/combo_duration/, "连击持续时间"],
    [/combo_count_chance/, "连击计数几率"],
    [/initial_combo/, "初始连击"],
    [/heavy_attack/, "重击"],
    [/slam_attack/, "震地攻击"],
    [/slide_attack/, "滑行攻击"],
    [/attack_speed/, "攻击速度"],
    [/melee_range/, "近战范围"],
    [/melee_damage/, "近战伤害"],
    [/rifle_damage/, "步枪伤害"],
    [/shotgun_damage/, "霰弹枪伤害"],
    [/pistol_damage/, "手枪伤害"],
    [/sniper_rifle_damage/, "狙击枪伤害"],
    [/finisher_damage/, "处决伤害"],
    [/headshot_damage/, "爆头伤害"],
    [/weak_point_damage/, "弱点伤害"],
    [/weak_point_critical/, "弱点暴击"],
    [/life_steal/, "生命偷取"],
    [/health_regen|heal_rate/, "生命回复"],
    [/shield_recharge/, "护盾回复"],
    [/shield_capacity|max_shield/, "护盾容量"],
    [/energy_max|maximum_energy/, "能量上限"],
    [/energy_rate|energy_regen/, "能量回复"],
    [/sprint_speed/, "冲刺速度"],
    [/parkour_velocity/, "跑酷速度"],
    [/bullet_jump/, "子弹跳跃"],
    [/aim_glide/, "空中瞄准滑翔"],
    [/slide_boost/, "滑行加速"],
    [/jump_height/, "跳跃高度"],
    [/movement_speed/, "移动速度"],
    [/dodge_speed/, "闪避速度"],
    [/evasion/, "闪避率"],
    [/armor(?![_a-z])/, "护甲"],
    [/health(?![_a-z])/, "生命值"],
    [/shield(?![_a-z])/, "护盾"],
    [/energy(?![_a-z])/, "能量"],
    [/ability_duration/, "技能持续时间"],
    [/ability_range/, "技能范围"],
    [/ability_strength/, "技能强度"],
    [/ability_efficiency/, "技能效率"],
    [/ability_speed/, "技能速度"],
    [/casting_speed/, "施法速度"],
    [/power_strength/, "技能强度"],
    [/power_range/, "技能范围"],
    [/power_efficiency/, "技能效率"],
    [/power_duration/, "技能持续时间"],
    [/hallowed_ground_duration/, "圣域持续时间"],
    [/magnetize_range/, "磁化范围"],
    [/lull_duration/, "催眠持续时间"],
    [/prismatic_gem_duration/, "棱镜宝石持续时间"],
    [/tauron_strike/, "牛吼攻击"],
    [/mesmer_skin/, "催眠皮肤"],
    [/transference_static/, "传识静电"],
    [/void_mode/, "虚空模式"],
    [/void_sling/, "虚空弹射"],
    [/operator_armor/, "指挥官护甲"],
    [/operator_health/, "指挥官生命"],
    [/operator_shields/, "指挥官护盾"],
    [/amp_ammo/, "增幅器弹药"],
    [/amp_critical/, "增幅器暴击"],
    [/amp_energy/, "指挥官能量"],
    [/amp_fire_rate/, "增幅器射速"],
    [/amp_multishot/, "增幅器多重"],
    [/amp_status/, "增幅器触发"],
    [/companion_health/, "同伴生命"],
    [/companion_damage/, "同伴伤害"],
    [/kavat_ability/, "库娃技能"],
    [/turret_damage/, "炮台伤害"],
    [/turret_critical/, "炮台暴击"],
    [/turret_range/, "炮台范围"],
    [/turret_heat/, "炮台热量"],
    [/ordnance_damage/, "舰炮伤害"],
    [/ordnance_reload/, "舰炮换弹"],
    [/ordnance_projectile/, "舰炮弹道"],
    [/railjack_speed/, "航道星舰速度"],
    [/railjack_boost/, "航道星舰加速"],
    [/forge_capacity/, "锻造容量"],
    [/forge_cooldown/, "锻造冷却"],
    [/hull_and_armor/, "船体与护甲"],
    [/engine_efficiency/, "引擎效率"],
    [/engine_max/, "引擎上限"],
    [/engine_replenish/, "引擎补充"],
    [/forward_artillery/, "前装光炮"],
    [/omni_revolite/, "灭火器"],
    [/bleedout_reduction/, "濒死时间减少"],
    [/revive_speed/, "复活速度"],
    [/enemy_radar/, "敌人雷达"],
    [/loot_radar/, "物品雷达"],
    [/enemy_max_health/, "敌人最大生命"],
    [/enemy_accuracy/, "敌人精准度"],
    [/overguard_damage/, "超宏防护伤害"],
    [/damage_against_overguard/, "对超宏防护伤害"],
    [/damage_resistance/, "伤害减免"],
    [/elemental_resistance/, "元素抗性"],
    [/physical_damage_resistance/, "物理伤害抗性"],
    [/knockdown_recovery|knockdown/, "击倒恢复"],
    [/stagger_recovery|stagger/, "失衡恢复"],
    [/chance_to_resist_knockdown/, "抗 knockdown"],
    [/chance_to_resist_staggers/, "抗失衡"],
    [/chance_to_resist_falls/, "抗坠落"],
    [/chance_to_stagger_on_block/, "格挡失衡几率"],
    [/chance_to_stun_on_block/, "格挡击晕几率"],
    [/chance_to_open_enemies_to_finisher/, "处决触发几率"],
    [/chance_to_auto_complete_hacking/, "自动破解"],
    [/chance_to_unlock_locked_lockers/, "开锁几率"],
    [/chance_to_immediately_destroy_a_nullifier/, "摧毁护盾无人机"],
    [/chance_to_not_consume_dome_charges/, "不消耗穹顶弹药"],
    [/chance_to_not_consume_munitions/, "不消耗弹药"],
    [/chance_to_reduce_the_stagger_effect/, "减少失衡效果"],
    [/chance_to_increase_melee_combo/, "增加连击计数"],
    [/chance_charged_projectiles_explode/, "蓄力弹爆炸"],
    [/chance_for_ordnance_to_ignore/, "舰炮无视护盾"],
    [/chance_for_turret_critical/, "炮台暴击穿盾"],
    [/chance_for_the_pet/, "宠物特殊行动"],
    [/chance_of_energy_drain/, "能量消耗击退"],
    [/chance_to_deal_electrical_damage/, "电击反击"],
    [/chance_to_explode/, "爆炸几率"],
    [/chance_to_explode_on_bounce/, "弹跳爆炸"],
    [/chance_to_apply/, "施加几率"],
    [/chance_to_open/, "开启几率"],
    [/zoom/, "缩放倍率"],
    [/weapon_recoil/, "武器后坐力"],
    [/gore_chance/, "肢解几率"],
    [/parry_angle/, "格挡角度"],
    [/damage_block/, "格挡伤害"],
    [/channeling_damage/, "导引伤害"],
    [/charge_rate/, "蓄力速度"],
    [/bounce/, "弹跳次数"],
    [/breach_chance/, "破解概率"],
    [/success_chance/, "成功率"],
    [/point_multiplier/, "分数倍率"],
    [/trick_score/, "技巧得分"],
    [/pistol_ammo/, "手枪弹药恢复"],
    [/rifle_ammo/, "步枪弹药恢复"],
    [/shotgun_ammo/, "霰弹弹药恢复"],
    [/sniper_rifle_ammo/, "狙击弹药恢复"],
    [/secondary_weapon/, "副武器"],
    [/primary_weapon/, "主武器"],
    [/status_and_critical/, "触发与暴击"],
    [/mobility(?![_a-z])/, "机动性"],
    [/friction/, "摩擦力"],
    [/slide/, "滑行"],
    [/sprint_efficiency/, "冲刺效率"],
    [/velocity_when_falling/, "下落速度"],
    [/gravity_while_aim_gliding/, "空中瞄准重力"],
    [/gravity_while_falling/, "下落重力"],
    [/for_10s|for_15s|for_20s|for_3s|for_4s|for_5s|for_9s|for_12s|for_13s|for_17s|for_24s|for_30s/, ""],
  ];
  for (const [k, v] of Object.entries(stats)) {
    let zhk = k;
    for (const [pat, name] of map) {
      if (pat.test(zhk)) { zhk = name; break; }
    }
    zh[zhk] = v;
  }
  return zh;
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
  return statsZh(result);
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
