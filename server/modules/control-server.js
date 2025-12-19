/**
 * Control Server Module
 * Manages WebSocket connections with clients for control plane communication
 */

const WebSocket = require('ws')
const EventEmitter = require('events')
const { MESSAGE_TYPES, validateMessage } = require('../../common/protocol')
const { generateClientId } = require('../../common/utils')

class ControlServer extends EventEmitter {
  constructor(config, logger) {
    super()
    this.config = config
    this.logger = logger
    this.wss = null
    this.clients = new Map(); // clientId -> { ws, tunnels, lastPing }
  }

  /**
   * Start control server
   */
  start() {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocket.Server({
          port: this.config.controlPort,
          host: this.config.host || '0.0.0.0',
        })

        this.wss.on('connection', (ws, req) => this.handleConnection(ws, req))
        this.wss.on('error', (error) => {
          this.logger.error({ error }, 'Control server error')
          this.emit('error', error)
        })

        this.logger.info(
          { port: this.config.controlPort },
          'Control server started'
        )

        // Start ping interval
        this.startPingInterval()

        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, req) {
    const clientAddress = req.socket.remoteAddress
    this.logger.info({ clientAddress }, 'New control connection')

    let clientId = null
    let authenticated = false

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())

        if (!validateMessage(message)) {
          this.logger.warn({ message }, 'Invalid message received')
          return
        }

        // Authentication required first
        if (!authenticated) {
          if (message.type === MESSAGE_TYPES.AUTH) {
            const authResult = this.authenticateClient(message.token)
            if (authResult.success) {
              authenticated = true
              clientId = generateClientId()
              
              this.clients.set(clientId, {
                ws,
                tunnels: [],
                lastPing: Date.now(),
                address: clientAddress,
              })

              ws.send(JSON.stringify({
                type: MESSAGE_TYPES.AUTH_SUCCESS,
                clientId,
              }))

              this.logger.info({ clientId, clientAddress }, 'Client authenticated')
              this.emit('clientAuthenticated', clientId)
            } else {
              ws.send(JSON.stringify({
                type: MESSAGE_TYPES.AUTH_FAILED,
                reason: authResult.reason,
              }))
              ws.close()
            }
          } else {
            ws.close()
          }
          return
        }

        // Handle authenticated messages
        this.handleMessage(clientId, message)

      } catch (error) {
        this.logger.error({ error }, 'Error handling message')
      }
    })

    ws.on('close', () => {
      if (clientId) {
        this.logger.info({ clientId }, 'Client disconnected')
        this.emit('clientDisconnected', clientId)
        this.clients.delete(clientId)
      }
    })

    ws.on('error', (error) => {
      this.logger.error({ clientId, error }, 'WebSocket error')
    })

    ws.on('pong', () => {
      if (clientId && this.clients.has(clientId)) {
        this.clients.get(clientId).lastPing = Date.now()
      }
    })
  }

  /**
   * Authenticate client by token
   */
  authenticateClient(token) {
    if (!token) {
      return { success: false, reason: 'No token provided' }
    }

    const validTokens = this.config.authTokens || []
    
    if (validTokens.length === 0) {
      this.logger.warn('No auth tokens configured, allowing all connections')
      return { success: true }
    }

    if (validTokens.includes(token)) {
      return { success: true }
    }

    return { success: false, reason: 'Invalid token' }
  }

  /**
   * Handle authenticated message from client
   */
  handleMessage(clientId, message) {
    switch (message.type) {
      case MESSAGE_TYPES.REGISTER_TUNNELS:
        this.handleRegisterTunnels(clientId, message)
        break

      case MESSAGE_TYPES.CONNECTION_READY:
        this.emit('connectionReady', clientId, message.connectionId, message.dataPort)
        break

      case MESSAGE_TYPES.CONNECTION_CLOSED:
        this.emit('connectionClosed', clientId, message.connectionId, message.reason)
        break

      case MESSAGE_TYPES.PONG:
        // Already handled in pong event
        break

      case MESSAGE_TYPES.STATUS_REQUEST:
        this.handleStatusRequest(clientId)
        break

      default:
        this.logger.warn({ type: message.type }, 'Unknown message type')
    }
  }

  /**
   * Handle tunnel registration request
   */
  handleRegisterTunnels(clientId, message) {
    const client = this.clients.get(clientId)
    if (!client) return

    const { tunnels } = message
    
    this.logger.info({ clientId, tunnels }, 'Registering tunnels')
    
    client.tunnels = tunnels
    this.emit('registerTunnels', clientId, tunnels)
  }

  /**
   * Handle status request
   */
  handleStatusRequest(clientId) {
    const client = this.clients.get(clientId)
    if (!client) return

    const status = {
      type: MESSAGE_TYPES.STATUS_RESPONSE,
      clientId,
      tunnels: client.tunnels,
      uptime: process.uptime(),
      timestamp: Date.now(),
    }

    client.ws.send(JSON.stringify(status))
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId)
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      client.ws.send(JSON.stringify(message))
      return true
    } catch (error) {
      this.logger.error({ clientId, error }, 'Error sending message to client')
      return false
    }
  }

  /**
   * Start ping interval to keep connections alive
   */
  startPingInterval() {
    const pingInterval = this.config.pingInterval || 30000
    const pingTimeout = this.config.pingTimeout || 60000

    setInterval(() => {
      const now = Date.now()
      
      for (const [clientId, client] of this.clients.entries()) {
        // Check if client is alive
        if (now - client.lastPing > pingTimeout) {
          this.logger.warn({ clientId }, 'Client ping timeout, closing connection')
          client.ws.close()
          this.clients.delete(clientId)
          continue
        }

        // Send ping
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping()
        }
      }
    }, pingInterval)
  }

  /**
   * Get client by ID
   */
  getClient(clientId) {
    return this.clients.get(clientId)
  }

  /**
   * Get all connected clients
   */
  getAllClients() {
    return Array.from(this.clients.entries()).map(([clientId, client]) => ({
      clientId,
      address: client.address,
      tunnels: client.tunnels,
      lastPing: client.lastPing,
    }))
  }

  /**
   * Stop control server
   */
  async stop() {
    if (this.wss) {
      for (const client of this.clients.values()) {
        client.ws.close()
      }
      
      this.clients.clear()
      
      return new Promise((resolve) => {
        this.wss.close(() => {
          this.logger.info('Control server stopped')
          resolve()
        })
      })
    }
  }
}

module.exports = ControlServer
