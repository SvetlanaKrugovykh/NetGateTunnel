/**
 * Tunnel Manager Module
 * Manages port listeners for tunnels and routes connections
 */

const net = require('net')
const EventEmitter = require('events')
const { isPortAllowed, generateConnectionId } = require('../../common/utils')
const { createNewConnectionMessage } = require('../../common/protocol')

class TunnelManager extends EventEmitter {
  constructor(config, logger, controlServer) {
    super()
    this.config = config
    this.logger = logger
    this.controlServer = controlServer
    this.tunnels = new Map(); // remotePort -> { clientId, localPort, name, server, connections, incomingSockets }
    this.pendingConnections = new Map(); // connectionId -> { socket, timeout }
  }

  /**
   * Register tunnels for a client
   */
  async registerTunnels(clientId, tunnelConfigs) {
    const results = []

    for (const tunnel of tunnelConfigs) {
      try {
        const result = await this.registerTunnelWithRetry(clientId, tunnel)
        results.push(result)
      } catch (error) {
        this.logger.error({ clientId, tunnel, error }, 'Failed to register tunnel')
        results.push({
          success: false,
          remotePort: tunnel.remotePort,
          error: error.message,
        })
      }
    }

    return results
  }

  /**
   * Register tunnel with automatic retry for EADDRINUSE
   */
  async registerTunnelWithRetry(clientId, config, attempt = 0) {
    const maxRetries = 3
    const retryDelay = 500

    try {
      return await this.registerTunnel(clientId, config)
    } catch (error) {
      // Retry on EADDRINUSE (port in TIME_WAIT)
      if (error.code === 'EADDRINUSE' && attempt < maxRetries) {
        this.logger.warn(
          { remotePort: config.remotePort, attempt: attempt + 1, maxRetries },
          'Port in use, retrying...'
        )
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        return this.registerTunnelWithRetry(clientId, config, attempt + 1)
      }
      throw error
    }
  }

