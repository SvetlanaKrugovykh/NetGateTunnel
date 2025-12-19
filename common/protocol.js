/**
 * Common protocol definitions for NetGateTunnel
 * Defines message types and structures for communication between client and server
 */

const MESSAGE_TYPES = {
  // Control messages
  AUTH: 'auth',
  AUTH_SUCCESS: 'auth_success',
  AUTH_FAILED: 'auth_failed',
  
  // Tunnel management
  REGISTER_TUNNELS: 'register_tunnels',
  TUNNEL_REGISTERED: 'tunnel_registered',
  TUNNEL_FAILED: 'tunnel_failed',
  UNREGISTER_TUNNEL: 'unregister_tunnel',
  
  // Connection management
  NEW_CONNECTION: 'new_connection',
  CONNECTION_READY: 'connection_ready',
  CONNECTION_CLOSED: 'connection_closed',
  CONNECTION_ERROR: 'connection_error',
  
  // Keepalive
  PING: 'ping',
  PONG: 'pong',
  
  // Status
  STATUS_REQUEST: 'status_request',
  STATUS_RESPONSE: 'status_response',
}

const ERROR_CODES = {
  AUTH_FAILED: 'AUTH_FAILED',
  TUNNEL_PORT_IN_USE: 'TUNNEL_PORT_IN_USE',
  TUNNEL_PORT_NOT_ALLOWED: 'TUNNEL_PORT_NOT_ALLOWED',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
}

/**
 * Create authentication message
 */
function createAuthMessage(token) {
  return {
    type: MESSAGE_TYPES.AUTH,
    token,
    timestamp: Date.now(),
  }
}

/**
 * Create tunnel registration message
 */
function createRegisterTunnelsMessage(tunnels) {
  return {
    type: MESSAGE_TYPES.REGISTER_TUNNELS,
    tunnels, // Array of {remotePort, localPort, name, protocol}
    timestamp: Date.now(),
  }
}

/**
 * Create new connection message
 */
function createNewConnectionMessage(connectionId, remotePort, clientAddress) {
  return {
    type: MESSAGE_TYPES.NEW_CONNECTION,
    connectionId,
    remotePort,
    clientAddress,
    timestamp: Date.now(),
  }
}

/**
 * Create connection ready message
 */
function createConnectionReadyMessage(connectionId, dataPort) {
  return {
    type: MESSAGE_TYPES.CONNECTION_READY,
    connectionId,
    dataPort,
    timestamp: Date.now(),
  }
}

/**
 * Create connection closed message
 */
function createConnectionClosedMessage(connectionId, reason) {
  return {
    type: MESSAGE_TYPES.CONNECTION_CLOSED,
    connectionId,
    reason,
    timestamp: Date.now(),
  }
}

/**
 * Create ping message
 */
function createPingMessage() {
  return {
    type: MESSAGE_TYPES.PING,
    timestamp: Date.now(),
  }
}

/**
 * Create pong message
 */
function createPongMessage() {
  return {
    type: MESSAGE_TYPES.PONG,
    timestamp: Date.now(),
  }
}

/**
 * Create status request message
 */
function createStatusRequestMessage() {
  return {
    type: MESSAGE_TYPES.STATUS_REQUEST,
    timestamp: Date.now(),
  }
}

/**
 * Validate message structure
 */
function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    return false
  }
  
  if (!message.type || !Object.values(MESSAGE_TYPES).includes(message.type)) {
    return false
  }
  
  return true
}

module.exports = {
  MESSAGE_TYPES,
  ERROR_CODES,
  createAuthMessage,
  createRegisterTunnelsMessage,
  createNewConnectionMessage,
  createConnectionReadyMessage,
  createConnectionClosedMessage,
  createPingMessage,
  createPongMessage,
  createStatusRequestMessage,
  validateMessage,
}
