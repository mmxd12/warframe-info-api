// 官方 DE Public Export 中文数据源
// 从 index_zh.txt.lzma 获取文件列表+哈希，再逐个下载中文 JSON 文件
// 官方文档：https://wiki.warframe.com/w/Public_Export
const { getJson, getText } = require('../../utils/superagent')
const logger = require('../../utils/logger')(__filename)
const lzma = require('lzma')

const INDEX_URL = 'https://origin.warframe.com/PublicExport/index_zh.txt.lzma'
const BASE = 'http://content.warframe.com/PublicExport/Manifest/'

// 用 Buffer 包装 LZMA 解压（lzma 包 API 是 callback 风格）
const decompressLzma = (buffer) => {
    return new Promise((resolve, reject) => {
        // lzma 包的 decompress 接收 Uint8Array
        const uint8 = new Uint8Array(buffer)
        lzma.decompress(uint8, (result, err) => {
            if (err) return reject(err)
            // result 是 Uint8Array，转成字符串
            const str = String.fromCharCode.apply(null, new Uint8Array(result))
            resolve(str)
        })
    })
}

// 拉取索引文件，返回 [{ name, hash }]
const fetchIndex = async () => {
    try {
        const resp = await getText(INDEX_URL, {}, { responseType: 'arraybuffer' })
        // resp 可能是 ArrayBuffer 或 Buffer
        const buf = Buffer.isBuffer(resp) ? resp : Buffer.from(resp)
        const text = await decompressLzma(buf)
        const lines = text.split('\n').filter(Boolean)
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
const hasChinese = s => /[\u4e00-\u9fff]/.test(s)

// 拉取单个中文文件，提取 { en, zh } 词条
const fetchZhFile = async (name, hash) => {
    try {
        const url = BASE + name + '!' + hash
        const raw = await getJson(url)
        // 格式：{ "ExportXXX": [ { "uniqueName": "...", "name": "...", ... } ] }
        const key = Object.keys(raw)[0]
        const list = raw[key] || []
        const entries = []
        for (const item of list) {
            const un = item.uniqueName
            const zh = item.name
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
