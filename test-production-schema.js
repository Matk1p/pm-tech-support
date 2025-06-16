// Test different schema approaches for production
const { createClient } = require('@supabase/supabase-js');

// Test both approaches
async function testSchemaApproaches() {
  console.log('🧪 Testing Schema Approaches...');
  
  // Approach 1: With schema in client config
  const supabaseWithSchema = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      db: {
        schema: 'support'
      }
    }
  );
  
  // Approach 2: Without schema in client config
  const supabaseDefault = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  
  try {
    console.log('\n📊 Test 1: With schema config...');
    const { data: data1, error: error1 } = await supabaseWithSchema
      .from('knowledge_base')
      .select('id')
      .limit(1);
    
    console.log('Result:', error1 ? `Error: ${error1.message}` : `Success: ${data1?.length || 0} rows`);
    
    console.log('\n📊 Test 2: Default schema with full table name...');
    const { data: data2, error: error2 } = await supabaseDefault
      .from('support.knowledge_base')
      .select('id')
      .limit(1);
    
    console.log('Result:', error2 ? `Error: ${error2.message}` : `Success: ${data2?.length || 0} rows`);
    
    console.log('\n📊 Test 3: Default schema, table only...');
    const { data: data3, error: error3 } = await supabaseDefault
      .from('knowledge_base')
      .select('id')
      .limit(1);
    
    console.log('Result:', error3 ? `Error: ${error3.message}` : `Success: ${data3?.length || 0} rows`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSchemaApproaches(); 