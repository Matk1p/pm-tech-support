// Lightweight Vercel handler that forwards to relay service
const axios = require('axios');

const RELAY_SERVICE_URL = process.env.RELAY_SERVICE_URL || 'https://your-relay-service.com';

export default async function handler(req, res) {
  try {
    // Only handle POST requests to /lark/events
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🚀 Vercel forwarding webhook to relay service');
    
    // Forward the webhook to relay service immediately
    // Don't wait for response to avoid timeout
    const forwardPromise = axios.post(`${RELAY_SERVICE_URL}/lark/events`, req.body, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000, // Short timeout for forwarding
    }).catch(error => {
      console.error('⚠️ Error forwarding to relay service (non-blocking):', error.message);
    });

    // Respond to Lark immediately
    res.status(200).json({ 
      success: true, 
      forwarded: true,
      timestamp: new Date().toISOString()
    });

    // Fire and forget the forwarding
    forwardPromise;
    
  } catch (error) {
    console.error('❌ Vercel handler error:', error);
    
    // Still respond to Lark to prevent retries
    res.status(200).json({ 
      success: false, 
      error: 'Handler error',
      timestamp: new Date().toISOString()
    });
  }
} 