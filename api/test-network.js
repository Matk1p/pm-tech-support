// Network connectivity test endpoint for Vercel debugging
module.exports = async (req, res) => {
  console.log('🌐 Network connectivity test endpoint hit');
  console.log('🌐 Method:', req.method);
  console.log('🌐 Headers:', req.headers);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    console.log('🌐 Testing basic connectivity...');
    
    // Test 1: Basic environment check
    const envCheck = {
      nodeVersion: process.version,
      platform: process.platform,
      hasLarkAppId: !!process.env.LARK_APP_ID,
      hasLarkAppSecret: !!process.env.LARK_APP_SECRET,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      timestamp: new Date().toISOString()
    };
    
    console.log('🌐 Environment check:', envCheck);
    
    // Test 2: Simple HTTPS connectivity test
    console.log('🌐 Testing HTTPS connectivity to example.com...');
    const https = require('https');
    const testHttpsConnectivity = () => {
      return new Promise((resolve, reject) => {
        const req = https.get('https://example.com', {
          timeout: 5000
        }, (res) => {
          console.log('🌐 HTTPS test status code:', res.statusCode);
          resolve({
            success: true,
            statusCode: res.statusCode,
            headers: res.headers
          });
        });
        
        req.on('error', (error) => {
          console.log('🌐 HTTPS test error:', error.message);
          reject(error);
        });
        
        req.on('timeout', () => {
          console.log('🌐 HTTPS test timeout');
          req.destroy();
          reject(new Error('HTTPS request timeout'));
        });
      });
    };
    
    let httpsTest;
    try {
      httpsTest = await testHttpsConnectivity();
      console.log('🌐 HTTPS test successful:', httpsTest);
    } catch (error) {
      console.log('🌐 HTTPS test failed:', error.message);
      httpsTest = {
        success: false,
        error: error.message
      };
    }
    
    // Test 3: DNS resolution test
    console.log('🌐 Testing DNS resolution...');
    const dns = require('dns');
    const testDNS = () => {
      return new Promise((resolve, reject) => {
        dns.lookup('open.larksuite.com', (err, address, family) => {
          if (err) {
            console.log('🌐 DNS lookup error:', err.message);
            reject(err);
          } else {
            console.log('🌐 DNS lookup successful:', { address, family });
            resolve({ address, family });
          }
        });
      });
    };
    
    let dnsTest;
    try {
      dnsTest = await testDNS();
      console.log('🌐 DNS test successful:', dnsTest);
    } catch (error) {
      console.log('🌐 DNS test failed:', error.message);
      dnsTest = {
        success: false,
        error: error.message
      };
    }
    
    // Test 4: Fetch to Lark API (without auth, just connectivity)
    console.log('🌐 Testing connectivity to Lark API...');
    let larkConnectivityTest;
    try {
      const larkResponse = await fetch('https://open.larksuite.com', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      console.log('🌐 Lark connectivity test status:', larkResponse.status);
      larkConnectivityTest = {
        success: true,
        status: larkResponse.status,
        statusText: larkResponse.statusText
      };
    } catch (error) {
      console.log('🌐 Lark connectivity test failed:', error.message);
      larkConnectivityTest = {
        success: false,
        error: error.message,
        errorType: error.constructor.name
      };
    }
    
    // Compile results
    const results = {
      timestamp: new Date().toISOString(),
      environment: envCheck,
      httpsConnectivity: httpsTest,
      dnsResolution: dnsTest,
      larkConnectivity: larkConnectivityTest,
      summary: {
        allTestsPassed: httpsTest.success && dnsTest.success && larkConnectivityTest.success,
        failedTests: []
      }
    };
    
    // Add failed tests to summary
    if (!httpsTest.success) results.summary.failedTests.push('HTTPS connectivity');
    if (!dnsTest.success) results.summary.failedTests.push('DNS resolution');
    if (!larkConnectivityTest.success) results.summary.failedTests.push('Lark connectivity');
    
    console.log('🌐 Final test results:', results);
    
    res.status(200).json({
      success: true,
      message: 'Network connectivity tests completed',
      results: results
    });
    
  } catch (error) {
    console.error('🌐 Network test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}; 