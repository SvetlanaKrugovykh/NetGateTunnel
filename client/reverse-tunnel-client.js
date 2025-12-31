

// Reverse Tunnel Client for tcp_reverse_tunnel_server.py
// For each connection from the Python tunnel server, create a new connection to the local service and pipe data between them

const net = require('net')

const SERVER_HOST = process.env.WHITE_SERVER_HOST || '127.0.0.1' // IP of tcp_reverse_tunnel_server.py
const SERVER_PORT = parseInt(process.env.WHITE_SERVER_PORT || '9001', 10) // Port for tunnel client (LISTEN_PORT+1)
const LOCAL_HOST = '127.0.0.1'
const LOCAL_PORT = parseInt((process.env.TUNNELS || '8777:8777').split(':')[1], 10)
const ENABLED = (process.env.TUNNEL_ENABLED || 'true').toLowerCase() === 'true'

if (!ENABLED) {
  console.log('Tunnel client is disabled by config')
  process.exit(0)
}

function startTunnelClient() {
  function connectToServer() {
    const tunnelSocket = net.connect(SERVER_PORT, SERVER_HOST, () => {
      console.log(`[TunnelClient] Connected to tunnel server at ${SERVER_HOST}:${SERVER_PORT}`)
    })

    tunnelSocket.on('error', (err) => {
      console.log('[TunnelClient] tunnel server error', err)
      setTimeout(connectToServer, 3000)
    })

    tunnelSocket.on('close', () => {
      console.log('[TunnelClient] tunnel server connection closed, reconnecting in 3s')
      setTimeout(connectToServer, 3000)
    })

    // For each incoming connection from the server, create a new connection to the local service
    tunnelSocket.on('data', function handler(data) {
      // Create a connection to the local service
      const localSocket = net.connect(LOCAL_PORT, LOCAL_HOST, () => {
        localSocket.write(data)
      })
      tunnelSocket.pipe(localSocket)
      localSocket.pipe(tunnelSocket)
      localSocket.on('error', (err) => {
        console.log('[TunnelClient] local service error', err)
        localSocket.destroy()
      })
      localSocket.on('close', () => {
        tunnelSocket.unpipe(localSocket)
      })
    })
  }
  connectToServer()
}

startTunnelClient()
