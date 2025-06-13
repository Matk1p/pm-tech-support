const { Client } = require('@larksuiteoapi/node-sdk');
const OpenAI = require('openai');

// Initialize Lark client
const larkClient = new Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: 'self-built',
  domain: lark.Domain.Feishu
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load PM-Next Application Knowledge Base from markdown file
const fs = require('fs');
const path = require('path');
const PM_NEXT_KNOWLEDGE = fs.readFileSync(path.join(__dirname, '..', 'knowledge-base.md'), 'utf8');

// Handle incoming messages
async function handleMessage(event) {
  try {
    const { chat_id, message_id, content, mentions } = event.message;
    const { user_id } = event.sender;

    // Check if the bot was mentioned or if it's a direct message
    const isMentioned = mentions && mentions.some(mention => mention.key === process.env.LARK_APP_ID);
    const isDirectMessage = event.message.chat_type === 'p2p';

    if (!isMentioned && !isDirectMessage) {
      return; // Don't respond if bot wasn't mentioned and it's not a DM
    }

    // Extract text content
    let userMessage = '';
    if (content && content.text) {
      userMessage = content.text.replace(/@\w+/g, '').trim(); // Remove mentions
    }

    if (!userMessage) {
      return; // Don't respond to empty messages
    }

    // Generate AI response
    const aiResponse = await generateAIResponse(userMessage);

    // Send response back to Lark
    await sendMessage(chat_id, aiResponse);
    
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

// Generate AI response using OpenAI
async function generateAIResponse(userMessage) {
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant for the PM-Next Recruitment Management System. 
          Your role is to help users navigate and understand how to use the application effectively.
          
          Use this knowledge base about PM-Next:
          ${PM_NEXT_KNOWLEDGE}
          
          Guidelines:
          - Provide clear, step-by-step instructions for navigation
          - Be specific about where to find features in the application
          - If asked about features not in the knowledge base, politely explain that you can help with navigation and core features
          - Keep responses concise but helpful
          - Use bullet points or numbered steps when appropriate
          - Always be friendly and professional`
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating AI response:', error);
    return 'Sorry, I encountered an error processing your request. Please try again or contact support if the issue persists.';
  }
}

// Send message to Lark
async function sendMessage(chatId, message) {
  try {
    await larkClient.im.message.create({
      receive_id_type: 'chat_id',
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({
        text: message
      })
    });
  } catch (error) {
    console.error('Error sending message to Lark:', error);
  }
}

// Main handler function for Vercel
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST' && req.url === '/lark/events') {
      const { type, challenge, event } = req.body;

      // Handle URL verification
      if (type === 'url_verification') {
        return res.json({ challenge });
      }

      // Handle message events
      if (type === 'event_callback' && event) {
        if (event.type === 'message' && event.message) {
          await handleMessage(event);
        }
      }

      return res.json({ success: true });
    }

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
      return res.json({ 
        status: 'healthy', 
        service: 'PM-Next Lark Bot',
        timestamp: new Date().toISOString(),
        environment: 'vercel'
      });
    }

    // Default response
    return res.status(404).json({ error: 'Not found' });

  } catch (error) {
    console.error('Error in webhook handler:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}; 