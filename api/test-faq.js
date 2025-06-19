// Test FAQ functionality endpoint for debugging
module.exports = async (req, res) => {
  console.log('🧪 FAQ test endpoint accessed');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Test basic messaging functionality
    console.log('🧪 Testing message sending functionality...');
    
    const testMessage = "This is a test message from the FAQ debugging endpoint.";
    const testChatId = req.query.chat_id || 'test_chat_id';
    
    if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) {
      throw new Error('Missing Lark credentials');
    }
    
    // Step 1: Test Lark SDK initialization
    console.log('🧪 Step 1: Testing Lark SDK...');
    const { Client } = require('@larksuiteoapi/node-sdk');
    
    const larkClient = new Client({
      appId: process.env.LARK_APP_ID,
      appSecret: process.env.LARK_APP_SECRET,
      appType: 'self_built',
      domain: 'larksuite'
    });
    
    console.log('🧪 SDK client created:', !!larkClient);
    console.log('🧪 SDK methods available:', !!larkClient.im?.message?.create);

    // Step 2: Test OpenAI API
    console.log('🧪 Step 2: Testing OpenAI API...');
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: "Say 'Hello from test endpoint' in a friendly way."
        }
      ],
      max_tokens: 50,
      temperature: 0.7,
    }, {
      signal: AbortSignal.timeout(15000)
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('🧪 AI response:', aiResponse);

    // Return test results
    res.status(200).json({
      success: true,
      message: 'FAQ test completed successfully',
              results: {
        larkSdkTest: {
          success: true,
          clientInitialized: !!larkClient,
          methodsAvailable: !!larkClient.im?.message?.create
        },
        openaiTest: {
          success: true,
          response: aiResponse
        },
        environment: {
          hasLarkAppId: !!process.env.LARK_APP_ID,
          hasLarkAppSecret: !!process.env.LARK_APP_SECRET,
          hasOpenAIKey: !!process.env.OPENAI_API_KEY,
          chatIdProvided: !!req.query.chat_id
        }
      }
    });

  } catch (error) {
    console.error('🧪 FAQ test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      errorType: error.constructor.name,
      timestamp: new Date().toISOString()
    });
  }
}; 