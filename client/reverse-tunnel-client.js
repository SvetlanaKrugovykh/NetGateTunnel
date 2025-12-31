

// Reverse Tunnel Client
// For each new connection from the server, create a new connection to the local service and pipe data between them

const net = require('net')

const SERVER_HOST = process.env.WHITE_SERVER_HOST || '127.0.0.1'
const SERVER_PORT = parseInt(process.env.WHITE_SERVER_PORT || '5555', 10)
const LOCAL_HOST = '127.0.0.1'
const LOCAL_PORT = parseInt((process.env.TUNNELS || '8778:8778').split(':')[1], 10)
const ENABLED = (process.env.TUNNEL_ENABLED || 'true').toLowerCase() === 'true'

if (!ENABLED) {
  console.log('Tunnel client is disabled by config')
  process.exit(0)
}

function startTunnelClient() {
  const server = net.createServer((serverSocket) => {
    // For each new connection from the tunnel server, connect to the local service
    const localSocket = net.connect(LOCAL_PORT, LOCAL_HOST, () => {
      // Pipe data between the tunnel server and the local service
      serverSocket.pipe(localSocket)
      localSocket.pipe(serverSocket)
    })
    localSocket.on('error', (err) => {
      console.log('[TunnelClient] local service connection error', err)
      serverSocket.destroy()
    })
    serverSocket.on('error', (err) => {
      console.log('[TunnelClient] server socket error', err)
      localSocket.destroy()
    })
    serverSocket.on('close', () => {
      localSocket.destroy()
    })
    localSocket.on('close', () => {
      serverSocket.destroy()
    })
  })

  server.listen(0, '127.0.0.1', () => {
    const localPort = server.address().port
    function connectToTunnelServer() {
      const tunnelSocket = net.connect(SERVER_PORT, SERVER_HOST, () => {
        console.log(`[TunnelClient] connected to tunnel server ${SERVER_HOST}:${SERVER_PORT}`)
      })
      tunnelSocket.on('error', (err) => {
        console.log('[TunnelClient] tunnel server error', err)
        tunnelSocket.destroy()
        setTimeout(connectToTunnelServer, 3000)
      })
      tunnelSocket.on('close', () => {
        setTimeout(connectToTunnelServer, 3000)
      })
      // When a new connection is received from the tunnel server, pipe it to the local server
      tunnelSocket.on('data', (data) => {
        // Not used in this simple implementation
      })
    }
    connectToTunnelServer()
  })
}

startTunnelClient()
