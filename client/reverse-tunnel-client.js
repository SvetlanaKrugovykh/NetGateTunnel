// Reverse Tunnel Client (HTTP only)
// Proxies HTTP requests from the tunnel server to the local HTTP service

const httpProxy = require('http-proxy')
const http = require('http')

const SERVER_PORT = parseInt(process.env.WHITE_SERVER_PORT || '5555', 10)
const LOCAL_PORT = parseInt((process.env.TUNNELS || '8778:8778').split(':')[1], 10)
const ENABLED = (process.env.TUNNEL_ENABLED || 'true').toLowerCase() === 'true'

if (!ENABLED) {
  console.log('Tunnel client is disabled by config')
  process.exit(0)
}

const proxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${LOCAL_PORT}`,
  proxyTimeout: 600000, 
  timeout: 600000,      
  selfHandleResponse: false
})

const server = http.createServer((req, res) => {
  proxy.web(req, res, {}, (err) => {
    res.writeHead(502)
    res.end('Proxy error')
  })
})

server.listen(SERVER_PORT, () => {
  console.log(`[TunnelClient] HTTP proxy listening on port ${SERVER_PORT}, forwarding to local service on port ${LOCAL_PORT}`)
})
