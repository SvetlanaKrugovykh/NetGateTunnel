/**
 * Logger module for client
 * Uses pino for fast, structured logging
 */

const pino = require('pino')

function createLogger(options = {}) {
  const {
    level = process.env.LOG_LEVEL || 'info',
    name = 'netgate-client',
  } = options

  return pino({
    name,
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  })
}

module.exports = { createLogger }
