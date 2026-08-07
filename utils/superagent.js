// HTTP 层：使用 Node 原生 fetch，代理走 undici ProxyAgent
// 保留原有 getJson / getText 接口，避免调用方改动
const proxyConfig = require('../config/proxyConfig');
const logger = require('./logger')(__filename)

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

let dispatcher
if (proxyConfig.enabled && proxyConfig.proxy) {
    const { ProxyAgent } = require('undici')
    dispatcher = new ProxyAgent(proxyConfig.proxy)
    logger.info(`http proxy enabled: ${proxyConfig.proxy}`)
}

const doFetch = (url, header = {}) => fetch(url, {
    headers: { 'User-Agent': UA, ...header },
    dispatcher,
})

const getJson = async (url, header = {}) => {
    const res = await doFetch(url, header)
    if (!res.ok) {
        logger.error(`getJson url: ${url} -> HTTP ${res.status}`)
        throw new Error(`HTTP ${res.status} on ${url}`)
    }
    logger.info(`getJson url: ${url}`)
    return res.json()
}

const getText = async (url, header = {}) => {
    const res = await doFetch(url, header)
    if (!res.ok) {
        logger.error(`getText url: ${url} -> HTTP ${res.status}`)
        throw new Error(`HTTP ${res.status} on ${url}`)
    }
    logger.info(`getText url: ${url}`)
    return res.text()
}

// 取原始字节（用于 DE PublicExport 的 .lzma 清单等二进制内容）
const getBuffer = async (url, header = {}) => {
    const res = await doFetch(url, header)
    if (!res.ok) {
        logger.error(`getBuffer url: ${url} -> HTTP ${res.status}`)
        throw new Error(`HTTP ${res.status} on ${url}`)
    }
    logger.info(`getBuffer url: ${url}`)
    return Buffer.from(await res.arrayBuffer())
}

module.exports = { getJson, getText, getBuffer }
