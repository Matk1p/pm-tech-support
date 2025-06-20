// Next.js API Route for Lark Webhooks - Complete Bot Implementation
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { Client } from '@larksuiteoapi/node-sdk';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Validate environment variables
function validateEnvironment() {
  const required = ['LARK_APP_ID', 'LARK_APP_SECRET', 'OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing);
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  console.log('✅ Environment variables validated');
  return true;
}

// Initialize clients with validation
validateEnvironment();

const larkClient = new Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  loggerLevel: 'info'
});

console.log('✅ Lark client initialized with App ID:', process.env.LARK_APP_ID?.slice(0, 8) + '...');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// In-memory storage (consider using external storage for production)
const processedEvents = new Set();
const conversationContext = new Map();
const userInteractionState = new Map();
const responseCache = new Map();
const ticketCollectionState = new Map();

// Constants and configurations
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const KNOWLEDGE_BASE_TABLE = 'knowledge_base';
const SUPPORT_TICKETS_TABLE = 'support_tickets';

// Main pages configuration
const MAIN_PAGES = {
  dashboard: {
    name: '📊 Dashboard',
    description: 'overview and analytics',
    faqs: [
      'How do I view candidate statistics?',
      'Where can I see recent activity?',
      'How to customize my dashboard widgets?',
      'Why are my numbers not updating?'
    ]
  },
  jobs: {
    name: '💼 Jobs',
    description: 'job posting and management',
    faqs: [
      'How do I create a new job posting?',
      'How to edit an existing job?',
      'How do I add candidates to a job?',
      'How to set job as active or closed?'
    ]
  },
  candidates: {
    name: '👥 Candidates',
    description: 'candidate profiles and management',
    faqs: [
      'How do I add a new candidate?',
      'How to upload candidate resumes?',
      'How do I search for candidates?',
      'How to move candidates between stages?'
    ]
  },
  clients: {
    name: '🏢 Clients',
    description: 'client and company management',
    faqs: [
      'How do I add a new client?',
      'How to manage client contacts?',
      'How do I update client information?',
      'How to link jobs to clients?'
    ]
  },
  calendar: {
    name: '📅 Calendar',
    description: 'interview scheduling and calendar management',
    faqs: [
      'How do I schedule an interview?',
      'How to sync with my calendar?',
      'How do I reschedule appointments?',
      'How to set my availability?'
    ]
  },
  claims: {
    name: '💰 Claims',
    description: 'billing and financial tracking',
    faqs: [
      'How do I submit a claim?',
      'Where can I track payment status?',
      'How to generate invoices?',
      'How do I view my commission?'
    ]
  }
};

// FAQ responses
const FAQ_RESPONSES = {
  candidate_management: `**Candidate Management Help:**

**Adding Candidates:**
• Navigate to the Candidates section
• Click the "Add New" or "+" button
• Fill in the required fields (name, email, phone)
• Upload resume if available
• Save the candidate profile

**Common Issues & Solutions:**
• **Can't add candidate?** Check that all required fields are filled
• **Resume not uploading?** Ensure file is PDF, DOC, or DOCX format and under 10MB
• **Page not responding?** Try refreshing the browser or clearing cache
• **Getting error messages?** Note the exact error text to help with troubleshooting

**If you're still having trouble, I can create a support ticket to get you personalized help from our technical team.**`,

  job_management: `**Job Management FAQs:**

• **Create Job**: Dashboard → Jobs → Create Job → fill details → Save
• **Edit Job**: Click job title → update fields → Save
• **Add Candidates**: Job profile → Candidates section → Add Candidate
• **Set Status**: Use status dropdown (Active/Closed/On Hold)

**Common Issues:**
• Job not saving? Check required fields are completed
• Can't find job? Use search or check job status filters
• Candidates not linking? Ensure both candidate and job exist`,

  general: `**General PM-Next Support:**

I'm here to help you with any issues you're experiencing in PM-Next. For the best assistance, please let me know:

• **What specific feature** you're trying to use
• **What exactly happens** when you try to perform the action
• **Any error messages** you see

**Common Quick Fixes:**
• Try refreshing your browser page
• Clear your browser cache and cookies
• Make sure you have a stable internet connection
• Try using a different browser (Chrome, Firefox, Safari, Edge)

**If these don't help, I can create a support ticket to get you personalized assistance from our technical team.**`
};

