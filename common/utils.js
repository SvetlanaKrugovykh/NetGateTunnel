/**
 * Common utility functions for NetGateTunnel
 */

const { v4: uuidv4 } = require('uuid')

/**
 * Generate unique connection ID
 */
function generateConnectionId() {
  return uuidv4()
}

/**
 * Generate unique client ID
 */
function generateClientId() {
  return uuidv4()
}

/**
 * Validate port number
 */
function isValidPort(port) {
  const portNum = parseInt(port, 10)
  return Number.isInteger(portNum) && portNum > 0 && portNum <= 65535
}

/**
 * Check if port is in allowed range
 */
function isPortAllowed(port, allowedPorts) {
  if (!allowedPorts || allowedPorts.length === 0) {
    return true; // No restrictions
  }
  
  const portNum = parseInt(port, 10)
  
  for (const rule of allowedPorts) {
    if (typeof rule === 'number' && rule === portNum) {
      return true
    }
    
    if (typeof rule === 'object' && rule.min && rule.max) {
      if (portNum >= rule.min && portNum <= rule.max) {
        return true
      }
    }
  }
  
  return false
}

/**
 * Parse tunnel configuration string
 * Format: "remotePort:localPort:name" or "remotePort:localPort"
 */
function parseTunnelConfig(configStr) {
  const parts = configStr.split(':')
  
  if (parts.length < 2) {
    throw new Error(`Invalid tunnel config: ${configStr}`)
  }
  
  const remotePort = parseInt(parts[0], 10)
  const localPort = parseInt(parts[1], 10)
  const name = parts[2] || `tunnel-${remotePort}`
  
  if (!isValidPort(remotePort) || !isValidPort(localPort)) {
    throw new Error(`Invalid port in tunnel config: ${configStr}`)
  }
  
  return { remotePort, localPort, name }
}

/**
 * Detect if data looks like HTTP request
 */
function isHttpRequest(buffer) {
  if (!buffer || buffer.length < 4) {
    return false
  }
  
  const start = buffer.toString('ascii', 0, Math.min(16, buffer.length))
  const httpMethods = ['GET ', 'POST', 'PUT ', 'DELE', 'HEAD', 'PATC', 'OPTI', 'CONN']
  
  return httpMethods.some(method => start.startsWith(method))
}

/**
 * Parse HTTP host header from request buffer
 */
function parseHttpHost(buffer) {
  if (!buffer) return null
  
  const data = buffer.toString('ascii')
  const hostMatch = data.match(/Host:\s*([^\r\n]+)/i)
  
  return hostMatch ? hostMatch[1].trim() : null
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry function with exponential backoff
 */
async function retry(fn, options = {}) {
  const {
    maxAttempts = 5,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    onRetry = null,
  } = options
  
  let lastError
  let delay = initialDelay
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      if (attempt === maxAttempts) {
        break
      }
      
      if (onRetry) {
        onRetry(error, attempt, delay)
      }
      
      await sleep(delay)
      delay = Math.min(delay * factor, maxDelay)
    }
  }
  
  throw lastError
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Format uptime in human readable format
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

module.exports = {
  generateConnectionId,
  generateClientId,
  isValidPort,
  isPortAllowed,
  parseTunnelConfig,
  isHttpRequest,
  parseHttpHost,
  sleep,
  retry,
  formatBytes,
  formatUptime,
}
