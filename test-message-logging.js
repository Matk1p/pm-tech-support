const messageLogger = require('./message-logger');

async function testMessageLogging() {
  console.log('🧪 Testing Message Logging System...\n');
  
  // Test data
  const testChatId = 'test-chat-' + Date.now();
  const testUserId = 'test-user-123';
  const testUserName = 'Test User';
  
  try {
    // Test 1: Log a user message
    console.log('1. Testing user message logging...');
    const userMessage = await messageLogger.logUserMessage({
      chatId: testChatId,
      userId: testUserId,
      userName: testUserName,
      message: 'How do I add a new candidate?',
      userMetadata: { testFlag: true },
      messageMetadata: { source: 'test-script' }
    });
    
    if (userMessage) {
      console.log('✅ User message logged successfully:', userMessage.id);
      console.log('   Intent:', userMessage.message_intent);
      console.log('   Sentiment:', userMessage.sentiment);
      console.log('   Urgency:', userMessage.urgency_detected);
    } else {
      console.log('❌ Failed to log user message');
      return;
    }
    
    // Test 2: Log a bot response
    console.log('\n2. Testing bot response logging...');
    const botResponse = await messageLogger.logBotResponse({
      chatId: testChatId,
      message: 'To add a new candidate, go to Dashboard → Candidates → Add New...',
      responseType: 'knowledge_base',
      processingTimeMs: 1250,
      knowledgeBaseHit: true,
      cacheHit: false,
      messageMetadata: { 
        userMessageId: userMessage.id,
        source: 'test-script'
      }
    });
    
    if (botResponse) {
      console.log('✅ Bot response logged successfully:', botResponse.id);
    } else {
      console.log('❌ Failed to log bot response');
      return;
    }
    
    // Test 3: Log a system message
    console.log('\n3. Testing system message logging...');
    const systemMessage = await messageLogger.logSystemMessage({
      chatId: testChatId,
      message: 'Support ticket PMN-20241201-0001 created',
      ticketNumber: 'PMN-20241201-0001',
      messageMetadata: { source: 'test-script' }
    });
    
    if (systemMessage) {
      console.log('✅ System message logged successfully:', systemMessage.id);
    } else {
      console.log('❌ Failed to log system message');
      return;
    }
    
    // Test 4: Get conversation summary
    console.log('\n4. Testing conversation retrieval...');
    const conversation = await messageLogger.getConversationSummary(testChatId);
    
    if (conversation && conversation.length > 0) {
      console.log('✅ Conversation retrieved successfully:');
      conversation.forEach((msg, index) => {
        console.log(`   ${index + 1}. [${msg.message_type}] ${msg.message_content.substring(0, 50)}...`);
      });
    } else {
      console.log('❌ Failed to retrieve conversation');
      return;
    }
    
    // Test 5: Test analytics functions
    console.log('\n5. Testing analytics functions...');
    
    // Test intent detection
    const testMessages = [
      'How do I upload a resume?',
      'The system is very slow today',
      'Thank you for your help!',
      'URGENT: I need help immediately!'
    ];
    
    console.log('Intent detection tests:');
    testMessages.forEach(msg => {
      const intent = messageLogger.detectIntent(msg);
      const sentiment = messageLogger.analyzeSentiment(msg);
      const urgency = messageLogger.detectUrgency(msg);
      console.log(`   "${msg}" → Intent: ${intent}, Sentiment: ${sentiment}, Urgency: ${urgency}`);
    });
    
    console.log('\n🎉 All tests completed successfully!');
    console.log(`\n📊 Test data created in chat: ${testChatId}`);
    console.log('💡 You can now test the analytics API endpoints with this data.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Run tests if this script is called directly
if (require.main === module) {
  testMessageLogging();
}

module.exports = { testMessageLogging }; 