const PM_NEXT_KNOWLEDGE = `You are a helpful assistant for the PM-Next Recruitment Management System. 

Key features of PM-Next:
1. **Dashboard**: Overview of activities, statistics, and key metrics
2. **Jobs**: Create, manage, and track job postings and requirements
3. **Candidates**: Manage candidate profiles, resumes, and application stages
4. **Clients**: Handle client companies and contact information
5. **Calendar**: Schedule interviews and manage appointments
6. **Claims**: Track billing, invoices, and commission payments

Common workflows:
- Adding candidates: Candidates → Add New → Fill details → Save
- Creating jobs: Jobs → Create New → Fill requirements → Publish
- Scheduling interviews: Calendar → Schedule → Select participants → Confirm
- Client management: Clients → Add/Edit → Update information → Save

Always provide specific, actionable steps when helping users.`;

export default async function handler(req, res) {
  // Handle GET requests (for health checks and verification)
  if (req.method === 'GET') {
    try {
      // Test Lark client initialization
      const clientStatus = larkClient ? 'initialized' : 'not initialized';
      
      return res.status(200).json({ 
        status: 'ok',
        message: 'Lark webhook endpoint is active',
        timestamp: new Date().toISOString(),
        endpoint: '/api/lark/events',
        methods: ['GET', 'POST'],
        larkClient: clientStatus,
        environment: {
          hasAppId: !!process.env.LARK_APP_ID,
          hasAppSecret: !!process.env.LARK_APP_SECRET,
          hasOpenAI: !!process.env.OPENAI_API_KEY,
          hasSupabase: !!process.env.SUPABASE_URL
        }
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Only handle POST requests for actual webhook events
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use GET for health check or POST for webhook events.' });
  }

  try {
    console.log('📨 Lark webhook received');
    console.log('🔍 Request method:', req.method);
    console.log('🔍 Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('🔍 Request body:', JSON.stringify(req.body, null, 2));

    const { header, event, challenge, type } = req.body;
    
    console.log('🔍 Parsed webhook data:', {
      hasHeader: !!header,
      hasEvent: !!event,
      hasChallenge: !!challenge,
      type: type,
      eventType: header?.event_type
    });

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
      console.log('📨 Message event received:', {
        eventType: header.event_type,
        eventId: header.event_id,
        chatId: event.message?.chat_id,
        messageType: event.message?.message_type,
        senderId: event.sender?.sender_id
      });
      
      const eventId = header.event_id;
      
      // Check for duplicates
      if (processedEvents.has(eventId)) {
        console.log('🔄 Duplicate message event, skipping');
        return;
      }
      
      processedEvents.add(eventId);
      
      // Process in background with proper error handling
      setImmediate(async () => {
        try {
          console.log('🔄 Background processing started');
          await processMessage(event);
          console.log('✅ Background processing completed');
        } catch (error) {
          console.error('❌ Background processing failed:', {
            message: error.message,
            name: error.name,
            stack: error.stack?.split('\n').slice(0, 5)
          });
        }
      });
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
      
      // Process in background with proper error handling
      setImmediate(async () => {
        try {
          console.log('🔄 Background card processing started');
          await processCardInteraction(event);
          console.log('✅ Background card processing completed');
        } catch (error) {
          console.error('❌ Background card processing failed:', {
            message: error.message,
            name: error.name,
            stack: error.stack?.split('\n').slice(0, 5)
          });
        }
      });
    }

      } catch (error) {
      console.error('❌ Webhook error:', error);
      console.error('❌ Error stack:', error.stack);
      console.log('🔍 Request body that caused error:', JSON.stringify(req.body, null, 2));
      
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
    console.log('🔍 Full event object:', JSON.stringify(event, null, 2));
    
    const chatId = event.message?.chat_id;
    const messageContent = event.message?.content;
    const senderId = event.sender?.sender_id?.user_id;
    
    console.log('🔍 Extracted data:', {
      chatId,
      messageContent: messageContent?.substring(0, 100),
      senderId,
      hasMessage: !!event.message,
      messageType: event.message?.message_type
    });
    
    if (!chatId || !messageContent) {
      console.log('⏭️ Missing chat ID or content:', { chatId: !!chatId, content: !!messageContent });
      return;
    }

    // Extract message text
    let contentObj;
    try {
      contentObj = JSON.parse(messageContent);
      console.log('🔍 Parsed content object:', contentObj);
    } catch (parseError) {
      console.error('❌ Failed to parse message content:', parseError);
      console.log('🔍 Raw message content:', messageContent);
      return;
    }
    
    const userMessage = extractTextFromMessage(contentObj);
    console.log('🔍 Extracted user message:', userMessage);
    
    if (!userMessage.trim()) {
      console.log('⏭️ Empty message after extraction');
      return;
    }

    console.log('🤖 Generating AI response for:', userMessage);
    
    // Check if user is in ticket creation flow
    if (ticketCollectionState.has(chatId)) {
      const ticketResponse = await handleTicketCreationFlow(chatId, userMessage, ticketCollectionState.get(chatId), senderId);
      if (ticketResponse) {
        await sendMessageToLark(chatId, ticketResponse);
        return;
      }
    }

    // Generate AI response
    const aiResponseData = await generateAIResponse(userMessage, chatId, senderId);
    
    if (aiResponseData) {
      const aiResponse = typeof aiResponseData === 'string' ? aiResponseData : aiResponseData.response;
      
      if (aiResponse) {
        await sendMessageToLark(chatId, aiResponse);
        console.log('✅ Response sent successfully');
      }
    }

  } catch (error) {
    console.error('❌ Message processing error:', error);
    
    try {
      await sendMessageToLark(event.message.chat_id, 'I encountered an issue processing your message. Please try again or contact support.');
    } catch (fallbackError) {
      console.error('❌ Fallback message failed:', fallbackError);
    }
  }
}

// Process card interaction in background
async function processCardInteraction(event) {
  try {
    console.log('🎯 Processing card interaction in background');
    
    const chatId = event.context?.open_chat_id || event.open_chat_id;
    let actionValue = event.action?.value;
    
    if (!chatId || !actionValue) {
      console.log('⏭️ Missing chat ID or action');
      return;
    }

    // Clean up action value
    if (typeof actionValue === 'string') {
      actionValue = actionValue.replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"');
    }

    console.log('🔄 Processing action:', actionValue);
    
    // Handle different card actions
    if (Object.keys(MAIN_PAGES).includes(actionValue)) {
      // Page selection
      await sendPageFAQs(chatId, actionValue);
    } else if (actionValue.startsWith('faq_')) {
      // FAQ selection
      const [, pageKey, faqIndex] = actionValue.split('_');
      const page = MAIN_PAGES[pageKey];
      
      if (page && page.faqs[parseInt(faqIndex)]) {
        const faq = page.faqs[parseInt(faqIndex)];
        const faqAnswer = await getFastFAQAnswer(pageKey, faq);
        
        await sendMessageToLark(chatId, `**${faq}**\n\n${faqAnswer}`);
        
        // Send follow-up navigation card
        const followUpCard = {
          "elements": [
            {
              "tag": "div",
              "text": {
                "content": "Need more help?",
                "tag": "plain_text"
              }
            },
            {
              "tag": "action",
              "actions": [
                {
                  "tag": "button",
                  "text": {
                    "content": "🔙 Back to FAQs",
                    "tag": "plain_text"
                  },
                  "type": "default",
                  "value": pageKey
                },
                {
                  "tag": "button",
                  "text": {
                    "content": "🏠 Main Menu",
                    "tag": "plain_text"
                  },
                  "type": "default",
                  "value": "back_to_pages"
                },
                {
                  "tag": "button",
                  "text": {
                    "content": "💬 Ask Question",
                    "tag": "plain_text"
                  },
                  "type": "primary",
                  "value": "custom_question"
                }
              ]
            }
          ]
        };
        
        await sendInteractiveCard(chatId, followUpCard);
      }
    } else if (actionValue === 'back_to_pages') {
      await sendPageSelectionMessage(chatId);
    } else if (actionValue === 'custom_question') {
      await sendMessageToLark(chatId, "Please go ahead and ask me anything about PM-Next! I'm here to help. 🤖");
      userInteractionState.delete(chatId);
    }

  } catch (error) {
    console.error('❌ Card interaction error:', error);
    
    // Send error recovery message
    try {
      const chatId = event.context?.open_chat_id || event.open_chat_id;
      if (chatId) {
        userInteractionState.delete(chatId);
        await sendMessageToLark(chatId, 'Sorry, I encountered an issue. Please try again or send me a message! 🤖');
      }
    } catch (recoveryError) {
      console.error('❌ Recovery message failed:', recoveryError);
    }
  }
}

// Generate AI response with full logic
async function generateAIResponse(userMessage, chatId, senderId = null) {
  try {
    console.log('🤖 Starting AI response generation');
    
    // Check for greeting/restart patterns
    const greetingPatterns = [
      /^(hi|hello|hey|start|restart|help|menu)$/i,
      /^(what can you do|what do you do|help me)$/i
    ];
    
    if (greetingPatterns.some(pattern => pattern.test(userMessage.trim()))) {
      console.log('👋 Greeting detected, sending page selection');
      
      userInteractionState.delete(chatId);
      
      try {
        await sendPageSelectionMessage(chatId);
        return {
          response: null,
          responseType: 'interactive_card',
          interactiveCard: true
        };
      } catch (cardError) {
        console.error('❌ Card sending failed, using text fallback:', cardError);
        
        // Return text fallback instead of trying to send another message
        return `👋 Welcome to PM-Next Support Bot! 🤖

Please let me know which page you need help with:
📊 Dashboard - overview and analytics  
💼 Jobs - job posting and management
👥 Candidates - candidate profiles and management
🏢 Clients - client and company management
📅 Calendar - interview scheduling and calendar management
💰 Claims - billing and financial tracking

Or ask me anything about PM-Next directly!`;
      }
    }

    // Check if should escalate to ticket
    if (shouldEscalateToTicket([], userMessage)) {
      console.log('🎫 Escalating to ticket creation');
      const category = categorizeIssue(userMessage);
      return await startTicketCreation(chatId, userMessage, category, senderId);
    }

    // Check cache first
    const cachedResponse = getCachedResponse(userMessage);
    if (cachedResponse) {
      console.log('📋 Using cached response');
      return {
        response: cachedResponse,
        responseType: 'cached',
        cacheHit: true
      };
    }

    // Generate AI response
    const models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    const selectedModel = process.env.OPENAI_MODEL || models[0];
    
    const messages = [
      {
        role: 'system',
        content: `You are a helpful assistant for the PM-Next Recruitment Management System. 
        Your role is to help users navigate and understand how to use the application effectively.
        
        Use this knowledge base about PM-Next:
        ${PM_NEXT_KNOWLEDGE}
        
        Always be helpful, specific, and provide actionable steps when possible.`
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: messages,
      max_tokens: 800,
      temperature: 0.7,
      stream: false
    });

    const response = completion.choices[0].message.content;
    
    // Cache the response
    setCachedResponse(userMessage, response);
    
    return {
      response,
      responseType: 'ai_generated'
    };

  } catch (error) {
    console.error('❌ AI generation error:', error);
    
    if (error.message.includes('timeout')) {
      return 'I apologize for the delay. The system is taking longer than usual to respond. Please try asking your question again.';
    } else if (error.message.includes('rate limit')) {
      return 'I\'m currently experiencing high demand. Please wait a moment and try again.';
    } else {
      return 'I encountered a technical issue while processing your request. Please try rephrasing your question or contact our support team for immediate assistance.';
    }
  }
}

// Helper functions
function extractTextFromMessage(contentObj) {
  if (typeof contentObj === 'string') {
    return contentObj;
  }
  
  if (contentObj.text) {
    return contentObj.text;
  }
  
  if (Array.isArray(contentObj)) {
    return contentObj.map(item => item.text || '').join(' ');
  }
  
  return '';
}

function getCachedResponse(message) {
  const patterns = [
    /how.*add.*candidate/i,
    /how.*create.*job/i,
    /login.*problem/i
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(message)) {
      const cached = responseCache.get(pattern.toString());
      if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
        return cached.response;
      }
    }
  }
  return null;
}

function setCachedResponse(message, response) {
  const patterns = [
    /how.*add.*candidate/i,
    /how.*create.*job/i,
    /login.*problem/i
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(message)) {
      responseCache.set(pattern.toString(), {
        response,
        timestamp: Date.now()
      });
      break;
    }
  }
}

