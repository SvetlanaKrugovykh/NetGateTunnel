

// Reverse Tunnel Server
// Accepts connections from client and proxies them to local service

const net = require('net')

const TUNNEL_PORT = parseInt(process.env.TUNNEL_PORT || '5555', 10)
const SERVICE_HOST = '127.0.0.1'
const SERVICE_PORT = parseInt(process.env.SERVICE_PORT || '8778', 10)

const server = net.createServer((clientSocket) => {
	console.log(`[TunnelServer] client connected from ${clientSocket.remoteAddress}:${clientSocket.remotePort}`)

	// Connect to local service
	const serviceSocket = net.connect(SERVICE_PORT, SERVICE_HOST, () => {
		console.log(`[TunnelServer] connected to service ${SERVICE_HOST}:${SERVICE_PORT}`)
		// Pipe data between client and service
		clientSocket.pipe(serviceSocket)
		serviceSocket.pipe(clientSocket)
	})

	serviceSocket.on('error', (err) => {
		console.log('[TunnelServer] service connection error', err)
		clientSocket.destroy()
	})

	clientSocket.on('error', (err) => {
		console.log('[TunnelServer] client socket error', err)
		serviceSocket.destroy()
	})

	clientSocket.on('close', () => {
		serviceSocket.destroy()
		console.log('[TunnelServer] client disconnected')
	})

	serviceSocket.on('close', () => {
		clientSocket.destroy()
		console.log('[TunnelServer] service disconnected')
	})
})

server.listen(TUNNEL_PORT, () => {
	console.log(`[TunnelServer] listening on 0.0.0.0:${TUNNEL_PORT}`)
})
