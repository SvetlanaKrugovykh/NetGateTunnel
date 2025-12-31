
// Reverse Tunnel Client
// Connects to a server with public IP and proxies connections to local service
// No Russian comments and no semicolons

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

function connectTunnel() {
  const tunnelSocket = net.connect(SERVER_PORT, SERVER_HOST, () => {
    console.log(`[Tunnel] connected to server ${SERVER_HOST}:${SERVER_PORT}`)
  })

  tunnelSocket.on('data', () => {
    // On NEW_CONN from server, open connection to local service
    const localSocket = net.connect(LOCAL_PORT, LOCAL_HOST, () => {
      // Pipe data between tunnel and local service
      tunnelSocket.pipe(localSocket, { end: false })
      localSocket.pipe(tunnelSocket, { end: false })
      tunnelSocket.write('READY')
    })
    localSocket.on('error', (err) => {
      console.log('[Tunnel] local connection error', err)
      localSocket.destroy()
    })
  })

  tunnelSocket.on('close', () => {
    console.log('[Tunnel] tunnel closed, reconnecting in 3s')
    setTimeout(connectTunnel, 3000)
  })

  tunnelSocket.on('error', (err) => {
    console.log('[Tunnel] error', err)
    tunnelSocket.destroy()
  })
}

connectTunnel()