function shouldEscalateToTicket(context, userMessage) {
  const escalationTriggers = [
    /not working/i,
    /broken/i,
    /error/i,
    /bug/i,
    /issue/i,
    /problem/i,
    /help/i,
    /support/i,
    /urgent/i,
    /emergency/i
  ];
  
  return escalationTriggers.some(pattern => pattern.test(userMessage));
}

function categorizeIssue(message) {
  const categories = {
    'candidate': 'candidate_management',
    'job': 'job_management',
    'login': 'authentication',
    'upload': 'file_upload',
    'slow': 'system_performance'
  };
  
  for (const [keyword, category] of Object.entries(categories)) {
    if (message.toLowerCase().includes(keyword)) {
      return category;
    }
  }
  
  return 'general';
}

async function startTicketCreation(chatId, userMessage, category, senderId = null) {
  console.log('🎫 Starting ticket creation process');
  
  ticketCollectionState.set(chatId, {
    step: 'issue_description',
    category: category,
    originalMessage: userMessage,
    data: {},
    timestamp: Date.now()
  });
  
  return `I understand you're experiencing an issue. I'll help you create a support ticket to get personalized assistance.

**Please describe your issue in detail:**
• What were you trying to do?
• What exactly happened?
• Any error messages you saw?

This will help our support team assist you more effectively.`;
}

