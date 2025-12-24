/**
 * NetGateTunnel Server
 * Main entry point for the tunnel server
 */

const { loadConfig } = require('./config')
const { createLogger } = require('./modules/logger')
const ControlServer = require('./modules/control-server')
const TunnelManager = require('./modules/tunnel-manager')

class NetGateServer {
  constructor() {
    this.config = loadConfig()
    this.logger = createLogger({ name: 'netgate-server', level: this.config.logLevel })
    this.controlServer = null
    this.tunnelManager = null
    this.running = false
  }

  /**
   * Start the server
   */
  async start() {
    try {
      this.logger.info('Starting NetGate Tunnel Server...')
      this.logger.info({ config: this.sanitizeConfig(this.config) }, 'Configuration loaded')

      // Initialize control server
      this.controlServer = new ControlServer(this.config, this.logger)
      
      // Initialize tunnel manager
      this.tunnelManager = new TunnelManager(this.config, this.logger, this.controlServer)

      // Setup event handlers
      this.setupEventHandlers()

      // Start control server
      await this.controlServer.start()

      this.running = true
      this.logger.info('NetGate Tunnel Server started successfully')
      
      this.printStatus()

    } catch (error) {
      this.logger.error({ error }, 'Failed to start server')
      process.exit(1)
    }
  }

  /**
   * Setup event handlers between modules
   */
  setupEventHandlers() {
    // Client authenticated
    this.controlServer.on('clientAuthenticated', (clientId) => {
      this.logger.info({ clientId }, 'Client authenticated')
    })

    // Client disconnected
    this.controlServer.on('clientDisconnected', async (clientId) => {
      this.logger.info({ clientId }, 'Client disconnected, unregistering tunnels')
      try {
        await this.tunnelManager.unregisterClientTunnels(clientId)
      } catch (error) {
        this.logger.error({ clientId, error }, 'Error unregistering client tunnels')
      }
    })

    // Register tunnels
    this.controlServer.on('registerTunnels', async (clientId, tunnels) => {
      try {
        this.logger.info({ clientId }, 'Starting tunnel registration handler')
        const results = await this.tunnelManager.registerTunnels(clientId, tunnels)
        this.logger.info({ clientId, resultCount: results.length }, 'Tunnel registration completed')
        
        // Send results back to client
        for (const result of results) {
          if (result.success) {
            this.controlServer.sendToClient(clientId, {
              type: 'tunnel_registered',
              ...result,
            })
          } else {
            this.controlServer.sendToClient(clientId, {
              type: 'tunnel_failed',
              ...result,
            })
          }
        }
        this.logger.info({ clientId }, 'Sent tunnel registration results to client')
      } catch (error) {
        this.logger.error({ clientId, error }, 'Unexpected error in registerTunnels handler')
      }
    })

    // Connection ready
    this.controlServer.on('connectionReady', (clientId, connectionId, dataPort) => {
      this.tunnelManager.handleConnectionReady(clientId, connectionId, dataPort)
    })

    // Connection closed
    this.controlServer.on('connectionClosed', (clientId, connectionId, reason) => {
      this.logger.info({ clientId, connectionId, reason }, 'Connection closed by client')
      this.tunnelManager.cleanupConnection(connectionId)
    })

    // Control server error
    this.controlServer.on('error', (error) => {
      this.logger.error({ error }, 'Control server error')
    })
  }

  /**
   * Print server status
   */
  printStatus() {
    console.log('\n═══════════════════════════════════════════════════')
    console.log('   NetGate Tunnel Server - RUNNING')
    console.log('═══════════════════════════════════════════════════')
    console.log(`   Control Port: ${this.config.controlPort}`)
    console.log(`   Host: ${this.config.host}`)
    console.log(`   Auth: ${this.config.authTokens.length > 0 ? 'Enabled' : 'Disabled'}`)
    console.log(`   Allowed Ports: ${this.config.allowedPorts.length > 0 ? 'Restricted' : 'All'}`)
    console.log('═══════════════════════════════════════════════════\n')
  }

  /**
   * Sanitize config for logging (hide sensitive data)
   */
  sanitizeConfig(config) {
    return {
      ...config,
      authTokens: config.authTokens.length > 0 
        ? `[${config.authTokens.length} tokens]` 
        : '[]',
    }
  }

  /**
   * Stop the server
   */
  async stop() {
    if (!this.running) return

    this.logger.info('Stopping NetGate Tunnel Server...')

    try {
      if (this.tunnelManager) {
        await this.tunnelManager.stop()
      }

      if (this.controlServer) {
        await this.controlServer.stop()
      }

      this.running = false
      this.logger.info('NetGate Tunnel Server stopped')
    } catch (error) {
      this.logger.error({ error }, 'Error stopping server')
    }
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      uptime: process.uptime(),
      clients: this.controlServer ? this.controlServer.getAllClients() : [],
      tunnels: this.tunnelManager ? this.tunnelManager.getAllTunnels() : [],
      memory: process.memoryUsage(),
    }
  }
}

// Main execution
if (require.main === module) {
  const server = new NetGateServer()

  // Graceful shutdown handlers
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`)
    await server.stop()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  // Uncaught exception handler
  process.on('uncaughtException', (error) => {
    console.error('!!! Uncaught exception:', error.message)
    console.error(error.stack)
    server.stop().then(() => process.exit(1))
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('!!! Unhandled rejection at:', promise)
    console.error('!!! Reason:', reason)
    if (reason && reason.stack) {
      console.error(reason.stack)
    }
    server.stop().then(() => process.exit(1))
  })

  // Start server
  server.start()
}

module.exports = NetGateServer
