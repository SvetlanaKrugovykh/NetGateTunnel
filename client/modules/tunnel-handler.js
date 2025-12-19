/**
 * Tunnel Handler Module
 * Manages data connections for tunnels and proxies to local services
 */

const net = require('net')
const EventEmitter = require('events')

class TunnelHandler extends EventEmitter {
  constructor(config, logger, controlClient) {
    super()
    this.config = config
    this.logger = logger
    this.controlClient = controlClient
    this.dataServers = new Map(); // connectionId -> { server, port }
    this.activeConnections = new Map(); // connectionId -> { serverSocket, localSocket }
  }

  /**
   * Handle new connection request from server
   */
  async handleNewConnection(connectionId, remotePort, clientAddress) {
    this.logger.info(
      { connectionId, remotePort, clientAddress },
      'Handling new connection'
    )

    try {
      // Find local port for this remote port
      const tunnel = this.config.tunnels.find(t => t.remotePort === remotePort)
      
      if (!tunnel) {
        this.logger.error({ remotePort }, 'No tunnel configured for this port')
        this.controlClient.notifyConnectionClosed(connectionId, 'No tunnel configured')
        return
      }

      // Create temporary TCP server for this connection
      const dataPort = await this.createDataServer(connectionId, tunnel.localPort)

      // Notify server that we're ready
      this.controlClient.notifyConnectionReady(connectionId, dataPort)

      this.logger.info(
        { connectionId, dataPort, localPort: tunnel.localPort },
        'Connection ready'
      )

    } catch (error) {
      this.logger.error({ connectionId, error }, 'Failed to handle new connection')
      this.controlClient.notifyConnectionClosed(connectionId, error.message)
    }
  }

  /**
   * Create temporary data server for connection
   */
  createDataServer(connectionId, localPort) {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.handleDataConnection(connectionId, socket, localPort)
      })

      // Listen on random port
      server.listen(0, this.config.dataHost || 'localhost', () => {
        const port = server.address().port
        this.dataServers.set(connectionId, { server, port })
        
        // Cleanup server after connection timeout
        const timeout = setTimeout(() => {
          if (this.dataServers.has(connectionId)) {
            this.logger.warn({ connectionId }, 'Data server timeout, closing')
            this.cleanupDataServer(connectionId)
          }
        }, this.config.dataServerTimeout || 15000)

        this.dataServers.get(connectionId).timeout = timeout
        
        resolve(port)
      })

      server.on('error', (error) => {
        reject(error)
      })
    })
  }

  /**
   * Handle data connection from server
   */
  handleDataConnection(connectionId, serverSocket, localPort) {
    this.logger.info({ connectionId, localPort }, 'Data connection established')

    // Clear timeout if exists
    const dataServer = this.dataServers.get(connectionId)
    if (dataServer && dataServer.timeout) {
      clearTimeout(dataServer.timeout)
    }

    // Connect to local service
    const localSocket = net.createConnection({
      host: this.config.localHost || 'localhost',
      port: localPort,
    })

    localSocket.on('connect', () => {
      this.logger.info({ connectionId, localPort }, 'Connected to local service')

      // Pipe data bidirectionally
      serverSocket.pipe(localSocket)
      localSocket.pipe(serverSocket)

      this.activeConnections.set(connectionId, {
        serverSocket,
        localSocket,
        startTime: Date.now(),
      })
    })

    localSocket.on('error', (error) => {
      this.logger.error({ connectionId, localPort, error }, 'Local socket error')
      serverSocket.end()
      this.cleanupConnection(connectionId)
    })

    localSocket.on('close', () => {
      this.logger.info({ connectionId }, 'Local connection closed')
      serverSocket.end()
      this.cleanupConnection(connectionId)
    })

    serverSocket.on('error', (error) => {
      this.logger.error({ connectionId, error }, 'Server socket error')
      localSocket.end()
      this.cleanupConnection(connectionId)
    })

    serverSocket.on('close', () => {
      this.logger.info({ connectionId }, 'Server connection closed')
      localSocket.end()
      this.cleanupConnection(connectionId)
    })
  }

  /**
   * Cleanup connection
   */
  cleanupConnection(connectionId) {
    const conn = this.activeConnections.get(connectionId)
    if (conn) {
      conn.serverSocket.destroy()
      conn.localSocket.destroy()
      this.activeConnections.delete(connectionId)
    }

    this.cleanupDataServer(connectionId)
  }

  /**
   * Cleanup data server
   */
  cleanupDataServer(connectionId) {
    const dataServer = this.dataServers.get(connectionId)
    if (dataServer) {
      if (dataServer.timeout) {
        clearTimeout(dataServer.timeout)
      }
      
      dataServer.server.close(() => {
        this.logger.debug({ connectionId }, 'Data server closed')
      })
      
      this.dataServers.delete(connectionId)
    }
  }

  /**
   * Cleanup all connections and servers
   */
  cleanup() {
    this.logger.info('Cleaning up all connections')

    for (const connectionId of this.activeConnections.keys()) {
      this.cleanupConnection(connectionId)
    }

    for (const connectionId of this.dataServers.keys()) {
      this.cleanupDataServer(connectionId)
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeConnections: this.activeConnections.size,
      dataServers: this.dataServers.size,
    }
  }
}

module.exports = TunnelHandler
