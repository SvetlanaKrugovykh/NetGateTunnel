/**
 * NetGateTunnel Server
 * Main entry point for the tunnel server
 */


const net = require('net')

const TUNNEL_PORT = process.env.TUNNEL_PORT ? parseInt(process.env.TUNNEL_PORT, 10) : 5555
const SERVICE_PORT = process.env.SERVICE_PORT ? parseInt(process.env.SERVICE_PORT, 10) : 8778

let tunnelSocket = null
let pendingSockets = []

const tunnelServer = net.createServer((socket) => {
  console.log('[Tunnel] client connected to tunnel')
  tunnelSocket = socket

  pendingSockets.forEach((pending) => {
    tunnelSocket.write('NEW_CONN')
    tunnelSocket.once('data', () => {
      pending.pipe(tunnelSocket, { end: false })
      tunnelSocket.pipe(pending, { end: false })
    })
  })
  pendingSockets = []

  socket.on('close', () => {
    console.log('[Tunnel] tunnel closed')
    tunnelSocket = null
  })
})
tunnelServer.listen(TUNNEL_PORT, () => {
  console.log(`[Tunnel] waiting for client on port ${TUNNEL_PORT}`)
})

const serviceServer = net.createServer((clientSocket) => {
  if (!tunnelSocket) {
    clientSocket.end()
    console.log('[Service] no tunnel, connection refused')
    return
  }
  tunnelSocket.write('NEW_CONN')
  tunnelSocket.once('data', () => {
    clientSocket.pipe(tunnelSocket, { end: false })
    tunnelSocket.pipe(clientSocket, { end: false })
  })
})
serviceServer.listen(SERVICE_PORT, () => {
  console.log(`[Service] listening on external port ${SERVICE_PORT}`)
})
