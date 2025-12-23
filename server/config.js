/**
 * Server configuration loader
 */

require('dotenv').config()

// Helper: pick the first defined, non-empty env value from the provided list
function pickEnv(names, fallback) {
  for (const name of names) {
    const value = process.env[name]
    if (value !== undefined && value !== '') return value
  }
  return fallback
}

function loadConfig() {
  return {
    // Control server settings (support legacy alt variable names)
    controlPort: parseInt(pickEnv(['CONTROL_PORT', 'SERVER_PORT', 'PORT'], '8000'), 10),
    host: pickEnv(['HOST', 'SERVER_HOST'], '0.0.0.0'),
    
    // Authentication
    authTokens: pickEnv(['AUTH_TOKENS'], '') 
      ? pickEnv(['AUTH_TOKENS'], '').split(',').map(t => t.trim())
      : [],
    
    // Allowed ports configuration
    // Format: "3000,3001,5000-6000" or empty for all ports
    allowedPorts: parseAllowedPorts(pickEnv(['ALLOWED_PORTS', 'SERVER_ALLOWED_PORTS'], '')),
    
    // Connection settings
    connectionTimeout: parseInt(pickEnv(['CONNECTION_TIMEOUT'], '10000'), 10),
    pingInterval: parseInt(pickEnv(['PING_INTERVAL'], '30000'), 10),
    pingTimeout: parseInt(pickEnv(['PING_TIMEOUT'], '60000'), 10),
    
    // Data connection settings
    clientDataHost: pickEnv(['CLIENT_DATA_HOST'], 'localhost'),
    
    // Logging
    logLevel: pickEnv(['LOG_LEVEL'], 'info'),
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
