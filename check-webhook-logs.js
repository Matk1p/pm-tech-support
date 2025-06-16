// Check webhook processing step by step
const http = require('http');
require('dotenv').config();

console.log('🔍 Checking Webhook Processing');
console.log('==============================');

// Test solution detection
const testMessage = "@Ask Danish Solution for PMN-20250616-0015: refresh page and clear cache";
const SOLUTION_KEYWORDS = ['solution:', 'solution for', 'fix:', 'fixed:', 'resolved:', 'answer:'];
const isSolution = SOLUTION_KEYWORDS.some(keyword => testMessage.toLowerCase().includes(keyword.toLowerCase()));
const ticketMatch = testMessage.match(/([A-Z]{2,3}-\d{8}-\d{4})/i);

console.log('Message:', testMessage);
console.log('Is Solution:', isSolution);
console.log('Ticket:', ticketMatch ? ticketMatch[1] : 'NONE');

// Test webhook
const mockEvent = {
  schema: "2.0",
  header: {
    event_id: "debug_" + Date.now(),
    event_type: "im.message.receive_v1",
    app_id: process.env.LARK_APP_ID
  },
  event: {
    sender: { sender_id: { user_id: "debug_user" }, sender_type: "user" },
    message: {
      message_id: "debug_msg_" + Date.now(),
      chat_id: process.env.LARK_SUPPORT_GROUP_ID,
      chat_type: "group",
      content: JSON.stringify({ text: testMessage }),
      mentions: [{ key: process.env.LARK_APP_ID, id: process.env.LARK_APP_ID }]
    }
  }
};

const postData = JSON.stringify(mockEvent);
const options = { hostname: 'localhost', port: 3001, path: '/lark/events', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } };

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    setTimeout(checkDatabase, 1000);
  });
});

req.on('error', (error) => console.error('Request error:', error.message));
req.write(postData);
req.end();

async function checkDatabase() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { db: { schema: 'support' } });
    const { data: entries } = await supabase.from('knowledge_base').select('*').order('created_at', { ascending: false }).limit(3);
    
    console.log('Recent entries:', entries.length);
    const testEntry = entries.find(e => e.ticket_source === 'PMN-20250616-0015');
    if (testEntry) {
      console.log('✅ SUCCESS: Webhook created KB entry!');
    } else {
      console.log('⚠️ No entry found for PMN-20250616-0015');
    }
  } catch (error) {
    console.log('Database check failed:', error.message);
  }
} 