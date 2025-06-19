// Health check endpoint
module.exports = async (req, res) => {
  console.log('🏥 Health check endpoint accessed');
  console.log('🏥 Method:', req.method);
  console.log('🏥 Timestamp:', new Date().toISOString());
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      config: {
        hasLarkAppId: !!process.env.LARK_APP_ID,
        hasLarkAppSecret: !!process.env.LARK_APP_SECRET,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        vercelRegion: process.env.VERCEL_REGION || 'unknown',
        vercelUrl: process.env.VERCEL_URL || 'unknown'
      },
      endpoints: [
        '/api/health',
        '/api/test-network',
        '/api/webhook'
      ]
    };
    
    console.log('🏥 Health check successful:', healthStatus);
    
    res.status(200).json(healthStatus);
    
  } catch (error) {
    console.error('🏥 Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}; 