async function handleTicketCreationFlow(chatId, userMessage, ticketState, senderId = null) {
  // Simplified ticket creation flow
  ticketCollectionState.delete(chatId);
  
  const ticketData = {
    chat_id: chatId,
    issue_title: `Support Request - ${ticketState.category}`,
    issue_description: userMessage,
    issue_category: ticketState.category,
    user_id: senderId,
    status: 'open',
    priority: 'medium',
    created_at: new Date().toISOString()
  };
  
  try {
    const { data, error } = await supabase
      .from(SUPPORT_TICKETS_TABLE)
      .insert([ticketData])
      .select();
    
    if (error) throw error;
    
    const ticketNumber = data[0].id;
    
    return `✅ **Support Ticket Created Successfully!**

**Ticket #${ticketNumber}**
📋 **Issue**: ${ticketData.issue_title}
📝 **Description**: ${ticketData.issue_description}
🏷️ **Category**: ${ticketData.issue_category}
⏰ **Status**: Open

Our support team will review your ticket and respond soon. You can reference this ticket number (#${ticketNumber}) in future communications.

Is there anything else I can help you with in the meantime?`;
    
  } catch (error) {
    console.error('❌ Ticket creation failed:', error);
    
    return `❌ I encountered an error creating your support ticket. Please try again or contact our support team directly:

📧 Email: support@pm-next.com
💬 Direct Chat: Contact your system administrator

I apologize for the inconvenience.`;
  }
}

