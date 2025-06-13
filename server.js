require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Client } = require('@larksuiteoapi/node-sdk');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3001;

// Store processed event IDs to prevent duplicates
const processedEvents = new Set();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Lark client
const larkClient = new Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: 'self-built',
  domain: 'larksuite', // Use 'larksuite' for global domain
  loggerLevel: 'debug'
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load PM-Next Application Knowledge Base from markdown file
const fs = require('fs');
const path = require('path');
const PM_NEXT_KNOWLEDGE = fs.readFileSync(path.join(__dirname, 'knowledge-base.md'), 'utf8');

// Handle Lark events
app.post('/lark/events', async (req, res) => {
  try {
    console.log('📥 Received Lark event:', JSON.stringify(req.body, null, 2));
    const { schema, header, event, challenge, type } = req.body;

    // Handle URL verification (legacy format)
    if (type === 'url_verification') {
      console.log('🔗 URL verification request');
      return res.status(200).json({ 
        challenge: challenge 
      });
    }

    // Handle new format events
    if (header && header.event_type === 'im.message.receive_v1' && event) {
      console.log('📨 Message event received from header');
      console.log('📋 Event structure:', Object.keys(event));
      
      // Check for duplicate events
      const eventId = header.event_id;
      if (processedEvents.has(eventId)) {
        console.log('🔄 Duplicate event detected, skipping:', eventId);
        return res.json({ success: true });
      }
      
      // Mark event as processed
      processedEvents.add(eventId);
      
      // Clean up old event IDs (keep only last 1000 to prevent memory issues)
      if (processedEvents.size > 1000) {
        const eventsArray = Array.from(processedEvents);
        processedEvents.clear();
        eventsArray.slice(-500).forEach(id => processedEvents.add(id));
      }
      
      // Check if this is a message event by looking for the message property
      if (event.message) {
        console.log('💬 Processing message event');
        await handleMessage(event);
      } else {
        console.log('⏭️ Not a message event, skipping');
      }
    } else {
      console.log('⏭️ Unknown event type or structure');
      console.log('📋 Available keys:', Object.keys(req.body));
      if (header) {
        console.log('📋 Header event type:', header.event_type);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error handling Lark event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle incoming messages
async function handleMessage(event) {
  try {
    console.log('🔍 Handling message event:', JSON.stringify(event, null, 2));
    
    const { chat_id, message_id, content, mentions } = event.message;
    const { sender_type, sender_id } = event.sender;

    console.log('📋 Message details:');
    console.log('  - Chat ID:', chat_id);
    console.log('  - Message ID:', message_id);
    console.log('  - Sender Type:', sender_type);
    console.log('  - Sender ID:', sender_id);
    console.log('  - Chat type:', event.message.chat_type);
    console.log('  - Content:', content);
    console.log('  - Mentions:', mentions);

    // Check if the message is from the bot itself
    if (sender_type === 'app' || (sender_id && sender_id.id === process.env.LARK_APP_ID)) {
      console.log('🤖 Skipping: Message from bot itself');
      return; // Don't respond to own messages
    }

    // Check if the bot was mentioned or if it's a direct message
    const isMentioned = mentions && mentions.some(mention => mention.key === process.env.LARK_APP_ID);
    const isDirectMessage = event.message.chat_type === 'p2p';

    console.log('🎯 Response conditions:');
    console.log('  - Is mentioned:', isMentioned);
    console.log('  - Is direct message:', isDirectMessage);
    console.log('  - Should respond:', isMentioned || isDirectMessage);

    if (!isMentioned && !isDirectMessage) {
      console.log('⏭️  Skipping: Not mentioned and not a DM');
      return; // Don't respond if bot wasn't mentioned and it's not a DM
    }

    // Extract text content
    let userMessage = '';
    if (content) {
      // Content might be a JSON string, so parse it first
      let parsedContent = content;
      if (typeof content === 'string') {
        try {
          parsedContent = JSON.parse(content);
        } catch (e) {
          console.log('⚠️ Content is not JSON, using as string');
          parsedContent = { text: content };
        }
      }
      
      if (parsedContent && parsedContent.text) {
        userMessage = parsedContent.text.replace(/@\w+/g, '').trim(); // Remove mentions
      }
    }

    console.log('📝 Extracted user message:', userMessage);

    if (!userMessage) {
      console.log('⏭️  Skipping: Empty message');
      return; // Don't respond to empty messages
    }

    console.log('🤖 Generating AI response...');
    // Generate AI response
    const aiResponse = await generateAIResponse(userMessage);
    console.log('✅ AI response generated:', aiResponse);

    console.log('📤 Sending response to Lark...');
    // Send response back to Lark
    await sendMessage(chat_id, aiResponse);
    console.log('🎉 Message sent successfully!');
    
  } catch (error) {
    console.error('❌ Error handling message:', error);
  }
}

// Generate AI response using OpenAI
async function generateAIResponse(userMessage) {
  try {
    console.log('🧠 Calling OpenAI with message:', userMessage);
    
    // Try different models in order of preference
    const models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    const selectedModel = process.env.OPENAI_MODEL || models[0];
    console.log('🔧 Using OpenAI model:', selectedModel);
    
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant for the PM-Next Recruitment Management System. 
          Your role is to help users navigate and understand how to use the application effectively.
          
          Use this knowledge base about PM-Next:
          ${PM_NEXT_KNOWLEDGE}
          
          ENHANCED RESPONSE GUIDELINES:
          
          1. **Initial Response**: Provide clear, step-by-step instructions for navigation and usage
          
          2. **Follow-up Questions**: If the user encounters issues or needs clarification, ask specific diagnostic questions based on their problem type:
          
          **For File Upload Issues:**
          - What file format are you trying to upload? (PDF, DOC, DOCX, etc.)
          - What is the file size?
          - What error message do you see exactly?
          - Which browser are you using?
          - Have you tried uploading a different file to test?
          
          **For Candidate Management Issues:**
          - At which step are you experiencing the problem?
          - Are you seeing any error messages?
          - What candidate status are you trying to set?
          - Are you able to access the candidate list?
          - Is this happening with all candidates or specific ones?
          
          **For Job Management Issues:**
          - Which specific job feature is not working?
          - Can you see the job in your job list?
          - Are you trying to create, edit, or delete a job?
          - What error appears when you try to save?
          - Are the required fields filled in correctly?
          
          **For Client Management Issues:**
          - What client information are you trying to access or modify?
          - Can you see the client in your client list?
          - Are you experiencing issues with contact management or financial tracking?
          - What error message appears?
          
          **For Login/Access Issues:**
          - Are you using the correct login credentials?
          - What error message do you see when trying to log in?
          - Have you tried resetting your password?
          - Which page are you unable to access?
          
          **For Performance Issues:**
          - Which specific pages or features are loading slowly?
          - How long does it typically take to load?
          - Are you experiencing this across all features or specific ones?
          - What device and browser are you using?
          
          3. **Smart Escalation**: If user indicates continued problems after follow-up questions, escalate to live support:
          
          **Escalation Triggers:**
          - User mentions "still not working" or "tried that already"
          - User expresses frustration ("this is ridiculous", "wasting time")
          - Technical issues beyond basic troubleshooting
          - Complex workflow problems requiring investigation
          - User specifically requests human support
          
          **Escalation Response Template:**
          "I understand this issue needs more specialized attention. Let me connect you with our live support team who can provide immediate assistance:
          
          🔗 **Join our PM-Next Support Chat**: [PM-Next Live Support Group](https://applink.larksuite.com/client/chat/chatter/add_by_link?link_token=3ddsabad-9efa-4856-ad86-a3974dk05ek2)
          
          Or contact our support team directly:
          📧 **Email**: support@pm-next.com
          📞 **Phone**: +1 (555) 123-4567
          ⏰ **Hours**: Monday-Friday, 9 AM - 6 PM EST
          
          Please provide them with:
          - A description of what you were trying to do
          - The exact error message (if any)
          - Your browser and device information
          - When the issue started occurring
          
          Our live support team will be able to screen-share and provide hands-on assistance to resolve your issue quickly."
          
          4. **Response Parsing**: When users provide answers to your diagnostic questions, acknowledge their responses and provide targeted solutions or escalate if needed.
          
          5. **General Guidelines:**
          - Be specific about where to find features in the application
          - Keep responses concise but helpful
          - Use bullet points or numbered steps when appropriate
          - Always be friendly and professional
          - If asked about features not in the knowledge base, politely explain limitations and offer general guidance`
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    console.log('🎯 OpenAI response received successfully');
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('❌ Error generating AI response:', error);
    return 'Sorry, I encountered an error processing your request. Please try again or contact support if the issue persists.';
  }
}

// Send message to Lark using direct API call
async function sendMessage(chatId, message) {
  try {
    console.log('📨 Sending message to chat:', chatId);
    console.log('📝 Message content:', message);
    
    // First, get the access token
    const tokenResponse = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET
      })
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.code !== 0) {
      throw new Error(`Failed to get access token: ${tokenData.msg}`);
    }

    const accessToken = tokenData.tenant_access_token;
    console.log('🔑 Got access token successfully');

    // Send the message
    // Detect the ID type based on the chat ID format
    let idType = 'chat_id';
    if (chatId.startsWith('ou_')) {
      idType = 'user_id';
    } else if (chatId.startsWith('oc_')) {
      idType = 'chat_id';
    } else if (chatId.startsWith('og_')) {
      idType = 'chat_id';
    }

    const messagePayload = {
      receive_id_type: idType,
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({
        text: message
      }),
      uuid: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    console.log('📦 Message payload:', JSON.stringify(messagePayload, null, 2));

    const messageResponse = await fetch(`https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=${idType}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({
          text: message
        }),
        uuid: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      })
    });

    const messageData = await messageResponse.json();
    
    console.log('📊 Lark API response status:', messageResponse.status);
    console.log('📊 Lark API response data:', JSON.stringify(messageData, null, 2));
    
    if (messageData.code !== 0) {
      console.error('🚨 Lark API Error Details:', {
        code: messageData.code,
        msg: messageData.msg,
        data: messageData.data,
        error: messageData.error
      });
      throw new Error(`Failed to send message: ${messageData.msg || 'Unknown error'}`);
    }

    console.log('✅ Message sent successfully:', messageData);
  } catch (error) {
    console.error('❌ Error sending message to Lark:', error);
    console.error('📋 Error details:', error.message);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'PM-Next Lark Bot',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🤖 PM-Next Lark Bot server is running on port ${PORT}`);
  console.log(`📝 Health check: http://localhost:${PORT}/health`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down PM-Next Lark Bot server...');
  process.exit(0);
}); 