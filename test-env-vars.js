// Simple test script to check environment variables in Vercel

const express = require('express');
const app = express();
app.use(express.json());

// Test endpoint to check environment variables
app.get('/test-env', (req, res) => {
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY', 
    'LARK_APP_ID',
    'LARK_APP_SECRET',
    'LARK_SUPPORT_GROUP_ID',
    'OPENAI_API_KEY'
  ];

  const envStatus = {};
  
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    envStatus[varName] = {
      exists: !!value,
      hasValue: !!(value && value.trim() && value !== 'your_placeholder_here'),
      preview: value ? `${value.substring(0, 8)}...` : null
    };
  });

  res.json({
    environment: process.env.NODE_ENV || 'unknown',
    vercel: !!process.env.VERCEL,
    timestamp: new Date().toISOString(),
    variables: envStatus
  });
});

app.listen(3000);
module.exports = app; 