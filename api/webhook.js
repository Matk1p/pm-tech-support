const { Client } = require('@larksuiteoapi/node-sdk');
const OpenAI = require('openai');

// Initialize Lark client
const larkClient = new Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: 'self-built',
  domain: 'larksuite'
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load PM-Next Application Knowledge Base from markdown file
const fs = require('fs');
const path = require('path');
const PM_NEXT_KNOWLEDGE = fs.readFileSync(path.join(__dirname, '..', 'knowledge-base.md'), 'utf8');

// Store user interaction state
const userInteractionState = new Map(); // chatId -> { step, selectedPage, awaiting }

// Main page buttons and FAQs configuration
const MAIN_PAGES = {
  'dashboard': {
    name: '📊 Dashboard',
    description: 'Central hub with analytics and KPIs',
    faqs: [
      'How to view staff performance metrics?',
      'How to filter data by time period?',
      'How to understand pipeline values?',
      'How to access role-based analytics?'
    ]
  },
  'jobs': {
    name: '💼 Jobs',
    description: 'Job management and candidate assignment',
    faqs: [
      'How to create a new job posting?',
      'How to assign candidates to jobs?',
      'How to track job status and pipeline?',
      'How to manage job budgets and percentages?'
    ]
  },
  'candidates': {
    name: '👥 Candidates',
    description: 'Candidate management and profiles',
    faqs: [
      'How to add a new candidate?',
      'How to upload and parse resumes?',
      'How to assign candidates to jobs?',
      'How to track candidate communication history?'
    ]
  },
  'clients': {
    name: '🏢 Clients',
    description: 'Client relationship management',
    faqs: [
      'How to add a new client?',
      'How to organize parent company relationships?',
      'How to track client job history?',
      'How to manage client financial values?'
    ]
  },
  'calendar': {
    name: '📅 Calendar',
    description: 'Scheduling and event management',
    faqs: [
      'How to schedule a candidate meeting?',
      'How to request leave approval?',
      'How to create client meetings?',
      'How to view team calendar events?'
    ]
  },
  'claims': {
    name: '💰 Claims',
    description: 'Expense claims and approvals',
    faqs: [
      'How to submit an expense claim?',
      'How to upload receipt attachments?',
      'How to approve claims as a manager?',
      'How to track claim status and history?'
    ]
  }
};

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

    // Check for greetings to trigger interactive mode
    const greetings = ['hi', 'hello', 'hey', 'start', 'help', 'menu'];
    const isGreeting = greetings.some(greeting => 
      userMessage.toLowerCase().includes(greeting.toLowerCase())
    );

    if (isGreeting) {
      console.log('👋 Greeting detected, sending page selection');
      await sendPageSelectionMessage(chat_id);
      return;
    }

    // Generate AI response for normal questions
    const aiResponse = await generateAIResponse(userMessage);
    await sendMessage(chat_id, aiResponse);
    
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

