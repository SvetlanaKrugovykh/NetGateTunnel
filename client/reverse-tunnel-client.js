
// Reverse Tunnel Client for tcp_reverse_tunnel_server.py
// Connects to the Python tunnel server and forwards local TCP connections

const net = require('net')

const SERVER_HOST = process.env.TUNNEL_SERVER_HOST || '127.0.0.1' // IP of tcp_reverse_tunnel_server.py
const SERVER_PORT = parseInt(process.env.TUNNEL_SERVER_PORT || '9001', 10) // Port for tunnel client (LISTEN_PORT+1)
const LOCAL_HOST = '127.0.0.1'
const LOCAL_PORT = parseInt((process.env.TUNNELS || '8778:8778').split(':')[1], 10)
const ENABLED = (process.env.TUNNEL_ENABLED || 'true').toLowerCase() === 'true'

if (!ENABLED) {
  console.log('Tunnel client is disabled by config')
  process.exit(0)
}

function connectTunnel() {
  const tunnelSocket = net.connect(SERVER_PORT, SERVER_HOST, () => {
    console.log(`[TunnelClient] Connected to tunnel server at ${SERVER_HOST}:${SERVER_PORT}`)
  })

  tunnelSocket.on('error', (err) => {
    console.log('[TunnelClient] tunnel server error', err)
    setTimeout(connectTunnel, 3000)
  })

  tunnelSocket.on('close', () => {
    console.log('[TunnelClient] tunnel server connection closed, reconnecting in 3s')
    setTimeout(connectTunnel, 3000)
  })

  // Listen for local connections to forward
  const localServer = net.createServer((localSocket) => {
    // Для каждого локального подключения связываем с tunnelSocket
    function forward(src, dst) {
      src.on('data', (data) => dst.write(data))
      src.on('end', () => dst.end())
      src.on('error', () => dst.destroy())
    }
    forward(localSocket, tunnelSocket)
    forward(tunnelSocket, localSocket)
  })
  localServer.listen(LOCAL_PORT, LOCAL_HOST, () => {
    console.log(`[TunnelClient] Listening for local connections on ${LOCAL_HOST}:${LOCAL_PORT}`)
  })
}

connectTunnel()
