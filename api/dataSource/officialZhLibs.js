// 官方 DE Public Export 中文数据源（精简版：只下载关键文件）
const { getJson } = require('../../utils/superagent')
const logger = require('../../utils/logger')(__filename)
const lzma = require('lzma')

const INDEX_URL = 'https://origin.warframe.com/PublicExport/index_zh.txt.lzma'
const BASE = 'http://content.warframe.com/PublicExport/Manifest/'

// 只下载这几个关键文件（节点名、战甲名、武器名等），不下载全部16个
const TARGET_FILES = [
    'ExportRegions_zh.json',
    'ExportResources_zh.json',
    'ExportWarframes_zh.json',
    'ExportWeapons_zh.json',
]

const hasChinese = s => /[一-\u9fff]/.test(s)

// 解压 LZMA（callback 风格 → Promise）
const decompressLzma = (buffer) => new Promise((resolve, reject) => {
    lzma.decompress(new Uint8Array(buffer), (result, err) => {
        if (err) return reject(err)
        resolve(String.fromCharCode.apply(null, new Uint8Array(result)))
    })
})

// 拉取索引，返回 { filename: hash }
const fetchIndex = async () => {
    try {
        const https = require('https')
        const req = new Promise((resolve, reject) => {
            https.get(INDEX_URL, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.warframe.com/' } }, (res) => {
                const chunks = []
                res.on('data', c => chunks.push(c))
                res.on('end', () => resolve(Buffer.concat(chunks)))
                res.on('error', reject)
            }).on('error', reject)
        })
        const buf = await req
        const text = await decompressLzma(buf)
        const result = {}
        for (const line of text.split('\n').filter(Boolean)) {
            const [name, hash] = line.split('!')
            if (name && hash) result[name.trim()] = hash.trim()
        }
        logger.info(`[officialZh] 索引解析完成，${Object.keys(result).length} 个文件`)
        return result
    } catch (e) {
        logger.warn(`[officialZh] 索引拉取失败: ${(e && e.message) || e}`)
        return {}
    }
}

// 并行下载关键文件，提取 { en, zh } 词条
const fetchZhFiles = async (index) => {
    const entries = []
    const promises = TARGET_FILES.map(async (name) => {
        const hash = index[name]
        if (!hash) {
            logger.warn(`[officialZh] 未找到 ${name}`)
            return
        }
        try {
            const url = BASE + name + '!' + hash
            const raw = await getJson(url)
            const key = Object.keys(raw)[0]
            const list = raw[key] || []
            for (const item of list) {
                const un = item.uniqueName
                const zh = item.name
                if (un && zh && hasChinese(zh)) {
                    entries.push({ en: un, zh: zh })
                }
            }
            logger.info(`[officialZh] ${name}: ${list.length} 条，含中文 ${entries.filter(e => e.zh === zh).length} 条`)
        } catch (e) {
            logger.warn(`[officialZh] ${name} 拉取失败: ${(e && e.message) || e}`)
        }
    })
    await Promise.all(promises)
    logger.info(`[officialZh] 完成，共 ${entries.length} 条中文词条`)
    return entries
}

// 主入口
const getOfficialZhDicts = async () => {
    const index = await fetchIndex()
    if (!Object.keys(index).length) return []
    return await fetchZhFiles(index)
}

module.exports = { getOfficialZhDicts }