async function getFastFAQAnswer(pageKey, faqQuestion) {
  // Return comprehensive answers for specific FAQs
  const faqAnswers = {
    'dashboard': {
      'How do I view candidate statistics?': 'Navigate to your Dashboard and look for the "Candidate Analytics" widget. You can view total candidates, active applications, and conversion rates. Click on any statistic for detailed breakdowns.',
      'Where can I see recent activity?': 'The "Recent Activity" feed is located on the right side of your Dashboard. It shows the latest candidate applications, interview schedules, and status changes.',
      'How to customize my dashboard widgets?': 'Click the "Customize" button in the top-right corner of your Dashboard. You can drag and drop widgets, resize them, and add/remove components based on your preferences.',
      'Why are my numbers not updating?': 'Dashboard data refreshes every 15 minutes. Try refreshing your browser page. If data is still outdated, check your internet connection or contact support.'
    },
    'jobs': {
      'How do I create a new job posting?': `**Creating a New Job Posting:**

1. **Navigate:** Dashboard → Jobs → "Create New Job"
2. **Basic Information:**
   - Job Title
   - Client/Company
   - Location (Remote/Hybrid/Office)
   - Salary Range

3. **Job Details:**
   - Job Description
   - Required Skills
   - Experience Level
   - Education Requirements

4. **Commercial Details:**
   - Fee Percentage
   - Expected Start Date
   - Job Priority Level

5. **Save & Activate:**
   - Click "Save as Draft" for later editing
   - Click "Publish" to make active

✅ **Tip:** Use job templates for similar positions to save time!`,
      'How to edit an existing job?': 'Go to Jobs section, find your job, and click the job title to open the details page. Click "Edit" button to modify any fields, then save your changes.',
      'How do I add candidates to a job?': 'Open the job details page, go to the "Candidates" tab, and click "Add Candidate". You can search existing candidates or add new ones directly.',
      'How to set job as active or closed?': 'In the job details page, use the Status dropdown to change between Active, Closed, or On Hold. Active jobs appear in searches and accept applications.'
    },
    'candidates': {
      'How do I add a new candidate?': 'Go to Candidates → "Add New Candidate" → Fill in name, email, phone, and other details → Upload resume (optional) → Save. Make sure all required fields are completed.',
      'How to upload candidate resumes?': 'When adding/editing a candidate, look for the "Resume" section. Click "Upload File" and select a PDF, DOC, or DOCX file under 10MB. The system will automatically parse key information.',
      'How do I search for candidates?': 'Use the search bar in the Candidates section. You can search by name, email, skills, or job titles. Use filters for location, experience level, and availability status.',
      'How to move candidates between stages?': 'Open the candidate profile, find the "Pipeline Status" section, and select the new stage from the dropdown. You can also drag and drop candidates in the pipeline view.'
    },
    'clients': {
      'How do I add a new client?': 'Navigate to Clients → "Add New Client" → Enter company name, contact details, and address → Add contact persons → Save. You can link multiple contacts to one client.',
      'How to manage client contacts?': 'In the client profile, go to the "Contacts" tab. You can add, edit, or remove contact persons, set primary contacts, and manage their roles and departments.',
      'How do I update client information?': 'Find the client in your Clients list, click on the company name, then click "Edit" to modify company details, addresses, or contact information.',
      'How to link jobs to clients?': 'When creating a new job, select the client from the "Client/Company" dropdown. For existing jobs, edit the job and update the client field.'
    },
    'calendar': {
      'How do I schedule an interview?': 'Go to Calendar → "Schedule Interview" → Select candidate and job → Choose date/time → Add participants → Send invitations. The system will check availability automatically.',
      'How to sync with my calendar?': 'Go to Settings → Calendar Integration → Connect your Google Calendar, Outlook, or other supported calendar apps. This enables two-way synchronization.',
      'How do I reschedule appointments?': 'Find the appointment in Calendar view, click on it, then "Reschedule". Choose new date/time and the system will notify all participants automatically.',
      'How to set my availability?': 'Click on Settings → Availability → Set your working hours, time zones, and block out unavailable periods. This helps with automatic scheduling.'
    },
    'claims': {
      'How do I submit a claim?': 'Go to Claims → "Submit New Claim" → Select the placement/job → Enter claim amount and details → Attach supporting documents → Submit for approval.',
      'Where can I track payment status?': 'In the Claims section, you can see all your submissions with status indicators: Pending, Approved, Paid, or Rejected. Click any claim for detailed information.',
      'How to generate invoices?': 'For approved claims, click "Generate Invoice" in the claim details. You can customize invoice templates in Settings → Invoice Templates.',
      'How do I view my commission?': 'Check the Claims Dashboard for commission summaries, or go to Reports → Commission Report for detailed breakdowns by period, client, or job type.'
    }
  };

  return faqAnswers[pageKey]?.[faqQuestion] || 
         `I can help with ${faqQuestion}. Please provide more specific details about what you're trying to do, and I'll give you step-by-step guidance.`;
}

