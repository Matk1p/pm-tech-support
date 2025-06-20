// Health check endpoint for Next.js deployment
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      services: {
        lark: process.env.LARK_APP_ID ? 'configured' : 'missing',
        openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        supabase: process.env.SUPABASE_URL ? 'configured' : 'missing'
      }
    };

    // Check critical environment variables
    const requiredEnvVars = [
      'LARK_APP_ID',
      'LARK_APP_SECRET', 
      'OPENAI_API_KEY',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      healthStatus.status = 'degraded';
      healthStatus.warnings = `Missing environment variables: ${missingVars.join(', ')}`;
    }

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);

  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
} 