// Lark webhook events handler at /api/lark/events
// This matches the webhook URL structure: /lark/events

const { Client } = require('@larksuiteoapi/node-sdk');
const OpenAI = require('openai');

// Initialize Lark client with debugging
console.log('🔧 ========== LARK SDK INITIALIZATION ==========');
console.log('🔧 Lark App ID available:', !!process.env.LARK_APP_ID);
console.log('🔧 Lark App Secret available:', !!process.env.LARK_APP_SECRET);
console.log('🔧 App ID preview:', process.env.LARK_APP_ID?.substring(0, 8) + '...');
console.log('🔧 Environment:', process.env.NODE_ENV);
console.log('🔧 Platform:', process.platform);

let larkClient;
try {
  larkClient = new Client({
    appId: process.env.LARK_APP_ID,
    appSecret: process.env.LARK_APP_SECRET,
    appType: 'self_built',
    domain: 'larksuite'
  });
  console.log('🔧 Lark client initialized successfully:', !!larkClient);
  console.log('🔧 Lark client methods available:', !!larkClient.im?.message?.create);
} catch (error) {
  console.error('🔧 Failed to initialize Lark client:', error);
  larkClient = null;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load PM-Next Application Knowledge Base from markdown file
const fs = require('fs');
const path = require('path');
const PM_NEXT_KNOWLEDGE = fs.readFileSync(path.join(__dirname, '..', '..', 'knowledge-base.md'), 'utf8');

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

// Main webhook handler
module.exports = async (req, res) => {
  console.log('🎯 ========== LARK WEBHOOK /lark/events ==========');
  console.log('🎯 Method:', req.method);
  console.log('🎯 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('🎯 Body:', JSON.stringify(req.body, null, 2));

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { header, event } = req.body;

    // Handle URL verification challenge
    if (header?.event_type === 'url_verification') {
      console.log('🔐 URL verification challenge received');
      const challenge = req.body.challenge;
      console.log('🔐 Responding with challenge:', challenge);
      return res.json({ challenge });
    }

    // Respond immediately to prevent timeout
    res.status(200).json({ success: true, message: 'Event received' });

    // Process the event asynchronously
    if (event) {
      console.log('🎯 Processing event type:', header?.event_type);
      console.log('🎯 Event data:', event);

      // Handle different event types
      switch (header?.event_type) {
        case 'im.message.receive_v1':
          console.log('💬 Processing message event');
          await handleMessage(event);
          break;
        
        case 'card.action.trigger':
          console.log('🔘 Processing card interaction event');
          await handleCardInteraction(event);
          break;
        
        default:
          console.log('❓ Unknown event type:', header?.event_type);
      }
    }

  } catch (error) {
    console.error('🚨 Webhook error:', error);
    console.error('🚨 Error stack:', error.stack);
    
    // If we haven't responded yet, send error response
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
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
    
    // Handle different event formats
    let chatId, actionValue, userId;
    
    if (event.open_chat_id) {
      chatId = event.open_chat_id;
      userId = event.open_id || event.user_id;
      actionValue = event.action?.value;
    } else if (event.context) {
      chatId = event.context.open_chat_id;
      userId = event.operator?.open_id || event.operator?.user_id;
      actionValue = event.action?.value;
    }
    
    if (actionValue && typeof actionValue === 'string') {
      actionValue = actionValue.replace(/^"(.*)"$/, '$1');
    }
    
    if (!actionValue) {
      console.log('⚠️ No action value in interaction');
      return;
    }
    
    console.log('🔍 Processing action:', actionValue);
    console.log('💬 Chat ID:', chatId);
    
    // Handle different button actions
    if (Object.keys(MAIN_PAGES).includes(actionValue)) {
      // Page selection
      console.log('📄 Page selected:', actionValue);
      await sendPageFAQs(chatId, actionValue);
    } else if (actionValue.startsWith('faq_')) {
      // FAQ selection
      console.log('🔍 ========== FAQ BUTTON CLICKED ==========');
      const parts = actionValue.split('_');
      console.log('🔍 Action value parts:', parts);
      const [, pageKey, faqIndex] = parts;
      console.log('🔍 Page key:', pageKey);
      console.log('🔍 FAQ index:', faqIndex);
      
      if (MAIN_PAGES[pageKey] && MAIN_PAGES[pageKey].faqs[faqIndex]) {
        const faqQuestion = MAIN_PAGES[pageKey].faqs[faqIndex];
        console.log('❓ FAQ selected:', faqQuestion);
        console.log('❓ Starting AI response generation...');
        
        try {
          const aiResponse = await generateAIResponse(faqQuestion);
          console.log('✅ AI response generated:', aiResponse?.substring(0, 100) + '...');
          console.log('📤 Sending message to chat...');
          await sendMessage(chatId, aiResponse);
          console.log('✅ Message sent successfully');
        } catch (error) {
          console.error('❌ Error in FAQ processing:', error);
          console.error('❌ Error stack:', error.stack);
          
          // Fallback: Send a simple confirmation message
          try {
            console.log('🔄 Attempting fallback message...');
            await sendMessage(chatId, `I received your question: "${faqQuestion}". Let me process this for you...`);
            console.log('✅ Fallback message sent');
          } catch (fallbackError) {
            console.error('❌ Fallback message also failed:', fallbackError);
          }
        }
      } else {
        console.log('⚠️ Invalid FAQ selection - page:', pageKey, 'index:', faqIndex);
        console.log('⚠️ Available pages:', Object.keys(MAIN_PAGES));
        console.log('⚠️ Available FAQs for page:', MAIN_PAGES[pageKey]?.faqs);
      }
    } else if (actionValue === 'back_to_pages') {
      // Back to page selection
      console.log('🔙 Back to page selection');
      await sendPageSelectionMessage(chatId);
    } else if (actionValue === 'ask_custom') {
      // Ask custom question
      console.log('💭 Custom question prompt');
      userInteractionState.set(chatId, { awaiting: 'custom_question' });
      await sendMessage(chatId, "Please type your question and I'll help you find the answer! 🤖");
    }
    
  } catch (error) {
    console.error('❌ Card interaction error:', error);
  }
}

// Send page selection message
async function sendPageSelectionMessage(chatId) {
  try {
    console.log('📄 Sending page selection to chat:', chatId);
    
    const pageButtons = Object.entries(MAIN_PAGES).map(([key, page]) => ({
      tag: 'button',
      text: {
        tag: 'plain_text',
        content: page.name
      },
      type: 'primary',
      value: key
    }));
    
    // Group buttons in rows of 2
    const buttonRows = [];
    for (let i = 0; i < pageButtons.length; i += 2) {
      const actions = pageButtons.slice(i, i + 2);
      buttonRows.push({
        tag: 'action',
        actions: actions
      });
    }
    
    const cardContent = {
      config: {
        wide_screen_mode: true,
        enable_forward: false
      },
      header: {
        template: 'blue',
        title: {
          tag: 'plain_text',
          content: '🚀 PM-Next Support Assistant'
        }
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '**Welcome!** 👋\n\nSelect a page to see common questions, or ask me anything about PM-Next!'
          }
        },
        {
          tag: 'hr'
        },
        ...buttonRows
      ]
    };
    
    await sendInteractiveCard(chatId, cardContent);
    
  } catch (error) {
    console.error('❌ Error sending page selection:', error);
  }
}

