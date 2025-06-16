// Test webhook locally with simulated Lark event
const http = require('http');
require('dotenv').config();

const mockLarkEvent = {
  schema: "2.0",
  header: {
    event_id: "test_" + Date.now(),
    event_type: "im.message.receive_v1",
    create_time: new Date().toISOString(),
    token: "test_token",
    app_id: process.env.LARK_APP_ID
  },
  event: {
    sender: {
      sender_id: {
        user_id: "test_user",
        id: "test_user"
      },
      sender_type: "user"
    },
    message: {
      message_id: "test_msg_" + Date.now(),
      chat_id: process.env.LARK_SUPPORT_GROUP_ID,
      chat_type: "group",
      content: JSON.stringify({
        text: "@Ask Danish Solution for PMN-20250616-0015: refresh page and clear cache"
      }),
      mentions: [{
        key: process.env.LARK_APP_ID,
        id: process.env.LARK_APP_ID
      }]
    }
  }
};

console.log('🧪 Testing Local Webhook...');
console.log('Message:', JSON.parse(mockLarkEvent.event.message.content).text);
console.log('Chat ID:', mockLarkEvent.event.message.chat_id);
console.log('App ID:', mockLarkEvent.header.app_id);

const postData = JSON.stringify(mockLarkEvent);

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/lark/events',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\n✅ Webhook Response:');
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    
    if (res.statusCode === 200) {
      console.log('\n🎉 Webhook processed successfully!');
      console.log('💡 Check your server logs above for processing details.');
      console.log('💡 Check your knowledge base for new entries.');
    } else {
      console.log('\n❌ Webhook failed. Check server logs for errors.');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
});

req.write(postData);
req.end(); 