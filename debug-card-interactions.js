// Debug script for card interactions
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Debug webhook to capture all card interaction data
app.post('/debug-webhook', (req, res) => {
  console.log('🐛 DEBUG: Card interaction received');
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  console.log('📝 Body type:', typeof req.body);
  console.log('📊 Body keys:', Object.keys(req.body));
  
  // Always respond with success to avoid errors
  res.json({ 
    success: true,
    debug: true,
    timestamp: new Date().toISOString()
  });
});

// Test endpoint
app.get('/debug-status', (req, res) => {
  res.json({
    status: 'Debug webhook running',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🐛 Debug webhook server running on port ${PORT}`);
  console.log(`📍 Debug URL: http://localhost:${PORT}/debug-webhook`);
}); 