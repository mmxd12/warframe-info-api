// 官方 DE Public Export 中文数据源
// 从 index_zh.txt.lzma 获取文件列表+哈希，再逐个下载中文 JSON 文件
// 官方文档：https://wiki.warframe.com/w/Public_Export
const { getJson, getText } = require('../../utils/superagent')
const logger = require('../../utils/logger')(__filename)
const lzma = require('lzma-native')

const INDEX_URL = 'https://origin.warframe.com/PublicExport/index_zh.txt.lzma'
const BASE = 'http://content.warframe.com/PublicExport/Manifest/'

// 拉取索引文件，返回 [{ name, hash }]
const fetchIndex = async () => {
    try {
        const raw = await getText(INDEX_URL, {}, { responseType: 'arraybuffer' })
        // LZMA 解压
        const decompressed = await new Promise((resolve, reject) => {
            const decoder = lzma.createDecompressor()
            const chunks = []
            decoder.on('data', c => chunks.push(c))
            decoder.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
            decoder.on('error', reject)
            decoder.end(Buffer.from(raw))
        })
        const lines = decompressed.split('\\n').filter(Boolean)
        return lines.map(line => {
            const [name, hash] = line.split('!')
            return { name: name.trim(), hash: (hash || '').trim() }
        })
    } catch (e) {
        logger.warn(`[officialZh] 索引拉取失败: ${(e && e.message) || e}`)
        return []
    }
}

// 判断字符串是否包含中文
const hasChinese = s => /[\\u4e00-\\u9fff]/.test(s)

// 拉取单个中文文件，提取 { en, zh } 词条
// 不同文件的字段名不同，统一用 uniqueName 作为 key，name 作为 value
const fetchZhFile = async (name, hash) => {
    try {
        const url = BASE + name + '!' + hash
        const raw = await getJson(url)
        // 格式：{ "ExportXXX": [ { "uniqueName": "...", "name": "...", ... } ] }
        const key = Object.keys(raw)[0]
        const list = raw[key] || []
        const entries = []
        for (const item of list) {
            const un = item.uniqueName || item.uniqueName
            const zh = item.name || item.name
            if (un && zh && hasChinese(zh)) {
                entries.push({ en: un, zh: zh })
            }
        }
        logger.info(`[officialZh] ${name}: ${entries.length} 条中文词条`)
        return entries
    } catch (e) {
        logger.warn(`[officialZh] ${name} 拉取失败: ${(e && e.message) || e}`)
        return []
    }
}

// 拉取全部官方中文数据，返回 [{ en, zh }]
const getOfficialZhDicts = async () => {
    const index = await fetchIndex()
    if (!index.length) {
        logger.warn('[officialZh] 索引为空，跳过')
        return []
    }
    logger.info(`[officialZh] 索引共 ${index.length} 个文件`)
    // 逐个拉取（不并行，避免被限制）
    const all = []
    for (const { name, hash } of index) {
        const entries = await fetchZhFile(name, hash)
        all.push(...entries)
    }
    logger.info(`[officialZh] 拉取完成，共 ${all.length} 条中文词条`)
    return all
}

module.exports = { getOfficialZhDicts }
