// Test production endpoints
const chatId = 'oc_17c67e6bb7af95be02f8e5b3e1e66a20'; // Replace with actual chat ID from your logs

async function testProductionEndpoints(baseUrl) {
  console.log(`🧪 Testing production endpoints at: ${baseUrl}\n`);
  
  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health:', healthData);
    
    // Test 2: Environment check
    console.log('\n2. Testing environment...');
    const envResponse = await fetch(`${baseUrl}/env-check`);
    const envData = await envResponse.json();
    console.log('📋 Environment:', envData);
    
    // Test 3: Database connection
    console.log('\n3. Testing database connection...');
    const dbResponse = await fetch(`${baseUrl}/test-db-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const dbData = await dbResponse.json();
    console.log('🗄️ Database:', dbData);
    
    // Test 4: Analytics (if message logs exist)
    console.log('\n4. Testing analytics...');
    const analyticsResponse = await fetch(`${baseUrl}/api/analytics/dashboard`);
    const analyticsData = await analyticsResponse.json();
    console.log('📊 Analytics:', analyticsData);
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Usage: node test-production-endpoints.js https://your-domain.com
const baseUrl = process.argv[2] || 'http://localhost:3001';
testProductionEndpoints(baseUrl); 