// Test script to verify knowledge base is working with database content
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

async function testKnowledgeBase() {
  console.log('🧪 Testing Knowledge Base Integration...\n');

  try {
    // Test 1: Check current knowledge base content
    console.log('📚 Test 1: Checking current knowledge base content...');
    const response = await fetch(`${SERVER_URL}/current-knowledge-base`);
    const data = await response.json();
    
    console.log(`✅ Knowledge base size: ${data.size} KB`);
    console.log(`✅ Total Q&As: ${data.qaCount}`);
    
    // Check for static content
    const hasStaticContent = data.content.includes('Core Features and Navigation');
    console.log(`✅ Contains static content: ${hasStaticContent}`);
    
    // Check for database entries marker
    const hasDatabaseEntries = data.content.includes('Additional Support Solutions');
    console.log(`✅ Contains database entries: ${hasDatabaseEntries}`);
    
    // Check for specific test questions
    const testQuestions = [
      'export candidate data to CSV',
      'dashboard loading slowly',
      'automated email notifications',
      'customize the interview scheduling',
      'recover deleted candidate profiles'
    ];
    
    console.log('\n🔍 Checking for test database entries:');
    testQuestions.forEach(question => {
      const found = data.content.toLowerCase().includes(question.toLowerCase());
      console.log(`${found ? '✅' : '❌'} "${question}": ${found ? 'Found' : 'Not found'}`);
    });
    
    // Check that inactive entry is NOT included
    const hasInactiveEntry = data.content.includes('This should not appear in results');
    console.log(`${!hasInactiveEntry ? '✅' : '❌'} Inactive entries filtered: ${!hasInactiveEntry ? 'Yes' : 'No'}`);
    
    console.log('\n📊 Test 2: Reloading knowledge base...');
    const reloadResponse = await fetch(`${SERVER_URL}/reload-knowledge-base`, {
      method: 'POST'
    });
    const reloadData = await reloadResponse.json();
    console.log(`✅ Reload successful: ${reloadData.success}`);
    console.log(`✅ Message: ${reloadData.message}`);
    
    console.log('\n✨ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('💡 Make sure your server is running on', SERVER_URL);
  }
}

// Run the test
testKnowledgeBase(); 