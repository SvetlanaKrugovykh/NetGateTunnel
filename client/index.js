/**
 * NetGateTunnel Client
 * Main entry point for the tunnel client
 */

const { loadConfig } = require('./config')
const { createLogger } = require('./modules/logger')
const ControlClient = require('./modules/control-client')
const TunnelHandler = require('./modules/tunnel-handler')

class NetGateClient {
  constructor() {
    this.config = loadConfig()
    this.logger = createLogger({ name: 'netgate-client', level: this.config.logLevel })
    this.controlClient = null
    this.tunnelHandler = null
    this.running = false
  }

  /**
   * Start the client
   */
  async start() {
    try {
      this.logger.info('Starting NetGate Tunnel Client...')
      this.logger.info({ config: this.sanitizeConfig(this.config) }, 'Configuration loaded')

      // Validate configuration
      this.validateConfig()

      // Initialize control client
      this.controlClient = new ControlClient(this.config, this.logger)

      // Initialize tunnel handler
      this.tunnelHandler = new TunnelHandler(this.config, this.logger, this.controlClient)

      // Setup event handlers
      this.setupEventHandlers()

      // Connect to server
      await this.controlClient.connect()

      // Register tunnels
      this.registerTunnels()

      this.running = true
      this.logger.info('NetGate Tunnel Client started successfully')
      
      this.printStatus()

    } catch (error) {
      this.logger.error({ error }, 'Failed to start client')
      process.exit(1)
    }
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    if (!this.config.serverHost) {
      throw new Error('SERVER_HOST is required')
    }

    if (!this.config.authToken) {
      this.logger.warn('No AUTH_TOKEN configured')
    }

    if (this.config.tunnels.length === 0) {
      throw new Error('No tunnels configured. Set TUNNELS environment variable.')
    }

    this.logger.info({ tunnelCount: this.config.tunnels.length }, 'Tunnels configured')
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Connected to server
    this.controlClient.on('connected', () => {
      this.logger.info('Connected to server')
    })

    // Disconnected from server
    this.controlClient.on('disconnected', () => {
      this.logger.warn('Disconnected from server')
    })

    // Reconnected to server
    this.controlClient.on('reconnected', () => {
      this.logger.info('Reconnected to server, re-registering tunnels')
      this.registerTunnels()
    })

    // Tunnel registered successfully
    this.controlClient.on('tunnelRegistered', (result) => {
      this.logger.info(
        { remotePort: result.remotePort, localPort: result.localPort, name: result.name },
        'Tunnel registered'
      )
    })

    // Tunnel registration failed
    this.controlClient.on('tunnelFailed', (result) => {
      this.logger.error(
        { remotePort: result.remotePort, error: result.error },
        'Tunnel registration failed'
      )
    })

    // New connection from server
    this.controlClient.on('newConnection', (connectionId, remotePort, clientAddress) => {
      this.tunnelHandler.handleNewConnection(connectionId, remotePort, clientAddress)
    })

    // Connection closed by server
    this.controlClient.on('connectionClosed', (connectionId, reason) => {
      this.logger.info({ connectionId, reason }, 'Connection closed by server')
      this.tunnelHandler.cleanupConnection(connectionId)
    })

    // Status update
    this.controlClient.on('status', (status) => {
      this.logger.info({ status }, 'Status update from server')
    })
  }

  /**
   * Register tunnels with server
   */
  registerTunnels() {
    if (!this.controlClient.isConnected()) {
      this.logger.warn('Not connected, cannot register tunnels')
      return
    }

    this.logger.info({ tunnels: this.config.tunnels }, 'Registering tunnels')
    this.controlClient.registerTunnels(this.config.tunnels)
  }

  /**
   * Print client status
   */
  printStatus() {
    console.log('\n═══════════════════════════════════════════════════')
    console.log('   NetGate Tunnel Client - RUNNING')
    console.log('═══════════════════════════════════════════════════')
    console.log(`   Server: ${this.config.serverHost}:${this.config.serverPort}`)
    console.log(`   Tunnels: ${this.config.tunnels.length}`)
    console.log('')
    
    for (const tunnel of this.config.tunnels) {
      console.log(`   → ${tunnel.name}: ${this.config.serverHost}:${tunnel.remotePort} -> localhost:${tunnel.localPort}`)
    }
    
    console.log('═══════════════════════════════════════════════════\n')
  }

  /**
   * Sanitize config for logging (hide sensitive data)
   */
  sanitizeConfig(config) {
    return {
      ...config,
      authToken: config.authToken ? '[HIDDEN]' : '[NOT SET]',
    }
  }

  /**
   * Stop the client
   */
  async stop() {
    if (!this.running) return

    this.logger.info('Stopping NetGate Tunnel Client...')

    try {
      if (this.tunnelHandler) {
        this.tunnelHandler.cleanup()
      }

      if (this.controlClient) {
        this.controlClient.disconnect()
      }

      this.running = false
      this.logger.info('NetGate Tunnel Client stopped')
    } catch (error) {
      this.logger.error({ error }, 'Error stopping client')
    }
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      uptime: process.uptime(),
      connected: this.controlClient ? this.controlClient.isConnected() : false,
      tunnels: this.config.tunnels,
      tunnelStats: this.tunnelHandler ? this.tunnelHandler.getStats() : {},
      memory: process.memoryUsage(),
    }
  }
}

// Main execution
if (require.main === module) {
  const client = new NetGateClient()

  // Graceful shutdown handlers
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`)
    await client.stop()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  // Uncaught exception handler
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error)
    client.stop().then(() => process.exit(1))
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason)
    client.stop().then(() => process.exit(1))
  })

  // Start client
  client.start()
}

module.exports = NetGateClient