// Handle card interactions
async function handleCardInteraction(event) {
  try {
    console.log('🎯 ========== CARD INTERACTION DEBUG ==========');
    console.log('🎯 Handling card interaction:', JSON.stringify(event, null, 2));
    console.log('🎯 Event keys:', Object.keys(event));
    console.log('🎯 Event type:', typeof event);
    
    // Handle different event formats
    let chatId, actionValue, userId;
    
    if (event.open_chat_id) {
      // Standard format
      chatId = event.open_chat_id;
      userId = event.open_id || event.user_id;
      actionValue = event.action?.value;
    } else if (event.context) {
      // Lark webhook format with context and operator
      chatId = event.context.open_chat_id;
      userId = event.operator?.open_id || event.operator?.user_id;
      actionValue = event.action?.value;
    } else {
      console.log('⚠️ Unknown card interaction format');
      console.log('⚠️ Available event keys:', Object.keys(event));
      return;
    }
    
    console.log('🔍 Raw action object:', event.action);
    console.log('🔍 Raw action value:', actionValue);
    console.log('🔍 Action value type:', typeof actionValue);
    
    // Clean up action value (remove extra quotes if present)
    if (actionValue && typeof actionValue === 'string') {
      actionValue = actionValue.replace(/^"(.*)"$/, '$1');
    }
    
    if (!actionValue) {
      console.log('⚠️ No action value in interaction');
      console.log('⚠️ Event structure:', {
        hasAction: !!event.action,
        actionKeys: event.action ? Object.keys(event.action) : 'no action',
        actionValue: event.action?.value,
        fullEvent: event
      });
      return;
    }
    
    console.log('🔍 Processing action:', actionValue);
    console.log('💬 Chat ID:', chatId);
    console.log('👤 User ID:', userId);
    
    // Handle different button actions
    if (Object.keys(MAIN_PAGES).includes(actionValue)) {
      // Page selection
      console.log('📄 Page selected:', actionValue);
      await sendPageFAQs(chatId, actionValue);
    } else if (actionValue.startsWith('faq_')) {
      // FAQ selection
      console.log('🔍 ========== FAQ BUTTON DEBUG ==========');
      console.log('🔍 Raw action value:', actionValue);
      
      const parts = actionValue.split('_');
      console.log('🔍 Split parts:', parts);
      
      const [, pageKey, faqIndex] = parts;
      console.log('🔍 Page key:', pageKey);
      console.log('🔍 FAQ index:', faqIndex);
      
      const page = MAIN_PAGES[pageKey];
      console.log('🔍 Page found:', !!page);
      
      if (!page) {
        console.error('❌ Page not found for key:', pageKey);
        console.error('❌ Available pages:', Object.keys(MAIN_PAGES));
        await sendMessage(chatId, "Sorry, I couldn't find that page. Please try again.");
        return;
      }
      
      const faq = page.faqs[parseInt(faqIndex)];
      console.log('🔍 FAQ found:', !!faq);
      console.log('🔍 FAQ text:', faq);
      console.log('🔍 All FAQs for page:', page.faqs);
      
      if (!faq) {
        console.error('❌ FAQ not found for index:', faqIndex);
        console.error('❌ Available FAQs:', page.faqs.map((f, i) => `${i}: ${f}`));
        await sendMessage(chatId, "Sorry, I couldn't find that FAQ. Please try again.");
        return;
      }
      
      console.log('❓ FAQ selected:', faq);
      console.log('🤖 Generating AI response for FAQ...');
      
      try {
        // Generate AI response for the FAQ
        const faqResponse = await generateAIResponse(faq);
        console.log('✅ FAQ response generated successfully');
        console.log('📝 Response type:', typeof faqResponse);
        
        console.log('📤 Sending FAQ response...');
        await sendMessage(chatId, `**${faq}**\n\n${faqResponse}`);
        console.log('✅ FAQ response sent successfully');
        
        // Reset user state
        userInteractionState.delete(chatId);
      } catch (error) {
        console.error('❌ ========== FAQ RESPONSE ERROR ==========');
        console.error('❌ Error generating FAQ response:', error);
        console.error('❌ Error stack:', error.stack);
        await sendMessage(chatId, "Sorry, I encountered an error processing your FAQ. Please try asking me directly!");
      }
      console.log('🔍 ======================================');
    } else if (actionValue === 'back_to_pages') {
      // Back to page selection
      await sendPageSelectionMessage(chatId);
    } else if (actionValue === 'custom_question') {
      // Enable custom question mode
      await sendMessage(chatId, "Please go ahead and ask me anything about PM-Next! I'm here to help. 🤖");
      userInteractionState.delete(chatId);
    }
    
  } catch (error) {
    console.error('❌ Error handling card interaction:', error);
  }
}

// Send interactive page selection message
async function sendPageSelectionMessage(chatId) {
  try {
    console.log('📋 Sending page selection message to chat:', chatId);
    
    const cardContent = {
      "config": {
        "wide_screen_mode": true
      },
      "header": {
        "template": "blue",
        "title": {
          "content": "🤖 Welcome to PM-Next Support Bot",
          "tag": "plain_text"
        }
      },
      "elements": [
        {
          "tag": "div",
          "text": {
            "content": "Please select the page you need help with:",
            "tag": "plain_text"
          }
        },
        {
          "tag": "hr"
        },
        {
          "tag": "action",
          "actions": Object.keys(MAIN_PAGES).slice(0, 3).map(pageKey => ({
            "tag": "button",
            "text": {
              "content": MAIN_PAGES[pageKey].name,
              "tag": "plain_text"
            },
            "type": "primary",
            "value": pageKey
          }))
        },
        {
          "tag": "action",
          "actions": Object.keys(MAIN_PAGES).slice(3, 6).map(pageKey => ({
            "tag": "button",
            "text": {
              "content": MAIN_PAGES[pageKey].name,
              "tag": "plain_text"
            },
            "type": "primary",
            "value": pageKey
          }))
        },
        {
          "tag": "hr"
        },
        {
          "tag": "div",
          "text": {
            "content": "Or you can ask me anything directly about PM-Next!",
            "tag": "plain_text"
          }
        }
      ]
    };

    await sendInteractiveCard(chatId, cardContent);
    
    userInteractionState.set(chatId, {
      step: 'awaiting_page_selection',
      selectedPage: null,
      awaiting: true
    });
    
  } catch (error) {
    console.error('❌ Error sending page selection message:', error);
    await sendMessage(chatId, "Welcome to PM-Next Support Bot! 🤖\n\nPlease let me know which page you need help with:\n📊 Dashboard\n💼 Jobs\n👥 Candidates\n🏢 Clients\n📅 Calendar\n💰 Claims\n\nOr ask me anything about PM-Next directly!");
  }
}