// Send message to Lark using SDK with timeout protection
async function sendMessageToLark(chatId, message) {
  console.log('🚀 sendMessageToLark called with:', { chatId, messageLength: message?.length });
  
  let retries = 3;
  
  while (retries > 0) {
    try {
      console.log(`🔄 Attempt ${4 - retries}/3 to send message`);
      
      // Ensure we have a valid client
      if (!larkClient) {
        console.error('❌ Lark client not initialized');
        throw new Error('Lark client not initialized');
      }
      console.log('✅ Lark client is available');

      const messageData = {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: message }),
        uuid: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      
      console.log('🔍 Sending message with data:', {
        receive_id: messageData.receive_id,
        msg_type: messageData.msg_type,
        content: messageData.content,
        uuid: messageData.uuid
      });

      console.log('📤 Calling larkClient.im.message.create (direct call)...');
      
      // Direct SDK call without timeout racing (like the working debug endpoint)
      const result = await larkClient.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: messageData
      });
      
      console.log('📬 SDK call completed');
      
      console.log('📬 Received response from Lark SDK');
      console.log('🔍 Full Lark SDK response:', JSON.stringify(result, null, 2));

      if (result.code === 0) {
        console.log('✅ Message sent successfully via Lark SDK');
        return result;
      } else {
        console.error('❌ Lark SDK returned error code:', result.code);
        console.error('❌ Lark SDK error message:', result.msg);
        console.error('❌ Lark SDK error data:', result.data);
        
        // Provide specific error solutions
        if (result.code === 230002) {
          console.error('🔧 SOLUTION: Bot not in chat. Add bot to the chat/conversation first.');
        } else if (result.code === 99991663) {
          console.error('🔧 SOLUTION: Invalid chat_id. Check if chat exists and bot has access.');
        } else if (result.code === 99991661) {
          console.error('🔧 SOLUTION: Invalid app credentials. Check LARK_APP_ID and LARK_APP_SECRET.');
        }
        
        throw new Error(`Lark SDK error: ${result.code} - ${result.msg}`);
      }

    } catch (error) {
      retries--;
      console.error(`❌ Send message error (${retries} retries left):`, {
        message: error.message,
        name: error.name,
        isTimeout: error.message.includes('timeout'),
        stack: error.stack?.split('\n').slice(0, 3),
        chatId: chatId
      });
      
      if (retries === 0) {
        console.error('❌ All message retries failed, giving up');
        throw error;
      }
      
      console.log(`⏳ Waiting before retry ${4 - retries}...`);
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
    }
  }
}

