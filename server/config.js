/**
 * Server configuration loader
 */

require('dotenv').config()

function loadConfig() {
  return {
    // Control server settings
    controlPort: parseInt(process.env.CONTROL_PORT || '8000', 10),
    host: process.env.HOST || '0.0.0.0',
    
    // Authentication
    authTokens: process.env.AUTH_TOKENS 
      ? process.env.AUTH_TOKENS.split(',').map(t => t.trim())
      : [],
    
    // Allowed ports configuration
    // Format: "3000,3001,5000-6000" or empty for all ports
    allowedPorts: parseAllowedPorts(process.env.ALLOWED_PORTS || ''),
    
    // Connection settings
    connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '10000', 10),
    pingInterval: parseInt(process.env.PING_INTERVAL || '30000', 10),
    pingTimeout: parseInt(process.env.PING_TIMEOUT || '60000', 10),
    
    // Data connection settings
    clientDataHost: process.env.CLIENT_DATA_HOST || 'localhost',
    
    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
  }
}

/**
 * Parse allowed ports from string
 * Format: "3000,3001,5000-6000"
 */
function parseAllowedPorts(portsStr) {
  if (!portsStr || portsStr.trim() === '') {
    return []; // Empty means all ports allowed
  }

  const rules = []
  const parts = portsStr.split(',')

  for (const part of parts) {
    const trimmed = part.trim()
    
    if (trimmed.includes('-')) {
      // Range: 5000-6000
      const [min, max] = trimmed.split('-').map(p => parseInt(p.trim(), 10))
      if (!isNaN(min) && !isNaN(max) && min <= max) {
        rules.push({ min, max })
      }
    } else {
      // Single port: 3000
      const port = parseInt(trimmed, 10)
      if (!isNaN(port)) {
        rules.push(port)
      }
    }
  }

  return rules
}

module.exports = { loadConfig }
