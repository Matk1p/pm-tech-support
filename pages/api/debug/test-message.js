// Debug endpoint to test message sending
import { Client } from '@larksuiteoapi/node-sdk';

const larkClient = new Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chatId, message } = req.body;

  if (!chatId || !message) {
    return res.status(400).json({ 
      error: 'Missing chatId or message',
      required: ['chatId', 'message']
    });
  }

  try {
    console.log('🧪 Debug: Testing message sending to:', chatId);
    console.log('🧪 Debug: Message content:', message);

    const result = await larkClient.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: message }),
        uuid: `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    });

    console.log('🧪 Debug: Lark API response:', result);

    return res.status(200).json({
      success: result.code === 0,
      larkResponse: result,
      debugInfo: {
        chatId,
        message,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('🧪 Debug: Error testing message:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      debugInfo: {
        chatId,
        message,
        timestamp: new Date().toISOString()
      }
    });
  }
} 