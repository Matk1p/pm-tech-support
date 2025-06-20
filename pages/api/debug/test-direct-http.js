// Debug endpoint to test direct HTTP calls to Lark
export default async function handler(req, res) {
  console.log('🧪 Direct HTTP test endpoint called');
  
  try {
    // Get access token
    console.log('🔑 Getting access token...');
    const tokenResponse = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token request failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('🔑 Token response:', { code: tokenData.code });
    
    if (tokenData.code !== 0) {
      throw new Error(`Token error: ${tokenData.msg}`);
    }

    // Test message
    const testMessage = {
      receive_id: 'oc_729b7e7eef2a0f781b21158ce58b8f9f',
      msg_type: 'text',
      content: JSON.stringify({ text: `🧪 Direct HTTP test at ${new Date().toISOString()}` }),
      uuid: `test_${Date.now()}`
    };

    console.log('📤 Sending test message via direct HTTP...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const messageResponse = await fetch('https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenData.tenant_access_token}`,
      },
      body: JSON.stringify(testMessage),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!messageResponse.ok) {
      throw new Error(`HTTP error: ${messageResponse.status} ${messageResponse.statusText}`);
    }

    const result = await messageResponse.json();
    console.log('✅ Direct HTTP test successful:', result);

    res.status(200).json({
      success: true,
      tokenCode: tokenData.code,
      messageResult: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Direct HTTP test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      isTimeout: error.name === 'AbortError',
      timestamp: new Date().toISOString()
    });
  }
} 