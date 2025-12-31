// Reverse Tunnel Server (HTTP only)
// Proxies HTTP requests from external clients to the tunnel client (reverse-tunnel-client.js)

const httpProxy = require('http-proxy')
const http = require('http')

const TUNNEL_PORT = parseInt(process.env.TUNNEL_PORT || '5555', 10)
const TUNNEL_CLIENT_HOST = process.env.TUNNEL_CLIENT_HOST || '127.0.0.1'
const TUNNEL_CLIENT_PORT = parseInt(process.env.WHITE_SERVER_PORT || '5555', 10)

const proxy = httpProxy.createProxyServer({ target: `http://${TUNNEL_CLIENT_HOST}:${TUNNEL_CLIENT_PORT}` })

const server = http.createServer((req, res) => {
	proxy.web(req, res, {}, (err) => {
		res.writeHead(502)
		res.end('Proxy error')
	})
})

server.listen(TUNNEL_PORT, () => {
	console.log(`[TunnelServer] HTTP proxy listening on 0.0.0.0:${TUNNEL_PORT}, forwarding to tunnel client on ${TUNNEL_CLIENT_HOST}:${TUNNEL_CLIENT_PORT}`)
})