// Send page-specific FAQs
async function sendPageFAQs(chatId, pageKey) {
  try {
    console.log('📋 Sending FAQs for page:', pageKey);
    
    const page = MAIN_PAGES[pageKey];
    if (!page) {
      console.log('⚠️ Unknown page key:', pageKey);
      return;
    }
    
    // Create FAQ buttons (2 per row)
    const faqButtonRows = [];
    for (let i = 0; i < page.faqs.length; i += 2) {
      const actions = [];
      
      // First button in row
      if (page.faqs[i]) {
        actions.push({
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: page.faqs[i]
          },
          type: 'default',
          value: `faq_${pageKey}_${i}`
        });
      }
      
      // Second button in row (if exists)
      if (page.faqs[i + 1]) {
        actions.push({
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: page.faqs[i + 1]
          },
          type: 'default',
          value: `faq_${pageKey}_${i + 1}`
        });
      }
      
      faqButtonRows.push({
        tag: 'action',
        actions: actions
      });
    }
    
    // Navigation buttons
    const navButtons = {
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '🔙 Back to Pages'
          },
          type: 'default',
          value: 'back_to_pages'
        },
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '💭 Ask Custom Question'
          },
          type: 'primary',
          value: 'ask_custom'
        }
      ]
    };
    
    const cardContent = {
      config: {
        wide_screen_mode: true,
        enable_forward: false
      },
      header: {
        template: 'blue',
        title: {
          tag: 'plain_text',
          content: `${page.name} - Common Questions`
        }
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${page.description}**\n\nSelect a question below or ask something custom:`
          }
        },
        {
          tag: 'hr'
        },
        ...faqButtonRows,
        {
          tag: 'hr'
        },
        navButtons
      ]
    };
    
    await sendInteractiveCard(chatId, cardContent);
    
  } catch (error) {
    console.error('❌ Error sending page FAQs:', error);
  }
}

// Send interactive card with hybrid approach (SDK + fallback)
async function sendInteractiveCard(chatId, cardContent) {
  console.log('🎴 ========== SENDING INTERACTIVE CARD (HYBRID) ==========');
  console.log('🎴 Chat ID:', chatId);
  console.log('🎴 SDK client available:', !!larkClient);
  
  // Try SDK first if available
  if (larkClient) {
    try {
      console.log('🎴 Attempting to send card via SDK...');
      
      const response = await larkClient.im.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: chatId,
          content: JSON.stringify(cardContent),
          msg_type: 'interactive',
        },
      });

      console.log('🎴 SDK response code:', response.code);

      if (response.code === 0) {
        console.log('✅ Interactive card sent successfully via SDK');
        return;
      } else {
        throw new Error(`SDK returned error code ${response.code}: ${response.msg}`);
      }

    } catch (sdkError) {
      console.error('❌ SDK failed for card, falling back to fetch:', sdkError.message);
    }
  }

  // Fallback to pure fetch
  try {
    console.log('🎴 Using fetch fallback for card...');
    
    // Get access token
    const tokenResponse = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token request failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.code !== 0) {
      throw new Error(`Failed to get access token: ${tokenData.msg}`);
    }

    // Send interactive card
    const messageResponse = await fetch('https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.tenant_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: chatId,
        content: JSON.stringify(cardContent),
        msg_type: 'interactive',
      }),
      signal: AbortSignal.timeout(10000)
    });

    const messageData = await messageResponse.json();

    if (messageData.code !== 0) {
      throw new Error(`Failed to send card via fetch: ${messageData.msg}`);
    }

    console.log('✅ Interactive card sent successfully via fetch fallback');

  } catch (error) {
    console.error('❌ ========== ALL CARD METHODS FAILED ==========');
    console.error('❌ Error type:', error.constructor.name);
    console.error('❌ Error message:', error.message);
    throw error;
  }
}

// Generate AI response
async function generateAIResponse(userMessage) {
  try {
    console.log('🤖 ========== AI RESPONSE GENERATION ==========');
    console.log('🤖 Input message:', userMessage);
    console.log('🤖 OpenAI API Key available:', !!process.env.OPENAI_API_KEY);
    console.log('🤖 Starting OpenAI request...');
    
    // Add timeout for OpenAI request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant for PM-Next, a recruitment and project management application. Use the following knowledge base to answer questions accurately and helpfully:\n\n${PM_NEXT_KNOWLEDGE}\n\nProvide clear, actionable answers based on the knowledge base. If you don't know something specific, say so and suggest they contact support.`
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    }, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    
    const response = completion.choices[0].message.content;
    console.log('✅ AI response generated successfully');
    console.log('✅ Response length:', response?.length);
    return response;
    
  } catch (error) {
    console.error('❌ Error generating AI response:', error);
    console.error('❌ Error type:', error.constructor.name);
    console.error('❌ Error message:', error.message);
    
    if (error.name === 'AbortError') {
      console.error('❌ OpenAI request timed out');
      return "I'm sorry, my response took too long to generate. Please try asking a shorter question or contact support.";
    }
    
    return "I'm sorry, I'm having trouble processing your question right now. Please try again or contact support.";
  }
}

