const express = require('express');
const http = require('http');

function keep_alive() {
  const app = express();
  const port = 5000;
  
  // Health check endpoint
  app.get('/', (req, res) => {
    res.json({
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  });
  
  // Health endpoint for Railway
  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });
  
  // Ping endpoint
  app.get('/ping', (req, res) => {
    res.send('pong');
  });

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Afk bot is listening on port ${port}`);
    
    // Self-ping every 5 minutes to keep Railway awake
    setInterval(() => {
      const options = {
        hostname: 'localhost',
        port: port,
        path: '/ping',
        method: 'GET',
        timeout: 5000
      };
      
      const req = http.request(options, (res) => {
        // Self-ping successful
      });
      
      req.on('error', (err) => {
        // Ignore self-ping errors
      });
      
      req.on('timeout', () => {
        req.destroy();
      });
      
      req.end();
    }, 300000); // 5 minutes
  });
  
  // Handle server errors
  server.on('error', (err) => {
    console.error('[Server] Error:', err.message);
  });
}

module.exports = { keep_alive };
