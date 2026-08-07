## warframe-info-api

### 原项目地址：[WsureWarframe/warframe-info-appi](https://github.com/WsureWarframe/warframe-info-api)

#### 这是一个 Node.js 后端服务，提供 Warframe 世界状态、市场价格、Wiki 搜索和词库查询。

---

## 接口说明

### 1. Warframe 世界状态  `/wf/:type`
支持**中英文**直达，例如：
- `/wf/电波` 或 `/wf/nightwave` → 电波信息
- `/wf/突击` 或 `/wf/sortie` → 突击任务
- `/wf/裂缝` 或 `/wf/fissures` → 虚空裂缝
- `/wf/奸商` 或 `/wf/voidTrader` → 奸商 Baro
- `/wf/日历` 或 `/wf/calendar` → 1999 日历
- `/wf/钢铁之路` 或 `/wf/steelPath` → 钢铁之路周常奖励轮换
- `/wf/执刑官` 或 `/wf/archonHunt` → 执刑官猎杀
- `/wf/全局增益` 或 `/wf/globalUpgrades` → 全局强化（双倍资源/经验等）
- `/wf/地球赏金` 或 `/wf/ostrons` → 地球平原赏金
- `/wf/金星赏金` 或 `/wf/solaris` → 金星平原赏金
- `/wf/火卫二赏金` 或 `/wf/entrati` → 火卫二平原赏金
- `/wf/深层科研` 或 `/wf/时光科研` → 深层/时光科研（archimedeas，含中文术语翻译）；`/wf/科研` 返回两者全量
- `/wf/灵化`（别名 `本周灵化`/`灵化之源`/`incarnon`/`钢铁回环`）→ 本周钢铁之路回环的灵化之源武器轮换
- `/wf/回环`（别名 `双衍回环`/`本周战甲`/`circuit`）→ 本周普通回环的战甲轮换
- `/wf/双衍王境` 或 `/wf/duviriCycle` → 螺旋情绪 + 两档回环轮换全量

**更多支持的类型**：`timestamp`（服务器时间）、`news`（新闻）、`events`（活动）、`alerts`（警报）、`invasions`（入侵）、`flashSales`（促销）、`dailyDeals`（达尔沃）、`persistentEnemies`（小小黑）、`earthCycle`（地球昼夜）、`cetusCycle`（希图斯昼夜）、`vallisCycle`（福尔图娜温度）、`cambionCycle`（火卫二循环）、`zarimanCycle`（扎里曼）、`arbitration`（仲裁）、`constructionProgress`（舰队建造）、`simaris`（中枢 Simaris 声望目标）、`sentientOutposts`（无形者先遣舰）、`clanWeeklyInitiative`（氏族每周倡议）、`conclaveChallenges`（武形秘仪挑战）

完整别名表见 `/wf/list` 的 `alias` 字段，或 `utils/dict/wfTypeAlias.json`。

> 回环轮换（灵化/战甲）每周一 00:00 UTC 重置，worldState 不提供该时间，由服务端本地计算并放在 `expiry`/`eta`；
> `/wf/双衍王境` 里的 `expiry` 仍是 2 小时一轮的螺旋情绪剩余时间，每周重置时间另放 `rotationExpiry`/`rotationEta`。

也可用 query 参数：`/wf?type=电波`

---

### 2. Warframe Market 物品价格  `/wm/:物品名`
支持中英文，可模糊匹配，并支持**玩家黑话**直达。示例：
- `/wm/Mag Prime Set` → 查询 Mag Prime 套装
- `/wm/奶妈P` → 黑话直达 Trinity Prime Set 行情
- `/wm/福马` → 黑话直达 Forma 行情
- `/wm/蛇发女妖·亡魂 一套` → 中文查询（需使用词库收录的精确名称）

分页参数（可选）：
- `page`：页码（整数），默认 1
- `size`：每页条数（整数），默认 10

调用方式：
```bash
# URL 参数
curl "http://127.0.0.1:3000/wm/Mag%20Prime%20Set?page=1&size=10"

# query 参数
curl "http://127.0.0.1:3000/wm?type=Mag%20Prime%20Set&page=1&size=10"

# POST body
curl -X POST -H 'Content-Type:application/json' \
  -d '{"page":1,"size":10}' \
  "http://127.0.0.1:3000/wm/Mag%20Prime%20Set"
```

---

### 3. Warframe Market 紫卡价格  `/wmr/:武器名`
查询紫卡行情，支持中英文 + 黑话 + 词条筛选。示例：
- `/wmr/食人女魔` → 查询食人女魔紫卡
- `/wmr/食人女魔 弹匣 投射物速度 负后坐力` → 按词条筛选（正面词条 + 负面词条）

