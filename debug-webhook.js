// Debug webhook processing step by step

const https = require('https');

async function debugWebhookFlow() {
  console.log('🔍 Debugging Webhook Flow');
  console.log('=========================\n');

  // Test 1: Check if solution detection works
  console.log('1️⃣ Testing Solution Detection...');
  const testMessage = "@Ask Danish Solution for PMN-20250616-0015: refresh page and clear cache";
  
  // Test the regex patterns from server.js
  const SOLUTION_KEYWORDS = [
    'solution:',
    'solution for',
    'fix:',
    'fixed:',
    'resolved:',
    'answer:',
    'here\'s the solution',
    'here is the solution'
  ];
  
  const hasKeyword = SOLUTION_KEYWORDS.some(keyword => 
    testMessage.toLowerCase().includes(keyword.toLowerCase())
  );
  
  console.log('   Message:', testMessage);
  console.log('   Contains solution keyword:', hasKeyword);
  
  // Test ticket extraction
  const ticketRegex = /([A-Z]{2,3}-\d{8}-\d{4})/i;
  const ticketMatch = testMessage.match(ticketRegex);
  console.log('   Extracted ticket:', ticketMatch ? ticketMatch[1] : 'None');
  
  // Test 2: Check database connectivity from live deployment
  console.log('\n2️⃣ Testing Live Database Connection...');
  
  try {
    const postData = JSON.stringify({
      test: true
    });

    const options = {
      hostname: 'pm-tech-support.vercel.app',
      path: '/test-db-connection',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('   Status:', res.statusCode);
        console.log('   Response:', data);
      });
    });

    req.on('error', (error) => {
      console.log('   ❌ Database test error:', error.message);
    });

    req.write(postData);
    req.end();
  } catch (error) {
    console.log('   ❌ Error testing database:', error.message);
  }

  // Test 3: Check webhook processing
  console.log('\n3️⃣ Testing Webhook Message Processing...');
  
  setTimeout(() => {
    try {
      // Simulate a Lark message event
      const mockLarkEvent = {
        schema: "2.0",
        header: {
          event_id: "test_" + Date.now(),
          event_type: "im.message.receive_v1",
          create_time: new Date().toISOString(),
          token: "test_token",
          app_id: "test_app"
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
            chat_id: "oc_c8abf631fb24cc6e1402655b2f0dc1cb", // Your support group ID
            chat_type: "group",
            content: JSON.stringify({
              text: "@Ask Danish Solution for PMN-20250616-0015: refresh page and clear cache"
            }),
            mentions: [{
              key: "test_app_id",
              id: "test_app_id"
            }]
          }
        }
      };

      const postData = JSON.stringify(mockLarkEvent);

      const options = {
        hostname: 'pm-tech-support.vercel.app',
        path: '/lark/events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          console.log('   Webhook Status:', res.statusCode);
          console.log('   Webhook Response:', data);
          
          // Test 4: Check if knowledge base was updated
          console.log('\n4️⃣ Checking Knowledge Base Update...');
          setTimeout(checkKnowledgeBase, 2000);
        });
      });

      req.on('error', (error) => {
        console.log('   ❌ Webhook test error:', error.message);
      });

      req.write(postData);
      req.end();
    } catch (error) {
      console.log('   ❌ Error testing webhook:', error.message);
    }
  }, 2000);
}

function checkKnowledgeBase() {
  try {
    const options = {
      hostname: 'pm-tech-support.vercel.app',
      path: '/check-kb-entries',
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('   KB Check Status:', res.statusCode);
        console.log('   KB Entries:', data);
        
        // Final recommendations
        setTimeout(showRecommendations, 1000);
      });
    });

    req.on('error', (error) => {
      console.log('   ❌ KB check error:', error.message);
      setTimeout(showRecommendations, 1000);
    });

    req.end();
  } catch (error) {
    console.log('   ❌ Error checking KB:', error.message);
    setTimeout(showRecommendations, 1000);
  }
}

function showRecommendations() {
  console.log('\n📋 DEBUGGING RECOMMENDATIONS:');
  console.log('==============================');
  console.log('');
  console.log('🔧 IF SOLUTION DETECTION FAILED:');
  console.log('  - Check if message contains "solution for" keyword');
  console.log('  - Verify ticket number format: PMN-YYYYMMDD-NNNN');
  console.log('');
  console.log('🔧 IF DATABASE CONNECTION FAILED:');
  console.log('  - Verify Supabase environment variables in Vercel');
  console.log('  - Check RLS policies allow inserts');
  console.log('');
  console.log('🔧 IF WEBHOOK NOT TRIGGERED:');
  console.log('  - Verify Lark app webhook URL points to Vercel deployment');
  console.log('  - Check if bot is mentioned (@Ask Danish)');
  console.log('  - Ensure message is in correct support group');
  console.log('');
  console.log('🚀 IMMEDIATE ACTIONS:');
  console.log('  1. Check Vercel function logs');
  console.log('  2. Test manual update to isolate issue');
  console.log('  3. Verify Lark app configuration');
}

debugWebhookFlow(); 