// Simple test HTTP server
const http = require('http')

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`
    <h1>NetGate Tunnel Test Server</h1>
    <p>Time: ${new Date().toISOString()}</p>
    <p>URL: ${req.url}</p>
    <p>Method: ${req.method}</p>
    <p><strong>✅ Tunnel is working!</strong></p>
  `)
})

server.listen(3000, 'localhost', () => {
  console.log('Test HTTP server running on http://localhost:3000')
  console.log('This is the LOCAL service that will be tunneled')
})