分页参数同上。

---

### 4. Warframe Market 玄骸武器价格  `/wmw/:武器名`
查询玄骸（Lich/Sister）武器行情，支持中英文 + 黑话。示例：
- `/wmw/Kuva Bramma`
- `/wmw/Tenet Arca Plasmor`
- `/wmw/喷火器` → 黑话直达 Ignis 武器行情

分页参数同上。

---

### 5. 灰机 Wiki 搜索  `/wiki/:关键词`
返回灰机 Wiki 搜索链接（由于反爬限制，本接口只提供搜索 URL）。

示例：`/wiki/电波` → 返回 `{"url":"https://warframe.huijiwiki.com/..."}`

---

### 6. 词库查询

#### `/dict/list` - 已加载词库列表
返回所有可用词库名称，例如：
```json
["Dict","Sale","Riven","NightWave","Invasion","Nyx","wmRiven","riven_attributes","auctionsWeapons",...]
```

#### `/dict/:关键词` - 模糊搜索
在所有词库中搜索关键词，返回匹配项（最多 10 条）。**命中玩家黑话时返回精确直达项**（`acc: 100, alias: true`）。示例：
- `/dict/防御` → 搜索包含"防御"的词条
- `/dict/水男` → 黑话直达 `Hydroid`（附官方中文）
- `/dict/Mag/wm` → 仅在 `wm` 词库中搜索"Mag"
- `/dict/女妖/wm,wmRiven` → 在多个词库中搜索

可选参数：
- `max`：返回数量上限（默认 10）

---

### 7. 玩家黑话系统

服务内置 Warframe 玩家黑话词库（**252 条**），覆盖：

- **战甲外号**：磁妹/摸尸/奶妈/水男/毒妈/火鸡/冰队/女枪/龙甲/悟空/猫甲/鬼妹/茶妹/高斯/肥宅/滑板妹/狼妹/无头/但丁/混凝土/孔梅/塞特/黑咖喱（Umbra）等
- **Prime 简称**：咖喱P/奶妈P/牛P/电男P/毒妈P/女枪P/龙甲P/悟空P/高斯P/无头P/塞特P 等全系 P 后缀
- **夜灵三傻**：大傻（兆力使）/二傻（巨力使）/三傻（水力使）
- **核心术语**：紫卡（裂罅）/福马/土豆/银土豆/豆子/核桃/玄骸/姐妹/奸商/白金/赤毒
- **玩法黑话**：仲裁/中断/赏金/信条/机甲/钢路/电波/大嘴（Helminth）/镀层/气球（Lure）

黑话在 `/wm`、`/wmw`、`/wmr` 查价与 `/dict` 查询中自动识别（先黑话 → 英文名 → 中文翻译，三段跳板）。

**自定义扩展**：修改 `api/dataSource/alias_local.json`（黑话 → 标准英文名）即可添加新黑话，改完重启生效；与上游快照合并时**本地优先、只填空缺**。本地翻译词表见 `utils/dict/wfExtraTerms.json`（只填空缺、不覆盖已有词条）。

---

## 已移除模块

以下模块已在本次重构中删除：
- `/mp` - 微信小程序接口
- `/rm` - riven.market 紫卡查询（已被 `/wmr` 替代）
- `/robot` - 机器人专用格式化输出（功能已整合）

---

## 如何运行

#### 1. 安装依赖
```bash
# 下载项目
git clone https://github.com/mmxd12/warframe-info-api.git
cd warframe-info-api

# 安装 yarn（可选）
npm install --global yarn

# 安装依赖
yarn install
# 或
npm install
```

#### 2. 启动服务
```bash
yarn start
# 或
npm start
```

默认端口 3000。如需修改端口或配置 HTTPS 证书，请编辑 `bin/www`。

---

## 技术栈
- Node.js + Express
- warframe-worldstate-parser（世界状态解析）
- Warframe Market API
- 灰机 Wiki 搜索
- DE 官方 PublicExport（中文翻译，本地补充词表兜底）

## 搭配llm使用
这里给astrbot写了插件和rag可以自行使用
[astrbot插件](https://github.com/mmxd12/astrbot_plugin_wfrag_tool)
[rag索引](https://github.com/mmxd12/wf-rag-pack)
有问题可以提[issues](https://github.com/mmxd12/warframe-info-api/issues)
或者你可以进群435021808和我们进行友好交流
