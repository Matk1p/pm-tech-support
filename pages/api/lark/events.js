// Next.js API Route for Lark Webhooks - Optimized for Vercel
import { createClient } from '@lark-opensdk/node-sdk';

// Initialize Lark client
const larkClient = createClient({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
});

// In-memory storage for processed events (for deduplication)
const processedEvents = new Set();

export default async function handler(req, res) {
  // Only handle POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📨 Lark webhook received');

    const { header, event, challenge, type } = req.body;

    // Handle URL verification
    if (type === 'url_verification') {
      console.log('🔗 URL verification request');
      return res.status(200).json({ challenge });
    }

    // RESPOND TO LARK IMMEDIATELY - This prevents timeout issues
    res.status(200).json({ 
      success: true, 
      message: 'Webhook received, processing in background',
      timestamp: new Date().toISOString()
    });

    // Handle message events
    if (header?.event_type === 'im.message.receive_v1' && event?.message) {
      const eventId = header.event_id;
      
      // Check for duplicates
      if (processedEvents.has(eventId)) {
        console.log('🔄 Duplicate message event, skipping');
        return;
      }
      
      processedEvents.add(eventId);
      
      // Process in background
      processMessage(event);
    }
    
    // Handle card interactions
    else if (header?.event_type === 'card.action.trigger' && event) {
      const eventId = header.event_id;
      
      // Check for duplicates
      if (processedEvents.has(eventId)) {
        console.log('🔄 Duplicate card event, skipping');
        return;
      }
      
      processedEvents.add(eventId);
      
      // Process in background
      processCardInteraction(event);
    }

  } catch (error) {
    console.error('❌ Webhook error:', error);
    
    // Still return success to prevent Lark retries
    if (!res.headersSent) {
      res.status(200).json({ 
        success: false, 
        error: 'Processing error',
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Process message in background
async function processMessage(event) {
  try {
    console.log('💬 Processing message in background');
    
    const chatId = event.message.chat_id;
    const messageContent = event.message.content;
    
    if (!chatId || !messageContent) {
      console.log('⏭️ Missing chat ID or content');
      return;
    }

    // Extract message text
    const contentObj = JSON.parse(messageContent);
    const userMessage = contentObj?.text || '';
    
    if (!userMessage.trim()) {
      console.log('⏭️ Empty message');
      return;
    }

    console.log('🤖 Generating AI response...');
    
    // Generate AI response (this can take time without blocking webhook)
    const aiResponse = await generateAIResponse(userMessage, chatId);
    
    if (aiResponse) {
      // Send response back to Lark
      await sendMessageToLark(chatId, aiResponse);
      console.log('✅ Response sent successfully');
    }

  } catch (error) {
    console.error('❌ Message processing error:', error);
  }
}

// Process card interaction in background
async function processCardInteraction(event) {
  try {
    console.log('🎯 Processing card interaction in background');
    
    const chatId = event.context?.open_chat_id || event.open_chat_id;
    const actionValue = event.action?.value;
    
    if (!chatId || !actionValue) {
      console.log('⏭️ Missing chat ID or action');
      return;
    }

    console.log('🔄 Processing action:', actionValue);
    
    // Handle different card actions
    if (actionValue === 'dashboard') {
      await sendPageOptions(chatId, 'dashboard');
    } else if (actionValue === 'back_to_pages') {
      await sendPageSelection(chatId);
    } else if (actionValue.startsWith('faq_')) {
      await handleFAQSelection(chatId, actionValue);
    }
    // Add more action handlers as needed

  } catch (error) {
    console.error('❌ Card interaction error:', error);
    
    // Send error recovery message
    try {
      const chatId = event.context?.open_chat_id || event.open_chat_id;
      if (chatId) {
        await sendMessageToLark(chatId, 'Sorry, I encountered an issue. Please try again or send me a message! 🤖');
      }
    } catch (recoveryError) {
      console.error('❌ Recovery message failed:', recoveryError);
    }
  }
}

// Generate AI response with timeout protection
async function generateAIResponse(message, chatId) {
  try {
    // Add timeout protection
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI response timeout')), 25000);
    });

    // Your AI generation logic here
    const aiPromise = callOpenAI(message, chatId);
    
    // Race between AI response and timeout
    const response = await Promise.race([aiPromise, timeoutPromise]);
    
    return response;

  } catch (error) {
    console.error('❌ AI generation error:', error);
    
    if (error.message === 'AI response timeout') {
      return 'I apologize for the delay. Please try asking your question again.';
    }
    
    return 'I encountered an issue processing your request. Please try again or contact support.';
  }
}

// Send message to Lark with retry logic
async function sendMessageToLark(chatId, message) {
  let retries = 3;
  
  while (retries > 0) {
    try {
      const result = await larkClient.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text: message }),
          uuid: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      });

      if (result.code === 0) {
        return result;
      } else {
        throw new Error(`Lark API error: ${result.msg}`);
      }

    } catch (error) {
      retries--;
      console.error(`❌ Send message error (${retries} retries left):`, error.message);
      
      if (retries === 0) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Placeholder functions - implement your actual logic
async function callOpenAI(message, chatId) {
  // Your OpenAI implementation here
  return `AI response to: ${message}`;
}

async function sendPageOptions(chatId, page) {
  await sendMessageToLark(chatId, `Showing ${page} options...`);
}

async function sendPageSelection(chatId) {
  await sendMessageToLark(chatId, 'Please select a page: Dashboard, Jobs, Candidates, Clients, Calendar, Claims');
}

async function handleFAQSelection(chatId, faqAction) {
  await sendMessageToLark(chatId, `Handling FAQ: ${faqAction}`);
}

// Disable body parsing for larger payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}; 