  /**
   * Register single tunnel
   */
  async registerTunnel(clientId, config) {
    const { remotePort, localPort, name, protocol = 'tcp' } = config

    // Check if port is already in use
    if (this.tunnels.has(remotePort)) {
      throw new Error(`Port ${remotePort} already in use`)
    }

    // Check if port is allowed
    if (!isPortAllowed(remotePort, this.config.allowedPorts)) {
      throw new Error(`Port ${remotePort} not allowed`)
    }

    // Create TCP server for this tunnel
    const server = net.createServer((socket) => {
      this.handleIncomingConnection(clientId, remotePort, socket)
    })

    // Enable SO_REUSEADDR to allow quick port reuse
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        this.logger.warn(
          { remotePort, error: error.message },
          'Port in TIME_WAIT, retrying in 1 second...'
        )
      }
    })

    // Start listening with SO_REUSEADDR enabled by default in Node.js
    await new Promise((resolve, reject) => {
      server.listen(remotePort, this.config.host || '0.0.0.0', () => {
        this.logger.info(
          { clientId, remotePort, localPort, name },
          'Tunnel registered'
        )
        resolve()
      })

      server.on('error', (error) => {
        reject(error)
      })
    })

    // Store tunnel info
    this.tunnels.set(remotePort, {
      clientId,
      localPort,
      name,
      protocol,
      server,
      connections: new Map(),
      incomingSockets: new Set(), // Track all incoming sockets
      stats: {
        totalConnections: 0,
        activeConnections: 0,
        bytesIn: 0,
        bytesOut: 0,
      },
    })

    return {
      success: true,
      remotePort,
      localPort,
      name,
    }
  }

  /**
   * Handle incoming connection to tunnel
   */
  handleIncomingConnection(clientId, remotePort, socket) {
    const connectionId = generateConnectionId()
    const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`
    
    this.logger.info(
      { clientId, remotePort, connectionId, clientAddress },
      'New incoming connection'
    )

    const tunnel = this.tunnels.get(remotePort)
    if (!tunnel) {
      this.logger.error({ remotePort }, 'Tunnel not found')
      socket.end()
      return
    }

    // Track incoming socket to ensure proper cleanup
    tunnel.incomingSockets.add(socket)
    socket.on('close', () => {
      tunnel.incomingSockets.delete(socket)
    })
    socket.on('error', () => {
      tunnel.incomingSockets.delete(socket)
    })

    tunnel.stats.totalConnections++
    tunnel.stats.activeConnections++

    // Send new connection message to client
    const message = createNewConnectionMessage(connectionId, remotePort, clientAddress)
    const sent = this.controlServer.sendToClient(clientId, message)

    if (!sent) {
      this.logger.error({ clientId, connectionId }, 'Failed to notify client')
      socket.end()
      tunnel.stats.activeConnections--
      return
    }

    // Store pending connection with timeout
    const timeout = setTimeout(() => {
      this.logger.warn({ connectionId }, 'Connection ready timeout')
      socket.end()
      this.pendingConnections.delete(connectionId)
      tunnel.stats.activeConnections--
    }, this.config.connectionTimeout || 10000)

    this.pendingConnections.set(connectionId, {
      socket,
      timeout,
      remotePort,
    })

    socket.on('error', (error) => {
      this.logger.error({ connectionId, error }, 'Client socket error')
      this.cleanupConnection(connectionId)
    })

    socket.on('close', () => {
      this.cleanupConnection(connectionId)
    })
  }

  /**
   * Handle connection ready from client
   */
  handleConnectionReady(clientId, connectionId, dataPort) {
    const pending = this.pendingConnections.get(connectionId)
    if (!pending) {
      this.logger.warn({ connectionId }, 'Pending connection not found')
      return
    }

    clearTimeout(pending.timeout)
    this.pendingConnections.delete(connectionId)

    const { socket: clientSocket, remotePort } = pending
    const tunnel = this.tunnels.get(remotePort)

    if (!tunnel) {
      clientSocket.end()
      return
    }

    // Connect to client's data port
    const dataSocket = net.createConnection({
      host: this.config.clientDataHost || 'localhost',
      port: dataPort,
    })

    dataSocket.on('connect', () => {
      this.logger.info({ connectionId, dataPort }, 'Connected to client data port')

      // Pipe data between sockets
      clientSocket.pipe(dataSocket)
      dataSocket.pipe(clientSocket)

      // Track data transfer
      clientSocket.on('data', (chunk) => {
        tunnel.stats.bytesIn += chunk.length
      })

      dataSocket.on('data', (chunk) => {
        tunnel.stats.bytesOut += chunk.length
      })

      tunnel.connections.set(connectionId, {
        clientSocket,
        dataSocket,
        startTime: Date.now(),
      })
    })

    dataSocket.on('error', (error) => {
      this.logger.error({ connectionId, error }, 'Data socket error')
      clientSocket.end()
      dataSocket.destroy()
      tunnel.stats.activeConnections--
    })

    dataSocket.on('close', () => {
      clientSocket.end()
      tunnel.connections.delete(connectionId)
      tunnel.stats.activeConnections--
    })

    clientSocket.on('close', () => {
      dataSocket.end()
      tunnel.connections.delete(connectionId)
      tunnel.stats.activeConnections--
    })
  }

  /**
   * Cleanup connection
   */
  cleanupConnection(connectionId) {
    const pending = this.pendingConnections.get(connectionId)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingConnections.delete(connectionId)
      
      const tunnel = this.tunnels.get(pending.remotePort)
      if (tunnel) {
        tunnel.stats.activeConnections--
      }
    }

    // Check active connections in tunnels
    for (const tunnel of this.tunnels.values()) {
      const conn = tunnel.connections.get(connectionId)
      if (conn) {
        conn.clientSocket.destroy()
        conn.dataSocket.destroy()
        tunnel.connections.delete(connectionId)
        tunnel.stats.activeConnections--
        break
      }
    }
  }

  /**
   * Unregister all tunnels for a client
   */
  async unregisterClientTunnels(clientId) {
    const portsToRemove = []

    for (const [remotePort, tunnel] of this.tunnels.entries()) {
      if (tunnel.clientId === clientId) {
        portsToRemove.push(remotePort)
      }
    }

    for (const port of portsToRemove) {
      await this.unregisterTunnel(port)
    }

    this.logger.info({ clientId, count: portsToRemove.length }, 'Unregistered client tunnels')
  }

  /**
   * Unregister single tunnel
   */
  async unregisterTunnel(remotePort) {
    const tunnel = this.tunnels.get(remotePort)
    if (!tunnel) {
      return
    }

    // Close all active connections
    for (const conn of tunnel.connections.values()) {
      try {
        conn.clientSocket.destroy()
        conn.dataSocket.destroy()
      } catch (error) {
        this.logger.warn({ error }, 'Error destroying connection')
      }
    }
    tunnel.connections.clear()

    // Close all pending connections
    for (const [connectionId, pending] of this.pendingConnections.entries()) {
      if (pending.remotePort === remotePort) {
        try {
          clearTimeout(pending.timeout)
          pending.socket.destroy()
        } catch (error) {
          this.logger.warn({ error }, 'Error destroying pending socket')
        }
        this.pendingConnections.delete(connectionId)
      }
    }

    // Close server listener
    await new Promise((resolve) => {
      tunnel.server.close(() => {
        this.logger.info({ remotePort }, 'Tunnel unregistered')
        resolve()
      })
    })

    this.tunnels.delete(remotePort)

    // Small delay to allow OS to fully release the port
    // (avoid TIME_WAIT issues on quick re-registration)
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  /**
   * Get tunnel statistics
   */
  getTunnelStats(remotePort) {
    const tunnel = this.tunnels.get(remotePort)
    return tunnel ? tunnel.stats : null
  }

  /**
   * Get all tunnels info
   */
  getAllTunnels() {
    return Array.from(this.tunnels.entries()).map(([remotePort, tunnel]) => ({
      remotePort,
      localPort: tunnel.localPort,
      name: tunnel.name,
      protocol: tunnel.protocol,
      clientId: tunnel.clientId,
      stats: tunnel.stats,
    }))
  }

  /**
   * Stop all tunnels
   */
  async stop() {
    const ports = Array.from(this.tunnels.keys())
    for (const port of ports) {
      await this.unregisterTunnel(port)
    }
    this.logger.info('All tunnels stopped')
  }
}

module.exports = TunnelManager
