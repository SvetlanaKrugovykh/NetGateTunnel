/**
 * Control Client Module
 * Manages WebSocket connection to server for control plane communication
 */

const WebSocket = require('ws')
const EventEmitter = require('events')
const {
  MESSAGE_TYPES,
  createAuthMessage,
  createRegisterTunnelsMessage,
  createConnectionReadyMessage,
  createConnectionClosedMessage,
  createPongMessage,
  validateMessage,
} = require('../../common/protocol')
const { retry } = require('../../common/utils')

class ControlClient extends EventEmitter {
  constructor(config, logger) {
    super()
    this.config = config
    this.logger = logger
    this.ws = null
    this.authenticated = false
    this.reconnecting = false
    this.shouldReconnect = true
    this.clientId = null
  }

  /**
   * Connect to control server
   */
  async connect() {
    const serverUrl = `ws://${this.config.serverHost}:${this.config.serverPort}`
    
    this.logger.info({ serverUrl }, 'Connecting to control server')

    try {
      await retry(
        () => this.attemptConnection(serverUrl),
        {
          maxAttempts: this.config.reconnectAttempts || 5,
          initialDelay: this.config.reconnectDelay || 2000,
          maxDelay: this.config.reconnectMaxDelay || 30000,
          onRetry: (error, attempt, delay) => {
            this.logger.warn(
              { attempt, delay, error: error.message },
              'Retrying connection'
            )
          },
        }
      )

      this.logger.info('Connected to control server')
      this.emit('connected')

    } catch (error) {
      this.logger.error({ error }, 'Failed to connect to control server')
      throw error
    }
  }

  /**
   * Attempt single connection
   */
  attemptConnection(serverUrl) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(serverUrl)
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          ws.close()
          reject(new Error('Connection timeout'))
        }
      }, this.config.connectionTimeout || 10000)

      ws.on('open', async () => {
        this.logger.info('WebSocket connection opened')
        this.ws = ws
        this.setupWebSocketHandlers()

        try {
          await this.authenticate()
          clearTimeout(timeout)
          resolved = true
          resolve()
        } catch (error) {
          clearTimeout(timeout)
          ws.close()
          reject(error)
        }
      })

      ws.on('error', (error) => {
        if (!resolved) {
          clearTimeout(timeout)
          resolved = true
          reject(error)
        }
      })
    })
  }

  /**
   * Setup WebSocket event handlers
   */
  setupWebSocketHandlers() {
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())
        
        if (!validateMessage(message)) {
          this.logger.warn({ message }, 'Invalid message received')
          return
        }

        this.handleMessage(message)
      } catch (error) {
        this.logger.error({ error }, 'Error handling message')
      }
    })

    this.ws.on('close', () => {
      this.logger.warn('Control connection closed')
      this.authenticated = false
      this.emit('disconnected')

      if (this.shouldReconnect && !this.reconnecting) {
        this.scheduleReconnect()
      }
    })

    this.ws.on('error', (error) => {
      this.logger.error({ error }, 'WebSocket error')
    })

    this.ws.on('ping', () => {
      this.ws.pong()
    })
  }

  /**
   * Authenticate with server
   */
  async authenticate() {
    return new Promise((resolve, reject) => {
      const authMessage = createAuthMessage(this.config.authToken)
      
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'))
      }, 5000)

      const messageHandler = (data) => {
        try {
          const message = JSON.parse(data.toString())
          
          if (message.type === MESSAGE_TYPES.AUTH_SUCCESS) {
            clearTimeout(timeout)
            this.authenticated = true
            this.clientId = message.clientId
            this.ws.off('message', messageHandler)
            this.logger.info({ clientId: this.clientId }, 'Authenticated successfully')
            resolve()
          } else if (message.type === MESSAGE_TYPES.AUTH_FAILED) {
            clearTimeout(timeout)
            this.ws.off('message', messageHandler)
            reject(new Error(`Authentication failed: ${message.reason}`))
          }
        } catch (error) {
          // Ignore parse errors, let main handler deal with it
        }
      }

      this.ws.on('message', messageHandler)
      this.ws.send(JSON.stringify(authMessage))
    })
  }

  /**
   * Handle messages from server
   */
  handleMessage(message) {
    switch (message.type) {
      case MESSAGE_TYPES.TUNNEL_REGISTERED:
        this.emit('tunnelRegistered', message)
        break

      case MESSAGE_TYPES.TUNNEL_FAILED:
        this.emit('tunnelFailed', message)
        break

      case MESSAGE_TYPES.NEW_CONNECTION:
        this.emit('newConnection', message.connectionId, message.remotePort, message.clientAddress)
        break

      case MESSAGE_TYPES.CONNECTION_CLOSED:
        this.emit('connectionClosed', message.connectionId, message.reason)
        break

      case MESSAGE_TYPES.PING:
        this.sendPong()
        break

      case MESSAGE_TYPES.STATUS_RESPONSE:
        this.emit('status', message)
        break

      default:
        this.logger.warn({ type: message.type }, 'Unknown message type')
    }
  }

  /**
   * Register tunnels with server
   */
  registerTunnels(tunnels) {
    if (!this.authenticated) {
      throw new Error('Not authenticated')
    }

    const message = createRegisterTunnelsMessage(tunnels)
    this.send(message)
  }

  /**
   * Notify server that connection is ready
   */
  notifyConnectionReady(connectionId, dataPort) {
    const message = createConnectionReadyMessage(connectionId, dataPort)
    this.send(message)
  }

  /**
   * Notify server that connection is closed
   */
  notifyConnectionClosed(connectionId, reason) {
    const message = createConnectionClosedMessage(connectionId, reason)
    this.send(message)
  }

  /**
   * Send pong response
   */
  sendPong() {
    const message = createPongMessage()
    this.send(message)
  }

  /**
   * Send message to server
   */
  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('Cannot send message, connection not open')
      return false
    }

    try {
      this.ws.send(JSON.stringify(message))
      return true
    } catch (error) {
      this.logger.error({ error }, 'Error sending message')
      return false
    }
  }

  /**
   * Schedule reconnection
   */
  scheduleReconnect() {
    if (this.reconnecting) return

    this.reconnecting = true
    const delay = this.config.reconnectDelay || 5000

    this.logger.info({ delay }, 'Scheduling reconnection')

    setTimeout(async () => {
      try {
        await this.connect()
        this.reconnecting = false
        
        // Re-register tunnels after reconnection
        this.emit('reconnected')
      } catch (error) {
        this.reconnecting = false
        this.logger.error({ error }, 'Reconnection failed')
      }
    }, delay)
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this.shouldReconnect = false
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    this.authenticated = false
    this.logger.info('Disconnected from control server')
  }

  /**
   * Check if connected and authenticated
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN && this.authenticated
  }
}

module.exports = ControlClient
