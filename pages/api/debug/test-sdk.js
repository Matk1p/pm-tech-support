import * as lark from '@larksuite/node-sdk';

// Initialize Lark client
const larkClient = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  loggerLevel: lark.LoggerLevel.info
});

// Debug endpoint to test Lark SDK
export default async function handler(req, res) {
  console.log('🧪 SDK test endpoint called');
  
  try {
    const messageData = {
      receive_id: 'oc_729b7e7eef2a0f781b21158ce58b8f9f',
      msg_type: 'text',
      content: JSON.stringify({ text: `🧪 SDK test at ${new Date().toISOString()}` }),
      uuid: `test_${Date.now()}`
    };

    console.log('📤 Testing SDK call with timeout...');
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        console.log('⏰ SDK test timed out after 6 seconds');
        reject(new Error('SDK test timeout'));
      }, 6000);
      timeoutPromise.timeoutId = timeoutId;
    });
    
    // Create API call promise
    const apiPromise = larkClient.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: messageData
    }).then(result => {
      if (timeoutPromise.timeoutId) {
        clearTimeout(timeoutPromise.timeoutId);
      }
      return result;
    }).catch(error => {
      if (timeoutPromise.timeoutId) {
        clearTimeout(timeoutPromise.timeoutId);
      }
      throw error;
    });
    
    const result = await Promise.race([apiPromise, timeoutPromise]);
    
    console.log('✅ SDK test successful:', result);

    res.status(200).json({
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ SDK test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      isTimeout: error.message.includes('timeout'),
      timestamp: new Date().toISOString()
    });
  }
} 