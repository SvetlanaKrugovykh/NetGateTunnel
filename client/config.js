/**
 * Client configuration loader
 */

require('dotenv').config()

function loadConfig() {
  return {
    // Server connection settings
    serverHost: process.env.SERVER_HOST || 'localhost',
    serverPort: parseInt(process.env.SERVER_PORT || '8000', 10),
    
    // Authentication
    authToken: process.env.AUTH_TOKEN || '',
    
    // Tunnels configuration
    // Format: TUNNELS=3000:3000:webapp,5432:5432:postgres
    tunnels: parseTunnels(process.env.TUNNELS || ''),
    
    // Connection settings
    connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '10000', 10),
    reconnectAttempts: parseInt(process.env.RECONNECT_ATTEMPTS || '999', 10),
    reconnectDelay: parseInt(process.env.RECONNECT_DELAY || '5000', 10),
    reconnectMaxDelay: parseInt(process.env.RECONNECT_MAX_DELAY || '60000', 10),
    
    // Data connection settings
    dataHost: process.env.DATA_HOST || 'localhost',
    localHost: process.env.LOCAL_HOST || 'localhost',
    dataServerTimeout: parseInt(process.env.DATA_SERVER_TIMEOUT || '15000', 10),
    
    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
  }
}

/**
 * Parse tunnels from environment variable
 * Format: "3000:3000:webapp,5432:5432:postgres" or "3000:3000,5432:5432"
 */
function parseTunnels(tunnelsStr) {
  if (!tunnelsStr || tunnelsStr.trim() === '') {
    return []
  }

  const tunnels = []
  const parts = tunnelsStr.split(',')

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const segments = trimmed.split(':')
    
    if (segments.length < 2) {
      console.warn(`Invalid tunnel format: ${trimmed}`)
      continue
    }

    const remotePort = parseInt(segments[0], 10)
    const localPort = parseInt(segments[1], 10)
    const name = segments[2] || `tunnel-${remotePort}`

    if (isNaN(remotePort) || isNaN(localPort)) {
      console.warn(`Invalid port in tunnel: ${trimmed}`)
      continue
    }

    tunnels.push({
      remotePort,
      localPort,
      name,
      protocol: 'tcp', // Can be extended to support http/https optimization
    })
  }

  return tunnels
}

module.exports = { loadConfig }