// Send FAQ options for selected page
async function sendPageFAQs(chatId, pageKey) {
  try {
    const page = MAIN_PAGES[pageKey];
    if (!page) {
      throw new Error(`Unknown page: ${pageKey}`);
    }
    
    const cardContent = {
      "config": {
        "wide_screen_mode": true
      },
      "header": {
        "template": "green",
        "title": {
          "content": `${page.name} - FAQs`,
          "tag": "plain_text"
        }
      },
      "elements": [
        {
          "tag": "div",
          "text": {
            "content": `Here are common questions about ${page.description}:`,
            "tag": "plain_text"
          }
        },
        {
          "tag": "hr"
        },
        {
          "tag": "action",
          "actions": page.faqs.slice(0, 2).map((faq, index) => ({
            "tag": "button",
            "text": {
              "content": faq,
              "tag": "plain_text"
            },
            "type": "default",
            "value": `faq_${pageKey}_${index}`
          }))
        },
        {
          "tag": "action",
          "actions": page.faqs.slice(2, 4).map((faq, index) => ({
            "tag": "button",
            "text": {
              "content": faq,
              "tag": "plain_text"
            },
            "type": "default",
            "value": `faq_${pageKey}_${index + 2}`
          }))
        },
        {
          "tag": "hr"
        },
        {
          "tag": "action",
          "actions": [
            {
              "tag": "button",
              "text": {
                "content": "◀️ Back to Page Selection",
                "tag": "plain_text"
              },
              "type": "default",
              "value": "back_to_pages"
            },
            {
              "tag": "button",
              "text": {
                "content": "💬 Ask Custom Question",
                "tag": "plain_text"
              },
              "type": "primary",
              "value": "custom_question"
            }
          ]
        }
      ]
    };

    await sendInteractiveCard(chatId, cardContent);
    
    userInteractionState.set(chatId, {
      step: 'awaiting_faq_selection',
      selectedPage: pageKey,
      awaiting: true
    });
    
  } catch (error) {
    console.error('❌ Error sending FAQ options:', error);
  }
}

// Send interactive card to Lark
async function sendInteractiveCard(chatId, cardContent) {
  try {
    console.log('📨 Sending interactive card to chat:', chatId);
    
    // Detect ID type
    let receiveIdType = 'chat_id';
    if (chatId.startsWith('ou_')) {
      receiveIdType = 'user_id';
    } else if (chatId.startsWith('oc_')) {
      receiveIdType = 'chat_id';
    } else if (chatId.startsWith('og_')) {
      receiveIdType = 'chat_id';
    }

    console.log('📦 Interactive card payload:', JSON.stringify(cardContent, null, 2));
    console.log('🔍 Using receive_id_type:', receiveIdType);

    // Use Lark SDK instead of raw fetch for better serverless compatibility
    const messageData = await larkClient.im.message.create({
      receive_id_type: receiveIdType,
      receive_id: chatId,
      msg_type: 'interactive',
      content: JSON.stringify(cardContent),
      uuid: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
    
    console.log('📊 Lark SDK response data for card:', JSON.stringify(messageData, null, 2));
    
    if (messageData.code !== 0) {
      console.error('🚨 Lark API Error Details for card:', {
        code: messageData.code,
        msg: messageData.msg,
        data: messageData.data,
        error: messageData.error
      });
      throw new Error(`Failed to send interactive card: ${messageData.msg || 'Unknown error'}`);
    }

    console.log('✅ Interactive card sent successfully via SDK');
  } catch (error) {
    console.error('❌ Error sending interactive card:', error);
    
    // Add additional debugging for serverless issues
    if (error.message.includes('fetch failed') || error.message.includes('SocketError')) {
      console.error('🌐 Network connectivity issue detected in serverless environment');
      console.error('💡 This may be a temporary Vercel/Lark connectivity issue');
    }
    
    throw error;
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
    if (req.method === 'POST') {
      const { type, challenge, event } = req.body;

      // Handle URL verification
      if (type === 'url_verification') {
        return res.json({ challenge });
      }

      // Handle events
      if (type === 'event_callback' && event) {
        if (event.type === 'message' && event.message) {
          // Process message asynchronously to respond quickly
          handleMessage(event).catch(error => 
            console.error('Error processing message:', error)
          );
        } else if (event.type === 'card.action.trigger') {
          // Handle card interactions asynchronously to respond immediately
          console.log('🎯 Card interaction received at:', new Date().toISOString());
          console.log('🎯 Full card event data:', JSON.stringify(event, null, 2));
          console.log('🎯 Responding immediately to prevent timeout');
          
          // Start processing asynchronously
          handleCardInteraction(event).catch(error => 
            console.error('Error processing card interaction:', error)
          );
          
          // Return success immediately for card interactions
          console.log('✅ Sending immediate webhook response');
          return res.status(200).json({ 
            success: true, 
            message: 'Card interaction received',
            timestamp: new Date().toISOString()
          });
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