// Send interactive card
async function sendInteractiveCard(chatId, cardContent) {
  let retries = 3;
  
  while (retries > 0) {
    try {
      // Ensure we have a valid client
      if (!larkClient) {
        throw new Error('Lark client not initialized');
      }

      console.log('🎯 Sending interactive card to:', chatId);
      console.log('🔍 Card content preview:', JSON.stringify(cardContent).substring(0, 200) + '...');

      const cardData = {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(cardContent),
        uuid: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      console.log('🔍 Full request data:', {
        params: { receive_id_type: 'chat_id' },
        data: {
          ...cardData,
          content: cardData.content.substring(0, 100) + '...' // Truncate for logging
        }
      });

      const result = await larkClient.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: cardData
      });

      console.log('🔍 Card API response:', { code: result.code, msg: result.msg });

      if (result.code === 0) {
        console.log('✅ Interactive card sent successfully');
        return result;
      } else {
        throw new Error(`Lark card error: ${result.code} - ${result.msg}`);
      }
    } catch (error) {
      retries--;
      console.error(`❌ Card sending error (${retries} retries left):`, {
        message: error.message,
        stack: error.stack?.split('\n')[0],
        chatId: chatId
      });
      
      if (retries === 0) {
        console.error('❌ All card retries failed, giving up');
        throw error;
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
    }
  }
}

