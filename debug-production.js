require('dotenv').config();
const { Client } = require('@larksuiteoapi/node-sdk');

console.log('🔍 Production Environment Debug Check\n');

// Check environment variables
const requiredEnvVars = [
  'LARK_APP_ID',
  'LARK_APP_SECRET', 
  'LARK_VERIFICATION_TOKEN',
  'LARK_ENCRYPT_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'OPENAI_API_KEY'
];

console.log('📋 Environment Variables:');
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: Set (${value.substring(0, 10)}...)`);
  } else {
    console.log(`❌ ${varName}: Missing`);
  }
});

// Check Lark client initialization
console.log('\n🤖 Lark Client Test:');
try {
  const larkClient = new Client({
    appId: process.env.LARK_APP_ID,
    appSecret: process.env.LARK_APP_SECRET
  });
  console.log('✅ Lark client initialized successfully');
  
  // Test getting tenant access token
  larkClient.auth.getTenantAccessToken()
    .then(token => {
      console.log('✅ Tenant access token obtained:', token.substring(0, 20) + '...');
    })
    .catch(error => {
      console.log('❌ Failed to get tenant access token:', error.message);
    });
    
} catch (error) {
  console.log('❌ Lark client initialization failed:', error.message);
}

// Environment-specific checks
console.log('\n🌍 Environment Info:');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('PORT:', process.env.PORT || 'not set');
console.log('Platform:', process.platform);

// Check if we're in a serverless environment
console.log('Serverless indicators:');
console.log('- VERCEL:', process.env.VERCEL ? 'Yes' : 'No');
console.log('- AWS_LAMBDA_FUNCTION_NAME:', process.env.AWS_LAMBDA_FUNCTION_NAME ? 'Yes' : 'No');
console.log('- NETLIFY:', process.env.NETLIFY ? 'Yes' : 'No');

console.log('\n💡 If any variables are missing, check your production environment settings!'); 