// Send regular message with hybrid approach (SDK + fallback)
async function sendMessage(chatId, message) {
  console.log('📤 ========== SENDING MESSAGE (HYBRID) ==========');
  console.log('📤 Chat ID:', chatId);
  console.log('📤 Message length:', message?.length);
  console.log('📤 Message preview:', message?.substring(0, 100) + '...');
  console.log('📤 SDK client available:', !!larkClient);

  // Try SDK first if available
  if (larkClient) {
    try {
      console.log('📤 Attempting to send via SDK...');
      
      const response = await larkClient.im.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: chatId,
          content: JSON.stringify({ text: message }),
          msg_type: 'text',
        },
      });

      console.log('📤 SDK response code:', response.code);
      console.log('📤 SDK response:', response);

      if (response.code === 0) {
        console.log('✅ Message sent successfully via SDK');
        return;
      } else {
        throw new Error(`SDK returned error code ${response.code}: ${response.msg}`);
      }

    } catch (sdkError) {
      console.error('❌ SDK failed, falling back to fetch:', sdkError.message);
    }
  }

  // Fallback to pure fetch
  try {
    console.log('📤 Using fetch fallback...');
    
    // Get access token
    const tokenResponse = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token request failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('📤 Token response code:', tokenData.code);

    if (tokenData.code !== 0) {
      throw new Error(`Failed to get access token: ${tokenData.msg}`);
    }

    // Send message
    const messageResponse = await fetch('https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.tenant_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: chatId,
        content: JSON.stringify({ text: message }),
        msg_type: 'text',
      }),
      signal: AbortSignal.timeout(10000)
    });

    const messageData = await messageResponse.json();
    console.log('📤 Fetch response code:', messageData.code);

    if (messageData.code !== 0) {
      throw new Error(`Failed to send message via fetch: ${messageData.msg}`);
    }

    console.log('✅ Message sent successfully via fetch fallback');

  } catch (error) {
    console.error('❌ ========== ALL MESSAGE METHODS FAILED ==========');
    console.error('❌ Error type:', error.constructor.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Environment check:');
    console.error('❌ - Lark App ID available:', !!process.env.LARK_APP_ID);
    console.error('❌ - Lark App Secret available:', !!process.env.LARK_APP_SECRET);
    throw error;
  }
} 