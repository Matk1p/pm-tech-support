// Debug script for Vercel deployment issues

async function debugVercelIssues() {
  console.log('🔍 Debugging Vercel Deployment Issues');
  console.log('====================================\n');

  // Test 1: Check if your live deployment is responding
  console.log('1️⃣ Testing Live Deployment Health...');
  try {
    const https = require('https');
    const options = {
      hostname: 'pm-tech-support.vercel.app',
      path: '/health',
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('   ✅ Deployment is live and healthy');
          console.log('   📊 Response:', data);
        } else {
          console.log('   ❌ Health check failed:', res.statusCode);
        }
      });
    });

    req.on('error', (error) => {
      console.log('   ❌ Health check error:', error.message);
    });

    req.end();
  } catch (error) {
    console.log('   ❌ Error testing deployment:', error.message);
  }

  // Test 2: Check webhook endpoint
  console.log('\n2️⃣ Testing Webhook Endpoint...');
  try {
    const https = require('https');
    const postData = JSON.stringify({
      type: 'url_verification',
      challenge: 'test_challenge'
    });

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
        if (res.statusCode === 200) {
          console.log('   ✅ Webhook endpoint accessible');
          console.log('   📊 Response:', data);
        } else {
          console.log('   ❌ Webhook test failed:', res.statusCode);
        }
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

  // Test 3: Manual knowledge base update
  console.log('\n3️⃣ Testing Manual Update Endpoint...');
  setTimeout(() => {
    try {
      const https = require('https');
      const postData = JSON.stringify({
        ticketNumber: 'PMN-20250616-0014',
        solution: 'Solution for PMN-20250616-0014: refresh page and clear cache',
        forceUpdate: true
      });

      const options = {
        hostname: 'pm-tech-support.vercel.app',
        path: '/update-knowledge-base',
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
          
          if (res.statusCode === 200) {
            const result = JSON.parse(data);
            if (result.success) {
              console.log('   ✅ Manual update works! Core logic is good');
            } else {
              console.log('   ❌ Manual update failed:', result.error || 'Unknown error');
            }
          } else {
            console.log('   ❌ Manual update failed with status:', res.statusCode);
          }
        });
      });

      req.on('error', (error) => {
        console.log('   ❌ Manual update error:', error.message);
      });

      req.write(postData);
      req.end();
    } catch (error) {
      console.log('   ❌ Error testing manual update:', error.message);
    }
  }, 2000);

  // Test 4: Check database from local
  console.log('\n4️⃣ Testing Database from Local...');
  setTimeout(async () => {
    try {
      const { createClient } = require('@supabase/supabase-js');
      require('dotenv').config();

      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        {
          db: {
            schema: 'support'
          }
        }
      );

      // Check knowledge base entries
      const { data: kbEntries, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .or('ticket_source.eq.PMN-20250616-0013,ticket_source.eq.PMN-20250616-0014')
        .order('created_at', { ascending: false });

      if (error) {
        console.log('   ❌ Database query failed:', error.message);
      } else {
        console.log('   ✅ Database accessible');
        console.log('   📊 Knowledge base entries for your tickets:', kbEntries.length);
        
        if (kbEntries.length > 0) {
          console.log('   📝 Recent entries:');
          kbEntries.slice(0, 3).forEach((entry, index) => {
            console.log(`      ${index + 1}. Ticket: ${entry.ticket_source}`);
            console.log(`         Question: ${entry.question}`);
            console.log(`         Created: ${entry.created_at}`);
          });
        } else {
          console.log('   ⚠️ No knowledge base entries found for your tickets');
        }
      }
    } catch (error) {
      console.log('   ❌ Database test failed:', error.message);
    }

    // Final analysis
    setTimeout(() => {
      console.log('\n📋 ANALYSIS & NEXT STEPS:');
      console.log('=========================');
      console.log('');
      console.log('🔧 LIKELY ISSUES:');
      console.log('1. Environment variables not set in Vercel dashboard');
      console.log('2. Lark webhook URL not pointing to your deployment');
      console.log('3. Support group ID mismatch');
      console.log('4. RLS policies blocking database inserts');
      console.log('');
      console.log('🚀 IMMEDIATE ACTIONS:');
      console.log('1. Check Vercel dashboard → Settings → Environment Variables');
      console.log('2. Check Lark app → Event Subscriptions → Request URL');
      console.log('3. Check Vercel function logs for errors');
      console.log('4. Verify the manual update endpoint works');
      console.log('');
      console.log('💡 DEBUGGING COMMANDS:');
      console.log('# Check Vercel logs:');
      console.log('vercel logs https://pm-tech-support.vercel.app');
      console.log('');
      console.log('# Test manual endpoint:');
      console.log('curl -X POST https://pm-tech-support.vercel.app/update-knowledge-base \\');
      console.log('  -H "Content-Type: application/json" \\');
      console.log('  -d \'{"ticketNumber": "PMN-20250616-0014", "solution": "test", "forceUpdate": true}\'');
    }, 3000);
  }, 4000);
}

debugVercelIssues(); 