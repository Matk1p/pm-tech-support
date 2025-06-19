require('dotenv').config();

console.log('🔍 Checking Environment Variables...\n');

console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set ✅' : 'Missing ❌');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set ✅' : 'Missing ❌');

if (process.env.SUPABASE_URL) {
  console.log('URL Preview:', process.env.SUPABASE_URL.substring(0, 30) + '...');
}

if (process.env.SUPABASE_ANON_KEY) {
  console.log('Key Preview:', process.env.SUPABASE_ANON_KEY.substring(0, 20) + '...');
}

console.log('\n💡 If any variables are missing, check your .env file');

// Test Supabase connection
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  console.log('\n🔗 Testing Supabase connection...');
  
  const { createClient } = require('@supabase/supabase-js');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      db: { schema: 'support' },
      auth: { persistSession: false }
    }
  );
  
  // Quick connection test
  supabase
    .from('support_tickets')
    .select('id')
    .limit(1)
    .then(({ data, error }) => {
      if (error) {
        console.log('❌ Supabase connection failed:', error.message);
      } else {
        console.log('✅ Supabase connection successful!');
        console.log('🎉 Ready to test message logging!');
      }
    })
    .catch(err => {
      console.log('❌ Connection test failed:', err.message);
    });
} else {
  console.log('\n❌ Cannot test connection - missing environment variables');
} 