// Send page selection message
async function sendPageSelectionMessage(chatId) {
  try {
    // Complete card with all pages
    const pageSelectionCard = {
      "elements": [
        {
          "tag": "div",
          "text": {
            "content": "🤖 Welcome to PM-Next Support Bot",
            "tag": "plain_text"
          }
        },
        {
          "tag": "div",
          "text": {
            "content": "Please select the page you need help with:",
            "tag": "plain_text"
          }
        },
        {
          "tag": "action",
          "actions": [
            {
              "tag": "button",
              "text": {
                "content": "📊 Dashboard",
                "tag": "plain_text"
              },
              "type": "default",
              "value": "dashboard"
            },
            {
              "tag": "button",
              "text": {
                "content": "💼 Jobs",
                "tag": "plain_text"
              },
              "type": "default", 
              "value": "jobs"
            },
            {
              "tag": "button",
              "text": {
                "content": "👥 Candidates",
                "tag": "plain_text"
              },
              "type": "default",
              "value": "candidates"
            }
          ]
        },
        {
          "tag": "action",
          "actions": [
            {
              "tag": "button",
              "text": {
                "content": "🏢 Clients",
                "tag": "plain_text"
              },
              "type": "default",
              "value": "clients"
            },
            {
              "tag": "button",
              "text": {
                "content": "📅 Calendar",
                "tag": "plain_text"
              },
              "type": "default",
              "value": "calendar"
            },
            {
              "tag": "button",
              "text": {
                "content": "💰 Claims",
                "tag": "plain_text"
              },
              "type": "default",
              "value": "claims"
            }
          ]
        }
      ]
    };

    console.log('🔍 Sending complete page selection card...');
    await sendInteractiveCard(chatId, pageSelectionCard);
    
    userInteractionState.set(chatId, {
      step: 'awaiting_page_selection',
      selectedPage: null,
      awaiting: true,
      timestamp: Date.now()
    });
    
  } catch (cardError) {
    console.error('❌ Card sending failed, sending text fallback:', cardError);
    
    // Send a text message as fallback
    const fallbackMessage = `👋 Welcome to PM-Next Support Bot! 🤖

Please let me know which page you need help with:
📊 Dashboard - overview and analytics  
💼 Jobs - job posting and management
👥 Candidates - candidate profiles and management
🏢 Clients - client and company management
📅 Calendar - interview scheduling and calendar management
💰 Claims - billing and financial tracking

Or ask me anything about PM-Next directly!`;

    await sendMessageToLark(chatId, fallbackMessage);
  }
}

// Send FAQ options for selected page
async function sendPageFAQs(chatId, pageKey) {
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
      ...page.faqs.map((faq, index) => ({
        "tag": "action",
        "actions": [{
          "tag": "button",
          "text": {
            "content": faq,
            "tag": "plain_text"
          },
          "type": "default",
          "value": `faq_${pageKey}_${index}`
        }]
      })),
      {
        "tag": "hr"
      },
      {
        "tag": "action",
        "actions": [
          {
            "tag": "button",
            "text": {
              "content": "🔙 Back to Page Selection",
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
    awaiting: true,
    timestamp: Date.now()
  });
}

// Disable body parsing for larger payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}; 