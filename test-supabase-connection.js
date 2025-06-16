require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Test Supabase Connection and Knowledge Base Table
class SupabaseConnectionTest {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        db: {
          schema: 'support'
        }
      }
    );
  }

  async runAllTests() {
    console.log('🧪 Starting Supabase Connection Tests...\n');

    try {
      await this.testEnvironmentVariables();
      await this.testBasicConnection();
      await this.testKnowledgeBaseTable();
      await this.testSupportTicketsTable();
      await this.testInsertOperation();
      await this.testQueryOperation();
      await this.testUpdateOperation();
      await this.testDeleteOperation();
      
      console.log('\n✅ All tests completed successfully!');
    } catch (error) {
      console.error('\n❌ Test suite failed:', error.message);
    }
  }

  async testEnvironmentVariables() {
    console.log('1️⃣ Testing Environment Variables...');
    
    const requiredVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
    const missing = requiredVars.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    
    console.log('✅ Environment variables configured');
    console.log(`   - SUPABASE_URL: ${process.env.SUPABASE_URL.substring(0, 20)}...`);
    console.log(`   - SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY.substring(0, 20)}...`);
  }

  async testBasicConnection() {
    console.log('\n2️⃣ Testing Basic Supabase Connection...');
    
    try {
      // Create a client without schema restrictions for system queries
      const systemSupabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );
      
      // Test basic connection by querying schema info from public access
      const { data, error } = await systemSupabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'support')
        .limit(5);
      
      if (error) {
        console.log('⚠️ Schema info query failed, trying direct table access...');
        console.log('Error:', error.message);
        
        // Alternative test - try to access the knowledge_base table directly
        const { data: altData, error: altError } = await this.supabase
          .from('knowledge_base')
          .select('id')
          .limit(1);
        
        if (altError) {
          throw new Error(`Connection failed: ${altError.message}`);
        }
        
        console.log('✅ Direct table access test passed');
      } else {
        console.log('✅ Basic connection successful');
        console.log(`   Found ${data ? data.length : 0} tables in support schema`);
        if (data && data.length > 0) {
          console.log(`   Tables: ${data.map(t => t.table_name).join(', ')}`);
        }
      }
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  async testKnowledgeBaseTable() {
    console.log('\n3️⃣ Testing Knowledge Base Table Access...');
    
    try {
      // Test table access by counting rows
      const { count, error } = await this.supabase
        .from('knowledge_base')
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log('❌ Knowledge base table access failed:', error.message);
        console.log('Error details:', JSON.stringify(error, null, 2));
        
        // Check if it's a schema issue
        if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
          console.log('\n🔍 Possible issues:');
          console.log('   1. Table does not exist in the support schema');
          console.log('   2. Schema name is incorrect');
          console.log('   3. RLS policies are blocking access');
          console.log('   4. Table exists in public schema instead of support schema');
          
          // Try accessing from public schema
          console.log('\n🔄 Trying public schema...');
          const publicSupabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
          );
          
          const { count: publicCount, error: publicError } = await publicSupabase
            .from('knowledge_base')
            .select('*', { count: 'exact', head: true });
          
          if (!publicError) {
            console.log('✅ Found knowledge_base table in PUBLIC schema');
            console.log(`   Row count: ${publicCount}`);
            console.log('⚠️ Consider updating your schema configuration to use public schema');
          } else {
            console.log('❌ Table not found in public schema either');
          }
        }
        
        throw new Error(`Knowledge base table access failed: ${error.message}`);
      } else {
        console.log('✅ Knowledge base table accessible');
        console.log(`   Row count: ${count || 0}`);
      }
    } catch (error) {
      throw error;
    }
  }

  async testSupportTicketsTable() {
    console.log('\n4️⃣ Testing Support Tickets Table Access...');
    
    try {
      const { count, error } = await this.supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log('❌ Support tickets table access failed:', error.message);
        throw new Error(`Support tickets table access failed: ${error.message}`);
      } else {
        console.log('✅ Support tickets table accessible');
        console.log(`   Row count: ${count || 0}`);
      }
    } catch (error) {
      throw error;
    }
  }

  async testInsertOperation() {
    console.log('\n5️⃣ Testing Insert Operation...');
    
    const testData = {
      question: 'Test Question - Connection Verification',
      answer: 'This is a test answer to verify the connection is working.',
      category: 'general',
      ticket_source: null,
      created_at: new Date().toISOString()
    };
    
    try {
      const { data, error } = await this.supabase
        .from('knowledge_base')
        .insert([testData])
        .select()
        .single();
      
      if (error) {
        console.log('❌ Insert operation failed:', error.message);
        console.log('Error details:', JSON.stringify(error, null, 2));
        throw new Error(`Insert failed: ${error.message}`);
      } else {
        console.log('✅ Insert operation successful');
        console.log(`   Inserted record ID: ${data.id}`);
        
        // Store the ID for cleanup
        this.testRecordId = data.id;
        return data;
      }
    } catch (error) {
      throw error;
    }
  }

  async testQueryOperation() {
    console.log('\n6️⃣ Testing Query Operation...');
    
    try {
      const { data, error } = await this.supabase
        .from('knowledge_base')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) {
        console.log('❌ Query operation failed:', error.message);
        throw new Error(`Query failed: ${error.message}`);
      } else {
        console.log('✅ Query operation successful');
        console.log(`   Retrieved ${data.length} records`);
        
        if (data.length > 0) {
          console.log(`   Latest record: ${data[0].question?.substring(0, 50)}...`);
        }
      }
    } catch (error) {
      throw error;
    }
  }

  async testUpdateOperation() {
    console.log('\n7️⃣ Testing Update Operation...');
    
    if (!this.testRecordId) {
      console.log('⚠️ No test record to update, skipping...');
      return;
    }
    
    try {
      const { data, error } = await this.supabase
        .from('knowledge_base')
        .update({ 
          answer: 'Updated test answer - connection verification completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', this.testRecordId)
        .select()
        .single();
      
      if (error) {
        console.log('❌ Update operation failed:', error.message);
        throw new Error(`Update failed: ${error.message}`);
      } else {
        console.log('✅ Update operation successful');
        console.log(`   Updated record ID: ${data.id}`);
      }
    } catch (error) {
      throw error;
    }
  }

  async testDeleteOperation() {
    console.log('\n8️⃣ Testing Delete Operation (Cleanup)...');
    
    if (!this.testRecordId) {
      console.log('⚠️ No test record to delete, skipping...');
      return;
    }
    
    try {
      const { error } = await this.supabase
        .from('knowledge_base')
        .delete()
        .eq('id', this.testRecordId);
      
      if (error) {
        console.log('❌ Delete operation failed:', error.message);
        console.log('⚠️ Test record may need manual cleanup:', this.testRecordId);
      } else {
        console.log('✅ Delete operation successful (test cleanup completed)');
      }
    } catch (error) {
      console.log('⚠️ Delete operation error:', error.message);
    }
  }

  async checkSchemaAndRLS() {
    console.log('\n🔍 Additional Diagnostic Information...');
    
    try {
      // Check current user/role
      const { data: userData, error: userError } = await this.supabase.auth.getUser();
      console.log('Current auth user:', userData?.user?.id || 'Anonymous');
      
      // Create a system client for schema queries
      const systemSupabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );
      
      // Try to get table information from information_schema
      const { data: tableInfo, error: tableError } = await systemSupabase
        .from('information_schema.columns')
        .select('column_name, data_type')
        .eq('table_name', 'knowledge_base')
        .eq('table_schema', 'support');
      
      if (!tableError && tableInfo && tableInfo.length > 0) {
        console.log('✅ Table structure found:');
        tableInfo.forEach(col => {
          console.log(`   - ${col.column_name}: ${col.data_type}`);
        });
      } else {
        console.log('⚠️ Could not retrieve table structure from information_schema');
        if (tableError) {
          console.log(`   Error: ${tableError.message}`);
        }
        
        // Try alternative - check if RLS is enabled
        console.log('\n🔐 Checking RLS policies...');
        try {
          const { data: rlsInfo, error: rlsError } = await systemSupabase
            .from('pg_tables')
            .select('schemaname, tablename, rowsecurity')
            .eq('schemaname', 'support')
            .eq('tablename', 'knowledge_base');
          
          if (!rlsError && rlsInfo && rlsInfo.length > 0) {
            console.log(`   RLS enabled: ${rlsInfo[0].rowsecurity}`);
          }
        } catch (rlsCheckError) {
          console.log('   Could not check RLS status');
        }
      }
    } catch (error) {
      console.log('⚠️ Diagnostic check failed:', error.message);
    }
  }
}

// Run the tests
async function main() {
  const tester = new SupabaseConnectionTest();
  
  try {
    await tester.runAllTests();
    await tester.checkSchemaAndRLS();
  } catch (error) {
    console.error('\n💥 Test execution failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SupabaseConnectionTest; 