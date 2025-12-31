


// Reverse Tunnel Server
// For each new connection from a remote client, create a new connection to the tunnel client and pipe data between them

const net = require('net')

const TUNNEL_PORT = parseInt(process.env.TUNNEL_PORT || '5555', 10)
const TUNNEL_CLIENT_HOST = process.env.TUNNEL_CLIENT_HOST || '127.0.0.1'
const TUNNEL_CLIENT_PORT = parseInt(process.env.TUNNEL_CLIENT_PORT || '5556', 10)

const server = net.createServer((remoteSocket) => {
	// For each new connection from the outside, connect to the tunnel client
	const tunnelClientSocket = net.connect(TUNNEL_CLIENT_PORT, TUNNEL_CLIENT_HOST, () => {
		remoteSocket.pipe(tunnelClientSocket)
		tunnelClientSocket.pipe(remoteSocket)
	})
	tunnelClientSocket.on('error', (err) => {
		console.log('[TunnelServer] tunnel client connection error', err)
		remoteSocket.destroy()
	})
	remoteSocket.on('error', (err) => {
		console.log('[TunnelServer] remote socket error', err)
		tunnelClientSocket.destroy()
	})
	remoteSocket.on('close', () => {
		tunnelClientSocket.destroy()
	})
	tunnelClientSocket.on('close', () => {
		remoteSocket.destroy()
	})
})

server.listen(TUNNEL_PORT, () => {
	console.log(`[TunnelServer] listening on 0.0.0.0:${TUNNEL_PORT}`)
})
