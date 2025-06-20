const express = require('express');
const axios = require('axios');
const { createClient } = require('@lark-opensdk/node-sdk');

const app = express();
app.use(express.json());

// Initialize Lark client
const larkClient = createClient({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
});

// Queue for processing requests
const requestQueue = [];
let isProcessing = false;

// Main webhook endpoint that receives from Lark
app.post('/lark/events', async (req, res) => {
  try {
    console.log('🔄 Relay service received webhook from Lark');
    
    // Respond to Lark immediately to prevent timeout
    res.status(200).json({ success: true });
    
    // Add to processing queue
    requestQueue.push({
      body: req.body,
      timestamp: Date.now(),
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
    
    // Start processing if not already running
    if (!isProcessing) {
      processQueue();
    }
    
  } catch (error) {
    console.error('❌ Relay service error:', error);
    res.status(500).json({ error: 'Relay service error' });
  }
});

// Process the queue
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) {
    return;
  }
  
  isProcessing = true;
  console.log(`🔄 Processing queue with ${requestQueue.length} items`);
  
  while (requestQueue.length > 0) {
    const request = requestQueue.shift();
    
    try {
      await processLarkEvent(request.body);
    } catch (error) {
      console.error('❌ Error processing request:', request.id, error.message);
    }
  }
  
  isProcessing = false;
}

// Process individual Lark events
async function processLarkEvent(eventBody) {
  try {
    const { header, event } = eventBody;
    
    if (!event) {
      console.log('⏭️ No event data, skipping');
      return;
    }
    
    // Handle different event types
    if (header?.event_type === 'im.message.receive_v1') {
      await handleMessageEvent(event);
    } else if (header?.event_type === 'card.action.trigger') {
      await handleCardInteraction(event);
    }
    
  } catch (error) {
    console.error('❌ Error processing Lark event:', error);
  }
}

// Handle message events with full processing time
async function handleMessageEvent(event) {
  try {
    const chatId = event.message?.chat_id;
    const messageContent = event.message?.content;
    
    if (!chatId || !messageContent) {
      console.log('⏭️ Missing chat ID or message content');
      return;
    }
    
    console.log('💬 Processing message for chat:', chatId);
    
    // Extract message text
    const contentObj = JSON.parse(messageContent);
    const userMessage = contentObj?.text || '';
    
    if (!userMessage.trim()) {
      console.log('⏭️ Empty message, skipping');
      return;
    }
    
    // Process the message (this can take as long as needed)
    console.log('🤖 Generating AI response...');
    const aiResponse = await generateAIResponse(userMessage, chatId);
    
    if (aiResponse) {
      // Send response directly to Lark
      await sendMessageToLark(chatId, aiResponse);
      console.log('✅ Response sent successfully');
    }
    
  } catch (error) {
    console.error('❌ Error handling message event:', error);
  }
}

// Handle card interactions with full processing time  
async function handleCardInteraction(event) {
  try {
    const chatId = event.context?.open_chat_id || event.open_chat_id;
    const actionValue = event.action?.value;
    
    if (!chatId || !actionValue) {
      console.log('⏭️ Missing chat ID or action value');
      return;
    }
    
    console.log('🎯 Processing card interaction:', actionValue);
    
    // Process card interaction (can take time)
    await processCardAction(chatId, actionValue);
    
  } catch (error) {
    console.error('❌ Error handling card interaction:', error);
  }
}

// Generate AI response (full OpenAI processing)
async function generateAIResponse(userMessage, chatId) {
  try {
    // Your full AI processing logic here
    // This can take 30+ seconds without timeout issues
    
    // Example AI call (replace with your actual implementation)
    const response = await callOpenAI(userMessage);
    return response;
    
  } catch (error) {
    console.error('❌ AI generation error:', error);
    return 'I apologize, but I encountered an issue processing your request. Please try again.';
  }
}

// Process card actions (full processing)
async function processCardAction(chatId, actionValue) {
  try {
    // Your full card processing logic here
    // This can include complex card generation, database queries, etc.
    
    if (actionValue === 'dashboard') {
      await sendPageFAQs(chatId, 'dashboard');
    } else if (actionValue === 'back_to_pages') {
      await sendPageSelection(chatId);
    }
    // ... other actions
    
  } catch (error) {
    console.error('❌ Card action processing error:', error);
  }
}

// Send message directly to Lark (bypassing Vercel)
async function sendMessageToLark(chatId, message) {
  try {
    const messageParams = {
      params: {
        receive_id_type: 'chat_id'
      },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: message }),
        uuid: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    };
    
    const result = await larkClient.im.message.create(messageParams);
    
    if (result.code !== 0) {
      throw new Error(`Lark API error: ${result.msg} (Code: ${result.code})`);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Error sending message to Lark:', error);
    throw error;
  }
}

// Placeholder functions (implement your actual logic)
async function callOpenAI(message) {
  // Your OpenAI implementation
  return `AI response to: ${message}`;
}

async function sendPageFAQs(chatId, pageKey) {
  // Your page FAQ implementation
  await sendMessageToLark(chatId, `Showing ${pageKey} FAQs...`);
}

async function sendPageSelection(chatId) {
  // Your page selection implementation
  await sendMessageToLark(chatId, 'Please select a page: Dashboard, Jobs, Candidates...');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    queue: requestQueue.length,
    processing: isProcessing,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔄 Relay service running on port ${PORT}`);
  console.log('📡 Ready to process Lark webhooks without timeout limits');
});

module.exports = app; 